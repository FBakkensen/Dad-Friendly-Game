import { afterEach, describe, expect, it, vi } from "vitest";
import { MOUNTAIN_STONES, createMountain } from "./mountain";
import { minedMountain } from "./test-fixtures";
import {
  clearSessionSave,
  migrateSessionSave,
  readSessionSave,
  SESSION_SAVE_KEY,
  tryGetGuestStorage,
  writeSessionSave,
} from "./session-save";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("session save", () => {
  it("round-trips a dug mountain", () => {
    const storage = createMemoryStorage();
    const mountain = minedMountain(3);

    expect(writeSessionSave({ storage, mountain, lastSeen: 1234 })).toBe(true);
    expect(readSessionSave({ storage })).toEqual({ mountain, lastSeen: 1234 });
  });

  it("grants materials when an older local save is opened (#195)", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({
        version: 5,
        mountain: {
          remaining: MOUNTAIN_STONES - 12_000_000,
          pocket: 12_000_000,
          helpers: 0,
        },
        lastSeen: 4,
      }),
    );
    expect(readSessionSave({ storage })?.mountain.materials).toEqual({
      clay: 10,
      iron: 2,
      crystal: 0,
      heartstone: 0,
    });
    expect(readSessionSave({ storage })?.mountain.pocket).toBe(12_000_000);
  });

  it("round-trips a placed stone", () => {
    const storage = createMemoryStorage();
    const mountain = minedMountain(11);

    expect(writeSessionSave({ storage, mountain, lastSeen: 1234 })).toBe(true);
    expect(readSessionSave({ storage })).toEqual({ mountain, lastSeen: 1234 });
  });

  it("clears the scratch pad", () => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: createMountain(), lastSeen: 1234 });

    clearSessionSave({ storage });

    expect(storage.getItem(SESSION_SAVE_KEY)).toBeNull();
    expect(readSessionSave({ storage })).toBeUndefined();
  });

  it("rejects corrupt JSON or a bad mountain", () => {
    const storage = createMemoryStorage();
    storage.setItem(SESSION_SAVE_KEY, "{not json");
    expect(readSessionSave({ storage })).toBeUndefined();

    storage.setItem(SESSION_SAVE_KEY, JSON.stringify({ lastSeenAt: 1 }));
    expect(readSessionSave({ storage })).toBeUndefined();
  });

  it("does not throw when storage writes fail", () => {
    const storage: Storage = {
      get length() {
        return 0;
      },
      clear: () => {
        return;
      },
      getItem: () => {
        throw new Error("blocked");
      },
      key: () => null,
      removeItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };

    expect(
      writeSessionSave({ storage, mountain: createMountain(), lastSeen: 1234 }),
    ).toBe(false);
    expect(readSessionSave({ storage })).toBeUndefined();
    expect(() => {
      clearSessionSave({ storage });
    }).not.toThrow();
  });

  it("prefers localStorage so guest saves outlive the tab", () => {
    expect(tryGetGuestStorage()).toBe(globalThis.localStorage);
  });

  it("moves an older tab save into localStorage on first use", () => {
    globalThis.localStorage.clear();
    const mountain = minedMountain(8);
    writeSessionSave({
      storage: globalThis.sessionStorage,
      mountain,
      lastSeen: 9,
    });

    const storage = tryGetGuestStorage();

    expect(storage).toBe(globalThis.localStorage);
    expect(readSessionSave({ storage: globalThis.localStorage })).toEqual({
      mountain,
      lastSeen: 9,
    });
    expect(globalThis.sessionStorage.getItem(SESSION_SAVE_KEY)).toBeNull();
  });
});

describe("migrateSessionSave", () => {
  it("moves a legacy tab save into the device store", () => {
    const from = createMemoryStorage();
    const to = createMemoryStorage();
    const mountain = minedMountain(6);
    writeSessionSave({ storage: from, mountain, lastSeen: 42 });

    migrateSessionSave({ from, to });

    expect(readSessionSave({ storage: to })).toEqual({
      mountain,
      lastSeen: 42,
    });
    expect(from.getItem(SESSION_SAVE_KEY)).toBeNull();
  });

  it("keeps an existing device save over the legacy one", () => {
    const from = createMemoryStorage();
    const to = createMemoryStorage();
    const kept = minedMountain(2);
    writeSessionSave({
      storage: from,
      mountain: createMountain(),
      lastSeen: 1,
    });
    writeSessionSave({ storage: to, mountain: kept, lastSeen: 2 });

    migrateSessionSave({ from, to });

    expect(readSessionSave({ storage: to })).toEqual({
      mountain: kept,
      lastSeen: 2,
    });
    expect(from.getItem(SESSION_SAVE_KEY)).toBeNull();
  });

  it("drops a corrupt legacy save instead of copying it", () => {
    const from = createMemoryStorage();
    const to = createMemoryStorage();
    from.setItem(SESSION_SAVE_KEY, "{not json");

    migrateSessionSave({ from, to });

    expect(to.getItem(SESSION_SAVE_KEY)).toBeNull();
    expect(from.getItem(SESSION_SAVE_KEY)).toBeNull();
  });
});

describe("tryGetGuestStorage when the browser blocks storage (#114 coverage)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const blocked = (): Storage => {
    const storage = createMemoryStorage();
    storage.setItem = () => {
      throw new Error("SecurityError");
    };
    return storage;
  };

  it("falls back to this tab's storage when localStorage is blocked", () => {
    const tab = createMemoryStorage();
    vi.stubGlobal("localStorage", blocked());
    vi.stubGlobal("sessionStorage", tab);
    expect(tryGetGuestStorage()).toBe(tab);
  });

  it("plays without saving when both are blocked", () => {
    vi.stubGlobal("localStorage", blocked());
    vi.stubGlobal("sessionStorage", blocked());
    expect(tryGetGuestStorage()).toBeUndefined();
  });

  it("leaves both stores alone if reading the old save throws", () => {
    const from = createMemoryStorage();
    from.getItem = () => {
      throw new Error("SecurityError");
    };
    const to = createMemoryStorage();
    expect(() => {
      migrateSessionSave({ from, to });
    }).not.toThrow();
    expect(to.getItem(SESSION_SAVE_KEY)).toBeNull();
  });
});
