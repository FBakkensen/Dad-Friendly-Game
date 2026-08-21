import { describe, expect, it } from "vitest";
import { createPocketGrid, dig, place } from "./grid";
import {
  clearSessionSave,
  readSessionSave,
  SESSION_SAVE_KEY,
  tryGetSessionStorage,
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

  it("probes the real sessionStorage when it is available", () => {
    expect(tryGetSessionStorage()).toBe(globalThis.sessionStorage);
  });
});
