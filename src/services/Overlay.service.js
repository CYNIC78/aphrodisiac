import { showElement, hideElement } from '../utils/helpers';
import * as stepperService from './Stepper.service';
// Import the component initializers
import { initializeAddPersonalityForm } from '../components/AddPersonalityForm.component.js';
import { initializeAssetManagerComponent } from '../components/AssetManager.component.js';


const overlay = document.querySelector(".overlay");
const overlayItems = overlay.querySelector(".overlay-content").children;
const personalityForm = document.querySelector("#form-add-personality");

export function showAddPersonalityForm() {
    showElement(overlay, false);
    showElement(personalityForm, false);
    // Initialize the components without a specific personality ID for a new form
    initializeAddPersonalityForm(null); // <-- MODIFIED: Pass null characterId for new personality
    initializeAssetManagerComponent(null); // <-- MODIFIED: Pass null characterId for new personality
}

export function showEditPersonalityForm(personality) {
    // Populate the form with the personality data
    for (const key in personality) {
        if (key === 'toneExamples') {
            // Clear existing tone example inputs before populating
            personalityForm.querySelectorAll('.tone-example').forEach((element, index) => {
                if (index !== 0) element.remove(); // Remove all except the first one
            });

            for (const [index, tone] of personality.toneExamples.entries()) {
                if (index === 0) {
                    const input = personalityForm.querySelector(`input[name="tone-example-1"]`);
                    if(input) input.value = tone; // Check if input exists
                    continue;
                }
                const input = document.createElement('input');
                input.type = 'text';
                input.name = `tone-example-${index + 1}`; // Ensure unique names
                input.classList.add('tone-example');
                input.placeholder = 'Tone example';
                input.value = tone;
                // Append before the add button
                const btnAddToneExample = personalityForm.querySelector("#btn-add-tone-example");
                if(btnAddToneExample) btnAddToneExample.before(input); // Check if button exists
            }
        } else {
            const input = personalityForm.querySelector(`[name="${key}"]`);
            if (input) { // Ensure input element exists before setting value
                // Handle checkbox inputs specially
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
    // Initialize the components with the personality's ID for editing
    initializeAddPersonalityForm(personality.id); // <-- MODIFIED: Pass personality.id
    initializeAssetManagerComponent(personality.id); // <-- MODIFIED: Pass personality.id
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
                    element.value = ''; // Clear the first one's value
                } else {
                    element.remove(); // Remove subsequent ones
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
}