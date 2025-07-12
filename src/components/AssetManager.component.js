// FILE: src/components/AssetManager.component.js

import { assetManagerService } from '../services/AssetManager.service.js';
import { showElement, hideElement } from '../utils/helpers.js';

// --- CONSTANTS ---
const SYSTEM_TAGS = ['avatar', 'sfx', 'audio', 'image'];

// --- STATE MANAGEMENT ---
let isInitialized = false;
let currentAssetId = null;
let activeTags = []; // Holds the currently selected tags for filtering
let allDbTags = [];  // A cache of all unique tags from the database
let currentCharacterId = null; // To hold the ID of the currently active personality

// --- UI ELEMENT REFERENCES ---
let personalityForm, assetDetailView, mediaLibraryStep;

// --- VIEW MANAGEMENT ---
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

function createAssetCard(asset) {
    const card = document.createElement('div');
    card.className = 'asset-card';
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
    return card;
}

/**
 * Renders the tags inside the Asset Detail View, separating system and custom tags.
 */
function renderTagsInDetailView(tags = []) {
    const tagsContainer = assetDetailView.querySelector('#asset-detail-tags');
    tagsContainer.innerHTML = ''; // Clear previous content

    const systemTags = tags.filter(tag => SYSTEM_TAGS.includes(tag));
    const customTags = tags.filter(tag => !SYSTEM_TAGS.includes(tag));

    // Render System Command section
    if (systemTags.length > 0) {
        const systemHeader = document.createElement('h4');
        systemHeader.textContent = 'System Command';
        tagsContainer.appendChild(systemHeader);

        systemTags.forEach(tag => {
            const pill = document.createElement('div');
            pill.className = 'tag-pill tag-system'; // Apply system class
            pill.textContent = tag;
            
            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-tag'; // CSS will hide this
            pill.appendChild(removeBtn);
            
            tagsContainer.appendChild(pill);
        });
    }

    // Render Custom Triggers section
    const customHeader = document.createElement('h4');
    customHeader.textContent = 'Your Custom Triggers';
    tagsContainer.appendChild(customHeader);
    
    if (customTags.length > 0) {
        customTags.forEach(tag => {
            const pill = document.createElement('div');
            pill.className = 'tag-pill';
            pill.textContent = tag;
            
            const removeBtn = document.createElement('span');
            removeBtn.className = 'remove-tag';
            removeBtn.innerHTML = '×';
            removeBtn.onclick = () => handleRemoveTagFromAsset(tag);

            pill.appendChild(removeBtn);
            tagsContainer.appendChild(pill);
        });
    } else {
        const noTagsMessage = document.createElement('p');
        noTagsMessage.textContent = 'No custom triggers yet. Add one below!';
        noTagsMessage.style.cssText = 'opacity: 0.6; font-size: 0.8rem; width: 100%;';
        tagsContainer.appendChild(noTagsMessage);
    }
}


// --- EVENT HANDLERS ---

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

async function handleAddTagToAsset() {
    const input = document.querySelector('#add-tag-input');
    const newTag = input.value.trim().toLowerCase();
    if (!newTag || !currentAssetId) return;

    // Prevent adding a system tag manually
    if (SYSTEM_TAGS.includes(newTag)) {
        alert("Cannot add a protected system tag manually.");
        return;
    }

    const asset = await assetManagerService.getAssetById(currentAssetId);
    if (asset && !asset.tags.includes(newTag)) {
        // The service layer automatically preserves the system tag
        const updatedUserTags = [...asset.tags.filter(t => !SYSTEM_TAGS.includes(t)), newTag];
        await assetManagerService.updateAsset(currentAssetId, { tags: updatedUserTags });
        
        // Refetch the asset to get the final, authoritative list of tags
        const updatedAsset = await assetManagerService.getAssetById(currentAssetId);
        renderTagsInDetailView(updatedAsset.tags);
        
        allDbTags = await assetManagerService.getAllUniqueTagsForCharacter(currentCharacterId);
        renderTagExplorer();
        input.value = '';
    }
}

async function handleRemoveTagFromAsset(tagToRemove) {
    // Add a guard against removing system tags, just in case.
    if (SYSTEM_TAGS.includes(tagToRemove)) {
        console.warn("Attempted to remove a protected system tag. Action blocked.");
        return;
    }

    if (!currentAssetId) return;
    const asset = await assetManagerService.getAssetById(currentAssetId);
    if (asset) {
        // The service layer automatically preserves the system tag
        const updatedUserTags = asset.tags.filter(t => t !== tagToRemove && !SYSTEM_TAGS.includes(t));
        await assetManagerService.updateAsset(currentAssetId, { tags: updatedUserTags });

        const updatedAsset = await assetManagerService.getAssetById(currentAssetId);
        renderTagsInDetailView(updatedAsset.tags);

        allDbTags = await assetManagerService.getAllUniqueTagsForCharacter(currentCharacterId);
        renderTagExplorer();
    }
}

async function handleDeleteAsset() {
    if (!currentAssetId) return;
    if (confirm(`Are you sure you want to permanently delete this asset?`)) {
        await assetManagerService.deleteAsset(currentAssetId);
        currentAssetId = null;
        showView(personalityForm);
        await updateMainUI(currentCharacterId); 
    }
}

async function showAssetDetailView(assetId) {
    currentAssetId = assetId;
    const asset = await assetManagerService.getAssetById(assetId);
    if (!asset) return;

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
    renderTagsInDetailView(asset.tags);
    showView(assetDetailView);
}

async function updateMainUI(characterId) {
    currentCharacterId = characterId;
    activeTags = []; 
    if (currentCharacterId === null) {
        allDbTags = [];
    } else {
        allDbTags = await assetManagerService.getAllUniqueTagsForCharacter(currentCharacterId);
    }
    renderTagExplorer();
    renderGallery();
}

// --- INITIALIZATION ---
export function initializeAssetManagerComponent(characterId) {
    if (isInitialized) {
        showView(personalityForm);
        updateMainUI(characterId);
        return;
    }

    personalityForm = document.querySelector('#form-add-personality');
    assetDetailView = document.querySelector('#asset-detail-view');
    mediaLibraryStep = document.querySelector('#media-library-step');
    
    if (!mediaLibraryStep) return;

    document.querySelector('#tag-explorer-search').addEventListener('input', (e) => renderTagExplorer(e.target.value));
    document.querySelector('#btn-upload-asset').addEventListener('click', () => document.querySelector('#asset-upload-input').click());
    
    document.querySelector('#asset-upload-input').addEventListener('change', async (event) => {
        const files = event.target.files;
        if (!files.length || currentCharacterId === null) return;
        for (const file of files) {
            try {
                // The service now handles system tags automatically. Just send an empty array.
                await assetManagerService.addAsset(file, [], currentCharacterId);
            } catch (error) { console.error('Failed to add asset:', error); }
        }
        event.target.value = ''; 
        await updateMainUI(currentCharacterId);
    });
    
    document.querySelector('#btn-asset-detail-back').addEventListener('click', () => {
        showView(personalityForm);
        updateMainUI(currentCharacterId);
    });
    document.querySelector('#btn-add-tag').addEventListener('click', handleAddTagToAsset);
    document.querySelector('#add-tag-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(), handleAddTagToAsset(); });
    document.querySelector('#btn-delete-asset').addEventListener('click', handleDeleteAsset);
    
    updateMainUI(characterId);

    console.log('Asset Manager Component Initialized (v5 - Protected Tags).');
    isInitialized = true;
}