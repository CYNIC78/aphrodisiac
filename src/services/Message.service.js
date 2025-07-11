// FILE: src/services/Message.service.js

import { GoogleGenAI } from "@google/genai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";
// NEW: Import the centralized avatar retrieval function
import { getPersonalityAvatarUrl } from "./Personality.service.js";

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

    const reply = await chat.sendMessageStream({ message: messageToSendToAI });
    const fullReply = await insertMessage("model", "", selectedPersonality.name, reply, db, selectedPersonality, settings.typingSpeed, selectedPersonality.id);


    currentChat.content.push({ role: "model", personality: selectedPersonality.name, personalityid: selectedPersonality.id, parts: [{ text: fullReply.md }] });
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
    const { assetManagerService } = await import('./AssetManager.service.js');
    const settings = settingsService.getSettings();

    switch (command) {
        case 'avatar':
            try {
                const personality = await personalityService.get(characterId);
                if (!personality) {
                    console.warn(`Personality with ID ${characterId} not found for avatar command.`);
                    return;
                }
                const avatarObjectUrl = await getPersonalityAvatarUrl(personality);

                if (avatarObjectUrl) {
                    console.log(`[DEBUG - M.service] Received avatar URL (from command):`, avatarObjectUrl);
                    console.log(`[DEBUG - M.service] Is it a blob URL?`, avatarObjectUrl.startsWith('blob:'));
                    
                    // Crossfade avatar in message
                    const pfpWrapper = messageElement.querySelector('.pfp-wrapper');
                    if (pfpWrapper) {
                        const oldImg = pfpWrapper.querySelector('.pfp');
                        const newImg = document.createElement('img');
                        newImg.className = 'pfp';
                        newImg.style.opacity = '0';
                        pfpWrapper.appendChild(newImg);
                        // Assign src after appending to ensure it's in the DOM
                        requestAnimationFrame(() => {
                             newImg.src = avatarObjectUrl;
                             newImg.style.transition = 'opacity 0.5s ease-in-out';
                             newImg.style.opacity = '1';
                        });
                        setTimeout(() => {
                            if (oldImg && oldImg.parentElement === pfpWrapper) oldImg.remove();
                        }, 500);
                    }

                    // Crossfade avatar in sidebar
                    const personalityCard = document.querySelector(`#personality-${characterId}`);
                    if (personalityCard) {
                        const cardWrapper = personalityCard.querySelector('.background-img-wrapper');
                        if (cardWrapper) {
                            const oldImg = cardWrapper.querySelector('.background-img');
                            const newImg = document.createElement('img');
                            newImg.className = 'background-img';
                            newImg.style.opacity = '0';
                            cardWrapper.appendChild(newImg);
                            // Assign src after appending to ensure it's in the DOM
                            requestAnimationFrame(() => {
                                newImg.src = avatarObjectUrl;
                                newImg.style.transition = 'opacity 0.5s ease-in-out';
                                newImg.style.opacity = '1';
                            });
                            setTimeout(() => {
                                if (oldImg && oldImg.parentElement === cardWrapper) oldImg.remove();
                            }, 500);
                        } else {
                            // Fallback if no wrapper, directly set src (less ideal for crossfade)
                            const img = personalityCard.querySelector('.background-img');
                            if (img) {
                                img.src = avatarObjectUrl;
                            }
                        }
                    }
                } else {
                    console.warn(`[DEBUG - M.service] getPersonalityAvatarUrl returned no valid URL for ${personality.name} (ID: ${characterId}) for avatar command.`);
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
                        const objectURL = await assetManagerService.getAssetObjectUrl(asset.id); // Use centralized getter
                        if (objectURL) {
                            const audio = new Audio(objectURL);
                            audio.volume = settings.audio.volume;
                            audio.play().catch(e => console.error("Audio playback failed:", e));
                            // No revoke here; AssetManagerService manages it.
                        } else {
                             console.warn(`[DEBUG - M.service] No valid audio URL for asset ID: ${asset.id}`);
                        }
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

        messageTextDiv.innerHTML = marked.parse(wrapCommandsInSpan(newRawText), { breaks: true });

        if (processedCommandsPerMessage.has(messageElement)) {
            processedCommandsPerMessage.get(messageElement).clear();
        }

        const chat = await chatsService.getCurrentChat(db);
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

export async function insertMessage(sender, msg, selectedPersonalityTitle = null, netStream = null, db = null, personalityOrPfpSrc = null, typingSpeed = 0, characterId = null) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    const messageContainer = document.querySelector(".message-container");
    // Append the new message element to the DOM first
    messageContainer.append(newMessage); // <--- Appended BEFORE setting avatar src

    newMessage.dataset.messageIndex = Array.from(messageContainer.children).indexOf(newMessage);

    if (sender != "user") {
        let avatarUrl = '';
        if (typeof personalityOrPfpSrc === 'object' && personalityOrPfpSrc !== null) {
            avatarUrl = await getPersonalityAvatarUrl(personalityOrPfpSrc);
        } else if (typeof personalityOrPfpSrc === 'string') {
            avatarUrl = personalityOrPfpSrc;
        } else {
            avatarUrl = "/media/default/images/placeholder.png";
        }

        newMessage.classList.add("message-model");
        newMessage.innerHTML = `
            <div class="message-header">
                <div class="pfp-wrapper">
                    <img class="pfp" loading="lazy" />  <!-- REMOVED src="${avatarUrl}" -->
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

        // NOW assign the src after the element is in the DOM tree, using requestAnimationFrame
        const pfpImg = newMessage.querySelector('.pfp');
        if (pfpImg && avatarUrl) {
            requestAnimationFrame(() => {
                pfpImg.src = avatarUrl;
            });
        }

        const refreshButton = newMessage.querySelector(".btn-refresh");
        refreshButton.addEventListener("click", async () => {
            try { await regenerate(newMessage, db) } catch (error) { console.error(error); alert("Error during regeneration."); }
        });

        const messageContent = newMessage.querySelector(".message-text");

        if (!netStream) {
            messageContent.innerHTML = marked.parse(wrapCommandsInSpan(msg), { breaks: true });
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
                            for (let i = 0; i < chunk.text.length; i++) {
                                currentDisplayedText += chunk.text[i];

                                await processDynamicCommands(currentDisplayedText, newMessage, characterId);

                                messageContent.innerHTML = marked.parse(wrapCommandsInSpan(currentDisplayedText), { breaks: true });
                                helpers.messageContainerScrollToBottom();
                                await new Promise(resolve => setTimeout(resolve, typingSpeed));
                            }
                        } else {
                            await processDynamicCommands(fullRawText, newMessage, characterId);
                            messageContent.innerHTML = marked.parse(wrapCommandsInSpan(fullRawText), { breaks: true });
                            helpers.messageContainerScrollToBottom();
                        }
                    }
                }

                await processDynamicCommands(fullRawText, newMessage, characterId);
                messageContent.innerHTML = marked.parse(wrapCommandsInSpan(fullRawText), { breaks: true });
                helpers.messageContainerScrollToBottom();
                hljs.highlightAll();
                setupMessageEditing(newMessage, db);
                return { HTML: messageContent.innerHTML, md: fullRawText };
            } catch (error) {
                console.error("Stream error:", error);
                await processDynamicCommands(fullRawText, newMessage, characterId);
                messageContent.innerHTML = marked.parse(wrapCommandsInSpan(fullRawText), { breaks: true });
                helpers.messageContainerScrollToBottom();
                hljs.highlightAll();
                setupMessageEditing(newMessage, db);
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
            <div class="message-text">${msg}</div>`;
    }
    hljs.highlightAll();
    setupMessageEditing(newMessage, db);
}