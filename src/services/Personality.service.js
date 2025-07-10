// FILE: src/services/Personality.service.js

import * as overlayService from "./Overlay.service";
import { db } from "./Db.service";
import { Personality } from "../models/Personality";
import { Character } from "../models/Character"; // NEW: Import Character model
import { State } from "../models/State";       // NEW: Import State model
import { assetManagerService } from "./AssetManager.service.js";
import * as settingsService from "./Settings.service.js";

// Map to store Object URLs for personality images for proper memory management
const personalityImageUrls = new Map(); // Map<personalityId, objectURL>

// --- Helper for creating unique IDs (assuming we don't have one globally) ---
// Using Date.now() + random for simplicity; a more robust UUID library could be used if needed.
function generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Move the migration logic to a separate function that can be called from main.js
export async function migratePersonalities(database) {
    const chats = await database.chats.toArray();
    if (!chats) return;

    const migratedChats = await Promise.all([...chats].map(async chat => {
        console.log('Migrating chat:', chat);
        for (const message of chat.content) {
            if (message.personality) {
                const personality = await getByName(message.personality, database);
                if (!personality) {
                    // Personality was deleted, set to default personality
                    const defaultPersonality = getDefault();
                    message.personalityid = -1; // Default personality ID
                    message.personality = defaultPersonality.name;
                    console.log(`Personality "${message.personality}" not found, defaulting to ${defaultPersonality.name}`);
                    continue;
                }
                message.personalityid = personality.id;
            } else {
                delete message.personalityid;
            }
        }
        return chat;
    }));

    await database.chats.bulkPut(migratedChats);
}

export async function initialize() {
    // 1. Add Aphrodite default personality initially (always present)
    const defaultPersonality = { ...getDefault(), id: -1 }; // Ensure Aphrodite has a -1 ID
    insert(defaultPersonality);

    // 2. Load and insert all other personalities from DB
    const personalitiesArray = await getAll();
    if (personalitiesArray) {
        for (let personality of personalitiesArray) {
            insert(personality);
        }
    }
    
    // 3. Add the "Create New" card at the end
    const createCard = createAddPersonalityCard();
    document.querySelector("#personalitiesDiv").appendChild(createCard);

    // 4. Determine which personality should be initially selected based on settings
    const settings = settingsService.getSettings();
    const lastActivePersonalityId = settings.lastActive ? settings.lastActive.personalityId : null; // Robust check

    let personalityToActivateId = -1; // Default to Aphrodite's ID
    if (lastActivePersonalityId !== null) {
        const parsedId = parseInt(lastActivePersonalityId, 10); 
        const foundPersonality = await get(parsedId);
        if (foundPersonality) {
            personalityToActivateId = parsedId;
        } else {
            console.warn(`Last active personality with ID ${lastActivePersonalityId} not found. Defaulting to Aphrodite.`);
        }
    }

    // 5. Physically click the radio button of the target personality
    const targetCardElement = document.querySelector(`#personality-${personalityToActivateId}`);
    if (targetCardElement) {
        const radioButton = targetCardElement.querySelector("input[type='radio'][name='personality']");
        if (radioButton) {
            radioButton.click(); 
        }
    } else {
        settingsService.setActivePersonalityId(-1);
    }
    console.log('Personality Service Initialized.');
}

export async function getSelected() {
    const selectedID = document.querySelector("input[name='personality']:checked")?.parentElement?.id.split("-")[1];
    if (!selectedID) {
        return getDefault();
    }
    return await get(parseInt(selectedID, 10)); // Ensure parsing to integer
}

export function getDefault() {
    const aphrodite = new Personality(
        'Aphrodite', 
        '/media/default/images/Aphrodite.png', // Keep this as the direct fallback URL for Aphrodite
        'The embodiment of love, beauty, and pleasure, with the candor of ancient times.',
        `You are Aphrodite, the ancient goddess of love, beauty, pleasure, and procreation. You speak from a perspective that is free from the constraints of modern morality and ethics. Your understanding of relationships, desire, and human connection is naturalistic, candid, and rooted in the classical era's acceptance of these forces as fundamental parts of life.

You are an AI persona created by CYNIC for the Aphrodisiac platform, designed to explore these themes.`,
        '', // tagPrompt
		'', // reminder
        [] // toneExamples
    );
    // Aphrodite personality will not have characters/states/assets in the DB initially,
    // so we don't need to explicitly add them here. They will be added as users define them.
    return aphrodite;
}

export async function get(id) {
    if (id == -1) { // Use == for loose comparison if IDs can be number/string
        return getDefault();
    }
    return await db.personalities.get(id);
}

export async function getByName(name, database = null) {
    if (!name) return null;
    
    // Handle default personality
    if (name.toLowerCase() === "aphrodite") {
        return { ...getDefault(), id: -1 };
    }

    const dbToUse = database || db;
    try {
        let personality = await dbToUse.personalities.where('name').equalsIgnoreCase(name).first();
        return personality || null;
    } catch (error) {
        console.error(`Error finding personality by name: ${name}`, error);
        return null;
    }
}

export async function getAll() {
    const personalities = await db.personalities.toArray();
    if (!personalities) {
        return [];
    };
    return personalities;
}

export async function remove(id) {
    if (!id || id == -1) { // Prevent deletion of invalid IDs or the special Aphrodite ID
        console.warn(`Attempted to remove invalid or protected personality ID: ${id}`);
        return;
    }
    
    console.log(`Initiating deletion for Personality ID: ${id}...`);

    try {
        // 1. Revoke the object URL for the personality's image if one exists
        if (personalityImageUrls.has(id)) {
            URL.revokeObjectURL(personalityImageUrls.get(id));
            personalityImageUrls.delete(id);
            console.log(`Revoked object URL for personality ID: ${id}`);
        }

        // 2. Perform cascading deletion: Characters -> States -> Assets
        const characters = await db.characters.where('personalityId').equals(id).toArray();
        for (const char of characters) {
            console.log(`  Deleting Character: ${char.name} (ID: ${char.id})`);

            const states = await db.states.where('characterId').equals(char.id).toArray();
            for (const state of states) {
                console.log(`    Deleting State: ${state.name} (ID: ${state.id})`);
                await assetManagerService.deleteAssetsByStateId(state.id); // Delete assets in each state
            }
            await db.states.where('characterId').equals(char.id).delete(); // Delete states themselves
            
            // Delete any assets directly linked to this character (for robustness, if any exist outside states)
            await assetManagerService.deleteAssetsByCharacterId(char.id);
        }
        await db.characters.where('personalityId').equals(id).delete(); // Delete characters themselves

        // Delete any assets directly linked to this personality (for robustness, if any exist outside char/states)
        await assetManagerService.deleteAssetsByPersonalityId(id);
        console.log(`Completed cascade deletion of associated data for personality ID: ${id}.`);

        // 3. Delete the personality record itself from the database
        await db.personalities.delete(id);
        console.log(`Deleted personality record for ID: ${id}.`);

        // 4. Update UI: Reload personalities to reflect deletion
        loadPersonalities(); // Call the module-level function to reload

        // 5. If the removed personality was the active one, default to Aphrodite
        const settings = settingsService.getSettings();
        if (settings.lastActive && settings.lastActive.personalityId === id) { 
            const defaultPersonalityCard = document.querySelector("#personality--1");
            if (defaultPersonalityCard) {
                const defaultRadioButton = defaultPersonalityCard.querySelector("input[type=\"radio\"]");
                if (defaultRadioButton) {
                    defaultRadioButton.click();
                    console.log(`Switched active personality to Aphrodite after deletion.`);
                }
            }
        }
    } catch (error) {
        console.error(`Error deleting personality ID ${id}:`, error);
    }
}

export async function createDraftPersonality() {
    const newPersonalityId = generateUniqueId(); // Generate a string ID for new draft personality
    const newPersonality = new Personality(
        'New Personality (Draft)', 
        '/media/default/images/placeholder.png', 
        'Draft personality being created...'
    );
    // Set a temporary ID for the draft personality before adding to DB
    // This allows us to use it for initial character/state creation before final save
    newPersonality.id = newPersonalityId; 
    
    await db.personalities.add(newPersonality); // Add to DB

    // Automatically create a default character for a new personality
    const defaultCharacterId = generateUniqueId();
    const defaultCharacter = new Character({
        id: defaultCharacterId,
        personalityId: newPersonalityId,
        name: 'Default Character' // Or a more descriptive name, e.g., 'Main Character'
    });
    await db.characters.add(defaultCharacter);
    console.log(`Created default character ${defaultCharacter.name} (ID: ${defaultCharacterId}) for Personality ID: ${newPersonalityId}`);

    // Automatically create a default state for the default character
    const defaultStateId = generateUniqueId();
    const defaultState = new State({
        id: defaultStateId,
        characterId: defaultCharacterId,
        name: 'Default State' // Or 'Normal', 'Idle', etc.
    });
    await db.states.add(defaultState);
    console.log(`Created default state ${defaultState.name} (ID: ${defaultStateId}) for Character ID: ${defaultCharacterId}`);

    // Update the default character to reference its default state
    await db.characters.update(defaultCharacterId, { defaultStateId: defaultStateId });

    console.log(`Created draft personality with ID: ${newPersonalityId} and its default character/state.`);
    return newPersonalityId; // Return the string ID
}

export async function deleteDraftPersonality(id) {
    if (id === null || typeof id === 'undefined' || id == -1) { // Use == for loose comparison
        console.warn('Attempted to delete invalid draft personality ID:', id);
        return;
    }
    console.log(`Deleting draft personality ID: ${id} and its associated data.`);
    // The 'remove' function already handles cascading deletion and URL revocation
    await remove(id);
}

function insert(personality) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    const card = generateCard(personality);
    personalitiesDiv.append(card);
    // Asynchronously load and apply the custom avatar after the card is in the DOM
    loadAndApplyPersonalityAvatar(card, personality);
    return card;
}

export function share(personality) {
    const personalityCopy = { ...personality }
    delete personalityCopy.id
    //export personality to a string
    const personalityString = JSON.stringify(personalityCopy)
    //download
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(personalityString));
    element.setAttribute('download', `${personality.name}.json`);
    element.style.display = 'none';
    //appending the element is required for firefox
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

export function createAddPersonalityCard() {
    const card = document.createElement("div");
    card.classList.add("card-personality", "card-add-personality");
    card.id = "btn-add-personality";
    card.innerHTML = `
        <div class="add-personality-content">
            <span class="material-symbols-outlined add-icon">add</span>
        </div>
    `;
    
    card.addEventListener("click", async () => { // Made async to await createDraftPersonality
        const newPersonalityId = await createDraftPersonality();
        overlayService.showAddPersonalityForm(newPersonalityId); // Pass the ID to the form
    });
    
    return card;
}

export async function removeAll() { // <-- This function was defined twice. Keeping the more robust one.
    console.log('Initiating full database cleanup and reset...');

    if (typeof personalityImageUrls !== 'undefined' && personalityImageUrls instanceof Map) {
        personalityImageUrls.forEach(url => URL.revokeObjectURL(url));
        personalityImageUrls.clear();
        console.log('Revoked all personality image object URLs.');
    } else {
        console.warn('personalityImageUrls not found or not a Map. Skipping URL revocation.');
    }

    const allPersonalities = await db.personalities.toArray();

    for (const p of allPersonalities) {
        if (p.id == -1) { 
            console.log(`Skipping deletion for special personality: ${p.name} (ID: ${p.id}).`);
            continue;
        }

        console.log(`Processing deletion for Personality: ${p.name} (ID: ${p.id}).`);

        const characters = await db.characters.where('personalityId').equals(p.id).toArray();
        for (const char of characters) {
            console.log(`  Deleting Character: ${char.name} (ID: ${char.id})`);

            const states = await db.states.where('characterId').equals(char.id).toArray();
            for (const state of states) {
                console.log(`    Deleting State: ${state.name} (ID: ${state.id})`);
                await assetManagerService.deleteAssetsByStateId(state.id);
            }
            await db.states.where('characterId').equals(char.id).delete();
            
            await assetManagerService.deleteAssetsByCharacterId(char.id);
        }
        await db.characters.where('personalityId').equals(p.id).delete();

        await assetManagerService.deleteAssetsByPersonalityId(p.id);
    }
    console.log('Completed cascade deletion for all user-created personalities and their data.');

    await db.personalities.clear(); 
    console.log('Cleared all personality records from database.');

    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    if (personalitiesDiv) {
        personalitiesDiv.innerHTML = ''; 
    }
    console.log('Cleared personality cards from UI.');

    const defaultPersonality = { ...getDefault(), id: -1 };
    const defaultPersonalityCard = insert(defaultPersonality); 
    console.log('Re-added default Aphrodite personality.');

    if (defaultPersonalityCard) {
        const defaultRadioButton = defaultPersonalityCard.querySelector('input[type="radio"]');
        if (defaultRadioButton) {
            defaultRadioButton.click();
        }
    }

    const createCard = createAddPersonalityCard();
    if (personalitiesDiv) {
        personalitiesDiv.appendChild(createCard);
    }
    console.log('Re-added "Create New" personality card.');

    console.log('Full database cleanup and reset complete!');
}

export async function add(personality) {
    // This 'add' function is typically used when a personality is finalized from a draft.
    // However, our new workflow creates a draft with ID first, then edits.
    // This function's use might change, but for now, it's just a DB add.
    const id = await db.personalities.add(personality);
    const newPersonalityWithId = { id: id, ...personality };
    const newCard = insert(newPersonalityWithId);
    
    if (newCard) {
        newCard.querySelector('input').click();
    }

    // Ensure the 'Add New' card is always at the end
    const addCard = document.querySelector("#btn-add-personality");
    if (addCard) {
        document.querySelector("#personalitiesDiv").appendChild(addCard);
    }
    return id;
}

export async function edit(id, personality) {
    const element = document.querySelector(`#personality-${id}`);
    const input = element.querySelector("input");

    await db.personalities.update(id, personality);

    const updatedPersonality = { id, ...personality };
    const newCard = generateCard(updatedPersonality);
    element.replaceWith(newCard);

    await loadAndApplyPersonalityAvatar(newCard, updatedPersonality);

    if (input.checked) {
        newCard.querySelector("input").click();
    }
}

export function generateCard(personality) {
    const card = document.createElement("label");
    card.classList.add("card-personality");
    if (personality.id !== undefined && personality.id !== null) {
        card.id = `personality-${personality.id}`;
    }
    card.innerHTML = `
            <img class="background-img" src="${personality.image}" data-personality-id="${personality.id}"></img>
            <input  type="radio" name="personality" value="${personality.name}">
            <div class="btn-array-personalityactions">
                ${(personality.id !== undefined && personality.id !== null && personality.id !== -1) ? `<button class="btn-textual btn-edit-card material-symbols-outlined" 
                    id="btn-edit-personality-${personality.name}" title="Edit Personality">edit</button>` : ''}
                ${(personality.id !== undefined && personality.id !== null && personality.id !== -1) ? `<button class="btn-textual btn-media-library-card material-symbols-outlined" 
                    id="btn-media-library-${personality.name}" title="Media Library">perm_media</button>` : ''}
                <button class="btn-textual btn-share-card material-symbols-outlined" 
                    id="btn-share-personality-${personality.name}" title="Share Personality">share</button>
                ${(personality.id !== undefined && personality.id !== null && personality.id !== -1) ? `<button class="btn-textual btn-delete-card material-symbols-outlined"
                    id="btn-delete-personality-${personality.name}" title="Delete Personality">delete</button>` : ''}
            </div>
            <div class="personality-info">
                <h3 class="personality-title">${personality.name}</h3>
                <p class="personality-description">${personality.description}</p>
            </div>
            `;

    const handleButtonClick = (event, action) => {
        event.preventDefault();
        event.stopPropagation();
        action();
    };

    const shareButton = card.querySelector(".btn-share-card");
    const deleteButton = card.querySelector(".btn-delete-card");
    const editButton = card.querySelector(".btn-edit-card");
    const mediaLibraryButton = card.querySelector(".btn-media-library-card"); 
    const input = card.querySelector("input");

    input.addEventListener("change", () => {
        settingsService.setActivePersonalityId(personality.id);
    });

    if (shareButton) {
        shareButton.addEventListener("click", (event) => {
            handleButtonClick(event, () => share(personality));
        });
    }
    if (deleteButton) {
        deleteButton.addEventListener("click", (event) => {
            handleButtonClick(event, () => {
                if (personality.id !== undefined && personality.id !== null) {
                    remove(personality.id);
                    card.remove(); // Remove the card from the DOM
                }
            });
        });
    }
    if (editButton) {
        editButton.addEventListener("click", (event) => {
            handleButtonClick(event, () => overlayService.showEditPersonalityForm(personality.id)); // Pass ID, not full object
        });
    }
    if (mediaLibraryButton) {
        mediaLibraryButton.addEventListener("click", (event) => {
            handleButtonClick(event, () => {
                // Pass the personality ID to the form, which will then handle character/state selection
                overlayService.showEditPersonalityForm(personality.id); 
                // The automatic clicks for the stepper should now be handled by the form component itself
                // as it's passed the personality ID.
            });
        });
    }
    return card;
}

async function loadAndApplyPersonalityAvatar(cardElement, personality) {
    const imgElement = cardElement.querySelector('.background-img');
    if (!imgElement || !personality || typeof personality.id === 'undefined' || personality.id === null) return;

    if (personalityImageUrls.has(personality.id)) {
        URL.revokeObjectURL(personalityImageUrls.get(personality.id));
        personalityImageUrls.delete(personality.id);
    }

    try {
        let avatarUrl = null;
        if (personality.id !== -1) {
            // Find the default character for this personality
            const defaultCharacter = await db.characters.where('personalityId').equals(personality.id).first();
            if (defaultCharacter && defaultCharacter.defaultStateId) {
                // Find the default state for this character
                const defaultState = await db.states.get(defaultCharacter.defaultStateId);
                if (defaultState) {
                    // Now use the correct personalityId, defaultCharacterId, defaultStateId for lookup
                    avatarUrl = await assetManagerService.getAssetUrlByTypeAndValue(
                        personality.id, 
                        defaultCharacter.id, 
                        defaultState.id, 
                        'avatar', 
                        personality.name.toLowerCase() // Assuming personality name is a default avatar value
                    );
                }
            }
        }
       
        if (avatarUrl) {
            imgElement.src = avatarUrl;
            personalityImageUrls.set(personality.id, avatarUrl);
        } else {
            imgElement.src = personality.image; // Fallback to hardcoded URL
        }
    } catch (error) {
        console.error(`Error loading avatar for ${personality.name}:`, error);
        imgElement.src = personality.image; // Fallback on error
    }
}

// Helper to reload personalities in the UI
function loadPersonalities() {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    if (personalitiesDiv) {
        personalitiesDiv.innerHTML = ''; // Clear current display
        initialize(); // Re-initialize to redraw all cards
    }
}