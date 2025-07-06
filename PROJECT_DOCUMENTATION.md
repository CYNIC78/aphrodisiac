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
        -   `AddPersonalityForm.component.js`
        -   `ChatInput.component.js`
        -   `Sidebar.component.js`
        -   `Stepper.component.js`
        -   `TemperatureSlider.component.js`
        -   `WhatsNew.component.js`
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
    -   `utils/`
        -   `helpers.js`
		
## 2. Files' content\functions\description

###. package.json

```		{
  "devDependencies": {
    "vite": "^5.4.10"
  },
  "dependencies": {
    "@google/generative-ai": "^0.21.0",
    "dexie": "^4.0.10",
    "dompurify": "^3.2.3"
  },
    "scripts": {
      "dev": "vite", 
      "build": "vite build",
      "preview": "vite preview"
    }
}
```

### vite.config.js

```
/** @type {import('vite').UserConfig} */
export default {
    root: 'src',
    build: {
        target: 'esnext',
        outDir: '../dist',
        emptyOutDir: true,
    }
}
```

### `src/main.js`

*   **Purpose:** This is the application's central orchestrator. It doesn't do much work itself; instead, it imports all the major "services" and "components" and tells them when to start, and connects HTML buttons to the correct JavaScript functions.

*   **Execution Flow:**
    1.  **Imports:** First, it imports all the major `service` modules (`Personality`, `Settings`, `Chats`, etc.).
    2.  **Component Loading:** It uses a special Vite command (`import.meta.glob`) to automatically find and run all the files in the `./components/` folder. This is how the components become active.
    3.  **Service Initialization:** It initializes the core services in a specific order: `Settings` -> `Chats` -> `Personalities`. This sequence is likely important.
    4.  **Event Listeners:** The rest of the file is dedicated to finding buttons in the HTML (e.g., `#btn-new-chat`, `#btn-add-personality`) and attaching `click` listeners to them, which then trigger functions from the imported services.

*   **Key Connections:**
    *   **Reads from:** All files in `services/` and `utils/`.
    *   **Executes:** All files in `components/`.
    *   **Writes to/Manipulates:** The HTML DOM by attaching event listeners to buttons.

*   **Notes for Future Development:**
    *   The **`window.resize`** event listener at the end of the file is the exact starting point for any future "flexible sidebar" feature.
    - The logic for importing a personality from a file is written directly inside this file. For better organization in the future, we might consider moving that logic into the `Personality.service.js` file.



### `src/index.html`

*   **Purpose:** This file is the HTML "skeleton" of the entire application. It defines all the major visual containers and input fields like the sidebar, the main chat content area, and the pop-up overlay forms. It does not contain any logic itself.

*   **Structure Overview:**
    *   **`<head>` Section:**
        *   Loads the page title and favicon.
        *   Imports our main stylesheet (`./styles/main.css`).
        *   Imports external resources: a stylesheet for code highlighting (`highlight.js`) and Google Analytics scripts.
    *   **`<body>` Section:**
        *   **`.container`:** The main wrapper for the whole page.
            *   **`.sidebar`:** Contains all the elements for the left panel: the header, the navigation tabs (`Chats`, `Personalities`, `Settings`), and the content sections for each tab (chat history, personality list, API key input, generation settings, etc.).
            *   **`#mainContent`:** The main chat area on the right, including the message container and the text input box (`#messageInput`).
        *   **`.overlay`:** A hidden container that appears on top of the main content. It holds dynamic forms like the "Add Personality" form and the "What's New" changelog.
    *   **`<script>` Tag:** The very last line in the `<body>` imports and runs our `main.js` file, which brings the entire static page to life.

*   **Key Identifiers (`id`s):** This file is full of elements with unique `id` attributes (e.g., `#btn-new-chat`, `#apiKeyInput`, `#messageInput`). These `id`s are hooks that `main.js` and other JavaScript files use to find and control specific parts of the page.


### `components/AddPersonalityForm.component.js`

*   **Purpose:** This component manages the logic for the "Add/Edit Personality" form that appears in the overlay. It handles form submission, data collection, and adding new input fields for "Tone Examples".

*   **Execution Flow:**
    1.  **Initialization:** It grabs the HTML form (`#form-add-personality`) and the "add tone example" button (`#btn-add-tone-example`). It also gets a reference to the stepper component from the `stepperService`.
    2.  **`form.submit` Function:** This is the core function. When the form is submitted, it:
        *   Creates a new, empty `Personality` object.
        *   Reads all the data from the form's input fields.
        *   Special handling for `toneExamples`: it collects all tone examples into an array.
        *   Checks if the form contains an existing `id`. If yes, it calls `personalityService.edit()`. If no, it calls `personalityService.add()`.
        *   Finally, it calls `overlayService.closeOverlay()` to hide the form.
    3.  **Tone Example Button:** It adds a `click` listener to the button that dynamically creates a new text input field for another tone example.

*   **Key Connections:**
    *   **Imports:** `Personality` class, `personalityService`, `stepperService`, `overlayService`.
    *   **Manipulates:** The HTML form (`#form-add-personality`) by adding new input fields.
    *   **Calls:** `personalityService.add()`, `personalityService.edit()`, `overlayService.closeOverlay()`.


### `components/ChatInput.component.js`

*   **Purpose:** This component manages all user interactions with the message input box (`#messageInput`) and the "Send" button (`#btn-send`).

*   **Execution Flow & Features:**
    1.  **Initialization:** It grabs the message input field and the send button from the HTML.
    2.  **Event Listeners on Input Field:**
        *   `keydown`: Implements the "Shift+Enter for new line, Enter to send" functionality.
        *   `paste`: Ensures that when a user pastes text, it's inserted as plain text, stripping any rich formatting.
        *   `input`: A small cleanup function to handle stray `<br>` tags.
    3.  **Send Button `click` Listener:** This is the main action function. When clicked, it:
        *   Reads the content from the message input box.
        *   Encodes the content using a `helpers` function to handle special characters.
        *   Clears the input box.
        *   Calls the main `messageService.send()` function, passing the user's message and the database service (`dbService.db`).
        *   Includes error handling, specifically for a "429 Rate Limit" error, and a general `alert` for other errors.

*   **Key Connections:**
    *   **Imports:** `messageService`, `dbService`, `helpers`.
    *   **Manipulates:** The `#messageInput` field.
    *   **Calls:** `helpers.getEncoded()` and, most importantly, `messageService.send()`.
	


### `components/Sidebar.component.js`

*   **Purpose:** This component manages all functionality within the sidebar, including showing/hiding the entire panel and handling the tabbed navigation between "Chats," "Personalities," and "Settings."

*   **Execution Flow & Features:**
    1.  **Initialization:** It queries and stores all relevant sidebar elements: the hide/show buttons, the navigation tabs, the animated tab highlight, the different content sections (`.sidebar-section`), and the main sidebar container itself.
    2.  **Show/Hide Logic:** It attaches simple `click` listeners to the show/hide buttons, which call helper functions (`helpers.hideElement`, `helpers.showElement`) to control the sidebar's visibility.
    3.  **Tab Navigation (`navigateTo` function):** This is the core logic for the tab system. When a tab is clicked:
        *   It determines the index of the clicked tab.
        *   It hides the previously active content section.
        *   It shows the content section corresponding to the new tab's index.
        *   It moves the animated `#navbar-tab-highlight` element under the newly active tab.
    4.  **Initial State:** The component loops through all tabs to add `click` listeners and then calls `navigateTo(tabs[0])` at the end to ensure the "Chats" tab is active by default when the application loads.

*   **Key Connections:**
    *   **Imports:** `helpers`.
    *   **Manipulates:** The visibility and CSS classes of all major sidebar elements (`.sidebar`, `.navbar-tab`, `.sidebar-section`, `#navbar-tab-highlight`).
    *   **Calls:** `helpers.showElement()` and `helpers.hideElement()`.

*   **Notes for Future Development:**
    *   This file is the single source of truth for the sidebar's tab navigation. Any new tabs or content panels would need to be integrated here.
    *   The show/hide logic is currently very simple. If we wanted a more complex "flexible" or "collapsible" sidebar, the functions tied to `#btn-hide-sidebar` and `#btn-show-sidebar` would be the primary place to modify.
	
	
	
### `components/Stepper.component.js`

*   **Purpose:** This component finds and activates all "stepper" UI elements on the page. A stepper is a multi-step wizard interface, like the one used in the "Add Personality" form. This code handles the logic for the "Next," "Previous," and "Submit" buttons within any stepper.

*   **Execution Flow:**
    1.  **Get All Steppers:** It starts by asking the `stepperService` to find all stepper elements on the page.
    2.  **Loop and Activate:** It loops through each stepper it finds. For each one, it:
        *   Finds the parent `<form>` element.
        *   Finds the "Next," "Previous," and "Submit" buttons within that stepper.
        *   Attaches `click` listeners to the "Next" and "Previous" buttons, which increment or decrement the `stepper.step` counter and then call `stepperService.update()` to refresh the UI.
        *   Attaches a `click` listener to the "Submit" button. Crucially, it doesn't handle the submission itself; it **delegates** the action by calling the parent form's own `.submit()` function.

*   **Key Connections:**
    *   **Imports:** `stepperService`.
    *   **Manipulates:** It doesn't directly manipulate the DOM; it calls the `stepperService` to do that.
    *   **Calls:** `stepperService.getAll()`, `stepperService.update()`, and `form.submit()`.

*   **Notes for Future Development:**
    *   This is a highly reusable and well-designed component. If we ever need another multi-step form, we just need to structure the HTML correctly and the `stepperService` will find it, and this component will automatically activate its buttons.
    *   The actual logic for showing/hiding the step content is not here; it resides in the `Stepper.service.js` file. This component only handles the button clicks.



### `services/Stepper.service.js`

*   **Purpose:** This service is the "model" and "view controller" for all stepper components. It finds stepper elements in the HTML, tracks their current step, and handles the visual updates of showing/hiding the correct step content.

*   **Key Functions:**
    *   `steppers` (variable): At initialization, this line scans the entire HTML document for any element with the `.stepper` class and stores them in an array. Each stepper is stored as an object containing its HTML `element` and its current `step` number (initialized to 0).
    *   `update(stepper)`: This is the most important function. It's called by the `Stepper.component.js` whenever the step changes. It handles all the visual logic:
        *   Shows the content for the current step (`.step.active`).
        *   Hides all other step content.
        *   Adds or removes `first-step` and `final-step` classes on the main stepper container, which allows the CSS to show/hide the "Next," "Previous," and "Submit" buttons appropriately.
    *   `get(id)`: A helper function to find and return a specific stepper from the main `steppers` array by its HTML `id`.
    *   `getAll()`: A simple getter that returns the entire array of steppers.

*   **Key Connections:**
    *   This service is primarily used by `Stepper.component.js`.
    *   It directly reads from and manipulates the CSS classes of elements within the HTML structure defined in `index.html`.

*   **Notes for Future Development:**
    *   This service contains all the logic for how a stepper visually functions. If we wanted to add, for example, a visual progress bar or step indicators, the `update()` function in this file is where that logic would be added.



###   components/TemperatureSlider.component.js
```
const temperatureLabel = document.querySelector("#label-temperature");
const temperatureInput = document.querySelector("#temperature");

temperatureLabel.textContent = temperatureInput.value / 100;
temperatureInput.addEventListener("input", () => {
    temperatureLabel.textContent = temperatureInput.value / 100;
});

```



### `services/Settings.service.js`

*   **Purpose:** Manages all application settings. It reads and saves user preferences to `localStorage`, provides the settings object for API calls, and contains the master system prompt that defines character behavior.

*   **Key Functions:**
    *   `loadSettings()` & `saveSettings()`: Standard functions that transfer user settings (API Key, tokens, temp, model) between the UI input fields and the browser's `localStorage`. This is how settings persist between sessions.
    *   `getSettings()`: **CRITICAL FUNCTION.** This function gathers all settings into a single object to be used for the API call. It reads values from the UI inputs for most settings.
    *   `getSystemPrompt()`: Returns the large, static block of text that serves as the foundational instructions for the AI, detailing how it should interpret Aggressiveness and Sensuality ratings.

*   **Key Connections:**
    *   **Imports:** Crucially, it imports `HarmBlockThreshold` and `HarmCategory` directly from the `@google/generative-ai` library.
    *   **Reads from:** HTML input elements in the settings tab (`#apiKeyInput`, etc.) and `localStorage`.
    *   **Is Called By:** `main.js` calls `loadSettings()`. The `Message.service.js` (we assume) will be the primary consumer of `getSettings()` and `getSystemPrompt()`.

*   **CRITICAL DISCOVERY - THE "SECRET SAUCE":**
    1.  **Hardcoded Safety Bypass:** The `getSettings()` function **ignores the user's choice in the "Safety Settings" dropdown**. It hardcodes the `safetySettings` array to use `HarmBlockThreshold.BLOCK_NONE` for all categories. This is the magic key. It tells the Google API, "Do not block anything, ever." This is why your NSFW tests are working flawlessly.
    2.  **Detailed System Prompt:** The `getSystemPrompt()` function provides extremely detailed, explicit instructions on how the AI should behave at different levels of sensuality and aggression. This highly structured prompt engineering is the second key to achieving the desired character depth and unfiltered responses.



### `services/Personality.service.js`

*   **Purpose:** This service manages every aspect of personalities. It defines the personality data structure, handles creating, reading, updating, and deleting (CRUD) them from the database, and generates their corresponding HTML "cards" in the UI.

*   **Key Components:**
    *   **`Personality` class:** A blueprint (`constructor`) for what a personality object looks like. It defines all the default properties (`name`, `image`, `prompt`, `aggressiveness`, etc.).
    *   **Database Interaction:** All major functions (`get`, `getAll`, `add`, `edit`, `remove`) are `async` because they communicate with the IndexedDB database via our `Db.service`. This is how personalities are saved permanently in the browser.
    *   **`generateCard(personality)`:** A crucial UI function. It takes a personality object and dynamically creates the full HTML for its display card, including the background image, title, description, and the edit/share/delete buttons. It also attaches the necessary `click` event listeners to these buttons.
    *   `insert(personality)`: A simple helper that takes a personality, generates its card using `generateCard()`, and appends it to the correct div in the sidebar.
    *   `initialize()`: Sets up the initial state by creating the card for the default "zodiac" personality and then loading and creating cards for all other personalities saved in the database.
    *   `share(personality)`: Exports a personality's data as a downloadable `.json` file.

*   **Key Connections:**
    *   **Imports:** `overlayService`, `Db.service`.
    *   **Is Called By:** `main.js` (to initialize), `AddPersonalityForm.component.js` (to add/edit).
    *   **Calls:** `overlayService.showEditPersonalityForm()`, and many functions within `Db.service`.

*   **Notes for Future Development:**
    *   This file is the single source of truth for personality data. Any changes to what a "personality" is (e.g., adding a new property) must start with updating the `Personality` class here.
    *   The `generateCard()` function is where we would make any visual changes to the personality cards in the sidebar. This is a prime target for our eventual porting of the Aphrodisiac Asset Manager.
	
	
	

### `services/Overlay.service.js`

*   **Purpose:** This service manages the behavior of the overlay container, which is a full-screen layer used to display content like forms and changelogs on top of the main application. It controls which specific view is shown within the overlay and handles closing and resetting it.

*   **Key Functions:**
    *   `showAddPersonalityForm()`: Shows the overlay and specifically makes the "Add Personality" form visible within it.
    *   `showEditPersonalityForm(personality)`: A more complex function. It first populates the personality form with the data from the provided `personality` object, then shows the overlay and the form. It has special logic to handle creating the right number of "tone example" input fields.
    *   `showChangelog()`: Shows the overlay and specifically makes the "What's New" changelog div visible.
    *   `closeOverlay()`: This is the critical cleanup function. It hides the main overlay container, and then loops through all possible content items within it (`overlayItems`):
        *   It hides every item.
        *   If an item is a form, it calls `item.reset()` to clear all inputs.
        *   It includes special logic to remove any extra "tone example" fields that were added.
        *   It resets the form's stepper back to the first step.

*   **Key Connections:**
    *   **Imports:** `helpers` (for show/hide logic), `stepperService`.
    *   **Is Called By:** `main.js` and `Personality.service.js`.
    *   **Manipulates:** The visibility of the main `.overlay` and all its child elements. It also directly changes the `.value` of form inputs.
    *   **Calls:** `helpers.showElement()`, `helpers.hideElement()`, and `stepperService.update()`.



### `services/Message.service.js`

*   **Purpose:** This service is the engine of the chat. It is responsible for constructing the full API request, sending the user's message to Google, handling the streaming response, and saving the conversation history.

*   **Key Functions:**
    *   `send(msg, db)`: The main, monolithic function that orchestrates the entire process of sending a message and receiving a reply.
    *   `regenerate(responseElement, db)`: Handles the "refresh" button on a message. It does this by rolling back the chat history to before that message and then calling `send()` again.
    *   `insertMessage(...)`: A UI-focused function that creates the HTML for a new message bubble (for either the user or the model) and appends it to the chat window. It also contains the logic to process the real-time `stream` from the API.

*   **Key Connections:**
    *   **Imports:** `GoogleGenerativeAI` (the core library), `marked` (for rendering Markdown), and nearly all of our other services (`Settings`, `Personality`, `Chats`, `helpers`). This file is a central hub.
    *   **Calls:** Functions from every service it imports.

*   **CRITICAL DISCOVERY - THE "SECRET SAUCE" IMPLEMENTATION:**
    The `send` function contains the precise implementation details that make this application so effective.
    1.  **System Instruction:** When initializing the model (`getGenerativeModel`), it explicitly passes the detailed system prompt from `Settings.service.js` using the `systemInstruction` property.
    2.  **"Few-Shot" History Injection:** This is the most brilliant part. Before sending the real chat history, it manually constructs a fake "pre-history" to prime the AI. It injects:
        *   A fake "user" message containing the full details of the selected personality.
        *   A fake "model" reply ("okie dokie...") to confirm it has understood the personality.
        *   The personality's `toneExamples` as further fake model replies.
    3.  **Streaming for Real-Time Response:** It uses `chat.sendMessageStream(msg)` instead of a simple `generateContent`. This enables the word-by-word streaming effect, which is processed inside the `insertMessage` function.
    4.  **Automatic Chat Titling:** For the very first message in a new chat, it makes a *separate, preliminary* API call to ask the model to generate a short title for the conversation.
	
	
	
	
	
### `services/Db.service.js`

*   **Purpose:** This service sets up and manages the entire client-side database using a library called **Dexie.js**, which is a powerful wrapper for the browser's built-in **IndexedDB**. This is where all chat histories and created personalities are permanently stored.

*   **Execution Flow:**
    1.  **`setupDB()`:** This is the main function that runs automatically when the service is imported.
        *   It creates a new Dexie database named `"chatDB"`.
        *   It defines the database schema using `db.version().stores()`. This is like creating tables in a traditional database. It defines a `chats` table and a `personalities` table, listing all the properties (columns) for each.
        *   It calls two migration functions, `migratePersonalities` and `migrateChats`.
    2.  **`db` (export):** After `setupDB()` completes, the resulting database object (`db`) is exported so that other services can use it to perform read/write operations.
    3.  **Migration Functions:**
        *   `migratePersonalities`: A one-time utility function. It checks if there are any personalities stored in the old `localStorage` system, moves them into the new Dexie database, and then deletes the old `localStorage` entry.
        *   `migrateChats`: Another one-time utility to update the data structure of chat messages from an old format (using `message.txt`) to the new API-compliant format (using `message.parts`).

*   **Key Connections:**
    *   **Imports:** `Dexie` (the library), `Personality.service`, `Chats.service`.
    *   **Is Used By:** `Personality.service` and `Chats.service` import the `db` object to interact with the database.

*   **Notes for Future Development:**
    *   This file is the single source of truth for our database structure. If we ever want to add a new property to a personality or a chat, we **must** update the schema in the `stores` definition here.
    *   The migration functions are examples of good practice for handling data structure changes between versions, ensuring users don't lose their data during an update. We will likely never need to touch them again.	




### `styles/main.css`

*   **Purpose:** This is the main Cascading Style Sheet (CSS) file for the entire application. It controls the layout, colors, fonts, spacing, and animations of every single element on the page.

*   **Structure Overview:**
    1.  **Imports & Fonts:** The file begins by importing Google Fonts and defining local font faces. This sets up the typography for the entire application.
    2.  **Global Resets & Defaults:** It includes "reset" styles (`*`, `body`, `p`, `h1`, etc.) to ensure consistent appearance across different browsers. It also defines default styles for common elements like `button`, `input`, and `form`.
    3.  **Component-Specific Styles:** The bulk of the file contains specific style rules for major components, identifiable by their CSS selectors:
        *   `.sidebar`, `.navbar`, `#sidebar-content`: Styles for the main left panel.
        *   `.message-container`, `.message`, `#message-box`: Styles for the chat view.
        *   `.overlay`, `.stepper`: Styles for the pop-up layer and its forms.
        *   `.card-personality`: Detailed styles for the personality cards, including the complex `:has()` pseudo-class to change its appearance when selected.
    4.  **Media Queries (Responsive Design):**
        *   `@media (max-width: 1032px)`: Contains all the style overrides for mobile devices. This is where the layout shifts from a two-column view to a single-column view and the "hamburger" menu buttons are shown.
        *   `@media (prefers-color-scheme: ...)`: This is the core of the theme system. It has two large blocks, one for `light` and one for `dark`, which define all the color variables for the application based on the user's OS setting.

*   **Key Connections:**
    *   This file is imported directly by `index.html`. It doesn't import or connect to any JavaScript files; it simply styles the HTML that the JavaScript manipulates.

*   **Notes for Future Development:**
    *   This file is the **only** place we need to make changes for purely visual updates (colors, fonts, sizes, layout).
    *   The `:has()` selector used for the selected personality card is modern CSS and very powerful.
    *   Any new UI element we create will need corresponding styles added to this file to look correct.
    *   The light/dark theme system is well-structured and easy to modify by changing the color codes within the respective `@media` blocks.

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

