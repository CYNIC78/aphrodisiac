import { Dexie } from 'dexie';

/**
 * Sets up the Dexie database schema (versions and stores).
 * This function creates the Dexie instance but DOES NOT open it.
 * Opening the database should be handled once, centrally, in main.js.
 * @returns {Dexie} The configured Dexie database instance, not yet opened.
 */
export function setupDB() { 
    const db = new Dexie("chatDB");
    
    // Define all database versions and their schemas here.
    // Dexie automatically handles upgrades between versions based on your definitions.
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

    // Version 5: Adding the Asset Manager table.
    // The .upgrade() callback is for when the version *changes*, not for initial setup.
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
    
    return db; // Return the Dexie instance. It's not yet open or connected.
}

// REMOVED: export const db = await setupDB(); - this caused the top-level await and schema error.