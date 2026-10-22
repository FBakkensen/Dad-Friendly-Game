const DEVICE_ID_KEY = "dad-friendly-device-id";

/** Mirrors the length check in `firestore.rules`. */
const DEVICE_ID_MIN = 8;
export const DEVICE_ID_MAX = 64;

export function isDeviceId(value: string): boolean {
  return value.length >= DEVICE_ID_MIN && value.length <= DEVICE_ID_MAX;
}

/** A stable id for this browser. Not a secret and not a save. */
export function createDeviceId(cryptoObj: Crypto = globalThis.crypto): string {
  if (typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  const alphabet = "0123456789abcdef";
  let id = "device-";
  while (id.length < 24) {
    id += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return id;
}

/**
 * Reads the id, or writes a new one. A broken store still gets an id for
 * this open; the rules only need a string, not a perfect memory.
 */
export function readDeviceId(storage: Storage | undefined): string {
  if (storage === undefined) {
    return createDeviceId();
  }
  try {
    const existing = storage.getItem(DEVICE_ID_KEY);
    if (existing !== null && isDeviceId(existing)) {
      return existing;
    }
    const created = createDeviceId();
    storage.setItem(DEVICE_ID_KEY, created);
    return created;
  } catch {
    return createDeviceId();
  }
}
