// FILE: src/services/Message.service.js

import { GoogleGenAI } from "@google/genai";
import * as settingsService from "./Settings.service.js";
import * as personalityService from "./Personality.service.js";
import * as chatsService from "./Chats.service.js";
import * as helpers from "../utils/helpers.js";
import * as visualService from "./Visual.service.js"; // Импортируем новый сервис

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

    // Генерация заголовка чата (если новый)
    if (!await chatsService.getCurrentChat(db)) {
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-1.5-flash', // Используем 1.5 Flash для скорости
                contents: "You are to act as a generator for chat titles. The user will send a query - you must generate a title for the chat based on it. Only reply with the short title, nothing else. The user's message is: " + msg,
            });
            const title = response.text;
            const id = await chatsService.addChat(title, null, db);
            document.querySelector(`#chat${id}`).click();
        } catch (e) {
            console.error("Title generation failed, using default", e);
            const id = await chatsService.addChat("New Chat", null, db);
            document.querySelector(`#chat${id}`).click();
        }
    }
    
    // 1. Инициализируем кэш тегов в Visual Service
    const { assetManagerService } = await import('./AssetManager.service.js');
    const characterTags = await assetManagerService.getAllUniqueTagsForCharacter(selectedPersonality.id);
    visualService.setCharacterTagCache(characterTags.characters);

    await insertMessage("user", msg, null, null, db);

    const currentChat = await chatsService.getCurrentChat(db);
    currentChat.content.push({ role: "user", parts: [{ text: msg }] });
    await db.chats.put(currentChat);

    helpers.messageContainerScrollToBottom();

    // 2. Улучшенная структура промпта (Правила -> Лор -> Персонаж)
    const masterInstruction = `
        ${settingsService.getSystemPrompt()}

        ---
        TAG PROMPT (Technical rules):
        ${selectedPersonality.tagPrompt || 'Use command tags like [smile] or [angry] inside your text to express emotions.'}
        
        ---
        CHARACTER PROMPT (Who you are):
        ${selectedPersonality.prompt}
    `.trim();

    // 3. Формируем историю с ОГРАНИЧЕНИЕМ (Fix Quota Limit)
    // Берем только последние 20 сообщений, чтобы не перегружать контекст
    const MAX_HISTORY = 20; 
    const recentMessages = currentChat.content.slice(0, -1).slice(-MAX_HISTORY);

    const history = [
        { role: "user", parts: [{ text: masterInstruction }] },
        { role: "model", parts: [{ text: "Understood. I am ready." }] }
    ];

    // Добавляем примеры тона
    if (selectedPersonality.toneExamples && selectedPersonality.toneExamples.length > 0 && selectedPersonality.toneExamples[0]) {
        history.push(...selectedPersonality.toneExamples.map(tone => ({ role: "model", parts: [{ text: tone }] })));
    }

    // Добавляем историю чата
    history.push(...recentMessages.map(msg => ({ role: msg.role, parts: msg.parts })));

    // Создаем чат
    const chat = ai.chats.create({ model: settings.model, history, config });

    let messageToSendToAI = msg;
    if (selectedPersonality.reminder) {
        messageToSendToAI += `\n\nSYSTEM REMINDER: ${selectedPersonality.reminder}`;
    }

    try {
        const stream = await chat.sendMessageStream({ message: messageToSendToAI });
        // Передаем поток в insertMessage, который теперь использует visualService
        const reply = await insertMessage("model", "", selectedPersonality.name, stream, db, selectedPersonality.image, settings.typingSpeed, selectedPersonality.id);

        currentChat.content.push({ role: "model", personality: selectedPersonality.name, personalityid: selectedPersonality.id, parts: [{ text: reply.md }] });
        await db.chats.put(currentChat);
        settingsService.saveSettings();
    } catch (error) {
        console.error("Gemini API Error:", error);
        alert("Error sending message to AI. Check console or Quota.");
    }
}

async function handleRegenerate(clickedElement, db) {
    const chat = await chatsService.getCurrentChat(db);
    if (!chat) return;

    const elementIndex = parseInt(clickedElement.dataset.messageIndex, 10);
    let textToResend;
    let sliceEndIndex;

    if (clickedElement.classList.contains('message-model')) {
        if (elementIndex === 0) return;
        // Регенерируем ответ на предыдущее сообщение юзера
        textToResend = chat.content[elementIndex - 1].parts[0].text;
        sliceEndIndex = elementIndex - 1;
    } else {
        // Регенерируем ответ на ЭТО сообщение юзера
        textToResend = chat.content[elementIndex].parts[0].text;
        sliceEndIndex = elementIndex;
    }

    chat.content = chat.content.slice(0, sliceEndIndex);
    await db.chats.put(chat);

    await chatsService.loadChat(chat.id, db);
    await send(textToResend, db);
}

function setupMessageEditing(messageElement, db) {
    const editButton = messageElement.querySelector('.btn-edit');
    const saveButton = messageElement.querySelector('.btn-save');
    const deleteButton = messageElement.querySelector('.btn-delete');
    const refreshButton = messageElement.querySelector('.btn-refresh');
    const replayButton = messageElement.querySelector('.btn-replay');
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
            
            // Ставим курсор в конец
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

            // Используем VisualService для рендера
            messageTextDiv.innerHTML = visualService.renderTextContent(newRawText);
            hljs.highlightAll();

            editButton.style.display = 'inline-block';
            saveButton.style.display = 'none';
        });
    }
    
    if (replayButton) {
        replayButton.addEventListener('click', async () => {
            const index = parseInt(messageElement.dataset.messageIndex, 10);
            const chat = await chatsService.getCurrentChat(db);
            const messageData = chat.content[index];

            if (!messageData) return;

            const rawTextToReplay = messageData.parts[0].text;
            const characterId = messageData?.personalityid;
            const sender = messageData?.role;

            if (characterId) {
                const { assetManagerService } = await import('./AssetManager.service.js');
                const characterTags = await assetManagerService.getAllUniqueTagsForCharacter(characterId);
                visualService.setCharacterTagCache(characterTags.characters);
            }

            const settings = settingsService.getSettings();
            
            // Делегируем проигрывание в VisualService
            await visualService.typeWriterEffect(messageElement, rawTextToReplay, characterId, settings.typingSpeed);
        });
    }

    if (deleteButton) {
        deleteButton.addEventListener('click', async () => {
            if (!confirm("Delete message?")) return;

            const chatId = chatsService.getCurrentChatId();
            const indexToDelete = parseInt(messageElement.dataset.messageIndex, 10);
            const success = await chatsService.deleteMessage(chatId, indexToDelete, db);

            if (success) {
                messageElement.remove();
                // Переиндексация DOM элементов
                const messageContainer = document.querySelector(".message-container");
                const allMessages = messageContainer.querySelectorAll('.message');
                allMessages.forEach((msgEl, newIndex) => {
                    msgEl.dataset.messageIndex = newIndex;
                });
            }
        });
    }

    if (refreshButton) {
        refreshButton.addEventListener("click", async () => {
            try {
                await handleRegenerate(messageElement, db);
            } catch (error) {
                console.error(error);
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
        console.error("Error updating DB:", error);
    }
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
                    <button class="btn-replay btn-textual material-symbols-outlined">play_arrow</button>
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
                pfpElement.onerror = () => { pfpElement.src = './assets/default_avatar.png'; };
            });
        }
        
        const messageContent = newMessage.querySelector(".message-text");

        // Обработка СТРИМА или готового текста
        if (!netStream) {
            messageContent.innerHTML = visualService.renderTextContent(msg);
            if (characterId !== null) {
                await visualService.processDynamicCommands(msg, newMessage, characterId);
            }
        } else {
            // Обработка потока
            let fullRawText = "";
            let currentDisplayedText = "";
            
            // Чистим кэш команд перед началом приема сообщения
            visualService.clearProcessedCommands(newMessage);

            try {
                for await (const chunk of netStream) {
                    if (chunk && chunk.text) {
                        fullRawText += chunk.text;
                        
                        if (typingSpeed > 0) {
                            // Тайпинг эффект
                            for (let i = 0; i < chunk.text.length; i++) {
                                currentDisplayedText += chunk.text[i];
                                await visualService.processDynamicCommands(currentDisplayedText, newMessage, characterId);
                                messageContent.innerHTML = visualService.renderTextContent(currentDisplayedText);
                                helpers.messageContainerScrollToBottom();
                                await new Promise(resolve => setTimeout(resolve, typingSpeed));
                            }
                        } else {
                            // Мгновенный вывод (но все равно чанками)
                            await visualService.processDynamicCommands(fullRawText, newMessage, characterId);
                            messageContent.innerHTML = visualService.renderTextContent(fullRawText);
                            helpers.messageContainerScrollToBottom();
                        }
                    }
                }
                
                // Финализация после стрима
                await visualService.processDynamicCommands(fullRawText, newMessage, characterId);
                messageContent.innerHTML = visualService.renderTextContent(fullRawText);
                hljs.highlightAll();
                setupMessageEditing(newMessage, db);
                return { HTML: messageContent.innerHTML, md: fullRawText };

            } catch (error) {
                console.error("Stream error:", error);
                // Пытаемся сохранить то, что успели получить
                messageContent.innerHTML = visualService.renderTextContent(fullRawText);
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