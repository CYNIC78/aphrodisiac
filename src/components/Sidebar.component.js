// FILE: src/components/Sidebar.component.js

import * as helpers from "../utils/helpers";
import * as settingsService from "../services/Settings.service.js"; // NEW: Import settings service

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

let activeTabIndex = undefined;
function navigateTo(tab) {
    const index = [...tabs].indexOf(tab);
    if (index == activeTabIndex) {
        return;
    }
    // Remove active class from previously active tab if exists
    if (activeTabIndex !== undefined) {
        tabs[activeTabIndex].classList.remove("navbar-tab-active");
        helpers.hideElement(sidebarViews[activeTabIndex]);
    }
    
    // Set new active tab
    tab.classList.add("navbar-tab-active");
    helpers.showElement(sidebarViews[index], true);
    activeTabIndex = index;
    tabHighlight.style.left = `calc(100% / ${tabs.length} * ${index})`;

    // NEW: Save the active tab to settings
    settingsService.setActiveTab(tab.textContent);
}

//tab setup
tabHighlight.style.width = `calc(100% / ${tabs.length})`;
for(const tab of tabs){
    tab.addEventListener("click", () => {
        navigateTo(tab);
    });
}

// NEW: On initialization, navigate to the last active tab from settings
const settings = settingsService.getSettings();
const lastActiveTabName = settings.lastActive.tab;

let initialTab = tabs[0]; // Default to 'Chats' tab (index 0)
// Find the tab element that matches the last active tab name
for (const tab of tabs) {
    if (tab.textContent === lastActiveTabName) {
        initialTab = tab;
        break;
    }
}
navigateTo(initialTab); // Navigate to the remembered tab or default