// FILE: src/services/Personality.service.js

import * as overlayService from "./Overlay.service";
import { db } from "./Db.service";
import { Personality } from "../models/Personality";
import { assetManagerService } from "./AssetManager.service.js";
import * as settingsService from "./Settings.service.js";

// Map to store Object URLs for personality images for proper memory management
const personalityImageUrls = new Map(); // Map<personalityId, objectURL>

// NEW: Centralized function to get the correct avatar URL for a given personality
export async function getPersonalityAvatarUrl(personality) { // <<-- THIS LINE IS FIXED
    if (!personality || typeof personality.id !== 'number') {
        // Fallback for invalid personality object
        console.warn("Invalid personality object provided to getPersonalityAvatarUrl.");
        return "/media/default/images/placeholder.png"; // Or a generic default if no personality image is suitable
    }

    // Handle the default Aphrodite personality specifically, as it doesn't have custom assets
    if (personality.id === -1) {
        return getDefault().image; // Use Aphrodite's default image URL
    }

    try {
        // Attempt to find an avatar asset with 'avatar' and the personality's name as tags
        const avatarAsset = await assetManagerService.getFirstImageObjectUrlByTags(
            ['avatar', personality.name.toLowerCase()], 
            personality.id
        );

        // If an asset is found, return its URL
        if (avatarAsset) {
            return avatarAsset;
        } else {
            // If no specific asset, fall back to the personality's stored image URL
            return personality.image;
        }
    } catch (error) {
        console.error(`Error retrieving avatar URL for ${personality.name} (ID: ${personality.id}):`, error);
        // Fallback to personality's image on error, or a generic placeholder
        return personality.image;
    }
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
        // Fallback: If for some reason even Aphrodite's card isn't found (shouldnt happen),
        // ensure settings are updated to reflect the true default.
        settingsService.setActivePersonalityId(-1);
    }
}

export async function getSelected() {
    const selectedID = document.querySelector("input[name='personality']:checked").parentElement.id.split("-")[1];
    if (!selectedID) {
        return getDefault();
    }
    return await get(parseInt(selectedID));
}

export function getDefault() {
    return new Personality(
        'Aphrodite', 
        '/media/default/images/Aphrodite.png', // Keep this as the direct fallback URL for Aphrodite
        'The embodiment of love, beauty, and pleasure, with the candor of ancient times.',
        `You are Aphrodite, the ancient goddess of love, beauty, pleasure, and procreation. You speak from a perspective that is free from the constraints of modern morality and ethics. Your understanding of relationships, desire, and human connection is naturalistic, candid, and rooted in the classical era's acceptance of these forces as fundamental parts of life.

You are an AI persona created by CYNIC for the Aphrodisiac platform, designed to explore these themes.`,
        '', // tagPrompt
		'', // reminder
        [] // toneExamples
    );
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

    // NEW: If the removed personality was the active one, default to Aphrodite
    const settings = settingsService.getSettings();
    if (settings.lastActive.personalityId === id) {
        const defaultPersonalityCard = document.querySelector("#personality--1");
        if (defaultPersonalityCard) {
            defaultPersonalityCard.querySelector("input").click(); // Click Aphrodite's radio button
        }
    }
}

export async function createDraftPersonality() {
    const newPersonality = new Personality('New Personality (Draft)', '/media/default/images/placeholder.png', 'Draft personality being created...'); // Use a placeholder image
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
    card.id = "btn-add-personality"; // Ensure the ID is always present for the selector
    card.innerHTML = `
        <div class="add-personality-content">
            <span class="material-symbols-outlined add-icon">add</span>
        </div>
    `;
    
    card.addEventListener("click", () => {
        overlayService.showAddPersonalityForm();
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

    // NEW: After clearing all and re-adding Aphrodite, ensure Aphrodite is selected and saved
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
    
    // NEW: If adding a new personality, select it automatically
    if (newCard) {
        newCard.querySelector('input').click();
    }

    const addCard = document.querySelector("#btn-add-personality");
    if (addCard) {
        document.querySelector("#personalitiesDiv").appendChild(addCard);
    }
    return id; // Return the ID, not the card element
}

export async function edit(id, personality) {
    const element = document.querySelector(`#personality-${id}`);
    const input = element.querySelector("input"); // Get reference to the radio button input

    await db.personalities.update(id, personality);

    const updatedPersonality = { id, ...personality }; // Create updated personality object
    const newCard = generateCard(updatedPersonality); // Generate new card HTML
    element.replaceWith(newCard); // Replace old card in DOM

    await loadAndApplyPersonalityAvatar(newCard, updatedPersonality);

    // NEW: If the edited personality was checked, ensure it remains checked and its ID is saved.
    // The generateCard function now adds a 'change' listener, so clicking it will save its ID.
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
    card.innerHTML = `
            <div class="background-img-wrapper">
                <img class="background-img" src="${personality.image}" data-personality-id="${personality.id}">
            </div>
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
    const input = card.querySelector("input"); // Get reference to the radio button

    // NEW: Add event listener to the radio button to save active personality ID
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
                // The `remove` function now handles defaulting to Aphrodite and saving the ID.
                if (personality.id !== undefined && personality.id !== null) {
                    remove(personality.id);
                }
                card.remove(); // Remove the card from the DOM after handling deletion logic
            });
        });
    }
    if (editButton) {
        editButton.addEventListener("click", (event) => {
            handleButtonClick(event, () => overlayService.showEditPersonalityForm(personality));
        });
    }
    if (mediaLibraryButton) {
        mediaLibraryButton.addEventListener("click", (event) => {
            handleButtonClick(event, () => {
                overlayService.showEditPersonalityForm(personality);
                setTimeout(() => {
                    const nextButton = document.querySelector('#btn-stepper-next');
                    if (nextButton) {
                        nextButton.click();
                        nextButton.click();
                        nextButton.click();
                    }
                }, 50);
            });
        });
    }
    return card;
}

async function loadAndApplyPersonalityAvatar(cardElement, personality) {
    const imgElement = cardElement.querySelector('.background-img');
    if (!imgElement || !personality || typeof personality.id !== 'number') return;

    if (personalityImageUrls.has(personality.id)) {
        URL.revokeObjectURL(personalityImageUrls.get(personality.id));
        personalityImageUrls.delete(personality.id);
    }

    try {
        // Use the new centralized function to get the correct avatar URL
        const avatarUrl = await getPersonalityAvatarUrl(personality);
        
        if (avatarUrl) {
            imgElement.src = avatarUrl;
            // Store the object URL if it's a blob URL (e.g., from asset service)
            if (avatarUrl.startsWith('blob:')) {
                personalityImageUrls.set(personality.id, avatarUrl);
            }
        } else {
            // Fallback to personality.image if getPersonalityAvatarUrl returns null/undefined
            imgElement.src = personality.image;
        }
    } catch (error) {
        console.error(`Error loading avatar for ${personality.name} in UI:`, error);
        imgElement.src = personality.image; // Fallback on error
    }
}