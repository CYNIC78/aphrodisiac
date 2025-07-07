import * as personalityService from "./services/Personality.service";
import * as settingsService from "./services/Settings.service";
import * as overlayService from './services/Overlay.service';
import * as chatsService from './services/Chats.service';
import { db } from './services/Db.service'; // db itself is synchronous, but its methods are async
import * as helpers from "./utils/helpers";

// All core application initialization and setup will now happen inside this immediately invoked async function.
// This resolves the "Top-level await is not available" build error by providing an async context for all awaits.
(async () => {
    try {
        // 1. Load all component code.
        // These modules might contain event listeners or initial UI setup that needs to run early.
        const components = import.meta.glob('./components/*.js');
        for (const path in components) {
            await components[path](); // Execute and await each component module's main function/top-level code
        }

        // 2. Initialize services in the correct, sequential order.
        // settingsService.initialize is synchronous and typically sets up global settings from localStorage.
        settingsService.initialize();

        // These service initializations are asynchronous and MUST be awaited.
        // This ensures the database is ready and personalities/chats are loaded before the UI can interact fully.
        await chatsService.initialize(db);
        await personalityService.migratePersonalities(db); 
        await personalityService.initialize();

        console.log("Aphrodisiac application core initialized successfully.");

        // 3. Attach global event listeners after all services are initialized.
        // These are standard DOM event listeners and do not need to be awaited themselves.
        // Added defensive checks (if element exists) for robustness.

        const hideOverlayButton = document.querySelector("#btn-hide-overlay");
        if (hideOverlayButton) {
            hideOverlayButton.addEventListener("click", () => overlayService.closeOverlay());
        }

        const newChatButton = document.querySelector("#btn-new-chat");
        if (newChatButton) {
            newChatButton.addEventListener("click", () => {
                // Check if a chat is currently selected before allowing new chat creation logic
                if (!chatsService.getCurrentChatId()) {
                    return;
                }
                chatsService.newChat();
            });
        }

        const clearAllButton = document.querySelector("#btn-clearall-personality");
        if (clearAllButton) {
            clearAllButton.addEventListener("click", () => {
                personalityService.removeAll();
            });
        }

        const deleteAllChatsButton = document.querySelector("#btn-reset-chat");
        if (deleteAllChatsButton) {
            deleteAllChatsButton.addEventListener("click", () => { chatsService.deleteAllChats(db) });
        }

        const importPersonalityButton = document.querySelector("#btn-import-personality");
        if (importPersonalityButton) {
            importPersonalityButton.addEventListener("click", () => {
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.addEventListener('change', (e) => {
                    const file = e.target.files[0];
                    if (file) {
                        const reader = new FileReader();
                        reader.onload = function (event) {
                            try {
                                const personality = JSON.parse(event.target.result);
                                personalityService.add(personality);
                            } catch (error) {
                                console.error("Error parsing personality file:", error);
                                alert("Invalid personality file. Please ensure it's a valid JSON.");
                            }
                        };
                        reader.readAsText(file);
                    }
                });
                fileInput.click();
                fileInput.remove(); // Remove input after click
            });
        }

        window.addEventListener("resize", () => {
            // Show sidebar if window is resized to desktop size
            if (window.innerWidth > 1032) {
                const sidebarElement = document.querySelector(".sidebar");
                // To prevent running showElement more than necessary
                if (sidebarElement && sidebarElement.style.opacity === "0") { // Check opacity string
                    helpers.showElement(sidebarElement, false); // false means no fade
                }
            }
        });

    } catch (error) {
        console.error("Critical application initialization failed:", error);
        alert("The application failed to start due to a critical error. Please check the console for details.");
    }
})(); // End of the immediately invoked async function