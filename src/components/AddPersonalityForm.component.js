import { Personality } from "../models/Personality";
import * as personalityService from '../services/Personality.service';
import * as stepperService from '../services/Stepper.service';
import * as overlayService from '../services/Overlay.service';
import { initializeAssetManagerComponent } from './AssetManager.component.js';

let isInitialized = false;
let currentPersonalityId = null; // Stores the ID of the personality being added/edited
let isNewPersonalityDraft = false; // Flag to track if this personality was created as a draft in this session

// Expose a cleanup function for OverlayService to call
export async function cleanupAddPersonalityForm() {
    if (isNewPersonalityDraft && currentPersonalityId !== null) {
        console.log(`AddPersonalityForm: Overlay closed without submission. Deleting draft personality ID: ${currentPersonalityId}`);
        await personalityService.deleteDraftPersonality(currentPersonalityId);
    }
    // Reset state variables after cleanup/submission
    currentPersonalityId = null;
    isNewPersonalityDraft = false;
}

export function initializeAddPersonalityForm(personalityId = null) {
    const form = document.querySelector("#form-add-personality");
    const btnAddToneExample = document.querySelector('#btn-add-tone-example');
    const stepper = stepperService.get('stepper-add-personality');

    if (!form || !btnAddToneExample || !stepper) {
        console.error("AddPersonalityForm elements not found, cannot initialize.");
        return;
    }

    // Initialize event listeners only once
    if (!isInitialized) {
        // Form Submission Handler
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // Turn all the form data into a personality object
            const personality = new Personality();
            const data = new FormData(form);
            
            // Collect form data into personality object
            for (const [key, value] of data.entries()) {
                if (key.includes("tone-example")) {
                    if (value) {
                        personality.toneExamples.push(value);
                    }
                    continue;
                }
                // 'id' field is handled separately as currentPersonalityId
                if (key === 'id') {
                    continue;
                }
                // Handle checkboxes
                if (key === 'internetEnabled' || key === 'roleplayEnabled') {
                    personality[key] = data.has(key);
                } else {
                    personality[key] = value;
                }
            }
            
            // Always call edit, whether it's a new draft or an existing personality
            if (currentPersonalityId === null) {
                 console.error("AddPersonalityForm: Attempted to submit form without a valid personality ID.");
                 alert("Error: Personality ID missing during submission. Please report this bug.");
                 return;
            }
            await personalityService.edit(currentPersonalityId, personality);
            console.log(`Personality ID ${currentPersonalityId} submitted (edited).`);

            // Mark as submitted so cleanup doesn't delete it
            isNewPersonalityDraft = false; 
            
            overlayService.closeOverlay();
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

        // Stepper Step Change Listener (CRITICAL for draft ID allocation)
        stepperService.stepperEvents.addEventListener('stepChange', async (event) => {
            if (event.detail.stepperId === 'stepper-add-personality') {
                const currentStepIndex = event.detail.currentStep;
                const mediaLibraryStepIndex = Array.from(stepper.element.querySelectorAll('.step')).findIndex(stepEl => stepEl.id === 'media-library-step');
                
                // If we're on the Media Library step OR beyond it, AND it's a new personality, create a draft ID.
                if (currentStepIndex >= mediaLibraryStepIndex && personalityId === null && currentPersonalityId === null) {
                    console.log("AddPersonalityForm: Navigated to Media Library step for a new personality. Creating draft ID.");
                    currentPersonalityId = await personalityService.createDraftPersonality();
                    isNewPersonalityDraft = true;
                    // Update the hidden ID input in the form
                    const idInput = form.querySelector("input[name='id']");
                    if (idInput) {
                        idInput.value = currentPersonalityId.toString();
                    }
                    // Re-initialize Asset Manager component with the new draft ID
                    initializeAssetManagerComponent(currentPersonalityId);
                } else if (currentPersonalityId !== null) {
                    // If we already have an ID (either existing or draft), just ensure AssetManager is updated
                    initializeAssetManagerComponent(currentPersonalityId);
                } else if (personalityId === null && currentPersonalityId === null) {
                    // If it's a brand new form, and we haven't hit the media library step yet,
                    // keep AssetManager initialized with null (no character selected yet).
                    initializeAssetManagerComponent(null);
                }
            }
        });

        isInitialized = true;
        console.log("Add Personality Form Component Initialized (Workflow Refactored).");
    }

    // Set the current personality ID whenever the form is opened/re-initialized via OverlayService
    currentPersonalityId = personalityId;
    isNewPersonalityDraft = (personalityId === null); // If opened with null ID, it's a potential new draft

    // For existing personalities (personalityId is not null), ensure AssetManager is initialized correctly
    // For new personalities, AssetManager will be initialized with null until a draft ID is created.
    initializeAssetManagerComponent(currentPersonalityId);
    
    // Set the hidden ID input in the form
    const idInput = form.querySelector("input[name='id']");
    if (idInput) {
        idInput.value = personalityId !== null ? personalityId.toString() : '';
    }
}