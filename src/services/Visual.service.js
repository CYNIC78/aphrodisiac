// FILE: src/services/Visual.service.js

import { marked } from "https://cdn.jsdelivr.net/npm/marked/lib/marked.esm.js";
import * as settingsService from "./Settings.service.js";
import * as helpers from "../utils/helpers.js";

// Состояние визуализатора
const processedCommandsPerMessage = new Map(); // Map<messageElement, Set<fullTagString>>
let characterTagCache = new Set();

/**
 * Обновляет кэш тегов для текущего персонажа.
 * Вызывается из Message.service при начале чата.
 */
export function setCharacterTagCache(tags) {
    characterTagCache = new Set(tags);
}

/**
 * Очищает кэш обработанных команд для конкретного сообщения (нужно для retype/regenerate)
 */
export function clearProcessedCommands(messageElement) {
    if (processedCommandsPerMessage.has(messageElement)) {
        processedCommandsPerMessage.get(messageElement).clear();
    }
}

/**
 * Превращает текст с [тегами] в HTML с подсветкой, затем парсит Markdown.
 */
export function renderTextContent(text) {
    const wrappedText = wrapCommandsInSpan(text);
    return marked.parse(wrappedText, { breaks: true });
}

function wrapCommandsInSpan(text) {
    const commandRegex = /\[(.*?)\]/g;
    return text.replace(commandRegex, (fullMatch, contentInsideBrackets) => {
        const escapedContent = `[${contentInsideBrackets}]`;
        return `<span class="command-block">${escapedContent}</span>`;
    });
}

/**
 * Основная функция обработки команд (аватарки, звук)
 */
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

                    // 1. Обновляем аватарку в сообщении
                    updateImageWithFade(messageElement.querySelector('.pfp-wrapper'), '.pfp', objectURL);

                    // 2. Обновляем фон карточки персонажа (если есть на экране)
                    const personalityCard = document.querySelector(`#personality-${characterId}`);
                    if (personalityCard) {
                        updateImageWithFade(personalityCard.querySelector('.background-img-wrapper'), '.background-img', objectURL);
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
                        
                        // Чистим память сразу после окончания звука
                        audio.onended = () => URL.revokeObjectURL(objectURL);
                        audio.onerror = () => {
                            console.error(`Failed to load audio:`, objectURL);
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

/**
 * Вспомогательная функция для плавного перехода картинок + ОЧИСТКА ПАМЯТИ
 */
function updateImageWithFade(wrapper, imgSelector, newSrc) {
    if (!wrapper) return;

    const oldImg = wrapper.querySelector(imgSelector);
    const newImg = document.createElement('img');
    
    newImg.src = newSrc;
    newImg.className = oldImg ? oldImg.className : (imgSelector.replace('.', ''));
    newImg.style.opacity = '0';
    
    // Если нужно абсолютное позиционирование для наложения, раскомментируй:
    // if(oldImg) { oldImg.style.position = 'absolute'; newImg.style.position = 'absolute'; }

    wrapper.appendChild(newImg);

    requestAnimationFrame(() => {
        newImg.style.transition = 'opacity 0.5s ease-in-out';
        newImg.style.opacity = '1';
    });

    // Удаляем старую картинку и чистим память через 500мс
    setTimeout(() => {
        if (oldImg && oldImg.parentElement === wrapper) {
            const srcToDelete = oldImg.src;
            oldImg.remove();
            
            // !!! ВАЖНО: Фикс утечки памяти !!!
            if (srcToDelete && srcToDelete.startsWith('blob:')) {
                URL.revokeObjectURL(srcToDelete);
            }
        }
        // Сброс позиционирования, если использовалось
        // newImg.style.position = ''; 
    }, 500);
}

/**
 * Парсит текст на наличие тегов и запускает команды
 */
export async function processDynamicCommands(currentText, messageElement, characterId) {
    if (characterId === null) return;

    const commandRegex = /\[(?:(.*?):)?(.*?)\]/g;
    let match;

    if (!processedCommandsPerMessage.has(messageElement)) {
        processedCommandsPerMessage.set(messageElement, new Set());
    }
    const processedTags = processedCommandsPerMessage.get(messageElement);

    // Сброс индекса регулярки обязателен
    commandRegex.lastIndex = 0; 
    
    while ((match = commandRegex.exec(currentText)) !== null) {
        const fullTagString = match[0];

        if (!processedTags.has(fullTagString)) {
            const command = (match[1] || 'avatar').trim().toLowerCase();
            const valueString = match[2].trim();
            const tagsFromAI = valueString.split(',').map(tag => tag.trim()).filter(tag => tag !== '');
            
            // Применяем кэш тегов персонажа (если тег есть в кэше, добавляем префикс char_)
            const mappedTags = tagsFromAI.map(tag => {
                const prefixedTag = `char_${tag}`;
                return characterTagCache.has(prefixedTag) ? prefixedTag : tag;
            });
            
            if (command && mappedTags.length > 0) {
                // Запускаем асинхронно, не ждем завершения
                executeCommandAction(command, mappedTags, messageElement, characterId);
                processedTags.add(fullTagString);
            }
        }
    }
}

/**
 * Эффект печатной машинки (используется при replay или stream с задержкой)
 */
export async function typeWriterEffect(messageElement, fullText, characterId, typingSpeed) {
    const messageContent = messageElement.querySelector(".message-text");
    if (!messageContent) return;

    let currentDisplayedText = "";
    messageContent.innerHTML = "";
    clearProcessedCommands(messageElement);

    for (let i = 0; i < fullText.length; i++) {
        currentDisplayedText += fullText[i];
        
        // Обрабатываем команды "на лету"
        await processDynamicCommands(currentDisplayedText, messageElement, characterId);
        
        // Рендерим текст
        // Оптимизация: можно рендерить markdown не каждый символ, а каждые N символов, если лагает
        messageContent.innerHTML = renderTextContent(currentDisplayedText);
        
        helpers.messageContainerScrollToBottom();
        await new Promise(resolve => setTimeout(resolve, typingSpeed));
    }
    
    // Финальный прогон (на случай если что-то пропустили)
    hljs.highlightAll();
}