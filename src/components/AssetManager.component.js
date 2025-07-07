import { assetManagerService } from '../services/AssetManager.service.js';

let isInitialized = false;

/**
 * Creates an HTML element for a single asset card, now with a delete button.
 * @param {object} asset - The asset object from the database.
 * @returns {HTMLElement} The asset card element.
 */
function createAssetCard(asset) {
    const card = document.createElement('div');
    card.className = 'asset-card';
    card.dataset.assetId = asset.id;

    // Create and add the delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-delete-asset material-symbols-outlined';
    deleteBtn.textContent = 'delete';
    card.appendChild(deleteBtn);

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

/**
 * Fetches all assets and renders them in the gallery.
 */
async function renderGallery() {
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
        renderGallery();
        return;
    }

    const uploadButton = document.querySelector('#btn-upload-asset');
    const fileInput = document.querySelector('#asset-upload-input');
    const gallery = document.querySelector('#asset-manager-gallery');
    
    if (!uploadButton || !gallery) return;

    // --- Event Listener for Deleting Assets ---
    gallery.addEventListener('click', async (event) => {
        if (event.target.classList.contains('btn-delete-asset')) {
            const card = event.target.closest('.asset-card');
            const assetId = parseInt(card.dataset.assetId);

            if (confirm('Are you sure you want to delete this asset? This cannot be undone.')) {
                try {
                    await assetManagerService.deleteAsset(assetId);
                    await renderGallery(); // Re-render the gallery to show the change
                } catch (error) {
                    console.error('Failed to delete asset:', error);
                    alert('Could not delete asset. See console for details.');
                }
            }
        }
    });

    uploadButton.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (event) => {
        const files = event.target.files;
        if (!files.length) return;

        for (const file of files) {
            try {
                const tagsRaw = prompt(`Enter comma-separated tags for ${file.name}:`, "new");
                const tags = tagsRaw ? tagsRaw.split(',').map(tag => tag.trim()) : ['untagged'];
                
                await assetManagerService.addAsset(file, tags);
            } catch (error) {
                console.error('Failed to add asset:', error);
                alert(`Could not add asset: ${file.name}. See console for details.`);
            }
        }
        
        event.target.value = ''; 
        await renderGallery();
    });
    
    renderGallery();
    console.log('Asset Manager Component Initialized.');
    isInitialized = true;
}