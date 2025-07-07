// The db instance will be passed via initialize()
// import { db } from './Db.service.js'; // REMOVED: no longer directly imported
import * as messageService from "./Message.service.js"; // This imports the service, not the db directly.
import * as personalityService from "./Personality.service.js";
import * as helpers from "../utils/helpers.js";

let _db; // Private variable to hold the db instance

export async function initialize(dbInstance) {
    _db = dbInstance;
    await _db.chats.count(); // Await to ensure db is open and ready.
    renderChatList(); // Now calls renderChatList without db arg, uses _db
    if (getCurrentChatId()) {
        loadChat(getCurrentChatId()); // Now calls loadChat without db arg, uses _db
    }
}

export async function addChat(title, currentChatId = null) {
    const existingChat = currentChatId ? await _db.chats.get(currentChatId) : null;
    const newChatId = await _db.chats.add({
        title: title,
        timestamp: new Date(),
        content: existingChat ? existingChat.content : [] // Keep old content if adding to existing chat (should be new chat usually)
    });
    renderChatList();
    return newChatId;
}

export function getCurrentChatId() {
    return localStorage.getItem("currentChatId");
}

export async function getCurrentChat() {
    const id = getCurrentChatId();
    return id ? await _db.chats.get(id) : null;
}

export async function newChat() {
    localStorage.removeItem("currentChatId");
    document.querySelector(".message-container").innerHTML = "";
    document.querySelector("#messageInput").innerHTML = "";
    document.querySelector("#chatHistorySection").innerHTML = "";
    renderChatList();
}

export async function loadChat(id) {
    localStorage.setItem("currentChatId", id);
    const chat = await getCurrentChat();
    document.querySelector(".message-container").innerHTML = "";
    if (chat && chat.content) {
        for (const msg of chat.content) {
            // Pass the selected personality object for proper PFP and name display
            const p = await personalityService.get(msg.personalityid); 
            await messageService.insertMessage(msg.role, msg.parts[0].text, p, null, _db); // Pass _db to insertMessage
        }
    }
    helpers.messageContainerScrollToBottom();
    renderChatList();
}

export async function deleteChat(id) {
    await _db.chats.delete(id);
    if (getCurrentChatId() === String(id)) {
        newChat(); // If current chat is deleted, start a new one
    }
    renderChatList();
}

export async function deleteAllChats() {
    if (confirm("Are you sure you want to delete all chats? This cannot be undone.")) {
        await _db.chats.clear();
        newChat();
    }
}

export async function renderChatList() {
    const chatHistorySection = document.querySelector("#chatHistorySection");
    chatHistorySection.innerHTML = "";
    const chats = await _db.chats.orderBy("timestamp").reverse().toArray();

    const currentChatId = getCurrentChatId();

    for (const chat of chats) {
        const chatElement = document.createElement("label");
        chatElement.htmlFor = `chat${chat.id}`;
        chatElement.id = `chat${chat.id}`;
        chatElement.classList.add("chat-history-item");
        if (String(chat.id) === currentChatId) {
            chatElement.classList.add("active");
        }

        chatElement.innerHTML = `
            <input type="radio" name="currentChat" value="${chat.id}" ${String(chat.id) === currentChatId ? 'checked' : ''} hidden>
            <span class="chat-title">${helpers.getSanitized(chat.title)}</span>
            <span class="chat-actions">
                <button class="btn-textual material-symbols-outlined btn-delete-chat" data-chat-id="${chat.id}">delete</button>
            </span>
        `;
        chatHistorySection.appendChild(chatElement);

        chatElement.querySelector(".btn-delete-chat").addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteChat(parseInt(e.currentTarget.dataset.chatId));
        });

        chatElement.addEventListener("click", (e) => {
            if (!e.target.classList.contains("btn-delete-chat")) {
                loadChat(chat.id);
            }
        });
    }
}