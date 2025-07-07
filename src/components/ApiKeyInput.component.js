import { GoogleGenAI } from "@google/genai";

const apiKeyInput = document.querySelector("#apiKeyInput");
const errorDisplay = document.querySelector(".api-key-error");

let debounceTimer;

apiKeyInput.addEventListener("input", () => {
    // Clear any existing timer to reset the debounce period
    clearTimeout(debounceTimer);

    // Immediately clear validation styles for better user feedback
    apiKeyInput.classList.remove("api-key-valid", "api-key-invalid");
    errorDisplay.style.display = "none";

    debounceTimer = setTimeout(async () => {
        const apiKey = apiKeyInput.value.trim();

        // If the key is empty, do nothing.
        if (!apiKey) {
            return;
        }

        try {
            // FIX #1: The library requires the API key to be passed inside an object.
            const genAI = new GoogleGenAI({ apiKey: apiKey });
            
            // FIX #2: We must get a specific model instance before making a call.
            // We use the latest flash model for a quick and inexpensive test.
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

            // Test the API key with a simple, harmless query against the model instance.
            await model.generateContent("test");

            // If the call succeeds without error, the key is valid.
            apiKeyInput.classList.add("api-key-valid");
            apiKeyInput.classList.remove("api-key-invalid");
            errorDisplay.style.display = "none";

        } catch (error) {
            // If the call fails for any reason (invalid key, network issue), mark as invalid.
            console.error("API Key validation error:", error);
            apiKeyInput.classList.add("api-key-invalid");
            apiKeyInput.classList.remove("api-key-valid");
            errorDisplay.style.display = "flex";
        }
    }, 1500); // Shortened delay to 1.5s for a better user experience
});