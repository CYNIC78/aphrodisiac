// FILE: src/services/AssetManager.service.js

import { db } from './Db.service.js';
// Import the Asset model to ensure we're working with correct data types
import { Asset } from '../models/Asset.js'; 

class AssetManagerService {
    constructor() {
        // Any initial properties can be added here if needed later
    }

    /**
     * Adds a new asset to the database, associated with a personality, character, and state.
     * @param {File} file - The file to be added.
     * @param {string} personalityId - The ID of the personality this asset belongs to.
     * @param {string} characterId - The ID of the character this asset belongs to.
     * @param {string} stateId - The ID of the state this asset belongs to.
     * @returns {Promise<string>} The ID of the new asset.
     */
    async addAsset(file, personalityId, characterId, stateId) { // <-- MODIFIED: New ID params
        if (!personalityId || !characterId || !stateId || !file) {
            console.error("AssetManagerService.addAsset: personalityId, characterId, stateId, and file are required.");
            throw new Error("Missing required parameters to add an asset.");
        }
        
        console.log(`Adding asset: ${file.name} for Personality ID ${personalityId}, Character ID ${characterId}, State ID ${stateId}`);

        // Extract type and value from the file
        const type = file.type.startsWith('image/') ? 'avatar' : (file.type.startsWith('audio/') ? 'sfx' : 'unknown');
        // Extract value from filename (e.g., "my_image.png" -> "my_image")
        const value = file.name.split('.').slice(0, -1).join('.');

        // We can add initial tags here if needed, or let the user add them later via UI.
        // For now, let's keep the 'tags' array in line with existing schema but focus on 'type' and 'value'.
        const initialTags = [type, value]; // Or just [] if we want tags to be purely user-defined

        const asset = new Asset({ // Use the Asset model constructor for consistency
            id: undefined, // Dexie will assign ID
            personalityId: personalityId,
            characterId: characterId,
            stateId: stateId,
            name: file.name,
            type: type, // 'avatar' or 'sfx'
            value: value, // e.g., 'happy_face'
            tags: initialTags, // Keeping tags for now, though 'type' and 'value' are primary
            data: file, // Dexie handles blobs directly
            timestamp: new Date()
        });
        
        // Dexie will assign the 'id' when added
        const newAssetId = await db.assets.add(asset); 
        return newAssetId;
    }

    /**
     * Retrieves a single asset by its ID.
     * @param {string} id - The ID of the asset to retrieve.
     * @returns {Promise<Asset|undefined>} The asset object, or undefined if not found.
     */
    async getAssetById(id) {
        const assetData = await db.assets.get(id);
        return assetData ? new Asset(assetData) : undefined; // Return as an Asset model instance
    }
    
    /**
     * Updates a specific asset in the database.
     * @param {string} id - The ID of the asset to update.
     * @param {object} changes - An object with the properties to change.
     * @returns {Promise<number>} Number of records updated (1 if successful, 0 otherwise).
     */
    async updateAsset(id, changes) {
        return await db.assets.update(id, changes);
    }

    /**
     * Deletes an asset from the database.
     * @param {string} id - The ID of the asset to delete.
     * @returns {Promise<void>}
     */
    async deleteAsset(id) {
        return await db.assets.delete(id);
    }

    /**
     * Deletes all assets associated with a specific personality.
     * Crucial for clean personality deletion.
     * @param {string} personalityId - The ID of the personality whose assets to delete.
     * @returns {Promise<void>}
     */
    async deleteAssetsByPersonalityId(personalityId) { // <-- MODIFIED: Renamed parameter and usage
        if (!personalityId) {
            console.error("AssetManagerService.deleteAssetsByPersonalityId: personalityId is required.");
            return;
        }
        console.log(`Deleting all assets for Personality ID: ${personalityId}`);
        await db.assets.where('personalityId').equals(personalityId).delete();
    }

    /**
     * Deletes all assets associated with a specific character.
     * @param {string} characterId - The ID of the character whose assets to delete.
     * @returns {Promise<void>}
     */
    async deleteAssetsByCharacterId(characterId) { // <-- NEW: For deleting assets when a character is deleted
        if (!characterId) {
            console.error("AssetManagerService.deleteAssetsByCharacterId: characterId is required.");
            return;
        }
        console.log(`Deleting all assets for Character ID: ${characterId}`);
        await db.assets.where('characterId').equals(characterId).delete();
    }

    /**
     * Deletes all assets associated with a specific state.
     * @param {string} stateId - The ID of the state whose assets to delete.
     * @returns {Promise<void>}
     */
    async deleteAssetsByStateId(stateId) { // <-- NEW: For deleting assets when a state is deleted
        if (!stateId) {
            console.error("AssetManagerService.deleteAssetsByStateId: stateId is required.");
            return;
        }
        console.log(`Deleting all assets for State ID: ${stateId}`);
        await db.assets.where('stateId').equals(stateId).delete();
    }

    /**
     * Retrieves all assets from the database for a specific personality, character, and state.
     * If characterId and stateId are not provided, it will return all assets for the personality.
     * @param {string} personalityId - The ID of the personality.
     * @param {string} [characterId] - Optional. The ID of the character.
     * @param {string} [stateId] - Optional. The ID of the state.
     * @returns {Promise<Asset[]>} A promise that resolves to an array of assets.
     */
    async getAssets(personalityId, characterId = null, stateId = null) { // <-- MODIFIED: New signature
        if (!personalityId) {
            console.error("AssetManagerService.getAssets: personalityId is required.");
            return [];
        }

        let query = db.assets.where('personalityId').equals(personalityId);

        if (characterId) {
            query = query.and(asset => asset.characterId === characterId);
        }
        if (stateId) {
            query = query.and(asset => asset.stateId === stateId);
        }
        
        const assetsData = await query.toArray();
        return assetsData.map(assetData => new Asset(assetData)); // Return as Asset model instances
    }

    /**
     * Searches for assets (for a specific hierarchy) that contain ALL of the given tags.
     * @param {string} personalityId - The ID of the personality.
     * @param {string} characterId - The ID of the character.
     * @param {string} stateId - The ID of the state.
     * @param {string[]} tags - An array of tags to filter by.
     * @returns {Promise<Asset[]>} A promise that resolves to an array of matching assets.
     */
    async searchAssetsByTags(personalityId, characterId, stateId, tags = []) { // <-- MODIFIED: New signature
        if (!personalityId || !characterId || !stateId) {
            console.error("AssetManagerService.searchAssetsByTags: All IDs (personalityId, characterId, stateId) are required.");
            return [];
        }

        // Get assets for the specific hierarchy
        const allAssetsInHierarchy = await this.getAssets(personalityId, characterId, stateId);

        if (!tags || tags.length === 0) {
            return allAssetsInHierarchy;
        }
        
        // Filter these candidates in JavaScript to ensure ALL tags are present in the asset's tags array.
        const matchingAssets = allAssetsInHierarchy.filter(asset =>
            asset.tags && tags.every(tag => asset.tags.includes(tag))
        );

        return matchingAssets;
    }
    
    /**
     * Gets a sorted, unique list of all tags for assets within a specific personality, character, and state.
     * @param {string} personalityId - The ID of the personality.
     * @param {string} characterId - The ID of the character.
     * @param {string} stateId - The ID of the state.
     * @returns {Promise<string[]>} A promise that resolves to an array of unique tags.
     */
    async getAllUniqueTagsInHierarchy(personalityId, characterId, stateId) { // <-- MODIFIED: New signature
        if (!personalityId || !characterId || !stateId) {
            console.error("AssetManagerService.getAllUniqueTagsInHierarchy: All IDs are required.");
            return [];
        }
        const allAssets = await this.getAssets(personalityId, characterId, stateId); // Get assets in the specific hierarchy
        const uniqueTags = new Set();
        allAssets.forEach(asset => {
            if (asset.tags) { // Ensure asset.tags exists
                asset.tags.forEach(tag => uniqueTags.add(tag));
            }
        });
        const sortedTags = Array.from(uniqueTags).sort((a, b) => a.localeCompare(b));
        return sortedTags;
    }

    /**
     * Creates an Object URL for an asset's data Blob.
     * This URL can be used as an img.src or audio.src.
     * @param {string} assetId - The ID of the asset.
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
     * Searches for 'avatar' (image) or 'sfx' (audio) assets (for a specific hierarchy) by their 'value' and returns the Object URL of the first one found.
     * This is the primary function for the AI Director to request assets.
     * @param {string} personalityId - The ID of the personality.
     * @param {string} characterId - The ID of the character.
     * @param {string} stateId - The ID of the state.
     * @param {string} type - The asset type ('avatar' or 'sfx').
     * @param {string} value - The specific value to match (e.g., 'happy' for avatar, 'door_creak' for sfx).
     * @returns {Promise<string|null>} The Object URL of the first matching asset, or null if none found.
     */
    async getAssetUrlByTypeAndValue(personalityId, characterId, stateId, type, value) { // <-- NEW: For AI Director asset lookup
        if (!personalityId || !characterId || !stateId || !type || !value) {
            console.warn("AssetManagerService.getAssetUrlByTypeAndValue: Missing required IDs or type/value.", { personalityId, characterId, stateId, type, value });
            return null;
        }

        const assets = await db.assets
                                .where('personalityId').equals(personalityId)
                                .and(asset => asset.characterId === characterId && 
                                            asset.stateId === stateId &&
                                            asset.type === type &&
                                            asset.value === value)
                                .toArray();
                                
        if (assets.length > 0) {
            // If multiple assets match, we take the first one found.
            // Ensure we return an Asset model instance for consistency with getAssetById for URL creation.
            const firstAsset = new Asset(assets[0]); 
            if (firstAsset.data instanceof Blob) {
                 return URL.createObjectURL(firstAsset.data);
            }
        }
        return null;
    }
}

// Export a single instance of the service
export const assetManagerService = new AssetManagerService();