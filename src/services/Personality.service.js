// The db instance will be passed via initialize()
// import { db } from './Db.service.js'; // REMOVED: no longer directly imported
import * as OverlayService from './Overlay.service.js';
import { Personality } from '../models/Personality.js';
import * as chatsService from './Chats.service.js'; // Needed to re-render chat list if personality changes

let _db; // Private variable to hold the db instance

export async function initialize(dbInstance) {
    _db = dbInstance;
    await _db.personalities.count(); // Await to ensure db is open and ready.
    await migratePersonalities(); // Migrate using internal _db reference
    renderPersonalities(); // Render using internal _db reference
}

export async function add(personality) {
    const id = await _db.personalities.add(personality);
    renderPersonalities();
    OverlayService.closeOverlay();
    return id;
}

export async function edit(personality) {
    await _db.personalities.update(personality.id, personality);
    renderPersonalities();
    OverlayService.closeOverlay();
}

export async function remove(id) {
    await _db.personalities.delete(id);
    // If the active chat's personality was deleted, we should update the chat UI
    // (This is a complex edge case, for now just re-render personalities)
    renderPersonalities();
}

export async function getAll() {
    return await _db.personalities.toArray();
}

export async function get(id) {
    return await _db.personalities.get(id);
}

export async function getSelected() {
    const selectedId = localStorage.getItem("selectedPersonalityId");
    return selectedId ? await _db.personalities.get(parseInt(selectedId)) : getDefault();
}

export async function removeAll() {
    if (confirm("Are you sure you want to delete all personalities? This cannot be undone.")) {
        await _db.personalities.clear();
        renderPersonalities();
    }
}

export function getDefault() {
    return new Personality();
}

export async function renderPersonalities() {
    const personalitiesDiv = document.querySelector("#personalitiesDiv");
    personalitiesDiv.innerHTML = "";
    const personalities = await getAll();

    // Default "Add New" card
    const addCard = document.createElement("div");
    addCard.classList.add("card-personality", "add-new-card");
    addCard.innerHTML = `
        <span class="material-symbols-outlined">add</span>
        <div class="card-personality-name">Add New</div>
    `;
    addCard.addEventListener("click", () => {
        OverlayService.showAddPersonalityForm();
    });
    personalitiesDiv.appendChild(addCard);

    // Render existing personalities
    const selectedPersonalityId = localStorage.getItem("selectedPersonalityId");

    for (const p of personalities) {
        const card = document.createElement("div");
        card.classList.add("card-personality");
        card.id = `personality-card-${p.id}`; // Add ID for avatar changes
        if (String(p.id) === selectedPersonalityId) {
            card.classList.add("active");
        }

        const imageSrc = p.image || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🧑</text></svg>';
        card.innerHTML = `
            <img src="${imageSrc}" loading="lazy" class="card-personality-image">
            <div class="card-personality-name">${p.name}</div>
            <div class="card-personality-description">${p.description}</div>
            <div class="card-personality-actions">
                <button class="material-symbols-outlined btn-textual btn-edit-personality" data-id="${p.id}">edit</button>
                <button class="material-symbols-outlined btn-textual btn-delete-personality" data-id="${p.id}">delete</button>
                <button class="material-symbols-outlined btn-textual btn-share-personality" data-id="${p.id}">share</button>
                <button class="material-symbols-outlined btn-textual btn-select-personality" data-id="${p.id}">check_circle</button>
            </div>
        `;

        personalitiesDiv.appendChild(card);

        // Attach event listeners
        card.querySelector(".btn-edit-personality").addEventListener("click", () => {
            OverlayService.showEditPersonalityForm(p);
        });
        card.querySelector(".btn-delete-personality").addEventListener("click", () => {
            remove(p.id);
        });
        card.querySelector(".btn-share-personality").addEventListener("click", () => {
            share(p);
        });
        card.querySelector(".btn-select-personality").addEventListener("click", async () => {
            localStorage.setItem("selectedPersonalityId", p.id);
            // After selecting a new personality, start a new chat.
            // This also re-renders personality cards, updating 'active' state.
            await chatsService.newChat(); 
            renderPersonalities();
        });
    }
}

export async function share(personality) {
    try {
        const personalityData = JSON.stringify(personality, null, 2);
        const blob = new Blob([personalityData], { type: "application/json" });
        const file = new File([blob], `${personality.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.json`, { type: "application/json" });

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: `${personality.name} Personality`,
                text: `Check out this personality for Aphrodisiac: ${personality.name}`
            });
            alert("Personality shared successfully!");
        } else {
            // Fallback for browsers that don't support Web Share API Level 2
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = file.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            alert("Personality downloaded as JSON. You can share this file manually.");
        }
    } catch (error) {
        console.error("Error sharing personality:", error);
        alert("Failed to share personality.");
    }
}

export async function migratePersonalities() {
    // This function will ensure all existing personality entries have the new fields
    const allPersonalities = await _db.personalities.toArray();
    for (const p of allPersonalities) {
        let needsUpdate = false;
        if (p.aggressiveness === undefined) { p.aggressiveness = 1; needsUpdate = true; }
        if (p.sensuality === undefined) { p.sensuality = 1; needsUpdate = true; }
        if (p.internetEnabled === undefined) { p.internetEnabled = false; needsUpdate = true; }
        if (p.roleplayEnabled === undefined) { p.roleplayEnabled = false; needsUpdate = true; }
        if (p.toneExamples === undefined) { p.toneExamples = []; needsUpdate = true; }

        if (needsUpdate) {
            await _db.personalities.update(p.id, p);
        }
    }
    console.log("Personalities migrated.");
}