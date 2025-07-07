// No import { GoogleGenAI } from "@google/genai"; here - it's global from CDN!

const apiKeyInput = document.querySelector("#apiKeyInput");
const errorDisplay = document.querySelector(".api-key-error");

let debounceTimer;

apiKeyInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    apiKeyInput.classList.remove("api-key-valid", "api-key-invalid");
    errorDisplay.style.display = "none";

    debounceTimer = setTimeout(async () => {
        const apiKey = apiKeyInput.value.trim();
        if (!apiKey) { return; }

        try {
            // GoogleGenAI is available globally from the CDN script in index.html
            const ai = new GoogleGenAI({ apiKey: apiKey });
            // Using ai.models.generateContent directly, as per original blueprint
            await ai.models.generateContent({
                model: "gemini-2.0-flash", // Original test model
                contents: "test"
            });
            apiKeyInput.classList.add("api-key-valid");
            apiKeyInput.classList.remove("api-key-invalid");
            errorDisplay.style.display = "none";
        } catch (error) {
            console.error("API Key validation error:", error);
            apiKeyInput.classList.add("api-key-invalid");
            apiKeyInput.classList.remove("api-key-valid");
            errorDisplay.style.display = "flex";
        }
    }, 2000); // Reverted to original 2s delay
});