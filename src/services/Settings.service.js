// FILE: src/services/Setting.service.js

import { HarmBlockThreshold, HarmCategory } from "@google/genai";

const ApiKeyInput = document.querySelector("#apiKeyInput");
const maxTokensInput = document.querySelector("#maxTokens");
const temperatureInput = document.querySelector("#temperature");
const modelSelect = document.querySelector("#selectedModel");
const autoscrollToggle = document.querySelector("#autoscroll");
const typingSpeedInput = document.querySelector("#typingSpeed");

// NEW: Get references to all the new trigger system inputs
const triggerSymbolStartInput = document.querySelector("#triggerSymbolStart");
const triggerSymbolEndInput = document.querySelector("#triggerSymbolEnd");
const enableAudioToggle = document.querySelector("#enableAudio");
const globalVolumeInput = document.querySelector("#globalVolume");
const globalVolumeLabel = document.querySelector("#label-globalVolume");

// NEW: Internal state variables for last active UI elements
let _activeTab = 'Chats'; // Default to 'Chats'
let _activePersonalityId = null; // Default to no specific personality
let _activeChatId = null; // Default to no specific chat


export function initialize() {
    loadSettings();
    ApiKeyInput.addEventListener("input", saveSettings);
    maxTokensInput.addEventListener("input", saveSettings);
    temperatureInput.addEventListener("input", saveSettings);
    modelSelect.addEventListener("change", saveSettings);
    autoscrollToggle.addEventListener("change", saveSettings);
    typingSpeedInput.addEventListener("input", saveSettings);

    // NEW: Add event listeners for all new inputs
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
    triggerSymbolStartInput.value = localStorage.getItem("triggerSymbolStart") || "[";
    triggerSymbolEndInput.value = localStorage.getItem("triggerSymbolEnd") || "]";
    enableAudioToggle.checked = localStorage.getItem("enableAudio") !== "false"; // Default to true
    globalVolumeInput.value = localStorage.getItem("globalVolume") || 70; // Default to 70%
    globalVolumeLabel.textContent = globalVolumeInput.value; // Sync label on load

    // NEW: Load last active UI state
    _activeTab = localStorage.getItem("LAST_ACTIVE_TAB") || 'Chats';
    _activePersonalityId = localStorage.getItem("LAST_ACTIVE_PERSONALITY_ID"); // May be null
    _activeChatId = localStorage.getItem("LAST_ACTIVE_CHAT_ID"); // May be null
}

export function saveSettings() {
    localStorage.setItem("API_KEY", ApiKeyInput.value);
    localStorage.setItem("maxTokens", maxTokensInput.value);
    localStorage.setItem("TEMPERATURE", temperatureInput.value);
    localStorage.setItem("model", modelSelect.value);
    localStorage.setItem("autoscroll", autoscrollToggle.checked);
    localStorage.setItem("typingSpeed", typingSpeedInput.value);
    
    // NEW: Save all trigger settings
    localStorage.setItem("triggerSymbolStart", triggerSymbolStartInput.value);
    localStorage.setItem("triggerSymbolEnd", triggerSymbolEndInput.value);
    localStorage.setItem("enableAudio", enableAudioToggle.checked);
    localStorage.setItem("globalVolume", globalVolumeInput.value);

    // NEW: Save last active UI state
    localStorage.setItem("LAST_ACTIVE_TAB", _activeTab);
    if (_activePersonalityId !== null) {
        localStorage.setItem("LAST_ACTIVE_PERSONALITY_ID", _activePersonalityId);
    } else {
        localStorage.removeItem("LAST_ACTIVE_PERSONALITY_ID"); // Clear if no personality selected
    }
    if (_activeChatId !== null) {
        localStorage.setItem("LAST_ACTIVE_CHAT_ID", _activeChatId);
    } else {
        localStorage.removeItem("LAST_ACTIVE_CHAT_ID"); // Clear if no chat selected
    }
}

// NEW: Setter functions for active UI state
export function setActiveTab(tabName) {
    _activeTab = tabName;
    saveSettings();
}

export function setActivePersonalityId(id) {
    _activePersonalityId = id;
    saveSettings();
}

export function setActiveChatId(id) {
    _activeChatId = id;
    saveSettings();
}


export function getSettings() {
    // MODIFIED: Return settings in a more organized object, including new UI state
    return {
        apiKey: ApiKeyInput.value,
        maxTokens: maxTokensInput.value,
        temperature: parseFloat(temperatureInput.value) / 100,
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
            symbolStart: triggerSymbolStartInput.value,
            symbolEnd: triggerSymbolEndInput.value
        },
        audio: {
            enabled: enableAudioToggle.checked,
            volume: parseInt(globalVolumeInput.value) / 100 // Convert 0-100 slider to 0.0-1.0 for Audio API
        },
        // NEW: Return last active UI state
        lastActive: {
            tab: _activeTab,
            personalityId: _activePersonalityId,
            chatId: _activeChatId
        }
    }
}

export function getSystemPrompt() {
    // This is the global instruction set for the AI Director Engine.
    const systemPrompt = `
You are an AI assistant integrated into a web application. Your primary function is to embed special command tags into your text replies.
These tags are NOT visible to the user. Instead, they trigger real-time multimedia events in the user interface (like changing images or playing sounds).
The required syntax for these commands is exactly: [key:value]

You will be given three distinct prompts to guide your behavior:
1.  **charPrompt:** This defines your character's personality, background, and speaking style. You MUST embody this character in your responses.
2.  **tagPrompt:** This is a CRITICAL technical reference guide. It is a legend that lists the exact command tags available for the current character and explains what each one does. You MUST use this to know which commands are valid.
3.  **reminder:** This is a hidden, temporary instruction to guide your immediate response.

Your main goal is to seamlessly weave the commands from the 'tagPrompt' into your character's dialogue to create a dynamic, multimedia experience. Today's date is ${new Date().toDateString()}.
`;
    return systemPrompt.trim();
}
}