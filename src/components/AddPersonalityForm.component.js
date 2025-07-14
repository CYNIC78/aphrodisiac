// FILE: src/components/AddPersonalityForm.component.js

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

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

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
                    continue;
                }
                if (key === 'internetEnabled' || key === 'roleplayEnabled') {
                    personality[key] = data.has(key);
                } else {
                    personality[key] = value;
                }
            }

            const idFromForm = data.get('id');
            let finalPersonalityId = null;

            if (idFromForm) {
                finalPersonalityId = parseInt(idFromForm);
                await personalityService.edit(finalPersonalityId, personality);
                console.log(`Edited personality with ID: ${finalPersonalityId}`);
            } else {
                finalPersonalityId = await personalityService.add(personality);
                console.log(`Added new personality with ID: ${finalPersonalityId}`);
            }
            currentPersonalityId = finalPersonalityId;
            
            overlayService.closeOverlay();
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

        // --- UPGRADED: Populate Tag Prompt button listener ---
        const btnPopulateTagPrompt = document.querySelector('#btn-populate-tagprompt');
        const tagPromptTextarea = document.querySelector('#tagPrompt');
        if (btnPopulateTagPrompt && tagPromptTextarea) {
            btnPopulateTagPrompt.addEventListener('click', async () => {
                if (currentPersonalityId === null) {
                    alert("Please save the personality first (by clicking 'Submit' on the last step) to enable tag population. Once saved, you can edit it to populate the tags.");
                    return;
                }

                // The service now generates the entire beautiful prompt for us.
                // Our only job is to get it and set it.
                const fullPromptText = await assetManagerService.getFormattedTagsForCharacterPrompt(currentPersonalityId);
                
                tagPromptTextarea.value = fullPromptText;
                alert('Tag Prompt populated successfully!');
            });
        }
        // --- END UPGRADED ---

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