// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMountain } from "./mountain";
import { minedMountain } from "./test-fixtures";
import {
  clearSessionSave,
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
  it("round-trips a dug mountain under the version 8 key (#558)", () => {
    const storage = createMemoryStorage();
    const mountain = minedMountain(3);

    expect(SESSION_SAVE_KEY).toBe("dad-friendly-game");
    expect(writeSessionSave({ storage, mountain, lastSeen: 1234 })).toBe(true);
    expect(readSessionSave({ storage })).toEqual({
      kind: "ok",
      save: { mountain, lastSeen: 1234 },
    });
  });

  it("clears the scratch pad", () => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: createMountain(), lastSeen: 1234 });

    clearSessionSave({ storage });

    expect(storage.getItem(SESSION_SAVE_KEY)).toBeNull();
    expect(readSessionSave({ storage })).toEqual({ kind: "absent" });
  });

  it("reads corrupt JSON or a bad save as bad", () => {
    const storage = createMemoryStorage();
    storage.setItem(SESSION_SAVE_KEY, "{not json");
    expect(readSessionSave({ storage })).toEqual({ kind: "bad" });

    storage.setItem(SESSION_SAVE_KEY, JSON.stringify({ lastSeenAt: 1 }));
    expect(readSessionSave({ storage })).toEqual({ kind: "bad" });
  });

  it("reads a later build's save as newer, and an earlier one as older with its text", () => {
    const storage = createMemoryStorage();
    storage.setItem(SESSION_SAVE_KEY, JSON.stringify({ version: 9 }));
    expect(readSessionSave({ storage })).toEqual({ kind: "newer", version: 9 });

    const raw = JSON.stringify({ version: 7, startedAt: 40, rev: 2 });
    storage.setItem(SESSION_SAVE_KEY, raw);
    expect(readSessionSave({ storage })).toEqual({
      kind: "older",
      version: 7,
      startedAt: 40,
      rev: 2,
      raw,
    });
  });

  it("never reads the key from before version 8", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      "dad-friendly-session",
      JSON.stringify({ version: 7, lastSeen: 1 }),
    );
    expect(readSessionSave({ storage })).toEqual({ kind: "absent" });
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
    expect(readSessionSave({ storage })).toEqual({ kind: "absent" });
    expect(() => {
      clearSessionSave({ storage });
    }).not.toThrow();
  });

  it("prefers localStorage so guest saves outlive the tab", () => {
    expect(tryGetGuestStorage()).toBe(globalThis.localStorage);
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
});
