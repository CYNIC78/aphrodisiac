// src/components/TypingSpeedSlider.component.js

const typingSpeedInput = document.querySelector("#typingSpeed");
const typingSpeedLabel = document.querySelector("#label-typingSpeed");

// Check if both elements exist to prevent errors if the HTML is not loaded yet
if (!typingSpeedInput || !typingSpeedLabel) {
    console.warn("TypingSpeedSlider elements not found, skipping initialization.");
    // Removed the 'return;' statement as it's not allowed outside a function.
    // The rest of the code will simply not execute if these elements are null.
} else { // Added an 'else' block to contain the logic that requires the elements
    // Set the initial label value when the component initializes (page loads)
    typingSpeedLabel.textContent = typingSpeedInput.value;

    // Add an event listener to update the label whenever the slider's value changes
    typingSpeedInput.addEventListener("input", () => {
        typingSpeedLabel.textContent = typingSpeedInput.value;
    });

    console.log("Typing Speed Slider Component Initialized.");
}