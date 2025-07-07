// src/components/Stepper.component.js
// Handles client-side logic for stepper UI elements.

import * as stepperService from "../services/Stepper.service";

// This component's purpose is primarily to wire up the actual DOM event listeners
// for the stepper buttons, and to ensure the stepperService is initialized
// and its update method is called correctly.

export function initializeStepperComponent() { // Renamed to a function that can be explicitly called
    // Ensure stepperService is initialized once (though main.js should do this)
    stepperService.init();

    const steppersElements = document.querySelectorAll('.stepper');
    steppersElements.forEach(stepperElement => {
        const form = stepperElement.parentElement;
        const stepperObj = stepperService.get(stepperElement.id); // Get the stepper object managed by the service

        // If the stepper has already been processed or isn't found in the service, skip
        if (!stepperObj) {
            console.warn(`Stepper with ID ${stepperElement.id} not found in StepperService. Skipping event listener setup.`);
            return;
        }

        const next = stepperElement.querySelector("#btn-stepper-next");
        const prev = stepperElement.querySelector("#btn-stepper-previous");
        const submit = stepperElement.querySelector("#btn-stepper-submit");

        if (next) {
            next.addEventListener("click", () => {
                stepperObj.step++;
                stepperService.update(stepperObj);
            });
        }
        if (prev) {
            prev.addEventListener("click", () => {
                stepperObj.step--;
                stepperService.update(stepperObj);
            });
        }
        if (submit) {
            submit.addEventListener("click", (e) => {
                e.preventDefault();
                // Dispatch a native 'submit' event on the form to trigger its addEventListener handler
                form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
            });
        }
    });
    console.log("Stepper Component Initialized.");
}

// Call the initialization function directly, as it's meant to be loaded via import.meta.glob
initializeStepperComponent();