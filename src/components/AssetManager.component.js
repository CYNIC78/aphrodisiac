import { assetManagerService } from '../services/AssetManager.service.js';

let isInitialized = false;

export function initializeAssetManagerComponent() {
    if (isInitialized) return; // Prevent re-initializing

    const uploadButton = document.querySelector('#btn-upload-asset');
    const fileInput = document.querySelector('#asset-upload-input');
    const searchInput = document.querySelector('#asset-search-input');
    const gallery = document.querySelector('#asset-manager-gallery');

    if (!uploadButton) return; // Only run if the personality form is on screen

    // Trigger the hidden file input when the user clicks our custom button
    uploadButton.addEventListener('click', () => {
        fileInput.click();
    });

    // Handle file selection
    fileInput.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (!files.length) return;

        console.log(`${files.length} file(s) selected.`);

        // For now, we'll just log them. We will add saving logic next.
        for (const file of files) {
            // A simple example of adding an asset with a default tag
            try {
                const id = await assetManagerService.addAsset(file, ['new']);
                console.log(`Asset ${file.name} saved with ID: ${id}`);
            } catch (error) {
                console.error('Failed to add asset:', error);
            }
        }

        // We will add a function here to refresh the gallery view
        // renderGallery(); 
    });

    console.log('Asset Manager Component Initialized.');
    isInitialized = true;
}

// The self-invoking call has been removed.