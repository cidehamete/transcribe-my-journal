// db.js
// Simple wrapper around IndexedDB for persisting projects and transcripts.
// Each project contains an array of pages (image data URL, transcript text, status).
// Schema: DB name 'tmj_db', version 1, object store 'projects' { keyPath: 'id', autoIncrement: true }

const DB_NAME = 'tmj_db';
const DB_VERSION = 1;
const STORE = 'projects';

// Cache the connection so we don't open/close on every operation.
let dbPromise = null;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null; // allow retry on next call
        reject(req.error);
      };
    });
  }
  return dbPromise;
}

function toStorable(project) {
  const pages = project.pages.map((p) => ({
    imageSrc: p.image ? p.image.src : p.imageSrc ?? '',
    transcript: p.transcript,
    status: p.status,
    originalText: p.originalText ?? null,
  }));
  const { image, ...rest } = project; // not expected but just in case
  return { ...rest, pages };
}

export async function saveProject(project) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.put(toStorable(project));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAllProjects() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getProject(id) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Export all projects as a JSON string for backup / cross-machine migration.
export async function exportDb() {
  const projects = await getAllProjects();
  return JSON.stringify(projects);
}

// Replace the entire database with projects from a previously exported JSON string.
// Existing data is cleared first, then all projects are re-inserted preserving their IDs.
export async function importDb(jsonString) {
  const projects = JSON.parse(jsonString);
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    store.clear();
    for (const project of projects) {
      store.put(project); // preserves original IDs
    }
    tx.oncomplete = () => resolve(projects.length);
    tx.onerror = () => reject(tx.error);
  });
}
