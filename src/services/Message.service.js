// FILE: src/services/Message.service.js

import { GoogleGenAI } from "@google/genai"
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";

// Global Map to store executed commands per message element for idempotency
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

    editButton.addEventListener('click', async () => { 
        messageTextDiv.setAttribute("contenteditable", "true");
        messageTextDiv.focus();
        editButton.style.display = 'none';
        saveButton.style.display = 'inline-block';

        const messageIndex = parseInt(messageElement.dataset.messageIndex, 10);
        const currentChat = await chatsService.getCurrentChat(db);
        if (currentChat && currentChat.content[messageIndex]) {
            messageTextDiv.innerText = currentChat.content[messageIndex].parts[0].text; 
        }
    });

    saveButton.addEventListener('click', async () => {
        messageTextDiv.removeAttribute("contenteditable");
        const newRawText = messageTextDiv.innerText;
        const index = parseInt(messageElement.dataset.messageIndex, 10);
        
        await updateMessageInDatabase(index, newRawText, db);

        messageTextDiv.innerHTML = marked.parse(newRawText, { breaks: true });
        
        // When editing and saving, we need to clear the executed commands for this message
        executedCommandsMap.delete(messageElement);
        // Then re-process commands from the now-visible text.
        const characterId = (await chatsService.getCurrentChat(db)).content[index]?.personalityid;
        if (characterId !== undefined) {
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
                executedCommandsMap.delete(newMessage);
                await regenerate(newMessage, db);
            } catch (error) { console.error(error); alert("Error during regeneration."); }
        });
        const messageContent = newMessage.querySelector(".message-text");

        if (!netStream) {
            messageContent.innerHTML = marked.parse(msg, { breaks: true });
            await processCommandBlock(msg, newMessage, characterId, executedCommandsSet);
        } else {
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

                await processCommandBlock(fullRawText, newMessage, characterId, executedCommandsSet);
                
                hljs.highlightAll();
                helpers.messageContainerScrollToBottom();
                setupMessageEditing(newMessage, db);
                executedCommandsMap.delete(newMessage);
                return { HTML: messageContent.innerHTML, md: fullRawText };
            } catch (error) {
                console.error("Stream error:", error);
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

        // Check if this specific tag has been executed for this message
        if (executedCommandsSet.has(fullTagString)) {
            // Still remove the tag from the displayed text if it's there
            messageContent.innerText = messageContent.innerText.replace(fullTagString, '').trim();
            continue; 
        }

        // Mark the tag as executed for this message
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

        // Remove the processed tag from the displayed message after execution
        messageContent.innerText = messageContent.innerText.replace(fullTagString, '').trim();
    }
}