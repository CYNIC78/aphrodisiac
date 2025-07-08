// FILE: src/services/Message.service.js

//handles sending messages to the api

import { GoogleGenAI } from "@google/genai"
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";
// NEW: Import the AssetManager service to fetch assets for our commands.
import * as assetManager from "./AssetManager.service.js";


export async function send(msg, db) {
    const settings = settingsService.getSettings();
    const selectedPersonality = await personalityService.getSelected();
    if (!selectedPersonality) {
        return;
    }
    if (settings.apiKey === "") {
        alert("Please enter an API key");
        return;
    }
    if (!msg) {
        return;
    }

    //model setup
    const ai = new GoogleGenAI({ apiKey: settings.apiKey });
    const config = {
        maxOutputTokens: parseInt(settings.maxTokens),
        temperature: settings.temperature / 100,
        systemPrompt: settingsService.getSystemPrompt(),
        safetySettings: settings.safetySettings,
        responseMimeType: "text/plain"
    };
    
    //user msg handling
    //we create a new chat if there is none is currently selected
    if (!await chatsService.getCurrentChat(db)) { 
        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash',
            contents: "You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user's message is: " + msg,
        });
        const title = response.text;
        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click();
    }

    // Display user message in UI
    await insertMessage("user", msg, null, null, db);

    // --- START: CHARACTER REMINDER LOGIC ---
    const currentChat = await chatsService.getCurrentChat(db);
    currentChat.content.push({ role: "user", parts: [{ text: msg }] });
    await db.chats.put(currentChat);
    // --- END: CHARACTER REMINDER LOGIC ---

    helpers.messageContainerScrollToBottom();
    
    // Create chat history for the AI session.
    const history = [
        {
            role: "user",
            parts: [{ text: `Personality Name: ${selectedPersonality.name}, Personality Description: ${selectedPersonality.description}, Personality Prompt: ${selectedPersonality.prompt}. Your level of aggression is ${selectedPersonality.aggressiveness} out of 3. Your sensuality is ${selectedPersonality.sensuality} out of 3.` }]
        },
        {
            role: "model",
            parts: [{ text: "okie dokie. from now on, I will be acting as the personality you have chosen" }]
        }
    ];
    
    if (selectedPersonality.toneExamples) {
        history.push(
            ...selectedPersonality.toneExamples.map((tone) => {
                return { role: "model", parts: [{ text: tone }] }
            })
        );
    }
    
    history.push(
        ...currentChat.content.map((msg) => {
            return { role: msg.role, parts: msg.parts }
        })
    );
    
    const chat = ai.chats.create({
        model: settings.model,
        history: history,
        config: config
    });

    // --- START: CHARACTER REMINDER LOGIC (Injection into current message) ---
    let messageToSendToAI = msg;
    if (selectedPersonality.reminder) {
        messageToSendToAI += `\n\nSYSTEM REMINDER: ${selectedPersonality.reminder}`;
    }
    // --- END: CHARACTER REMINDER LOGIC ---
    
    const stream = await chat.sendMessageStream({
        message: messageToSendToAI
    });
    
    // --- MODIFIED: Pass characterId to insertMessage to enable asset triggers ---
    const reply = await insertMessage("model", "", selectedPersonality.name, stream, db, selectedPersonality.image, settings.typingSpeed, selectedPersonality.id);

    // Save model reply to chat history
    currentChat.content.push({ role: "model", personality: selectedPersonality.name, personalityid: selectedPersonality.id, parts: [{ text: reply.md }] });
    await db.chats.put(currentChat);
    settingsService.saveSettings();
}

async function regenerate(responseElement, db) {
    //basically, we remove every message after the response we wish to regenerate, then send the message again.
    const message = responseElement.previousElementSibling.querySelector(".message-text").textContent;
    const elementIndex = [...responseElement.parentElement.children].indexOf(responseElement);
    const chat = await chatsService.getCurrentChat(db);

    chat.content = chat.content.slice(0, elementIndex - 1);
    await db.chats.put(chat);
    await chatsService.loadChat(chat.id, db);
    await send(message, db);
}

// NOTE: This function's editing implementation is basic. It will be enhanced later.
function setupMessageEditing(messageElement, db) {
    const editButton = messageElement.querySelector(".btn-edit");
    const saveButton = messageElement.querySelector(".btn-save");
    const messageText = messageElement.querySelector(".message-text");
    
    if (!editButton || !saveButton) return;
    
    editButton.addEventListener("click", () => {
        messageText.setAttribute("contenteditable", "true");
        messageText.focus();
        editButton.style.display = "none";
        saveButton.style.display = "inline-block";
        messageText.dataset.originalContent = messageText.innerHTML;
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(messageText);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    });
    
    saveButton.addEventListener("click", async () => {
        messageText.removeAttribute("contenteditable");
        editButton.style.display = "inline-block";
        saveButton.style.display = "none";
        
        const messageContainer = document.querySelector(".message-container");
        const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);
        
        await updateMessageInDatabase(messageElement, messageIndex, db);

        // --- NEW: Re-process triggers after an edit ---
        const newRawText = messageText.textContent;
        const settings = settingsService.getSettings();
        const separator = settings.triggers.separator;
        let visibleMessage = newRawText;
        let commandBlock = "";

        if (separator && newRawText.includes(separator)) {
            const parts = newRawText.split(separator);
            visibleMessage = parts[0].trim();
            commandBlock = parts[1] || "";
        }
        
        // Re-render the visible part and re-run commands
        messageText.innerHTML = marked.parse(visibleMessage, { breaks: true });
        if (commandBlock) {
             const currentChat = await chatsService.getCurrentChat(db);
             const characterId = currentChat.content[messageIndex]?.personalityid;
             if(characterId !== undefined) {
                await processCommandBlock(commandBlock, messageElement, characterId);
             }
        }
    });
    
    messageText.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            saveButton.click();
        }
        
        if (e.key === "Escape") {
            messageText.innerHTML = messageText.dataset.originalContent;
            messageText.removeAttribute("contenteditable");
            editButton.style.display = "inline-block";
            saveButton.style.display = "none";
        }
    });
}

async function updateMessageInDatabase(messageElement, messageIndex, db) {
    if (!db) return;
    try {
        const rawText = messageElement.querySelector(".message-text").textContent; // Use textContent to get raw text
        const currentChat = await chatsService.getCurrentChat(db);
        if (!currentChat || !currentChat.content[messageIndex]) return;
        currentChat.content[messageIndex].parts[0].text = rawText;
        await db.chats.put(currentChat);
    } catch (error) {
        console.error("Error updating message in database:", error);
    }
}

// --- MODIFIED: Function signature and logic updated for Trigger System ---
export async function insertMessage(sender, msg, selectedPersonalityTitle = null, netStream = null, db = null, pfpSrc = null, typingSpeed = 0, characterId = null) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);

    if (sender != "user") {
        newMessage.classList.add("message-model");
        const messageRole = selectedPersonalityTitle;
        newMessage.innerHTML = `
            <div class="message-header">
                <img class="pfp" src="${pfpSrc}" loading="lazy"></img>
                <h3 class="message-role">${messageRole}</h3>
                <div class="message-actions">
                    <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                    <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    <button class="btn-refresh btn-textual material-symbols-outlined">refresh</button>
                </div>
            </div>
            <div class="message-role-api" style="display: none;">${sender}</div>
            <div class="message-text"></div>
            `;
        const refreshButton = newMessage.querySelector(".btn-refresh");
        refreshButton.addEventListener("click", async () => {
            try { await regenerate(newMessage, db) } catch (error) { console.error(error); alert("Error during regeneration."); }
        });
        const messageContent = newMessage.querySelector(".message-text");

        if (!netStream) {
            messageContent.innerHTML = marked.parse(msg);
        } else {
            let fullRawText = "";
            try {
                for await (const chunk of netStream) {
                    if (chunk && chunk.text) { fullRawText += chunk.text; }
                }

                // --- NEW: Trigger Phrase System Logic ---
                const userSettings = settingsService.getSettings();
                const separator = userSettings.triggers.separator;
                let visibleMessage = fullRawText;
                let commandBlock = "";

                if (separator && fullRawText.includes(separator)) {
                    const parts = fullRawText.split(separator);
                    visibleMessage = parts[0].trim(); // Trim whitespace
                    commandBlock = parts[1] || "";
                }
                
                // MODIFIED: Type out only the visible part
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

                // NEW: Process the command block after typing is complete
                if (commandBlock) {
                    await processCommandBlock(commandBlock, newMessage, characterId);
                }

                hljs.highlightAll();
                helpers.messageContainerScrollToBottom();
                setupMessageEditing(newMessage, db);
                // IMPORTANT: Return the FULL RAW text so it's saved correctly to the database for editing.
                return { HTML: messageContent.innerHTML, md: fullRawText };
            } catch (error) {
                console.error("Stream error:", error);
                messageContent.innerHTML = marked.parse(fullRawText, { breaks: true });
                return { HTML: messageContent.innerHTML, md: fullRawText };
            }
        }
    } else {
        const messageRole = "You:";
        newMessage.innerHTML = `
                <div class="message-header">
                    <h3 class="message-role">${messageRole}</h3>
                    <div class="message-actions">
                        <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                        <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    </div>
                </div>
                <div class="message-role-api" style="display: none;">${sender}</div>
                <div class="message-text">${helpers.getDecoded(msg)}</div>
                `;
    }
    hljs.highlightAll();
    setupMessageEditing(newMessage, db);
}

// --- NEW: Helper function to process the command block ---
async function processCommandBlock(commandBlock, messageElement, characterId) {
    if (characterId === null) {
        console.warn("Cannot process commands: Invalid characterId.");
        return;
    }

    const settings = settingsService.getSettings();
    // Use dynamic symbols from settings to build the regex
    const commandRegex = new RegExp(`\\${settings.triggers.symbolStart}(.*?):(.*?)\\${settings.triggers.symbolEnd}`, 'g');
    let match;

    while ((match = commandRegex.exec(commandBlock)) !== null) {
        const command = match[1].trim().toLowerCase();
        const value = match[2].trim();

        switch (command) {
            case 'image': // Changed from 'avatar' to 'image' for consistency
                try {
                    const asset = await assetManager.getAssetByTag(value, 'image', characterId);
                    if (asset && asset.data) {
                        const pfpElement = messageElement.querySelector('.pfp');
                        if (pfpElement) { pfpElement.src = asset.data; }
                        
                        const personalityCard = document.querySelector(`#personality-${characterId}`);
                        if(personalityCard) {
                            const cardImg = personalityCard.querySelector('.background-img');
                            if(cardImg) {
                                cardImg.style.opacity = 0;
                                setTimeout(() => {
                                    cardImg.src = asset.data;
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
                        const asset = await assetManager.getAssetByTag(value, 'audio', characterId);
                        if (asset && asset.data) {
                            const audio = new Audio(asset.data);
                            audio.volume = settings.audio.volume;
                            audio.play().catch(e => console.error("Audio playback failed:", e));
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