import { AlignmentAnalysis } from "@/app/actions/analyze-tweets";
import { Placement } from "@/app/page";
import { logger } from "./logger";

export interface StoredPlacement {
    id: string;
    src: string;
    position: {
        x: number;
        y: number;
    };
    username?: string;
    analysis?: AlignmentAnalysis;
    isAiPlaced?: boolean;
    timestamp?: string; // ISO string
}

const DB_NAME = 'alignment-chart-db';
const DB_VERSION = 1;
const USERS_STORE = 'users';

interface IndexedDBInstance {
    db: IDBDatabase | null;
    isInitializing: boolean;
    onInitialize: Array<() => void>;
}

const indexedDB: IndexedDBInstance = {
    db: null,
    isInitializing: false,
    onInitialize: [],
};

export function initIndexedDB(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (indexedDB.db) {
            resolve();
            return;
        }

        if (indexedDB.isInitializing) {
            indexedDB.onInitialize.push(() => resolve());
            return;
        }

        indexedDB.isInitializing = true;

        if (!window.indexedDB) {
            console.error("Your browser doesn't support IndexedDB");
            indexedDB.isInitializing = false;
            reject(new Error("IndexedDB not supported"));
            return;
        }

        const request = window.indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("IndexedDB error:", event);
            indexedDB.isInitializing = false;
            reject(new Error("Failed to open IndexedDB"));
        };

        request.onsuccess = (event) => {
            indexedDB.db = (event.target as IDBOpenDBRequest).result;
            indexedDB.isInitializing = false;

            indexedDB.onInitialize.forEach(callback => callback());
            indexedDB.onInitialize = [];

            resolve();
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;

            if (!db.objectStoreNames.contains(USERS_STORE)) {
                db.createObjectStore(USERS_STORE, { keyPath: 'id' });
            }
        };
    });
}

export async function cachePlacementsLocally(placements: Placement[]): Promise<void> {
    const stored_placements: StoredPlacement[] = placements.map((item) => ({
        id: item.id,
        src: item.src,
        position: item.position,
        username: item.username,
        analysis: item.analysis,
        isAiPlaced: item.isAiPlaced,
        timestamp: item.timestamp?.toISOString(),
    }));

    logger.debug("Saving users to IndexedDB", stored_placements);
    await initIndexedDB();

    if (!indexedDB.db) {
        throw new Error("IndexedDB not initialized");
    }

    return new Promise((resolve, reject) => {
        const transaction = indexedDB.db!.transaction([USERS_STORE], 'readwrite');
        const store = transaction.objectStore(USERS_STORE);

        const clearRequest = store.clear();

        clearRequest.onsuccess = () => {
            let remaining = placements.length;

            if (placements.length === 0) {
                resolve();
                return;
            }

            stored_placements.forEach(placement => {
                const stored_placement: StoredPlacement = {
                    ...placement,
                    timestamp: placement.timestamp || new Date().toISOString()
                };

                const request = store.add(stored_placement);

                request.onsuccess = () => {
                    remaining--;
                    if (remaining === 0) {
                        resolve();
                    }
                };

                request.onerror = (event) => {
                    logger.error("Error adding placement to IndexedDB:");
                    console.error(event);
                    reject(new Error("Failed to add placement to IndexedDB"));
                };
            });
        };

        clearRequest.onerror = (event) => {
            logger.error("Error clearing IndexedDB store:");
            console.error(event);
            reject(new Error("Failed to clear IndexedDB store"));
        };

        transaction.onerror = (event) => {
            logger.error("Transaction error:");
            console.error(event);
            reject(new Error("IndexedDB transaction failed"));
        };
    });
}

export async function removeCachedPlacement(id: string): Promise<void> {
    await initIndexedDB();
    if (!indexedDB.db) throw new Error("IndexedDB not initialized");

    return new Promise((resolve, reject) => {
        const transaction = indexedDB.db!.transaction([USERS_STORE], 'readwrite');
        const store = transaction.objectStore(USERS_STORE);

        const request = store.delete(id);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = (event) => {
            console.error("Error deleting user from IndexedDB:", event);
            reject(new Error("Failed to delete user from IndexedDB"));
        };
    });
}

export async function loadCachedPlacements(): Promise<StoredPlacement[]> {
    await initIndexedDB();
    if (!indexedDB.db) return [];

    return new Promise((resolve, reject) => {
        const transaction = indexedDB.db!.transaction([USERS_STORE], 'readonly');
        const store = transaction.objectStore(USERS_STORE);
        const request = store.getAll();

        request.onsuccess = () => {
            const placements = request.result as StoredPlacement[];
            resolve(placements);
        };

        request.onerror = (event) => {
            console.error("Error loading users from IndexedDB:", event);
            reject(new Error("Failed to load users from IndexedDB"));
        };
    });
}

export async function clearLocalCache(): Promise<void> {
    await initIndexedDB();
    if (!indexedDB.db) return;


    return new Promise((resolve, reject) => {
        const transaction = indexedDB.db!.transaction([USERS_STORE], 'readwrite');
        const store = transaction.objectStore(USERS_STORE);
        const request = store.clear();

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = (event) => {
            console.error("Error clearing IndexedDB:", event);
            reject(new Error("Failed to clear IndexedDB"));
        };
    });
}
