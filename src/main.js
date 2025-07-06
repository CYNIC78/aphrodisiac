/* Aphrodisiac v3 - main.js */
/* This is the new, clean entry point for our application. */

// Step 1: Import the new, master stylesheet.
// Vite will see this and correctly bundle our entire CSS structure.
import './styles/main.css';


// Step 2: We will re-add the service initializations and event listeners
// one by one as we rebuild the functionality. For now, we just want to see the layout.

console.log("Aphrodisiac v3 Initialized. CSS should be loaded.");

// --- Sidebar Toggle Logic ---

// 1. Get references to our primary elements
const appContainer = document.getElementById('app-container');
const leftToggleBtn = document.getElementById('left-sidebar-toggle');
const rightToggleBtn = document.getElementById('right-sidebar-toggle');

/**
 * Toggles a sidebar's collapsed state and updates its button icon.
 * @param {'left' | 'right'} side - The sidebar to toggle.
 */
function toggleSidebar(side) {
    const isLeft = side === 'left';
    // Determine the correct class name and button based on the side
    const className = isLeft ? 'left-sidebar-collapsed' : 'right-sidebar-collapsed';
    const button = isLeft ? leftToggleBtn : rightToggleBtn;
    
    // Add or remove the collapsed class on the main app container
    appContainer.classList.toggle(className);
    
    // Check if the sidebar is now collapsed
    const isCollapsed = appContainer.classList.contains(className);
    
    // Update the button's icon to reflect the new state
    if (isCollapsed) {
        button.textContent = 'open_fullscreen'; // Icon to show when collapsed
    } else {
        button.textContent = 'close_fullscreen'; // Icon to show when expanded
    }
}

// 3. Attach the toggle function to the click event of each button
leftToggleBtn.addEventListener('click', () => toggleSidebar('left'));
rightToggleBtn.addEventListener('click', () => toggleSidebar('right'));

console.log('Sidebar toggle logic initialized.');


// --- Resizable Sidebar Logic ---

function makeResizable(handleId, leftPanelId, rightPanelId) {
    const handle = document.getElementById(handleId);
    const leftPanel = document.getElementById(leftPanelId);
    const rightPanel = document.getElementById(rightPanelId);

    handle.addEventListener('mousedown', function(e) {
        e.preventDefault(); // Prevent text selection during drag

        // Add event listeners to the whole window
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        const containerRect = appContainer.getBoundingClientRect();
        const leftPanelRect = leftPanel.getBoundingClientRect();

        // Calculate the new width of the left panel based on mouse position
        let newLeftWidth = e.clientX - containerRect.left;

        // Enforce a minimum width to prevent sidebars from disappearing
        const minWidth = 100; // 100 pixels
        if (newLeftWidth < minWidth) {
            newLeftWidth = minWidth;
        }

        // Apply the new widths to the grid layout using pixel values
        // This is more stable during the drag operation
        appContainer.style.gridTemplateColumns = `${newLeftWidth}px 10px 1fr 10px 1fr`;
    }

    function onMouseUp() {
        // IMPORTANT: When the drag is finished, convert pixel values back to flexible 'fr' units
        // This makes the layout responsive again to window resizing.
        const leftWidth = leftPanel.offsetWidth;
        const rightWidth = rightPanel.offsetWidth;
        const mainWidth = appContainer.offsetWidth - leftWidth - rightWidth - 20; // 20 for 2 handles

        appContainer.style.gridTemplateColumns = `${leftWidth}fr 10px ${mainWidth}fr 10px ${rightWidth}fr`;

        // Clean up the event listeners
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
    }
}

// Activate the resizable functionality
// NOTE: We'll need to adapt this when we add the right handle
makeResizable('left-resize-handle', 'left-sidebar', 'main-content');
// We will add the logic for the right handle next. Let's test this one first.

console.log('Resizable sidebar logic initialized.');