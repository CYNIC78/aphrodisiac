import { showElement, hideElement } from '../utils/helpers';
import * as stepperService from './Stepper.service';
// Import the component initializers
import { initializeAddPersonalityForm, cleanupAddPersonalityForm } from '../components/AddPersonalityForm.component.js';
import { initializeAssetManagerComponent } from '../components/AssetManager.component.js';


const overlay = document.querySelector(".overlay");
const overlayItems = overlay.querySelector(".overlay-content").children;
const personalityForm = document.querySelector("#form-add-personality");

export function showAddPersonalityForm() {
    showElement(overlay, false);
    showElement(personalityForm, false);
    initializeAddPersonalityForm(null);
}

export function showEditPersonalityForm(personality) {
    // Populate the form with the personality data
    for (const key in personality) {
        if (key === 'toneExamples') {
            personalityForm.querySelectorAll('.tone-example').forEach((element, index) => {
                if (index !== 0) element.remove();
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
    initializeAddPersonalityForm(personality.id);
}

export function showChangelog() {
    const whatsNew = document.querySelector("#whats-new");
    showElement(overlay, false);
    showElement(whatsNew, false);
}

export async function closeOverlay() {
    // Trigger cleanup logic in AddPersonalityForm BEFORE hiding everything
    // This is crucial to ensure listeners are removed before DOM manipulation or stepper reset
    await cleanupAddPersonalityForm();

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

// <-- ADDED: Helper to check if the overlay is currently visible
export function isOverlayVisible() {
    return overlay.style.display !== 'none' && overlay.style.opacity !== '0';
}