import { Dexie } from 'dexie';

export async function setupDB() {
    let db;
    try {
        db = new Dexie("chatDB");
    } catch (error) {
        console.error(error);
        alert("failed to setup dexie (database)");
        return;
    }
    db.version(3).stores({
        chats: `
            ++id,
            title,
            timestamp,
            content
        `
    });

    db.version(4).stores({
        personalities: `
            ++id,
            name,
            image,
            prompt,
            aggressiveness,
            sensuality,
            internetEnabled,
            roleplayEnabled,
            toneExamples
        `
    });

    // Version 5: Adding the Asset Manager table (universal)
    db.version(5).stores({
        assets: `
            ++id,
            name,
            type,
            *tags,
            data,
            timestamp
        `
    });

    // Version 6: Modifying the assets table for per-character media libraries
    // This version ensures each asset is tied to a specific characterId.
    db.version(6).stores({
        assets: `
            ++id,
            characterId, // NEW: Links asset to a personality
            name,
            type,
            *tags,
            data,
            timestamp,
            [characterId+id] // Compound index for efficient lookup per character
        `
        // No .upgrade() method needed here if the user clears the database first,
        // as this creates the assets table with the new schema from scratch.
    });
    
    return db;
}

export const db = await setupDB();