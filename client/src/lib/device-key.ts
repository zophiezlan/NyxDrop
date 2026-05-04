// The device "key" is a random 16-byte hex string stored in localStorage. It is
// the entire identity model for the public app — no accounts, no sign-up. See
// constitution I.

const STORAGE_KEY = "nl.device-key";

export function getDeviceKey(): string {
  let key = localStorage.getItem(STORAGE_KEY);
  if (!key) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    key = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(STORAGE_KEY, key);
  }
  return key;
}

/**
 * Wipe everything: localStorage, IndexedDB, and (caller is responsible for) a
 * server-side `POST /api/device/forget`. Used by the "Forget this device"
 * button on `/me`. After calling, the page should reload to `/`.
 */
export function forgetDevice(): void {
  localStorage.clear();
  // IndexedDB databases used by the app. Deletion is async-by-callback but we
  // don't need to await — the next page load will recreate or skip them.
  const databases = ["nl-offline"];
  for (const name of databases) {
    try {
      indexedDB.deleteDatabase(name);
    } catch {
      // Best-effort; nothing useful to do on failure here.
    }
  }
}
