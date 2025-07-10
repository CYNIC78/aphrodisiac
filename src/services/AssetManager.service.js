import { db } from './Db.service.js';

class AssetManagerService {
    constructor() {
        // We can add any initial properties here if needed later
    }

    /**
     * Adds a new asset to the database, associated with a character.
     * @param {File} file - The file to be added.
     * @param {string[]} tags - An array of tags for the asset.
     * @param {number} characterId - The ID of the personality this asset belongs to.
     * @returns {Promise<number>} The ID of the new asset.
     */
    async addAsset(file, tags = [], characterId) { // <-- MODIFIED: Added characterId parameter
        if (typeof characterId === 'undefined' || characterId === null) {
            console.error("AssetManagerService.addAsset: characterId is required.");
            throw new Error("characterId is required to add an asset.");
        }
        console.log(`Adding asset: ${file.name} for character ID ${characterId} with tags: ${tags.join(', ')}`);
        const asset = {
            characterId: characterId, // <-- ADDED: Associate asset with character
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
     * Deletes all assets associated with a specific character.
     * This is crucial for clean character deletion.
     * @param {number} characterId - The ID of the character whose assets to delete.
     * @returns {Promise<void>}
     */
    async deleteAssetsByCharacterId(characterId) { // <-- ADDED: New function for per-character deletion
        if (typeof characterId === 'undefined' || characterId === null) {
            console.error("AssetManagerService.deleteAssetsByCharacterId: characterId is required.");
            return;
        }
        console.log(`Deleting all assets for character ID: ${characterId}`);
        await db.assets.where('characterId').equals(characterId).delete();
    }

    /**
     * Retrieves all assets from the database for a specific character.
     * @param {number} characterId - The ID of the personality.
     * @returns {Promise<any[]>} A promise that resolves to an array of assets.
     */
    async getAllAssetsForCharacter(characterId) { // <-- MODIFIED: New function for character-specific retrieval
        if (typeof characterId === 'undefined' || characterId === null) {
            console.error("AssetManagerService.getAllAssetsForCharacter: characterId is required.");
            return [];
        }
        return await db.assets.where('characterId').equals(characterId).toArray();
    }

    /**
     * Searches for assets (for a specific character) that contain ALL of the given tags.
     * @param {string[]} tags - An array of tags to filter by.
     * @param {number} characterId - The ID of the personality.
     * @returns {Promise<any[]>} A promise that resolves to an array of matching assets.
     */
    async searchAssetsByTags(tags = [], characterId) { // <-- MODIFIED: Added characterId parameter
        if (typeof characterId === 'undefined' || characterId === null) {
            console.error("AssetManagerService.searchAssetsByTags: characterId is required.");
            return [];
        }
        if (!tags || tags.length === 0) {
            return this.getAllAssetsForCharacter(characterId); // Use character-specific getter
        }
        
        // Step 1: Get all assets for the specific character that have AT LEAST ONE of the desired tags
        const candidateAssets = await db.assets
                                    .where('characterId').equals(characterId) // <-- Filter by characterId first
                                    .and(asset => tags.some(tag => asset.tags.includes(tag))) // Filter by tags
                                    .toArray();

        // Step 2: Filter these candidates in JavaScript to ensure ALL tags are present in the asset's tags array.
        // This is necessary because Dexie's .anyOf() (or .and() combined with a predicate)
        // only checks for SOME tags, not ALL, when using multi-entry indexes in this way.
        const matchingAssets = candidateAssets.filter(asset =>
            tags.every(tag => asset.tags.includes(tag))
        );

        return matchingAssets;
    }
    
    /**
     * Gets a sorted, unique list of all tags for a specific character's assets in the database.
     * @param {number} characterId - The ID of the personality.
     * @returns {Promise<string[]>} A promise that resolves to an array of unique tags.
     */
    async getAllUniqueTagsForCharacter(characterId) { // <-- MODIFIED: New function for character-specific tags
        if (typeof characterId === 'undefined' || characterId === null) {
            console.error("AssetManagerService.getAllUniqueTagsForCharacter: characterId is required.");
            return [];
        }
        const allAssets = await this.getAllAssetsForCharacter(characterId); // Get character's assets
        const uniqueTags = new Set();
        allAssets.forEach(asset => {
            asset.tags.forEach(tag => uniqueTags.add(tag));
        });
        const sortedTags = Array.from(uniqueTags).sort((a, b) => a.localeCompare(b));
        return sortedTags;
    }

    /**
     * Creates an Object URL for an asset's data Blob.
     * This URL can be used as an img.src or audio.src.
     * @param {number} assetId - The ID of the asset.
     * @returns {Promise<string|null>} The Object URL, or null if asset not found or data is not a Blob.
     */
    async getAssetObjectUrl(assetId) {
        const asset = await this.getAssetById(assetId);
        if (asset && asset.data instanceof Blob) {
            return URL.createObjectURL(asset.data);
        }
        return null;
    }

    /**
     * Searches for image assets (for a specific character) that contain ALL of the given tags and returns the Object URL of the first one found.
     * @param {string[]} tags - An array of tags to filter by.
     * @param {number} characterId - The ID of the personality.
     * @returns {Promise<string|null>} The Object URL of the first matching image asset, or null if none found.
     */
    async getFirstImageObjectUrlByTags(tags = [], characterId) { // <-- MODIFIED: Added characterId parameter
        const assets = await this.searchAssetsByTags(tags, characterId); // <-- Pass characterId
        const imageAssets = assets.filter(a => a.type === 'image');
        if (imageAssets.length > 0) {
            // If multiple images match, we take the first one found.
            return this.getAssetObjectUrl(imageAssets[0].id);
        }
        return null;
    }
}

// Export a single instance of the service
export const assetManagerService = new AssetManagerService();