// src/components/TypingSpeedSlider.component.js

export function initializeTypingSpeedSliderComponent() {
    const typingSpeedInput = document.querySelector("#typingSpeed");
    const typingSpeedLabel = document.querySelector("#label-typingSpeed");

    // Check if both elements exist to prevent errors if the HTML is not loaded yet
    if (!typingSpeedInput || !typingSpeedLabel) {
        console.warn("TypingSpeedSlider elements not found, skipping initialization.");
        return;
    }

    // Set the initial label value when the component initializes (page loads)
    typingSpeedLabel.textContent = typingSpeedInput.value;

    // Add an event listener to update the label whenever the slider's value changes
    typingSpeedInput.addEventListener("input", () => {
        typingSpeedLabel.textContent = typingSpeedInput.value;
    });

    console.log("Typing Speed Slider Component Initialized.");
}