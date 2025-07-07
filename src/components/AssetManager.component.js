import { assetManagerService } from '../services/AssetManager.service.js';
import { showElement, hideElement } from '../utils/helpers.js';

let isInitialized = false;

// UI Elements
let personalityForm, assetDetailView;
let currentAssetId = null; // State to track the currently viewed asset

// --- HELPER FUNCTIONS ---

// A simple debounce helper to prevent excessive function calls
function debounce(func, delay) {
    let timeout;
    return function(...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), delay);
    };
}

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

// --- RENDERING FUNCTIONS ---

// Renders the tag pills for the current asset in the detail view
function renderTags(tags = []) {
    const tagsContainer = assetDetailView.querySelector('#asset-detail-tags');
    tagsContainer.innerHTML = '';
    tags.forEach(tag => {
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        pill.textContent = tag;
        
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-tag';
        removeBtn.innerHTML = '×';
        removeBtn.onclick = () => handleRemoveTag(tag);

        pill.appendChild(removeBtn);
        tagsContainer.appendChild(pill);
    });
}

/**
 * Renders the main gallery. Can be filtered by a search term.
 * @param {string} [searchTerm] - An optional term to filter assets by.
 */
async function renderGallery(searchTerm = '') {
    const gallery = document.querySelector('#asset-manager-gallery');
    if (!gallery) return;

    gallery.innerHTML = '';
    const assets = await assetManagerService.searchAssets(searchTerm);

    if (assets.length === 0) {
        gallery.innerHTML = `<p class="gallery-empty-placeholder">No assets found.</p>`;
        return;
    }

    assets.forEach(asset => {
        const card = createAssetCard(asset);
        gallery.appendChild(card);
    });
}

// Creates a single asset card for the main gallery
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
    } else {
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

// --- EVENT HANDLERS ---

async function handleAddTag() {
    const input = document.querySelector('#add-tag-input');
    const newTag = input.value.trim();
    if (!newTag || !currentAssetId) return;

    const asset = await assetManagerService.getAssetById(currentAssetId);
    if (asset && !asset.tags.includes(newTag)) {
        const updatedTags = [...asset.tags, newTag];
        await assetManagerService.updateAsset(currentAssetId, { tags: updatedTags });
        renderTags(updatedTags);
        input.value = '';
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
        await renderGallery();
    }
}

// --- INITIALIZATION ---

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
    const searchInput = document.querySelector('#asset-search-input'); // ** THE SEARCH BAR **
    const backToLibraryBtn = document.querySelector('#btn-asset-detail-back');
    const addTagBtn = document.querySelector('#btn-add-tag');
    const addTagInput = document.querySelector('#add-tag-input');
    const deleteAssetBtn = document.querySelector('#btn-delete-asset');

    if (!uploadButton) return;

    // --- Wire up all event listeners ---
    
    // Search listener (debounced for performance)
    searchInput.addEventListener('input', debounce((e) => renderGallery(e.target.value), 300));
    
    // Detail view listeners
    backToLibraryBtn.addEventListener('click', () => showView(personalityForm));
    addTagBtn.addEventListener('click', handleAddTag);
    addTagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAddTag(); });
    deleteAssetBtn.addEventListener('click', handleDeleteAsset);
    
    // Upload listeners
    uploadButton.addEventListener('click', () => fileInput.click());
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
        searchInput.value = ''; // Clear search after upload
        await renderGallery(); // Re-render all assets
    });
    
    // Initial render when component loads
    renderGallery();

    console.log('Asset Manager Component Initialized.');
    isInitialized = true;
}