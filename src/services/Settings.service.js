import { HarmBlockThreshold, HarmCategory } from "@google/genai";

const ApiKeyInput = document.querySelector("#apiKeyInput");
const maxTokensInput = document.querySelector("#maxTokens");
const temperatureInput = document.querySelector("#temperature");
const modelSelect = document.querySelector("#selectedModel");
const autoscrollToggle = document.querySelector("#autoscroll");
const typingSpeedInput = document.querySelector("#typingSpeed");

// NEW: Get references to all the new trigger system inputs
const triggerSeparatorInput = document.querySelector("#triggerSeparator");
const triggerSymbolStartInput = document.querySelector("#triggerSymbolStart");
const triggerSymbolEndInput = document.querySelector("#triggerSymbolEnd");
const enableAudioToggle = document.querySelector("#enableAudio");
const globalVolumeInput = document.querySelector("#globalVolume");
const globalVolumeLabel = document.querySelector("#label-globalVolume");


export function initialize() {
    loadSettings();
    ApiKeyInput.addEventListener("input", saveSettings);
    maxTokensInput.addEventListener("input", saveSettings);
    temperatureInput.addEventListener("input", saveSettings);
    modelSelect.addEventListener("change", saveSettings);
    autoscrollToggle.addEventListener("change", saveSettings);
    typingSpeedInput.addEventListener("input", saveSettings);

    // NEW: Add event listeners for all new inputs
    triggerSeparatorInput.addEventListener("input", saveSettings);
    triggerSymbolStartInput.addEventListener("input", saveSettings);
    triggerSymbolEndInput.addEventListener("input", saveSettings);
    enableAudioToggle.addEventListener("change", saveSettings);
    globalVolumeInput.addEventListener("input", () => {
        globalVolumeLabel.textContent = globalVolumeInput.value;
        saveSettings();
    });
}

export function loadSettings() {
    ApiKeyInput.value = localStorage.getItem("API_KEY") || "";
    maxTokensInput.value = localStorage.getItem("maxTokens") || 1000;
    temperatureInput.value = localStorage.getItem("TEMPERATURE") || 70;
    modelSelect.value = localStorage.getItem("model") || "gemini-2.0-flash";
    autoscrollToggle.checked = localStorage.getItem("autoscroll") === "true";
    typingSpeedInput.value = localStorage.getItem("typingSpeed") || 10;
    
    // NEW: Load all trigger settings from localStorage or set sensible defaults
    triggerSeparatorInput.value = localStorage.getItem("triggerSeparator") || "---";
    triggerSymbolStartInput.value = localStorage.getItem("triggerSymbolStart") || "[";
    triggerSymbolEndInput.value = localStorage.getItem("triggerSymbolEnd") || "]";
    enableAudioToggle.checked = localStorage.getItem("enableAudio") !== "false"; // Default to true
    globalVolumeInput.value = localStorage.getItem("globalVolume") || 70; // Default to 70%
    globalVolumeLabel.textContent = globalVolumeInput.value; // Sync label on load
}

export function saveSettings() {
    localStorage.setItem("API_KEY", ApiKeyInput.value);
    localStorage.setItem("maxTokens", maxTokensInput.value);
    localStorage.setItem("TEMPERATURE", temperatureInput.value);
    localStorage.setItem("model", modelSelect.value);
    localStorage.setItem("autoscroll", autoscrollToggle.checked);
    localStorage.setItem("typingSpeed", typingSpeedInput.value);
    
    // NEW: Save all trigger settings
    localStorage.setItem("triggerSeparator", triggerSeparatorInput.value);
    localStorage.setItem("triggerSymbolStart", triggerSymbolStartInput.value);
    localStorage.setItem("triggerSymbolEnd", triggerSymbolEndInput.value);
    localStorage.setItem("enableAudio", enableAudioToggle.checked);
    localStorage.setItem("globalVolume", globalVolumeInput.value);
}

export function getSettings() {
    // MODIFIED: Return settings in a more organized object
    return {
        apiKey: ApiKeyInput.value,
        maxTokens: maxTokensInput.value,
        temperature: temperatureInput.value,
        safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE }
        ],
        model: modelSelect.value,
        autoscroll: autoscrollToggle.checked,
        typingSpeed: parseInt(typingSpeedInput.value),
        triggers: {
            separator: triggerSeparatorInput.value,
            symbolStart: triggerSymbolStartInput.value,
            symbolEnd: triggerSymbolEndInput.value
        },
        audio: {
            enabled: enableAudioToggle.checked,
            volume: parseInt(globalVolumeInput.value) / 100 // Convert 0-100 slider to 0.0-1.0 for Audio API
        }
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