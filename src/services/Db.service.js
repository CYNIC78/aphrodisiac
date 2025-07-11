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
    // CRITICAL FIX: The schema for 'assets' MUST explicitly list ALL fields to be preserved from previous versions,
    // plus any new ones (like characterId). If omitted, Dexie DROPS those fields.
    db.version(6).stores({
        assets: `
            ++id,
            name,
            type,
            characterId,
            *tags,
            data,
            timestamp
        `
    });
    
    return db;
}

export const db = await setupDB();