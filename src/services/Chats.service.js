// FILE: src/services/Chats.service.js

import * as messageService from "./Message.service.js";
import * as helpers from "../utils/helpers.js";
import * as personalityService from "./Personality.service.js";
import * as settingsService from "./Settings.service.js";
// --- NEW --- Import the asset manager service to fetch avatars
import { assetManagerService } from "./AssetManager.service.js";

const messageContainer = document.querySelector(".message-container");
const chatHistorySection = document.querySelector("#chatHistorySection");
const sidebar = document.querySelector(".sidebar");

export function getCurrentChatId() {
    const currentChatElement = document.querySelector("input[name='currentChat']:checked");
    if (currentChatElement) {
        return parseInt(currentChatElement.value.replace("chat", ""), 10);
    }
    return null;
}

export async function getAllChatIdentifiers(db) {
    try {
        let identifiers = [];
        await db.chats.orderBy('timestamp').each(
            chat => {
                identifiers.push({ id: chat.id, title: chat.title });
            }
        )
        return identifiers;
    } catch (error) {
        //to be implemented
        console.error(error);
    }
}

export async function initialize(db) {
    const chatContainer = document.querySelector("#chatHistorySection");
    chatContainer.innerHTML = "";
    const chats = await getAllChatIdentifiers(db);
    for (let chat of chats) {
        insertChatEntry(chat, db); // This creates the radio buttons for all chats
    }

    const settings = settingsService.getSettings();
    const lastActiveChatId = settings.lastActive.chatId; // This is a string from localStorage

    let chatToLoadId = null;

    if (lastActiveChatId !== null) {
        const parsedId = parseInt(lastActiveChatId, 10);
        // Check if a chat with this ID actually exists in the current list of chats
        const foundChat = chats.find(c => c.id === parsedId);
        if (foundChat) {
            chatToLoadId = parsedId;
        } else {
            console.warn(`Last active chat with ID ${lastActiveChatId} not found. Starting a new chat.`);
        }
    }

    if (chatToLoadId !== null) {
        // Find the radio button for the chat and click it to load and select it
        const radioButton = document.querySelector(`#chat${chatToLoadId}`);
        if (radioButton) {
            radioButton.click(); // This will trigger the change listener, load the chat, and save its ID
        } else {
            console.warn(`Radio button for chat ID ${chatToLoadId} not found. Starting a new chat.`);
            newChat();
        }
    } else {
        // No last active chat or it was not found, start a new chat.
        newChat();
    }
}

function insertChatEntry(chat, db) {
    //radio button
    const chatRadioButton = document.createElement("input");
    chatRadioButton.setAttribute("type", "radio");
    chatRadioButton.setAttribute("name", "currentChat");
    chatRadioButton.setAttribute("value", "chat" + chat.id);
    chatRadioButton.id = "chat" + chat.id;
    chatRadioButton.classList.add("input-radio-currentchat");

    //label
    const chatLabel = document.createElement("label",);
    chatLabel.setAttribute("for", "chat" + chat.id);
    chatLabel.classList.add("title-chat");
    chatLabel.classList.add("label-currentchat");


    //
    const chatLabelText = document.createElement("span");
    chatLabelText.style.overflow = "hidden";
    chatLabelText.style.textOverflow = "ellipsis";
    chatLabelText.textContent = chat.title;

    //
    const chatIcon = document.createElement("span");
    chatIcon.classList.add("material-symbols-outlined");
    chatIcon.textContent = "chat_bubble";

    //
    const deleteEntryButton = document.createElement("button");
    deleteEntryButton.classList.add("btn-textual", "material-symbols-outlined");
    deleteEntryButton.textContent = "delete";
    deleteEntryButton.addEventListener("click", (e) => {
        e.stopPropagation(); //so we don't activate the radio button
        deleteChat(chat.id, db);
    })

    chatLabel.append(chatIcon);
    chatLabel.append(chatLabelText);
    chatLabel.append(deleteEntryButton);


    chatRadioButton.addEventListener("change", async () => {
        settingsService.setActiveChatId(chat.id);
        await loadChat(chat.id, db);
        if (window.innerWidth < 1032) {
            helpers.hideElement(sidebar);
        }
    });

    chatHistorySection.prepend(chatRadioButton, chatLabel);


}

export async function addChat(title, firstMessage = null, db) {
    const id = await db.chats.put({
        title: title,
        timestamp: Date.now(),
        content: firstMessage ? [{ role: "user", parts: [{ text: firstMessage }] }] : []
    });
    insertChatEntry({ title, id }, db);
    console.log("chat added with id: ", id);

    const newChatRadioButton = document.querySelector(`#chat${id}`);
    if (newChatRadioButton) {
        newChatRadioButton.click(); 
    }

    return id;
}

export async function getCurrentChat(db) {
    const id = getCurrentChatId();
    if (!id) {
        return null;
    }
    return (await getChatById(id, db));
}

export async function deleteAllChats(db) {
    await db.chats.clear();
    initialize(db);
}


export async function deleteChat(id, db) {
    await db.chats.delete(id);
    if (getCurrentChatId() == id) {
        newChat();
    }
    initialize(db);
}

export function newChat() {
    messageContainer.innerHTML = "";
    const currentCheckedRadio = document.querySelector("input[name='currentChat']:checked");
    if (currentCheckedRadio) {
        currentCheckedRadio.checked = false;
    }
    settingsService.setActiveChatId(null);
}

// --- MODIFIED FUNCTION ---
export async function loadChat(chatID, db) {
    try {
        if (!chatID) {
            return;
        }
        messageContainer.innerHTML = "";
        const chat = await getChatById(chatID, db);
        let messageIndex = 0; // Keep track of index for dataset
        for (const msg of chat.content) {
            let insertedMessageElement;
            if (msg.role === "model") {
                const personality = msg.personalityid ?
                    await personalityService.get(msg.personalityid) : // Removed db pass-through, it's not needed
                    await personalityService.getByName(msg.personality);

                // --- THIS IS THE FIX ---
                // We proactively fetch the correct default avatar URL before rendering the message.
                let avatarUrl = personality.image; // Start with the fallback image.
                if (personality.id !== -1) {
                    // For custom personalities, get the dynamic blob URL for their 'default' avatar.
                    const dynamicAvatarUrl = await assetManagerService.getFirstImageObjectUrlByTags(['avatar', 'default'], personality.id);
                    if (dynamicAvatarUrl) {
                        avatarUrl = dynamicAvatarUrl;
                    }
                }
                // --- END FIX ---

                insertedMessageElement = await messageService.insertMessage(
                    msg.role,
                    msg.parts[0].text,
                    personality.name,
                    null,
                    db,
                    avatarUrl, // Pass the correct, fresh URL to the message service.
                    0,
                    personality.id
                );
            } else {
                insertedMessageElement = await messageService.insertMessage(msg.role, msg.parts[0].text, null, null, db);
            }
            if (insertedMessageElement) {
                insertedMessageElement.dataset.messageIndex = messageIndex++;
            }
        }
        messageContainer.scrollTo({
            top: messageContainer.scrollHeight,
            behavior: 'auto'
        });
    } catch (error) {
        alert("Error, please report this to the developer. You might need to restart the page to continue normal usage. Error: " + error);
        console.error(error);
    }
}
// --- END MODIFIED FUNCTION ---

export async function getAllChats(db) {
    const chats = await db.chats.orderBy('timestamp').toArray();
    chats.reverse()
    return chats;
}

export async function getChatById(id, db) {
    const chat = await db.chats.get(id);
    return chat;
}

export async function deleteMessage(chatId, messageIndex, db) {
    if (chatId === null || messageIndex === undefined) return false;
    try {
        const chat = await db.chats.get(chatId);
        if (!chat || !chat.content[messageIndex]) {
            console.error("Attempted to delete a message that does not exist.", { chatId, messageIndex });
            return false;
        }
        chat.content.splice(messageIndex, 1);
        await db.chats.put(chat);
        return true;
    } catch (error) {
        console.error("Error deleting message from database:", error);
        return false;
    }
}