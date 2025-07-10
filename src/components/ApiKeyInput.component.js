// FILE: src/components/ApiKeyInput.component.js

import { GoogleGenAI } from "@google/genai";

const apiKeyInput = document.querySelector("#apiKeyInput");

let debounceTimer;
apiKeyInput.addEventListener("input", () => {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) {
            apiKeyInput.classList.remove("api-key-valid", "api-key-invalid");
            document.querySelector(".api-key-error").style.display = "none";
            return;
        }

        // CORRECTED INITIALIZATION: Pass the API key directly as a string.
        const genAI = new GoogleGenAI(apiKey);
        
        try {
            // Use the modern getGenerativeModel method for the test call.
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            await model.generateContent("test");

            apiKeyInput.classList.add("api-key-valid");
            apiKeyInput.classList.remove("api-key-invalid");
            document.querySelector(".api-key-error").style.display = "none";
        } catch (error) {
            apiKeyInput.classList.add("api-key-invalid");
            apiKeyInput.classList.remove("api-key-valid");
            document.querySelector(".api-key-error").style.display = "flex";
            console.error("API Key validation error:", error);
        }
    }, 1500);
});