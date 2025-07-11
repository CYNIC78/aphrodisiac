// FILE: src/components/ResizableSidebar.component.js

// Self-invoking function to encapsulate the logic
(() => {
    // Check if we are on a touch device; if so, this feature is not needed.
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
        return;
    }

    const sidebar = document.querySelector('.sidebar');
    const resizer = document.querySelector('#sidebar-resizer');
    const container = document.querySelector('.container');

    // If any of the required elements don't exist, exit.
    if (!sidebar || !resizer || !container) {
        console.warn('ResizableSidebar: Required elements not found. Feature disabled.');
        return;
    }

    // --- Configuration ---
    const minWidth = 280; // Minimum width of the sidebar in pixels
    const maxWidth = 600; // Maximum width of the sidebar in pixels
    const storageKey = 'aphrodisiac_sidebar_width';

    // --- State ---
    let isResizing = false;

    // --- Functions ---

    /**
     * Applies a given width to the sidebar by setting a CSS variable.
     * @param {number} width - The width in pixels.
     */
    const applyWidth = (width) => {
        // Enforce min and max limits
        const newWidth = Math.max(minWidth, Math.min(width, maxWidth));
        container.style.setProperty('--sidebar-width', `${newWidth}px`);
    };

    /**
     * Loads the saved width from localStorage and applies it.
     */
    const loadSavedWidth = () => {
        const savedWidth = localStorage.getItem(storageKey);
        if (savedWidth) {
            applyWidth(parseInt(savedWidth, 10));
        }
    };

    /**
     * Handles the mouse move event during resizing.
     * @param {MouseEvent} e - The mouse event.
     */
    const onMouseMove = (e) => {
        if (!isResizing) return;

        // Use requestAnimationFrame for smoother rendering during drag
        requestAnimationFrame(() => {
            // Get the horizontal position of the mouse relative to the container's start
            const containerRect = container.getBoundingClientRect();
            const newWidth = e.clientX - containerRect.left;
            applyWidth(newWidth);
        });
    };

    /**
     * Handles the mouse up event to stop resizing.
     */
    const onMouseUp = () => {
        if (!isResizing) return;
        
        isResizing = false;
        resizer.classList.remove('is-dragging');
        document.body.style.cursor = ''; // Reset cursor
        document.body.style.userSelect = ''; // Re-enable text selection

        // Remove the global event listeners
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Save the final width to localStorage
        const finalWidth = sidebar.offsetWidth;
        localStorage.setItem(storageKey, finalWidth);
    };

    /**
     * Handles the mouse down event to start resizing.
     */
    const onMouseDown = () => {
        isResizing = true;
        resizer.classList.add('is-dragging');
        document.body.style.cursor = 'col-resize'; // Apply resize cursor to the whole page
        document.body.style.userSelect = 'none';   // Disable text selection globally during drag

        // Add global listeners to track mouse movement anywhere on the page
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    // --- Initialization ---

    // Attach the initial event listener to the resizer handle
    resizer.addEventListener('mousedown', onMouseDown);

    // Load any previously saved sidebar width on startup
    loadSavedWidth();
})();