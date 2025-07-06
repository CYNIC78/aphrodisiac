/* Aphrodisiac v3 - main.js */
/* The Hardened Layout Engine: Smooth, performant, and bug-free. */

// --- STAGE 1: INITIALIZE STYLES ---
import './styles/main.css';
console.log("Aphrodisiac v3 Initialized. CSS loaded.");

// --- STAGE 2: GET REFERENCES TO CORE ELEMENTS ---
const appContainer = document.getElementById('app-container');
const leftSidebar = document.getElementById('left-sidebar');
const rightInspector = document.getElementById('right-inspector');
const leftResizeHandle = document.getElementById('left-resize-handle');
const rightResizeHandle = document.getElementById('right-resize-handle');
let mainContent, leftToggleBtn, rightToggleBtn;

// --- The Master Layout Function (Unchanged) ---
function updateGridLayout() {
    const isLeftCollapsed = appContainer.classList.contains('left-sidebar-collapsed');
    const isRightCollapsed = appContainer.classList.contains('right-sidebar-collapsed');
    
    const leftWidth = isLeftCollapsed ? '60px' : leftSidebar.style.width || '280px';
    const rightWidth = isRightCollapsed ? '60px' : rightInspector.style.width || '320px';

    appContainer.style.gridTemplateColumns = `${leftWidth} 10px 1fr 10px ${rightWidth}`;
}

// --- STAGE 3: RENDER STATIC UI ---
function renderStaticUI() {
    // ... (This function is large and correct, so I'll abbreviate it for clarity)
    leftSidebar.innerHTML = `<div class="sidebar-header"><h3>Aphrodisiac</h3><button id="left-sidebar-toggle" class="sidebar-toggle-btn material-symbols-outlined">close_fullscreen</button></div><div class="sidebar-section"><div class="section-header"><h4>Chats</h4><button id="btn-new-chat" class="material-symbols-outlined">add_comment</button></div><div id="chat-list-container" class="section-content"></div></div><div class="sidebar-section"><div class="section-header"><h4>Personalities</h4><button id="btn-add-personality" class="material-symbols-outlined">person_add</button></div><div id="personality-list-container" class="section-content"></div></div><div class="sidebar-footer"><button id="btn-show-settings" class="material-symbols-outlined">settings</button></div>`;
    document.getElementById('main-content').innerHTML = `<div id="asset-manager" class="docked-top"><div class="asset-manager-header"><span>Asset Manager</span></div><div class="asset-manager-content"></div></div><div id="message-container"></div><div id="chat-input-container"><span contenteditable="true" placeholder="Send a message..." id="message-input"></span><button id="btn-send-message" class="material-symbols-outlined">send</button></div>`;
    rightInspector.innerHTML = `<div class="sidebar-header"><h3 id="inspector-title">Inspector</h3><button id="right-sidebar-toggle" class="sidebar-toggle-btn material-symbols-outlined">close_fullscreen</button></div><div id="inspector-content" class="sidebar-content-container"><p>Select a personality or click the settings icon.</p></div>`;
    
    mainContent = document.getElementById('main-content');
    leftToggleBtn = document.getElementById('left-sidebar-toggle');
    rightToggleBtn = document.getElementById('right-sidebar-toggle');
}

// --- STAGE 4: INITIALIZE FUNCTIONALITY (UPGRADED) ---

// --- Performant Resizer with requestAnimationFrame ---
function makeResizable(handle, side) {
    const minSidebarWidth = 150;
    const maxSidebarPercentage = 0.4;
    let animationFrameId = null;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        // If there's a pending animation frame, cancel it
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        // Request the browser to perform the resize on the next available frame
        animationFrameId = requestAnimationFrame(() => {
            performResize(e);
        });
    }

    function performResize(e) {
        const maxSidebarWidth = window.innerWidth * maxSidebarPercentage;
        let newWidth;

        if (side === 'left') {
            newWidth = e.clientX;
            if (newWidth < minSidebarWidth) newWidth = minSidebarWidth;
            if (newWidth > maxSidebarWidth) newWidth = maxSidebarWidth;
            leftSidebar.style.width = `${newWidth}px`;
        } else if (side === 'right') {
            newWidth = window.innerWidth - e.clientX;
            if (newWidth < minSidebarWidth) newWidth = minSidebarWidth;
            if (newWidth > maxSidebarWidth) newWidth = maxSidebarWidth;
            rightInspector.style.width = `${newWidth}px`;
        }
        updateGridLayout();
    }

    function onMouseUp() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

// --- Bug-Free Toggles ---
function initializeToggles() {
    leftToggleBtn.addEventListener('click', () => {
        // FIX: Reset the inline width style before collapsing
        leftSidebar.style.width = ''; 
        appContainer.classList.toggle('left-sidebar-collapsed');
        leftToggleBtn.textContent = appContainer.classList.contains('left-sidebar-collapsed') ? 'open_fullscreen' : 'close_fullscreen';
        updateGridLayout();
    });

    rightToggleBtn.addEventListener('click', () => {
        // FIX: Reset the inline width style before collapsing
        rightInspector.style.width = '';
        appContainer.classList.toggle('right-sidebar-collapsed');
        rightToggleBtn.textContent = appContainer.classList.contains('right-sidebar-collapsed') ? 'open_fullscreen' : 'close_fullscreen';
        updateGridLayout();
    });
    console.log("Sidebar toggle logic initialized.");
}

// --- STAGE 5: EXECUTE EVERYTHING ---
renderStaticUI();
makeResizable(leftResizeHandle, 'left');
makeResizable(rightResizeHandle, 'right');
initializeToggles();
updateGridLayout();