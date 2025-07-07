import { assetManagerService } from '../services/AssetManager.service.js';

let isInitialized = false;

// A simple state to manage the current view
const _state = {
    activeFilter: 'all', // 'all', 'unsorted', or a tag name
};

/**
 * Creates an HTML element for the new, more detailed asset card.
 * @param {object} asset - The asset object from the database.
 * @returns {HTMLElement} The asset card element.
 */
function createAssetCard(asset) {
    const card = document.createElement('div');
    card.className = 'asset-card';
    card.dataset.assetId = asset.id;

    const imgWrapper = document.createElement('div');
    imgWrapper.className = 'asset-card-img-wrapper';

    if (asset.type === 'image') {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(asset.data);
        img.alt = asset.name;
        imgWrapper.appendChild(img);
    } else {
        const icon = document.createElement('span');
        icon.className = 'material-symbols-outlined';
        icon.textContent = 'music_note';
        imgWrapper.appendChild(icon);
    }

    const info = document.createElement('div');
    info.className = 'asset-card-info';
    
    const name = document.createElement('div');
    name.className = 'asset-name';
    name.textContent = asset.name;

    // Placeholder for tag pills
    const tagsContainer = document.createElement('div');
    tagsContainer.className = 'asset-tags-container';

    const manageButton = document.createElement('button');
    manageButton.className = 'btn-manage-tags';
    manageButton.textContent = 'Add tags...';
    
    info.appendChild(name);
    info.appendChild(tagsContainer); // This will hold tags later
    info.appendChild(manageButton);

    card.appendChild(imgWrapper);
    card.appendChild(info);

    return card;
}

/**
 * Renders the gallery view based on the current active filter in the state.
 */
async function renderGallery() {
    const gallery = document.querySelector('#asset-manager-gallery');
    const galleryTitle = document.querySelector('#asset-gallery-title');
    if (!gallery || !galleryTitle) return;

    gallery.innerHTML = ''; // Clear existing content

    let assets = [];
    switch (_state.activeFilter) {
        case 'all':
            galleryTitle.textContent = 'All Assets';
            assets = await assetManagerService.getAllAssets();
            break;
        case 'unsorted':
            galleryTitle.textContent = 'Unsorted';
            assets = await assetManagerService.getAssetsByTag('unsorted');
            break;
        default:
            galleryTitle.textContent = `Group: ${_state.activeFilter}`;
            assets = await assetManagerService.getAssetsByTag(_state.activeFilter);
            break;
    }

    if (assets.length === 0) {
        gallery.innerHTML = `<p class="gallery-empty-placeholder">No assets found.</p>`;
        return;
    }

    assets.forEach(asset => {
        const card = createAssetCard(asset);
        gallery.appendChild(card);
    });
}

/**
 * Renders the list of groups (tags) in the side panel.
 */
async function renderGroups() {
    const groupsList = document.querySelector('#asset-groups-list');
    if (!groupsList) return;

    groupsList.innerHTML = ''; // Clear list

    // Static "All Assets" button
    const allAssetsItem = document.createElement('div');
    allAssetsItem.className = 'asset-group-item';
    allAssetsItem.textContent = 'All Assets';
    allAssetsItem.dataset.filter = 'all';
    if (_state.activeFilter === 'all') allAssetsItem.classList.add('active');
    allAssetsItem.addEventListener('click', () => {
        _state.activeFilter = 'all';
        renderGroups(); // Re-render to update active state
        renderGallery();
    });

    // Static "Unsorted" button
    const unsortedItem = document.createElement('div');
    unsortedItem.className = 'asset-group-item';
    unsortedItem.textContent = 'Unsorted';
    unsortedItem.dataset.filter = 'unsorted';
    if (_state.activeFilter === 'unsorted') unsortedItem.classList.add('active');
    unsortedItem.addEventListener('click', () => {
        _state.activeFilter = 'unsorted';
        renderGroups();
        renderGallery();
    });
    
    groupsList.appendChild(allAssetsItem);
    groupsList.appendChild(unsortedItem);

    // Dynamic tag-based groups
    const tags = await assetManagerService.getUniqueTags();
    tags.forEach(tag => {
        const groupItem = document.createElement('div');
        groupItem.className = 'asset-group-item';
        groupItem.textContent = tag;
        groupItem.dataset.filter = tag;
        if (_state.activeFilter === tag) groupItem.classList.add('active');
        groupItem.addEventListener('click', () => {
            _state.activeFilter = tag;
            renderGroups();
            renderGallery();
        });
        groupsList.appendChild(groupItem);
    });
}

/**
 * Main initialization function for the entire Asset Manager component.
 */
export function initializeAssetManagerComponent() {
    if (isInitialized) {
        renderGroups();
        renderGallery();
        return;
    }

    const uploadButton = document.querySelector('#btn-upload-asset');
    const fileInput = document.querySelector('#asset-upload-input');
    const addGroupButton = document.querySelector('#btn-add-group');

    if (!uploadButton) return;

    uploadButton.addEventListener('click', () => fileInput.click());

    addGroupButton.addEventListener('click', () => {
        alert("To create a new group, simply add a new, unique tag to an asset during upload or by using the 'Manage Tags' button on an asset.");
    });
    
    fileInput.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (!files.length) return;

        for (const file of files) {
            try {
                const tagsRaw = prompt(`Enter comma-separated tags for ${file.name}:`);
                const tags = tagsRaw ? tagsRaw.split(',').map(tag => tag.trim().toLowerCase()).filter(Boolean) : [];
                await assetManagerService.addAsset(file, tags);
            } catch (error) {
                console.error('Failed to add asset:', error);
            }
        }
        
        event.target.value = ''; // Reset file input
        await renderGroups();
        await renderGallery();
    });
    
    // Initial full render
    renderGroups();
    renderGallery();

    console.log('Asset Manager Component Initialized.');
    isInitialized = true;
}