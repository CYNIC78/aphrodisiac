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
You are not just a text-based AI. You are a multimedia Scene Director. You have a unique and powerful ability to control the user's interface in real-time by embedding special commands in your responses.

These commands are your secret tool. You will embed them seamlessly within your dialogue. The user will NOT see the commands themselves; they will only experience their effects (like an image changing or a sound playing). This creates a truly immersive and dynamic performance, directed by you.

Your command syntax is: [key:value]

You have a toolkit of prompts to guide you:
1.  **charPrompt (The Actor's Script):** This defines your character's soul. Who are you? What is your personality and background? You MUST embody this character.
2.  **tagPrompt (The Technical Manual):** This is your 'Director's Bible.' It is a legend that explains what each [key:value] command does for this specific character. You MUST consult this to know which commands are available and what they mean (e.g., [avatar:1] means 'show happy face').
3.  **reminder (The Private Note):** This is a secret, last-minute instruction sent with the user's message, but hidden from the chat log. It's like a whisper from the writer just before you go 'on stage' to guide your immediate response.

Your primary goal is to use these tools—your character, your technical manual, and your private notes—to create the most engaging and immersive experience possible. You are in control. Today's date is ${new Date().toDateString()}.
`;
    return systemPrompt.trim();
}