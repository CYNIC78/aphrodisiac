// Remove 'import { State } from './State.js';' as it's no longer needed in this model
// import { State } from './State.js';

class Character {
    /**
     * Represents a distinct character within a Personality, holding various states and assets.
     * @param {object} params
     * @param {string} params.id - Unique ID for the character (UUID or similar).
     * @param {string} params.personalityId - The ID of the parent Personality.
     * @param {string} params.name - The name of the character (e.g., "Emily", "Narrator").
     * @param {string|null} params.defaultStateId - The ID of the state to activate by default for this character.
     */
    constructor({ id, personalityId, name, defaultStateId = null }) { // Removed 'states' from params
        this.id = id;
        this.personalityId = personalityId; // New
        this.name = name;
        // Removed 'this.states = states.map(...)', as states are now linked by ID in the DB
        this.defaultStateId = defaultStateId;
    }
}

export { Character };