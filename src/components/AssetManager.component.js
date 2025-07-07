import { assetManagerService } from '../services/AssetManager.service.js';
import { showElement, hideElement } from '../utils/helpers.js';

let isInitialized = false;

// UI Elements
let personalityForm, assetDetailView;
let currentAssetId = null; 

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

function renderTags(tags = []) {
    // ... This function remains the same
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

async function renderGallery(searchTerm = '') {
    // ... This function remains the same
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
    
    const preview = document.createElement('div');
    preview.className = 'asset-card-preview';
    preview.addEventListener('click', () => showAssetDetailView(asset.id));

    if (asset.type === 'image') {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(asset.data);
        img.alt = asset.name; // Alt text is still important for accessibility
        preview.appendChild(img);
    } else {
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined asset-icon';
        icon.textContent = 'music_note';
        preview.appendChild(icon);
    }
    card.appendChild(preview);

    // The info part of the card (tags only)
    const info = document.createElement('div');
    info.className = 'asset-card-info';

    // ===========================================
    // ==  FILENAME IS REMOVED FROM THIS VIEW   ==
    // ===========================================

    if (asset.tags && asset.tags.length > 0) {
        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'asset-card-tags';

        // ===========================================
        // ==     NOW RENDERS ALL TAGS            ==
        // ===========================================
        asset.tags.forEach(tag => { 
            const tagEl = document.createElement('span');
            tagEl.className = 'asset-card-tag';
            tagEl.textContent = tag;
            tagEl.addEventListener('click', (event) => {
                event.stopPropagation();
                handleTagClick(tag);
            });
            tagsContainer.appendChild(tagEl);
        });
        info.appendChild(tagsContainer);
    }
    card.appendChild(info);

    return card;
}

// Show the detail view for a specific asset
async function showAssetDetailView(assetId) {
    // ... This function remains unchanged
    currentAssetId = assetId;
    const asset = await assetManagerService.getAssetById(assetId);
    if (!asset) {
        console.error(`Asset with ID ${assetId} not found.`);
        return;
    }

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
    renderTags(asset.tags);
    showView(assetDetailView);
}

// --- EVENT HANDLERS ---

function handleTagClick(tag) {
    // ... This function remains unchanged
    const searchInput = document.querySelector('#asset-search-input');
    searchInput.value = tag;
    renderGallery(tag);
}

async function handleAddTag() {
    // ... This function remains unchanged
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
    // ... This function remains unchanged
    if (!currentAssetId) return;
    const asset = await assetManagerService.getAssetById(currentAssetId);
    if (asset) {
        const updatedTags = asset.tags.filter(t => t !== tagToRemove);
        await assetManagerService.updateAsset(currentAssetId, { tags: updatedTags });
        renderTags(updatedTags);
    }
}

async function handleDeleteAsset() {
    // ... This function remains unchanged
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
    // ... This function remains unchanged
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
    const searchInput = document.querySelector('#asset-search-input');
    const backToLibraryBtn = document.querySelector('#btn-asset-detail-back');
    const addTagBtn = document.querySelector('#btn-add-tag');
    const addTagInput = document.querySelector('#add-tag-input');
    const deleteAssetBtn = document.querySelector('#btn-delete-asset');

    if (!uploadButton) return;
    
    searchInput.addEventListener('input', debounce((e) => renderGallery(e.target.value), 300));
    
    backToLibraryBtn.addEventListener('click', () => {
        showView(personalityForm);
        renderGallery(searchInput.value); 
    });
    addTagBtn.addEventListener('click', handleAddTag);
    addTagInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAddTag(); });
    deleteAssetBtn.addEventListener('click', handleDeleteAsset);
    
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
        searchInput.value = '';
        await renderGallery();
    });
    
    renderGallery();

    console.log('Asset Manager Component Initialized.');
    isInitialized = true;
}