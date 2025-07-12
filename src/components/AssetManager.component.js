// FILE: src/components/AssetManager.component.js
// --- REBUILT FOR V5 "SCENE EXPLORER" (v12.0) ---

import { assetManagerService } from '../services/AssetManager.service.js';
import * as personalityService from '../services/Personality.service.js';

// --- CONSTANTS ---
const SYSTEM_TAGS = ['avatar', 'sfx', 'audio', 'image'];

// --- STATE MANAGEMENT ---
let isInitialized = false;
let currentPersonality = null; 
let activeContext = { actor: null, state: null }; 

// --- UI ELEMENT REFERENCES ---
let sceneExplorerContainer, galleryEl, galleryTitleEl, uploadBtn, uploadInput, addActorBtn;

// --- UTILITY FUNCTIONS ---
function sanitizeNameForTag(name) {
    if (!name) return '';
    return name.toLowerCase().trim().replace(/\s+/g, '-');
}

// --- RENDERING LOGIC ---

function renderSceneExplorer() {
    if (!sceneExplorerContainer) return;
    const scrollPosition = sceneExplorerContainer.scrollTop;
    sceneExplorerContainer.innerHTML = '';
    const personalityNameEl = document.querySelector('#scene-explorer-personality-name');
    if (personalityNameEl) {
        personalityNameEl.textContent = currentPersonality ? currentPersonality.name : '...';
    }
    if (!currentPersonality || !currentPersonality.actors || currentPersonality.actors.length === 0) {
        sceneExplorerContainer.innerHTML = '<p class="scene-explorer-placeholder">No actors defined. Click "Add Actor" to start.</p>';
        return;
    }
    currentPersonality.actors.forEach(actor => {
        const actorRow = document.createElement('div');
        actorRow.className = 'scene-explorer-actor-row scene-explorer-row';
        actorRow.dataset.actorName = actor.name;
        actorRow.dataset.collapsed = actor.isCollapsed || 'false';
        actorRow.innerHTML = `
            <span class="material-symbols-outlined row-icon">arrow_drop_down</span>
            <span class="row-name">${actor.name}</span>
            <button type="button" class="row-delete-btn material-symbols-outlined" title="Delete Actor">delete</button>
        `;
        const statesContainer = document.createElement('div');
        statesContainer.className = 'states-container';
        if (actor.states && actor.states.length > 0) {
            actor.states.forEach(state => {
                const stateRow = document.createElement('div');
                stateRow.className = 'scene-explorer-state-row scene-explorer-row';
                if (activeContext.actor === actor.name && activeContext.state === state.name) {
                    stateRow.classList.add('active');
                }
                stateRow.innerHTML = `
                    <span class="row-name">${state.name}</span>
                    <button type="button" class="row-delete-btn material-symbols-outlined" title="Delete State">delete</button>
                `;
                stateRow.addEventListener('click', (e) => {
                    if (e.target.classList.contains('row-delete-btn')) return;
                    handleStateClick(actor.name, state.name)
                });
                stateRow.querySelector('.row-delete-btn').addEventListener('click', () => handleDeleteState(actor.name, state.name));
                statesContainer.appendChild(stateRow);
            });
        }
        const addStateBtn = document.createElement('button');
        addStateBtn.type = 'button'; 
        addStateBtn.className = 'btn-add-state';
        addStateBtn.innerHTML = `<span class="material-symbols-outlined">add</span> Add State...`;
        addStateBtn.addEventListener('click', () => handleAddState(actor.name));
        statesContainer.appendChild(addStateBtn);

        sceneExplorerContainer.appendChild(actorRow);
        sceneExplorerContainer.appendChild(statesContainer);
        
        actorRow.querySelector('.row-delete-btn').addEventListener('click', () => handleDeleteActor(actor.name));
        actorRow.addEventListener('click', (e) => {
            if (e.target.classList.contains('row-delete-btn')) return;
            const isCollapsed = actorRow.dataset.collapsed === 'true';
            actorRow.dataset.collapsed = !isCollapsed;
            actor.isCollapsed = !isCollapsed;
        });
    });
    sceneExplorerContainer.scrollTop = scrollPosition;
}

async function renderGallery() {
    if (!galleryEl || !galleryTitleEl) return;
    if (!currentPersonality || !currentPersonality.id) {
        galleryEl.innerHTML = `<p class="gallery-empty-placeholder">Save the personality to manage assets.</p>`;
        galleryTitleEl.textContent = 'Asset Gallery';
        return;
    }
    const scrollPosition = galleryEl.scrollTop; // Persist scroll
    galleryEl.innerHTML = '<p class="gallery-empty-placeholder">Loading...</p>';
    try {
        const filterTags = [];
        if (activeContext.actor) filterTags.push(activeContext.actor);
        if (activeContext.state) filterTags.push(activeContext.state);
        const assetsToRender = await assetManagerService.searchAssetsByTags(filterTags, currentPersonality.id);
        galleryTitleEl.textContent = filterTags.length > 0 ? `Assets for: ${filterTags.join(' / ')}` : 'All Assets';
        galleryEl.innerHTML = '';
        if (assetsToRender.length === 0) {
            galleryEl.innerHTML = `<p class="gallery-empty-placeholder">No assets for this context. Upload some!</p>`;
            return;
        }
        assetsToRender.forEach(asset => {
            const card = createAssetCard(asset);
            galleryEl.appendChild(card);
        });
        galleryEl.scrollTop = scrollPosition; // Restore scroll
    } catch (error) {
        console.error("Failed to render gallery:", error);
        galleryEl.innerHTML = `<p class="gallery-empty-placeholder">Error loading assets.</p>`;
    }
}

function createAssetCard(asset) {
    const card = document.createElement('div');
    card.className = 'asset-card-inline';

    // Preview Area
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
    const systemTags = asset.tags.filter(tag => SYSTEM_TAGS.includes(tag) && tag !== 'image');
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

    // Info Area with FULL tag management
    const infoContainer = document.createElement('div');
    infoContainer.className = 'asset-card-inline-info';
    
    const userFacingTags = asset.tags.filter(tag => !SYSTEM_TAGS.includes(tag));
    const customPillsContainer = document.createElement('div');
    customPillsContainer.className = 'tag-pills-container';

    userFacingTags.forEach(tag => {
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
    
    // "Smart" input field for adding new tags
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

async function handleAddTagToAsset(assetId, inputElement) {
    const newTag = inputElement.value.trim().toLowerCase();
    if (!newTag || !assetId) return;

    if (SYSTEM_TAGS.includes(newTag)) {
        alert("Cannot add a protected system tag manually.");
        return;
    }

    const asset = await assetManagerService.getAssetById(assetId);
    if (asset && !asset.tags.includes(newTag)) {
        const updatedTags = [...asset.tags, newTag];
        await assetManagerService.updateAsset(assetId, { tags: updatedTags });
        inputElement.value = '';
        await renderGallery(); // Refresh the gallery to show the new tag
    }
}

async function handleRemoveTagFromAsset(assetId, tagToRemove) {
    if (SYSTEM_TAGS.includes(tagToRemove) || !assetId) return;

    const asset = await assetManagerService.getAssetById(assetId);
    if (asset) {
        const updatedTags = asset.tags.filter(t => t !== tagToRemove);
        await assetManagerService.updateAsset(assetId, { tags: updatedTags });
        await renderGallery(); // Refresh the gallery
    }
}

async function handleAddActor() {
    if (!currentPersonality) return;
    const actorName = prompt("Enter a name for the new Actor:");
    if (!actorName || actorName.trim() === '') return;
    const sanitizedName = sanitizeNameForTag(actorName);
    if (currentPersonality.actors.some(actor => actor.name === sanitizedName)) {
        alert(`An actor named "${sanitizedName}" already exists.`);
        return;
    }
    currentPersonality.actors.push({ name: sanitizedName, states: [{ name: 'default' }] });
    await personalityService.updatePersonalityData(currentPersonality.id, currentPersonality);
    await updateComponentUI(currentPersonality);
}

async function handleAddState(actorName) {
    const stateName = prompt(`Enter a new State name for actor "${actorName}":`);
    if (!stateName || stateName.trim() === '') return;
    const sanitizedName = sanitizeNameForTag(stateName);
    const actor = currentPersonality.actors.find(a => a.name === actorName);
    if (actor) {
        if (actor.states.some(s => s.name === sanitizedName)) {
            alert(`State "${sanitizedName}" already exists for this actor.`);
            return;
        }
        actor.states.push({ name: sanitizedName });
        await personalityService.updatePersonalityData(currentPersonality.id, currentPersonality);
        renderSceneExplorer(); 
    }
}

async function handleDeleteActor(actorNameToDelete) {
    if (!confirm(`Are you sure you want to delete the actor "${actorNameToDelete}"?\n\nThis will delete ALL of its states and associated media assets permanently.`)) return;
    await assetManagerService.deleteAssetsOnActorDelete(currentPersonality.id, actorNameToDelete);
    currentPersonality.actors = currentPersonality.actors.filter(actor => actor.name !== actorNameToDelete);
    if (activeContext.actor === actorNameToDelete) {
        activeContext.actor = null;
        activeContext.state = null;
    }
    await personalityService.updatePersonalityData(currentPersonality.id, currentPersonality);
    await updateComponentUI(currentPersonality);
}

async function handleDeleteState(actorName, stateNameToDelete) {
    if (stateNameToDelete === 'default') {
        alert('Cannot delete the "default" state.');
        return;
    }
    if (!confirm(`Are you sure you want to delete the state "${stateNameToDelete}"?\n\nIts assets will be moved to the "default" state.`)) return;
    await assetManagerService.retagAssetsOnStateDelete(currentPersonality.id, actorName, stateNameToDelete);
    const actor = currentPersonality.actors.find(a => a.name === actorName);
    if (actor) {
        actor.states = actor.states.filter(state => state.name !== stateNameToDelete);
    }
    if (activeContext.actor === actorName && activeContext.state === stateNameToDelete) {
        activeContext.state = 'default';
    }
    await personalityService.updatePersonalityData(currentPersonality.id, currentPersonality);
    await updateComponentUI(currentPersonality);
}

async function handleStateClick(actorName, stateName) {
    activeContext.actor = actorName;
    activeContext.state = stateName;
    renderSceneExplorer();
    await renderGallery();
}

async function handleDeleteAsset(assetId) {
    if (!assetId) return;
    if (confirm(`Are you sure you want to permanently delete this asset?`)) {
        await assetManagerService.deleteAsset(assetId);
        await renderGallery(); 
    }
}

async function handleUpload(event) {
    const files = event.target.files;
    if (!files.length || !currentPersonality) return;
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
    event.target.value = ''; 
    await renderGallery(); 
}

async function updateComponentUI(personality) {
    currentPersonality = personality;
    if (currentPersonality && !Array.isArray(currentPersonality.actors)) {
        currentPersonality.actors = [];
    }
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
export function initializeAssetManagerComponent(personality) {
    if (!isInitialized) {
        galleryEl = document.querySelector('#asset-manager-gallery');
        galleryTitleEl = document.querySelector('#gallery-title');
        uploadBtn = document.querySelector('#btn-upload-asset');
        uploadInput = document.querySelector('#asset-upload-input');
        sceneExplorerContainer = document.querySelector('#scene-explorer-actors-container');
        addActorBtn = document.querySelector('#btn-add-actor');
        
        uploadBtn.addEventListener('click', () => uploadInput.click());
        uploadInput.addEventListener('change', handleUpload);
        addActorBtn.addEventListener('click', handleAddActor);
        
        isInitialized = true;
        console.log('Asset Manager Component Initialized (v12.0 - Scene Explorer).');
    }
    updateComponentUI(personality);
}