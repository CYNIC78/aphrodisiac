// Renamed setupDB import for clarity
import { setupDB } from './services/Db.service'; 
import * as personalityService from "./services/Personality.service";
import * as settingsService from "./services/Settings.service";
import * as overlayService from './services/Overlay.service';
import * as chatsService from './services/Chats.service';
import * as helpers from "./utils/helpers";
import * as assetManagerService from "./services/AssetManager.service"; // Import AssetManagerService


// All core application initialization and setup will now happen inside this immediately invoked async function.
// This resolves the "Top-level await is not available" build error by providing an async context for all awaits.
(async () => {
    try {
        // 1. Initialize the database FIRST.
        const db = setupDB(); // Call the synchronous setup function
        await db.version(5).upgrade(tx => {}); // Explicitly await the database open/upgrade process

        console.log("Database initialized and ready.");

        // 2. Initialize services, passing the 'db' instance where needed.
        settingsService.initialize(); // Settings doesn't directly interact with 'db'

        // Initialize services that require the database instance.
        // We now pass 'db' explicitly to their initialization methods.
        await chatsService.initialize(db);
        await personalityService.initialize(db); 
        await assetManagerService.initialize(db); // Initialize AssetManagerService with db

        // 3. Load all component code.
        // These modules might contain event listeners or initial UI setup that needs to run early.
        const components = import.meta.glob('./components/*.js');
        for (const path in components) {
            await components[path](); // Execute and await each component module's main function/top-level code
        }

        console.log("Aphrodisiac application core initialized successfully.");

        // 4. Attach global event listeners after all services are initialized.
        const hideOverlayButton = document.querySelector("#btn-hide-overlay");
        if (hideOverlayButton) {
            hideOverlayButton.addEventListener("click", () => overlayService.closeOverlay());
        }

        const newChatButton = document.querySelector("#btn-new-chat");
        if (newChatButton) {
            newChatButton.addEventListener("click", () => {
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
            deleteAllChatsButton.addEventListener("click", () => { chatsService.deleteAllChats() }); // No longer needs 'db' passed here directly
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
                fileInput.remove();
            });
        }

        window.addEventListener("resize", () => {
            if (window.innerWidth > 1032) {
                const sidebarElement = document.querySelector(".sidebar");
                if (sidebarElement && sidebarElement.style.opacity === "0") {
                    helpers.showElement(sidebarElement, false);
                }
            }
        });

    } catch (error) {
        console.error("Critical application initialization failed:", error);
        alert("The application failed to start due to a critical error. Please check the console for details.");
    }
})();