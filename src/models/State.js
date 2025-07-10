// Remove 'import { Asset } from './Asset.js';' as it's no longer needed in this model
// import { Asset } from './Asset.js'; 

class State {
    /**
     * Represents a specific context or configuration for a character (e.g., "sitting", "depressed").
     * @param {object} params
     * @param {string} params.id - Unique ID for the state (UUID or similar).
     * @param {string} params.characterId - The ID of the parent Character.
     * @param {string} params.name - The descriptive name of the state (e.g., "working_out", "close_up_shot").
     */
    constructor({ id, characterId, name }) { // Removed 'assets' from params
        this.id = id;
        this.characterId = characterId; // New
        this.name = name;
        // Removed 'this.assets = assets.map(...)', as assets are now linked by ID in the DB
    }
}

export { State };