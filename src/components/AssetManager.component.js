import { assetManagerService } from '../services/AssetManager.service.js';
import { showElement, hideElement } from '../utils/helpers.js';

let isInitialized = false;

// UI Elements
let personalityForm, assetDetailView;
let currentAssetId = null; // State to track the currently viewed asset

// Helper to switch between the main gallery and the detail view
function showView(viewToShow) {
    const views = [personalityForm, assetDetailView];
    views.forEach(view => {
        if (view === viewToShow) {
            showElement(view, false);
        } else {
            hideElement(view);
        }
    });
}

// Renders the tag pills for the current asset
function renderTags(tags = []) {
    const tagsContainer = assetDetailView.querySelector('#asset-detail-tags');
    tagsContainer.innerHTML = ''; // Clear existing tags
    tags.forEach(tag => {
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        pill.textContent = tag;
        
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-tag';
        removeBtn.innerHTML = '×'; // The 'x' character
        removeBtn.onclick = () => handleRemoveTag(tag);

        pill.appendChild(removeBtn);
        tagsContainer.appendChild(pill);
    });
}

// Show the detail view for a specific asset
async function showAssetDetailView(assetId) {
    currentAssetId = assetId; // IMPORTANT: Set the current asset ID
    const asset = await assetManagerService.getAssetById(assetId);
    if (!asset) {
        console.error(`Asset with ID ${assetId} not found.`);
        return;
    }

    // Populate the detail view
    const previewEl = assetDetailView.querySelector('#asset-detail-preview');
    const nameEl = assetDetailView.querySelector('#asset-detail-name');
    
    previewEl.innerHTML = '';
    if (asset.type === 'image') {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(asset.data);
        previewEl.appendChild(img);
    } else {
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined asset-icon-large';
        icon.textContent = 'music_note';
        previewEl.appendChild(icon);
    }
    nameEl.textContent = asset.name;
    renderTags(asset.tags); // Render the tags
    showView(assetDetailView);
}

// Event Handlers for Tag and Asset management
async function handleAddTag() {
    const input = document.querySelector('#add-tag-input');
    const newTag = input.value.trim();
    if (!newTag || !currentAssetId) return;

    const asset = await assetManagerService.getAssetById(currentAssetId);
    if (asset && !asset.tags.includes(newTag)) {
        const updatedTags = [...asset.tags, newTag];
        await assetManagerService.updateAsset(currentAssetId, { tags: updatedTags });
        renderTags(updatedTags);
        input.value = ''; // Clear input
    }
}

async function handleRemoveTag(tagToRemove) {
    if (!currentAssetId) return;

    const asset = await assetManagerService.getAssetById(currentAssetId);
    if (asset) {
        const updatedTags = asset.tags.filter(t => t !== tagToRemove);
        await assetManagerService.updateAsset(currentAssetId, { tags: updatedTags });
        renderTags(updatedTags);
    }
}

async function handleDeleteAsset() {
    if (!currentAssetId) return;

    if (confirm(`Are you sure you want to permanently delete this asset?`)) {
        await assetManagerService.deleteAsset(currentAssetId);
        currentAssetId = null;
        showView(personalityForm);
        await renderGallery(); // Refresh the main gallery
    }
}


// Creates an HTML element for a single asset card.
function createAssetCard(asset) {
    const card = document.createElement('div');
    card.className = 'asset-card';
    card.dataset.assetId = asset.id;
    card.addEventListener('click', () => showAssetDetailView(asset.id));

    if (asset.type === 'image') {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(asset.data);
        img.alt = asset.name;
        card.appendChild(img);
    } else if (asset.type === 'audio') {
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined asset-icon';
        icon.textContent = 'music_note';
        card.appendChild(icon);
    }

    const name = document.createElement('div');
    name.className = 'asset-name';
    name.textContent = asset.name;
    card.appendChild(name);

    return card;
}


async function renderGallery() {
    const gallery = document.querySelector('#asset-manager-gallery');
    if (!gallery) return;

    gallery.innerHTML = '';
    const assets = await assetManagerService.getAllAssets();

    if (assets.length === 0) {
        gallery.innerHTML = `<p class="gallery-empty-placeholder">Your media library is empty. Upload some files to get started!</p>`;
        return;
    }

    assets.forEach(asset => {
        const card = createAssetCard(asset);
        gallery.appendChild(card);
    });
}

export function initializeAssetManagerComponent() {
    if (isInitialized) {
        showView(personalityForm);
        renderGallery();
        return;
    }

    // Initialize DOM elements
    personalityForm = document.querySelector('#form-add-personality');
    assetDetailView = document.querySelector('#asset-detail-view');
    const uploadButton = document.querySelector('#btn-upload-asset');
    const fileInput = document.querySelector('#asset-upload-input');
    const backToLibraryBtn = document.querySelector('#btn-asset-detail-back');
    const addTagBtn = document.querySelector('#btn-add-tag');
    const addTagInput = document.querySelector('#add-tag-input');
    const deleteAssetBtn = document.querySelector('#btn-delete-asset');

    if (!uploadButton) return;

    // Wire up event listeners
    backToLibraryBtn.addEventListener('click', () => showView(personalityForm));
    addTagBtn.addEventListener('click', handleAddTag);
    addTagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAddTag();
    });
    deleteAssetBtn.addEventListener('click', handleDeleteAsset);
    
    uploadButton.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (!files.length) return;

        for (const file of files) {
            try {
                await assetManagerService.addAsset(file, ['new']);
            } catch (error) {
                console.error('Failed to add asset:', error);
                alert(`Could not add asset: ${file.name}. See console for details.`);
            }
        }
        
        event.target.value = ''; 
        await renderGallery();
    });
    
    renderGallery();

    console.log('Asset Manager Component Initialized.');
    isInitialized = true;
}