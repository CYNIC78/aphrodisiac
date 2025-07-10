// FILE: src/services/Overlay.service.js

import { showElement, hideElement } from '../utils/helpers.js'; // Ensure .js extension
import * as stepperService from './Stepper.service.js';        // Ensure .js extension
import * as personalityService from './Personality.service.js'; // NEW: Import personalityService to fetch personality by ID

// Import the component initializers
import { initializeAddPersonalityForm } from '../components/AddPersonalityForm.component.js';
import { initializeAssetManagerComponent } from '../components/AssetManager.component.js';


const overlay = document.querySelector(".overlay");
const overlayItems = overlay.querySelector(".overlay-content").children;
const personalityForm = document.querySelector("#form-add-personality");

/**
 * Shows the Add Personality Form, typically for creating a brand new personality.
 * This form will be pre-filled with the draft personality details if an ID is provided.
 * @param {string|number|null} [personalityId=null] - The ID of the draft personality to edit, or null for a brand new one.
 */
export function showAddPersonalityForm(personalityId = null) { // <-- MODIFIED: Now accepts personalityId
    showElement(overlay, false);
    showElement(personalityForm, false);
    // Initialize components with the provided personalityId (null for truly new, or the draft ID)
    initializeAddPersonalityForm(personalityId);
    // When showing the Add/Edit form, we pass the personalityId to the AssetManagerComponent
    // It will then handle loading characters/states for this personality.
    initializeAssetManagerComponent(personalityId); 
    console.log(`Overlay: showAddPersonalityForm for ID: ${personalityId || 'new draft'}`);
}

/**
 * Shows the Edit Personality Form, populating it with an existing personality's data.
 * @param {string|number} personalityId - The ID of the personality to edit.
 */
export async function showEditPersonalityForm(personalityId) { // <-- MODIFIED: Now accepts personalityId only
    if (personalityId === null || typeof personalityId === 'undefined') {
        console.error("Overlay.service: showEditPersonalityForm called without a valid personalityId.");
        return;
    }

    const personality = await personalityService.get(personalityId);
    if (!personality) {
        console.error(`Overlay.service: Personality with ID ${personalityId} not found for editing.`);
        return;
    }

    // Populate the form with the personality data
    for (const key in personality) {
        if (key === 'toneExamples') {
            // Clear existing tone example inputs before populating
            personalityForm.querySelectorAll('.tone-example').forEach((element, index) => {
                if (index !== 0) element.remove(); // Remove all except the first one
            });

            for (const [index, tone] of personality.toneExamples.entries()) {
                const inputSelector = `input[name="tone-example-${index + 1}"]`;
                let input = personalityForm.querySelector(inputSelector);
                if (!input && index > 0) { // If it's not the first one and input doesn't exist, create it
                    input = document.createElement('input');
                    input.type = 'text';
                    input.name = `tone-example-${index + 1}`;
                    input.classList.add('tone-example', 'form-control'); // Add form-control class for styling
                    input.placeholder = 'Tone example';
                    const btnAddToneExample = personalityForm.querySelector("#btn-add-tone-example");
                    if(btnAddToneExample) btnAddToneExample.before(input);
                }
                if(input) input.value = tone;
            }
            // Ensure any excess tone examples from a previous, longer personality are cleared
            const existingToneExamplesCount = personalityForm.querySelectorAll('.tone-example').length;
            if (existingToneExamplesCount > personality.toneExamples.length) {
                for (let i = personality.toneExamples.length; i < existingToneExamplesCount; i++) {
                    const inputToRemove = personalityForm.querySelector(`input[name="tone-example-${i + 1}"]`);
                    if (inputToRemove && i > 0) { // Don't remove the first one
                        inputToRemove.remove();
                    } else if (inputToRemove && i === 0) { // Clear the first one if it's excess
                        inputToRemove.value = '';
                    }
                }
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
    showElement(overlay, false);
    showElement(personalityForm, false);
    // Initialize components with the actual personalityId for editing
    initializeAddPersonalityForm(personalityId); 
    initializeAssetManagerComponent(personalityId); 
    console.log(`Overlay: showEditPersonalityForm for ID: ${personalityId}`);
}

export function showChangelog() {
    const whatsNew = document.querySelector("#whats-new");
    showElement(overlay, false);
    showElement(whatsNew, false);
}

export function closeOverlay() {
    hideElement(overlay);

    for (const item of overlayItems) {
        hideElement(item);
        // Reset the form and stepper
        if (item instanceof HTMLFormElement) {
            item.reset();
            // Remove all but the first tone example input and clear its value
            item.querySelectorAll('.tone-example').forEach((element, index) => {
                if (index === 0) {
                    element.value = '';
                } else {
                    element.remove();
                }
            });
            // Reset checkboxes
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
    console.log('Overlay closed and forms reset.');
}