/* --- Sidebar.component.js (V2 - Flexible & Resizable) --- */

// --- ELEMENT SELECTORS ---
// Tab navigation elements (from original code)
const tabs = document.querySelectorAll(".navbar-tab");
const tabHighlight = document.querySelector("#navbar-tab-highlight");
const sidebarViews = document.querySelectorAll(".sidebar-section");

// Sidebar control elements (for new functionality)
const sidebar = document.querySelector(".sidebar");
const resizer = document.querySelector("#sidebar-resizer");
const collapseBtn = document.querySelector("#btn-hide-sidebar");
const expandBtn = document.querySelector("#btn-show-sidebar");

// --- CONSTANTS ---
const MIN_SIDEBAR_WIDTH = 280; // Minimum width in pixels
const MAX_SIDEBAR_WIDTH = 800; // Maximum width in pixels
const LS_WIDTH_KEY = 'aphrodisiac_sidebarWidth';
const LS_COLLAPSED_KEY = 'aphrodisiac_sidebarCollapsed';

// =================================================================
// --- 1. NEW SIDEBAR CONTROL LOGIC ---
// =================================================================

/**
 * Initializes the sidebar's state based on saved preferences in localStorage.
 */
function initializeSidebarState() {
    // Restore saved width
    const savedWidth = localStorage.getItem(LS_WIDTH_KEY);
    if (savedWidth) {
        const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(parseInt(savedWidth, 10), MAX_SIDEBAR_WIDTH));
        document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
    }

    // Restore collapsed state
    const isCollapsed = localStorage.getItem(LS_COLLAPSED_KEY);
    if (isCollapsed === 'true') {
        sidebar.classList.add('collapsed');
    }
}

/**
 * Handles the logic for resizing the sidebar by dragging the resizer handle.
 */
function initializeResizer() {
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.classList.add('resizing'); // Add class for global cursor styles
        e.preventDefault(); // Prevent text selection during drag

        // Add listeners to the whole document to capture mouse movement anywhere on the page
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    });

    function handleMouseMove(e) {
        if (!isResizing) return;

        // Calculate and apply the new width, clamped between min and max values
        let newWidth = e.clientX;
        newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(newWidth, MAX_SIDEBAR_WIDTH));
        document.documentElement.style.setProperty('--sidebar-width', `${newWidth}px`);
    }

    function handleMouseUp() {
        if (!isResizing) return;
        isResizing = false;
        document.body.classList.remove('resizing');

        // Clean up the global listeners
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // Save the final width to localStorage for persistence
        const finalWidth = document.documentElement.style.getPropertyValue('--sidebar-width');
        localStorage.setItem(LS_WIDTH_KEY, parseInt(finalWidth, 10));
    }
}

/**
 * Attaches event listeners to the expand/collapse buttons to handle both
 * desktop and mobile view states.
 */
function initializeToggleButtons() {
    // Button to collapse the sidebar (or hide on mobile)
    collapseBtn.addEventListener("click", () => {
        if (window.innerWidth <= 1032) {
            sidebar.classList.remove('mobile-visible'); // Hide mobile overlay
        } else {
            sidebar.classList.add('collapsed'); // Collapse on desktop
            localStorage.setItem(LS_COLLAPSED_KEY, 'true');
        }
    });

    // Button to expand the sidebar (or show on mobile)
    expandBtn.addEventListener("click", () => {
        if (window.innerWidth <= 1032) {
            sidebar.classList.add('mobile-visible'); // Show mobile overlay
        } else {
            sidebar.classList.remove('collapsed'); // Expand on desktop
            localStorage.setItem(LS_COLLAPSED_KEY, 'false');
        }
    });
}


// =================================================================
// --- 2. ORIGINAL TAB NAVIGATION LOGIC (UNCHANGED) ---
// This code is well-written and independent, so we keep it as is.
// =================================================================

let activeTabIndex = undefined;

function navigateTo(tab) {
    const index = [...tabs].indexOf(tab);
    if (index == activeTabIndex) {
        return;
    }
    tab.classList.add("navbar-tab-active");
    if (activeTabIndex !== undefined) {
        sidebarViews[activeTabIndex].style.display = 'none'; // Use style.display for direct control
        tabs[activeTabIndex].classList.remove("navbar-tab-active");
    }
    sidebarViews[index].style.display = 'flex'; // Use flex to match our CSS
    activeTabIndex = index;
    tabHighlight.style.left = `calc(100% / ${tabs.length} * ${index})`;
}

// Tab setup
tabHighlight.style.width = `calc(100% / ${tabs.length})`;
for (const tab of tabs) {
    tab.addEventListener("click", () => {
        navigateTo(tab);
    });
}


// =================================================================
// --- 3. EXECUTE INITIALIZATION ---
// =================================================================

// Initialize the new sidebar features first
initializeSidebarState();
initializeResizer();
initializeToggleButtons();

// Then, initialize the tab navigation
navigateTo(tabs[0]);