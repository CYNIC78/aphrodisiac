// FILE: src/services/Personality.service.js

import * as overlayService from "./Overlay.service.js"; // Corrected casing
import { db } from "./Db.service.js";
import { Personality } from "../models/Personality.js";
import { assetManagerService } from "./AssetManager.service.js";
import * as settingsService from "./Settings.service.js"; // NEW: Import settings service

// Map to store Object URLs for personality images for proper memory management
const personalityImageUrls = new Map(); // Map<personalityId, objectURL>

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
            }
            else {
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
    insert(defaultPersonality); // This adds the card to DOM, but we won't click its radio button yet.

    // 2. Load and insert all other personalities from DB
    const personalitiesArray = await getAll();
    if (personalitiesArray) {
        for (let personality of personalitiesArray) {
            insert(personality); // This inserts and attaches listeners
        }
    }
    
    // 3. Add the "Create New" card at the end
    const createCard = createAddPersonalityCard();
    document.querySelector("#personalitiesDiv").appendChild(createCard);

    // 4. Determine which personality should be initially selected based on settings
    const settings = settingsService.getSettings();
    const lastActivePersonalityId = settings.lastActive.personalityId;

    let personalityToActivateId = -1; // Default to Aphrodite's ID
    if (lastActivePersonalityId !== null) {
        // NEW FIX: Convert the string ID from localStorage back to a number
        const parsedId = parseInt(lastActivePersonalityId, 10); 
        const foundPersonality = await get(parsedId); // Use the parsed number ID
        if (foundPersonality) {
            personalityToActivateId = parsedId; // Use the parsed ID
        } else {
            console.warn(`Last active personality with ID ${lastActivePersonalityId} not found. Defaulting to Aphrodite.`);
            // If not found, personalityToActivateId remains -1 (Aphrodite)
        }
    }

    // 5. Physically click the radio button of the target personality
    // This will trigger the 'change' event listener we add in generateCard and save to settings.
    const targetCardElement = document.querySelector(`#personality-${personalityToActivateId}`);
    if (targetCardElement) {
        const radioButton = targetCardElement.querySelector("input[type='radio'][name='personality']");
        if (radioButton) {
            radioButton.click(); 
        }
    } else {
        // Fallback: If for some reason even Aphrodite's card isn't found (shouldn't happen),
        // ensure settings are updated to reflect the true default.
        settingsService.setActivePersonalityId(-1);
    }
}

export async function getSelected() {
    const selectedRadio = document.querySelector("input[name='personality']:checked");
    if (!selectedRadio) return getDefault();
    const selectedID = selectedRadio.parentElement.id.split("-")[1];
    if (!selectedID) {
        return getDefault();
    }
    return await get(parseInt(selectedID, 10));
}

export function getDefault() {
    const p = new Personality();
    p.id = -1;
    p.name = 'Aphrodite';
    p.image = './assets/aphrodite.png';
    p.prompt = `You are Aphrodite, the ancient goddess of love, beauty, pleasure, and procreation. You speak from a perspective that is free from the constraints of modern morality and ethics. Your understanding of relationships, desire, and human connection is naturalistic, candid, and rooted in the classical era's acceptance of these forces as fundamental parts of life.

You are an AI persona created by CYNIC for the Aphrodisiac platform, designed to explore these themes.`;
    // The default Personality constructor will set other fields like tagPrompt, journalPrompt etc.
    p.isDefault = true;
    return p;
}

export async function get(id) {
    if (id < 0) {
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
        // First try exact match
        let personality = await dbToUse.personalities.where('name').equalsIgnoreCase(name).first();
        
        // Debug logging
        console.log('Searching for personality:', name);
        console.log('Found personality:', personality);

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

// --- NEW FUNCTION ---
// This function is called by Message.service.js to update the AI's private journal.
export async function updateJournal(personalityId, newJournalContent) {
    // Check for invalid or default personality ID. We don't update the default Aphrodite.
    if (personalityId === null || typeof personalityId === 'undefined' || personalityId < 0) {
        return;
    }

    try {
        // Use Dexie's efficient .update() method to modify only the 'journal' field.
        const updateCount = await db.personalities.update(personalityId, { journal: newJournalContent });
        if (updateCount > 0) {
             console.log(`Journal updated for personality ID: ${personalityId}`);
        }
    } catch (error) {
        console.error(`Failed to update journal for personality ID ${personalityId}:`, error);
    }
}
// --- END NEW FUNCTION ---

export async function remove(id) {
    if (id < 0) {
        return;
    }
    // Revoke the object URL for the personality being removed
    if (personalityImageUrls.has(id)) {
        URL.revokeObjectURL(personalityImageUrls.get(id));
        personalityImageUrls.delete(id);
        console.log(`Revoked object URL for personality ID: ${id}`);
    }
    await db.personalities.delete(id);
    // Delete all assets associated with this character
    await assetManagerService.deleteAssetsByCharacterId(id);
    console.log(`Deleted all assets for personality ID: ${id}`);

    // If the removed personality was the active one, default to Aphrodite
    const settings = settingsService.getSettings();
    const lastActiveId = parseInt(settings.lastActive.personalityId, 10);
    if (lastActiveId === id) {
        const defaultPersonalityCard = document.querySelector("#personality--1");
        if (defaultPersonalityCard) {
            defaultPersonalityCard.querySelector("input").click(); // Click Aphrodite's radio button
        }
    }
}

export async function createDraftPersonality() {
    const newPersonality = new Personality();
    newPersonality.name = 'New Personality (Draft)';
    newPersonality.image = './assets/placeholder.png';
    newPersonality.prompt = 'Draft personality being created...';
    const id = await db.personalities.add(newPersonality);
    console.log(`Created draft personality with ID: ${id}`);
    return id;
}

export async function deleteDraftPersonality(id) {
    if (id === null || typeof id === 'undefined' || id === -1) { // Prevent deleting Aphrodite or invalid IDs
        console.warn('Attempted to delete invalid draft personality ID:', id);
        return;
    }
    console.log(`Deleting draft personality ID: ${id} and its assets.`);
    // The existing 'remove' function already handles asset deletion and URL revocation
    await remove(id);
}

function insert(personality) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    const addCard = document.querySelector("#btn-add-personality");
    const card = generateCard(personality);
    // Insert the new card before the "add" button if it exists
    if(addCard) {
        addCard.parentElement.insertBefore(card, addCard);
    } else {
        personalitiesDiv.append(card);
    }
    // Asynchronously load and apply the custom avatar after the card is in the DOM
    loadAndApplyPersonalityAvatar(card, personality);
    return card;
}

export function share(personality) {
    const personalityCopy = { ...personality }
    delete personalityCopy.id;
    delete personalityCopy.isDefault; // Also remove the isDefault flag
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
    card.id = "btn-add-personality"; // Ensure the ID is always present for the selector
    card.innerHTML = `
        <div class="add-personality-content">
            <span class="material-symbols-outlined add-icon">add</span>
        </div>
    `;
    
    card.addEventListener("click", () => {
        overlayService.default.showAddPersonalityForm();
    });
    
    return card;
}

export async function removeAll() {
    // Revoke all existing object URLs before clearing database and UI
    personalityImageUrls.forEach(url => URL.revokeObjectURL(url));
    personalityImageUrls.clear();
    console.log('Revoked all personality image object URLs.');

    // Delete assets for all personalities before clearing personalities table
    const allPersonalities = await db.personalities.toArray();
    for (const p of allPersonalities) {
        if (p.id !== -1) { // Don't try to delete assets for the hardcoded Aphrodite ID
            await assetManagerService.deleteAssetsByCharacterId(p.id);
        }
    }
    console.log('Deleted all assets from all personalities (excluding Aphrodite).');

    await db.personalities.clear(); // Clear personality records from DB

    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    if (personalitiesDiv) {
        personalitiesDiv.innerHTML = ''; // Clear all existing children nodes
    }
    
    // Re-add default Aphrodite
    const defaultPersonality = { ...getDefault(), id: -1 };
    const defaultPersonalityCard = insert(defaultPersonality);

    // After clearing all and re-adding Aphrodite, ensure Aphrodite is selected and saved
    if (defaultPersonalityCard) {
        defaultPersonalityCard.querySelector('input').click();
    }

    // Re-add the "Create New" card
    const createCard = createAddPersonalityCard();
    if (personalitiesDiv) {
        personalitiesDiv.appendChild(createCard);
    }
}

export async function add(personality) {
    const id = await db.personalities.add(personality); // Insert in db
    const newPersonalityWithId = { id: id, ...personality }; // Create full object
    const newCard = insert(newPersonalityWithId); // Call insert, which will call loadAndApplyPersonalityAvatar and append card
    
    // If adding a new personality, select it automatically
    if (newCard) {
        newCard.querySelector('input').click();
    }
    
    return id; // Return the ID
}

// RENAMED and ALIGNED with the calling component (AddPersonalityForm.component.js)
export async function update(personality) {
    const id = personality.id;
    const element = document.querySelector(`#personality-${id}`);
    const input = element.querySelector("input"); // Get reference to the radio button input

    // Using `put` is the correct Dexie method to fully replace an object by its ID.
    await db.personalities.put(personality, id);

    const newCard = generateCard(personality); // Generate new card HTML
    element.replaceWith(newCard); // Replace old card in DOM

    await loadAndApplyPersonalityAvatar(newCard, personality);

    // If the edited personality was checked, ensure it remains checked and its ID is saved.
    if (input.checked) { // Check the state of the *original* input element before it was replaced
        newCard.querySelector("input").click(); // Click the new card's radio button
    }
}

export function generateCard(personality) {
    const card = document.createElement("label");
    card.classList.add("card-personality");
    if (personality.id !== undefined && personality.id !== null) {
        card.id = `personality-${personality.id}`;
    }

    const isDefaultAphrodite = personality.id === -1;

    card.innerHTML = `
            <div class="background-img-wrapper">
                <img class="background-img" src="${personality.image || './assets/placeholder.png'}" data-personality-id="${personality.id}">
            </div>
            <input  type="radio" name="personality" value="${personality.name}">
            <div class="btn-array-personalityactions">
                ${!isDefaultAphrodite ? `<button class="btn-textual btn-edit-card material-symbols-outlined" title="Edit Personality">edit</button>` : ''}
                ${!isDefaultAphrodite ? `<button class="btn-textual btn-media-library-card material-symbols-outlined" title="Media Library">perm_media</button>` : ''}
                <button class="btn-textual btn-share-card material-symbols-outlined" title="Share Personality">share</button>
                ${!isDefaultAphrodite ? `<button class="btn-textual btn-delete-card material-symbols-outlined" title="Delete Personality">delete</button>` : ''}
            </div>
            <div class="personality-info">
                <h3 class="personality-title">${personality.name}</h3>
                <p class="personality-description">${personality.prompt.substring(0, 75)}...</p>
            </div>
            `;

    const handleButtonClick = (event, action) => {
        event.preventDefault();
        event.stopPropagation();
        action();
    };

    const input = card.querySelector("input");

    input.addEventListener("change", () => {
        if(input.checked) {
            settingsService.setActivePersonalityId(personality.id);
        }
    });

    const shareButton = card.querySelector(".btn-share-card");
    if (shareButton) shareButton.addEventListener("click", (e) => handleButtonClick(e, () => share(personality)));
    
    if (!isDefaultAphrodite) {
        card.querySelector(".btn-delete-card").addEventListener("click", (e) => handleButtonClick(e, () => {
            if (confirm(`Are you sure you want to delete ${personality.name}? This cannot be undone.`)) {
                remove(personality.id).then(() => card.remove());
            }
        }));
        card.querySelector(".btn-edit-card").addEventListener("click", (e) => handleButtonClick(e, () => overlayService.default.showEditPersonalityForm(personality)));
        card.querySelector(".btn-media-library-card").addEventListener("click", (e) => handleButtonClick(e, () => {
            overlayService.default.showEditPersonalityForm(personality);
            setTimeout(() => {
                // Navigate to the asset manager step
                const stepper = document.querySelector('.stepper-container[data-stepper-id="personality-form-stepper"]');
                if (stepper) {
                   const stepButtons = stepper.querySelectorAll('[data-step-target]');
                   if(stepButtons.length > 3) stepButtons[3].click();
                }
            }, 50);
        }));
    }
    
    return card;
}

async function loadAndApplyPersonalityAvatar(cardElement, personality) {
    const imgElement = cardElement.querySelector('.background-img');
    if (!imgElement || !personality || typeof personality.id !== 'number') return;

    // Revoke previous URL if one exists for this personality to prevent memory leaks
    if (personalityImageUrls.has(personality.id)) {
        URL.revokeObjectURL(personalityImageUrls.get(personality.id));
        personalityImageUrls.delete(personality.id);
    }

    try {
        let avatarUrl = personality.image; // Default to the stored image URL
        if (personality.id !== -1) { // For custom personalities
            const defaultAvatarUrl = await assetManagerService.getFirstImageObjectUrlByTags(['avatar', 'default'], personality.id);
            if(defaultAvatarUrl) avatarUrl = defaultAvatarUrl;
        }
       
        if (avatarUrl) {
            imgElement.src = avatarUrl;
            if(avatarUrl.startsWith('blob:')) {
                personalityImageUrls.set(personality.id, avatarUrl);
            }
        }
    } catch (error) {
        console.error(`Error loading avatar for ${personality.name}:`, error);
        imgElement.src = personality.image; // Ensure image is set to fallback on error
    }
}