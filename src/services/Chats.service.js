// FILE: src/services/Chats.service.js

import * as messageService from "./Message.service"
import * as helpers from "../utils/helpers"
import * as personalityService from "./Personality.service";
import * as settingsService from "./Settings.service.js";
import * as sidebarComponent from "../components/Sidebar.component.js"; // NEW: Import sidebar component

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
            // This case implies the chat entry was not inserted, which shouldn't happen if foundChat was true.
            // As a fallback, ensure a new chat is started and settings updated.
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
        // NEW: Save the active chat ID to settings
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

    // NEW: Select the newly added chat to make it active
    const newChatRadioButton = document.querySelector(`#chat${id}`);
    if (newChatRadioButton) {
        newChatRadioButton.click(); // This will trigger its 'change' listener and call loadChat and save its ID
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
    // After clearing, initialize again, which will default to a new chat and update settings.
    initialize(db);
}


export async function deleteChat(id, db) {
    await db.chats.delete(id);
    if (getCurrentChatId() == id) {
        // If the deleted chat was the currently selected one, start a new chat
        newChat();
    }
    initialize(db); // Re-initialize to update the chat list and potentially re-select a chat
}

export function newChat() {
    messageContainer.innerHTML = "";
    const currentCheckedRadio = document.querySelector("input[name='currentChat']:checked");
    if (currentCheckedRadio) {
        currentCheckedRadio.checked = false; // Uncheck the currently active one
    }
    // NEW: Update settings to reflect that no chat is currently selected
    settingsService.setActiveChatId(null);
    // NEW: Navigate to the Personalities tab when starting a new chat
    sidebarComponent.navigateToTabByName('Personalities');
}

export async function loadChat(chatID, db) {
    try {
        if (!chatID) {
            return;
        }
        messageContainer.innerHTML = "";
        const chat = await getChatById(chatID, db);

        // NEW: Find the personality from the LAST AI message in the chat
        let lastPersonalityId = null;
        for (let i = chat.content.length - 1; i >= 0; i--) {
            const msg = chat.content[i];
            if (msg.role === "model" && msg.personalityid !== undefined && msg.personalityid !== null) {
                lastPersonalityId = msg.personalityid;
                break; // Found the last one, stop searching
            }
        }

        // NEW: If a personality was found, set it as active and navigate to the Personalities tab
        if (lastPersonalityId !== null) {
            settingsService.setActivePersonalityId(lastPersonalityId);
            sidebarComponent.navigateToTabByName('Personalities');
        } else {
            // If no AI message with a personality was found (e.g., empty chat or only user messages),
            // ensure we are on the chats tab and default to Aphrodite.
            sidebarComponent.navigateToTabByName('Chats'); // Ensure we are on the chats tab
            settingsService.setActivePersonalityId(-1); // Default to Aphrodite
        }

        // Now, proceed to render the chat messages
        for (const msg of chat.content) {
            if (msg.role === "model") {
                const personality = msg.personalityid ?
                    await personalityService.get(msg.personalityid, db) :
                    await personalityService.getByName(msg.personality, db);
                await messageService.insertMessage(
                    msg.role,
                    msg.parts[0].text,
                    personality.name,
                    null,
                    db,
                    personality.image
                );
            }
            else {
                await messageService.insertMessage(msg.role, msg.parts[0].text, null, null, db);
            }

        }
        // Always scroll to bottom when loading a chat
        messageContainer.scrollTo({
            top: messageContainer.scrollHeight,
            behavior: 'auto'
        });
    }
    catch (error) {
        alert("Error, please report this to the developer. You might need to restart the page to continue normal usage. Error: " + error);
        console.error(error);
    }
}

export async function getAllChats(db) {
    const chats = await db.chats.orderBy('timestamp').toArray(); // Get all objects
    chats.reverse() //reverse in order to have the latest chat at the top
    return chats;
}

export async function getChatById(id, db) {
    const chat = await db.chats.get(id);
    return chat;
}