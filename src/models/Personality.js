import { Character } from './Character.js';

export class Personality {
    constructor(
        name = "",
        image = "",
        description = "",
        prompt = "",
        tagPrompt = "",
        reminder = "",
        toneExamples = [],
        characters = [] // ADD THIS NEW PARAMETER WITH A DEFAULT EMPTY ARRAY
    ) {
        this.name = name;
        this.image = image;
        this.description = description;
        this.prompt = prompt;
        this.tagPrompt = tagPrompt;
        this.reminder = reminder;
        this.toneExamples = toneExamples;
        this.characters = characters.map(charData => new Character(charData)); // ADD THIS NEW LINE
    }
}