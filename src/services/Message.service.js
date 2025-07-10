// FILE: src/services/Message.service.js

import { GoogleGenAI } from "@google/genai"
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";
import { db } from "./Db.service.js"; // NEW: Ensure db is imported for direct use with new tables
import { assetManagerService } from "./AssetManager.service.js"; // Ensure assetManagerService is imported directly

// Global Map to store executed commands per message element for idempotency
const executedCommandsMap = new Map(); // Map<messageElement, Set<fullTagString>>

// --- Track currently active character and state IDs for the *active chat* ---
// These will be updated by the AI's [char:...] and [state:...] commands.
let currentActivePersonalityId = null; // Stored here for access within the module
let currentActiveCharacterId = null;
let currentActiveStateId = null;

// Function to set the currently active personality, character, and state for the session
// This will be called when a chat loads or when [char:]/[state:] commands are processed.
export function setActiveSceneContext(personalityId, characterId = null, stateId = null) {
    currentActivePersonalityId = personalityId;
    currentActiveCharacterId = characterId;
    currentActiveStateId = stateId;
    // console.log(`Active Scene Context Set: P:${personalityId}, C:${characterId}, S:${stateId}`); // For debugging
}

export async function send(msg, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality) return;
    if (settings.apiKey === "") return alert("Please enter an API key");
    if (!msg) return;

    // --- AI GENERATION & CHAT TITLE LOGIC (UNCHANGED) ---
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const config = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: settings.temperature / 100,
        systemPrompt: settingsService.getSystemPrompt(), 
        safetySettings: settings.safetySettings,
        responseMimeType: "text/plain"
    };
    
    if (!await chatsService.getCurrentChat(db)) { 
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: "You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user's message is: " + msg,
        });
        const title = response.text;
        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click();
    }

    // --- Pass personalityId and a null for characterId/stateId initially for user message ---
    // User messages don't have associated characters/states.
    await insertMessage("user", msg, null, null, db, null, 0, selectedPersonality.id, null, null);

    const currentChat = await chatsService.getCurrentChat(db);
    currentChat.content.push({ role: "user", parts: [{ text: msg }] });
    await db.chats.put(currentChat);

    helpers.messageContainerScrollToBottom();
    
    const masterInstruction = `
        ${settingsService.getSystemPrompt()}

        ---
        YOUR CHARACTER INSTRUCTIONS ARE BELOW
        ---

        CHARACTER PROMPT (Your personality):
        ${selectedPersonality.prompt}

        ---

        TAG PROMPT (Your technical command reference):
        ${selectedPersonality.tagPrompt || 'No specific command tags have been provided for this character.'}
    `.trim();

    const history = [
        { role: "user", parts: [{ text: masterInstruction }] },
        { role: "model", parts: [{ text: "Understood. I will now act as the specified character and use my command tags as instructed." }] }
    ];
    
    if (selectedPersonality.toneExamples && selectedPersonality.toneExamples.length > 0 && selectedPersonality.toneExamples[0]) {
        history.push(...selectedPersonality.toneExamples.map(tone => ({ role: "model", parts: [{ text: tone }] })));
    }
    
    history.push(...currentChat.content.slice(0, -1).map(msg => ({ role: msg.role, parts: msg.parts })));
    
    const chat = ai.chats.create({ model: settings.model, history, config });

    let messageToSendToAI = msg;
    if (selectedPersonality.reminder) {
        messageToSendToAI += `\n\nSYSTEM REMINDER: ${selectedPersonality.reminder}`;
    }
    
    const stream = await chat.sendMessageStream({ message: messageToSendToAI });
    
    // --- Get default character and state for the selected personality for initial AI response ---
    let defaultCharacter = null;
    let defaultState = null;
    try {
        defaultCharacter = await db.characters.where('personalityId').equals(selectedPersonality.id).first();
        if (defaultCharacter && defaultCharacter.defaultStateId) {
            defaultState = await db.states.get(defaultCharacter.defaultStateId);
        }
    } catch (error) {
        console.error("Error getting default character/state for AI response:", error);
    }

    // --- Pass personalityId, defaultCharacterId, and defaultStateId to insertMessage ---
    const reply = await insertMessage(
        "model", 
        "", 
        selectedPersonality.name, 
        stream, 
        db, 
        selectedPersonality.image, 
        settings.typingSpeed, 
        selectedPersonality.id, // This is personalityId now
        defaultCharacter ? defaultCharacter.id : null, 
        defaultState ? defaultState.id : null
    );

    currentChat.content.push({ 
        role: "model", 
        personality: selectedPersonality.name, 
        personalityid: selectedPersonality.id, // Keep this as personalityid
        characterid: defaultCharacter ? defaultCharacter.id : null, // NEW: Store initial characterid
        stateid: defaultState ? defaultState.id : null,             // NEW: Store initial stateid
        parts: [{ text: reply.md }] 
    });
    await db.chats.put(currentChat);
    settingsService.saveSettings();

    // Set the active scene context for the current chat session
    setActiveSceneContext(
        selectedPersonality.id, 
        defaultCharacter ? defaultCharacter.id : null, 
        defaultState ? defaultState.id : null
    );
}

async function regenerate(responseElement, db) {
    const messageElementIndex = [...responseElement.parentElement.children].indexOf(responseElement);
    const chat = await chatsService.getCurrentChat(db);

    // Get the user message that this AI response was a reply to
    // Assuming user message is directly before the model's message.
    const userMessageContent = chat.content[messageElementIndex - 1]?.parts[0]?.text;

    if (!userMessageContent) {
        console.error("Could not find user message to regenerate from.");
        alert("Could not find previous user message to regenerate from. Please start a new chat.");
        return;
    }

    // Truncate chat history up to the point before the user's message
    chat.content = chat.content.slice(0, messageElementIndex - 1);
    await db.chats.put(chat);
    
    // Reload chat to clear UI (optional, send will re-render anyway)
    await chatsService.loadChat(chat.id, db); 

    // Then re-send the user message
    await send(userMessageContent, db);
}

// --- THE "VISIBLE GUTS" EDITING LOGIC ---
function setupMessageEditing(messageElement, db) {
    const editButton = messageElement.querySelector('.btn-edit');
    const saveButton = messageElement.querySelector('.btn-save');
    const messageTextDiv = messageElement.querySelector('.message-text');
    const regenButton = messageElement.querySelector('.btn-refresh'); // For model messages

    if (!messageTextDiv) return; // Basic check

    // Add dataset index if not present (important for tracking)
    if (!messageElement.dataset.messageIndex) {
        messageElement.dataset.messageIndex = Array.from(messageElement.parentElement.children).indexOf(messageElement);
    }
    const messageIndex = parseInt(messageElement.dataset.messageIndex, 10);

    // If it's a model message, handle the refresh button
    if (messageElement.classList.contains('message-model') && regenButton) {
        regenButton.addEventListener("click", async () => {
            try { 
                executedCommandsMap.delete(messageElement);
                await regenerate(messageElement, db);
            } catch (error) { console.error(error); alert("Error during regeneration."); }
        });
    }

    // Set up edit/save buttons for both user and model messages
    if (editButton) {
        editButton.addEventListener('click', async () => { 
            messageTextDiv.setAttribute("contenteditable", "true");
            messageTextDiv.focus();
            editButton.style.display = 'none';
            if (saveButton) saveButton.style.display = 'inline-block';
            if (regenButton) regenButton.style.display = 'none'; // Hide refresh during edit

            const currentChat = await chatsService.getCurrentChat(db);
            if (currentChat && currentChat.content[messageIndex]) {
                // Display the raw, encoded text for editing
                messageTextDiv.innerText = helpers.getDecoded(currentChat.content[messageIndex].parts[0].text); 
            }
        });
    }

    if (saveButton) {
        saveButton.addEventListener('click', async () => {
            messageTextDiv.removeAttribute("contenteditable");
            const newRawText = messageTextDiv.innerText; // Get raw text from editable div
            
            await updateMessageInDatabase(messageIndex, newRawText, db);

            // Re-render and re-process commands after saving
            messageTextDiv.innerHTML = marked.parse(newRawText, { breaks: true });
            
            // Get the personality/character/state IDs from the saved message data
            const currentChat = await chatsService.getCurrentChat(db);
            const msgData = currentChat.content[messageIndex];
            const pId = msgData?.personalityid;
            const cId = msgData?.characterid; // NEW
            const sId = msgData?.stateid;     // NEW

            // Clear previous executed commands for idempotency on re-processing
            executedCommandsMap.delete(messageElement);
            
            if (pId !== undefined) { // Check for personality ID
                await processCommandBlock(newRawText, messageElement, pId, cId, sId, executedCommandsMap.get(messageElement) || new Set()); // Pass all IDs
            }

            editButton.style.display = 'inline-block';
            if (saveButton) saveButton.style.display = 'none';
            if (regenButton) regenButton.style.display = 'inline-block'; // Show refresh again
            
            // Re-highlight code blocks
            hljs.highlightAll(); 
            helpers.messageContainerScrollToBottom(); // Ensure scroll to bottom after save/render
        });
    }
}

async function updateMessageInDatabase(messageIndex, newRawText, db) {
    if (!db) return;
    try {
        const currentChat = await chatsService.getCurrentChat(db);
        if (!currentChat || !currentChat.content[messageIndex]) return;
        currentChat.content[messageIndex].parts[0].text = helpers.getEncoded(newRawText);
        await db.chats.put(currentChat);
    } catch (error) { console.error("Error updating message in database:", error); }
}

// MODIFIED: insertMessage now accepts personalityId, characterId, and stateId
export async function insertMessage(sender, msg, selectedPersonalityTitle = null, netStream = null, db = null, pfpSrc = null, typingSpeed = 0, personalityId = null, characterId = null, stateId = null) { // <-- MODIFIED PARAMS
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);

    const executedCommandsSet = new Set();
    executedCommandsMap.set(newMessage, executedCommandsSet);

    // Set personality, character, and state IDs as data attributes on the message element
    newMessage.dataset.personalityId = personalityId;
    newMessage.dataset.characterId = characterId;
    newMessage.dataset.stateId = stateId;

    if (sender != "user") {
        newMessage.classList.add("message-model");
        newMessage.innerHTML = `
            <div class="message-header">
                <img class="pfp" src="${pfpSrc}" loading="lazy"></img>
                <h3 class="message-role">${selectedPersonalityTitle}</h3>
                <div class="message-actions">
                    <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                    <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    <button class="btn-refresh btn-textual material-symbols-outlined">refresh</button>
                </div>
            </div>
            <div class="message-role-api" style="display: none;">${sender}</div>
            <div class="message-text"></div>`;
        
        // Refresh button logic moved inside setupMessageEditing for cleaner separation
        
        const messageContent = newMessage.querySelector(".message-text");

        if (!netStream) {
            messageContent.innerHTML = marked.parse(msg, { breaks: true });
            // For non-streamed messages (e.g., from history load), process commands
            // Pass all IDs: personalityId, characterId, stateId
            await processCommandBlock(msg, newMessage, personalityId, characterId, stateId, executedCommandsSet); 
        } else {
            let fullRawText = "";
            try {
                for await (const chunk of netStream) {
                    if (chunk && chunk.text) { fullRawText += chunk.text; }
                    // Update and render the message text *during* streaming
                    if (typingSpeed > 0) {
                        messageContent.innerHTML = marked.parse(fullRawText, { breaks: true });
                        // Process commands in chunks (this can be complex for partial tags,
                        // but the current regex approach is fine for full tags)
                        await processCommandBlock(fullRawText, newMessage, personalityId, characterId, stateId, executedCommandsSet); 
                        helpers.messageContainerScrollToBottom();
                        await new Promise(resolve => setTimeout(resolve, typingSpeed));
                    }
                }
                
                // Final render after stream completion if typing speed was 0 or for full processing
                if (typingSpeed === 0) {
                    messageContent.innerHTML = marked.parse(fullRawText, { breaks: true });
                }
                
                // Final command processing after the stream is complete
                await processCommandBlock(fullRawText, newMessage, personalityId, characterId, stateId, executedCommandsSet); 
                
                hljs.highlightAll();
                helpers.messageContainerScrollToBottom();
                setupMessageEditing(newMessage, db); // Setup editing AFTER stream complete
                // IMPORTANT: Don't delete executedCommandsMap here, it's needed by processCommandBlock's idempotency
                return { HTML: messageContent.innerHTML, md: fullRawText };
            } catch (error) {
                console.error("Stream error:", error);
                messageContent.innerHTML = marked.parse(fullRawText, { breaks: true });
                // If stream errors, still try to process what we have and setup editing
                await processCommandBlock(fullRawText, newMessage, personalityId, characterId, stateId, executedCommandsSet);
                setupMessageEditing(newMessage, db);
                return { HTML: messageContent.innerHTML, md: fullRawText };
            }
        }
    } else { // User message
        newMessage.innerHTML = `
                <div class="message-header">
                    <h3 class="message-role">You:</h3>
                    <div class="message-actions">
                        <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                        <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    </div>
                </div>
                <div class="message-role-api" style="display: none;">${sender}</div>
                <div class="message-text">${helpers.getDecoded(msg)}</div>`;
    }
    hljs.highlightAll();
    setupMessageEditing(newMessage, db); // Setup editing for user messages as well
}

// MODIFIED: processCommandBlock now takes personalityId, characterId, and stateId
async function processCommandBlock(commandBlock, messageElement, personalityId, characterId, stateId, executedCommandsSet = new Set()) { // <-- MODIFIED PARAMS
    if (!personalityId || !characterId || !stateId) { 
        // We now require all three IDs for asset lookup.
        // If not present, this message won't trigger asset changes, which is okay.
        return;
    }

    const settings = settingsService.getSettings();
    const commandRegex = new RegExp(`\\${settings.triggers.symbolStart}(.*?):(.*?)\\${settings.triggers.symbolEnd}`, 'g');
    
    const messageContent = messageElement.querySelector('.message-text');
    if (!messageContent) return;

    // Use a temporary regex with a local scope to avoid interfering with global regex state
    const localCommandRegex = new RegExp(`\\${settings.triggers.symbolStart}(.*?):(.*?)\\${settings.triggers.symbolEnd}`, 'g');
    
    let match;
    while ((match = localCommandRegex.exec(commandBlock)) !== null) {
        const fullTagString = match[0];
        const command = match[1].trim().toLowerCase();
        const value = match[2].trim();

        // Check if this specific tag has been executed for this message
        if (executedCommandsSet.has(fullTagString)) {
            // Remove the tag from the displayed text if it's still present
            messageContent.innerText = messageContent.innerText.replace(fullTagString, '').trim();
            continue; 
        }

        // Mark the tag as executed for this message
        executedCommandsSet.add(fullTagString);

        switch (command) {
            case 'char': // NEW COMMAND: Sets the active character for subsequent asset lookups
                console.log(`[char:${value}] command received. Setting active character to: ${value}`);
                try {
                    const foundCharacter = await db.characters.where('personalityId').equals(personalityId).and(char => char.name.toLowerCase() === value.toLowerCase()).first();
                    if (foundCharacter) {
                        currentActiveCharacterId = foundCharacter.id; // Update module-level active character
                        // Also update the message element's data attribute
                        messageElement.dataset.characterId = foundCharacter.id;

                        // If the new character has a default state, switch to that as well
                        if (foundCharacter.defaultStateId) {
                            const defaultState = await db.states.get(foundCharacter.defaultStateId);
                            if (defaultState) {
                                currentActiveStateId = defaultState.id; // Update module-level active state
                                messageElement.dataset.stateId = defaultState.id;
                                console.log(`  Auto-switched to default state: ${defaultState.name} (ID: ${defaultState.id})`);
                            }
                        } else {
                            currentActiveStateId = null; // No default state, clear active state
                            messageElement.dataset.stateId = null;
                        }
                        // Update the active scene context (for potential future commands)
                        setActiveSceneContext(personalityId, currentActiveCharacterId, currentActiveStateId);

                    } else {
                        console.warn(`[char:${value}] Character not found for personality ID ${personalityId}.`);
                    }
                } catch (e) { console.error(`Error processing [char] command:`, e); }
                break;

            case 'state': // NEW COMMAND: Sets the active state for subsequent asset lookups
                console.log(`[state:${value}] command received. Setting active state to: ${value}`);
                // Requires an active character to set a state for
                if (!currentActiveCharacterId) {
                    console.warn(`Cannot set [state:${value}]: No active character defined.`);
                    break;
                }
                try {
                    const foundState = await db.states.where('characterId').equals(currentActiveCharacterId).and(state => state.name.toLowerCase() === value.toLowerCase()).first();
                    if (foundState) {
                        currentActiveStateId = foundState.id; // Update module-level active state
                        messageElement.dataset.stateId = foundState.id;
                        // Update the active scene context (for potential future commands)
                        setActiveSceneContext(personalityId, currentActiveCharacterId, currentActiveStateId);
                    } else {
                        console.warn(`[state:${value}] State not found for character ID ${currentActiveCharacterId}.`);
                    }
                } catch (e) { console.error(`Error processing [state] command:`, e); }
                break;

            case 'avatar':
                try {
                    // Use the newly defined getAssetUrlByTypeAndValue
                    const objectURL = await assetManagerService.getAssetUrlByTypeAndValue(
                        personalityId, 
                        currentActiveCharacterId, // Use the currently active character ID
                        currentActiveStateId,     // Use the currently active state ID
                        'avatar', 
                        value
                    );
                    
                    if (objectURL) {
                        // --- Update Message PFP with Full, Correct Logic ---
                        const pfpElement = messageElement.querySelector('.pfp');
                        if (pfpElement) {
                            const tempImage = new Image();
                            tempImage.src = objectURL;
                            
                            tempImage.onload = () => {
                                pfpElement.classList.add('hide-for-swap');
                                requestAnimationFrame(() => {
                                    pfpElement.src = objectURL;
                                    pfpElement.classList.remove('hide-for-swap');
                                });
                                // Revoke the object URL after a short delay (e.g., after CSS transition)
                                setTimeout(() => { URL.revokeObjectURL(objectURL); }, 750);
                            };
                            tempImage.onerror = () => {
                                console.error("Failed to load new avatar image for message:", objectURL);
                                URL.revokeObjectURL(objectURL);
                            };
                        }

                        // --- Update Sidebar Personality Card (only if the active personality matches) ---
                        // This assumes the sidebar card's image for the *selected personality* (not character)
                        // might show the *currently active character's avatar*.
                        const selectedPersonalityElement = await personalityService.get(personalityId);
                        if (selectedPersonalityElement && selectedPersonalityElement.id == settingsService.getSettings().lastActive.personalityId) {
                            const personalityCard = document.querySelector(`#personality-${personalityId}`);
                            if (personalityCard) {
                                const cardImg = personalityCard.querySelector('.background-img');
                                if (cardImg) {
                                    const tempCardImage = new Image();
                                    tempCardImage.src = objectURL;
                                    
                                    tempCardImage.onload = () => {
                                        cardImg.classList.add('hide-for-swap');
                                        requestAnimationFrame(() => {
                                            cardImg.src = objectURL;
                                            cardImg.classList.remove('hide-for-swap');
                                        });
                                        // No need to revoke this URL immediately, as it might be continuously displayed.
                                        // It will be handled on personality change or full clear.
                                    };
                                    tempCardImage.onerror = () => {
                                        console.error("Failed to load personality card image:", objectURL);
                                    };
                                }
                            }
                        }
                    } else {
                        console.warn(`[avatar:${value}] No matching asset found for P:${personalityId}, C:${currentActiveCharacterId}, S:${currentActiveStateId}.`);
                    }
                } catch (e) { console.error(`Error processing [avatar] command:`, e); }
                break;

            case 'sfx':
            case 'audio':
                if (settings.audio.enabled) {
                    try {
                        const objectURL = await assetManagerService.getAssetUrlByTypeAndValue(
                            personalityId, 
                            currentActiveCharacterId, // Use the currently active character ID
                            currentActiveStateId,     // Use the currently active state ID
                            'sfx', // type is 'sfx' for both 'sfx' and 'audio' commands
                            value
                        );

                        if (objectURL) {
                            const audio = new Audio(objectURL);
                            audio.volume = settings.audio.volume;
                            audio.play().catch(e => console.error("Audio playback failed:", e));
                            audio.onended = () => URL.revokeObjectURL(objectURL); // Revoke URL after playback
                        } else {
                             console.warn(`[sfx/audio:${value}] No matching asset found for P:${personalityId}, C:${currentActiveCharacterId}, S:${currentActiveStateId}.`);
                        }
                    } catch (e) { console.error(`Error processing [audio/sfx] command:`, e); }
                }
                break;
        }

        // Remove the processed tag from the displayed message after execution
        messageContent.innerText = messageContent.innerText.replace(fullTagString, '').trim();
    }
}