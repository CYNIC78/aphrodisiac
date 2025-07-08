// FILE: src/services/Personality.service.js

import * as overlayService from "./Overlay.service";
import { db } from "./Db.service";
import { Personality } from "../models/Personality";
import { assetManagerService } from "./AssetManager.service.js";
// NEW: Import settingsService to get trigger configurations
import * as settingsService from "./Settings.service.js";

// Map to store Object URLs for personality images for proper memory management
const personalityImageUrls = new Map(); // Map<personalityId, objectURL>

// Move the migration logic to a separate function that can be called from main.js
export async function migratePersonalities(database) {
    const chats = await database.chats.toArray();
    if (!chats) return;

    const migratedChats = await Promise.all([...chats].map(async chat => {
        for (const message of chat.content) {
            if (message.personality) {
                const personality = await getByName(message.personality, database);
                if (!personality) {
                    const defaultPersonality = getDefault();
                    message.personalityid = -1;
                    message.personality = defaultPersonality.name;
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
    const defaultPersonality = { ...getDefault(), id: -1 };
    const defaultPersonalityCard = insert(defaultPersonality);
    defaultPersonalityCard.querySelector("input").click();

    const personalitiesArray = await getAll();
    if (personalitiesArray) {
        for (let personality of personalitiesArray) {
            insert(personality);
        }
    }
    
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
        '/media/default/images/Aphrodite.png',
        'The embodiment of love, beauty, and pleasure, with the candor of ancient times.',
        `You are Aphrodite, the ancient goddess of love, beauty, pleasure, and procreation...`, // Truncated for brevity
        0, 0, false, false, '', []
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
    if (name.toLowerCase() === "aphrodite") return { ...getDefault(), id: -1 };

    const dbToUse = database || db;
    try {
        return await dbToUse.personalities.where('name').equalsIgnoreCase(name).first() || null;
    } catch (error) {
        console.error(`Error finding personality by name: ${name}`, error);
        return null;
    }
}

export async function getAll() {
    return await db.personalities.toArray() || [];
}

export async function remove(id) {
    if (id < 0) return;
    if (personalityImageUrls.has(id)) {
        URL.revokeObjectURL(personalityImageUrls.get(id));
        personalityImageUrls.delete(id);
    }
    await db.personalities.delete(id);
    await assetManagerService.deleteAssetsByCharacterId(id);
}

export async function createDraftPersonality() {
    const newPersonality = new Personality('New Personality (Draft)', '/media/default/images/placeholder.png', 'Draft personality...');
    return await db.personalities.add(newPersonality);
}

export async function deleteDraftPersonality(id) {
    if (id === null || typeof id === 'undefined' || id === -1) return;
    await remove(id);
}

function insert(personality) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    const card = generateCard(personality);
    personalitiesDiv.append(card);
    loadAndApplyPersonalityAvatar(card, personality);
    return card;
}

export function share(personality) {
    const personalityCopy = { ...personality };
    delete personalityCopy.id;
    const personalityString = JSON.stringify(personalityCopy);
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(personalityString));
    element.setAttribute('download', `${personality.name}.json`);
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
}

export function createAddPersonalityCard() {
    const card = document.createElement("div");
    card.classList.add("card-personality", "card-add-personality");
    card.id = "btn-add-personality";
    card.innerHTML = `<div class="add-personality-content"><span class="material-symbols-outlined add-icon">add</span></div>`;
    card.addEventListener("click", () => overlayService.showAddPersonalityForm());
    return card;
}

export async function removeAll() {
    personalityImageUrls.forEach(url => URL.revokeObjectURL(url));
    personalityImageUrls.clear();

    const allPersonalities = await db.personalities.toArray();
    for (const p of allPersonalities) {
        if (p.id !== -1) {
            await assetManagerService.deleteAssetsByCharacterId(p.id);
        }
    }

    await db.personalities.clear();
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    if (personalitiesDiv) personalitiesDiv.innerHTML = '';
    
    insert({ ...getDefault(), id: -1 });
    if (personalitiesDiv) personalitiesDiv.appendChild(createAddPersonalityCard());
}

export async function add(personality) {
    const id = await db.personalities.add(personality);
    insert({ id, ...personality });
    const addCard = document.querySelector("#btn-add-personality");
    if (addCard) document.querySelector("#personalitiesDiv").appendChild(addCard);
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
    if (input.checked) document.querySelector(`#personality-${id}`).querySelector("input").click();
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
                ${(personality.id !== -1) ? `<button class="btn-textual btn-edit-card material-symbols-outlined" title="Edit Personality">edit</button>` : ''}
                ${(personality.id !== -1) ? `<button class="btn-textual btn-media-library-card material-symbols-outlined" title="Media Library">perm_media</button>` : ''}
                <button class="btn-textual btn-share-card material-symbols-outlined" title="Share Personality">share</button>
                ${(personality.id !== -1) ? `<button class="btn-textual btn-delete-card material-symbols-outlined" title="Delete Personality">delete</button>` : ''}
            </div>
            <div class="personality-info">
                <h3 class="personality-title">${personality.name}</h3>
                <p class="personality-description">${personality.description}</p>
            </div>`;

    const handleButtonClick = (event, action) => {
        event.preventDefault();
        event.stopPropagation();
        action();
    };

    const editButton = card.querySelector(".btn-edit-card");
    if (editButton) editButton.addEventListener("click", (e) => handleButtonClick(e, () => overlayService.showEditPersonalityForm(personality)));

    const mediaLibraryButton = card.querySelector(".btn-media-library-card");
    if (mediaLibraryButton) mediaLibraryButton.addEventListener("click", (e) => handleButtonClick(e, () => {
        overlayService.showEditPersonalityForm(personality);
        setTimeout(() => {
            const nextBtn = document.querySelector('#btn-stepper-next');
            if (nextBtn) { nextBtn.click(); nextBtn.click(); nextBtn.click(); }
        }, 50);
    }));

    const shareButton = card.querySelector(".btn-share-card");
    if (shareButton) shareButton.addEventListener("click", (e) => handleButtonClick(e, () => share(personality)));

    const deleteButton = card.querySelector(".btn-delete-card");
    if (deleteButton) deleteButton.addEventListener("click", (e) => handleButtonClick(e, () => {
        if (card.querySelector('input').checked) document.querySelector("#personalitiesDiv").firstElementChild.querySelector('input').click();
        remove(personality.id);
        card.remove();
    }));

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
        let avatarUrl = null;
        if (personality.id !== -1) {
             avatarUrl = await assetManagerService.getFirstImageObjectUrlByTags(['avatar', personality.name.toLowerCase()], personality.id);
        }
       
        if (avatarUrl) {
            imgElement.src = avatarUrl;
            personalityImageUrls.set(personality.id, avatarUrl);
        } else {
            imgElement.src = personality.image;
        }
    } catch (error) {
        console.error(`Error loading avatar for ${personality.name}:`, error);
        imgElement.src = personality.image;
    }
}

// --- DEFINITIVE FIX: The command processing logic now lives here, where it belongs. ---
export async function processTriggersForMessage(commandBlock, messageElement, characterId) {
    if (characterId === null) {
        console.warn("Cannot process commands: Invalid characterId.");
        return;
    }

    // This function can now correctly access both settings and assets.
    const settings = settingsService.getSettings();
    const commandRegex = new RegExp(`\\${settings.triggers.symbolStart}(.*?):(.*?)\\${settings.triggers.symbolEnd}`, 'g');
    let match;

    while ((match = commandRegex.exec(commandBlock)) !== null) {
        const command = match[1].trim().toLowerCase();
        const value = match[2].trim();

        switch (command) {
            case 'image':
                try {
                    // It correctly uses the imported assetManagerService instance
                    const asset = await assetManagerService.getAssetByTag(value, 'image', characterId);
                    if (asset && asset.data instanceof Blob) {
                        const objectURL = URL.createObjectURL(asset.data);
                        const pfpElement = messageElement.querySelector('.pfp');
                        if (pfpElement) pfpElement.src = objectURL;
                        
                        const personalityCard = document.querySelector(`#personality-${characterId}`);
                        if(personalityCard) {
                            const cardImg = personalityCard.querySelector('.background-img');
                            if(cardImg) {
                                cardImg.style.opacity = 0;
                                setTimeout(() => {
                                    cardImg.src = objectURL;
                                    cardImg.style.opacity = 1;
                                    // Note: We are not revoking this URL here, as it's needed for display.
                                    // Memory management for these on-the-fly URLs can be a future enhancement.
                                }, 200);
                            }
                        }
                    } else {
                        console.warn(`Image asset with tag "${value}" not found for character ${characterId}.`);
                    }
                } catch (e) { console.error(`Error processing image command:`, e); }
                break;

            case 'audio':
                if (settings.audio.enabled) {
                    try {
                        const asset = await assetManagerService.getAssetByTag(value, 'audio', characterId);
                        if (asset && asset.data instanceof Blob) {
                            const objectURL = URL.createObjectURL(asset.data);
                            const audio = new Audio(objectURL);
                            audio.volume = settings.audio.volume;
                            audio.play().catch(e => console.error("Audio playback failed:", e));
                            audio.onended = () => URL.revokeObjectURL(objectURL); // Clean up memory after playing
                        } else {
                            console.warn(`Audio asset with tag "${value}" not found for character ${characterId}.`);
                        }
                    } catch (e) { console.error(`Error processing audio command:`, e); }
                }
                break;

            default:
                console.warn(`Unknown command: "${command}"`);
        }
    }
}