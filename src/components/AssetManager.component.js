// FILE: src/components/AssetManager.component.js
// --- REFACTORED FOR V4 "FRAMED OVERLAY" VIEW (v11.0) ---

import { assetManagerService } from '../services/AssetManager.service.js';

// --- CONSTANTS ---
const SYSTEM_TAGS = ['avatar', 'sfx', 'audio', 'image'];

// --- STATE MANAGEMENT ---
let isInitialized = false;
let activeTags = []; // Holds the currently selected tags for filtering
let allDbTags = { characters: [], states: [] };  // A cache of all unique tags from the database
let currentCharacterId = null; // To hold the ID of the currently active personality
let selectedAssetIds = new Set(); // To track selected asset IDs

// --- UI ELEMENT REFERENCES ---
let mediaLibraryStep; 

// --- RENDERING LOGIC ---

function createTagButton(tag, clickHandler) {
    const item = document.createElement('button');
    item.className = 'tag-explorer-item';
    // Show 'kahlan' instead of 'char_kahlan' in the UI for cleanliness
    item.textContent = tag.startsWith('char_') ? tag.substring(5) : tag; 
    item.title = `Filter by ${tag}`;
    item.onclick = () => clickHandler(tag);
    
    if (activeTags.includes(tag)) {
        item.classList.add('selected');
    }

    // Add special class for styling, even though they are in a separate list
    if (tag.startsWith('char_')) {
        item.classList.add('tag-character');
    }
    
    return item;
}

function renderTagExplorer(filterTerm = '') {
    const charListEl = document.querySelector('#character-tag-list');
    const stateListEl = document.querySelector('#state-tag-list');
    if (!charListEl || !stateListEl) return;

    charListEl.innerHTML = '';
    stateListEl.innerHTML = '';

    const lowerCaseFilter = filterTerm.toLowerCase();

    // Filter and render character tags
    const charsToRender = allDbTags.characters.filter(tag => tag.substring(5).toLowerCase().includes(lowerCaseFilter));
    charsToRender.forEach(tag => {
        const button = createTagButton(tag, handleTagClick);
        charListEl.appendChild(button);
    });

    // Filter and render state tags
    const statesToRender = allDbTags.states.filter(tag => tag.toLowerCase().includes(lowerCaseFilter));
    statesToRender.forEach(tag => {
        const button = createTagButton(tag, handleTagClick);
        stateListEl.appendChild(button);
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
            galleryEl.innerHTML = `<p class="gallery-empty-placeholder">No assets found with the selected tags.</p>`;
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

function createAssetCard(asset) {
    const card = document.createElement('div');
    card.className = 'asset-card-inline';
    card.dataset.assetId = asset.id;
    if (selectedAssetIds.has(asset.id)) {
        card.classList.add('selected-asset');
    }

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

    const systemTags = asset.tags.filter(tag => SYSTEM_TAGS.includes(tag));
    if (systemTags.length > 0) {
        const topOverlay = document.createElement('div');
        topOverlay.className = 'asset-card-top-overlay';
        systemTags.forEach(tag => {
            const pill = document.createElement('div');
            pill.className = 'tag-pill tag-system';
            pill.textContent = tag;
            topOverlay.appendChild(pill);
        });
        previewContainer.appendChild(topOverlay);
    }
    
    const bottomOverlay = document.createElement('div');
    bottomOverlay.className = 'asset-card-bottom-overlay';
    const filenameEl = document.createElement('div');
    filenameEl.className = 'asset-card-filename';
    filenameEl.textContent = asset.name;
    bottomOverlay.appendChild(filenameEl);
    previewContainer.appendChild(bottomOverlay);

    card.appendChild(previewContainer);

    const infoContainer = document.createElement('div');
    infoContainer.className = 'asset-card-inline-info';

    const customTags = asset.tags.filter(tag => !SYSTEM_TAGS.includes(tag));
    const customPillsContainer = document.createElement('div');
    customPillsContainer.className = 'tag-pills-container';

    customTags.forEach(tag => {
        const pill = document.createElement('div');
        pill.className = 'tag-pill';
        pill.textContent = tag.startsWith('char_') ? tag.substring(5) : tag;
        
        if (tag.startsWith('char_')) {
            pill.classList.add('tag-character');
        }

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

    const addTagInput = document.createElement('input');
    addTagInput.type = 'text';
    addTagInput.placeholder = '+ Add tag';
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

    const deleteBtn = document.createElement('button');
	deleteBtn.type = 'button';
    deleteBtn.className = 'asset-card-inline-delete-btn btn-danger';
    deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
    deleteBtn.title = 'Delete Asset';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        handleDeleteAsset(asset.id);
    };
    card.appendChild(deleteBtn);

    card.addEventListener('click', () => {
        toggleAssetSelection(asset.id);
    });

    return card;
}


// --- EVENT HANDLERS ---

function updateBulkActionButtonState() {
    const hasSelection = selectedAssetIds.size > 0;
    const addTagBtn = document.querySelector('#btn-add-tag-selected');
    const deleteBtn = document.querySelector('#btn-delete-selected-assets');

    if (addTagBtn) addTagBtn.disabled = !hasSelection;
    if (deleteBtn) deleteBtn.disabled = !hasSelection;
}

function toggleAssetSelection(assetId) {
    const card = mediaLibraryStep.querySelector(`.asset-card-inline[data-asset-id="${assetId}"]`);
    if (!card) return;

    if (selectedAssetIds.has(assetId)) {
        selectedAssetIds.delete(assetId);
        card.classList.remove('selected-asset');
    } else {
        selectedAssetIds.add(assetId);
        card.classList.add('selected-asset');
    }
    updateBulkActionButtonState();
}

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
    let newTag = inputElement.value.trim().toLowerCase();
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
        const userTags = asset.tags.filter(t => !SYSTEM_TAGS.includes(t));
        const finalTags = userTags.filter(t => t !== tagToRemove);
        await assetManagerService.updateAsset(assetId, { tags: finalTags });

        await updateMainUI(currentCharacterId);
    }
}

async function handleAddTagToSelectedAssets() {
    if (selectedAssetIds.size === 0) return;

    const newTagRaw = prompt("Enter tag to add to selected assets (prefix with 'char:' for a character tag, e.g., 'char:emily'):");
    if (!newTagRaw || newTagRaw.trim() === '') return;

    let newTag = newTagRaw.trim().toLowerCase();

    // Standardize to char_ prefix if char: is used
    if (newTag.startsWith('char:')) {
        newTag = 'char_' + newTag.substring(5);
    }
    
    if (SYSTEM_TAGS.includes(newTag)) {
        alert(`Cannot add a protected system tag ("${newTag}") manually.`);
        return;
    }

    const assetsToUpdate = Array.from(selectedAssetIds);
    for (const assetId of assetsToUpdate) {
        const asset = await assetManagerService.getAssetById(assetId);
        if (asset && !asset.tags.includes(newTag)) {
            const userTags = asset.tags.filter(t => !SYSTEM_TAGS.includes(t));
            await assetManagerService.updateAsset(assetId, { tags: [...userTags, newTag] });
        }
    }

    selectedAssetIds.clear();
    await updateMainUI(currentCharacterId);
    alert(`Finished bulk-adding tag "${newTag}".`);
}

async function handleDeleteSelectedAssets() {
    if (selectedAssetIds.size === 0) return;
    if (!confirm(`Are you sure you want to permanently delete ${selectedAssetIds.size} selected asset(s)? This cannot be undone.`)) return;

    const assetsToDelete = Array.from(selectedAssetIds);
    for (const assetId of assetsToDelete) {
        await assetManagerService.deleteAsset(assetId);
    }

    selectedAssetIds.clear();
    await updateMainUI(currentCharacterId);
    alert(`Successfully deleted ${assetsToDelete.length} asset(s).`);
}

async function handleDeleteAsset(assetId) {
    if (!assetId) return;
    if (confirm(`Are you sure you want to permanently delete this asset?`)) {
        await assetManagerService.deleteAsset(assetId);
        await updateMainUI(currentCharacterId); 
    }
}

async function updateMainUI(characterId) {
    currentCharacterId = characterId;
    activeTags = []; 
    selectedAssetIds.clear();
    if (currentCharacterId === null) {
        allDbTags = { characters: [], states: [] };
    } else {
        allDbTags = await assetManagerService.getAllUniqueTagsForCharacter(currentCharacterId);
    }
    renderTagExplorer(document.querySelector('#tag-explorer-search')?.value || '');
    renderGallery();
    updateBulkActionButtonState();
}

// --- INITIALIZATION ---
export function initializeAssetManagerComponent(characterId) {
    if (isInitialized) {
        updateMainUI(characterId);
        return;
    }

    mediaLibraryStep = document.querySelector('#media-library-step');
    if (!mediaLibraryStep) return;

    document.querySelector('#tag-explorer-search').addEventListener('input', (e) => renderTagExplorer(e.target.value));
    document.querySelector('#btn-upload-asset').addEventListener('click', () => document.querySelector('#asset-upload-input').click());
    
    const selectAllBtn = document.querySelector('#btn-select-all-assets');
    const deselectAllBtn = document.querySelector('#btn-deselect-all-assets');
    const addTagSelectedBtn = document.querySelector('#btn-add-tag-selected'); 
    const deleteSelectedBtn = document.querySelector('#btn-delete-selected-assets'); 
    
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', async () => {
            const allAssets = await assetManagerService.getAllAssetsForCharacter(currentCharacterId);
            selectedAssetIds.clear();
            allAssets.forEach(asset => selectedAssetIds.add(asset.id));
            renderGallery();
            updateBulkActionButtonState();
        });
    }

    if (deselectAllBtn) {
        deselectAllBtn.addEventListener('click', () => {
            selectedAssetIds.clear();
            renderGallery();
            updateBulkActionButtonState();
        });
    }

    if (addTagSelectedBtn) {
        addTagSelectedBtn.addEventListener('click', handleAddTagToSelectedAssets);
    }

    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', handleDeleteSelectedAssets);
    }
    
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
    
    console.log('Asset Manager Component Initialized (Dual List v1.0).');
    isInitialized = true;
}
