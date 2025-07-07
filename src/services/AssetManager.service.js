import { db } from './Db.service.js';

class AssetManagerService {
    constructor() {
        // We can add any initial properties here if needed later
    }

    /**
     * Adds a new asset to the database.
     * @param {File} file - The file to be added.
     * @param {string[]} tags - An array of tags for the asset.
     * @returns {Promise<number>} The ID of the new asset.
     */
    async addAsset(file, tags = []) {
        console.log(`Adding asset: ${file.name} with tags: ${tags.join(', ')}`);
        const asset = {
            name: file.name,
            type: file.type.startsWith('image/') ? 'image' : 'audio',
            tags: tags,
            data: file, // Dexie handles blobs directly
            timestamp: new Date()
        };
        return await db.assets.add(asset);
    }

    /**
     * Retrieves a single asset by its ID and adds a usable dataUrl.
     * @param {number} id - The ID of the asset to retrieve.
     * @returns {Promise<object|undefined>} The asset object, or undefined if not found.
     */
    async getAssetById(id) {
        const asset = await db.assets.get(id);
        if (asset && asset.data) {
            asset.dataUrl = URL.createObjectURL(asset.data);
        }
        return asset;
    }
    
    /**
     * Updates a specific asset in the database.
     * @param {number} id - The ID of the asset to update.
     * @param {object} changes - An object with the properties to change.
     * @returns {Promise<number>}
     */
    async updateAsset(id, changes) {
        return await db.assets.update(id, changes);
    }

    /**
     * Deletes an asset from the database.
     * @param {number} id - The ID of the asset to delete.
     * @returns {Promise<void>}
     */
    async deleteAsset(id) {
        return await db.assets.delete(id);
    }


    /**
     * Retrieves all assets from the database and adds usable dataUrls.
     * @returns {Promise<any[]>} A promise that resolves to an array of assets.
     */
    async getAllAssets() {
        const assets = await db.assets.toArray();
        assets.forEach(asset => {
            if (asset.data) {
                asset.dataUrl = URL.createObjectURL(asset.data);
            }
        });
        return assets;
    }

    /**
     * Searches for assets that contain ALL of the given tags.
     * @param {string[]} tags - An array of tags to filter by.
     * @returns {Promise<any[]>} A promise that resolves to an array of matching assets.
     */
    async searchAssetsByTags(tags = []) {
        if (!tags || tags.length === 0) {
            return this.getAllAssets();
        }
        // This filter is more robust than the previous version
        const assets = await db.assets.filter(asset => tags.every(tag => asset.tags.includes(tag))).toArray();
        assets.forEach(asset => {
            if (asset.data) {
                asset.dataUrl = URL.createObjectURL(asset.data);
            }
        });
        return assets;
    }
    
    /**
     * Gets a sorted, unique list of all tags in the database.
     * @returns {Promise<string[]>} A promise that resolves to an array of unique tags.
     */
    async getAllUniqueTags() {
        // This correctly retrieves all unique tags from the multi-entry index
        const allTags = await db.assets.orderBy('tags').uniqueKeys();
        return allTags.sort((a, b) => a.localeCompare(b));
    }

    /**
     * Finds the first asset of a specific type that has a given tag.
     * @param {string} type - The type of asset ('image' or 'audio').
     * @param {string} tag - The tag to search for.
     * @returns {Promise<object|undefined>} The first matching asset with a dataUrl, or undefined if not found.
     */
    async getAssetByTag(type, tag) {
        const asset = await db.assets
            .where('type').equals(type)
            .and(asset => asset.tags.includes(tag))
            .first(); // .first() is efficient, it stops searching after finding one.
            
        if (asset && asset.data) {
            // We must create a usable URL from the stored blob data
            asset.dataUrl = URL.createObjectURL(asset.data);
        }
        return asset;
    }
}

// Export a single instance of the service
export const assetManagerService = new AssetManagerService();