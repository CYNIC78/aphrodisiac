// FILE: src/services/AssetManager.service.js

import { db } from './Db.service.js';

class AssetManagerService {
    constructor() {
        // Private map to store Object URLs for assets, keyed by assetId.
        // This ensures a single URL is managed per asset to prevent premature revocation issues.
        this._objectUrlCache = new Map(); // Map<assetId, objectURL>
    }

    /**
     * Adds a new asset to the database, associated with a character.
     * @param {File} file - The file to be added.
     * @param {string[]} tags - An array of tags for the asset.
     * @param {number} characterId - The ID of the personality this asset belongs to.
     * @returns {Promise<number>} The ID of the new asset.
     */
    async addAsset(file, tags = [], characterId) {
        if (typeof characterId === 'undefined' || characterId === null) {
            console.error("AssetManagerService.addAsset: characterId is required.");
            throw new Error("characterId is required to add an asset.");
        }
        console.log(`Adding asset: ${file.name} for character ID ${characterId} with tags: ${tags.join(', ')}`);
        const asset = {
            characterId: characterId,
            name: file.name,
            type: file.type.startsWith('image/') ? 'image' : 'audio',
            tags: tags,
            data: file, // Dexie handles blobs directly
            timestamp: new Date()
        };
        const id = await db.assets.add(asset);
        // Note: No URL.createObjectURL here. It happens on demand in getAssetObjectUrl.
        return id;
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
        // If 'data' is being updated (i.e., new file uploaded for existing asset),
        // we should revoke the old URL to prevent memory leaks.
        if (changes.data) {
            const oldUrl = this._objectUrlCache.get(id);
            if (oldUrl) {
                URL.revokeObjectURL(oldUrl);
                this._objectUrlCache.delete(id);
            }
        }
        return await db.assets.update(id, changes);
    }

    /**
     * Deletes an asset from the database.
     * IMPORTANT: This now also revokes the corresponding Object URL.
     * @param {number} id - The ID of the asset to delete.
     * @returns {Promise<void>}
     */
    async deleteAsset(id) {
        // Revoke the Object URL from the cache before deleting the asset from DB
        const url = this._objectUrlCache.get(id);
        if (url) {
            URL.revokeObjectURL(url);
            this._objectUrlCache.delete(id);
            console.log(`[AssetManagerService] Revoked Object URL for asset ID: ${id}`);
        }
        return await db.assets.delete(id);
    }

    /**
     * Deletes all assets associated with a specific character.
     * This is crucial for clean character deletion.
     * @param {number} characterId - The ID of the character whose assets to delete.
     * @returns {Promise<void>}
     */
    async deleteAssetsByCharacterId(characterId) {
        if (typeof characterId === 'undefined' || characterId === null) {
            console.error("AssetManagerService.deleteAssetsByCharacterId: characterId is required.");
            return;
        }
        console.log(`Deleting all assets for character ID: ${characterId}`);
        
        // Retrieve assets first to revoke their URLs
        const assetsToDelete = await db.assets.where('characterId').equals(characterId).toArray();
        for (const asset of assetsToDelete) {
            const url = this._objectUrlCache.get(asset.id);
            if (url) {
                URL.revokeObjectURL(url);
                this._objectUrlCache.delete(asset.id);
                console.log(`[AssetManagerService] Revoked Object URL for asset ID (batch delete): ${asset.id}`);
            }
        }

        await db.assets.where('characterId').equals(characterId).delete();
    }

    /**
     * Retrieves all assets from the database for a specific character.
     * @param {number} characterId - The ID of the personality.
     * @returns {Promise<any[]>} A promise that resolves to an array of assets.
     */
    async getAllAssetsForCharacter(characterId) {
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
    async searchAssetsByTags(tags = [], characterId) {
        if (typeof characterId === 'undefined' || characterId === null) {
            console.error("AssetManagerService.searchAssetsByTags: characterId is required.");
            return [];
        }
        if (!tags || tags.length === 0) {
            return this.getAllAssetsForCharacter(characterId);
        }
        
        const candidateAssets = await db.assets
                                    .where('characterId').equals(characterId)
                                    .and(asset => tags.some(tag => asset.tags.includes(tag)))
                                    .toArray();

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
    async getAllUniqueTagsForCharacter(characterId) {
        if (typeof characterId === 'undefined' || characterId === null) {
            console.error("AssetManagerService.getAllUniqueTagsForCharacter: characterId is required.");
            return [];
        }
        const allAssets = await this.getAllAssetsForCharacter(characterId);
        const uniqueTags = new Set();
        allAssets.forEach(asset => {
            asset.tags.forEach(tag => uniqueTags.add(tag));
        });
        const sortedTags = Array.from(uniqueTags).sort((a, b) => a.localeCompare(b));
        return sortedTags;
    }

    /**
     * Creates and/or retrieves a stable Object URL for an asset's data Blob.
     * This URL is cached and only revoked when the asset is deleted or updated.
     * @param {number} assetId - The ID of the asset.
     * @returns {Promise<string|null>} The Object URL, or null if asset not found or data is not a Blob.
     */
    async getAssetObjectUrl(assetId) {
        // Check cache first
        if (this._objectUrlCache.has(assetId)) {
            console.log(`[AssetManagerService] Returning cached Object URL for asset ID: ${assetId}`);
            return this._objectUrlCache.get(assetId);
        }

        const asset = await this.getAssetById(assetId);
        if (asset && asset.data instanceof Blob) {
            const url = URL.createObjectURL(asset.data);
            this._objectUrlCache.set(assetId, url); // Store in cache
            console.log(`[AssetManagerService] Created and cached new Object URL for asset ID: ${assetId} -> ${url}`);
            return url;
        }
        console.warn(`[AssetManagerService] No valid Blob data found for asset ID: ${assetId}. Cannot create Object URL.`);
        return null;
    }

    /**
     * Searches for image assets (for a specific character) that contain ALL of the given tags and returns the Object URL of the first one found.
     * @param {string[]} tags - An array of tags to filter by.
     * @param {number} characterId - The ID of the personality.
     * @returns {Promise<string|null>} The Object URL of the first matching image asset, or null if none found.
     */
    async getFirstImageObjectUrlByTags(tags = [], characterId) {
        const assets = await this.searchAssetsByTags(tags, characterId);
        const imageAssets = assets.filter(a => a.type === 'image');
        if (imageAssets.length > 0) {
            // If multiple images match, we take the first one found.
            // This will now use the cached URL from getAssetObjectUrl.
            return this.getAssetObjectUrl(imageAssets[0].id);
        }
        return null;
    }
}

// Export a single instance of the service
export const assetManagerService = new AssetManagerService();