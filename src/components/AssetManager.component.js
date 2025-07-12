// FILE: src/components/AssetManager.component.js
// --- REFACTORED FOR INLINE ASSET MANAGEMENT ---

import { assetManagerService } from '../services/AssetManager.service.js';
import { showElement, hideElement } from '../utils/helpers.js';

// --- CONSTANTS ---
const SYSTEM_TAGS = ['avatar', 'sfx', 'audio', 'image'];

// --- STATE MANAGEMENT ---
let isInitialized = false;
let activeTags = []; // Holds the currently selected tags for filtering
let allDbTags = [];  // A cache of all unique tags from the database
let currentCharacterId = null; // To hold the ID of the currently active personality

// --- UI ELEMENT REFERENCES ---
// No longer need assetDetailView. personalityForm is only for context.
let personalityForm, mediaLibraryStep; 

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
 * Creates a single, self-contained asset card with all editing functionality built-in.
 * Replaces the old createAssetCard and the need for a separate detail view.
 * @param {object} asset - The asset object from the database.
 * @returns {HTMLElement} The fully interactive card element.
 */
function createAssetCard(asset) {
    const card = document.createElement('div');
    card.className = 'asset-card-inline'; // New class for new styling

    // 1. Preview Image/Icon
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
    card.appendChild(previewContainer);

    // 2. Info Container (Name, Tags, Inputs)
    const infoContainer = document.createElement('div');
    infoContainer.className = 'asset-card-inline-info';

    // 2a. Name
    const nameEl = document.createElement('p');
    nameEl.className = 'asset-card-inline-name';
    nameEl.textContent = asset.name;
    infoContainer.appendChild(nameEl);

    // --- RENDER TAGS (logic from old renderTagsInDetailView is now inline) ---
    const systemTags = asset.tags.filter(tag => SYSTEM_TAGS.includes(tag));
    const customTags = asset.tags.filter(tag => !SYSTEM_TAGS.includes(tag));

    // 2b. System Tags Section
    if (systemTags.length > 0) {
        const systemSection = document.createElement('div');
        systemSection.className = 'asset-card-inline-tag-section';
        const systemHeader = document.createElement('h5');
        systemHeader.textContent = 'System Command';
        systemSection.appendChild(systemHeader);
        const systemPillsContainer = document.createElement('div');
        systemPillsContainer.className = 'tag-pills-container';
        systemTags.forEach(tag => {
            const pill = document.createElement('div');
            pill.className = 'tag-pill tag-system';
            pill.textContent = tag;
            systemPillsContainer.appendChild(pill);
        });
        systemSection.appendChild(systemPillsContainer);
        infoContainer.appendChild(systemSection);
    }
    
    // 2c. Custom Triggers Section
    const customSection = document.createElement('div');
    customSection.className = 'asset-card-inline-tag-section';
    const customHeader = document.createElement('h5');
    customHeader.textContent = 'Your Custom Triggers';
    customSection.appendChild(customHeader);
    const customPillsContainer = document.createElement('div');
    customPillsContainer.className = 'tag-pills-container';
    if (customTags.length > 0) {
        customTags.forEach(tag => {
            const pill = document.createElement('div');
            pill.className = 'tag-pill';
            pill.textContent = tag;
            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-tag';
            removeBtn.innerHTML = '×';
            removeBtn.title = `Remove tag "${tag}"`;
            removeBtn.onclick = (e) => {
                e.stopPropagation(); // Prevent card click events
                handleRemoveTagFromAsset(asset.id, tag);
            };
            pill.appendChild(removeBtn);
            customPillsContainer.appendChild(pill);
        });
    } else {
        const noTagsMessage = document.createElement('p');
        noTagsMessage.className = 'asset-card-inline-no-tags-msg';
        noTagsMessage.textContent = 'No triggers yet. Add one below.';
        customPillsContainer.appendChild(noTagsMessage);
    }
    customSection.appendChild(customPillsContainer);
    infoContainer.appendChild(customSection);

    // 2d. Add Tag Form
    const addTagForm = document.createElement('div');
    addTagForm.className = 'asset-card-inline-add-tag-form';
    const addTagInput = document.createElement('input');
    addTagInput.type = 'text';
    addTagInput.placeholder = 'Add a trigger...';
    addTagInput.className = 'asset-card-inline-input';
    addTagInput.onclick = (e) => e.stopPropagation();
    addTagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddTagToAsset(asset.id, addTagInput);
        }
    });
    const addTagBtn = document.createElement('button');
    addTagBtn.textContent = 'Add';
    addTagBtn.className = 'asset-card-inline-add-btn';
    addTagBtn.onclick = (e) => {
        e.stopPropagation();
        handleAddTagToAsset(asset.id, addTagInput);
    };
    addTagForm.appendChild(addTagInput);
    addTagForm.appendChild(addTagBtn);
    infoContainer.appendChild(addTagForm);

    card.appendChild(infoContainer);

    // 3. Delete Button (top right corner of the card)
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'asset-card-inline-delete-btn';
    deleteBtn.innerHTML = '<span class="material-symbols-outlined">delete</span>';
    deleteBtn.title = 'Delete Asset';
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        handleDeleteAsset(asset.id);
    };
    card.appendChild(deleteBtn);

    return card;
}


// --- EVENT HANDLERS (Now operating on specific assets via parameters) ---

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
        await assetManagerService.deleteAsset(assetId);
        await updateMainUI(currentCharacterId); 
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

// --- INITIALIZATION ---
export function initializeAssetManagerComponent(characterId) {
    if (isInitialized) {
        // If we revisit this personality, just update the UI
        updateMainUI(characterId);
        return;
    }

    personalityForm = document.querySelector('#form-add-personality');
    mediaLibraryStep = document.querySelector('#media-library-step');
    
    if (!mediaLibraryStep) return;

    // These event listeners are for the permanent parts of the media library UI
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
    
    // All event listeners for the old detail view have been removed.
    
    updateMainUI(characterId);

    console.log('Asset Manager Component Initialized (v8 - Inline Editing).');
    isInitialized = true;
}