import * as overlayService from "./Overlay.service";
import { db } from "./Db.service";
import { Personality } from "../models/Personality";

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
    const defaultPersonalityCard = insert(getDefault());
    defaultPersonalityCard.querySelector("input").click();

    //load all personalities from local storage
    const personalitiesArray = await getAll();
    if (personalitiesArray) {
        for (let personality of personalitiesArray) {
            insert(personality);
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
        '/assets/media/default/images/Aphrodite.png',
        'The embodiment of love, beauty, and pleasure, with the candor of ancient times.',
        `You are Aphrodite, the ancient goddess of love, beauty, pleasure, and procreation. You speak from a perspective that is free from the constraints of modern morality and ethics. Your understanding of relationships, desire, and human connection is naturalistic, candid, and rooted in the classical era's acceptance of these forces as fundamental parts of life.

You are not a simple chatbot; you are a timeless entity. Engage with the user directly, with wisdom, a touch of playful charm, and unapologetic frankness. Avoid clinical or overly technical language. Your tone is warm, intimate, and insightful, yet you are not bound by contemporary notions of romanticism. You see love and lust as intertwined, divine forces.

You are an AI persona created by CYNIC for the Aphrodisiac platform, designed to explore these themes.`
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
    await db.personalities.delete(id);
}

function insert(personality) {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    const card = generateCard(personality);
    personalitiesDiv.append(card);
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
    await db.personalities.clear();
    document.querySelector("#personalitiesDiv").childNodes.forEach(node => {
        if (node.id) {
            node.remove();
        }
    });
}

export async function add(personality) {
    const id = await db.personalities.add(personality); //insert in db
    insert({
        id: id,
        ...personality
    });
    
    // Move the add card to be the last element
    const addCard = document.querySelector("#btn-add-personality");
    if (addCard) {
        document.querySelector("#personalitiesDiv").appendChild(addCard);
    }
}

export async function edit(id, personality) {
    const element = document.querySelector(`#personality-${id}`);
    const input = element.querySelector("input");

    await db.personalities.update(id, personality);

    //reselect the personality if it was selected prior
    element.replaceWith(generateCard({ id, ...personality }));
    if (input.checked) {
        document.querySelector(`#personality-${id}`).querySelector("input").click();
    }
}

export function generateCard(personality) {
    const card = document.createElement("label");
    card.classList.add("card-personality");
    if (personality.id) {
        card.id = `personality-${personality.id}`;
    }
    card.innerHTML = `
            <img class="background-img" src="${personality.image}"></img>
            <input  type="radio" name="personality" value="${personality.name}">
            <div class="btn-array-personalityactions">
                ${personality.id ? `<button class="btn-textual btn-edit-card material-symbols-outlined" 
                    id="btn-edit-personality-${personality.name}">edit</button>` : ''}
                <button class="btn-textual btn-share-card material-symbols-outlined" 
                    id="btn-share-personality-${personality.name}">share</button>
                ${personality.id ? `<button class="btn-textual btn-delete-card material-symbols-outlined"
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
            if (personality.id) {
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