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
            tags: tags.length > 0 ? tags : ['unsorted'], // Ensure assets always have at least one tag
            data: file, // Dexie handles blobs directly
            timestamp: new Date()
        };
        return await db.assets.add(asset);
    }

    /**
     * Retrieves all assets from the database.
     * @returns {Promise<any[]>} A promise that resolves to an array of assets.
     */
    async getAllAssets() {
        return await db.assets.toArray();
    }

    /**
     * Retrieves all assets that have a specific tag.
     * @param {string} tag The tag to filter by.
     * @returns {Promise<any[]>} A promise that resolves to an array of matching assets.
     */
    async getAssetsByTag(tag) {
        if (tag === 'unsorted') {
            return await db.assets.where('tags').equals('unsorted').toArray();
        }
        return await db.assets.where('tags').equals(tag).toArray();
    }

    /**
     * Retrieves a sorted list of all unique tags from the database.
     * @returns {Promise<string[]>} A promise that resolves to an array of unique tag strings.
     */
    async getUniqueTags() {
        const allTags = await db.assets.orderBy('tags').uniqueKeys();
        // The result is a flat array of all tags, so we filter out 'unsorted' for the main list
        return allTags.filter(tag => tag && tag !== 'unsorted');
    }

    /**
     * Adds a new tag to a specific asset.
     * @param {number} assetId The ID of the asset to update.
     * @param {string} newTag The new tag to add.
     * @returns {Promise<number>}
     */
    async addTag(assetId, newTag) {
        // We'll implement the logic for this when we build the tag management UI.
        console.log(`Pretending to add tag '${newTag}' to asset ${assetId}`);
        // Example logic:
        // return await db.assets.update(assetId, { tags: db.transaction.modes.readwrite.update(tags => [...tags, newTag]) });
        return 1;
    }
}

// Export a single instance of the service
export const assetManagerService = new AssetManagerService();