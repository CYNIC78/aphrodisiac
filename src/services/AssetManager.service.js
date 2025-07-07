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
     * Retrieves all assets from the database.
     * @returns {Promise<any[]>} A promise that resolves to an array of assets.
     */
    async getAllAssets() {
        return await db.assets.toArray();
    }

    /**
     * Searches for assets by a tag search term.
     * @param {string} term - The search term to filter tags by.
     * @returns {Promise<any[]>} A promise that resolves to an array of matching assets.
     */
    async searchAssets(term) {
        if (!term) {
            return this.getAllAssets();
        }
        // Use Dexie's powerful querying to find assets where any tag starts with the term (case-insensitive)
        return await db.assets.where('tags').startsWithIgnoreCase(term).toArray();
    }
}

// Export a single instance of the service
export const assetManagerService = new AssetManagerService();