/* Aphrodisiac v3 - main.js */
/* The fully repaired and upgraded entry point. */

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
    // Left Sidebar
    leftSidebar.innerHTML = `
        <div class="sidebar-header">
            <h3>Aphrodisiac</h3>
            <button id="left-sidebar-toggle" class="sidebar-toggle-btn material-symbols-outlined">close_fullscreen</button>
        </div>
        <div class="sidebar-section">
            <div class="section-header"><h4>Chats</h4><button id="btn-new-chat" class="material-symbols-outlined">add_comment</button></div>
            <div id="chat-list-container" class="section-content"></div>
        </div>
        <div class="sidebar-section">
            <div class="section-header"><h4>Personalities</h4><button id="btn-add-personality" class="material-symbols-outlined">person_add</button></div>
            <div id="personality-list-container" class="section-content"></div>
        </div>
        <div class="sidebar-footer"><button id="btn-show-settings" class="material-symbols-outlined">settings</button></div>
    `;

    // Main Content
    mainContent.innerHTML = `
        <div id="asset-manager" class="docked-top">
            <div class="asset-manager-header"><span>Asset Manager</span></div>
            <div class="asset-manager-content"></div>
        </div>
        <div id="message-container"></div>
        <div id="chat-input-container">
            <span contenteditable="true" placeholder="Send a message..." id="message-input"></span>
            <button id="btn-send-message" class="material-symbols-outlined">send</button>
        </div>
    `;

    // Right Inspector
    rightInspector.innerHTML = `
        <div class="sidebar-header">
            <h3 id="inspector-title">Inspector</h3>
            <button id="right-sidebar-toggle" class="sidebar-toggle-btn material-symbols-outlined">close_fullscreen</button>
        </div>
        <div id="inspector-content" class="sidebar-content-container"><p>Select a personality or click the settings icon.</p></div>
    `;

    console.log("Static UI rendered successfully.");
}


// --- STAGE 4: INITIALIZE FUNCTIONALITY ---

// --- Resizable Sidebar Logic (Upgraded for both sides) ---
function makeResizable(handle, side) {
    handle.addEventListener('mousedown', function(e) {
        e.preventDefault();
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        const containerRect = appContainer.getBoundingClientRect();
        const minWidth = 100; // Minimum width in pixels for sidebars

        if (side === 'left') {
            let newLeftWidth = e.clientX - containerRect.left;
            if (newLeftWidth < minWidth) newLeftWidth = minWidth;
            // Update the grid, keeping the right sidebar's width fixed during the drag
            appContainer.style.gridTemplateColumns = `${newLeftWidth}px 10px 1fr 10px ${rightInspector.offsetWidth}px`;
        } else if (side === 'right') {
            let newRightWidth = containerRect.right - e.clientX;
            if (newRightWidth < minWidth) newRightWidth = minWidth;
            // Update the grid, keeping the left sidebar's width fixed during the drag
            appContainer.style.gridTemplateColumns = `${leftSidebar.offsetWidth}px 10px 1fr 10px ${newRightWidth}px`;
        }
    }

    function onMouseUp() {
        // When drag is finished, convert all widths back to flexible 'fr' units
        const leftWidth = leftSidebar.offsetWidth;
        const rightWidth = rightInspector.offsetWidth;
        // Calculate the remaining space for the main content
        const mainWidth = appContainer.offsetWidth - leftWidth - rightWidth - 20; // 20px for the two handles

        appContainer.style.gridTemplateColumns = `${leftWidth}fr 10px ${mainWidth}fr 10px ${rightWidth}fr`;
        
        // Clean up the global event listeners
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

// --- Collapsible Sidebar Logic ---
function initializeToggles() {
    const leftToggleBtn = document.getElementById('left-sidebar-toggle');
    const rightToggleBtn = document.getElementById('right-sidebar-toggle');

    leftToggleBtn.addEventListener('click', () => {
        appContainer.classList.toggle('left-sidebar-collapsed');
        leftToggleBtn.textContent = appContainer.classList.contains('left-sidebar-collapsed') ? 'open_fullscreen' : 'close_fullscreen';
    });

    rightToggleBtn.addEventListener('click', () => {
        appContainer.classList.toggle('right-sidebar-collapsed');
        rightToggleBtn.textContent = appContainer.classList.contains('right-sidebar-collapsed') ? 'open_fullscreen' : 'close_fullscreen';
    });
    console.log("Sidebar toggle logic initialized.");
}


// --- STAGE 5: EXECUTE EVERYTHING ---
renderStaticUI();
// Activate the resizer for BOTH handles now
makeResizable(leftResizeHandle, 'left');
makeResizable(rightResizeHandle, 'right');
initializeToggles();

console.log("All UI functionality initialized.");