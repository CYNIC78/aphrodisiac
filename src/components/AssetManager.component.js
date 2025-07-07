import { assetManagerService } from '../services/AssetManager.service.js';
import { showElement, hideElement } from '../utils/helpers.js';

// --- STATE MANAGEMENT ---
let isInitialized = false;
let currentAssetId = null;
let activeTags = []; // Holds the currently selected tags for filtering
let allDbTags = [];  // A cache of all unique tags from the database
let currentCharacterId = null; // <-- ADDED: To hold the ID of the currently active personality

// --- UI ELEMENT REFERENCES ---
let personalityForm, assetDetailView, mediaLibraryStep;

// --- VIEW MANAGEMENT ---

// Switches between the main personality form and the asset detail view
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

// --- RENDERING LOGIC (The Core of the New UI) ---

/**
 * Renders the list of clickable tags in the left-side Tag Explorer.
 * @param {string} [filterTerm=''] - A term to filter the displayed tags.
 */
function renderTagExplorer(filterTerm = '') {
    const listEl = document.querySelector('#tag-explorer-list');
    if (!listEl) return;

    const lowerCaseFilter = filterTerm.toLowerCase();
    const tagsToRender = allDbTags.filter(tag => tag.toLowerCase().includes(lowerCaseFilter));
    
    listEl.innerHTML = ''; // Clear the list
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

/**
 * Renders the main asset gallery based on the currently active tags and character.
 */
async function renderGallery() {
    const galleryEl = document.querySelector('#asset-manager-gallery');
    const titleEl = document.querySelector('#gallery-title');
    if (!galleryEl || !titleEl) return;

    if (currentCharacterId === null) { // <-- ADDED: Handle case where no character is selected
        galleryEl.innerHTML = `<p class="gallery-empty-placeholder">Select a personality to view its media library.</p>`;
        titleEl.textContent = 'Media Library';
        return;
    }

    galleryEl.innerHTML = '<p class="gallery-empty-placeholder">Loading...</p>';
    
    try {
        // Step 1: Get assets for the CURRENT character.
        const allAssets = await assetManagerService.getAllAssetsForCharacter(currentCharacterId); // <-- MODIFIED

        // Step 2: Filter the assets in JavaScript based on the activeTags array.
        const assetsToRender = activeTags.length === 0
            ? allAssets // If no tags are active, show everything for this character.
            : allAssets.filter(asset => activeTags.every(tag => asset.tags.includes(tag))); // Otherwise, show assets that have ALL active tags.

        // Update the gallery title
        titleEl.textContent = activeTags.length > 0 ? `Tagged: ${activeTags.join(', ')}` : 'All Assets';

        galleryEl.innerHTML = ''; // Clear "Loading..."
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
 * Creates a single, clean asset card (image only).
 */
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
 * Renders the tags inside the Asset Detail View popup.
 */
function renderTagsInDetailView(tags = []) {
    const tagsContainer = assetDetailView.querySelector('#asset-detail-tags');
    tagsContainer.innerHTML = '';
    tags.forEach(tag => {
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
}

// --- EVENT HANDLERS ---

/**
 * Handles a click on a tag in the Tag Explorer sidebar.
 */
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

    const asset = await assetManagerService.getAssetById(currentAssetId);
    if (asset && !asset.tags.includes(newTag)) {
        const updatedTags = [...asset.tags, newTag];
        await assetManagerService.updateAsset(currentAssetId, { tags: updatedTags });
        renderTagsInDetailView(updatedTags);
        
        // Update the list of all tags for the current character
        allDbTags = await assetManagerService.getAllUniqueTagsForCharacter(currentCharacterId); // <-- MODIFIED
        allDbTags.sort((a,b) => a.localeCompare(b));
        renderTagExplorer();
        input.value = '';
    }
}

async function handleRemoveTagFromAsset(tagToRemove) {
    if (!currentAssetId) return;
    const asset = await assetManagerService.getAssetById(currentAssetId);
    if (asset) {
        const updatedTags = asset.tags.filter(t => t !== tagToRemove);
        await assetManagerService.updateAsset(currentAssetId, { tags: updatedTags });
        renderTagsInDetailView(updatedTags);
        // Update the list of all tags for the current character in case a tag count goes to zero
        allDbTags = await assetManagerService.getAllUniqueTagsForCharacter(currentCharacterId); // <-- MODIFIED
        allDbTags.sort((a,b) => a.localeCompare(b));
        renderTagExplorer();
    }
}

async function handleDeleteAsset() {
    if (!currentAssetId) return;
    if (confirm(`Are you sure you want to permanently delete this asset?`)) {
        // Before deleting, revoke the object URL if it's currently in use by a personality's avatar
        // This is a simplified check. A more robust solution might check PersonalityService.personalityImageUrls map.
        const asset = await assetManagerService.getAssetById(currentAssetId);
        if (asset && asset.data instanceof Blob) {
            URL.revokeObjectURL(URL.createObjectURL(asset.data)); // Create temp URL just to revoke
        }

        await assetManagerService.deleteAsset(currentAssetId); // <-- MODIFIED (no characterId needed here, direct ID delete)
        currentAssetId = null;
        showView(personalityForm);
        await updateMainUI(); // This will refresh the gallery for the current character
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

/**
 * Updates the main UI of the Asset Manager, now scoped to the current character.
 * @param {number} characterId - The ID of the character whose assets to display.
 */
async function updateMainUI(characterId) { // <-- MODIFIED: Now takes characterId
    currentCharacterId = characterId; // <-- ADDED: Update the global state
    activeTags = []; // Reset active tags when character changes
    if (currentCharacterId === null) { // <-- ADDED: Handle initial state
        allDbTags = []; // No tags if no character selected
    } else {
        allDbTags = await assetManagerService.getAllUniqueTagsForCharacter(currentCharacterId); // <-- MODIFIED
    }
    renderTagExplorer();
    renderGallery();
}

// --- INITIALIZATION ---
// Modified to be a method that accepts the character ID to display the correct library
export function initializeAssetManagerComponent(characterId) { // <-- MODIFIED: Now accepts characterId
    if (isInitialized) {
        showView(personalityForm);
        updateMainUI(characterId); // <-- MODIFIED: Update UI for the new character
        return;
    }

    personalityForm = document.querySelector('#form-add-personality');
    assetDetailView = document.querySelector('#asset-detail-view');
    mediaLibraryStep = document.querySelector('#media-library-step');
    
    if (!mediaLibraryStep) return;

    // --- Wire up all event listeners ---
    document.querySelector('#tag-explorer-search').addEventListener('input', (e) => renderTagExplorer(e.target.value));
    document.querySelector('#btn-upload-asset').addEventListener('click', () => document.querySelector('#asset-upload-input').click());
    
    document.querySelector('#asset-upload-input').addEventListener('change', async (event) => {
        const files = event.target.files;
        if (!files.length || currentCharacterId === null) return; // <-- MODIFIED: Check for currentCharacterId
        for (const file of files) {
            try {
                // Determine the initial tag based on file type
                let initialTag = 'new'; // Fallback tag
                if (file.type.startsWith('image/')) {
                    initialTag = 'image';
                } else if (file.type.startsWith('audio/')) {
                    initialTag = 'audio';
                }
                // Pass the determined initialTag AND the currentCharacterId
                await assetManagerService.addAsset(file, [initialTag], currentCharacterId); // <-- MODIFIED
            } catch (error) { console.error('Failed to add asset:', error); }
        }
        event.target.value = ''; 
        await updateMainUI(currentCharacterId); // <-- MODIFIED: Pass currentCharacterId
    });
    
    document.querySelector('#btn-asset-detail-back').addEventListener('click', () => {
        showView(personalityForm);
        updateMainUI(currentCharacterId); // <-- MODIFIED: Pass currentCharacterId
    });
    document.querySelector('#btn-add-tag').addEventListener('click', handleAddTagToAsset);
    document.querySelector('#add-tag-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAddTagToAsset(); });
    document.querySelector('#btn-delete-asset').addEventListener('click', handleDeleteAsset);
    
    updateMainUI(characterId); // <-- MODIFIED: Initial call now correctly passes characterId

    console.log('Asset Manager Component Initialized (v4 - Per-character).'); // <-- MODIFIED
    isInitialized = true;
}