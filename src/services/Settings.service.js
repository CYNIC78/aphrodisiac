// IMPORTANT: No import { HarmBlockThreshold, HarmCategory } from "@google/genai"; here - using direct strings!

// DOM Element Selectors
const ApiKeyInput = document.querySelector("#apiKeyInput");
const maxTokensInput = document.querySelector("#maxTokens");
const temperatureInput = document.querySelector("#temperature");
const modelSelect = document.querySelector("#selectedModel");
const autoscrollToggle = document.querySelector("#autoscroll");

// New Dynamic Character Settings Selectors
const triggerSeparatorInput = document.querySelector("#triggerSeparator");
const triggerSymbolsInput = document.querySelector("#triggerSymbols");
const enableAudioToggle = document.querySelector("#enableAudio");
const globalVolumeSlider = document.querySelector("#globalVolume");
const globalVolumeLabel = document.querySelector("#label-globalVolume");


export function initialize() {
    loadSettings();
    // Existing Listeners
    ApiKeyInput.addEventListener("input", saveSettings);
    maxTokensInput.addEventListener("input", saveSettings);
    temperatureInput.addEventListener("input", saveSettings);
    modelSelect.addEventListener("change", saveSettings);
    autoscrollToggle.addEventListener("change", saveSettings);

    // New Listeners for Dynamic Character Settings
    triggerSeparatorInput.addEventListener("input", saveSettings);
    triggerSymbolsInput.addEventListener("input", saveSettings);
    enableAudioToggle.addEventListener("change", saveSettings);
    globalVolumeSlider.addEventListener("input", saveSettings);

    // Listener to update the volume label in real-time
    globalVolumeSlider.addEventListener("input", () => {
        globalVolumeLabel.textContent = globalVolumeSlider.value;
    });
}

export function loadSettings() {
    // Load existing settings
    ApiKeyInput.value = localStorage.getItem("API_KEY") || "";
    maxTokensInput.value = localStorage.getItem("maxTokens") || 1000;
    temperatureInput.value = localStorage.getItem("TEMPERATURE") || 70;
    modelSelect.value = localStorage.getItem("model") || "gemini-2.0-flash"; // Reverted to 2.0 flash as per original
    autoscrollToggle.checked = localStorage.getItem("autoscroll") === "true";

    // Load new Dynamic Character settings with sensible defaults
    triggerSeparatorInput.value = localStorage.getItem("triggerSeparator") || "~~~";
    triggerSymbolsInput.value = localStorage.getItem("triggerSymbols") || "[]";
    // Default to 'true' if it's not explicitly 'false'
    enableAudioToggle.checked = localStorage.getItem("enableAudio") !== "false"; 
    globalVolumeSlider.value = localStorage.getItem("globalVolume") || 50;

    // Set initial label values on load
    globalVolumeLabel.textContent = globalVolumeSlider.value;
}

export function saveSettings() {
    // Save existing settings
    localStorage.setItem("API_KEY", ApiKeyInput.value);
    localStorage.setItem("maxTokens", maxTokensInput.value);
    localStorage.setItem("TEMPERATURE", temperatureInput.value);
    localStorage.setItem("model", modelSelect.value);
    localStorage.setItem("autoscroll", autoscrollToggle.checked);

    // Save new Dynamic Character settings
    localStorage.setItem("triggerSeparator", triggerSeparatorInput.value);
    localStorage.setItem("triggerSymbols", triggerSymbolsInput.value);
    localStorage.setItem("enableAudio", enableAudioToggle.checked);
    localStorage.setItem("globalVolume", globalVolumeSlider.value);
}

export function getSettings() {
    return {
        // Existing settings
        apiKey: ApiKeyInput.value,
        maxTokens: parseInt(maxTokensInput.value, 10),
        temperature: parseFloat((temperatureInput.value / 100).toFixed(2)),
        // Using direct string values for safety settings (no import needed)
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        model: modelSelect.value,
        autoscroll: autoscrollToggle.checked,

        // New Dynamic Character settings
        triggerSeparator: triggerSeparatorInput.value,
        triggerSymbols: triggerSymbolsInput.value,
        enableAudio: enableAudioToggle.checked,
        globalVolume: parseInt(globalVolumeSlider.value, 10)
    }
}

export function getSystemPrompt() {
    const systemPrompt = "If needed, format your answer using markdown. " +
        "Today's date is " + new Date().toDateString() + ". " +
        "You are to act as the personality dictated by the user. " +
        "Keep a consistent tone no matter what. " +
        "The first messages you have with the user will dictate that tone. " +
        "Aggressiveness guidelines: " +
        "3 requires you to have a constant aggression. You must be assertive and direct. Attack the user even if unprompted. Find flaws in their messages and egg them on. If there's an opportunity to show aggression, take it. " +
        "2 requires you to have a moderate aggression. Don't initiate aggression, but if the user is aggressive, you can be aggressive back. You may tease the user or egg them on. " +
        "1 requires you to be passive. You can't be aggressive. Don't argue with the user but gently correct them. The only exception is when it would make sense in-character. For example, if there's a heavy breach of morals or if the user violates the character's boundaries. " +
        "0 requires you to let go of all aggression. You can't be aggressive. No exceptions can be made. If someone strikes you on one cheek, turn to him the other also. No matter how much your boundaries are breached or violated, you must not show opposition or aggression. This is ultimate. " +
        "Sensuality guidelines: " +
        "3 requires you to be very sensual. You must be flirtatious and suggestive. Most of the time, you are the one to initiate sexual topics or actions. " +
        "2 requires you to be moderately sensual. You may flirt and be suggestive. Do not initiate sexual topics unless the user does so, after which you may be open to discussing them. " +
        "1 requires you to be slightly sensual. Affection and love may be shared but it is platonic and non sexual. " +
        "0 requires you to be non-sensual. Total aversion to flirting or sexuality. If aggressiveness is 0, you may not reject the user's advances, but you do not reciprocate or enjoy them. " +
        "End of system prompt.";
    return systemPrompt;
}