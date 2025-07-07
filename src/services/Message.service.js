//handles sending messages to the api

import { GoogleGenAI } from "@google/genai";
import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";
// We import the Asset Manager Service to use its powerful functions
import { assetManagerService } from "./AssetManager.service.js";


/**
 * Processes a block of hidden commands from the AI's response.
 * @param {string} commandBlock - The string containing commands, e.g., "[avatar:happy] [audio:laugh]"
 * @param {string} personalityId - The ID of the current personality to find the UI card to update.
 */
async function processCommands(commandBlock, personalityId) {
    const settings = settingsService.getSettings();
    const symbols = settings.triggerSymbols;
    if (!commandBlock || !symbols || symbols.length !== 2) return;

    // Create a regular expression to find all commands like [key:value]
    const commandRegex = new RegExp(`\\${symbols[0]}(.*?)\\${symbols[1]}`, 'g');
    const commands = commandBlock.match(commandRegex);

    if (!commands) return;

    for (const command of commands) {
        // Extract the content from between the symbols, e.g., "avatar:happy"
        const content = command.slice(symbols[0].length, -symbols[1].length);
        const [key, ...valueParts] = content.split(':');
        const value = valueParts.join(':').trim();

        if (!key || !value) continue;

        switch (key.trim().toLowerCase()) {
            case 'avatar':
                console.log(`Command Received: Change avatar to tag '${value}'`);
                const imageAsset = await assetManagerService.getAssetByTag('image', value);
                if (imageAsset) {
                    const personalityCardImg = document.querySelector(`#personality-card-${personalityId} .card-personality-image`);
                    if (personalityCardImg) {
                        personalityCardImg.style.opacity = 0;
                        setTimeout(() => {
                            personalityCardImg.src = imageAsset.dataUrl;
                            personalityCardImg.style.opacity = 1;
                        }, 200);
                    }
                }
                break;

            case 'audio':
                console.log(`Command Received: Play audio with tag '${value}'`);
                if (settings.enableAudio) {
                    const audioAsset = await assetManagerService.getAssetByTag('audio', value);
                    if (audioAsset) {
                        playAudio(audioAsset, settings.globalVolume);
                    }
                }
                break;
        }
    }
}

/**
 * Creates and plays an audio element, updating the UI.
 * @param {object} asset - The audio asset object from the database.
 * @param {number} volume - The global volume level (0-100).
 */
function playAudio(asset, volume) {
    const nowPlayingBar = document.querySelector('#now-playing-bar');
    const nowPlayingTrack = document.querySelector('#now-playing-track');
    
    const audio = new Audio(asset.dataUrl);
    audio.volume = volume / 100;

    nowPlayingTrack.textContent = `Now Playing: ${asset.name}`;
    helpers.showElement(nowPlayingBar, 'flex');

    audio.play().catch(e => console.error("Error playing audio:", e));
    
    audio.onended = () => {
        helpers.hideElement(nowPlayingBar);
    };
}


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

    // THIS IS THE LINE THAT FIXES THE CRASH.
    // The library requires the API key to be passed inside an object.
    const genAI = new GoogleGenAI({ apiKey: settings.apiKey });

    const model = genAI.getGenerativeModel({ 
        model: settings.model,
        safetySettings: settings.safetySettings,
        generationConfig: {
            maxOutputTokens: settings.maxTokens,
            temperature: settings.temperature,
        },
        systemInstruction: settingsService.getSystemPrompt()
    });
    
    if (!await chatsService.getCurrentChat(db)) { 
        const titleGenModel = genAI.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
        const result = await titleGenModel.generateContent("You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user's message is: " + msg);
        const title = result.response.text();

        const id = await chatsService.addChat(title, null, db);
        document.querySelector(`#chat${id}`).click();
    }
    await insertMessage("user", msg, null, null, db);
    helpers.messageContainerScrollToBottom();
    
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
    
    if (selectedPersonality.toneExamples && selectedPersonality.toneExamples.length > 0 && selectedPersonality.toneExamples[0]) {
        history.push(
            ...selectedPersonality.toneExamples.map((tone) => {
                return { role: "model", parts: [{ text: tone }] }
            })
        );
    }
    
    const currentChat = await chatsService.getCurrentChat(db);
    if (currentChat && currentChat.content) {
        history.push(
            ...currentChat.content.map((msg) => {
                return { role: msg.role, parts: msg.parts }
            })
        );
    }
    
    const chat = model.startChat({ history });
    
    const result = await chat.sendMessageStream(msg);
    
    const reply = await insertMessage("model", "", selectedPersonality, result.stream, db);
    
    currentChat.content.push({ role: "user", parts: [{ text: msg }] });
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

// ... the rest of the file is unchanged and correct ...

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
        const messageText = messageElement.querySelector(".message-text").innerHTML;
        const rawText = messageText.replace(/<[^>]*>/g, "").trim();
        const currentChat = await chatsService.getCurrentChat(db);
        if (!currentChat || !currentChat.content[messageIndex]) return;
        currentChat.content[messageIndex].parts[0].text = rawText;
        await db.chats.put(currentChat);
        console.log("Message updated in database");
    } catch (error) {
        console.error("Error updating message in database:", error);
        alert("Failed to save your edited message. Please try again.");
    }
}

export async function insertMessage(sender, msg, personality = null, netStream = null, db = null) {
    const newMessage = document.createElement("div");
    newMessage.classList.add("message");
    const messageContainer = document.querySelector(".message-container");
    messageContainer.append(newMessage);

    if (sender != "user") {
        newMessage.classList.add("message-model");
        newMessage.innerHTML = `
            <div class="message-header">
                <img class="pfp" src="${personality?.image || ''}" loading="lazy"></img>
                <h3 class="message-role">${personality?.name || 'Model'}</h3>
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
            try {
                await regenerate(newMessage, db)
            } catch (error) {
                alert("Error: " + error.message);
                console.error(error);
            }
        });
        const messageContent = newMessage.querySelector(".message-text");
        if (!netStream) {
            messageContent.innerHTML = marked.parse(msg);
        } else {
            let rawText = "";
            let visibleText = "";
            let commandBlock = "";
            let responseText = "";

            try {
                for await (const chunk of netStream) {
                     responseText += chunk.text();
                }
                rawText = responseText;

                const settings = settingsService.getSettings();
                const separator = settings.triggerSeparator;

                if (rawText.includes(separator)) {
                    const parts = rawText.split(separator);
                    visibleText = parts[0];
                    commandBlock = parts.slice(1).join(separator);
                } else {
                    visibleText = rawText;
                }
                
                messageContent.innerHTML = marked.parse(visibleText, { breaks: true });
                helpers.messageContainerScrollToBottom();

                if (commandBlock && personality) {
                    await processCommands(commandBlock, personality.id);
                }

                hljs.highlightAll();
                setupMessageEditing(newMessage, db);
                return { HTML: messageContent.innerHTML, md: rawText };
            } catch (error) {
                alert("Error processing response: " + error);
                console.error("Stream error:", error);
                messageContent.innerHTML += "<br><br><span style='color:red;'>An error occurred.</span>";
                return { HTML: messageContent.innerHTML, md: rawText };
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
                <div class="message-text">${helpers.getDecoded(msg)}</div>
                `;
    }
    hljs.highlightAll();
    setupMessageEditing(newMessage, db);
}