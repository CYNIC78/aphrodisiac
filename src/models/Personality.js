// FILE: src/models/Personality.js

export class Personality {
    constructor(
        name = "",
        image = "",
        description = "",
        prompt = "",
        tagPrompt = "",
        reminder = "",
        toneExamples = [],
        actors = [] // NEW: This will store our Actor/State hierarchy
    ) {
        this.name = name;
        this.image = image;
        this.description = description;
        this.prompt = prompt;
        this.tagPrompt = tagPrompt;
        this.reminder = reminder;
        this.toneExamples = toneExamples;
        this.actors = actors; // NEW
    }
}