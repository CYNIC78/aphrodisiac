import { Asset } from './Asset.js'; // Import the Asset model

class State {
    /**
     * Represents a specific context or configuration for a character (e.g., "sitting", "depressed").
     * @param {object} params
     * @param {string} params.id - Unique ID for the state (UUID or similar).
     * @param {string} params.name - The descriptive name of the state (e.g., "working_out", "close_up_shot").
     * @param {Asset[]} params.assets - An array of Asset objects associated with this state.
     */
    constructor({ id, name, assets = [] }) {
        this.id = id; // Unique ID for this state
        this.name = name; // User-defined name for the state
        this.assets = assets.map(assetData => new Asset(assetData)); // Ensure assets are Asset instances
    }
}

export { State };