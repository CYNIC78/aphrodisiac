// Remove 'import { Character } from './Character.js';' as it's no longer needed in this model
// import { Character } from './Character.js';

export class Personality {
    constructor(
        name = "",
        image = "",
        description = "",
        prompt = "",
        tagPrompt = "",
        reminder = "",
        toneExamples = []
        // Removed 'characters = []' from parameters
    ) {
        this.name = name;
        this.image = image;
        this.description = description;
        this.prompt = prompt;
        this.tagPrompt = tagPrompt;
        this.reminder = reminder;
        this.toneExamples = toneExamples;
        // Removed 'this.characters = characters.map(...)', as characters are now linked by ID in the DB
    }
}