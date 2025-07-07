import { Personality } from "../models/Personality";
import * as personalityService from '../services/Personality.service';
import * as stepperService from '../services/Stepper.service';
import * as overlayService from '../services/Overlay.service';
import { initializeAssetManagerComponent } from './AssetManager.component.js'; // <-- ADDED: Need to import it here too

let isInitialized = false;
let currentPersonalityId = null; // <-- ADDED: To store the ID for the form context

export function initializeAddPersonalityForm(personalityId = null) { // <-- MODIFIED: Accepts personalityId
    // Only initialize event listeners once
    if (!isInitialized) {
        const form = document.querySelector("#form-add-personality");
        const btn = document.querySelector('#btn-add-tone-example');

        if (!form || !btn) {
            console.error("AddPersonalityForm elements not found, cannot initialize.");
            return;
        }

        form.submit = async (e) => { // <-- MODIFIED: Made async
            e.preventDefault(); // Prevent default form submission
            //turn all the form data into a personality object
            const personality = new Personality();
            const data = new FormData(form);
            
            // Collect form data into personality object
            for (const [key, value] of data.entries()) {
                if (key.includes("tone-example")) { // Tone examples are dynamically named, check for prefix
                    if (value) {
                        personality.toneExamples.push(value);
                    }
                    continue;
                }
                if (key === 'id') { // 'id' will be handled separately for add/edit
                    continue;
                }
                // Handle checkboxes (FormData for unchecked checkbox doesn't include the key)
                if (key === 'internetEnabled' || key === 'roleplayEnabled') {
                    personality[key] = data.has(key); // Set true if present, false if not
                } else {
                    personality[key] = value;
                }
            }

            // Handle both edit and add cases
            const idFromForm = data.get('id'); // Get ID from hidden input if present
            let finalPersonalityId = null;

            if (idFromForm) { // This is an edit
                finalPersonalityId = parseInt(idFromForm);
                await personalityService.edit(finalPersonalityId, personality);
                console.log(`Edited personality with ID: ${finalPersonalityId}`);
            } else { // This is a new personality being added
                finalPersonalityId = await personalityService.add(personality); // ID is returned on add
                console.log(`Added new personality with ID: ${finalPersonalityId}`);
            }
            // After adding/editing, update currentPersonalityId to ensure context is maintained if needed later
            currentPersonalityId = finalPersonalityId;
            
            overlayService.closeOverlay();
            // After closing, the UI will re-render personalities, which will trigger avatar loads.
        }

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
        isInitialized = true;
        console.log("Add Personality Form Component Initialized.");
    }

    // Set the current personality ID whenever the form is (re)initialized/opened
    currentPersonalityId = personalityId;
    
    // Pass the current personality ID to the Asset Manager component for context
    initializeAssetManagerComponent(currentPersonalityId); // <-- ADDED / MODIFIED
    
    // If it's a new personality form, make sure the ID field is clear
    const idInput = document.querySelector("#form-add-personality input[name='id']");
    if (idInput) {
        idInput.value = personalityId !== null ? personalityId.toString() : '';
    }
}