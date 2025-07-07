// src/services/Stepper.service.js
// A state management service for all multi-step UI components.

// Create a global EventTarget instance for stepper-related events
export const stepperEvents = new EventTarget(); // <-- ADDED: EventTarget for custom events

let steppers = []; // Holds all stepper components found in the DOM

/**
 * Initializes the Stepper service by finding all stepper elements in the DOM.
 */
export function init() {
    steppers = Array.from(document.querySelectorAll('.stepper')).map(element => ({
        id: element.id,
        element: element,
        step: 0, // Current step index
        totalSteps: element.querySelectorAll('.step').length
    }));
    // Initial update for all steppers
    steppers.forEach(s => update(s));
    console.log('Stepper Service Initialized.');
}

/**
 * Retrieves a specific stepper by its ID.
 * @param {string} id - The ID of the stepper element.
 * @returns {object|undefined} The stepper object.
 */
export function get(id) {
    return steppers.find(s => s.id === id);
}

/**
 * Retrieves all registered steppers.
 * @returns {Array<object>} An array of all stepper objects.
 */
export function getAll() {
    return steppers;
}

/**
 * Updates the visual state of a stepper based on its current step.
 * @param {object} stepper - The stepper object to update.
 */
export function update(stepper) {
    const { element, step, totalSteps } = stepper;

    // Boundary checks
    stepper.step = Math.max(0, Math.min(step, totalSteps - 1));

    // Update active class for steps
    Array.from(element.querySelectorAll('.step')).forEach((s, index) => {
        if (index === stepper.step) {
            s.classList.add('active');
        } else {
            s.classList.remove('active');
        }
    });

    // Update button visibility (Previous/Next/Submit)
    const prevButton = element.querySelector('#btn-stepper-previous');
    const nextButton = element.querySelector('#btn-stepper-next');
    const submitButton = element.querySelector('#btn-stepper-submit');

    if (prevButton) {
        if (stepper.step === 0) {
            prevButton.style.display = 'none';
        } else {
            prevButton.style.display = 'inline-block';
        }
    }

    if (nextButton) {
        if (stepper.step === totalSteps - 1) {
            nextButton.style.display = 'none';
        } else {
            nextButton.style.display = 'inline-block';
        }
    }

    if (submitButton) {
        if (stepper.step === totalSteps - 1) {
            submitButton.style.display = 'inline-block';
        } else {
            submitButton.style.display = 'none';
        }
    }

    // Dispatch a custom event when the step changes
    stepperEvents.dispatchEvent(new CustomEvent('stepChange', { // <-- ADDED: Dispatch custom event
        detail: {
            stepperId: stepper.id,
            currentStep: stepper.step,
            totalSteps: stepper.totalSteps
        }
    }));
    console.log(`Stepper ${stepper.id} updated to step: ${stepper.step}`);
}

// Initializing event listeners for actual stepper buttons
// This code needs to run once DOM is loaded, ideally from main.js or a component initializer.
// For now, it's placed here, but in main.js's component glob.
/*
const steppersElements = document.querySelectorAll('.stepper');
steppersElements.forEach(stepperElement => {
    const form = stepperElement.parentElement;
    const stepperObj = get(stepperElement.id); // Get the stepper object managed by the service

    const next = stepperElement.querySelector("#btn-stepper-next");
    const prev = stepperElement.querySelector("#btn-stepper-previous");
    const submit = stepperElement.querySelector("#btn-stepper-submit");

    if (next) {
        next.addEventListener("click", () => {
            if (stepperObj) {
                stepperObj.step++;
                update(stepperObj);
            }
        });
    }
    if (prev) {
        prev.addEventListener("click", () => {
            if (stepperObj) {
                stepperObj.step--;
                update(stepperObj);
            }
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
*/