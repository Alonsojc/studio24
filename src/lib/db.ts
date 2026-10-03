'use client';

const DB_NAME = 'studio24_db';
const DB_VERSION = 1;
const STORE_NAME = 'keyval';
// PHOTOS_STORE legacy — se mantiene el objectStore para no romper la
// migración de IndexedDB en navegadores existentes, pero las fotos
// nuevas viven en Supabase Storage (ver src/lib/photos.ts).
const PHOTOS_STORE = 'photos';

async function recoveryStore<T>(owner: string, action: 'read' | 'write' | 'delete', value?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    let expired = false;
    let transaction: IDBTransaction | undefined;
    const timer = setTimeout(() => {
      expired = true;
      transaction?.abort();
      reject(new Error('El almacenamiento de recuperacion no responde'));
    }, 4000);
    const request = indexedDB.open('studio24_pending_recovery', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('users');
    request.onerror = () => {
      clearTimeout(timer);
      reject(request.error);
    };
    request.onsuccess = () => {
      const db = request.result;
      if (expired) {
        db.close();
        return;
      }
      const tx = db.transaction('users', action === 'read' ? 'readonly' : 'readwrite');
      transaction = tx;
      const store = tx.objectStore('users');
      const operation =
        action === 'read' ? store.get(owner) : action === 'write' ? store.put(value, owner) : store.delete(owner);
      tx.oncomplete = () => {
        clearTimeout(timer);
        db.close();
        resolve(operation.result as T);
      };
      tx.onabort = () => {
        clearTimeout(timer);
        db.close();
        reject(tx.error);
      };
      tx.onerror = () => {
        clearTimeout(timer);
        db.close();
        reject(tx.error);
      };
    };
  });
}
export const saveUserRecovery = (owner: string, value: string) => recoveryStore<void>(owner, 'write', value);
export const readUserRecovery = (owner: string) => recoveryStore<string | undefined>(owner, 'read');
export const deleteUserRecovery = (owner: string) => recoveryStore<void>(owner, 'delete');

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const owner = localStorage.getItem('bordados_active_user_id');
    if (!owner) {
      reject(new Error('Sesion requerida para abrir cache local'));
      return;
    }
    const req = indexedDB.open(`${DB_NAME}_${owner}`, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
        db.createObjectStore(PHOTOS_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).get(key);
        tx.oncomplete = () => db.close();
        tx.onabort = () => db.close();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

function idbPut(store: string, key: string, value: unknown): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).put(value, key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

function idbDelete(store: string, key: string): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.objectStore(store).delete(key);
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

function idbGetAllKeys(store: string): Promise<string[]> {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAllKeys();
        tx.oncomplete = () => db.close();
        tx.onabort = () => db.close();
        req.onsuccess = () => resolve(req.result as string[]);
        req.onerror = () => reject(req.error);
      }),
  );
}

// --- Public API ---

/**
 * Mirror a localStorage key to IndexedDB (fire-and-forget).
 * Called after every localStorage write.
 */
export function mirrorToIDB(key: string, value: string): void {
  idbPut(STORE_NAME, key, value).catch(() => {});
}

/**
 * Remove a key from IndexedDB mirror.
 */
export function removeFromIDB(key: string): void {
  idbDelete(STORE_NAME, key).catch(() => {});
}

/**
 * Drop all local IndexedDB data owned by the app. This is used on logout or
 * account switch so cached customer/financial records cannot leak users.
 */
export function clearStudioDB(owner?: string | null): void {
  if (typeof indexedDB === 'undefined') return;
  const req = indexedDB.deleteDatabase(owner ? `${DB_NAME}_${owner}` : DB_NAME);
  req.onerror = () => {};
}

/**
 * Restore localStorage from IndexedDB if localStorage is empty.
 * Called once at app startup.
 */
export async function restoreFromIDB(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return false;

  try {
    const ownerKey = 'bordados_active_user_id';
    const owner = localStorage.getItem(ownerKey);
    const mirroredOwner = await idbGet<string>(STORE_NAME, ownerKey);
    // Never restore unowned legacy data or another account's cache.
    if (!owner || mirroredOwner !== owner) return false;
    const keys = await idbGetAllKeys(STORE_NAME);
    if (keys.length === 0) return false;

    // Check if localStorage has any bordados_ keys
    const hasLocalData = keys.some(
      (k) => k !== ownerKey && k.startsWith('bordados_') && localStorage.getItem(k as string) !== null,
    );
    if (hasLocalData) {
      // localStorage has data — mirror it to IDB (in case IDB is stale)
      for (const key of keys) {
        const local = localStorage.getItem(key as string);
        if (local) {
          await idbPut(STORE_NAME, key as string, local);
        }
      }
      return false;
    }

    // localStorage empty, IDB has data → restore
    for (const key of keys) {
      const value = await idbGet<string>(STORE_NAME, key as string);
      if (value) {
        localStorage.setItem(key as string, value);
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Mirror ALL current localStorage keys to IndexedDB.
 * Called once after initial data load.
 */
export async function syncAllToIDB(): Promise<void> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('bordados_')) {
        const value = localStorage.getItem(key);
        if (value) await idbPut(STORE_NAME, key, value);
      }
    }
  } catch {
    // IDB not available, silently continue with localStorage only
  }
}

// --- Photos: ya no viven aquí ---
//
// Antes de que el sistema de equipos existiera, las fotos se guardaban
// solo en IndexedDB del navegador. Eso significaba que el operador subía
// una foto y ni el admin ni el contador la veían. Ahora viven en Supabase
// Storage team-scoped (ver src/lib/photos.ts).
