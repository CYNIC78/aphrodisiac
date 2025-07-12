// FILE: src/services/AssetManager.service.js

import { db } from './Db.service.js';

// Define system tags that are managed automatically and hidden from the user UI.
const SYSTEM_TAGS = ['avatar', 'sfx', 'audio'];

class AssetManagerService {
    constructor() {
        // We can add any initial properties here if needed later
    }

    /**
     * Adds a new asset to the database, associated with a character.
     * Automatically adds the correct system tag ('avatar' or 'sfx') based on file type.
     * @param {File} file - The file to be added.
     ** @param {string[]} tags - An array of USER-DEFINED tags for the asset (e.g., ['actorName', 'stateName']).
     * @param {number} characterId - The ID of the personality this asset belongs to.
     * @returns {Promise<number>} The ID of the new asset.
     */
    async addAsset(file, tags = [], characterId) {
        if (typeof characterId === 'undefined' || characterId === null) {
            console.error("AssetManagerService.addAsset: characterId is required.");
            throw new Error("characterId is required to add an asset.");
        }

        const assetType = file.type.startsWith('image/') ? 'image' : 'audio';
        const systemTag = assetType === 'image' ? 'avatar' : 'sfx';
        
        // Combine user tags with the automatically determined system tag.
        const allTags = [...new Set([...tags, systemTag])]; // Use a Set to prevent duplicates.

        console.log(`Adding asset: ${file.name} for character ID ${characterId} with final tags: ${allTags.join(', ')}`);
        
        const asset = {
            characterId: characterId,
            name: file.name,
            type: assetType,
            tags: allTags, // Save the combined list of tags
            data: file,
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
     * Ensures the correct system tag is preserved when user-defined tags are changed.
     * @param {number} id - The ID of the asset to update.
     * @param {object} changes - An object with the properties to change.
     * @returns {Promise<number>}
     */
    async updateAsset(id, changes) {
        // If tags are being updated, we must ensure the system tag is preserved.
        if (changes.tags) {
            const assetToUpdate = await db.assets.get(id);
            if (assetToUpdate) {
                const systemTag = assetToUpdate.type === 'image' ? 'avatar' : 'sfx';
                // Combine the new user tags with the existing system tag.
                const userTags = changes.tags.filter(t => !SYSTEM_TAGS.includes(t));
                changes.tags = [...new Set([...userTags, systemTag])];
            }
        }
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
     * @param {number} characterId - The ID of the character whose assets to delete.
     * @returns {Promise<void>}
     */
    async deleteAssetsByCharacterId(characterId) {
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
    async getAllAssetsForCharacter(characterId) {
        if (typeof characterId === 'undefined' || characterId === null) {
            console.error("AssetManagerService.getAllAssetsForCharacter: characterId is required.");
            return [];
        }
        return await db.assets.where('characterId').equals(characterId).toArray();
    }

    /**
     * Searches for assets (for a specific character) that contain ALL of the given tags.
     * This function is used by the core system and searches ALL tags, including hidden ones.
     * @param {string[]} tags - An array of tags to filter by (e.g., ['actorName', 'stateName']).
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
        
        // This query is slightly inefficient but robust. It first finds any asset that has at least one of the tags.
        const candidateAssets = await db.assets
                                    .where('characterId').equals(characterId)
                                    .and(asset => tags.some(tag => asset.tags.includes(tag)))
                                    .toArray();

        // Then, it filters that list down to only assets that have ALL of the tags.
        const matchingAssets = candidateAssets.filter(asset =>
            tags.every(tag => asset.tags.includes(tag))
        );

        return matchingAssets;
    }
    
    /**
     * Gets a sorted, unique list of USER-FACING tags for a specific character's assets.
     * It actively filters out the hidden system tags.
     * @param {number} characterId - The ID of the personality.
     * @returns {Promise<string[]>} A promise that resolves to an array of unique, user-defined tags.
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
        
        // Filter out the system-managed tags before returning to the UI.
        const userFacingTags = Array.from(uniqueTags).filter(tag => !SYSTEM_TAGS.includes(tag));
        
        const sortedTags = userFacingTags.sort((a, b) => a.localeCompare(b));
        return sortedTags;
    }

    /**
     * Creates an Object URL for an asset's data Blob.
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
     * Searches for image assets that contain ALL of the given tags and returns the Object URL of the first one found.
     * @param {string[]} tags - An array of tags to filter by.
     * @param {number} characterId - The ID of the personality.
     * @returns {Promise<string|null>} The Object URL of the first matching image asset, or null if none found.
     */
    async getFirstImageObjectUrlByTags(tags = [], characterId) {
        const assets = await this.searchAssetsByTags(tags, characterId);
        const imageAssets = assets.filter(a => a.type === 'image');
        if (imageAssets.length > 0) {
            return this.getAssetObjectUrl(imageAssets[0].id);
        }
        return null;
    }

    // --- NEW FUNCTIONS FOR SCENE EXPLORER ---

    /**
     * NEW: Re-tags assets from a deleted state to the 'default' state for a given actor.
     * @param {number} characterId - The ID of the personality.
     * @param {string} actorName - The name of the actor whose state is being deleted.
     * @param {string} stateNameToDelete - The name of the state being deleted.
     */
    async retagAssetsOnStateDelete(characterId, actorName, stateNameToDelete) {
        const newStateName = 'default';
        // Find all assets tagged with the specific actor and the state-to-delete.
        const assetsToRetag = await this.searchAssetsByTags([actorName, stateNameToDelete], characterId);

        const updates = [];
        for (const asset of assetsToRetag) {
            // Remove the old state name from the tags array.
            const newTags = asset.tags.filter(tag => tag !== stateNameToDelete);
            // Add the 'default' state name, ensuring it's not already there.
            if (!newTags.includes(newStateName)) {
                newTags.push(newStateName);
            }
            // Add the update to a list for bulk operation.
            updates.push({ key: asset.id, changes: { tags: newTags } });
        }

        if (updates.length > 0) {
            await db.assets.bulkUpdate(updates);
        }
        console.log(`Retagged ${assetsToRetag.length} assets from state '${stateNameToDelete}' to '${newStateName}' for actor '${actorName}'.`);
    }

    /**
     * NEW: Deletes all assets associated with a given actor.
     * @param {number} characterId - The ID of the personality.
     * @param {string} actorNameToDelete - The name of the actor to delete all assets for.
     */
    async deleteAssetsOnActorDelete(characterId, actorNameToDelete) {
        // Find all assets that have the actor's tag.
        const assetsToDelete = await this.searchAssetsByTags([actorNameToDelete], characterId);
        
        if (assetsToDelete.length > 0) {
            const assetIdsToDelete = assetsToDelete.map(asset => asset.id);
            await db.assets.bulkDelete(assetIdsToDelete);
            console.log(`Deleted ${assetIdsToDelete.length} assets associated with actor '${actorNameToDelete}'.`);
        } else {
            console.log(`No assets found for actor '${actorNameToDelete}' to delete.`);
        }
    }
}

// Export a single instance of the service
export const assetManagerService = new AssetManagerService();