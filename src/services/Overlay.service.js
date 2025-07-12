// FILE: src/services/Overlay.service.js

import { showElement, hideElement } from '../utils/helpers';
import * as stepperService from './Stepper.service';
import * as personalityService from './Personality.service.js'; // Import personality service
// Import the component initializers
import { initializeAddPersonalityForm } from '../components/AddPersonalityForm.component.js';
import { initializeAssetManagerComponent } from '../components/AssetManager.component.js';


const overlay = document.querySelector(".overlay");
const overlayItems = overlay.querySelector(".overlay-content").children;
const personalityForm = document.querySelector("#form-add-personality");

let activeDraftId = null; // Variable to track the ID of a draft personality

export async function showAddPersonalityForm() {
    // 1. Create a draft personality in the database first
    const draftId = await personalityService.createDraftPersonality();
    const draftPersonality = await personalityService.get(draftId);

    if (!draftPersonality) {
        console.error("Failed to create and retrieve a draft personality.");
        alert("Could not open the form. Please try again.");
        return;
    }

    // 2. Store the draft ID so we can clean it up if the user cancels
    activeDraftId = draftId;

    // 3. Populate the form with draft data and show it
    // We can use the same logic as showEditPersonalityForm now
    populateForm(draftPersonality); 
    showElement(overlay, false);
    showElement(personalityForm, false);

    // 4. Initialize components with the FULL draft personality OBJECT
    initializeAddPersonalityForm(draftPersonality); 
    initializeAssetManagerComponent(draftPersonality);
}

export function showEditPersonalityForm(personality) {
    // When editing, there is no draft to manage
    activeDraftId = null; 

    populateForm(personality);
    showElement(overlay, false);
    showElement(personalityForm, false);

    // THE FIX: Pass the FULL personality OBJECT, not just the ID
    initializeAddPersonalityForm(personality); 
    initializeAssetManagerComponent(personality); 
}

// Helper function to populate the form to avoid code duplication
function populateForm(personality) {
    for (const key in personality) {
        if (key === 'toneExamples') {
            personalityForm.querySelectorAll('.tone-example').forEach((element, index) => {
                if (index !== 0) element.remove();
            });
            // Clear the first input before populating
            const firstToneInput = personalityForm.querySelector(`input[name="tone-example-1"]`);
            if (firstToneInput) firstToneInput.value = '';

            for (const [index, tone] of personality.toneExamples.entries()) {
                if (index === 0) {
                    if(firstToneInput) firstToneInput.value = tone;
                    continue;
                }
                const input = document.createElement('input');
                input.type = 'text';
                input.name = `tone-example-${index + 1}`;
                input.classList.add('tone-example');
                input.placeholder = 'Tone example';
                input.value = tone;
                const btnAddToneExample = personalityForm.querySelector("#btn-add-tone-example");
                if(btnAddToneExample) btnAddToneExample.before(input);
            }
        } else {
            const input = personalityForm.querySelector(`[name="${key}"]`);
            if (input) {
                if (input.type === 'checkbox') {
                    input.checked = personality[key];
                } else {
                    input.value = personality[key];
                }
            }
        }
    }
     // Manually set the hidden ID field
    const idInput = personalityForm.querySelector('input[name="id"]');
    if (idInput) {
        idInput.value = personality.id;
    }
}


export function showChangelog() {
    const whatsNew = document.querySelector("#whats-new");
    showElement(overlay, false);
    showElement(whatsNew, false);
}

export function closeOverlay() {
    // If we were working on a draft and cancelled, delete it.
    if (activeDraftId !== null) {
        console.log(`Cancelling form, deleting draft personality ID: ${activeDraftId}`);
        personalityService.deleteDraftPersonality(activeDraftId);
    }
    activeDraftId = null; // Always reset the draft ID on close

    hideElement(overlay);

    for (const item of overlayItems) {
        hideElement(item);
        if (item instanceof HTMLFormElement) {
            item.reset();
            item.querySelectorAll('.tone-example').forEach((element, index) => {
                if (index === 0) {
                    element.value = ''; 
                } else {
                    element.remove();
                }
            });
            item.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
                checkbox.checked = false;
            });
            const stepper = stepperService.get(item.firstElementChild.id);
            if (stepper) {
                stepper.step = 0;
                stepperService.update(stepper);
            }
        }
    }
}

/**
 * NEW: A function to be called when the form is successfully submitted.
 * This prevents the draft from being deleted upon closing the overlay.
 */
export function clearActiveDraft() {
    activeDraftId = null;
}