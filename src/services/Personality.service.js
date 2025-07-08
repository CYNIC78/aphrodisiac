// FILE: src/services/Personality.service.js

import * as overlayService from "./Overlay.service";
import { db } from "./Db.service";
import { Personality } from "../models/Personality";
import { assetManagerService } from "./AssetManager.service.js";

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
    //default personality setup
    const defaultPersonality = { ...getDefault(), id: -1 }; // Ensure Aphrodite has a -1 ID
    const defaultPersonalityCard = insert(defaultPersonality);
    defaultPersonalityCard.querySelector("input").click();

    //load all personalities from local storage
    const personalitiesArray = await getAll();
    if (personalitiesArray) {
        for (let personality of personalitiesArray) {
            const card = insert(personality);
        }
    }
    
    // Add the "Create New" card at the end
    const createCard = createAddPersonalityCard();
    document.querySelector("#personalitiesDiv").appendChild(createCard);
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
        0, // aggressiveness
        0, // sensuality
        false, // internetEnabled
        false, // roleplayEnabled
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
}

// <-- ADDED: New function to create a barebones personality draft and return its ID
export async function createDraftPersonality() {
    const newPersonality = new Personality('New Personality (Draft)', '/media/default/images/placeholder.png', 'Draft personality being created...'); // Use a placeholder image
    const id = await db.personalities.add(newPersonality);
    console.log(`Created draft personality with ID: ${id}`);
    return id;
}

// <-- ADDED: New function to delete a draft personality and its assets
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

    // CRITICAL FIX HERE: Completely clear and rebuild the #personalitiesDiv UI
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    if (personalitiesDiv) {
        personalitiesDiv.innerHTML = ''; // Clear all existing children nodes
    }
    
    // Re-add default Aphrodite
    const defaultPersonality = { ...getDefault(), id: -1 };
    const defaultPersonalityCard = insert(defaultPersonality);

    // Re-add the "Create New" card
    const createCard = createAddPersonalityCard();
    if (personalitiesDiv) {
        personalitiesDiv.appendChild(createCard);
    }
}

export async function add(personality) {
    const id = await db.personalities.add(personality); // Insert in db
    const newPersonalityWithId = { id: id, ...personality }; // Create full object
    insert(newPersonalityWithId); // Call insert, which will call loadAndApplyPersonalityAvatar and append card
    
    // Move the add card to be the last element
    const addCard = document.querySelector("#btn-add-personality");
    if (addCard) {
        document.querySelector("#personalitiesDiv").appendChild(addCard);
    }
    return id; // Return the ID, not the card element
}

export async function edit(id, personality) {
    const element = document.querySelector(`#personality-${id}`);
    const input = element.querySelector("input");

    await db.personalities.update(id, personality);

    //reselect the personality if it was selected prior
    const updatedPersonality = { id, ...personality }; // Create updated personality object
    const newCard = generateCard(updatedPersonality); // Generate new card HTML
    element.replaceWith(newCard); // Replace old card in DOM

    // Asynchronously load and apply the custom avatar for the updated card
    await loadAndApplyPersonalityAvatar(newCard, updatedPersonality);

    if (input.checked) {
        document.querySelector(`#personality-${id}`).querySelector("input").click();
    }
}

export function generateCard(personality) {
    const card = document.createElement("label");
    card.classList.add("card-personality");
    if (personality.id !== undefined && personality.id !== null) {
        card.id = `personality-${personality.id}`;
    }
    // --- MODIFIED: Added btn-media-library-card ---
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

    // --- MODIFIED: Added logic for the new button and safety improvements for all buttons ---
    const shareButton = card.querySelector(".btn-share-card");
    const deleteButton = card.querySelector(".btn-delete-card");
    const editButton = card.querySelector(".btn-edit-card");
    const mediaLibraryButton = card.querySelector(".btn-media-library-card"); // Get the new button
    const input = card.querySelector("input");

    const handleButtonClick = (event, action) => {
        event.preventDefault();
        event.stopPropagation();
        action();
    };

    if (shareButton) {
        shareButton.addEventListener("click", (event) => {
            handleButtonClick(event, () => share(personality));
        });
    }
    if (deleteButton) {
        deleteButton.addEventListener("click", (event) => {
            handleButtonClick(event, () => {
                if (input.checked) {
                    document.querySelector("#personalitiesDiv").firstElementChild.querySelector('input').click();
                }
                if (personality.id !== undefined && personality.id !== null) {
                    remove(personality.id);
                }
                card.remove();
            });
        });
    }
    if (editButton) {
        editButton.addEventListener("click", (event) => {
            handleButtonClick(event, () => overlayService.showEditPersonalityForm(personality));
        });
    }
    // --- NEW: Event listener for the Media Library shortcut ---
    if (mediaLibraryButton) {
        mediaLibraryButton.addEventListener("click", (event) => {
            handleButtonClick(event, () => {
                // Step 1: Show the form. This also populates it with the correct personality data.
                overlayService.showEditPersonalityForm(personality);
                
                // Step 2: Use a small delay to ensure the overlay and its contents are rendered in the DOM.
                setTimeout(() => {
                    const nextButton = document.querySelector('#btn-stepper-next');
                    if (nextButton) {
                        // Step 3: Programmatically click the 'Next' button three times to navigate to the 4th step.
                        nextButton.click(); // to step 2
                        nextButton.click(); // to step 3
                        nextButton.click(); // to step 4
                    }
                }, 50); // 50ms is a safe delay.
            });
        });
    }
    return card;
}

/**
 * Asynchronously loads and applies a custom avatar for a personality card based on tags.
 * Falls back to a global default avatar, then to the personality's original image URL.
 * Manages Object URLs for memory efficiency.
 * @param {HTMLElement} cardElement - The personality card DOM element.
 * @param {object} personality - The personality object.
 */
async function loadAndApplyPersonalityAvatar(cardElement, personality) {
    const imgElement = cardElement.querySelector('.background-img');
    
    if (!imgElement || !personality || (typeof personality.id !== 'number' && personality.id !== -1)) {
        console.warn('loadAndApplyPersonalityAvatar: Missing required elements or personality data (ID:', personality?.id, 'Name:', personality?.name, ').');
        if (imgElement && personality) {
             imgElement.src = personality.image;
        }
        return;
    }

    if (personalityImageUrls.has(personality.id)) {
        URL.revokeObjectURL(personalityImageUrls.get(personality.id));
        personalityImageUrls.delete(personality.id);
        console.log(`Revoked old object URL for personality ID: ${personality.id}`);
    }

    try {
        let avatarUrl = null;
        
        const characterIdToUse = (typeof personality.id === 'number' && personality.id !== -1) ? personality.id : null;

        if (characterIdToUse !== null) {
             avatarUrl = await assetManagerService.getFirstImageObjectUrlByTags(['avatar', personality.name.toLowerCase()], characterIdToUse);
        }
       
        if (avatarUrl) {
            console.log(`Applied character-specific avatar for ${personality.name} (ID: ${personality.id})`);
        } else {
            console.log(`No character-specific avatar found for ${personality.name}. Falling back to original image URL.`);
            imgElement.src = personality.image;
            return; 
        }
        
        imgElement.src = avatarUrl;
        personalityImageUrls.set(personality.id, avatarUrl);

    } catch (error) {
        console.error(`Error loading avatar for ${personality.name} (ID: ${personality.id}):`, error);
        imgElement.src = personality.image;
    }
}