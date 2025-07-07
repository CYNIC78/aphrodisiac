

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
            // ================== REVERTED TO ORIGINAL API KEY TEST ==================
            // Using GoogleGenAI as originally intended, passing API key as an object
            const ai = new GoogleGenAI({ apiKey: apiKey });
            // Testing with a direct models.generateContent call, as in the original blueprint
            await ai.models.generateContent({
                model: "gemini-2.0-flash", // Using the original test model
                contents: "test"
            });
            // =======================================================================

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