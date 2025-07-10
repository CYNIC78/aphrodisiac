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
    // CRITICAL FIX: Rewritten assets store definition as a simple, unambiguous string.
    // This defines the primary key (id), a regular index (characterId), and a multi-entry index (*tags).
    // Other fields (name, type, data, timestamp) are stored but do not require explicit indexing if not used for querying.
    db.version(6).stores({
        assets: `++id, characterId, *tags` // <-- The CORRECTED, bulletproof string definition
    });
    
    return db;
}

export const db = await setupDB();