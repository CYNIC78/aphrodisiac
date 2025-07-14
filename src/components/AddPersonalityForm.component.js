// FILE: src/components/AddPersonalityForm.component.js

import { Personality } from "../models/Personality.js";
import * as personalityService from '../services/Personality.service.js';
import * as stepperService from '../services/Stepper.service.js';
import * as overlayService from '../services/Overlay.service.js';
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

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Your FormData implementation is excellent and already picks up the new fields.
            const personality = new Personality();
            const data = new FormData(form);
            
            for (const [key, value] of data.entries()) {
                if (key.includes("tone-example")) {
                    if (value) {
                        personality.toneExamples.push(value);
                    }
                    continue;
                }
                if (key === 'id') {
                    // We handle the ID separately below.
                    continue;
                }
                // This part handles our new textareas `journal` and `journalPrompt` automatically.
                personality[key] = value;
            }

            const idFromForm = data.get('id');
            let finalPersonalityId = null;

            // --- MODIFIED BLOCK ---
            // This now correctly calls the `update` function in the service.
            if (idFromForm) {
                finalPersonalityId = parseInt(idFromForm, 10);
                personality.id = finalPersonalityId; // Set the ID on the personality object
                await personalityService.update(personality); // Call update with the complete object
                console.log(`Edited personality with ID: ${finalPersonalityId}`);
            } else {
                finalPersonalityId = await personalityService.add(personality);
                console.log(`Added new personality with ID: ${finalPersonalityId}`);
            }
            // --- END MODIFIED BLOCK ---

            currentPersonalityId = finalPersonalityId;
            
            overlayService.default.closeOverlay();
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.createElement('input');
            input.type = 'text';
            input.name = `tone-example-${document.querySelectorAll('.tone-example').length + 1}`;
            input.classList.add('tone-example');
            input.placeholder = 'Tone example';
            btn.before(input);
        });

        const btnPopulateTagPrompt = document.querySelector('#btn-populate-tagprompt');
        const tagPromptTextarea = document.querySelector('#tagPrompt');
        if (btnPopulateTagPrompt && tagPromptTextarea) {
            btnPopulateTagPrompt.addEventListener('click', async () => {
                if (currentPersonalityId === null) {
                    alert("Please save the personality first (by clicking 'Submit' on the last step) to enable tag population. Once saved, you can edit it to populate the tags.");
                    return;
                }
                const fullPromptText = await assetManagerService.getFormattedTagsForCharacterPrompt(currentPersonalityId);
                tagPromptTextarea.value = fullPromptText;
                alert('Tag Prompt populated successfully!');
            });
        }

        isInitialized = true;
        console.log("Add Personality Form Component Initialized.");
    }

    currentPersonalityId = personalityId;
    initializeAssetManagerComponent(currentPersonalityId);
    
    const idInput = document.querySelector("#form-add-personality input[name='id']");
    if (idInput) {
        idInput.value = personalityId !== null ? personalityId.toString() : '';
    }
}