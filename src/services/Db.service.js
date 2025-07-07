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
    // CRITICAL FIX: Rewritten assets store definition for ultimate clarity and correctness in Dexie.
    // This explicitly defines the primary key and then separate indexes for other fields.
    db.version(6).stores({
        assets: `
            ++id, // Primary key
            characterId, // Indexed field for linking to personality
            name,
            type,
            data,
            timestamp
        `
    }).upgrade(trans => {
        // Add the multi-entry index for 'tags' separately as Dexie often prefers this for clarity
        // when combined with other indexes and primary keys in the store string.
        trans.table('assets').schema.idxByName.tags = Dexie.createMultiInstanceDexieIndex('tags');
    });
    
    return db;
}

export const db = await setupDB();