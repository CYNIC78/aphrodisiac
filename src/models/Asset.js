class Asset {
    /**
     * Represents a single media asset (image or audio) associated with a Character State.
     * @param {object} params
     * @param {string} params.id - Unique ID for the asset (UUID or similar).
     * @param {string} params.personalityId - The ID of the parent Personality.
     * @param {string} params.characterId - The ID of the parent Character.
     * @param {string} params.stateId - The ID of the parent State.
     * @param {string} params.name - Original filename of the asset (e.g., "happy_face.png").
     * @param {string} params.type - The type of asset ('avatar' for images, 'sfx' for audio).
     * @param {string} params.value - The extracted tag value (e.g., "happy_face" from "happy_face.png"). This is what the AI will use.
     * @param {Blob} params.data - The raw file data (Blob).
     * @param {Date} params.timestamp - The timestamp when the asset was added.
     */
    constructor({ id, personalityId, characterId, stateId, name, type, value, data, timestamp = new Date() }) {
        this.id = id;
        this.personalityId = personalityId; // New
        this.characterId = characterId;     // New
        this.stateId = stateId;             // New
        this.name = name;
        this.type = type;
        this.value = value;
        this.data = data; // Stored as Blob
        this.timestamp = timestamp;
    }
}

export { Asset };