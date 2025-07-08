// src/components/TypingSpeedSlider.component.js

const typingSpeedInput = document.querySelector("#typingSpeed");
const typingSpeedLabel = document.querySelector("#label-typingSpeed");

// Check if both elements exist to prevent errors if the HTML is not loaded yet
if (!typingSpeedInput || !typingSpeedLabel) {
    console.warn("TypingSpeedSlider elements not found, skipping initialization.");
    // We still return here to prevent further execution if elements aren't there,
    // though with the main.js loading at body end, this should be rare.
    return; 
}

// Set the initial label value when the component initializes (page loads)
typingSpeedLabel.textContent = typingSpeedInput.value;

// Add an event listener to update the label whenever the slider's value changes
typingSpeedInput.addEventListener("input", () => {
    typingSpeedLabel.textContent = typingSpeedInput.value;
});

console.log("Typing Speed Slider Component Initialized.");