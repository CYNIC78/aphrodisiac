import * as assetManagerService from '../services/AssetManager.service.js';

// --- DOM Elements ---
const uploadButton = document.querySelector('#btn-upload-asset');
const fileInput = document.querySelector('#asset-upload-input');
const gallery = document.querySelector('#asset-manager-gallery');
const searchInput = document.querySelector('#asset-search-input');

/**
 * Handles the event when the user clicks the main upload button.
 * It programmatically clicks the hidden file input element.
 */
function onUploadButtonClick() {
    fileInput.click();
}

/**
 * Handles the 'change' event on the file input. This is triggered after
 * the user selects files from their computer.
 * @param {Event} event The file input change event.
 */
function onFileSelected(event) {
    const files = event.target.files;
    if (!files.length) {
        console.log("No files selected.");
        return;
    }

    console.log("Files selected:", files);
    // In the future, this will call the service to process and save the files.
    // For now, we just log them.

    // Important: Reset the input value to allow re-uploading the same file
    fileInput.value = '';
}


// --- Event Listeners ---
if (uploadButton && fileInput) {
    uploadButton.addEventListener('click', onUploadButtonClick);
    fileInput.addEventListener('change', onFileSelected);
} else {
    console.error("Asset Manager UI elements not found. Check index.html IDs.");
}

// More logic for rendering the gallery and handling search will go here later.