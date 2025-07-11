--- START OF FILE Message.service.js ---

// FILE: src/services/Message.service.js

//handles sending messages to the api

import { GoogleGenAI } from "@google/genai"
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js"; // THIS LINE IS CORRECTED BACK
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";
// NO AssetManager import here. It is loaded on-demand.

// Store processed commands per message to avoid re-triggering during dynamic rendering
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

    // Assemble the complete instruction set for the AI.
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

    // Inject this master instruction into the chat history.
    const history = [
        { role: "user", parts: [{ text: masterInstruction }] },
        { role: "model", parts: [{ text: "Understood. I will now act as the specified character and use my command tags as instructed." }] }
    ];

    if (selectedPersonality.toneExamples && selectedPersonality.toneExamples.length > 0 && selectedPersonality.toneExamples[0]) {
        history.push(...selectedPersonality.toneExamples.map(tone => ({ role: "model", parts: [{ text: tone }] })));
    }

    // Add the rest of the chat history, excluding the very last message (which is the one we're sending).
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
    const message = responseElement.previousElementSibling.querySelector(".message-text").textContent; // This gets the visible text + hidden span text
    const elementIndex = [...responseElement.parentElement.children].indexOf(responseElement);
    const chat = await chatsService.getCurrentChat(db);
    chat.content = chat.content.slice(0, elementIndex - 1); // Slice before the user message that led to this response
    await db.chats.put(chat);
    await chatsService.loadChat(chat.id, db); // Reload chat to ensure UI is consistent
    await send(message, db); // Send the original user message again
}

// --- NEW: Utility to wrap commands in spans for display ---
function wrapCommandsInSpan(text) {
    const commandRegex = /\[(.*?):(.*?)]/g; // Matches [command:value]
    return text.replace(commandRegex, `<span class="command-block">$&</span>`);
}

// --- NEW: Helper to execute a single command action ---
async function executeCommandAction(command, value, messageElement, characterId) {
    if (characterId === null) return;
    const { assetManagerService } = await import('./AssetManager.service.js');
    const settings = settingsService.getSettings();

    switch (command) {
        case 'avatar':
            try {
                const assets = await assetManagerService.searchAssetsByTags([value, 'avatar'], characterId);
                if (assets && assets.length > 0) {
                    const asset = assets[0];
                    const objectURL = URL.createObjectURL(asset.data);

                    // --- Update Message PFP with Smooth Transition ---
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
                            setTimeout(() => URL.revokeObjectURL(objectURL), 750); // Defer revoking
                        };
                        tempImage.onerror = () => {
                            console.error("Failed to load new avatar image for message:", objectURL);
                            URL.revokeObjectURL(objectURL);
                        };
                    }

                    // --- Update Sidebar Personality Card with Smooth Transition ---
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
}

// --- NEW: Dynamic command processing during streaming ---
async function processDynamicCommands(currentText, messageElement, characterId) {
    if (characterId === null) return;
    const commandRegex = /\[(.*?):(.*?)]/g; // Matches [command:value]
    let match;

    // Initialize a Set for this message element if it doesn't exist
    if (!processedCommandsPerMessage.has(messageElement)) {
        processedCommandsPerMessage.set(messageElement, new Set());
    }
    const processedTags = processedCommandsPerMessage.get(messageElement);

    // Reset regex lastIndex to search from the beginning of the accumulating text
    commandRegex.lastIndex = 0;
    while ((match = commandRegex.exec(currentText)) !== null) {
        const fullTagString = match[0]; // e.g., "[avatar:happy]"
        const command = match[1].trim().toLowerCase(); // e.g., "avatar"
        const value = match[2].trim(); // e.g., "happy"

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

    // Get the message index from the DOM, or set it if not present (for new messages)
    // For loaded messages, the data-message-index is set in insertMessage
    const messageContainer = document.querySelector(".message-container");
    const messageIndex = Array.from(messageContainer.children).indexOf(messageElement);
    messageElement.dataset.messageIndex = messageIndex;

    editButton.addEventListener('click', async () => {
        // Retrieve the ORIGINAL raw text from the database to ensure all hidden commands are visible for editing
        const index = parseInt(messageElement.dataset.messageIndex, 10);
        const currentChat = await chatsService.getCurrentChat(db);
        const originalRawText = currentChat.content[index]?.parts[0]?.text;

        if (originalRawText) {
            messageTextDiv.textContent = originalRawText; // Use textContent to ensure all content (including spans) is replaced with raw text
        } else {
            // Fallback for user messages or if DB text is somehow missing
            messageTextDiv.textContent = messageTextDiv.innerText;
        }

        messageTextDiv.setAttribute("contenteditable", "true");
        messageTextDiv.focus();

        // Position caret at the end
        const range = document.createRange();
        range.selectNodeContents(messageTextDiv);
        range.collapse(false); // false for end of content
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);

        editButton.style.display = 'none';
        saveButton.style.display = 'inline-block';
    });

    saveButton.addEventListener('click', async () => {
        messageTextDiv.removeAttribute("contenteditable");
        const newRawText = messageTextDiv.innerText; // Get the clean text, including any re-entered commands.
        const index = parseInt(messageElement.dataset.messageIndex, 10);

        await updateMessageInDatabase(index, newRawText, db);

        // Re-render the message content using wrapCommandsInSpan for display
        messageTextDiv.innerHTML = marked.parse(wrapCommandsInSpan(newRawText), { breaks: true });

        // IMPORTANT: Clear previously processed commands for this message element
        // This ensures if the user edited and changed a command, it gets re-evaluated.
        if (processedCommandsPerMessage.has(messageElement)) {
            processedCommandsPerMessage.get(messageElement).clear();
        }

        // Re-process commands from the saved text for immediate effect (e.g., if avatar tag changed)
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

        // Ensure the text in the DB is always the raw, original text (no HTML)
        currentChat.content[messageIndex].parts[0].text = newRawText; // Save the new raw text directly
        await db.chats.put(currentChat);
    } catch (error) { console.error("Error updating message in database:", error); }
}


export async function insertMessage(sender, msg, selectedPersonalityTitle = null, netStream = null, db = null, pfpSrc = null, typingSpeed = 0, characterId = null) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);

    // Set a data attribute for the message index as soon as it's added to the DOM
    newMessage.dataset.messageIndex = Array.from(messageContainer.children).indexOf(newMessage);


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
            // Loading Path: Display the full raw message (commands are wrapped for hiding).
            // Do NOT re-execute commands from history load for SFX/avatar changes, only display.
            messageContent.innerHTML = marked.parse(wrapCommandsInSpan(msg), { breaks: true });
        } else {
            // Live Path: Stream and dynamically process commands.
            let fullRawText = "";
            let currentDisplayedText = ""; // To accumulate text character by character for typing effect

            try {
                for await (const chunk of netStream) {
                    if (chunk && chunk.text) {
                        fullRawText += chunk.text; // Accumulate full text for command processing and final save

                        // Process commands dynamically as they arrive, using the fullRawText
                        if (!processedCommandsPerMessage.has(newMessage)) {
                           processedCommandsPerMessage.set(newMessage, new Set());
                        }
                        await processDynamicCommands(fullRawText, newMessage, characterId);

                        // --- Character-by-character typing display for the current chunk ---
                        if (typingSpeed > 0) {
                            for (let i = 0; i < chunk.text.length; i++) {
                                currentDisplayedText += chunk.text[i]; // Add one character at a time
                                // Render the text, wrapping any commands in spans
                                messageContent.innerHTML = marked.parse(wrapCommandsInSpan(currentDisplayedText), { breaks: true });
                                helpers.messageContainerScrollToBottom();
                                await new Promise(resolve => setTimeout(resolve, typingSpeed));
                            }
                        } else {
                            // If no typing speed, just render the current accumulated full raw text
                            messageContent.innerHTML = marked.parse(wrapCommandsInSpan(fullRawText), { breaks: true });
                            helpers.messageContainerScrollToBottom();
                        }
                    }
                }

                // Final render after stream completes (ensure any last chars and commands are displayed/processed)
                messageContent.innerHTML = marked.parse(wrapCommandsInSpan(fullRawText), { breaks: true });
                helpers.messageContainerScrollToBottom();
                hljs.highlightAll(); // Highlight code blocks if any
                setupMessageEditing(newMessage, db);
                return { HTML: messageContent.innerHTML, md: fullRawText }; // Return full raw text for saving to DB
            } catch (error) {
                console.error("Stream error:", error);
                messageContent.innerHTML = marked.parse(wrapCommandsInSpan(fullRawText), { breaks: true });
                helpers.messageContainerScrollToBottom();
                hljs.highlightAll();
                setupMessageEditing(newMessage, db);
                return { HTML: messageContent.innerHTML, md: fullRawText };
            }
        }
    } else {
        // User message
        newMessage.innerHTML = `
                <div class="message-header">
                    <h3 class="message-role">You:</h3>
                    <div class="message-actions">
                        <button class="btn-edit btn-textual material-symbols-outlined">edit</button>
                        <button class="btn-save btn-textual material-symbols-outlined" style="display: none;">save</button>
                    </div>
                </div>
                <div class="message-role-api" style="display: none;">${sender}</div>
                <div class="message-text">${msg}</div>`; // Use msg directly as it's already decoded and clean
    }
    hljs.highlightAll();
    setupMessageEditing(newMessage, db);
}
--- END OF FILE Message.service.js ---