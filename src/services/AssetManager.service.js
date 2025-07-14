// FILE: src/services/AssetManager.service.js

import { db } from './Db.service.js';

// Define system tags that are managed automatically and hidden from the user UI.
const SYSTEM_TAGS = ['avatar', 'sfx', 'audio', 'image'];

class AssetManagerService {
    constructor() {
        // We can add any initial properties here if needed later
    }

    /**
     * Adds a new asset to the database, associated with a character.
     * Automatically adds the correct system tag ('avatar' or 'sfx') based on file type.
     * @param {File} file - The file to be added.
     * @param {string[]} tags - An array of USER-DEFINED tags for the asset.
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
        const allTags = [...new Set([...tags, systemTag, assetType])]; // Use a Set to prevent duplicates.

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
                changes.tags = [...new Set([...changes.tags, systemTag, assetToUpdate.type])];
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
     * Gets a sorted, unique list of user-facing tags for a specific character's assets,
     * categorized into 'characters' and 'states'.
     * @param {number} characterId - The ID of the personality.
     * @returns {Promise<{characters: string[], states: string[]}>} A promise that resolves to an object with categorized tags.
     */
    async getAllUniqueTagsForCharacter(characterId) {
        if (typeof characterId === 'undefined' || characterId === null) {
            console.error("AssetManagerService.getAllUniqueTagsForCharacter: characterId is required.");
            return { characters: [], states: [] };
        }
        const allAssets = await this.getAllAssetsForCharacter(characterId);
        const uniqueTags = new Set();
        allAssets.forEach(asset => {
            asset.tags.forEach(tag => uniqueTags.add(tag));
        });

        // Filter out the system-managed tags first.
        const userFacingTags = Array.from(uniqueTags).filter(tag => !SYSTEM_TAGS.includes(tag));

        // NEW: Categorize into character tags and state tags.
        const categorizedTags = {
            characters: [],
            states: []
        };

        userFacingTags.forEach(tag => {
            if (tag.startsWith('char_')) {
                categorizedTags.characters.push(tag);
            } else {
                categorizedTags.states.push(tag);
            }
        });

        // Sort each category alphabetically.
        categorizedTags.characters.sort((a, b) => a.localeCompare(b));
        categorizedTags.states.sort((a, b) => a.localeCompare(b));

        return categorizedTags;
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
	
    /**
     * Gathers all user-defined tags for a character's assets, formats them into a comprehensive
     * instructional prompt, and returns it as a newline-separated string.
     * @param {number} characterId - The ID of the personality.
     * @returns {Promise<string>} A complete, formatted prompt string for the AI.
     */
    async getFormattedTagsForCharacterPrompt(characterId) {
        if (typeof characterId === 'undefined' || characterId === null) {
            console.warn("AssetManagerService.getFormattedTagsForCharacterPrompt: characterId is required.");
            return 'No assets found for this personality. Add some in the Media Library!';
        }

        const allAssets = await this.getAllAssetsForCharacter(characterId);
        const characterNames = new Set();
        const stateTags = new Set();

        // First, iterate through all assets to categorize and format tags correctly
        allAssets.forEach(asset => {
            const userTags = asset.tags.filter(tag => !SYSTEM_TAGS.includes(tag));
            userTags.forEach(userTag => {
                if (userTag.startsWith('char_')) {
                    // Add the cleaned character name (e.g., "emily")
                    characterNames.add(userTag.substring(5));
                } else {
                    // This is a state/emotion/sfx tag, format it with its command
                    if (asset.type === 'image') {
                        stateTags.add(`[${userTag}]`); // Default avatar command
                    } else if (asset.type === 'audio') {
                        stateTags.add(`[sfx:${userTag}]`); // Explicit sfx command
                    }
                }
            });
        });

        // Convert sets to sorted arrays for clean output
        const sortedCharacterNames = Array.from(characterNames).sort();
        const sortedStateTags = Array.from(stateTags).sort();

        // --- Assemble the final prompt string ---
        let promptLines = [
            `---`,
            `DYNAMIC ASSET COMMANDS (Use these in your responses!)`,
            `---`,
            `**These commands are for *your* actions and expressions as the character.** They are directly linked to your character's media assets. Use them in your responses to trigger visuals (avatars) and sounds (sfx).`,
            ``,
            `**How to use (Read Carefully!):**`,
            `- For **Avatars (Visuals)**:`,
            `  - **General Reaction:** Just type the action/emotion tag in brackets. Example: [happy]`,
        ];

        // Only add the character-specific section if there are characters defined
        if (sortedCharacterNames.length > 0) {
            promptLines.push(
                `  - **Character-Specific (when multiple characters are present/possible, to specify who):** Use the format: [characterName,action/emotion].`,
                `    * The 'characterName' MUST be one of the names from the 'Your available characters' list below (e.g., '${sortedCharacterNames[0] || 'emily'}').`,
                `    * Example: [${sortedCharacterNames[0] || 'emily'},happy]`
            );
        }

        promptLines.push(
            `- For **Sound Effects (Audio):** Use 'sfx:' followed by a *single* tag. Multi-tags are NOT used for sound effects.`,
            `  - Example: [sfx:door_opens]`,
            ``
        );

        // Add the list of available characters if any exist
        if (sortedCharacterNames.length > 0) {
            promptLines.push(
                `Your available characters are listed below:`,
                `${sortedCharacterNames.join(', ')}`,
                ``
            );
        }

        // Add the list of available general asset tags
        if (sortedStateTags.length > 0) {
            promptLines.push(
                `Your available asset tags are listed below:`,
                `${sortedStateTags.join('\n')}`
            );
        } else if (sortedCharacterNames.length === 0) {
            // Only show this message if there are NO tags of any kind
            promptLines.push(`No asset tags have been assigned yet. Add some in the Media Library!`);
        }

        return promptLines.join('\n');
    }
}

// Export a single instance of the service
export const assetManagerService = new AssetManagerService();