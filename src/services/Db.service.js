// FILE: src/services/Db.service.js

import { Dexie } from 'dexie';

export async function setupDB() {
    let db;
    try {
        db = new Dexie("chatDB");
    } catch (error) {
        console.error(error);
        alert("Failed to setup Dexie (database).");
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

    db.version(6).stores({
        assets: `++id, personalityId, name, type, *tags, data, timestamp`
    });

    // Version 72: Introducing Characters and States, and linking Assets to them.
    // This defines the new tables and updates the existing 'assets' table for the new hierarchy.
    // IMPORTANT: This version number (72) must be higher than the effective current database version (710).
    // If your environment multiplies version numbers by 10 (e.g., 71 -> 710), then 72 should become 720.
    db.version(72).stores({
        characters: '++id, personalityId, name',
        states: '++id, characterId, name',
        assets: `++id, personalityId, characterId, stateId, name, type, value, *tags, data, timestamp`
    }).upgrade(async tx => {
        // Migration from previous version (e.g., effective 710) to effective 720.
        // For existing 'assets' records, new fields (characterId, stateId, value) will be 'undefined'.
        // This is acceptable initially, and new asset uploads will populate them.
    });
    
    return db;
}

export const db = await setupDB();