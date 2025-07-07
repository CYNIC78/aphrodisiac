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
        []
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
    // <-- ADDED: Delete all assets associated with this character
    await assetManagerService.deleteAssetsByCharacterId(id);
    console.log(`Deleted all assets for personality ID: ${id}`);
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

    // <-- MODIFIED: Delete assets for all personalities before clearing personalities table
    // Get all personalities first, then delete their assets by ID
    const allPersonalities = await db.personalities.toArray();
    for (const p of allPersonalities) {
        if (p.id !== -1) { // Don't try to delete assets for the hardcoded Aphrodite ID
            await assetManagerService.deleteAssetsByCharacterId(p.id);
        }
    }
    console.log('Deleted all assets from all personalities (excluding Aphrodite).');

    await db.personalities.clear();
    document.querySelector("#personalitiesDiv").childNodes.forEach(node => {
        if (node.id) {
            node.remove();
        }
    });
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
    return id; // <-- MODIFIED: Return the ID, not the card element
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
    // Ensure the card gets an ID based on personality.id for lookup and event handling
    if (personality.id !== undefined && personality.id !== null) {
        card.id = `personality-${personality.id}`;
    }
    card.innerHTML = `
            <img class="background-img" src="${personality.image}" data-personality-id="${personality.id}"></img>
            <input  type="radio" name="personality" value="${personality.name}">
            <div class="btn-array-personalityactions">
                ${(personality.id !== undefined && personality.id !== null && personality.id !== -1) ? `<button class="btn-textual btn-edit-card material-symbols-outlined" 
                    id="btn-edit-personality-${personality.name}">edit</button>` : ''}
                <button class="btn-textual btn-share-card material-symbols-outlined" 
                    id="btn-share-personality-${personality.name}">share</button>
                ${(personality.id !== undefined && personality.id !== null && personality.id !== -1) ? `<button class="btn-textual btn-delete-card material-symbols-outlined"
                    id="btn-delete-personality-${personality.name}">delete</button>` : ''}
            </div>
            <div class="personality-info">
                <h3 class="personality-title">${personality.name}</h3>
                <p class="personality-description">${personality.description}</p>
            </div>
            `;

    // Add event listeners
    const shareButton = card.querySelector(".btn-share-card");
    const deleteButton = card.querySelector(".btn-delete-card");
    const editButton = card.querySelector(".btn-edit-card");
    const input = card.querySelector("input");

    shareButton.addEventListener("click", () => {
        share(personality);
    });
    if (deleteButton) {
        deleteButton.addEventListener("click", () => {
            //first if the personality to delete is the one currently selected, we select the default personality
            if (input.checked) {
                document.querySelector("#personalitiesDiv").firstElementChild.querySelector('input').click();
            }
            if (personality.id !== undefined && personality.id !== null) {
                remove(personality.id);
            }
            card.remove();
        });
    }
    if (editButton) {
        editButton.addEventListener("click", () => {
            overlayService.showEditPersonalityForm(personality);
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
    
    // Ensure personality.id is a valid number (including -1 for Aphrodite)
    if (!imgElement || !personality || (typeof personality.id !== 'number' && personality.id !== -1)) {
        console.warn('loadAndApplyPersonalityAvatar: Missing required elements or personality data (ID:', personality?.id, 'Name:', personality?.name, ').');
        // Ensure image still displays something in case of warnings if it was trying to load a custom avatar
        if (imgElement && personality) {
             imgElement.src = personality.image; // Fallback to personality's original image
        }
        return;
    }

    // Revoke old URL if it exists for this personality to prevent memory leaks
    if (personalityImageUrls.has(personality.id)) {
        URL.revokeObjectURL(personalityImageUrls.get(personality.id));
        personalityImageUrls.delete(personality.id);
        console.log(`Revoked old object URL for personality ID: ${personality.id}`);
    }

    try {
        let avatarUrl = null;
        
        // Ensure characterId is valid before making service calls
        const characterIdToUse = personality.id === -1 ? null : personality.id;

        // Priority 1: Character-specific avatar (e.g., ['avatar', 'test'])
        if (characterIdToUse !== null) {
             avatarUrl = await assetManagerService.getFirstImageObjectUrlByTags(['avatar', personality.name.toLowerCase()], characterIdToUse);
        }
       
        if (avatarUrl) {
            console.log(`Applied character-specific avatar for ${personality.name} (ID: ${personality.id})`);
        } else {
            // Priority 2: Global default avatar (e.g., ['default-avatar'])
            // Only search for global default if there's no character-specific and it's not Aphrodite
            if (characterIdToUse !== null) { // Only attempt global default if it's a personality that *could* have assets
                // For a 'global default' asset within a per-character system, it would need to be assigned to a
                // special 'global' character ID (e.g., 0 or a fixed negative ID like -2, excluding -1 for Aphrodite).
                // If we want a global fallback, we will need a designated 'global asset' character ID.
                // For now, if no character-specific avatar, fallback to the personality's original image.
                console.log(`No character-specific avatar found for ${personality.name}.`); // Log for clarity
            }
            imgElement.src = personality.image;
            console.log(`Falling back to original image URL for ${personality.name}.`);
            return; // Exit early if we're using the original image URL
        }
        
        // If an avatarUrl was found (character-specific)
        imgElement.src = avatarUrl;
        personalityImageUrls.set(personality.id, avatarUrl); // Store the new URL for future revocation

    } catch (error) {
        console.error(`Error loading avatar for ${personality.name} (ID: ${personality.id}):`, error);
        // Ensure fallback to original image in case of any error during asset loading
        imgElement.src = personality.image;
    }
}