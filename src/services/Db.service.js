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
    // CRITICAL FIX: Rewritten assets store definition using object literal syntax.
    // This is the most robust way to define a store with multiple indexes in Dexie,
    // explicitly stating the primary key and all indexes.
    db.version(6).stores({
        assets: {
            // Primary key with auto-increment
            primaryKey: '++id',
            // Define all other fields as indexes. *tags defines a multi-entry index.
            indexes: ['characterId', 'name', 'type', '*tags', 'timestamp'],
            // 'data' (Blob) should be stored but usually not indexed for performance.
            // No need to explicitly list it here if it's not indexed; Dexie handles it.
        }
    });
    
    return db;
}

export const db = await setupDB();