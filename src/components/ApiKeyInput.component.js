// Re-added the import statement. Vite will now handle this correctly with rollupOptions.external
import { GoogleGenAI } from "@google/genai";

const apiKeyInput = document.querySelector("#apiKeyInput");
const errorDisplay = document.querySelector(".api-key-error");

let debounceTimer;

apiKeyInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    apiKeyInput.classList.remove("api-key-valid", "api-key-invalid");
    errorDisplay.style.display = "none";

    debounceTimer = setTimeout(async () => {
        const apiKey = apiKeyInput.value.trim();

        if (!apiKey) {
            return;
        }

        try {
            const ai = new GoogleGenAI({ apiKey: apiKey });
            
            await ai.models.generateContent({
                model: "gemini-2.0-flash", // Using a stable model for testing
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