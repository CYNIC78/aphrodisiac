// FILE: src/main.js

import * as personalityService from "./services/Personality.service";
import * as settingsService from "./services/Settings.service";
import * as overlayService from './services/Overlay.service';
import * as chatsService from './services/Chats.service';
import { db } from './services/Db.service';
import * as helpers from "./utils/helpers";
import * as sidebarComponent from "./components/Sidebar.component.js";

// ======================================
// === Application Initialization ===
// ======================================

async function initializeApp() {
    // 1. Initialize settings (loads preferences from localStorage FIRST)
    settingsService.initialize();

    // 2. Initialize database
    // Db.service.js already handles its own initialization on import.

    // 3. Initialize personality and chat services (populate DOM, but DON'T set active states yet)
    await personalityService.initialize(); // Creates all personality cards in the DOM
    await chatsService.initialize(db);     // Creates all chat entries in the DOM
    await personalityService.migratePersonalities(db); // Migrates chat history if needed (safe to run after populating)
    
    // 4. Load all other components
    // These components primarily attach event listeners and manage local UI elements.
    // Ensure all are processed.
    const components = import.meta.glob('./components/*.js');
    for (const path in components) {
        await components[path]();
    }

    // 5. Orchestrate the initial UI state based on loaded settings
    const settings = settingsService.getSettings();
    const lastActiveChatId = settings.lastActive.chatId;
    const lastActivePersonalityId = settings.lastActive.personalityId;
    const lastActiveTabName = settings.lastActive.tab;

    // A. Attempt to restore the last active chat FIRST
    let chatLoadedSuccessfully = false;
    if (lastActiveChatId !== null) {
        const parsedChatId = parseInt(lastActiveChatId, 10);
        const radioButton = document.querySelector(`#chat${parsedChatId}`);
        if (radioButton) {
            // Programmatically click the radio button. Its 'change' listener will call
            // chatsService.loadChat(), which in turn calls personalityService.selectPersonality().
            // This ensures personality is selected *before* the tab potentially changes.
            radioButton.click(); 
            chatLoadedSuccessfully = true;
        } else {
            console.warn(`Last active chat with ID ${lastActiveChatId} not found in DB. Starting new chat.`);
        }
    }

    // B. Now, set the initial sidebar tab and personality if a chat wasn't successfully loaded,
    //    or if the last active personality needs to be explicitly re-selected (e.g., if it wasn't linked to a chat).
    if (!chatLoadedSuccessfully) {
        // If no chat was loaded, default to a new chat and personalties tab
        chatsService.newChat(); // Clear messages, uncheck chat radio, set activeChatId=null in settings
        await personalityService.selectPersonality(lastActivePersonalityId); // Try to select the last personality or Aphrodite
        sidebarComponent.navigateToTabByName('Personalities'); // Always go to Personalities for a new chat
    } else {
        // If a chat was loaded, ensure we are on the Chats tab.
        // The personality for this chat was already set by chatsService.loadChat().
        sidebarComponent.navigateToTabByName('Chats');
    }

    // 6. Finally, initialize the sidebar's visual display (highlight bar, etc.).
    // This MUST be called last for sidebar visuals to be correct based on final tab.
    sidebarComponent.initializeSidebarDisplay();
}

// Call the main initialization function
initializeApp();


// ======================================
// === Global Event Listeners ===
// ======================================

// Overlay close button
const hideOverlayButton = document.querySelector("#btn-hide-overlay");
hideOverlayButton.addEventListener("click", () => overlayService.closeOverlay());

// New Chat button
const newChatButton = document.querySelector("#btn-new-chat");
newChatButton.addEventListener("click", () => {
    // This will clear the chat, unselect the radio button, and set activeChatId=null in settings.
    chatsService.newChat(); 
    // Always navigate to Personalities after clicking 'New Chat'
    sidebarComponent.navigateToTabByName('Personalities');
});

// Clear All Personalities button
const clearAllPersonalityButton = document.querySelector("#btn-clearall-personality");
clearAllPersonalityButton.addEventListener("click", async () => {
    // This will remove all personalities and default to Aphrodite,
    // which will internally call personalityService.selectPersonality(-1)
    // to update the UI and settings.
    await personalityService.removeAll();
    // After clearing personalities, ensure we are on the Personalities tab.
    sidebarComponent.navigateToTabByName('Personalities');
});

// Delete All Chats button
const deleteAllChatsButton = document.querySelector("#btn-reset-chat");
deleteAllChatsButton.addEventListener("click", async () => {
    // This will clear all chats, re-initialize the chat list,
    // and then call newChat() to set active chat ID to null.
    await chatsService.deleteAllChats(db); 
    // After clearing all chats, navigate to Personalities as it's a fresh start.
    sidebarComponent.navigateToTabByName('Personalities');
});

// Import Personality button
const importPersonalityButton = document.querySelector("#btn-import-personality");
importPersonalityButton.addEventListener("click", () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
            try {
                const personality = JSON.parse(e.target.result);
                // personalityService.add will automatically select the new personality.
                personalityService.add(personality); 
            } catch (error) {
                alert("Failed to import personality: Invalid JSON file.");
                console.error("Error importing personality:", error);
            }
        };
        reader.readAsText(file);
    });
    fileInput.click();
    // No need for fileInput.remove(); as it's not appended to DOM
});

// Window resize listener for sidebar visibility on desktop
window.addEventListener("resize", () => {
    if (window.innerWidth > 1032) {
        const sidebarElement = document.querySelector(".sidebar");
        // Only show if currently hidden to prevent unnecessary DOM manipulation
        if (getComputedStyle(sidebarElement).opacity === '0' || sidebarElement.style.display === 'none') {
            helpers.showElement(sidebarElement, false); // Show instantly
        }
    }
});