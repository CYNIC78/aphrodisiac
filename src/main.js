/* Aphrodisiac v3 - main.js */
/* Final Layout Engine: Collapse and Resize working in harmony with min/max limits. */

// --- STAGE 1: INITIALIZE STYLES ---
import './styles/main.css';
console.log("Aphrodisiac v3 Initialized. CSS loaded.");

// --- STAGE 2: GET REFERENCES TO ALL CORE ELEMENTS ---
const appContainer = document.getElementById('app-container');
const leftSidebar = document.getElementById('left-sidebar');
const rightInspector = document.getElementById('right-inspector');
const mainContent = document.getElementById('main-content');
const leftResizeHandle = document.getElementById('left-resize-handle');
const rightResizeHandle = document.getElementById('right-resize-handle');

// --- STAGE 3: DYNAMICALLY RENDER THE STATIC UI ---
function renderStaticUI() {
    leftSidebar.innerHTML = `<div class="sidebar-header"><h3>Aphrodisiac</h3><button id="left-sidebar-toggle" class="sidebar-toggle-btn material-symbols-outlined">close_fullscreen</button></div><div class="sidebar-section"><div class="section-header"><h4>Chats</h4><button id="btn-new-chat" class="material-symbols-outlined">add_comment</button></div><div id="chat-list-container" class="section-content"></div></div><div class="sidebar-section"><div class="section-header"><h4>Personalities</h4><button id="btn-add-personality" class="material-symbols-outlined">person_add</button></div><div id="personality-list-container" class="section-content"></div></div><div class="sidebar-footer"><button id="btn-show-settings" class="material-symbols-outlined">settings</button></div>`;
    mainContent.innerHTML = `<div id="asset-manager" class="docked-top"><div class="asset-manager-header"><span>Asset Manager</span></div><div class="asset-manager-content"></div></div><div id="message-container"></div><div id="chat-input-container"><span contenteditable="true" placeholder="Send a message..." id="message-input"></span><button id="btn-send-message" class="material-symbols-outlined">send</button></div>`;
    rightInspector.innerHTML = `<div class="sidebar-header"><h3 id="inspector-title">Inspector</h3><button id="right-sidebar-toggle" class="sidebar-toggle-btn material-symbols-outlined">close_fullscreen</button></div><div id="inspector-content" class="sidebar-content-container"><p>Select a personality or click the settings icon.</p></div>`;
    console.log("Static UI rendered successfully.");
}

// --- STAGE 4: INITIALIZE FUNCTIONALITY ---

// --- Resizable Sidebar Logic (With Min/Max constraints) ---
function makeResizable(handle, side) {
    const minSidebarWidth = 150; // Minimum width for sidebars
    const maxSidebarPercentage = 0.4; // Sidebar can't be more than 40% of the window
    const handleWidth = 10;

    handle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        const containerRect = appContainer.getBoundingClientRect();
        const maxSidebarWidth = containerRect.width * maxSidebarPercentage;

        if (side === 'left') {
            let newLeftWidth = e.clientX - containerRect.left;
            // Enforce min/max
            if (newLeftWidth < minSidebarWidth) newLeftWidth = minSidebarWidth;
            if (newLeftWidth > maxSidebarWidth) newLeftWidth = maxSidebarWidth;
            appContainer.style.gridTemplateColumns = `${newLeftWidth}px ${handleWidth}px 1fr ${handleWidth}px ${rightInspector.offsetWidth}px`;
        } else if (side === 'right') {
            let newRightWidth = containerRect.right - e.clientX;
            // Enforce min/max
            if (newRightWidth < minSidebarWidth) newRightWidth = minSidebarWidth;
            if (newRightWidth > maxSidebarWidth) newRightWidth = maxSidebarWidth;
            appContainer.style.gridTemplateColumns = `${leftSidebar.offsetWidth}px ${handleWidth}px 1fr ${handleWidth}px ${newRightWidth}px`;
        }
    }

    function onMouseUp() {
        const leftWidth = leftSidebar.offsetWidth;
        const rightWidth = rightInspector.offsetWidth;
        const mainWidth = appContainer.offsetWidth - leftWidth - rightWidth - (handleWidth * 2);
        appContainer.style.gridTemplateColumns = `${leftWidth}fr ${handleWidth}px ${mainWidth}fr ${handleWidth}px ${rightWidth}fr`;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

// --- Collapsible Sidebar Logic (FIXED) ---
function initializeToggles() {
    const leftToggleBtn = document.getElementById('left-sidebar-toggle');
    const rightToggleBtn = document.getElementById('right-sidebar-toggle');

    leftToggleBtn.addEventListener('click', () => {
        // FIX: Clear inline style from resizing before toggling the class
        appContainer.style.gridTemplateColumns = ''; 
        appContainer.classList.toggle('left-sidebar-collapsed');
        leftToggleBtn.textContent = appContainer.classList.contains('left-sidebar-collapsed') ? 'open_fullscreen' : 'close_fullscreen';
    });

    rightToggleBtn.addEventListener('click', () => {
        // FIX: Clear inline style from resizing before toggling the class
        appContainer.style.gridTemplateColumns = '';
        appContainer.classList.toggle('right-sidebar-collapsed');
        rightToggleBtn.textContent = appContainer.classList.contains('right-sidebar-collapsed') ? 'open_fullscreen' : 'close_fullscreen';
    });
    console.log("Sidebar toggle logic initialized.");
}

// --- STAGE 5: EXECUTE EVERYTHING ---
renderStaticUI();
makeResizable(leftResizeHandle, 'left');
makeResizable(rightResizeHandle, 'right');
initializeToggles();
console.log("All UI functionality initialized.");