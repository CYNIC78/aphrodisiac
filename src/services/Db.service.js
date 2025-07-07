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
            image, // <-- This field will be removed/migrated in version 6
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
    // Corrected syntax for assets table to ensure characterId is properly included and indexed.
    db.version(6).stores({
        assets: `
            ++id,
            characterId, // NEW: Links asset to a personality (will be indexed by Dexie automatically)
            name,
            type,
            *tags, // Multi-entry index for tags
            data,
            timestamp
            // Removed the problematic compound index '[characterId+id]'
        `
    });
    
    return db;
}

export const db = await setupDB();