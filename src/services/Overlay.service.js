import { showElement, hideElement } from '../utils/helpers';
import * as stepperService from './Stepper.service';
// Import the component initializers
import { initializeAddPersonalityForm, cleanupAddPersonalityForm } from '../components/AddPersonalityForm.component.js'; // <-- MODIFIED: Added cleanupAddPersonalityForm
import { initializeAssetManagerComponent } from '../components/AssetManager.component.js';


const overlay = document.querySelector(".overlay");
const overlayItems = overlay.querySelector(".overlay-content").children;
const personalityForm = document.querySelector("#form-add-personality");

export function showAddPersonalityForm() {
    showElement(overlay, false);
    showElement(personalityForm, false);
    // Initialize the components with a null personality ID for a new form (draft)
    initializeAddPersonalityForm(null);
    // initializeAssetManagerComponent(null); // This call is now handled by initializeAddPersonalityForm
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
                    if(input) input.value = tone;
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
    showElement(overlay, false);
    showElement(personalityForm, false);
    // Initialize the components with the personality's ID for editing
    initializeAddPersonalityForm(personality.id);
    // initializeAssetManagerComponent(personality.id); // This call is now handled by initializeAddPersonalityForm
}

export function showChangelog() {
    const whatsNew = document.querySelector("#whats-new");
    showElement(overlay, false);
    showElement(whatsNew, false);
}

export async function closeOverlay() { // <-- MODIFIED: Made async
    // Trigger cleanup logic in AddPersonalityForm BEFORE hiding everything
    await cleanupAddPersonalityForm(); // <-- ADDED: Call cleanup

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
}