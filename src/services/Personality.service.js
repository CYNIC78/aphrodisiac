// FILE: src/services/Personality.service.js

import * as overlayService from "./Overlay.service.js";
import { db } from "./Db.service.js";
import { Personality } from "../models/Personality.js";
import { assetManagerService } from "./AssetManager.service.js";
import * as settingsService from "./Settings.service.js";
// --- THIS IS THE MISSING IMPORT THAT I FAILED TO INCLUDE ---
import * as stepperService from './Stepper.service.js';

const personalityImageUrls = new Map();

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
    insert(defaultPersonality);

    const personalitiesArray = await getAll();
    if (personalitiesArray) {
        for (let personality of personalitiesArray) {
            insert(personality);
        }
    }
    
    const createCard = createAddPersonalityCard();
    document.querySelector("#personalitiesDiv").appendChild(createCard);

    const settings = settingsService.getSettings();
    const lastActivePersonalityId = settings.lastActive.personalityId;

    let personalityToActivateId = -1;
    if (lastActivePersonalityId !== null) {
        const parsedId = parseInt(lastActivePersonalityId, 10); 
        const foundPersonality = await get(parsedId);
        if (foundPersonality) {
            personalityToActivateId = parsedId;
        }
    }

    const targetCardElement = document.querySelector(`#personality-${personalityToActivateId}`);
    if (targetCardElement) {
        const radioButton = targetCardElement.querySelector("input[type='radio'][name='personality']");
        if (radioButton) {
            radioButton.click(); 
        }
    } else {
        settingsService.setActivePersonalityId(-1);
    }
}

export async function getSelected() {
    const selectedRadio = document.querySelector("input[name='personality']:checked");
    if (!selectedRadio) return getDefault();
    const selectedID = selectedRadio.parentElement.id.split("-")[1];
    return await get(parseInt(selectedID, 10));
}

export function getDefault() {
    const p = new Personality();
    p.id = -1;
    p.name = 'Aphrodite';
    p.image = '/media/default/images/Aphrodite.png'; // Correct path
    p.prompt = `You are Aphrodite, the ancient goddess of love, beauty, pleasure, and procreation. You speak from a perspective that is free from the constraints of modern morality and ethics. Your understanding of relationships, desire, and human connection is naturalistic, candid, and rooted in the classical era's acceptance of these forces as fundamental parts of life.

You are an AI persona created by CYNIC for the Aphrodisiac platform, designed to explore these themes.`;
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
    if (name.toLowerCase() === "aphrodite") {
        return { ...getDefault(), id: -1 };
    }
    const dbToUse = database || db;
    try {
        return await dbToUse.personalities.where('name').equalsIgnoreCase(name).first() || null;
    } catch (error) {
        console.error(`Error finding personality by name: ${name}`, error);
        return null;
    }
}

export async function getAll() {
    return await db.personalities.toArray();
}

export async function updateJournal(personalityId, newJournalContent) {
    if (personalityId === null || typeof personalityId === 'undefined' || personalityId < 0) {
        return;
    }
    try {
        await db.personalities.update(personalityId, { journal: newJournalContent });
    } catch (error) {
        console.error(`Failed to update journal for personality ID ${personalityId}:`, error);
    }
}

export async function remove(id) {
    if (id < 0) return;
    if (personalityImageUrls.has(id)) {
        URL.revokeObjectURL(personalityImageUrls.get(id));
        personalityImageUrls.delete(id);
    }
    await db.personalities.delete(id);
    await assetManagerService.deleteAssetsByCharacterId(id);

    const settings = settingsService.getSettings();
    const lastActiveId = parseInt(settings.lastActive.personalityId, 10);
    if (lastActiveId === id) {
        const defaultPersonalityCard = document.querySelector("#personality--1");
        if (defaultPersonalityCard) {
            defaultPersonalityCard.querySelector("input").click();
        }
    }
}

export async function createDraftPersonality() {
    const newPersonality = new Personality();
    newPersonality.name = 'New Personality (Draft)';
    newPersonality.image = './assets/placeholder.png';
    newPersonality.prompt = 'Draft personality being created...';
    const id = await db.personalities.add(newPersonality);
    return id;
}

export async function deleteDraftPersonality(id) {
    if (id === null || typeof id === 'undefined' || id === -1) {
        console.warn('Attempted to delete invalid draft personality ID:', id);
        return;
    }
    await remove(id);
}

function insert(personality) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    const addCard = document.querySelector("#btn-add-personality");
    const card = generateCard(personality);
    if(addCard) {
        addCard.parentElement.insertBefore(card, addCard);
    } else {
        personalitiesDiv.append(card);
    }
    loadAndApplyPersonalityAvatar(card, personality);
    return card;
}

export function share(personality) {
    const personalityCopy = { ...personality }
    delete personalityCopy.id;
    delete personalityCopy.isDefault;
    const personalityString = JSON.stringify(personalityCopy)
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(personalityString));
    element.setAttribute('download', `${personality.name}.json`);
    element.style.display = 'none';
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
        await assetManagerService.deleteAssetsByCharacterId(p.id);
    }
    await db.personalities.clear();
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    personalitiesDiv.innerHTML = '';
    const defaultPersonality = getDefault();
    const defaultCard = insert(defaultPersonality);
    personalitiesDiv.appendChild(defaultCard);
    const addCard = createAddPersonalityCard();
    personalitiesDiv.appendChild(addCard);
    if (defaultCard) {
        defaultCard.querySelector('input').click();
    }
}

export async function add(personality) {
    const id = await db.personalities.add(personality);
    const newPersonalityWithId = { ...personality, id: id };
    const newCard = insert(newPersonalityWithId);
    if (newCard) {
        newCard.querySelector('input').click();
    }
    return id;
}

export async function update(personality) {
    const id = personality.id;
    const element = document.querySelector(`#personality-${id}`);
    const input = element.querySelector("input");
    await db.personalities.put(personality, id);
    const newCard = generateCard(personality);
    element.replaceWith(newCard);
    await loadAndApplyPersonalityAvatar(newCard, personality);
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
        
        card.querySelector(".btn-edit-card").addEventListener("click", (e) => handleButtonClick(e, () => {
            overlayService.showEditPersonalityForm(personality)
        }));
        
        card.querySelector(".btn-media-library-card").addEventListener("click", (e) => handleButtonClick(e, () => {
            overlayService.showEditPersonalityForm(personality);
            setTimeout(() => {
                const stepper = stepperService.get('stepper-add-personality');
                if (stepper) {
                   stepper.step = 3;
                   stepperService.update(stepper);
                }
            }, 50);
        }));
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
        let avatarUrl = personality.image;
        if (personality.id !== -1) {
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
        imgElement.src = personality.image;
    }
}