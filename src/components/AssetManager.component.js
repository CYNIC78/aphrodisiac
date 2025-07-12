// FILE: src/components/AssetManager.component.js
// --- REBUILT FOR V5 "SCENE EXPLORER" (v12.0) ---

import { assetManagerService } from '../services/AssetManager.service.js';
import * as personalityService from '../services/Personality.service.js';

// --- STATE MANAGEMENT ---
let isInitialized = false;
let currentPersonality = null; // The full personality object, including the 'actors' array
let activeContext = { actor: null, state: null }; // Tracks the selected Actor and State for filtering

// --- UI ELEMENT REFERENCES ---
let sceneExplorerContainer, galleryEl, galleryTitleEl, uploadBtn, uploadInput;

// --- RENDERING LOGIC ---

/**
 * Renders the entire Scene Explorer UI based on the current personality's 'actors' data.
 * NOTE: This is the function we will build out in our next step. For now, it's a placeholder.
 */
function renderSceneExplorer() {
    sceneExplorerContainer = document.querySelector('#scene-explorer-actors-container');
    if (!sceneExplorerContainer) return;

    // Clear previous content
    sceneExplorerContainer.innerHTML = '';
    
    // Set the personality name at the top of the explorer
    const personalityNameEl = document.querySelector('#scene-explorer-personality-name');
    if(personalityNameEl) {
        personalityNameEl.textContent = currentPersonality ? currentPersonality.name : '';
    }

    if (!currentPersonality || !currentPersonality.actors || currentPersonality.actors.length === 0) {
        sceneExplorerContainer.innerHTML = '<p class="scene-explorer-placeholder">No actors defined.</p>';
        return;
    }
    
    // In our next step, we will add the logic here to loop through `currentPersonality.actors`
    // and generate the interactive Actor and State rows.
    console.log("Scene Explorer rendering logic will be implemented here.");
}


/**
 * Renders the asset gallery, filtered by the active Actor and State context.
 */
async function renderGallery() {
    if (!galleryEl || !galleryTitleEl) return;

    if (!currentPersonality) {
        galleryEl.innerHTML = `<p class="gallery-empty-placeholder">Save the personality to enable the media library.</p>`;
        galleryTitleEl.textContent = 'Asset Gallery';
        return;
    }

    galleryEl.innerHTML = '<p class="gallery-empty-placeholder">Loading...</p>';
    
    try {
        // Determine tags to filter by based on the active context
        const filterTags = [];
        if (activeContext.actor) filterTags.push(activeContext.actor);
        if (activeContext.state) filterTags.push(activeContext.state);

        // Fetch assets. If no context is selected, it gets all assets for the character.
        const assetsToRender = await assetManagerService.searchAssetsByTags(filterTags, currentPersonality.id);
        
        // Update the gallery title
        galleryTitleEl.textContent = filterTags.length > 0 ? `Assets for: ${filterTags.join(' / ')}` : 'All Assets';

        galleryEl.innerHTML = '';
        if (assetsToRender.length === 0) {
            galleryEl.innerHTML = `<p class="gallery-empty-placeholder">No assets found for this context. Upload some!</p>`;
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
 * Creates an asset card. Tag management is removed as it's now handled by the Scene Explorer.
 * @param {object} asset - The asset object from the database.
 * @returns {HTMLElement} The fully interactive card element.
 */
function createAssetCard(asset) {
    const card = document.createElement('div');
    card.className = 'asset-card-inline';

    // Preview Area (Image or Icon)
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
    
    // Filename Overlay
    const bottomOverlay = document.createElement('div');
    bottomOverlay.className = 'asset-card-bottom-overlay';
    const filenameEl = document.createElement('div');
    filenameEl.className = 'asset-card-filename';
    filenameEl.textContent = asset.name;
    bottomOverlay.appendChild(filenameEl);
    previewContainer.appendChild(bottomOverlay);
    card.appendChild(previewContainer);

    // Delete Button
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


// --- EVENT HANDLERS ---

async function handleDeleteAsset(assetId) {
    if (!assetId) return;
    if (confirm(`Are you sure you want to permanently delete this asset?`)) {
        await assetManagerService.deleteAsset(assetId);
        await renderGallery(); // Just re-render the gallery
    }
}

async function handleUpload(event) {
    const files = event.target.files;
    if (!files.length || !currentPersonality) return;

    // Check if a state is selected. If not, prompt the user.
    if (!activeContext.actor || !activeContext.state) {
        alert("Please select an Actor and a State in the Scene Explorer before uploading assets.");
        return;
    }

    const tagsForUpload = [activeContext.actor, activeContext.state];

    for (const file of files) {
        try {
            await assetManagerService.addAsset(file, tagsForUpload, currentPersonality.id);
        } catch (error) { 
            console.error('Failed to add asset:', error);
            alert(`Failed to upload ${file.name}. See console for details.`);
        }
    }
    event.target.value = ''; // Clear the input
    await renderGallery(); // Refresh the gallery to show the new assets
}


/**
 * Updates the entire component's UI for a given personality.
 * @param {object} personality - The full personality object.
 */
async function updateComponentUI(personality) {
    currentPersonality = personality;

    // If there's a personality, set a default context if none is active
    if (currentPersonality && currentPersonality.actors?.length > 0) {
        if (!activeContext.actor || !currentPersonality.actors.find(a => a.name === activeContext.actor)) {
             activeContext.actor = currentPersonality.actors[0].name;
             activeContext.state = currentPersonality.actors[0].states[0]?.name || null;
        }
    } else {
        activeContext = { actor: null, state: null };
    }

    renderSceneExplorer();
    await renderGallery();
}

// --- INITIALIZATION ---

/**
 * The main entry point for the component, called by Overlay.service.js.
 * @param {object} personality - The full personality object being edited.
 */
export function initializeAssetManagerComponent(personality) {
    if (!isInitialized) {
        // Get stable UI element references once
        galleryEl = document.querySelector('#asset-manager-gallery');
        galleryTitleEl = document.querySelector('#gallery-title');
        uploadBtn = document.querySelector('#btn-upload-asset');
        uploadInput = document.querySelector('#asset-upload-input');
        
        // Attach event listeners once
        uploadBtn.addEventListener('click', () => uploadInput.click());
        uploadInput.addEventListener('change', handleUpload);

        // We will add listeners for '#btn-add-actor' etc. in the next steps

        isInitialized = true;
        console.log('Asset Manager Component Initialized (v12.0 - Scene Explorer).');
    }

    // This runs every time the media library is opened
    updateComponentUI(personality);
}