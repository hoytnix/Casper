import { IngestionSnapshot } from '@/types';

const DB_NAME = 'antigravity_repo_snapshots_v1';
const STORE_NAME = 'snapshots';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = (e) => {
        console.warn('IndexedDB open error, falling back to in-memory:', e);
        resolve(null);
      };
    } catch (e) {
      console.warn('IndexedDB unavailable:', e);
      resolve(null);
    }
  });
}

/**
 * Stores an IngestionSnapshot (including all cached source files & commit SHA) into IndexedDB.
 */
export async function saveSnapshotToDB(repoId: string, snapshot: IngestionSnapshot): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.put(snapshot, repoId);

      req.onsuccess = () => resolve();
      req.onerror = (err) => {
        console.warn('Failed to store snapshot in IndexedDB:', err);
        resolve();
      };
    } catch (e) {
      console.warn('IndexedDB write error:', e);
      resolve();
    }
  });
}

/**
 * Loads an IngestionSnapshot for a single repo from IndexedDB.
 */
export async function loadSnapshotFromDB(repoId: string): Promise<IngestionSnapshot | null> {
  const db = await openDB();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(repoId);

      req.onsuccess = () => {
        resolve(req.result || null);
      };

      req.onerror = (err) => {
        console.warn('Failed to read snapshot from IndexedDB:', err);
        resolve(null);
      };
    } catch (e) {
      console.warn('IndexedDB read error:', e);
      resolve(null);
    }
  });
}

/**
 * Loads all stored IngestionSnapshots into a dictionary indexed by repoId.
 */
export async function loadAllSnapshotsFromDB(): Promise<Record<string, IngestionSnapshot>> {
  const db = await openDB();
  if (!db) return {};

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const result: Record<string, IngestionSnapshot> = {};

      // Open a cursor to retrieve all entries with their keys
      const cursorReq = store.openCursor();

      cursorReq.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          result[cursor.key as string] = cursor.value;
          cursor.continue();
        } else {
          resolve(result);
        }
      };

      cursorReq.onerror = (err) => {
        console.warn('Failed to iterate snapshots in IndexedDB:', err);
        resolve(result);
      };
    } catch (e) {
      console.warn('IndexedDB cursor error:', e);
      resolve({});
    }
  });
}

/**
 * Deletes a snapshot from IndexedDB when a repository is deleted.
 */
export async function deleteSnapshotFromDB(repoId: string): Promise<void> {
  const db = await openDB();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.delete(repoId);

      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
