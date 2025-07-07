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
     * Retrieves a single asset by its ID.
     * @param {number} id - The ID of the asset to retrieve.
     * @returns {Promise<object|undefined>} The asset object, or undefined if not found.
     */
    async getAssetById(id) {
        return await db.assets.get(id);
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
     * Retrieves all assets from the database.
     * @returns {Promise<any[]>} A promise that resolves to an array of assets.
     */
    async getAllAssets() {
        return await db.assets.toArray();
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
        // This Dexie query finds assets where the 'tags' array contains every tag from the input array.
        return await db.assets.where('tags').all(tags).toArray();
    }
    
    /**
     * Gets a sorted, unique list of all tags in the database.
     * @returns {Promise<string[]>} A promise that resolves to an array of unique tags.
     */
    async getAllUniqueTags() {
        const allTags = await db.assets.orderBy('tags').uniqueKeys();
        // The result of uniqueKeys is a flat array, so we can sort it directly.
        return allTags.sort((a, b) => a.localeCompare(b));
    }
}

// Export a single instance of the service
export const assetManagerService = new AssetManagerService();