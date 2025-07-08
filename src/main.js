// FILE: src/main.js

import * as personalityService from "./services/Personality.service";
import * as settingsService from "./services/Settings.service";
import * as overlayService from './services/Overlay.service';
import * as chatsService from './services/Chats.service';
import { db } from './services/Db.service';
import * as helpers from "./utils/helpers";
import * as sidebarComponent from "./components/Sidebar.component.js"; // NEW: Import sidebar component

// ======================================
// === Application Initialization ===
// ======================================

async function initializeApp() {
    // 1. Initialize settings (loads preferences from localStorage)
    settingsService.initialize();

    // 2. Initialize core services that manage and populate DOM elements
    //    These services now populate their respective UI sections,
    //    but *do not* set any active states or navigate themselves yet.
    await chatsService.initialize(db); // Populates chat entries
    await personalityService.migratePersonalities(db); // Migrates chat history if needed
    await personalityService.initialize(); // Populates personality cards

    // 3. Load all other components
    //    These components mostly attach event listeners and manage local UI elements.
    //    Use await to ensure they are fully set up before proceeding.
    const components = import.meta.glob('./components/*.js');
    for (const path in components) {
        await components[path]();
    }

    // 4. Orchestrate the initial UI state based on saved settings
    const settings = settingsService.getSettings();

    // First, set the active personality. This will click its radio button
    // and update settingsService.
    await personalityService.selectPersonality(settings.lastActive.personalityId);

    // Then, attempt to load the last active chat.
    // loadChat will update the messages and select the correct personality,
    // but it *will not* change the sidebar tab.
    const lastActiveChatId = settings.lastActive.chatId;
    if (lastActiveChatId !== null) {
        const parsedChatId = parseInt(lastActiveChatId, 10);
        // Find the radio button for the last active chat
        const radioButton = document.querySelector(`#chat${parsedChatId}`);
        if (radioButton) {
            // Click it to trigger its 'change' listener, which then calls chatsService.loadChat().
            // This is crucial for correctly restoring the chat history.
            radioButton.click();
            // After loading chat and selecting personality, ensure we are on the Chats tab
            sidebarComponent.navigateToTabByName('Chats');
        } else {
            // Last active chat ID not found (e.g., chat was deleted)
            console.warn(`Last active chat with ID ${lastActiveChatId} not found. Starting a new chat.`);
            chatsService.newChat(); // Clear messages, uncheck active chat
            sidebarComponent.navigateToTabByName('Personalities'); // Navigate to personalities tab for new start
        }
    } else {
        // No last active chat saved, start a new chat (default behavior)
        chatsService.newChat(); // Clear messages, uncheck active chat
        sidebarComponent.navigateToTabByName('Personalities'); // Navigate to personalities tab for new start
    }
    
    // Finally, initialize the sidebar's display based on the ultimately selected tab.
    // This ensures the visual state (active tab, highlight bar) matches the loaded session.
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
    // This will clear the chat and unselect the radio button.
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
                personalityService.add(personality); // This will automatically select the new personality
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


