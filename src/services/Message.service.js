// FILE: src/services/Message.service.js

import { GoogleGenAI } from "@google/genai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";

const processedCommandsPerMessage = new Map(); // Map<messageElement, Set<fullTagString>>

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

        TAG PROMPT (Your technical command reference - no separators needed, just [command:value]):
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

    // Pass the pfpSrc from selectedPersonality.image to insertMessage
    const reply = await insertMessage("model", "", selectedPersonality.name, chat.sendMessageStream({ message: messageToSendToAI }), db, selectedPersonality.image, settings.typingSpeed, selectedPersonality.id);

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

function wrapCommandsInSpan(text) {
    const commandRegex = /\[(.*?):(.*?)]/g;
    return text.replace(commandRegex, `<span class="command-block">$&</span>`);
}

async function executeCommandAction(command, value, messageElement, characterId) {
    if (characterId === null) return;
    // Lazy import AssetManager.service.js here for efficiency
    const { assetManagerService } = await import('./AssetManager.service.js'); 
    const settings = settingsService.getSettings();

    switch (command) {
        case 'avatar':
            try {
                const assets = await assetManagerService.searchAssetsByTags([value, 'avatar'], characterId);
                if (assets && assets.length > 0) {
                    const asset = assets[0];
                    const objectURL = URL.createObjectURL(asset.data);

                    // Кроссфейд аватарки в сообщении
                    const pfpWrapper = messageElement.querySelector('.pfp-wrapper');
                    if (pfpWrapper) {
                        const oldImg = pfpWrapper.querySelector('.pfp');
                        const newImg = document.createElement('img');
                        newImg.src = objectURL;
                        newImg.className = 'pfp';
                        newImg.style.opacity = '0';
                        // Add error handling for the new image
                        newImg.onerror = () => {
                            console.error(`Failed to load avatar for command [avatar:${value}]:`, objectURL);
                            newImg.src = 'path/to/default-avatar.png'; // Fallback image
                            newImg.style.opacity = '1'; // Ensure fallback is visible
                            URL.revokeObjectURL(objectURL);
                        };
                        pfpWrapper.appendChild(newImg);
                        requestAnimationFrame(() => {
                            newImg.style.transition = 'opacity 0.5s ease-in-out';
                            newImg.style.opacity = '1';
                        });
                        setTimeout(() => {
                            if (oldImg && oldImg.parentElement === pfpWrapper) oldImg.remove();
                            URL.revokeObjectURL(objectURL);
                        }, 500);
                    }

                    // Кроссфейд аватарки в сайдбаре
                    const personalityCard = document.querySelector(`#personality-${characterId}`);
                    if (personalityCard) {
                        const cardWrapper = personalityCard.querySelector('.background-img-wrapper');
                        if (cardWrapper) {
                            const oldImg = cardWrapper.querySelector('.background-img');
                            const newImg = document.createElement('img');
                            newImg.src = objectURL;
                            newImg.className = 'background-img';
                            newImg.style.opacity = '0';
                            // Add error handling for the new image
                            newImg.onerror = () => {
                                console.error(`Failed to load sidebar avatar for command [avatar:${value}]:`, objectURL);
                                newImg.src = 'path/to/default-sidebar-avatar.png'; // Fallback image
                                newImg.style.opacity = '1'; // Ensure fallback is visible
                                URL.revokeObjectURL(objectURL);
                            };
                            cardWrapper.appendChild(newImg);
                            requestAnimationFrame(() => {
                                newImg.style.transition = 'opacity 0.5s ease-in-out';
                                newImg.style.opacity = '1';
                            });
                            setTimeout(() => {
                                if (oldImg && oldImg.parentElement === cardWrapper) oldImg.remove();
                                URL.revokeObjectURL(objectURL);
                            }, 500);
                        } else {
                            const img = personalityCard.querySelector('.background-img');
                            if (img) {
                                img.src = objectURL;
                                // Add error handling for the image
                                img.onerror = () => {
                                    console.error(`Failed to load sidebar avatar for command [avatar:${value}]:`, objectURL);
                                    img.src = 'path/to/default-sidebar-avatar.png'; // Fallback image
                                };
                                setTimeout(() => URL.revokeObjectURL(objectURL), 750);
                            } else {
                                URL.revokeObjectURL(objectURL);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error(`Error processing [avatar] command:`, e);
            }
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
                        // Add error handling for audio
                        audio.onerror = () => {
                            console.error(`Failed to load audio for command [${command}:${value}]:`, objectURL);
                            URL.revokeObjectURL(objectURL);
                        };
                    }
                } catch (e) {
                    console.error(`Error processing [audio/sfx] command:`, e);
                }
            }
            break;
    }
}

async function processDynamicCommands(currentText, messageElement, characterId) {
    if (characterId === null) return;
    const commandRegex = /\[(.*?):(.*?)]/g;
    let match;

    if (!processedCommandsPerMessage.has(messageElement)) {
        processedCommandsPerMessage.set(messageElement, new Set());
    }
    const processedTags = processedCommandsPerMessage.get(messageElement);

    commandRegex.lastIndex = 0;
    while ((match = commandRegex.exec(currentText)) !== null) {
        const fullTagString = match[0];
        const command = match[1].trim().toLowerCase();
        const value = match[2].trim();

        if (!processedTags.has(fullTagString)) {
            await executeCommandAction(command, value, messageElement, characterId);
            processedTags.add(fullTagString);
        }
    }
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
        const index = parseInt(messageElement.dataset.messageIndex, 10);
        const currentChat = await chatsService.getCurrentChat(db);
        const originalRawText = currentChat.content[index]?.parts[0]?.text;

        if (originalRawText) {
            messageTextDiv.textContent = originalRawText;
        } else {
            // Fallback for cases where originalRawText might be missing (shouldn't happen with proper saving)
            messageTextDiv.textContent = messageTextDiv.innerText;
        }

        messageTextDiv.setAttribute("contenteditable", "true");
        messageTextDiv.focus();

        const range = document.createRange();
        range.selectNodeContents(messageTextDiv);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        editButton.style.display = 'none';
        saveButton.style.display = 'inline-block';
    });

    saveButton.addEventListener('click', async () => {
        messageTextDiv.removeAttribute("contenteditable");
        const newRawText = messageTextDiv.innerText;
        const index = parseInt(messageElement.dataset.messageIndex, 10);

        await updateMessageInDatabase(index, newRawText, db);

        // Re-render the message with parsed markdown and wrapped commands
        messageTextDiv.innerHTML = marked.parse(wrapCommandsInSpan(newRawText), { breaks: true });

        // Clear processed commands to allow re-execution on edit/save
        if (processedCommandsPerMessage.has(messageElement)) {
            processedCommandsPerMessage.get(messageElement).clear();
        }

        const chat = await chatsService.getCurrentChat(db);
        // Ensure characterId is retrieved correctly for re-execution
        const characterId = chat.content[index]?.personalityid;
        if (characterId !== undefined) {
            await processDynamicCommands(newRawText, messageElement, characterId);
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

        currentChat.content[messageIndex].parts[0].text = newRawText;
        await db.chats.put(currentChat);
    } catch (error) {
        console.error("Error updating message in database:", error);
    }
}

export async function insertMessage(sender, msg, selectedPersonalityTitle = null, netStream = null, db = null, pfpSrc = null, typingSpeed = 0, characterId = null) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);

    // Set message index immediately for consistent lookup
    newMessage.dataset.messageIndex = Array.from(messageContainer.children).indexOf(newMessage);

    if (sender !== "user") {
        newMessage.classList.add("message-model");
        newMessage.innerHTML = `
            <div class="message-header">
                <div class="pfp-wrapper">
                    <img class="pfp" src="" loading="lazy" /> 
                </div>
                <h3 class="message-role">${selectedPersonalityTitle}</h3>
                <div class="message-actions">
                    <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                    <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    <button class="btn-refresh btn-textual material-symbols-outlined">refresh</button>
                </div>
            </div>
            <div class="message-role-api" style="display: none;">${sender}</div>
            <div class="message-text"></div>`;

        // AFTER innerHTML, query the pfpElement and set its src using requestAnimationFrame
        const pfpElement = newMessage.querySelector('.pfp');
        if (pfpElement && pfpSrc) {
            requestAnimationFrame(() => {
                pfpElement.src = pfpSrc;
                // Optional: Add an onerror handler for the initial load
                pfpElement.onerror = () => {
                    console.error("Failed to load initial personality avatar:", pfpSrc);
                    // Fallback to a default image if loading fails
                    pfpElement.src = 'path/to/default-avatar.png'; // <--- IMPORTANT: Update with your default avatar path
                };
            });
        }

        const refreshButton = newMessage.querySelector(".btn-refresh");
        refreshButton.addEventListener("click", async () => {
            try { await regenerate(newMessage, db) } catch (error) { console.error(error); alert("Error during regeneration."); }
        });

        const messageContent = newMessage.querySelector(".message-text");

        if (!netStream) {
            // For non-streaming messages (e.g., loaded from history)
            messageContent.innerHTML = marked.parse(wrapCommandsInSpan(msg), { breaks: true });
            // Process commands immediately for non-streaming messages
            if (characterId !== null) { // Ensure characterId is valid
                await processDynamicCommands(msg, newMessage, characterId);
            }
        } else {
            let fullRawText = "";
            let currentDisplayedText = "";

            try {
                for await (const chunk of netStream) {
                    if (chunk && chunk.text) {
                        fullRawText += chunk.text;

                        if (!processedCommandsPerMessage.has(newMessage)) {
                           processedCommandsPerMessage.set(newMessage, new Set());
                        }

                        if (typingSpeed > 0) {
                            // Typing effect: process commands on each new character to ensure responsiveness
                            for (let i = 0; i < chunk.text.length; i++) {
                                currentDisplayedText += chunk.text[i];
                                await processDynamicCommands(currentDisplayedText, newMessage, characterId); // Process here
                                messageContent.innerHTML = marked.parse(wrapCommandsInSpan(currentDisplayedText), { breaks: true });
                                helpers.messageContainerScrollToBottom();
                                await new Promise(resolve => setTimeout(resolve, typingSpeed));
                            }
                        } else {
                            // No typing effect: process commands as full chunks arrive
                            await processDynamicCommands(fullRawText, newMessage, characterId);
                            messageContent.innerHTML = marked.parse(wrapCommandsInSpan(fullRawText), { breaks: true });
                            helpers.messageContainerScrollToBottom();
                        }
                    }
                }

                // Final processing and rendering after stream ends
                await processDynamicCommands(fullRawText, newMessage, characterId);
                messageContent.innerHTML = marked.parse(wrapCommandsInSpan(fullRawText), { breaks: true });
                helpers.messageContainerScrollToBottom();
                hljs.highlightAll();
                setupMessageEditing(newMessage, db);
                return { HTML: messageContent.innerHTML, md: fullRawText };
            } catch (error) {
                console.error("Stream error:", error);
                // Ensure commands are processed and content is rendered even on error
                await processDynamicCommands(fullRawText, newMessage, characterId);
                messageContent.innerHTML = marked.parse(wrapCommandsInSpan(fullRawText), { breaks: true });
                helpers.messageContainerScrollToBottom();
                hljs.highlightAll();
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
            <div class="message-text">${msg}</div>`;
    }
    hljs.highlightAll();
    setupMessageEditing(newMessage, db);
}