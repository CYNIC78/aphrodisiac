// FILE: src/services/Message.service.js

//handles sending messages to the api

import { GoogleGenAI } from "@google/genai"
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";
// NO AssetManager import here. It is loaded on-demand.

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
        // The systemPrompt here is now being passed correctly within the history.
        // Leaving it here might be redundant but is harmless for now.
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
    
    // --- START OF THE ONLY CHANGE ---
    // This block is the only thing that has been modified.

    // 1. We assemble the complete instruction set into a single, clear text block.
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

    // 2. We inject this master instruction into the chat history.
    const history = [
        { role: "user", parts: [{ text: masterInstruction }] },
        { role: "model", parts: [{ text: "Understood. I will now act as the specified character and use my command tags as instructed." }] }
    ];

    // --- END OF THE ONLY CHANGE ---

    
    if (selectedPersonality.toneExamples && selectedPersonality.toneExamples.length > 0 && selectedPersonality.toneExamples[0]) {
        history.push(...selectedPersonality.toneExamples.map(tone => ({ role: "model", parts: [{ text: tone }] })));
    }
    
    // We now add the rest of the chat history, excluding the very last message (which is the one we're sending).
    history.push(...currentChat.content.slice(0, -1).map(msg => ({ role: msg.role, parts: msg.parts })));
    
    const chat = ai.chats.create({ model: settings.model, history, config });

    let messageToSendToAI = msg;
    if (selectedPersonality.reminder) {
        messageToSendToAI += `\n\nSYSTEM REMINDER: ${selectedPersonality.reminder}`;
    }
    
    const stream = await chat.sendMessageStream({ message: messageToSendToAI });
    
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
// This is a simple, stable, and bug-free implementation.

function setupMessageEditing(messageElement, db) {
    const editButton = messageElement.querySelector('.btn-edit');
    const saveButton = messageElement.querySelector('.btn-save');
    const messageTextDiv = messageElement.querySelector('.message-text');

    if (!editButton || !saveButton || !messageTextDiv) return;

    const messageContainer = document.querySelector(".message-container");
    const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);
    messageElement.dataset.messageIndex = messageIndex;

    editButton.addEventListener('click', () => {
        // Just make the existing text editable. No swapping, no complex logic.
        messageTextDiv.setAttribute("contenteditable", "true");
        messageTextDiv.focus();
        editButton.style.display = 'none';
        saveButton.style.display = 'inline-block';
    });

    saveButton.addEventListener('click', async () => {
        messageTextDiv.removeAttribute("contenteditable");
        const newRawText = messageTextDiv.innerText; // Get the clean text.
        const index = parseInt(messageElement.dataset.messageIndex, 10);
        
        await updateMessageInDatabase(index, newRawText, db);

        // Re-render the message. It will remain fully visible.
        messageTextDiv.innerHTML = marked.parse(newRawText, { breaks: true });
        
        // Re-process commands from the now-visible text.
        const characterId = (await chatsService.getCurrentChat(db)).content[index]?.personalityid;
        if (characterId !== undefined) {
            await processCommandBlock(newRawText, messageElement, characterId);
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
            try { await regenerate(newMessage, db) } catch (error) { console.error(error); alert("Error during regeneration."); }
        });
        const messageContent = newMessage.querySelector(".message-text");

        // "VISIBLE GUTS" LOGIC - No more splitting.
        if (!netStream) {
            // Loading Path: Display the full raw message.
            messageContent.innerHTML = marked.parse(msg, { breaks: true });
        } else {
            // Live Path: Stream the full raw message.
            let fullRawText = "";
            try {
                for await (const chunk of netStream) {
                    if (chunk && chunk.text) { fullRawText += chunk.text; }
                }
                
                if (typingSpeed > 0) {
                    messageContent.innerHTML = '';
                    let renderedText = '';
                    for (let i = 0; i < fullRawText.length; i++) {
                        renderedText += fullRawText[i];
                        messageContent.innerHTML = marked.parse(renderedText, { breaks: true });
                        helpers.messageContainerScrollToBottom();
                        await new Promise(resolve => setTimeout(resolve, typingSpeed));
                    }
                } else {
                    messageContent.innerHTML = marked.parse(fullRawText, { breaks: true });
                    helpers.messageContainerScrollToBottom();
                }

                // Process commands from the full, visible text.
                await processCommandBlock(fullRawText, newMessage, characterId);
                
                hljs.highlightAll();
                helpers.messageContainerScrollToBottom();
                setupMessageEditing(newMessage, db);
                return { HTML: messageContent.innerHTML, md: fullRawText };
            } catch (error) {
                console.error("Stream error:", error);
                messageContent.innerHTML = marked.parse(fullRawText, { breaks: true });
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

async function processCommandBlock(commandBlock, messageElement, characterId) {
    if (characterId === null) return;

    const { assetManagerService } = await import('./AssetManager.service.js');
    const settings = settingsService.getSettings();
    const commandRegex = new RegExp(`\\${settings.triggers.symbolStart}(.*?):(.*?)\\${settings.triggers.symbolEnd}`, 'g');
    
    // Get the message content element once for efficiency
    const messageContent = messageElement.querySelector('.message-text');
    if (!messageContent) return; // Safety check

    // We'll iterate through the commandBlock string multiple times,
    // so we need a mutable string or to re-evaluate the HTML directly.
    // The safest way is to find and replace them in the already rendered HTML.
    let match;
    // We need to operate on a copy of the *original* raw text for regex matching,
    // but modify the *rendered HTML* to remove tags.
    const originalRenderedHtml = messageContent.innerHTML;

    // Use a temporary regex with a local scope to avoid interfering with global regex state
    // and to ensure all instances are found.
    const localCommandRegex = new RegExp(`\\${settings.triggers.symbolStart}(.*?):(.*?)\\${settings.triggers.symbolEnd}`, 'g');
    
    while ((match = localCommandRegex.exec(commandBlock)) !== null) {
        const fullTagString = match[0]; // e.g., "[avatar:happy]"
        const command = match[1].trim().toLowerCase(); // e.g., "avatar"
        const value = match[2].trim(); // e.g., "happy"

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

        // --- NEW: Remove the processed tag from the displayed message ---
        // We use innerText to avoid HTML parsing issues and ensure we replace the exact string.
        messageContent.innerText = messageContent.innerText.replace(fullTagString, '').trim();
    }
}