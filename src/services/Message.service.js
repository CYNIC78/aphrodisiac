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
    
    const history = [
        { role: "user", parts: [{ text: `Personality Name: ${selectedPersonality.name}, Personality Description: ${selectedPersonality.description}, Personality Prompt: ${selectedPersonality.prompt}. Your level of aggression is ${selectedPersonality.aggressiveness} out of 3. Your sensuality is ${selectedPersonality.sensuality} out of 3.` }] },
        { role: "model", parts: [{ text: "okie dokie. from now on, I will be acting as the personality you have chosen" }] }
    ];
    
    if (selectedPersonality.toneExamples) {
        history.push(...selectedPersonality.toneExamples.map(tone => ({ role: "model", parts: [{ text: tone }] })));
    }
    
    history.push(...currentChat.content.map(msg => ({ role: msg.role, parts: msg.parts })));
    
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


function setupMessageEditing(messageElement, db) {
    const editButton = messageElement.querySelector('.btn-edit');
    const saveButton = messageElement.querySelector('.btn-save');
    const messageTextDiv = messageElement.querySelector('.message-text');

    if (!editButton || !saveButton || !messageTextDiv) return;

    const messageContainer = document.querySelector(".message-container");
    const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);
    messageElement.dataset.messageIndex = messageIndex;

    editButton.addEventListener('click', async () => {
        const currentChat = await chatsService.getCurrentChat(db);
        const index = parseInt(messageElement.dataset.messageIndex, 10);
        const messageData = currentChat.content[index];

        if (messageData) {
            const rawText = messageData.parts[0].text;
            messageTextDiv.innerText = helpers.getDecoded(rawText); // Use innerText to avoid HTML issues
            
            messageTextDiv.setAttribute("contenteditable", "true");
            messageTextDiv.focus();
            
            editButton.style.display = 'none';
            saveButton.style.display = 'inline-block';
        } else {
            console.error("Could not find message data for editing.");
            alert("Error: Could not retrieve message for editing.");
        }
    });

    saveButton.addEventListener('click', async () => {
        messageTextDiv.removeAttribute("contenteditable");

        const newRawText = messageTextDiv.innerText; 
        const index = parseInt(messageElement.dataset.messageIndex, 10);
        
        await updateMessageInDatabase(index, newRawText, db);

        const settings = settingsService.getSettings();
        const separator = settings.triggers.separator;
        let visibleMessage = newRawText;
        let commandBlock = "";

        if (separator && newRawText.includes(separator)) {
            const parts = newRawText.split(separator);
            visibleMessage = parts[0].trim();
            commandBlock = parts[1] || "";
        }
        
        messageTextDiv.innerHTML = marked.parse(visibleMessage, { breaks: true });
        
        if (commandBlock) {
             const currentChat = await chatsService.getCurrentChat(db);
             const characterId = currentChat.content[index]?.personalityid;
             if (characterId !== undefined) {
                await processCommandBlock(commandBlock, messageElement, characterId);
             }
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

        // --- FINAL POLISH: This block now handles both "loading" and "live" messages ---
        if (!netStream) {
            // This is the "Loading Path" for old messages from the database.
            // We apply the same splitting logic here.
            const userSettings = settingsService.getSettings();
            const separator = userSettings.triggers.separator;
            let visibleMessage = msg, commandBlock = "";

            if (separator && msg.includes(separator)) {
                const parts = msg.split(separator);
                visibleMessage = parts[0].trim();
                commandBlock = parts[1] || "";
            }
            messageContent.innerHTML = marked.parse(visibleMessage, { breaks: true });
            
            // Note: We don't process commands for old messages to prevent re-triggering sounds/actions on every load.
            // This is the desired behavior. The initial trigger happened when the message was first received.
        } else {
            // This is the "Live Path" for new messages from the stream.
            let fullRawText = "";
            try {
                for await (const chunk of netStream) {
                    if (chunk && chunk.text) { fullRawText += chunk.text; }
                }
                const userSettings = settingsService.getSettings();
                const separator = userSettings.triggers.separator;
                let visibleMessage = fullRawText, commandBlock = "";
                if (separator && fullRawText.includes(separator)) {
                    const parts = fullRawText.split(separator);
                    visibleMessage = parts[0].trim();
                    commandBlock = parts[1] || "";
                }
                if (typingSpeed > 0) {
                    messageContent.innerHTML = '';
                    let renderedText = '';
                    for (let i = 0; i < visibleMessage.length; i++) {
                        renderedText += visibleMessage[i];
                        messageContent.innerHTML = marked.parse(renderedText, { breaks: true });
                        helpers.messageContainerScrollToBottom();
                        await new Promise(resolve => setTimeout(resolve, typingSpeed));
                    }
                } else {
                    messageContent.innerHTML = marked.parse(visibleMessage, { breaks: true });
                    helpers.messageContainerScrollToBottom();
                }
                if (commandBlock) {
                    await processCommandBlock(commandBlock, newMessage, characterId);
                }
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
    if (characterId === null) {
        console.warn("Cannot process commands: Invalid characterId.");
        return;
    }

    const { assetManagerService } = await import('./AssetManager.service.js');
    const settings = settingsService.getSettings();
    const commandRegex = new RegExp(`\\${settings.triggers.symbolStart}(.*?):(.*?)\\${settings.triggers.symbolEnd}`, 'g');
    let match;

    while ((match = commandRegex.exec(commandBlock)) !== null) {
        const command = match[1].trim().toLowerCase();
        const value = match[2].trim();

        switch (command) {
            case 'image':
                try {
                    const assets = await assetManagerService.searchAssetsByTags([value, 'image'], characterId);
                    if (assets && assets.length > 0) {
                        const asset = assets[0];
                        const objectURL = URL.createObjectURL(asset.data);
                        const pfpElement = messageElement.querySelector('.pfp');
                        if (pfpElement) pfpElement.src = objectURL;
                        const personalityCard = document.querySelector(`#personality-${characterId}`);
                        if(personalityCard) {
                            const cardImg = personalityCard.querySelector('.background-img');
                            if(cardImg) {
                                cardImg.style.opacity = 0;
                                setTimeout(() => {
                                    cardImg.src = objectURL;
                                    cardImg.style.opacity = 1;
                                }, 200);
                            }
                        }
                    } else {
                        console.warn(`Image asset with tag "${value}" not found for character ${characterId}.`);
                    }
                } catch (e) { console.error(`Error processing image command:`, e); }
                break;

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
                        } else {
                            console.warn(`Audio asset with tag "${value}" not found for character ${characterId}.`);
                        }
                    } catch (e) { console.error(`Error processing audio command:`, e); }
                }
                break;

            default:
                console.warn(`Unknown command: "${command}"`);
        }
    }
}