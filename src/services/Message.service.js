// FILE: src/services/Message.service.js

import { GoogleGenAI } from "@google/genai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";

const processedCommandsPerMessage = new Map(); // Map<messageElement, Set<fullTagString>>
let characterTagCache = new Set(); // Cache for the current personality's character tags for performance.

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
    
    // Populate character cache for this new chat/personality
    const { assetManagerService } = await import('./AssetManager.service.js');
    const characterTags = await assetManagerService.getAllUniqueTagsForCharacter(selectedPersonality.id);
    characterTagCache = new Set(characterTags.characters);

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

    const stream = await chat.sendMessageStream({ message: messageToSendToAI });
    const reply = await insertMessage("model", "", selectedPersonality.name, stream, db, selectedPersonality.image, settings.typingSpeed, selectedPersonality.id);

    currentChat.content.push({ role: "model", personality: selectedPersonality.name, personalityid: selectedPersonality.id, parts: [{ text: reply.md }] });
    await db.chats.put(currentChat);
    settingsService.saveSettings();
}

async function handleRegenerate(clickedElement, db) {
    const chat = await chatsService.getCurrentChat(db);
    if (!chat) return;

    const elementIndex = parseInt(clickedElement.dataset.messageIndex, 10);
    let textToResend;
    let sliceEndIndex;

    if (clickedElement.classList.contains('message-model')) {
        if (elementIndex === 0) return;
        textToResend = chat.content[elementIndex - 1].parts[0].text;
        sliceEndIndex = elementIndex - 1;
    } else {
        textToResend = chat.content[elementIndex].parts[0].text;
        sliceEndIndex = elementIndex;
    }

    chat.content = chat.content.slice(0, sliceEndIndex);
    await db.chats.put(chat);

    await chatsService.loadChat(chat.id, db);
    await send(textToResend, db);
}

function wrapCommandsInSpan(text) {
    const commandRegex = /\[(.*?)\]/g;
    return text.replace(commandRegex, (fullMatch, contentInsideBrackets) => {
        const escapedContent = `[${contentInsideBrackets}]`;
        return `<span class="command-block">${escapedContent}</span>`;
    });
}

async function executeCommandAction(command, tagsToSearch, messageElement, characterId) {
    if (characterId === null || !tagsToSearch || tagsToSearch.length === 0) return;

    const { assetManagerService } = await import('./AssetManager.service.js');
    const settings = settingsService.getSettings();

    switch (command) {
        case 'avatar':
            try {
                const searchTags = [...new Set([...tagsToSearch, 'avatar'])]; 
                const assets = await assetManagerService.searchAssetsByTags(searchTags, characterId);
                if (assets && assets.length > 0) {
                    const asset = assets[0];
                    const objectURL = URL.createObjectURL(asset.data);

                    const pfpWrapper = messageElement.querySelector('.pfp-wrapper');
                    if (pfpWrapper) {
                        const oldImg = pfpWrapper.querySelector('.pfp');
                        const newImg = document.createElement('img');
                        newImg.src = objectURL;
                        newImg.className = 'pfp';
                        newImg.style.opacity = '0';
                        pfpWrapper.appendChild(newImg);
                        requestAnimationFrame(() => {
                            newImg.style.transition = 'opacity 0.5s ease-in-out';
                            newImg.style.opacity = '1';
                        });
                        setTimeout(() => {
                            if (oldImg && oldImg.parentElement === pfpWrapper) oldImg.remove();
                        }, 500);
                    }

                    const personalityCard = document.querySelector(`#personality-${characterId}`);
                    if (personalityCard) {
                        const cardWrapper = personalityCard.querySelector('.background-img-wrapper');
                        if (cardWrapper) {
                            const oldImg = cardWrapper.querySelector('.background-img');
                            const newImg = document.createElement('img');
                            newImg.src = objectURL;
                            newImg.className = 'background-img';
                            newImg.style.opacity = '0';
                            cardWrapper.appendChild(newImg);
                            requestAnimationFrame(() => {
                                newImg.style.transition = 'opacity 0.5s ease-in-out';
                                newImg.style.opacity = '1';
                            });
                            setTimeout(() => {
                                if (oldImg && oldImg.parentElement === cardWrapper) oldImg.remove();
                            }, 500);
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
                    const searchTags = [...new Set([...tagsToSearch, 'audio'])];
                    const assets = await assetManagerService.searchAssetsByTags(searchTags, characterId);
                    if (assets && assets.length > 0) {
                        const asset = assets[0];
                        const objectURL = URL.createObjectURL(asset.data);
                        const audio = new Audio(objectURL);
                        audio.volume = settings.audio.volume;
                        audio.play().catch(e => console.error("Audio playback failed:", e));
                        audio.onended = () => URL.revokeObjectURL(objectURL);
                        audio.onerror = () => {
                            console.error(`Failed to load audio for command [${command}:${tagsToSearch.join(',')}]:`, objectURL);
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

    const commandRegex = /\[(?:(.*?):)?(.*?)\]/g;
    let match;

    if (!processedCommandsPerMessage.has(messageElement)) {
        processedCommandsPerMessage.set(messageElement, new Set());
    }
    const processedTags = processedCommandsPerMessage.get(messageElement);

    commandRegex.lastIndex = 0;
    while ((match = commandRegex.exec(currentText)) !== null) {
        const fullTagString = match[0];

        if (!processedTags.has(fullTagString)) {
            const command = (match[1] || 'avatar').trim().toLowerCase();
            const valueString = match[2].trim();
            const tagsFromAI = valueString.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
            
            const mappedTags = tagsFromAI.map(tag => {
                const prefixedTag = `char_${tag}`;
                return characterTagCache.has(prefixedTag) ? prefixedTag : tag;
            });
            
            if (command && mappedTags.length > 0) {
                await executeCommandAction(command, mappedTags, messageElement, characterId);
                processedTags.add(fullTagString);
            }
        }
    }
}

function setupMessageEditing(messageElement, db) {
    const editButton = messageElement.querySelector('.btn-edit');
    const saveButton = messageElement.querySelector('.btn-save');
    const deleteButton = messageElement.querySelector('.btn-delete');
    const refreshButton = messageElement.querySelector('.btn-refresh');
    const replayButton = messageElement.querySelector('.btn-replay'); // New button
    const messageTextDiv = messageElement.querySelector('.message-text');

    if (!messageTextDiv) return;

    // Edit and Save Logic
    if (editButton && saveButton) {
        editButton.addEventListener('click', async () => {
            const index = parseInt(messageElement.dataset.messageIndex, 10);
            const currentChat = await chatsService.getCurrentChat(db);
            const originalRawText = currentChat.content[index]?.parts[0]?.text;

            messageTextDiv.textContent = originalRawText || messageTextDiv.innerText;
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

        // MODIFIED: Save button now just saves and updates visuals, no replay.
        saveButton.addEventListener('click', async () => {
            messageTextDiv.removeAttribute("contenteditable");
            const newRawText = messageTextDiv.innerText;
            const index = parseInt(messageElement.dataset.messageIndex, 10);

            await updateMessageInDatabase(index, newRawText, db);

            // Just update the display with the new rendered markdown.
            const newHtml = marked.parse(wrapCommandsInSpan(newRawText), { breaks: true });
            messageTextDiv.innerHTML = newHtml;
            hljs.highlightAll(); // Re-apply syntax highlighting

            editButton.style.display = 'inline-block';
            saveButton.style.display = 'none';
        });
    }
    
    // NEW: Replay Button Logic
    if (replayButton) {
        replayButton.addEventListener('click', async () => {
            const index = parseInt(messageElement.dataset.messageIndex, 10);
            const chat = await chatsService.getCurrentChat(db);
            const messageData = chat.content[index];

            if (!messageData) {
                console.error("Could not find message data to replay for index:", index);
                return;
            }

            const rawTextToReplay = messageData.parts[0].text;
            const characterId = messageData?.personalityid;
            const sender = messageData?.role;

            if (characterId) {
                const { assetManagerService } = await import('./AssetManager.service.js');
                const characterTags = await assetManagerService.getAllUniqueTagsForCharacter(characterId);
                characterTagCache = new Set(characterTags.characters);
            }

            const settings = settingsService.getSettings();
            await retypeMessage(messageElement, rawTextToReplay, characterId, settings.typingSpeed, sender);
        });
    }

    if (deleteButton) {
        deleteButton.addEventListener('click', async () => {
            if (!confirm("Are you sure you want to delete this message? This action cannot be undone.")) {
                return;
            }

            const chatId = chatsService.getCurrentChatId();
            const indexToDelete = parseInt(messageElement.dataset.messageIndex, 10);

            const success = await chatsService.deleteMessage(chatId, indexToDelete, db);

            if (success) {
                messageElement.remove();
                const messageContainer = document.querySelector(".message-container");
                const allMessages = messageContainer.querySelectorAll('.message');
                allMessages.forEach((msgEl, newIndex) => {
                    msgEl.dataset.messageIndex = newIndex;
                });
            } else {
                alert("Failed to delete the message. Please check the console for errors.");
            }
        });
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", async () => {
            try {
                await handleRegenerate(messageElement, db);
            } catch (error) {
                console.error(error);
                alert("Error during regeneration.");
            }
        });
    }
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

async function retypeMessage(messageElement, newRawText, characterId, typingSpeed, sender) {
    const messageContent = messageElement.querySelector(".message-text");
    if (!messageContent) return;

    let currentDisplayedText = "";
    messageContent.innerHTML = "";

    if (processedCommandsPerMessage.has(messageElement)) {
        processedCommandsPerMessage.get(messageElement).clear();
    }

    if (typingSpeed > 0 && sender !== "user") {
        for (let i = 0; i < newRawText.length; i++) {
            currentDisplayedText += newRawText[i];
            await processDynamicCommands(currentDisplayedText, messageElement, characterId);
            messageContent.innerHTML = marked.parse(wrapCommandsInSpan(currentDisplayedText), { breaks: true });
            helpers.messageContainerScrollToBottom();
            await new Promise(resolve => setTimeout(resolve, typingSpeed));
        }
    } else {
        await processDynamicCommands(newRawText, messageElement, characterId);
        messageContent.innerHTML = marked.parse(wrapCommandsInSpan(newRawText), { breaks: true });
        helpers.messageContainerScrollToBottom();
    }

    await processDynamicCommands(newRawText, messageElement, characterId);
    messageContent.innerHTML = marked.parse(wrapCommandsInSpan(newRawText), { breaks: true });
    hljs.highlightAll();
}

export async function insertMessage(sender, msg, selectedPersonalityTitle = null, netStream = null, db = null, pfpSrc = null, typingSpeed = 0, characterId = null) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    const messageContainer = document.querySelector(".message-container");
    const messageIndex = messageContainer.children.length;
    newMessage.dataset.messageIndex = messageIndex;
    messageContainer.append(newMessage);

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
                    <button class="btn-replay btn-textual material-symbols-outlined">replay</button>
                    <button class="btn-delete btn-textual material-symbols-outlined">delete</button>
                    <button class="btn-refresh btn-textual material-symbols-outlined">refresh</button>
                </div>
            </div>
            <div class="message-role-api" style="display: none;">${sender}</div>
            <div class="message-text"></div>`;

        const pfpElement = newMessage.querySelector('.pfp');
        if (pfpElement && pfpSrc) {
            requestAnimationFrame(() => {
                pfpElement.src = pfpSrc;
                pfpElement.onerror = () => {
                    console.error("Failed to load initial personality avatar:", pfpSrc);
                    pfpElement.src = './assets/default_avatar.png';
                };
            });
        }
        
        const messageContent = newMessage.querySelector(".message-text");

        if (!netStream) {
            messageContent.innerHTML = marked.parse(wrapCommandsInSpan(msg), { breaks: true });
            if (characterId !== null) {
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
    } else { // User message
        newMessage.innerHTML = `
            <div class="message-header">
                <h3 class="message-role">You:</h3>
                <div class="message-actions">
                    <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                    <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    <button class="btn-replay btn-textual material-symbols-outlined">play_arrow</button>
                    <button class="btn-delete btn-textual material-symbols-outlined">delete</button>
                    <button class="btn-refresh btn-textual material-symbols-outlined">refresh</button>
                </div>
            </div>
            <div class="message-role-api" style="display: none;">${sender}</div>
            <div class="message-text">${marked.parse(msg, { breaks: true })}</div>`;
    }
    hljs.highlightAll();
    setupMessageEditing(newMessage, db);
    return newMessage;
}