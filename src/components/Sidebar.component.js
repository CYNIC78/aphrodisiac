// FILE: src/components/Sidebar.component.js

import * as helpers from "../utils/helpers";
import * as settingsService from "../services/Settings.service.js"; // Import settings service

const hideSidebarButton = document.querySelector("#btn-hide-sidebar");
const showSidebarButton = document.querySelector("#btn-show-sidebar");
const tabs = document.querySelectorAll(".navbar-tab");
const tabHighlight = document.querySelector("#navbar-tab-highlight");
const sidebarViews = document.querySelectorAll(".sidebar-section");
const sidebar = document.querySelector(".sidebar");

hideSidebarButton.addEventListener("click", () => {
    helpers.hideElement(sidebar);
});
showSidebarButton.addEventListener("click", () => {
    helpers.showElement(sidebar, false);
});

let activeTabIndex; // This will be set during initial load, not default to undefined

/**
 * Handles navigation between sidebar tabs with visual transitions.
 * This function is designed for user-initiated clicks after the initial load.
 * @param {HTMLElement} tabElement The tab element that was clicked.
 */
function handleTabNavigation(tabElement) {
    const newIndex = [...tabs].indexOf(tabElement);

    // If the clicked tab is already the active one, do nothing.
    // This prevents re-animating or re-saving if already in correct state.
    if (newIndex === activeTabIndex) {
        return;
    }

    // 1. Deactivate the currently active tab's visuals and hide its content (with fade-out)
    // This block runs only if there was a previous active tab (i.e., not on the very first click after load).
    if (activeTabIndex !== undefined) {
        tabs[activeTabIndex].classList.remove("navbar-tab-active");
        helpers.hideElement(sidebarViews[activeTabIndex], true); // Allow old content to fade out
    }
    
    // 2. Activate the new tab's visuals and show its content (with fade-in)
    tabElement.classList.add("navbar-tab-active");
    helpers.showElement(sidebarViews[newIndex], true); // Fade in new content
    
    // 3. Update the highlight bar position to the new tab
    tabHighlight.style.left = `calc(100% / ${tabs.length} * ${newIndex})`;

    // 4. Update the internal state and save the active tab name to settings
    activeTabIndex = newIndex;
    settingsService.setActiveTab(tabElement.textContent);
}

// NEW: Exported function to programmatically navigate to a sidebar tab by its text content
export function navigateToTabByName(tabName) {
    const targetTab = Array.from(tabs).find(tab => tab.textContent === tabName);
    if (targetTab) {
        handleTabNavigation(targetTab);
    } else {
        console.warn(`Attempted to navigate to unknown tab: "${tabName}"`);
    }
}


// === INITIAL SETUP ON PAGE LOAD ===
// This section ensures the sidebar is in the correct state immediately when the page loads.

// 1. Set initial highlight bar width (this only needs to be done once)
tabHighlight.style.width = `calc(100% / ${tabs.length})`;

// 2. Add event listeners for click navigation for all tabs
for(const tab of tabs){
    tab.addEventListener("click", () => {
        handleTabNavigation(tab);
    });
}

// 3. Determine which tab should be active on initial load
const settings = settingsService.getSettings();
const lastActiveTabName = settings.lastActive.tab;

let initialTabElement = tabs[0]; // Default to 'Chats' tab (first one)
let initialTabIndex = 0;

// Find the tab element that matches the last saved active tab name
for (let i = 0; i < tabs.length; i++) {
    if (tabs[i].textContent === lastActiveTabName) {
        initialTabElement = tabs[i];
        initialTabIndex = i;
        break;
    }
}

// 4. Apply initial styles and content visibility *directly and instantly*
//    No animations or transitions here, just set the final state.
initialTabElement.classList.add("navbar-tab-active"); // Mark the initial tab as active

// Hide all sidebar content sections instantly, then show only the active one.
sidebarViews.forEach((view, index) => {
    if (index === initialTabIndex) {
        helpers.showElement(view, false); // Show this view instantly (no fade-in)
    } else {
        helpers.hideElement(view, false); // Hide all other views instantly (no fade-out)
    }
});

// Position the highlight bar for the initial tab instantly
tabHighlight.style.left = `calc(100% / ${tabs.length} * ${initialTabIndex})`;

// 5. Set the internal activeTabIndex for subsequent `handleTabNavigation` calls
activeTabIndex = initialTabIndex;

// 6. Ensure the current active tab is saved in settings (harmless if it's already the loaded one)
settingsService.setActiveTab(initialTabElement.textContent);