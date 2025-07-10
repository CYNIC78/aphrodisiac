class Asset {
    /**
     * Represents a single media asset (image or audio) associated with a Character State.
     * @param {object} params
     * @param {string} params.id - Unique ID for the asset (UUID or similar).
     * @param {string} params.name - Original filename of the asset (e.g., "happy_face.png").
     * @param {string} params.type - The type of asset ('avatar' for images, 'sfx' for audio).
     * @param {string} params.value - The extracted tag value (e.g., "happy_face" from "happy_face.png"). This is what the AI will use.
     * @param {string} params.dataUrl - Base64 encoded string of the asset (for images), or a local URL (for audio).
     */
    constructor({ id, name, type, value, dataUrl }) {
        this.id = id; // Unique ID for this asset
        this.name = name; // Original filename
        this.type = type; // 'avatar' or 'sfx'
        this.value = value; // The "key" the AI will use in [tag:key]
        this.dataUrl = dataUrl; // Base64 for images, or perhaps a local URL for larger audio files (we'll refine this)
    }
}

export { Asset };