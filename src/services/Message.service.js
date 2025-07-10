// FILE: src/services/Message.service.js

import { GoogleGenAI } from "@google/genai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";

export async function send(msg, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality) return;
    if (settings.apiKey === "") return alert("Please enter an API key");
    if (!msg) return;

    // REVERTED TO WORKING SYNTAX
    const genAI = new GoogleGenAI({ apiKey: settings.apiKey });

    const systemInstruction = {
        role: "system",
        parts: [
            { text: settingsService.getSystemPrompt() },
            { text: "---" },
            { text: `CHARACTER PROMPT (Your personality):\n${selectedPersonality.prompt}` },
            { text: "---" },
            { text: `TAG PROMPT (Your technical command reference):\n${selectedPersonality.tagPrompt || 'No specific command tags have been provided for this character.'}` }
        ]
    };

    const model = genAI.getGenerativeModel({
        model: settings.model,
        systemInstruction: systemInstruction,
        safetySettings: settings.safetySettings
    });

    if (!await chatsService.getCurrentChat(db)) {
        const titleGenModel = genAI.getGenerativeModel({ model: "gemini-pro" });
        const prompt = "You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user's message is: " + msg;
        const result = await titleGenModel.generateContent(prompt);
        const response = await result.response;
        const title = response.text();
        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click();
    }

    await insertMessage("user", msg, null, null, db);

    const currentChat = await chatsService.getCurrentChat(db);
    currentChat.content.push({ role: "user", parts: [{ text: msg }] });
    await db.chats.put(currentChat);

    helpers.messageContainerScrollToBottom();
    
    const history = [];
    if (selectedPersonality.toneExamples && selectedPersonality.toneExamples.length > 0 && selectedPersonality.toneExamples[0] !== '') {
        history.push({ role: "model", parts: [{ text: "Understood. I will now act as the specified character and use my command tags as instructed." }] });
        history.push(...selectedPersonality.toneExamples.map(tone => ({ role: "model", parts: [{ text: tone }] })));
    }
    
    history.push(...currentChat.content.slice(0, -1).map(message => ({
        role: message.role,
        parts: message.parts,
    })));
    
    const chat = model.startChat({
        history: history,
        generationConfig: {
            maxOutputTokens: parseInt(settings.maxTokens),
            temperature: settings.temperature,
        }
    });

    let messageToSendToAI = msg;
    if (selectedPersonality.reminder) {
        messageToSendToAI += `\n\n[SYSTEM REMINDER: ${selectedPersonality.reminder}]`;
    }
    
    const result = await chat.sendMessageStream(messageToSendToAI);
    
    const reply = await insertMessage("model", "", selectedPersonality.name, result.stream, db, selectedPersonality.image, settings.typingSpeed, characterId);

    currentChat.content.push({ role: "model", personality: selectedPersonality.name, personalityid: selectedPersonality.id, parts: [{ text: reply.md }] });
    await db.chats.put(currentChat);
    settingsService.saveSettings();
}

async function regenerate(responseElement, db) {
    const message = responseElement.previousElementSibling.querySelector(".message-text").textContent;
    const elementIndex = [...responseElement.parentElement.children].indexOf(responseElement);
    const chat = await chatsService.getCurrentChat(db);
    // TYPO FIX: The variable 'a' was a mistake. It is now correctly '1'.
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

    editButton.addEventListener('click', () => {
        messageTextDiv.setAttribute("contenteditable", "true");
        messageTextDiv.focus();
        editButton.style.display = 'none';
        saveButton.style.display = 'inline-block';
    });

    saveButton.addEventListener('click', async () => {
        messageTextDiv.removeAttribute("contenteditable");
        const newRawText = messageTextDiv.innerText;
        const index = parseInt(messageElement.dataset.messageIndex, 10);
        
        await updateMessageInDatabase(index, newRawText, db);

        messageTextDiv.innerHTML = marked.parse(newRawText, { breaks: true });
        
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

        if (!netStream) {
            messageContent.innerHTML = marked.parse(msg, { breaks: true });
        } else {
            let fullRawText = "";
            try {
                for await (const chunk of netStream) {
                    const chunkText = chunk.text();
                    if (chunkText) { fullRawText += chunkText; }
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
    let match;

    while ((match = commandRegex.exec(commandBlock)) !== null) {
        const command = match[1].trim().toLowerCase();
        const value = match[2].trim();

        switch (command) {
            case 'avatar':
                 try {
                    const assets = await assetManagerService.searchAssetsByTags([value, 'avatar', 'image'], characterId);
                    if (assets && assets.length > 0) {
                        const asset = assets[0];
                        const objectURL = URL.createObjectURL(asset.data);
                        const pfpElement = messageElement.querySelector('.pfp');
                        if (pfpElement) pfpElement.src = objectURL;
                        const personalityCard = document.querySelector(`#personality-${characterId}`);
                        if(personalityCard) {
                            const cardImg = personalityCard.querySelector('.background-img');
                            if(cardImg) cardImg.src = objectURL;
                        }
                    }
                } catch (e) { console.error(`Error processing avatar command:`, e); }
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
                    } catch (e) { console.error(`Error processing audio command:`, e); }
                }
                break;
        }
    }
}