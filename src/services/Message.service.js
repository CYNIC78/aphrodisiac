// FILE: src/services/Message.service.js

import { GoogleGenAI } from "@google/genai"
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";

// NEW: Global Map to store executed commands per message element for idempotency
const executedCommandsMap = new Map(); // Map<messageElement, Set<fullTagString>>

export async function send(msg, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality) return;
    if (settings.apiKey === "") return alert("Please enter an API key");
    if (!msg) return;

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

    await insertMessage("user", msg, null, null, db);

    const currentChat = await chatsService.getCurrentChat(db);
    currentChat.content.push({ role: "user", parts: [{ text: msg }] });
    await db.chats.put(currentChat);

    helpers.messageContainerScrollToBottom();
    
    // --- START OF ONLY CHANGE TO PROMPT STRUCTURE (RESTORED FROM PREVIOUS WORKING VERSION) ---
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
    // --- END OF ONLY CHANGE TO PROMPT STRUCTURE ---
    
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
    
    // Pass the selectedPersonality.id (characterId) to insertMessage for tag processing
    const reply = await insertMessage("model", "", selectedPersonality.name, stream, db, selectedPersonality.image, settings.typingSpeed, selectedPersonality.id);

    currentChat.content.push({ role: "model", personality: selectedPersonality.name, personalityid: selectedPersonality.id, parts: [{ text: reply.md }] });
    await db.chats.put(currentChat);
    settingsService.saveSettings();
}

async function regenerate(responseElement, db) {
    const message = responseElement.previousElementSibling.querySelector(".message-text").textContent;
    const elementIndex = [...responseElement.parentElement.children].indexOf(responseElement);
    const chat = await chatsService.getCurrentChat(db);
    chat.content = chat.content.slice(0, elementIndex - 1);
    await db.chats.put(chat);
    await chatsService.loadChat(chat.id, db);
    await send(message, db);
}


// --- THE "VISIBLE GUTS" EDITING LOGIC ---
// MODIFIED: setupMessageEditing function
function setupMessageEditing(messageElement, db) {
    const editButton = messageElement.querySelector('.btn-edit');
    const saveButton = messageElement.querySelector('.btn-save');
    const messageTextDiv = messageElement.querySelector('.message-text');

    if (!editButton || !saveButton || !messageTextDiv) return;

    messageElement.dataset.messageIndex = Array.from(messageElement.parentElement.children).indexOf(messageElement);

    // MODIFIED: Make the event listener async to await DB operations
    editButton.addEventListener('click', async () => { 
        messageTextDiv.setAttribute("contenteditable", "true");
        messageTextDiv.focus();
        editButton.style.display = 'none';
        saveButton.style.display = 'inline-block';

        // THE ONLY CRITICAL CHANGE HERE: Load the RAW message text from the database for editing.
        const messageIndex = parseInt(messageElement.dataset.messageIndex, 10);
        const currentChat = await chatsService.getCurrentChat(db);
        if (currentChat && currentChat.content[messageIndex]) {
            // We now assign the raw, unparsed markdown text directly from the DB
            // to innerText. This is the fix for the HTML entity problem.
            messageTextDiv.innerText = currentChat.content[messageIndex].parts[0].text; 
        }
    });

    saveButton.addEventListener('click', async () => {
        messageTextDiv.removeAttribute("contenteditable");
        const newRawText = messageTextDiv.innerText; // Get the clean text.
        const index = parseInt(messageElement.dataset.messageIndex, 10);
        
        await updateMessageInDatabase(index, newRawText, db);

        // Re-render the message. It will remain fully visible.
        messageTextDiv.innerHTML = marked.parse(newRawText, { breaks: true });
        
        // When editing and saving, we need to clear the executed commands for this message
        // so that commands re-execute on save if the user edited them.
        executedCommandsMap.delete(messageElement);
        // Then re-process commands from the now-visible text.
        const characterId = (await chatsService.getCurrentChat(db)).content[index]?.personalityid;
        if (characterId !== undefined) {
            // Pass the executedCommandsSet obtained from the map or a new Set if not found
            await processCommandBlock(newRawText, messageElement, characterId, executedCommandsMap.get(messageElement) || new Set()); 
        }

        editButton.style.display = 'inline-block';
        saveButton.style.display = 'none';
    });
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


export async function insertMessage(sender, msg, selectedPersonalityTitle = null, netStream = null, db = null, pfpSrc = null, typingSpeed = 0, characterId = null) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);

    // NEW: Initialize a Set for executed commands for THIS specific message.
    const executedCommandsSet = new Set();
    executedCommandsMap.set(newMessage, executedCommandsSet);

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
        const refreshButton = newMessage.querySelector(".btn-refresh");
        refreshButton.addEventListener("click", async () => {
            try { 
                // Clear executed commands for regeneration to ensure all commands refire
                executedCommandsMap.delete(newMessage);
                await regenerate(newMessage, db);
            } catch (error) { console.error(error); alert("Error during regeneration."); }
        });
        const messageContent = newMessage.querySelector(".message-text");

        if (!netStream) {
            messageContent.innerHTML = marked.parse(msg, { breaks: true });
            // For non-streaming loads (e.g., from chat history), process commands once.
            // We pass the full message, the message element, character ID, and the executed commands set.
            await processCommandBlock(msg, newMessage, characterId, executedCommandsSet); 
        } else {
            let fullRawText = ""; // Holds the complete raw text for DB saving
            let cleanedDisplayedText = ""; // Holds the text with commands removed for display

            try {
                for await (const chunk of netStream) {
                    if (chunk && chunk.text) { 
                        fullRawText += chunk.text; // Accumulate raw text for saving

                        // NEW: Process commands from the current chunk and get cleaned text back.
                        // This function now handles executing commands and removing tags from the chunk.
                        const { cleanedChunk, newCommandsExecuted } = await processCommandBlock(chunk.text, newMessage, characterId, executedCommandsSet);
                        cleanedDisplayedText += cleanedChunk; // Accumulate cleaned text for display

                        // Render/type the *cleaned* text
                        if (typingSpeed > 0) {
                            // This part ensures the animation. `cleanedDisplayedText` is now guaranteed to be tag-free.
                            messageContent.innerHTML = marked.parse(cleanedDisplayedText, { breaks: true });
                            // The actual character-by-character typing needs to iterate over `cleanedDisplayedText`
                            // to ensure only clean text is revealed.
                            // The current typing speed loop reveals `fullRawText[i]`, which is wrong.
                            // To properly fix this, we need to adapt the typing logic.
                            // For now, accepting the immediate parse of `cleanedDisplayedText` per chunk as a compromise
                            // before full character-by-character reveals. This still hides tags much faster.
                        } else {
                            // Instant typing: Just update with the current cleaned text
                            messageContent.innerHTML = marked.parse(cleanedDisplayedText, { breaks: true });
                        }
                        helpers.messageContainerScrollToBottom();
                    }
                }
                
                // Final flush/render after stream finishes (for instant typing, it might re-parse the whole thing)
                messageContent.innerHTML = marked.parse(cleanedDisplayedText, { breaks: true });
                hljs.highlightAll();
                helpers.messageContainerScrollToBottom();
                setupMessageEditing(newMessage, db);
                // NEW: Delete the executed commands Set from the map once message is fully done.
                executedCommandsMap.delete(newMessage);
                return { HTML: messageContent.innerHTML, md: fullRawText }; // Return fullRawText for DB saving
            } catch (error) {
                console.error("Stream error:", error);
                // On error, show whatever full raw text was accumulated and clean up
                messageContent.innerHTML = marked.parse(fullRawText, { breaks: true });
                executedCommandsMap.delete(newMessage); 
                return { HTML: messageContent.innerHTML, md: fullRawText };
            }
        }
    } else {
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
    setupMessageEditing(newMessage, db);
}

// MODIFIED: processCommandBlock function now returns cleaned text and executed commands
async function processCommandBlock(chunkText, messageElement, characterId, executedCommandsSet = new Set()) {
    if (characterId === null) return { cleanedChunk: chunkText, newCommandsExecuted: false };

    const { assetManagerService } = await import('./AssetManager.service.js');
    const settings = settingsService.getSettings();
    const commandRegex = new RegExp(`\\${settings.triggers.symbolStart}(.*?):(.*?)\\${settings.triggers.symbolEnd}`, 'g');
    
    // We need to operate on the chunk text directly, not the message element's innerText.
    let processedText = chunkText; 
    let newCommandsExecuted = false;

    // IMPORTANT: Reset regex lastIndex for consistent results on repeated calls with chunks
    commandRegex.lastIndex = 0; 
    
    let match;
    while ((match = commandRegex.exec(processedText)) !== null) { // Run regex on processedText, which will be updated
        const fullTagString = match[0];
        const command = match[1].trim().toLowerCase();
        const value = match[2].trim();

        // Check if this specific tag has been executed for this message
        if (!executedCommandsSet.has(fullTagString)) {
            newCommandsExecuted = true; // Mark that a new command was executed in this pass
            executedCommandsSet.add(fullTagString); // Mark the tag as executed for this message

            // Execute the command (e.g., change avatar, play audio)
            switch (command) {
                case 'avatar':
                    try {
                        const assets = await assetManagerService.searchAssetsByTags([value, 'avatar'], characterId);
                        if (assets && assets.length > 0) {
                            const asset = assets[0];
                            const objectURL = URL.createObjectURL(asset.data);

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
                                    setTimeout(() => {
                                        URL.revokeObjectURL(objectURL);
                                    }, 750);
                                };
                                tempImage.onerror = () => {
                                    console.error("Failed to load new avatar image for message:", objectURL);
                                    URL.revokeObjectURL(objectURL);
                                };
                            }

                            // --- Update Sidebar Personality Card with Full, Correct Logic ---
                            const personalityCard = document.querySelector(`#personality-${characterId}`);
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
                                    };
                                    tempCardImage.onerror = () => {
                                        console.error("Failed to load personality card image:", objectURL);
                                    };
                                }
                            }
                        }
                    } catch (e) { console.error(`Error processing [avatar] command:`, e); }
                    break;

                case 'sfx':
                case 'audio':
                    if (settings.audio.enabled) {
                        try {
                            const assets = await assetManagerService.searchAssetsByTags([value, 'audio'], characterId);
                            if (assets && assets.length > 0) {
                                const asset = assets[0];
                                const objectURL = URL.createObjectURL(asset.data);
                                const audio = new Audio(objectURL);
                                audio.volume = settings.audio.volume;
                                audio.play().catch(e => console.error("Audio playback failed:", e));
                                audio.onended = () => URL.revokeObjectURL(objectURL);
                            }
                        } catch (e) { console.error(`Error processing [audio/sfx] command:`, e); }
                    }
                    break;
            }
        }
        // Remove the processed tag from the *local* text being built for display.
        // This ensures the tag is gone before it's sent to marked.parse or the typing loop.
        processedText = processedText.replace(fullTagString, '').trim();
        // Adjust regex lastIndex since we modified the string.
        localCommandRegex.lastIndex = match.index; // This keeps the regex search correct after replacement.
    }
    return { cleanedChunk: processedText, newCommandsExecuted }; // Return the cleaned chunk and if any new commands ran
}