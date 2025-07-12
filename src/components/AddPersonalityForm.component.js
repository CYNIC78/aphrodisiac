import { Personality } from "../models/Personality";
import * as personalityService from '../services/Personality.service';
import * as stepperService from '../services/Stepper.service';
import * as overlayService from '../services/Overlay.service';
import { initializeAssetManagerComponent } from './AssetManager.component.js';
import { assetManagerService } from '../services/AssetManager.service.js';

let isInitialized = false;
let currentPersonalityId = null;

export function initializeAddPersonalityForm(personalityId = null) {
    // Only initialize event listeners once
    if (!isInitialized) {
        const form = document.querySelector("#form-add-personality");
        const btn = document.querySelector('#btn-add-tone-example');

        if (!form || !btn) {
            console.error("AddPersonalityForm elements not found, cannot initialize.");
            return;
        }

        // CRITICAL FIX HERE: Use addEventListener for submit to ensure 'e' (event object) is always passed
        form.addEventListener('submit', async (e) => { // <-- CRITICAL FIX: Changed from form.submit = ...
            e.preventDefault(); // Prevent default form submission

            // Turn all the form data into a personality object
            const personality = new Personality();
            const data = new FormData(form);
            
            // Collect form data into personality object
            for (const [key, value] of data.entries()) {
                if (key.includes("tone-example")) {
                    if (value) {
                        personality.toneExamples.push(value);
                    }
                    continue;
                }
                if (key === 'id') {
                    continue;
                }
                // Handle checkboxes
                if (key === 'internetEnabled' || key === 'roleplayEnabled') {
                    personality[key] = data.has(key);
                } else {
                    personality[key] = value;
                }
            }

            // Handle both edit and add cases
            const idFromForm = data.get('id');
            let finalPersonalityId = null;

            if (idFromForm) { // This is an edit
                finalPersonalityId = parseInt(idFromForm);
                await personalityService.edit(finalPersonalityId, personality);
                console.log(`Edited personality with ID: ${finalPersonalityId}`);
            } else { // This is a new personality being added
                finalPersonalityId = await personalityService.add(personality);
                console.log(`Added new personality with ID: ${finalPersonalityId}`);
            }
            // After adding/editing, update currentPersonalityId to ensure context is maintained
            currentPersonalityId = finalPersonalityId;
            
            overlayService.closeOverlay();
            // After closing, the UI will re-render personalities, which will trigger avatar loads.
        }); // <-- CRITICAL FIX: End of addEventListener

        // This code is for setting up the `add tone example` button
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.createElement('input');
            input.type = 'text';
            input.name = `tone-example-${document.querySelectorAll('.tone-example').length + 1}`;
            input.classList.add('tone-example');
            input.placeholder = 'Tone example';
            btn.before(input);
        });

        // --- NEW: Populate Tag Prompt button listener ---
        const btnPopulateTagPrompt = document.querySelector('#btn-populate-tagprompt');
        const tagPromptTextarea = document.querySelector('#tagPrompt');
        if (btnPopulateTagPrompt && tagPromptTextarea) {
            btnPopulateTagPrompt.addEventListener('click', async () => {
                if (currentPersonalityId === null) {
                    alert("Please save the personality first (by clicking 'Submit' on the last step) to enable tag population. Once saved, you can edit it to populate the tags.");
                    return;
                }

                // Define the instructional header for the AI
                const aiInstructionHeader = `---
DYNAMIC ASSET COMMANDS (Use these in your responses!)
---
**These commands are for *your* actions, emotions, and expressions as the character.** They are directly linked to your character's media assets. Use them in your responses to trigger visuals (avatars) and sounds (sfx).

**How to use:**
- For **Avatars**: Just type the tag name in brackets. Example: [happy]
- For **Sound Effects**: Use 'sfx:' followed by the tag name in brackets. Example: [sfx:door_opens]

Your available asset tags are listed below:
`; // Note: Trailing newline is important for formatting

                const formattedTags = await assetManagerService.getFormattedTagsForCharacterPrompt(currentPersonalityId);
                
                // Concatenate the instruction header with the formatted tags
                tagPromptTextarea.value = aiInstructionHeader + formattedTags;
            });
        }
        // --- END NEW ---

	
        isInitialized = true;
        console.log("Add Personality Form Component Initialized.");
    }

    // Set the current personality ID whenever the form is (re)initialized/opened
    currentPersonalityId = personalityId;
    
    // Pass the current personality ID to the Asset Manager component for context
    initializeAssetManagerComponent(currentPersonalityId);
    
    // If it's a new personality form, make sure the ID field is clear
    const idInput = document.querySelector("#form-add-personality input[name='id']");
    if (idInput) {
        idInput.value = personalityId !== null ? personalityId.toString() : '';
    }
}