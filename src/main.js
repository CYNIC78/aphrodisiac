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