import { assetManagerService } from '../services/AssetManager.service.js';
import { showElement, hideElement } from '../utils/helpers.js';

let isInitialized = false;

// UI Elements
let personalityForm, assetDetailView;

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

// Show the detail view for a specific asset
async function showAssetDetailView(assetId) {
    const asset = await assetManagerService.getAssetById(assetId);
    if (!asset) {
        console.error(`Asset with ID ${assetId} not found.`);
        return;
    }

    // Populate the detail view
    const previewEl = assetDetailView.querySelector('#asset-detail-preview');
    const nameEl = assetDetailView.querySelector('#asset-detail-name');
    
    previewEl.innerHTML = ''; // Clear previous preview
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

    // We will add logic for tags and delete button later
    showView(assetDetailView);
}

// Creates an HTML element for a single asset card.
function createAssetCard(asset) {
    const card = document.createElement('div');
    card.className = 'asset-card';
    card.dataset.assetId = asset.id;

    // *** EVENT LISTENER TO OPEN DETAIL VIEW ***
    card.addEventListener('click', () => showAssetDetailView(asset.id));

    if (asset.type === 'image') {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(asset.data);
        img.alt = asset.name;
        card.appendChild(img);
    } else if (asset.type === 'audio') {
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


async function renderGallery() {
    // ... (renderGallery function remains the same, so not shown for brevity)
    const gallery = document.querySelector('#asset-manager-gallery');
    if (!gallery) return;

    gallery.innerHTML = ''; // Clear existing content
    const assets = await assetManagerService.getAllAssets();

    if (assets.length === 0) {
        gallery.innerHTML = `<p class="gallery-empty-placeholder">Your media library is empty. Upload some files to get started!</p>`;
        return;
    }

    assets.forEach(asset => {
        const card = createAssetCard(asset);
        gallery.appendChild(card);
    });
}

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
    const searchInput = document.querySelector('#asset-search-input');
    const backToLibraryBtn = document.querySelector('#btn-asset-detail-back');

    if (!uploadButton) return;

    // Go back from detail view to the gallery
    backToLibraryBtn.addEventListener('click', () => showView(personalityForm));
    
    uploadButton.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (!files.length) return;

        for (const file of files) {
            try {
                // *** THE ANNOYING PROMPT IS GONE! ***
                // We just add a default tag for now.
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