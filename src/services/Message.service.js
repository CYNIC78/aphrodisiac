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

    const stream = await chat.sendMessageStream({ message: messageToSendToAI });
    const reply = await insertMessage("model", "", selectedPersonality.name, stream, db, selectedPersonality.image, settings.typingSpeed, selectedPersonality.id);

    currentChat.content.push({ role: "model", personality: selectedPersonality.name, personalityid: selectedPersonality.id, parts: [{ text: reply.md }] });
    await db.chats.put(currentChat);
    settingsService.saveSettings();
}

// NEW: Generalized function to handle regeneration from user or model messages
async function handleRegenerate(clickedElement, db) {
    const chat = await chatsService.getCurrentChat(db);
    if (!chat) return;

    const elementIndex = parseInt(clickedElement.dataset.messageIndex, 10);
    let textToResend;
    let sliceEndIndex;

    if (clickedElement.classList.contains('message-model')) {
        // Clicked on AI message: resend the user message *before* it.
        if (elementIndex === 0) return; // Cannot regenerate from the first AI message if there's no user message before it.
        textToResend = chat.content[elementIndex - 1].parts[0].text;
        sliceEndIndex = elementIndex - 1;
    } else {
        // Clicked on User message: resend this message.
        textToResend = chat.content[elementIndex].parts[0].text;
        sliceEndIndex = elementIndex;
    }

    // Truncate the chat history to the point before the message we're regenerating from.
    chat.content = chat.content.slice(0, sliceEndIndex);
    await db.chats.put(chat);

    // Visually reload the chat to the truncated state, then send the message to get a new response.
    await chatsService.loadChat(chat.id, db);
    await send(textToResend, db);
}


// Helper function to escape special characters for use in a regular expression.
// (Already there, but making sure it's present)
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

function wrapCommandsInSpan(text) {
    // The regex for finding the commands remains the same, as it correctly identifies both forms.
    const commandRegex = /\[(\S+)\]/g;

    // This replacement will capture the content inside the brackets (e.g., "happy" or "sfx:sigh").
    // It then reconstructs the string using the HTML entities for square brackets
    // inside our command-block span. This tells Markdown to treat it as literal text.
    return text.replace(commandRegex, (fullMatch, contentInsideBrackets) => {
        // fullMatch will be something like "[happy]" or "[sfx:sigh]"
        // contentInsideBrackets will be "happy" or "sfx:sigh"

        // Reconstruct the content with HTML entities for the brackets
        const escapedContent = `[${contentInsideBrackets}]`;
        
        // Wrap this escaped content in our command-block span.
        return `<span class="command-block">${escapedContent}</span>`;
    });
}




async function executeCommandAction(command, tagsToSearch, messageElement, characterId) {
    // Add checks for valid input tags
    if (characterId === null || !tagsToSearch || tagsToSearch.length === 0) return;

    const { assetManagerService } = await import('./AssetManager.service.js');
    const settings = settingsService.getSettings();

    switch (command) {
        case 'avatar':
            try {
                // Combine the incoming tags with the 'avatar' system tag for search
                // Use a Set to avoid duplicate tags if 'avatar' is somehow in tagsToSearch
                const searchTags = [...new Set([...tagsToSearch, 'avatar'])]; 
                const assets = await assetManagerService.searchAssetsByTags(searchTags, characterId);
                if (assets && assets.length > 0) {
                    const asset = assets[0]; // Take the first matching asset
                    const objectURL = URL.createObjectURL(asset.data);

                    // ... (rest of your existing avatar display logic here) ...
                    // All the pfpWrapper and personalityCard image update logic
                    // should remain exactly as it is.
                    // The `asset` and `objectURL` are correctly defined above.

                    const pfpWrapper = messageElement.querySelector('.pfp-wrapper');
                    if (pfpWrapper) {
                        const oldImg = pfpWrapper.querySelector('.pfp');
                        const newImg = document.createElement('img');
                        newImg.src = objectURL;
                        newImg.className = 'pfp';
                        newImg.style.opacity = '0';
                        newImg.onerror = () => {
                            console.error(`Failed to load avatar for command [avatar:${tagsToSearch.join(',')}]:`, objectURL);
                            newImg.src = './assets/default_avatar.png';
                            newImg.style.opacity = '1';
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

                    const personalityCard = document.querySelector(`#personality-${characterId}`);
                    if (personalityCard) {
                        const cardWrapper = personalityCard.querySelector('.background-img-wrapper');
                        if (cardWrapper) {
                            const oldImg = cardWrapper.querySelector('.background-img');
                            const newImg = document.createElement('img');
                            newImg.src = objectURL;
                            newImg.className = 'background-img';
                            newImg.style.opacity = '0';
                            newImg.onerror = () => {
                                console.error(`Failed to load sidebar avatar for command [avatar:${tagsToSearch.join(',')}]:`, objectURL);
                                newImg.src = './assets/default_avatar.png';
                                newImg.style.opacity = '1';
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
                                img.onerror = () => {
                                    console.error(`Failed to load sidebar avatar for command [avatar:${tagsToSearch.join(',')}]:`, objectURL);
                                    img.src = './assets/default_avatar.png';
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
                    // Combine the incoming tags with the 'audio' system tag for search
                    const searchTags = [...new Set([...tagsToSearch, 'audio'])]; // Added 'audio' for robustness
                    const assets = await assetManagerService.searchAssetsByTags(searchTags, characterId);
                    if (assets && assets.length > 0) {
                        const asset = assets[0]; // Take the first matching asset
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

    // This new regex is the key. It captures two groups:
    // 1. An optional command followed by a colon (e.g., "sfx:").
    // 2. The main value/trigger (e.g., "happy" or "sigh").
    // This allows it to match both [sfx:sigh] and [happy].
    const commandRegex = /\[(?:(.*?):)?(.*?)\]/g;
    let match;

    if (!processedCommandsPerMessage.has(messageElement)) {
        processedCommandsPerMessage.set(messageElement, new Set());
    }
    const processedTags = processedCommandsPerMessage.get(messageElement);

    commandRegex.lastIndex = 0; // Reset regex state before each execution
    while ((match = commandRegex.exec(currentText)) !== null) {
        const fullTagString = match[0];

        if (!processedTags.has(fullTagString)) {
            // If group 1 (the command) exists, use it. Otherwise, default to "avatar".
            const command = (match[1] || 'avatar').trim().toLowerCase();
            const valueString = match[2].trim(); // Get the raw value string (e.g., "emily,happy")

            // Split the value string by comma, trim each part, and filter out any empty strings
            const tagsArray = valueString.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
            
            if (command && tagsArray.length > 0) { // Ensure we have an actual command type and at least one tag
                await executeCommandAction(command, tagsArray, messageElement, characterId); // Pass the array of tags
                processedTags.add(fullTagString);
            }
        }
    }
}






function setupMessageEditing(messageElement, db) {
    const editButton = messageElement.querySelector('.btn-edit');
    const saveButton = messageElement.querySelector('.btn-save');
    const deleteButton = messageElement.querySelector('.btn-delete');
    const refreshButton = messageElement.querySelector('.btn-refresh'); // NEW
    const messageTextDiv = messageElement.querySelector('.message-text');

    if (!messageTextDiv) return;

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

        saveButton.addEventListener('click', async () => {
            messageTextDiv.removeAttribute("contenteditable");
            const newRawText = messageTextDiv.innerText;
            const index = parseInt(messageElement.dataset.messageIndex, 10);

            await updateMessageInDatabase(index, newRawText, db);

            const chat = await chatsService.getCurrentChat(db);
            const messageData = chat.content[index];
            const characterId = messageData?.personalityid;
            const sender = messageData?.role;

            const settings = settingsService.getSettings();
            await retypeMessage(messageElement, newRawText, characterId, settings.typingSpeed, sender);

            editButton.style.display = 'inline-block';
            saveButton.style.display = 'none';
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

    // Attach listener for the refresh button if it exists
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