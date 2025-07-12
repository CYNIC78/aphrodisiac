// FILE: src/components/AddPersonalityForm.component.js

import { Personality } from "../models/Personality";
import * as personalityService from '../services/Personality.service';
import * as overlayService from '../services/Overlay.service';
import { initializeAssetManagerComponent } from './AssetManager.component.js';

let isInitialized = false;
let currentPersonality = null; // Store the full object for context

// UPDATED: Function now accepts the full personality object
export function initializeAddPersonalityForm(personality = null) {
    if (!isInitialized) {
        const form = document.querySelector("#form-add-personality");
        const btn = document.querySelector('#btn-add-tone-example');

        if (!form || !btn) {
            console.error("AddPersonalityForm elements not found, cannot initialize.");
            return;
        }

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const personalityData = new Personality();
            const data = new FormData(form);
            
            for (const [key, value] of data.entries()) {
                if (key.includes("tone-example")) {
                    if (value) personalityData.toneExamples.push(value);
                    continue;
                }
                if (key === 'id') continue;
                if (key === 'actors') continue; // Actors are managed by the AssetManager component, not the form

                if (key === 'internetEnabled' || key === 'roleplayEnabled') {
                    personalityData[key] = data.has(key);
                } else {
                    personalityData[key] = value;
                }
            }
            
            // Get the ID from the form's hidden input
            const idFromForm = data.get('id');
            if (!idFromForm) {
                console.error("Form submission failed: No ID found in form. This should not happen with the draft system.");
                alert("An error occurred. Could not save personality.");
                return;
            }
            
            // Because of the draft system, we are ALWAYS editing.
            const finalPersonalityId = parseInt(idFromForm);
            
            // IMPORTANT: Preserve the existing actors data from the object in memory
            personalityData.actors = currentPersonality.actors;

            await personalityService.edit(finalPersonalityId, personalityData);
            console.log(`Saved personality with ID: ${finalPersonalityId}`);
            
            // Tell the overlay service that the draft was successfully saved and shouldn't be deleted.
            overlayService.clearActiveDraft();
            
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

        isInitialized = true;
        console.log("Add Personality Form Component Initialized.");
    }

    // This runs every time the form is opened
    currentPersonality = personality; 
    
    // Pass the full personality OBJECT to the Asset Manager
    initializeAssetManagerComponent(currentPersonality);
    
    // Ensure the hidden ID input is set correctly
    const idInput = document.querySelector("#form-add-personality input[name='id']");
    if (idInput) {
        idInput.value = personality ? personality.id : '';
    }
}