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

        // NEW LOGIC: Load the raw message text from the database for editing
        const messageIndex = parseInt(messageElement.dataset.messageIndex, 10);
        const currentChat = await chatsService.getCurrentChat(db);
        if (currentChat && currentChat.content[messageIndex]) {
            const rawMessageText = helpers.getDecoded(currentChat.content[messageIndex].parts[0].text);
            messageTextDiv.innerText = rawMessageText; // Set innerText to keep plain text for editing
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
            await processCommandBlock(newRawText, messageElement, characterId, executedCommandsMap.get(messageElement) || new Set()); // Pass the set
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
            // For non-streaming loads, still process commands (e.g., from chat history)
            await processCommandBlock(msg, newMessage, characterId, executedCommandsSet); // Pass the set
        } else {
            let fullRawText = "";
            try {
                for await (const chunk of netStream) {
                    if (chunk && chunk.text) { 
                        fullRawText += chunk.text; 
                        
                        // NEW: Process commands after each chunk is added to the raw text.
                        // This will execute commands and hide tags more frequently.
                        // We pass the full raw text, the message element, character ID, and the executed commands set.
                        messageContent.innerHTML = marked.parse(fullRawText, { breaks: true });
                        helpers.messageContainerScrollToBottom();
                        await processCommandBlock(fullRawText, newMessage, characterId, executedCommandsSet);
                    }
                }
                
                // FINAL RENDER (if typingSpeed enabled, it's already rendered character by character within the loop)
                // If typingSpeed > 0, the content is already built char by char.
                // If typingSpeed == 0, the whole message is parsed at once after stream is done.
                if (typingSpeed > 0) {
                    // This loop will now type out the 'fullRawText' *after* tags have been hidden in `processCommandBlock`.
                    // The tags might still be visible briefly as new characters come in *before* processCommandBlock runs on the latest chunk.
                    // This is the acceptable compromise.
                    let renderedText = '';
                    for (let i = 0; i < fullRawText.length; i++) {
                        renderedText += fullRawText[i];
                        messageContent.innerHTML = marked.parse(renderedText, { breaks: true });
                        helpers.messageContainerScrollToBottom();
                        await new Promise(resolve => setTimeout(resolve, typingSpeed));
                    }
                } else {
                    // This case is for instant typing. `processCommandBlock` already ran per-chunk.
                    // This final parse ensures any remaining markdown is correct.
                    messageContent.innerHTML = marked.parse(fullRawText, { breaks: true });
                    helpers.messageContainerScrollToBottom();
                }

                hljs.highlightAll();
                helpers.messageContainerScrollToBottom();
                setupMessageEditing(newMessage, db);
                // NEW: Delete the executed commands Set from the map once message is fully done.
                executedCommandsMap.delete(newMessage);
                return { HTML: messageContent.innerHTML, md: fullRawText };
            } catch (error) {
                console.error("Stream error:", error);
                messageContent.innerHTML = marked.parse(fullRawText, { breaks: true });
                executedCommandsMap.delete(newMessage); // Ensure cleanup on error
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

// MODIFIED: Added executedCommandsSet parameter
async function processCommandBlock(commandBlock, messageElement, characterId, executedCommandsSet = new Set()) {
    if (characterId === null) return;

    const { assetManagerService } = await import('./AssetManager.service.js');
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

        // NEW: Idempotence check - if this specific tag has been executed for this message, skip execution.
        if (executedCommandsSet.has(fullTagString)) {
            // Still remove the tag from the displayed text if it's there
            messageContent.innerText = messageContent.innerText.replace(fullTagString, '').trim();
            continue; 
        }

        // NEW: Mark the tag as executed for this message
        executedCommandsSet.add(fullTagString);

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
                                // Defer revoking to ensure the browser has fully processed the image
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
                                // Create a separate temp image to avoid conflicts
                                const tempCardImage = new Image();
                                tempCardImage.src = objectURL;
                                
                                tempCardImage.onload = () => {
                                    cardImg.classList.add('hide-for-swap');
                                    requestAnimationFrame(() => {
                                        cardImg.src = objectURL;
                                        cardImg.classList.remove('hide-for-swap');
                                    });
                                    // No need for a second revoke, it's the same URL
                                };
                                tempCardImage.onerror = () => {
                                    console.error("Failed to load personality card image:", objectURL);
                                    // No need for a second revoke here either
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

        // NEW: Remove the processed tag from the displayed message after execution
        messageContent.innerText = messageContent.innerText.replace(fullTagString, '').trim();
    }
}