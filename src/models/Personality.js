// FILE: src/models/Personality.js

export class Personality {
    constructor(name = "", image = "", description = "", prompt = "", tagPrompt = "", reminder = "", toneExamples = []) {
        this.name = name;
        this.image = image;
        this.description = description;
        this.prompt = prompt;
        this.tagPrompt = tagPrompt; // NEW
        this.reminder = reminder;
        this.toneExamples = toneExamples;
    }
}