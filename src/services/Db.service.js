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

    // Version 6: Modifying the assets table for per-personality media libraries (using 'characterId' as personalityId)
    // REVISED: This version's schema for 'assets' should explicitly define all fields it expects,
    // and 'characterId' is now renamed to 'personalityId' for clarity regarding its existing use.
    db.version(6).stores({
        // 'personalityId' here correctly refers to the Personality ID, as used in the existing service.
        assets: `++id, personalityId, name, type, *tags, data, timestamp`
    });
    // No .upgrade() block needed here, as Dexie will automatically add 'personalityId' as undefined for old assets,
    // and subsequent calls to assetManagerService will set it correctly.

    // Version 7: Introducing Characters and States, and linking Assets to them.
    // This is where we define the new tables and update the existing 'assets' table for the new hierarchy.
    db.version(7).stores({
        // New tables for Character and State hierarchy
        characters: '++id, personalityId, name', // Links to Personality (parent)
        states: '++id, characterId, name', // Links to Character (parent)

        // Updated assets table to include links to new Character and State entities
        // 'personalityId' here refers to the top-level Personality ID.
        // 'characterId' here refers to the NEW Character ID.
        // 'stateId' here refers to the NEW State ID.
        // 'value' is the specific tag value extracted from filename (e.g., 'happy' from 'happy.png')
        assets: `++id, personalityId, characterId, stateId, name, type, value, *tags, data, timestamp`
    }).upgrade(async tx => {
        // --- Migration from Version 6 to Version 7 ---
        // For existing 'assets' records that were created under version 6, they will only have:
        // id, personalityId, name, type, *tags, data, timestamp.
        // Dexie automatically adds new fields (characterId, stateId, value) as 'undefined' for existing records.
        // We will rely on new asset uploads via the new UI to correctly populate these fields.
        // No explicit data migration needed here for now, as 'undefined' is acceptable initially.
        // If we later decide existing assets MUST be assigned to a default character/state,
        // we'd add logic here to iterate over tx.assets and update them.
    });
    
    // Ensure all 'db.version' calls are sequential and ordered correctly.
    // Dexie applies all schema changes from lower versions up to the highest one defined.

    return db;
}

export const db = await setupDB();