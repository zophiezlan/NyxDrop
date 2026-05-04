// IndexedDB-backed offline queue for report submissions. Per constitution XI
// the user must never lose a report due to network failure: when the network
// is down, we persist the payload here and drain it transparently when
// connectivity returns.

const DB_NAME = "nl-offline";
const DB_VERSION = 1;
const STORE_PENDING = "pending-reports";

export interface QueuedReport {
  /** Client-generated UUID. */
  id: string;
  /** Body the client wants to POST to /api/reports. */
  payload: unknown;
  /** When the queue first received this report (ms epoch). */
  queuedAt: number;
  /** How many drain attempts have failed. Capped at 5. */
  retryCount: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PENDING)) {
        db.createObjectStore(STORE_PENDING, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
  });
  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(storeName, mode);
        const store = t.objectStore(storeName);
        const req = fn(store);
        t.oncomplete = () => resolve((req?.result as T) ?? (undefined as T));
        t.onerror = () => reject(t.error ?? new Error("IDB tx failed"));
        t.onabort = () => reject(t.error ?? new Error("IDB tx aborted"));
      }),
  );
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for older browsers — not strictly needed in our PWA targets.
  const bytes = new Uint8Array(16);
  (crypto as Crypto).getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function enqueueReport(payload: unknown): Promise<QueuedReport> {
  const entry: QueuedReport = {
    id: newId(),
    payload,
    queuedAt: Date.now(),
    retryCount: 0,
  };
  await tx(STORE_PENDING, "readwrite", (store) => store.add(entry));
  return entry;
}

export async function listQueued(): Promise<QueuedReport[]> {
  return tx<QueuedReport[]>(STORE_PENDING, "readonly", (store) =>
    store.getAll() as IDBRequest<QueuedReport[]>,
  );
}

export async function removeQueued(id: string): Promise<void> {
  await tx(STORE_PENDING, "readwrite", (store) => store.delete(id));
}

export async function bumpRetry(id: string): Promise<QueuedReport | null> {
  const entry = await tx<QueuedReport | undefined>(
    STORE_PENDING,
    "readonly",
    (store) => store.get(id) as IDBRequest<QueuedReport | undefined>,
  );
  if (!entry) return null;
  entry.retryCount += 1;
  await tx(STORE_PENDING, "readwrite", (store) => store.put(entry));
  return entry;
}

export const MAX_RETRIES = 5;
