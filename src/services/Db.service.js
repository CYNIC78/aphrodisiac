import { Dexie } from 'dexie';

/**
 * Sets up and migrates the Dexie database.
 * This function is now responsible for creating the database instance.
 * @returns {Promise<Dexie>} The initialized Dexie database instance.
 */
export function setupDB() { // Removed 'async' because Dexie constructor is synchronous. Migrations are chained.
    const db = new Dexie("chatDB");
    
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

    // Version 5: Adding the Asset Manager table
    db.version(5).stores({
        assets: `
            ++id,
            name,
            type,
            *tags,
            data,
            timestamp
        `
    }).upgrade(tx => {
        // Example upgrade logic for v5 if needed, e.g., to add default assets
        // For now, simply defines the new store
    });
    
    // Dexie's open() method returns a promise that resolves when all migrations are complete.
    // We explicitly call it here to ensure the database is ready when setupDB() finishes its *asynchronous* work.
    db.open().catch(error => {
        console.error("Failed to open or upgrade Dexie database:", error);
        alert("Failed to initialize the local database. Please check console for details.");
        // Consider re-throwing or handling the error more gracefully if crucial for app function
    });

    return db; // Return the db instance immediately, its open() promise ensures readiness.
}

// The 'db' export is REMOVED from here. It will now be initialized in main.js and passed to services.