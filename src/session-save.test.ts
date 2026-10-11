import { describe, expect, it } from "vitest";
import { createPocketGrid, dig, place } from "./grid";
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
  it("round-trips a dug grid", () => {
    const storage = createMemoryStorage();
    const grid = dig({ grid: createPocketGrid(), index: 2 });

    expect(writeSessionSave({ storage, grid, lastSeen: 1234 })).toBe(true);
    expect(readSessionSave({ storage })).toEqual({ grid, lastSeen: 1234 });
  });

  it("round-trips a placed stone", () => {
    const storage = createMemoryStorage();
    const grid = place({
      grid: dig({ grid: createPocketGrid(), index: 0 }),
      index: 0,
    });

    expect(writeSessionSave({ storage, grid, lastSeen: 1234 })).toBe(true);
    expect(readSessionSave({ storage })).toEqual({ grid, lastSeen: 1234 });
  });

  it("clears the scratch pad", () => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, grid: createPocketGrid(), lastSeen: 1234 });

    clearSessionSave({ storage });

    expect(storage.getItem(SESSION_SAVE_KEY)).toBeNull();
    expect(readSessionSave({ storage })).toBeUndefined();
  });

  it("rejects corrupt JSON or a bad grid", () => {
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
      writeSessionSave({ storage, grid: createPocketGrid(), lastSeen: 1234 }),
    ).toBe(false);
    expect(readSessionSave({ storage })).toBeUndefined();
    expect(() => {
      clearSessionSave({ storage });
    }).not.toThrow();
  });

  it("prefers localStorage so guest saves outlive the tab", () => {
    expect(tryGetGuestStorage()).toBe(globalThis.localStorage);
  });
});

describe("migrateSessionSave", () => {
  it("moves a legacy tab save into the device store", () => {
    const from = createMemoryStorage();
    const to = createMemoryStorage();
    const grid = dig({ grid: createPocketGrid(), index: 5 });
    writeSessionSave({ storage: from, grid, lastSeen: 42 });

    migrateSessionSave({ from, to });

    expect(readSessionSave({ storage: to })).toEqual({ grid, lastSeen: 42 });
    expect(from.getItem(SESSION_SAVE_KEY)).toBeNull();
  });

  it("keeps an existing device save over the legacy one", () => {
    const from = createMemoryStorage();
    const to = createMemoryStorage();
    const kept = dig({ grid: createPocketGrid(), index: 1 });
    writeSessionSave({ storage: from, grid: createPocketGrid(), lastSeen: 1 });
    writeSessionSave({ storage: to, grid: kept, lastSeen: 2 });

    migrateSessionSave({ from, to });

    expect(readSessionSave({ storage: to })).toEqual({
      grid: kept,
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
