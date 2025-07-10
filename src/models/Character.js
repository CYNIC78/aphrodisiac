import { State } from './State.js'; // Import the State model

class Character {
    /**
     * Represents a distinct character within a Personality, holding various states and assets.
     * @param {object} params
     * @param {string} params.id - Unique ID for the character (UUID or similar).
     * @param {string} params.name - The name of the character (e.g., "Emily", "Narrator").
     * @param {State[]} params.states - An array of State objects associated with this character.
     * @param {string|null} params.defaultStateId - The ID of the state to activate by default for this character.
     */
    constructor({ id, name, states = [], defaultStateId = null }) {
        this.id = id; // Unique ID for this character
        this.name = name; // User-defined name for the character
        this.states = states.map(stateData => new State(stateData)); // Ensure states are State instances
        this.defaultStateId = defaultStateId; // Used to know which state to default to when this character is active
    }
}

export { Character };