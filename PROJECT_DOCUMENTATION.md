# Aphrodisiac Blueprint: Project Documentation

## 1. Core File Structure

This document outlines the essential files and folders that power the Aphrodisiac application.

-   `package.json`
-   `package-lock.json`
-   `vite.config.js`

-   `src/`
    -   `index.html`
    -   `main.js`

    -   `components/`
			`ApiKeyInput.component.js`
        -   `AddPersonalityForm.component.js`
        -   `ChatInput.component.js`
        -   `Sidebar.component.js`
        -   `Stepper.component.js`
        -   `TemperatureSlider.component.js`
        -   `WhatsNew.component.js`
        -   `Tooltip.component.js`				

    -   `services/`
        -   `Chats.service.js`
        -   `Db.service.js`
        -   `Message.service.js`
        -   `Overlay.service.js`
        -   `Personality.service.js`
        -   `Settings.service.js`
        -   `Stepper.service.js`

    -   `styles/`
        -   `main.css`
        -   *(Font files like .ttf and .woff)*

    -   `models/`
		-	`Personality.js`

    -   `utils/`
        -   `helpers.js`
		
## 2. Files' content\functions\description


#`index.html`
	Purpose: The single HTML page defining the entire application's UI structure, or "skeleton." It contains all containers, buttons, forms, and input fields that the JavaScript will interact with.
	Dependencies:
	Local CSS: ./styles/main.css
	Local JS: main.js (loaded as a module, this is the application's main entry point).
	Remote Dependencies:
	highlight.js (for syntax highlighting in code blocks).
	Google Analytics (gtag.js) (for usage analytics).
	Google Fonts (for Material Symbols icons).
	Key UI Sections & ids (for JS interaction):
	Main Layout:
	.sidebar: The collapsible left panel.
	#mainContent: The main chat area on the right.
	.overlay: The modal container for pop-ups like "Add Personality" and "What's New".
	Sidebar Controls:
	#btn-hide-sidebar / #btn-show-sidebar: Toggles sidebar visibility.
	#btn-new-chat: Creates a new conversation.
	#chatHistorySection: Container for the list of past chats.
	#personalitiesDiv: Container for the list of personalities.
	Settings Inputs:
	#apiKeyInput: For the user's Google Gemini API key.
	#selectedModel, #maxTokens, #safetySettings, #temperature: Generation settings.
	Chat Interface:
	.message-container: Where all chat messages are rendered.
	#messageInput: The contenteditable field for typing messages.
	#btn-send: The button to submit a message.
	Forms & Modals:
	#form-add-personality: The form for creating/editing a personality, built with a multi-step UI (#stepper-add-personality).
	#btn-whatsnew: Button to show the "What's New" modal.
	#btn-hide-overlay: Closes the active overlay.


#`main.js`
	Purpose: The application's primary entry point or "ignition switch." It orchestrates the startup sequence and connects high-level UI events (like button clicks in the sidebar) to their corresponding service functions.
	Imports & Dependencies:
	Services:
	Personality.service
	Settings.service
	Overlay.service
	Chats.service
	Db.service
	Utilities:
	helpers.js
	Components (Dynamic):
	It uses import.meta.glob to dynamically import and execute all component files within the /src/components/ directory. This ensures all component-level logic and event listeners are activated on startup.
	Initialization Sequence (Order is critical):
	Initializes Settings.service to load user settings first.
	Asynchronously initializes Chats.service with the database instance.
	Asynchronously migrates and initializes Personality.service.
	Global Event Listeners:
	#btn-hide-overlay: Calls overlayService.closeOverlay().
	#btn-new-chat: Calls chatsService.newChat().
	#btn-clearall-personality: Calls personalityService.removeAll().
	#btn-reset-chat: Calls chatsService.deleteAllChats().
	#btn-import-personality: Opens a file dialog to import a personality JSON file, then adds it via personalityService.add().
	window:resize: Handles responsive sidebar visibility for larger screens.



#`src/components/AddPersonalityForm.component.js`
	Purpose: This component manages the "Add/Edit Personality" form. It handles data collection from the form fields, submission logic, and the dynamic creation of "tone example" input fields.
	Dependencies (Imports):
	models/Personality: The data model used to structure the new personality object.
	services/Personality.service: To save a new personality (add) or update an existing one (edit).
	services/Stepper.service: To interact with the form's multi-step UI.
	services/Overlay.service: To close the modal/overlay after the form is submitted.
	Core Logic:
	Form Submission (form.submit):
	This function is triggered to process the form.
	It reads all input fields using FormData and populates a new Personality object.
	It intelligently handles both "add new" and "edit existing" scenarios by checking for an id field.
	It calls the appropriate function in Personality.service (add or edit).
	Finally, it tells the Overlay.service to close the form modal.
	Dynamic Tone Examples:
	It listens for clicks on the "add tone example" button (#btn-add-tone-example).
	When clicked, it dynamically creates a new text input field, allowing the user to add multiple tone examples to a personality.




#`src/components/ApiKeyInput.component.js`

```
import { GoogleGenAI } from "@google/genai";

const apiKeyInput = document.querySelector("#apiKeyInput");

let debounceTimer;
apiKeyInput.addEventListener("input", () => {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
        const apiKey = apiKeyInput.value.trim();
        const ai = new GoogleGenAI({ apiKey: apiKey });
        try {
            // Test the API key with a simple query
            await ai.models.generateContent({
                model: "gemini-2.0-flash",
                contents: "test"
            });
            apiKeyInput.classList.add("api-key-valid");
            apiKeyInput.classList.remove("api-key-invalid");
            document.querySelector(".api-key-error").style.display = "none";
        } catch (error) {
            apiKeyInput.classList.add("api-key-invalid");
            apiKeyInput.classList.remove("api-key-valid");
            document.querySelector(".api-key-error").style.display = "flex";
        }
    }, 2000);
});
```


#`src/components/ChatInput.component.js`
```
import * as messageService from '../services/Message.service';
import * as dbService from '../services/Db.service';
import * as helpers from '../utils/helpers';

const messageInput = document.querySelector("#messageInput");
const sendMessageButton = document.querySelector("#btn-send");

//enter key to send message but support shift+enter for new line
messageInput.addEventListener("keydown", (e) => {
    // Check if the user is on a mobile device
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    
    if (e.key === "Enter" && !e.shiftKey && !isMobile) {
        e.preventDefault();
        sendMessageButton.click();
    }
});
messageInput.addEventListener("blur", () => {
});
messageInput.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = (e.originalEvent || e).clipboardData.getData('text/plain');
    document.execCommand("insertText", false, text);
});
messageInput.addEventListener("input", () => {
    if (messageInput.innerHTML == "<br>") {
        messageInput.innerHTML = "";
    }
});
sendMessageButton.addEventListener("click", async () => {
    try {
        const message = helpers.getEncoded(messageInput.innerHTML);
        messageInput.innerHTML = "";
        await messageService.send(message, dbService.db);

    } catch (error) {
        console.error("error", JSON.stringify(error));
        if(error.status === 429 || error.code === 429){
            alert("Error, you have reached the API's rate limit. Please try again later or use the Flash model.");
        }
        else{            
            alert(error);
        }
        
    }
});
```


#`src/components/Sidebar.component.js`

```
import * as helpers from "../utils/helpers";

const hideSidebarButton = document.querySelector("#btn-hide-sidebar");
const showSidebarButton = document.querySelector("#btn-show-sidebar");
const tabs = document.querySelectorAll(".navbar-tab");
const tabHighlight = document.querySelector("#navbar-tab-highlight");
const sidebarViews = document.querySelectorAll(".sidebar-section");
const sidebar = document.querySelector(".sidebar");

hideSidebarButton.addEventListener("click", () => {
    helpers.hideElement(sidebar);
});
showSidebarButton.addEventListener("click", () => {
    helpers.showElement(sidebar, false);
});

let activeTabIndex = undefined;
function navigateTo(tab) {
    const index = [...tabs].indexOf(tab);
    if (index == activeTabIndex) {
        return;
    }
    tab.classList.add("navbar-tab-active");
    //hide active view before proceding
    if (activeTabIndex !== undefined) {
        helpers.hideElement(sidebarViews[activeTabIndex]);
        tabs[activeTabIndex].classList.remove("navbar-tab-active");
    }
    helpers.showElement(sidebarViews[index], true);
    activeTabIndex = index;
    tabHighlight.style.left = `calc(100% / ${tabs.length} * ${index})`;
}
//tab setup
tabHighlight.style.width = `calc(100% / ${tabs.length})`;
for(const tab of tabs){
    tab.addEventListener("click", () => {
        navigateTo(tab);
    });
}

navigateTo(tabs[0]);
```

#`src/components/Stepper.component.js`

```
//all steppers are expected to have a next, previous and submit button
//steppers are also expected to be children of a form element
import *  as stepperService from "../services/Stepper.service";

const steppers = stepperService.getAll();

for (const stepper of steppers) {
    const form = stepper.element.parentElement;
    const next = stepper.element.querySelector("#btn-stepper-next");
    const prev = stepper.element.querySelector("#btn-stepper-previous");
    const submit = stepper.element.querySelector("#btn-stepper-submit");
    next.addEventListener("click", () => {
        stepper.step++;
        stepperService.update(stepper);
    });
    prev.addEventListener("click", () => {
        stepper.step--;
        stepperService.update(stepper);
    });
    submit.addEventListener("click", (e) => {
        e.preventDefault();
        //delegate the submit to the form containing the stepper
        form.submit();
    });
}
```


#`src/components/TemperatureSlider.component.js`
```
const temperatureLabel = document.querySelector("#label-temperature");
const temperatureInput = document.querySelector("#temperature");

temperatureLabel.textContent = temperatureInput.value / 100;
temperatureInput.addEventListener("input", () => {
    temperatureLabel.textContent = temperatureInput.value / 100;
});
```

#`src/components/Tooltip.component.js``
```
import tippy from 'tippy.js';
import 'tippy.js/dist/tippy.css';
import 'tippy.js/themes/material.css';

const tooltips = document.querySelectorAll('.tooltip');

for(const tooltip of tooltips){
    tippy(tooltip, {
        content: tooltip.getAttribute("info"),
        theme: "material",
        placement: "top",
        arrow: true,
    })
}
```


#`src/models/Personality.js`
```
export class Personality {
    constructor(name = "", image = "", description = "", prompt = "", aggressiveness = 0, sensuality = 0, internetEnabled = false, roleplayEnabled = false, toneExamples = []) {
        this.name = name;
        this.image = image;
        this.description = description;
        this.prompt = prompt;
        this.aggressiveness = aggressiveness;
        this.sensuality = sensuality;
        this.internetEnabled = internetEnabled;
        this.roleplayEnabled = roleplayEnabled;
        this.toneExamples = toneExamples;
    }
}
```

#`src/services/Chats.service.js`
```
Purpose: The central service for managing chat histories (CRUD operations: Create, Read, Update, Delete). It bridges the database (db.chats) with the chat history UI in the sidebar and the main message display area.
Dependencies (Imports):
services/Message.service: Used to render individual messages in the main view when a chat is loaded.
services/Personality.service: Used to fetch personality details (name, image) associated with past model responses.
utils/helpers: For utility functions (e.g., hiding the sidebar on mobile after a chat is selected).
Core Logic & Key Functions:
Initialization & UI Rendering:
initialize(db): Populates the sidebar's chat history section on application start. It fetches all chat titles from the DB and uses insertChatEntry to render them.
insertChatEntry(chat, db): Creates the interactive HTML elements for a single chat in the sidebar (the radio button for selection, the title, and the delete button) and attaches the necessary event listeners.
Data Retrieval (Reading):
loadChat(chatID, db): The primary function for displaying a conversation. It clears the main chat view, fetches the specified chat's full message history from the DB, and uses Message.service to render each message.
getChatById(id, db): Retrieves a single, complete chat object from the database.
getCurrentChat(db): Gets the full data for the currently selected chat in the UI.
Data Modification (Creating & Deleting):
addChat(title, firstMessage, db): Creates a new chat record in the database and adds the corresponding entry to the sidebar UI.
deleteChat(id, db): Deletes a specific chat from the database and removes it from the UI.
deleteAllChats(db): Clears the entire chat history from both the database and the UI.
State Management:
newChat(): Clears the main message area to prepare for a new, unsaved chat session.
getCurrentChatId(): A helper that reads the DOM to find which chat is currently selected in the sidebar.
```

#`src/services/Db.service.js`
```
import { Dexie } from 'dexie';
export async function setupDB() {
    let db;
    try {
        db = new Dexie("chatDB");
    } catch (error) {
        console.error(error);
        alert("failed to setup dexie (database)");
        return;
    }
    db.version(3).stores({
        chats: `
            ++id,
            title,
            timestamp,
            content
        `
    });
    db.version(4).stores({
        personalities: `
            ++id,
            name,
            image,
            prompt,
            aggressiveness,
            sensuality,
            internetEnabled,
            roleplayEnabled,
            toneExamples
        `
    });
    return db;
}
export const db = await setupDB();
```

#`src/services/Message.service.js`
```
Purpose: The central engine for all AI communication. It constructs the prompt, sends it to the Google Gemini API, handles the streaming response, renders messages to the UI, and saves the conversation history.
Dependencies (Imports):
@google/genai: Direct dependency on the official Google GenAI library. This is where the API call happens.
marked: A library to parse Markdown text from the AI into displayable HTML.
services/Settings.service: To retrieve the API key, model choice, and other generation settings.
services/Personality.service: To get the active personality's details (prompt, description, tone examples) to construct the context for the AI.
services/Chats.service: To read the current chat history for context and to save the new user/model messages back to the database.
utils/helpers: For utility functions like scrolling the message container.
Core Logic & Key Functions:
send(msg, db): The primary function that orchestrates the entire message lifecycle.
Setup: Fetches the current settings and selected personality.
New Chat Generation: If no chat is active, it makes a separate, preliminary API call to generate a title for the new chat based on the user's first message, then creates the chat via Chats.service.
History Assembly: It builds a complete conversation history to send to the API, including: the personality's instructions, tone examples, and the full history of the current chat.
API Call: It establishes a streaming connection to the Gemini API (chat.sendMessageStream).
Render & Save: It passes the stream to insertMessage for real-time display and, once the full reply is received, saves the user message and the full model reply to the database via Chats.service.
insertMessage(...): The UI rendering workhorse.
Creates the HTML structure for both user and model messages.
For model messages, it handles the netStream: it iteratively receives text chunks, parses them with marked, and updates the UI in real-time to create a "typing" effect.
Initializes syntax highlighting (hljs.highlightAll()) and attaches event listeners for the message action buttons (edit, regenerate).
Message Interactivity (regenerate, setupMessageEditing, updateMessageInDatabase):
regenerate: Deletes the last model response from the database, restores the chat to its previous state, and re-sends the user's last message to get a new response.
setupMessageEditing / updateMessageInDatabase: Manages the logic for making a message contenteditable, listening for save/cancel events (Enter/Escape), and updating the corresponding message text in the database.
```

#`src/services/Overlay.service.js`
```
Purpose: A UI utility service that manages the application's main modal/overlay container. It controls which specific piece of content (e.g., "Add Personality Form", "Changelog") is visible within the overlay and handles the cleanup/reset process when the overlay is closed.
Dependencies (Imports):
utils/helpers: Uses showElement and hideElement for basic DOM visibility toggling.
services/Stepper.service: To reset the multi-step form UI when the overlay is closed.
Core Logic & Key Functions:
showAddPersonalityForm() / showChangelog(): These are simple "show" functions. They make the main overlay visible and then reveal the specific content (#form-add-personality or #whats-new) inside it.
showEditPersonalityForm(personality): A more advanced "show" function. Before making the form visible, it first populates all the form's input fields with the data from the provided personality object. It includes special logic to dynamically create and fill the "tone example" fields.
closeOverlay(): The universal "hide and reset" function.
Hides the main overlay container.
Hides all content panels within the overlay.
Crucially, it detects if the content was a form, and if so, performs a deep reset: it clears all fields, removes dynamically added inputs (like extra tone examples), and calls Stepper.service to reset the multi-step UI back to the first step.
```

#`src/services/Personality.service.js`
```
Purpose: The central service for managing all aspects of Personalities, from database storage (CRUD) to UI rendering and user interactions within the "Personalities" tab.
Dependencies (Imports):
services/Overlay.service: To show the add/edit personality form modal.
services/Db.service: To access the db.personalities object store for all database operations.
models/Personality: The data model for creating new personality objects.
Core Logic & Key Functions:
Initialization & UI Rendering:
initialize(): The main setup function. It populates the "Personalities" tab by creating the default personality card, loading all user-created personalities from the DB, and adding the "Create New" card at the end.
generateCard(personality): A crucial UI factory function. It builds the complete HTML for a single personality card, including the background image, title, and action buttons (edit, share, delete). Importantly, it also attaches all necessary event listeners to these buttons within the card itself.
insert(personality): A helper that takes a personality object, calls generateCard, and appends the resulting HTML element to the DOM.
Data Management (CRUD):
add(personality) / edit(id, personality) / remove(id) / removeAll(): Standard CRUD functions that interact directly with the db.personalities IndexedDB table. The edit function is notable as it replaces the old card in the DOM with a newly generated one.
get(id) / getAll() / getByName(name): Functions to retrieve personality data from the database.
getSelected(): A key function that bridges the UI and the data. It inspects the DOM to find which personality's radio button is checked, gets its ID, and then fetches the full personality object from the database.
Special Features:
share(personality): An export utility. It converts a personality object to a JSON string and triggers a browser download for the user.
getDefault(): A hardcoded factory that returns the default "zodiac" personality object. This ensures the app always has a fallback personality.
Migration/Utility:
migratePersonalities(database): A specific utility function designed for data maintenance. It iterates through all saved chats and adds a personalityid to messages that might only have a personality name, ensuring backward compatibility.
```

#`src/services/Settings.service.js`
```
src/services/Settings.service.js
Purpose: Manages all user-configurable settings found in the "Settings" tab. It handles loading settings from localStorage, saving them on any change, and providing them in a structured format for API calls.
Dependencies (Imports):
@google/genai: Direct dependency on the Google GenAI library. It imports HarmBlockThreshold and HarmCategory to construct the safety settings object.
Core Logic & Key Functions:
initialize(): The setup function. It first calls loadSettings() to populate the UI, then attaches event listeners to all settings inputs (API Key, Model, Temperature, etc.). Any change to these inputs immediately triggers saveSettings().
loadSettings() & saveSettings(): A matched pair of functions that act as the persistence layer. They read from and write all setting values directly to the browser's localStorage, ensuring settings are remembered between sessions.
getSettings(): A crucial "getter" function used by other services (Message.service). It reads the current, live values from the UI controls and packages them into an object formatted for the Gemini API.
Key Detail: This function hardcodes the safety settings to BLOCK_NONE for all categories, effectively disabling the API's content filters.
getSystemPrompt(): Provides a large, static, hardcoded master system prompt. This prompt is not user-configurable. It instructs the AI on how to handle Markdown, the current date, and provides detailed behavioral rules based on the "Aggressiveness" and "Sensuality" guidelines.
```

#`src/services/Stepper.service.js`
```
const steppers = [...document.querySelectorAll(".stepper")].map((element) => ({ element: element, step: 0 }));
export function update(stepper) {
    const steps = stepper.element.querySelectorAll(".step");
    stepper.step = Math.max(0, Math.min(stepper.step, steps.length - 1));
    stepper.element.classList.toggle("first-step", stepper.step === 0);
    stepper.element.classList.toggle("final-step", stepper.step === steps.length - 1);
    //hide all other steps
    for (let i = 0; i < steps.length; i++) {
        if (i != stepper.step) {
            steps[i].classList.remove("active");
        }
        else {
            steps[i].classList.add("active");
        }
    }
}
export function getStep(stepper, index){
    return stepper.element.querySelectorAll(".step")[index];
}
export function get(id) {
    return steppers.find(stepper => stepper.element.id === id);
}
export function getAll(){
    return steppers;
}
```

#`scr/utils/helpers.js`

```
Purpose: A collection of miscellaneous, reusable utility functions (a "toolbox") used across multiple services and components to perform common tasks like DOM manipulation, text processing, and security sanitization.
Dependencies (Imports):
dompurify: A critical library used for sanitizing HTML to prevent XSS (Cross-Site Scripting) attacks.
marked: A library for converting Markdown text into HTML.
services/Settings.service: To check the user's autoscroll preference.
Core Logic & Key Functions by Category:
UI & Animation:
showElement(element) / hideElement(element): Provides a standardized, animated way to fade elements in and out of view by manipulating CSS opacity and display properties.
darkenCard(element) / lightenCard(element): Manipulates the backgroundImage CSS of an element to add or remove a semi-transparent dark overlay, likely for hover effects on cards.
Text Processing & Security:
getSanitized(string): A key security function. It uses DOMPurify to clean a string, removing any potentially malicious code before it's rendered.
getEncoded(innerHTML): Cleans and formats text from an HTML source (like a contenteditable div) to prepare it for sending to the API. It converts <br> tags to newlines and un-escapes HTML entities.
getDecoded(encoded): The reverse of getEncoded. It takes plain text (which may contain Markdown) from the AI/database and uses marked to convert it into safe, displayable HTML.
Application-Specific Helpers:
getVersion(): Returns a hardcoded application version string.
messageContainerScrollToBottom(): Conditionally scrolls the chat window to the bottom. It first checks the user's preference by calling getSettings() from the Settings.service.
```

#`scr/styles/main.css`
```
src/styles/main.css
Purpose: The single, comprehensive stylesheet for the entire application. It controls the layout, typography, colors, animations, and responsive design.
Dependencies (Imports):
Remote Dependencies:
Google Fonts: Imports the primary font family (Noto Sans), fonts for branding (Product Sans, Google Sans), and the crucial Material Symbols Outlined for all icons.
Core Logic & Key Sections:
Global & Foundational Styles:
Sets up box-sizing, scrollbar styles, and base typography (font-family, color).
Defines a clever img rule to prevent broken image icons from showing by keeping them opacity: 0 until a valid src is present.
Standardizes the look of buttons, inputs, and forms.
Layout & Component Styling:
.container, .sidebar, #mainContent: Defines the main two-column flexbox layout.
.message-container, .message, #message-box: Styles the entire chat interface, including individual message bubbles and the input area.
.card-personality: Contains extensive styling for the personality cards. It uses the powerful :has() pseudo-class to create a dynamic layout: cards expand and change appearance when their internal radio button is :checked.
.overlay: Styles the full-screen modal, using backdrop-filter for a blurred background effect.
.navbar: Styles the main navigation tabs (Chats, Personalities, Settings) in the sidebar, including the animated highlight bar.
.stepper: Provides the layout for the multi-step form UI.
Theming & Responsiveness:
@media (prefers-color-scheme: light) / @media (prefers-color-scheme: dark): This is the core of the theming system. It contains two large blocks that override colors, backgrounds, and borders for all major components, creating distinct light and dark themes based on the user's OS preference.
@media (max-width: 1032px): This is the primary media query for responsive design. It transforms the layout for mobile/smaller screens by making the sidebar a full-screen, togglable element instead of a fixed column.
```



```
The Aphrodisiac Blueprint: Executive Summary
This project is a sophisticated, single-page web application designed as a frontend for the Google Gemini API. Its architecture is modern and well-structured, separating responsibilities into distinct, manageable parts.
Core Philosophy:
The application's power comes from a clever combination of detailed prompt engineering and a hardcoded bypass of the API's default safety filters. This allows for a highly flexible and unrestricted user experience, driven by user-created "Personalities."
Architectural Overview:
The Skeleton (index.html): The application is built on a single HTML file that defines three primary visual areas: a feature-rich .sidebar for navigation and settings, a #mainContent area for the chat conversation, and a hidden .overlay for pop-up forms. The link between the visual elements and the logic is established through unique id attributes on key elements.
The Ignition Switch (main.js): This is the central startup script. It doesn't perform tasks itself but acts as a master conductor. It awakens all the UI components, initializes all the backend services in a specific order (Settings -> Chats -> Personalities), and then connects all the HTML buttons to their corresponding JavaScript functions.
The UI "Controllers" (components/): This folder contains the "listeners." Each file is responsible for a specific piece of the UI, listening for user actions (clicks, typing) and delegating the real work to a corresponding service.
Sidebar.component.js manages tab navigation.
ChatInput.component.js captures user messages.
AddPersonalityForm.component.js handles form data entry.
The "Brain" (services/): This is the heart of the application, where all the logic, data management, and API communication happens.
Data Persistence: Db.service.js sets up the browser's IndexedDB database, which is the permanent storage for all chats and personalities.
Settings & The "Secret Sauce": Settings.service.js is paramount. It manages user preferences and, most importantly, contains both the hardcoded BLOCK_NONE safety settings and the detailed master system prompt that are the keys to the application's performance.
API Communication: Message.service.js is the engine room. It takes the user's message, assembles the full API request (including the injected "pre-history" for priming the AI), sends it to Google, processes the streaming response, and saves the conversation.
Data Management: Personality.service.js and Chats.service.js handle all the business logic for creating, reading, updating, and deleting their respective data from the database and rendering it in the UI.
The Skin (styles/main.css): A single, comprehensive stylesheet defines the entire visual appearance, including a responsive mobile layout and a well-organized light/dark theme system.
Conclusion:
We have a robust, well-engineered foundation. We know precisely where the core logic resides, how the UI is controlled, and what makes the application perform so effectively. We are perfectly positioned to begin our strategic rebuild, adding our advanced features with surgical precision.
```


The Aphrodisiac Roadmap (v4 - The Immersion Mandate)
Our Guiding Principle: We do not port old code. We learn from its strengths, then architect and build superior solutions from scratch, leveraging existing robust backend logic while completely reinventing the user experience.
Overall Goal: To transform the "Zodiac" base into "Aphrodisiac," a cutting-edge, media-oriented AI companion application, delivering an unparalleled, customizable, and deeply immersive user experience.
Phase 1: Foundational Transformation & Core Layout
Objective: Establish the new brand identity and implement the revolutionary Character Immersion Window and redesigned sidebar structure, setting the stage for a truly media-centric application.
Task 1: Brand Identity & Initial Cleanup
Objective: Purge all "Zodiac" branding and replace it with "Aphrodisiac," while removing obsolete UI elements.
Status: COMPLETE (already executed in index.html and Personality.service.js)
Task 2: Flexible Left Sidebar Foundation
Objective: Implement the underlying HTML and CSS structure for a flexible, resizable, and collapsible left sidebar.
Status: COMPLETE (already executed in index.html, main.css, and Sidebar.component.js)
Task 3: Architect the Character Immersion Hub
Objective: Redesign the left sidebar to host the dockable/undockable, resizable, dynamic Character Immersion Window, alongside a compact Character Roster and Chat History, providing a fluid, media-centric workflow.
Action Plan:
3.1 HTML Layout Refactor (src/index.html):
Restructure the left sidebar's content to eliminate tabs.
Create distinct sections for Chat History and Character Roster.
Add the HTML placeholder for the docked Character Immersion Window within the left sidebar.
Introduce a global settings button (e.g., a gear icon) in the footer.
3.2 CSS Styling for New Unified Layout (src/styles/main.css):
Define styles for the new vertical section layout within the left sidebar.
Create base styles for the Character Immersion Window in its default docked state.
Adjust media queries for the new mobile behavior (left sidebar becomes a sliding overlay).
3.3 Core Immersion Window Logic (src/components/CharacterImmersionWindow.component.js - NEW FILE):
Create a dedicated JavaScript module (CharacterImmersionWindow.component.js).
Implement logic for its dockable/undockable states, drag-and-drop functionality, resizing, and persistence (localStorage).
Handle the dynamic loading and display of the active character's avatar based on selection.
Include placeholders for future dynamic expressions and audio controls.
3.4 Left Sidebar Control Refactor (src/components/Sidebar.component.js):
Update existing sidebar JavaScript to manage the new content areas (Chat History, Character Roster).
Integrate with the Character Immersion Window's logic (e.g., triggering its visibility/state on character selection).
Handle the new global settings button to open the right-hand Inspector Panel (future task).
3.5 Update Main Entry Point (src/main.js):
Adjust main.js to correctly initialize the new Character Immersion Window component and the refactored sidebar components.
Phase 2: Enhancements & Advanced Systems
Objective: Implement core customization features and lay the groundwork for powerful backend integrations, building upon the new unified layout.
Task 4: Dynamic Theming Engine
Objective: Go beyond default light/dark themes by allowing the user to select and apply custom color palettes.
Action Plan:
Add new color picker inputs in the settings panel (which will eventually reside in the right-hand Inspector Panel).
Modify Settings.service.js to save and load these custom color choices.
Write new JavaScript logic that applies these colors to the root element as CSS variables.
Task 5: Architect the Right-Hand Inspector Panel
Objective: Create a new, collapsible and resizable right sidebar that serves as a dedicated, contextual space for character editing, application settings, and asset management.
Action Plan:
Add HTML structure for the right sidebar (src/index.html), including its own resizer.
Add CSS for its appearance, resizing behavior, and mobile responsiveness.
Create src/components/InspectorPanel.component.js to manage its state, resizing, and the dynamic content it displays (e.g., personality forms, settings forms).
Crucially, move the form-add-personality (stepper) HTML entirely from the overlay into the new Inspector Panel.
Refactor AddPersonalityForm.component.js to integrate with the Inspector Panel, removing its dependency on Overlay.service.js.
Task 6: Build the API Switchboard
Objective: Create a clean, abstract system for managing and switching between Google's API libraries, completely decoupling core logic from direct API calls.
Action Plan:
Create a new file: src/services/ApiHandler.service.js. This will be the only file that imports Google's generative AI libraries.
Refactor Message.service.js and Settings.service.js to exclusively use this new handler, removing all direct API calls and @google/generative-ai imports from them.
Task 7: Architect the Dynamic Scripting Engine V2
Objective: Build a superior, secure, and robust scripting engine for complex character behaviors.
Action Plan:
Create a new file: src/services/CharacterScript.service.js from scratch.
Implement the core logic around a secure, sandboxed AsyncFunction.
Integrate robust UI error reporting for script bugs and timeout protection to prevent infinite loops.
Phase 3: The Ultimate Immersive Experience
Objective: Design and build our "game-changer" feature, the Aphrodisiac Asset Manager, seamlessly integrated within our new UI architecture.
Task 8: Design & Build the Aphrodisiac Asset Manager
Objective: Create a masterpiece of media management, learning from all the weaknesses of previous iterations.
Action Plan:
Modify the database schema in src/services/Db.service.js to support a new, flexible asset structure (e.g., images, audio files).
Create a new file: src/services/AssetManager.service.js using a Class-based design to encapsulate state and avoid global variables. This service will be media-agnostic from the start.
Create a new file: src/components/AssetManager.component.js to handle all UI rendering for asset management, keeping it decoupled from the data logic.
Integrate the Asset Manager UI into the right-hand Inspector Panel.
Integrate dynamic avatar loading and expression-swapping with the CharacterImmersionWindow.component.js.
Implement the initial dynamic audio system (play/pause, volume control) within the CharacterImmersionWindow.component.js.



### Visualization of the project:

+----------------------------------------------------------------------------------------------------------+
|  [ TOP MAIN HEADER AREA (potential dock zone for Immersion Window) ]                                     |
|  (e.g., Aphrodisiac branding, global settings icon)                                                      |
+----------------------------------------------------------------------------------------------------------+
|                                                                                                          |
| +-------------------------+----------------------------------------------------+-------------------------+
| | < [ LEFT SIDEBAR ]      |                                                    | [ RIGHT SIDEBAR ]     > |
| |       collapsible       |                                                    | (Inspector Panel)       |
| | +---------------------+ |                                                    |       collapsible       |
| | |                     | |                                                    |                         |
| | |  DOCKED CHARACTER   | |                                                    | [ SELECTED CHAR. EDIT ] |
| | |  MEDIA WINDOW       | |                                                    |  - Name                 |
| | |  (ACTIVE CHARACTER) | |                                                    |  - Prompt               |
| | |                     | |                                                    |  - Aggressiveness       |
| | +---------------------+ |                                                    |  - Sensuality           |
| | (Undock/Drag Handle)    |                                                    |  - Custom scripts       |
| |-------------------------|                                                    | [ ASSET MANAGEMENT ]    |
| | [ CHARACTER ROSTER ]    |                                                    |  - Upload Image         |
| | (Compact list for       |                                                    |  - Manage Audio Files   |
| | quick selection)        |                                                    |                         |
| | - Aphrodite             |                                                    |                         |
| | - Emily (Active)        |           [ MAIN CHAT CONTENT ]                    |                         |
| | - Mario                 |                                                    |                         |
| | - (+) Add New           |   (Chat messages and AI responses flow here)       |                         |
| |                         |                                                    |                         |
| |-------------------------|                                                    |                         |
| | [ CHAT HISTORY ]        |                                                    |                         |
| | (List of past chats)    |                                                    |                         |
| | - Chat A                |                                                    |                         |
| | - Chat B (Selected)     |                                                    |                         |
| | - ...                   |                                                    |                         |
| |                         |                                                    |                         |
| | [ ⚙️ Global Settings ]  |                                                    |                         |
| +-------------------------+----------------------------------------------------+-------------------------+
|                                                                                                          |
|  (FLOATING CHARACTER IMMERSION WINDOW: When undocked, it appears here, resizable, draggable,             |
|   and can be dragged to re-dock at: top-left sidebar, top-right sidebar, or top of main chat area.)      |
|                                                                                                          |
+----------------------------------------------------------------------------------------------------------+

