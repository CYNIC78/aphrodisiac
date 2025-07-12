// FILE: src/components/AssetManager.component.js
// --- REFACTORED FOR V4 "FRAMED OVERLAY" VIEW (v11.0) ---

import { assetManagerService } from '../services/AssetManager.service.js';

// --- CONSTANTS ---
const SYSTEM_TAGS = ['avatar', 'sfx', 'audio', 'image'];

// --- STATE MANAGEMENT ---
let isInitialized = false;
let activeTags = []; // Holds the currently selected tags for filtering
let allDbTags = [];  // A cache of all unique tags from the database
let currentCharacterId = null; // To hold the ID of the currently active personality

// --- UI ELEMENT REFERENCES ---
let mediaLibraryStep; 

// --- RENDERING LOGIC ---

function renderTagExplorer(filterTerm = '') {
    const listEl = document.querySelector('#tag-explorer-list');
    if (!listEl) return;

    const lowerCaseFilter = filterTerm.toLowerCase();
    const tagsToRender = allDbTags.filter(tag => tag.toLowerCase().includes(lowerCaseFilter));
    
    listEl.innerHTML = '';
    tagsToRender.forEach(tag => {
        const item = document.createElement('button');
        item.className = 'tag-explorer-item';
        item.textContent = tag;
        item.onclick = () => handleTagClick(tag);
        
        if (activeTags.includes(tag)) {
            item.classList.add('selected');
        }
        
        listEl.appendChild(item);
    });
}

async function renderGallery() {
    const galleryEl = document.querySelector('#asset-manager-gallery');
    const titleEl = document.querySelector('#gallery-title');
    if (!galleryEl || !titleEl) return;

    if (currentCharacterId === null) {
        galleryEl.innerHTML = `<p class="gallery-empty-placeholder">Create a personality to use its media library.</p>`;
        titleEl.textContent = 'Media Library';
        return;
    }

    galleryEl.innerHTML = '<p class="gallery-empty-placeholder">Loading...</p>';
    
    try {
        const allAssets = await assetManagerService.getAllAssetsForCharacter(currentCharacterId);
        const assetsToRender = activeTags.length === 0
            ? allAssets
            : allAssets.filter(asset => activeTags.every(tag => asset.tags.includes(tag)));

        titleEl.textContent = activeTags.length > 0 ? `Tagged: ${activeTags.join(', ')}` : 'All Assets';

        galleryEl.innerHTML = '';
        if (assetsToRender.length === 0) {
            galleryEl.innerHTML = `<p class="gallery-empty-placeholder">No assets found for this personality.</p>`;
            return;
        }

        assetsToRender.forEach(asset => {
            const card = createAssetCard(asset);
            galleryEl.appendChild(card);
        });

    } catch (error) {
        console.error("Failed to render gallery:", error);
        galleryEl.innerHTML = `<p class="gallery-empty-placeholder">Error loading assets.</p>`;
    }
}

/**
 * Creates the "Framed Overlay" asset card.
 * @param {object} asset - The asset object from the database.
 * @returns {HTMLElement} The fully interactive card element.
 */
function createAssetCard(asset) {
    const card = document.createElement('div');
    card.className = 'asset-card-inline';

    // --- PART 1: The Preview Area ---
    const previewContainer = document.createElement('div');
    previewContainer.className = 'asset-card-inline-preview';

    if (asset.type === 'image') {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(asset.data);
        img.alt = asset.name;
        previewContainer.appendChild(img);
    } else {
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined asset-icon';
        icon.textContent = 'music_note';
        previewContainer.appendChild(icon);
    }

    // --- NEW: TOP OVERLAY for System Tags (Your brilliant idea!) ---
    const systemTags = asset.tags.filter(tag => SYSTEM_TAGS.includes(tag));
    if (systemTags.length > 0) {
        const topOverlay = document.createElement('div');
        topOverlay.className = 'asset-card-top-overlay'; // New specific class
        systemTags.forEach(tag => {
            const pill = document.createElement('div');
            pill.className = 'tag-pill tag-system';
            pill.textContent = tag;
            topOverlay.appendChild(pill);
        });
        previewContainer.appendChild(topOverlay);
    }
    
    // --- NEW: BOTTOM OVERLAY for Filename ---
    const bottomOverlay = document.createElement('div');
    bottomOverlay.className = 'asset-card-bottom-overlay'; // New specific class
    const filenameEl = document.createElement('div');
    filenameEl.className = 'asset-card-filename';
    filenameEl.textContent = asset.name;
    bottomOverlay.appendChild(filenameEl);
    previewContainer.appendChild(bottomOverlay);

    card.appendChild(previewContainer);

    // --- PART 2: The Info Area (Custom Triggers Only) ---
    const infoContainer = document.createElement('div');
    infoContainer.className = 'asset-card-inline-info';

    const customTags = asset.tags.filter(tag => !SYSTEM_TAGS.includes(tag));
    const customPillsContainer = document.createElement('div');
    customPillsContainer.className = 'tag-pills-container';

    customTags.forEach(tag => {
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        pill.textContent = tag;
        const removeBtn = document.createElement('span');
        removeBtn.className = 'remove-tag';
        removeBtn.innerHTML = '×';
        removeBtn.title = `Remove tag "${tag}"`;
        removeBtn.onclick = (e) => {
            e.stopPropagation();
            handleRemoveTagFromAsset(asset.id, tag);
        };
        pill.appendChild(removeBtn);
        customPillsContainer.appendChild(pill);
    });

    infoContainer.appendChild(customPillsContainer);

    // Smart input
    const addTagInput = document.createElement('input');
    addTagInput.type = 'text';
    addTagInput.placeholder = '+ Add trigger';
    addTagInput.className = 'asset-card-inline-input';
    addTagInput.onclick = (e) => e.stopPropagation();
    const saveTag = () => {
        if (addTagInput.value.trim() !== '') {
            handleAddTagToAsset(asset.id, addTagInput);
        }
    };
    addTagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTag();
            addTagInput.blur();
        }
    });
    addTagInput.addEventListener('blur', saveTag);
    infoContainer.appendChild(addTagInput);
    card.appendChild(infoContainer);

    // --- PART 3: The Delete Button ---
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'asset-card-inline-delete-btn btn-danger';
    deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
    deleteBtn.title = 'Delete Asset';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        handleDeleteAsset(asset.id);
    };
    card.appendChild(deleteBtn);

    return card;
}


// --- EVENT HANDLERS (Unchanged) ---

function handleTagClick(tag) {
    const tagIndex = activeTags.indexOf(tag);
    if (tagIndex > -1) {
        activeTags.splice(tagIndex, 1);
    } else {
        activeTags.push(tag);
    }
    
    renderTagExplorer(document.querySelector('#tag-explorer-search').value);
    renderGallery();
}

async function handleAddTagToAsset(assetId, inputElement) {
    const newTag = inputElement.value.trim().toLowerCase();
    if (!newTag || !assetId) return;

    if (SYSTEM_TAGS.includes(newTag)) {
        alert("Cannot add a protected system tag manually.");
        return;
    }

    const asset = await assetManagerService.getAssetById(assetId);
    if (asset && !asset.tags.includes(newTag)) {
        const updatedUserTags = [...asset.tags.filter(t => !SYSTEM_TAGS.includes(t)), newTag];
        await assetManagerService.updateAsset(assetId, { tags: updatedUserTags });
        
        inputElement.value = '';
        await updateMainUI(currentCharacterId);
        allDbTags = await assetManagerService.getAllUniqueTagsForCharacter(currentCharacterId);
        renderTagExplorer();
    }
}

async function handleRemoveTagFromAsset(assetId, tagToRemove) {
    if (SYSTEM_TAGS.includes(tagToRemove)) {
        console.warn("Attempted to remove a protected system tag. Action blocked.");
        return;
    }
    if (!assetId) return;

    const asset = await assetManagerService.getAssetById(assetId);
    if (asset) {
        const updatedUserTags = asset.tags.filter(t => t !== tagToRemove && !SYSTEM_TAGS.includes(t));
        await assetManagerService.updateAsset(assetId, { tags: updatedUserTags });

        await updateMainUI(currentCharacterId);
        allDbTags = await assetManagerService.getAllUniqueTagsForCharacter(currentCharacterId);
        renderTagExplorer();
    }
}

async function handleDeleteAsset(assetId) {
    if (!assetId) return;
    if (confirm(`Are you sure you want to permanently delete this asset?`)) {
        // First, delete the asset from the database
        await assetManagerService.deleteAsset(assetId);

        // --- SURGICAL REFRESH ---
        // Now, we'll gently update the UI instead of using the "hard reset" updateMainUI function.
        
        // 1. Re-fetch the master list of tags, as one might have disappeared.
        allDbTags = await assetManagerService.getAllUniqueTagsForCharacter(currentCharacterId);
        
        // 2. Re-render the tag explorer on the left.
        renderTagExplorer(document.querySelector('#tag-explorer-search')?.value || '');

        // 3. Re-render the asset gallery on the right, respecting the current filters.
        await renderGallery();
    }
}

async function updateMainUI(characterId) {
    currentCharacterId = characterId;
    activeTags = []; 
    if (currentCharacterId === null) {
        allDbTags = [];
    } else {
        allDbTags = await assetManagerService.getAllUniqueTagsForCharacter(currentCharacterId);
    }
    renderTagExplorer(document.querySelector('#tag-explorer-search')?.value || '');
    renderGallery();
}

// --- INITIALIZATION (Unchanged) ---
export function initializeAssetManagerComponent(characterId) {
    if (isInitialized) {
        updateMainUI(characterId);
        return;
    }

    mediaLibraryStep = document.querySelector('#media-library-step');
    if (!mediaLibraryStep) return;

    document.querySelector('#tag-explorer-search').addEventListener('input', (e) => renderTagExplorer(e.target.value));
    document.querySelector('#btn-upload-asset').addEventListener('click', () => document.querySelector('#asset-upload-input').click());
    
    document.querySelector('#asset-upload-input').addEventListener('change', async (event) => {
        const files = event.target.files;
        if (!files.length || currentCharacterId === null) return;
        for (const file of files) {
            try {
                await assetManagerService.addAsset(file, [], currentCharacterId);
            } catch (error) { console.error('Failed to add asset:', error); }
        }
        event.target.value = ''; 
        await updateMainUI(currentCharacterId);
    });
    
    updateMainUI(characterId);

    console.log('Asset Manager Component Initialized (v11.0 - Framed Overlay).');
    isInitialized = true;
}