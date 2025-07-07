import { Personality } from "../models/Personality";
import * as personalityService from '../services/Personality.service';
import * as stepperService from '../services/Stepper.service';
import * as overlayService from '../services/Overlay.service';
import { initializeAssetManagerComponent } from './AssetManager.component.js';

let isInitialized = false;
let currentPersonalityId = null; // Stores the ID of the personality being added/edited
let isNewPersonalityDraft = false; // Flag to track if this personality was created as a draft in this session

let stepChangeListener = null; // Store a reference to the event listener function so it can be removed

// Expose a cleanup function for OverlayService to call
export async function cleanupAddPersonalityForm() {
    // Remove the stepChange listener if it was attached. This prevents TypeErrors during overlay close.
    if (stepChangeListener) {
        stepperService.stepperEvents.removeEventListener('stepChange', stepChangeListener);
        stepChangeListener = null;
    }

    // Only delete draft if it was a new personality AND it was NOT successfully submitted
    if (isNewPersonalityDraft && currentPersonalityId !== null) {
        console.log(`AddPersonalityForm: Overlay closed without submission. Deleting draft personality ID: ${currentPersonalityId}`);
        await personalityService.deleteDraftPersonality(currentPersonalityId);
    }
    // Reset all state variables after cleanup/submission
    currentPersonalityId = null;
    isNewPersonalityDraft = false;
}

export function initializeAddPersonalityForm(personalityId = null) {
    const form = document.querySelector("#form-add-personality");
    const btnAddToneExample = document.querySelector('#btn-add-tone-example');
    const stepper = stepperService.get('stepper-add-personality');
    const mediaLibraryStepElement = form.querySelector('#media-library-step'); // Get this element from the form scope

    if (!form || !btnAddToneExample || !stepper || !mediaLibraryStepElement) {
        console.error("AddPersonalityForm elements not found, cannot initialize.");
        return;
    }

    // Initialize event listeners only once
    if (!isInitialized) {
        // Form Submission Handler
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            try {
                // Ensure currentPersonalityId is set before proceeding with submission logic
                if (currentPersonalityId === null) {
                     console.error("AddPersonalityForm: Attempted to submit form without a valid personality ID. This indicates a bug.");
                     alert("Error: Personality ID missing during submission. Please report this bug.");
                     return;
                }

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
                
                await personalityService.edit(currentPersonalityId, personality); // Always update the personality
                console.log(`Personality ID ${currentPersonalityId} submitted (edited).`);

                isNewPersonalityDraft = false; // Mark as successfully submitted, so cleanup doesn't delete it
                
            } catch (error) {
                console.error("AddPersonalityForm: Error during personality submission:", error);
                alert("Error saving personality: " + error.message);
                // Don't close overlay if there was an error, allow user to correct.
                return; 
            } finally {
                // This finally block ensures cleanupAddPersonalityForm runs correctly if the overlay is closed
                // But the primary closing logic is in overlayService.closeOverlay()
                // We just want to make sure currentPersonalityId and isNewPersonalityDraft are properly reset AFTER the submit handler finishes.
                overlayService.closeOverlay(); // This will trigger cleanupAddPersonalityForm
            }
        });

        // Add Tone Example Button Handler
        btnAddToneExample.addEventListener('click', (e) => {
            e.preventDefault();
            const input = document.createElement('input');
            input.type = 'text';
            input.name = `tone-example-${document.querySelectorAll('.tone-example').length + 1}`;
            input.classList.add('tone-example');
            input.placeholder = 'Tone example';
            btnAddToneExample.before(input);
        });

        // Define the step change listener function ONCE
        stepChangeListener = async (event) => {
            if (event.detail.stepperId === 'stepper-add-personality') {
                // Only proceed if the overlay is actually visible. This prevents errors during close.
                if (!overlayService.isOverlayVisible()) {
                    console.log("AddPersonalityForm: Skipping AssetManagerComponent init because overlay is not visible (likely closing).");
                    return;
                }

                const currentStepIndex = event.detail.currentStep;
                const mediaLibraryStepIndex = Array.from(stepper.element.querySelectorAll('.step')).findIndex(stepEl => stepEl.id === 'media-library-step');
                
                // If we're on the Media Library step OR beyond it, AND it's a new personality, AND we don't have a draft ID yet.
                if (currentStepIndex >= mediaLibraryStepIndex && personalityId === null && currentPersonalityId === null) {
                    console.log("AddPersonalityForm: Navigated to Media Library step for a new personality. Creating draft ID.");
                    currentPersonalityId = await personalityService.createDraftPersonality();
                    isNewPersonalityDraft = true;
                    const idInput = form.querySelector("input[name='id']");
                    if (idInput) {
                        idInput.value = currentPersonalityId.toString();
                    }
                    initializeAssetManagerComponent(currentPersonalityId);
                } else if (currentPersonalityId !== null) {
                    initializeAssetManagerComponent(currentPersonalityId);
                } else if (personalityId === null && currentPersonalityId === null) {
                    // This case is for a brand new form before a draft ID is created (e.g., initial steps)
                    initializeAssetManagerComponent(null);
                }
            }
        };

        // Attach the listener ONCE
        stepperService.stepperEvents.addEventListener('stepChange', stepChangeListener);

        isInitialized = true;
        console.log("Add Personality Form Component Initialized (Workflow Refactored).");
    }

    // Set the current personality ID whenever the form is opened/re-initialized via OverlayService
    // This is the starting point for `currentPersonalityId` for this form session
    currentPersonalityId = personalityId;
    isNewPersonalityDraft = (personalityId === null); // If opened with null ID, it's a potential new draft

    // Always initialize Asset Manager Component with the ID of the personality being edited/created (if any)
    initializeAssetManagerComponent(currentPersonalityId);
    
    // Set the hidden ID input in the form
    const idInput = form.querySelector("input[name='id']");
    if (idInput) {
        idInput.value = personalityId !== null ? personalityId.toString() : '';
    }
}