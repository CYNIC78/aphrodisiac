// FILE: src/components/AssetManager.component.js

import { assetManagerService } from '../services/AssetManager.service.js';
import { db } from '../services/Db.service.js'; // NEW: Import db for Character/State lookups
import { Character } from '../models/Character.js'; // NEW: Import Character model
import { State } from '../models/State.js';       // NEW: Import State model
import { showElement, hideElement } from '../utils/helpers.js';

// --- STATE MANAGEMENT ---
let isInitialized = false;
let currentAssetId = null;
let activeTags = []; // Holds the currently selected tags for filtering
let allDbTags = [];  // A cache of all unique tags from the database

// --- IDs for the currently active hierarchy ---
let currentPersonalityId = null; // The personality whose assets we are managing
let currentCharacterId = null;   // The character currently selected within that personality
let currentStateId = null;       // The state currently selected within that character

// --- UI ELEMENT REFERENCES ---
let personalityForm, assetDetailView, mediaLibraryStep;
let charactersListEl, statesListEl, addCharacterButton, addStateButton;
let assetUploadInput; // Reference to the file input

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

/**
 * Renders the list of characters for the current personality.
 */
async function renderCharactersList() {
    if (!charactersListEl || !currentPersonalityId) return;

    const characters = await db.characters.where('personalityId').equals(currentPersonalityId).toArray();
    charactersListEl.innerHTML = ''; // Clear previous list

    if (characters.length === 0) {
        charactersListEl.innerHTML = '<p class="text-muted">No characters yet. Click "+ Add Character" to begin!</p>';
        if (addCharacterButton) addCharacterButton.style.display = 'inline-block'; // Ensure button is visible
        return;
    }

    if (addCharacterButton) addCharacterButton.style.display = 'inline-block'; // Ensure button is visible

    // If no character is currently selected, try to select the first one or a default
    if (!currentCharacterId || !characters.some(char => char.id === currentCharacterId)) {
        currentCharacterId = characters[0].id; // Select the first character by default
        if (characters[0].defaultStateId) {
            currentStateId = characters[0].defaultStateId; // Select its default state
        } else if (characters[0].states && characters[0].states.length > 0) { // Fallback if no defaultStateId but states exist (old model)
             currentStateId = characters[0].states[0].id;
        } else {
            currentStateId = null; // No state found
        }
    }

    characters.forEach(char => {
        const item = document.createElement('button');
        item.className = `character-item ${char.id === currentCharacterId ? 'selected' : ''}`;
        item.textContent = char.name;
        item.onclick = async () => {
            currentCharacterId = char.id;
            // If the selected character has a default state, auto-select it
            if (char.defaultStateId) {
                currentStateId = char.defaultStateId;
            } else {
                // If no default state, check if there are any states and select the first
                const statesForChar = await db.states.where('characterId').equals(char.id).toArray();
                currentStateId = statesForChar.length > 0 ? statesForChar[0].id : null;
            }
            await updateMainUI(); // Re-render everything
        };
        charactersListEl.appendChild(item);
    });

    renderStatesList(); // Also render states for the newly selected character
}

/**
 * Renders the list of states for the currently selected character.
 */
async function renderStatesList() {
    const statesContainer = document.querySelector('#statesContainer'); // Assuming you have a container for states
    if (!statesContainer || !currentCharacterId) {
        if(statesContainer) statesContainer.innerHTML = `<p class="text-muted">Select a character to manage states.</p>`;
        if (addStateButton) addStateButton.style.display = 'none';
        return;
    }

    const states = await db.states.where('characterId').equals(currentCharacterId).toArray();
    statesContainer.innerHTML = ''; // Clear previous list

    if (states.length === 0) {
        statesContainer.innerHTML = `<p class="text-muted">No states yet. Click "+ Add State" to begin!</p>`;
        if (addStateButton) addStateButton.style.display = 'inline-block';
        return;
    }

    if (addStateButton) addStateButton.style.display = 'inline-block';

    // If no state is currently selected for this character, select the first one
    if (!currentStateId || !states.some(state => state.id === currentStateId)) {
        currentStateId = states[0].id;
    }

    states.forEach(state => {
        const item = document.createElement('button');
        item.className = `state-item ${state.id === currentStateId ? 'selected' : ''}`;
        item.textContent = state.name;
        item.onclick = async () => {
            currentStateId = state.id;
            await updateMainUI(); // Re-render everything
        };
        statesContainer.appendChild(item);
    });
    
    // Ensure the asset upload input is enabled/disabled based on state selection
    if (assetUploadInput) {
        assetUploadInput.disabled = !currentStateId;
        const uploadBtn = document.querySelector('#btn-upload-asset');
        if (uploadBtn) {
            uploadBtn.disabled = !currentStateId;
            uploadBtn.textContent = currentStateId ? 'Upload Assets' : 'Select a State to Upload';
        }
    }

    renderTagExplorer(); // Re-render tags for the new context
    renderGallery(); // Re-render gallery for the new context
}


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
    if (tagsToRender.length === 0) {
        listEl.innerHTML = '<p class="text-muted">No tags found for current selection.</p>';
        return;
    }
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
 * Renders the main asset gallery based on the currently active tags and hierarchy.
 */
async function renderGallery() {
    const galleryEl = document.querySelector('#asset-manager-gallery');
    const titleEl = document.querySelector('#gallery-title');
    if (!galleryEl || !titleEl) return;

    if (!currentPersonalityId || !currentCharacterId || !currentStateId) {
        galleryEl.innerHTML = `<p class="gallery-empty-placeholder">Select a Personality, Character, and State to manage assets.</p>`;
        titleEl.textContent = 'Media Library';
        return;
    }

    galleryEl.innerHTML = '<p class="gallery-empty-placeholder">Loading assets for current state...</p>';
    
    try {
        // Get assets for the CURRENT personality, character, and state.
        const assetsInCurrentState = await assetManagerService.getAssets(currentPersonalityId, currentCharacterId, currentStateId);

        // Filter the assets in JavaScript based on the activeTags array.
        const assetsToRender = activeTags.length === 0
            ? assetsInCurrentState // If no tags are active, show everything for this state.
            : assetsInCurrentState.filter(asset => asset.tags && activeTags.every(tag => asset.tags.includes(tag)));

        titleEl.textContent = activeTags.length > 0 ? `Tagged: ${activeTags.join(', ')}` : 'All Assets in Current State';

        galleryEl.innerHTML = ''; // Clear "Loading..."
        if (assetsToRender.length === 0) {
            galleryEl.innerHTML = `<p class="gallery-empty-placeholder">No assets found in this state matching the current filter.</p>`;
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
 * Creates a single asset card.
 */
function createAssetCard(asset) {
    const card = document.createElement('div');
    card.className = 'asset-card';
    card.dataset.assetId = asset.id; // Store asset ID for easy lookup
    card.addEventListener('click', () => showAssetDetailView(asset.id));

    if (asset.type === 'avatar') { // Using 'avatar' now instead of 'image'
        const img = document.createElement('img');
        img.src = URL.createObjectURL(asset.data);
        img.alt = asset.name;
        card.appendChild(img);
    } else if (asset.type === 'sfx') { // Using 'sfx' now instead of 'audio'
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined asset-icon';
        icon.textContent = 'music_note';
        card.appendChild(icon);
    }
    // Add text label with asset's value for clarity
    const label = document.createElement('div');
    label.className = 'asset-label';
    label.textContent = asset.value; // Show the 'value' used in AI commands
    card.appendChild(label);

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

// Helper to generate unique IDs (simple for now, can be UUID later)
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * Handles adding a new Character to the current Personality.
 */
async function handleAddCharacter() {
    if (!currentPersonalityId) {
        alert("Please select or create a Personality first.");
        return;
    }
    const characterName = prompt("Enter a name for the new character:");
    if (characterName && characterName.trim()) {
        const newCharacterId = generateUniqueId();
        const newCharacter = new Character({
            id: newCharacterId,
            personalityId: currentPersonalityId,
            name: characterName.trim()
        });
        await db.characters.add(newCharacter);
        console.log(`Added new character: ${newCharacter.name} (ID: ${newCharacter.id}) to Personality ID: ${currentPersonalityId}`);
        
        // Auto-select the new character
        currentCharacterId = newCharacterId;
        // Also create a default state for this new character
        const defaultStateId = generateUniqueId();
        const defaultState = new State({
            id: defaultStateId,
            characterId: newCharacterId,
            name: 'Default State'
        });
        await db.states.add(defaultState);
        await db.characters.update(newCharacterId, { defaultStateId: defaultStateId });
        currentStateId = defaultStateId;
        
        await updateMainUI(); // Re-render everything
    }
}

/**
 * Handles adding a new State to the current Character.
 */
async function handleAddState() {
    if (!currentCharacterId) {
        alert("Please select or create a Character first.");
        return;
    }
    const stateName = prompt("Enter a name for the new state:");
    if (stateName && stateName.trim()) {
        const newStateId = generateUniqueId();
        const newState = new State({
            id: newStateId,
            characterId: currentCharacterId,
            name: stateName.trim()
        });
        await db.states.add(newState);
        console.log(`Added new state: ${newState.name} (ID: ${newState.id}) to Character ID: ${currentCharacterId}`);
        
        // Auto-select the new state
        currentStateId = newStateId;
        await updateMainUI(); // Re-render everything
    }
}


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
        
        // Update the list of all tags for the current hierarchy
        allDbTags = await assetManagerService.getAllUniqueTagsInHierarchy(currentPersonalityId, currentCharacterId, currentStateId); // <-- MODIFIED
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
        // Update the list of all tags for the current hierarchy in case a tag count goes to zero
        allDbTags = await assetManagerService.getAllUniqueTagsInHierarchy(currentPersonalityId, currentCharacterId, currentStateId); // <-- MODIFIED
        allDbTags.sort((a,b) => a.localeCompare(b));
        renderTagExplorer();
    }
}

async function handleDeleteAsset() {
    if (!currentAssetId) return;
    if (confirm(`Are you sure you want to permanently delete this asset?`)) {
        const asset = await assetManagerService.getAssetById(currentAssetId);
        if (asset && asset.data instanceof Blob) {
            URL.revokeObjectURL(URL.createObjectURL(asset.data)); 
        }

        await assetManagerService.deleteAsset(currentAssetId);
        currentAssetId = null;
        showView(personalityForm); // Go back to personality form or main media library view
        await updateMainUI(); // This will refresh the gallery for the current character
    }
}

async function showAssetDetailView(assetId) {
    currentAssetId = assetId;
    const asset = await assetManagerService.getAssetById(assetId);
    if (!asset) return;

    const previewEl = assetDetailView.querySelector('#asset-detail-preview');
    const nameEl = assetDetailView.querySelector('#asset-detail-name');
    const typeEl = assetDetailView.querySelector('#asset-detail-type'); // NEW: Display asset type
    const valueEl = assetDetailView.querySelector('#asset-detail-value'); // NEW: Display asset value
    
    previewEl.innerHTML = '';
    if (asset.type === 'avatar') {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(asset.data);
        previewEl.appendChild(img);
    } else if (asset.type === 'sfx') {
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined asset-icon-large';
        icon.textContent = 'music_note';
        previewEl.appendChild(icon);
        const audioControl = document.createElement('audio');
        audioControl.controls = true;
        audioControl.src = URL.createObjectURL(asset.data);
        previewEl.appendChild(audioControl);
    }
    nameEl.textContent = `File Name: ${asset.name}`; // Show file name
    typeEl.textContent = `Type: ${asset.type}`;     // Show asset type
    valueEl.textContent = `Value: ${asset.value}`;   // Show asset value
    renderTagsInDetailView(asset.tags);
    showView(assetDetailView);
}

/**
 * Updates the main UI of the Asset Manager, considering the current hierarchy.
 * @param {string|number|null} [personalityIdToLoad=null] - Optional: The ID of the personality to initially load.
 */
async function updateMainUI(personalityIdToLoad = null) {
    // If a specific personalityId is passed, update the global state
    if (personalityIdToLoad !== null) {
        currentPersonalityId = personalityIdToLoad;
        // When personality changes, clear character and state selection for a fresh start
        currentCharacterId = null; 
        currentStateId = null;   
    }

    // Now, render the characters first, which will auto-select/set currentCharacterId
    await renderCharactersList(); 
    // Then render states for the selected character, which will auto-select/set currentStateId
    await renderStatesList(); 

    // Once currentPersonalityId, currentCharacterId, and currentStateId are set (or confirmed null),
    // we can proceed to render tags and gallery for the current context.
    if (currentPersonalityId && currentCharacterId && currentStateId) {
        allDbTags = await assetManagerService.getAllUniqueTagsInHierarchy(currentPersonalityId, currentCharacterId, currentStateId);
        allDbTags.sort((a,b) => a.localeCompare(b)); // Keep sorted
    } else {
        allDbTags = []; // No tags if no full hierarchy selected
    }
    renderTagExplorer(); // Re-render tag explorer based on new allDbTags
    renderGallery();     // Re-render gallery based on new allDbTags and activeTags
    
    // Manage visibility of "Add Character/State" buttons
    if (addCharacterButton) {
        addCharacterButton.disabled = !currentPersonalityId;
    }
    if (addStateButton) {
        addStateButton.disabled = !currentCharacterId;
    }

    console.log(`Asset Manager UI Updated: P:${currentPersonalityId}, C:${currentCharacterId}, S:${currentStateId}.`);
}


// --- INITIALIZATION ---
/**
 * Initializes the Asset Manager Component for a specific personality.
 * @param {string|number|null} personalityId - The ID of the personality whose assets to manage.
 */
export function initializeAssetManagerComponent(personalityId) { // <-- MODIFIED: Accepts personalityId
    if (isInitialized) {
        showView(personalityForm); // Ensure the main form is visible if already initialized
        updateMainUI(personalityId); // Re-initialize UI for the new personality
        return;
    }

    // Set UI element references on first initialization
    personalityForm = document.querySelector('#form-add-personality');
    assetDetailView = document.querySelector('#asset-detail-view');
    mediaLibraryStep = document.querySelector('#media-library-step');
    charactersListEl = document.querySelector('#charactersList'); // Assuming you have this div
    statesListEl = document.querySelector('#statesList'); // Assuming you have this div
    addCharacterButton = document.querySelector('#btnAddCharacter'); // Assuming you have this button
    addStateButton = document.querySelector('#btnAddState');     // Assuming you have this button
    assetUploadInput = document.querySelector('#asset-upload-input'); // Reference to the actual file input

    if (!mediaLibraryStep) {
        console.error("Asset Manager Component: mediaLibraryStep not found.");
        return;
    }

    // --- Wire up all event listeners ---
    document.querySelector('#tag-explorer-search').addEventListener('input', (e) => renderTagExplorer(e.target.value));
    
    // Attach event listeners for new Character/State buttons
    if (addCharacterButton) addCharacterButton.addEventListener('click', handleAddCharacter);
    if (addStateButton) addStateButton.addEventListener('click', handleAddState);

    // Asset Upload Button
    const btnUploadAsset = document.querySelector('#btn-upload-asset');
    if (btnUploadAsset) {
        btnUploadAsset.addEventListener('click', () => {
            if (assetUploadInput) assetUploadInput.click();
        });
    }
    
    // Asset Upload Input Change Listener
    if (assetUploadInput) {
        assetUploadInput.addEventListener('change', async (event) => {
            const files = event.target.files;
            // Ensure we have a full hierarchy selected before allowing upload
            if (!files.length || !currentPersonalityId || !currentCharacterId || !currentStateId) {
                alert("Please select a Personality, Character, and State before uploading assets.");
                return;
            }
            
            for (const file of files) {
                try {
                    // Call the refactored addAsset with all relevant IDs
                    await assetManagerService.addAsset(file, currentPersonalityId, currentCharacterId, currentStateId);
                    console.log(`Uploaded asset: ${file.name}`);
                } catch (error) { 
                    console.error(`Failed to add asset ${file.name}:`, error); 
                    alert(`Failed to add asset ${file.name}. See console for details.`);
                }
            }
            event.target.value = ''; // Clear file input
            await updateMainUI(); // Re-render gallery
        });
    }
    
    document.querySelector('#btn-asset-detail-back').addEventListener('click', () => {
        showView(personalityForm);
        updateMainUI(); // Refresh UI for selected personality
    });
    document.querySelector('#btn-add-tag').addEventListener('click', handleAddTagToAsset);
    document.querySelector('#add-tag-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleAddTagToAsset(); });
    document.querySelector('#btn-delete-asset').addEventListener('click', handleDeleteAsset);
    
    // Initial call to update UI based on the personality passed in
    updateMainUI(personalityId); 

    console.log('Asset Manager Component Initialized (Director Engine Ready).');
    isInitialized = true;
}