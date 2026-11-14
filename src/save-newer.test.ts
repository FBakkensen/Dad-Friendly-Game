// @vitest-environment happy-dom
/**
 * A save from a later build is read-only (#558): the game stops, asks for the
 * update, and writes nothing to the cloud, the phone or the archive.
 */
import { describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import { createMemoryCloudSave } from "./cloud-save";
import type { Mountain } from "./mountain";
import { createProgressStore } from "./progress-store";
import { SESSION_SAVE_KEY } from "./session-save";
import { minedMountain, saveText } from "./test-fixtures";
import type { RecipeId } from "./workshop";

const user = { uid: "test-dad", label: "Test Dad" };
const BACKUP_KEY = `dad-friendly-game-backup:${user.uid}`;

function createMemoryStorage(): Storage & { writes: string[] } {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    writes,
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
      writes.push(key);
      data.set(key, value);
    },
  };
}

/** Every way the game saves: ticks, a dig, a hide and a pagehide. */
function tryToSave(
  progress: ReturnType<typeof createProgressStore>,
  clock: { at: number },
): void {
  for (let tick = 0; tick < 10; tick += 1) {
    clock.at += 1_000;
    progress.tick();
  }
  progress.dispatch({ kind: "dig" });
  progress.flush();
  progress.flush();
}

/** Save keys this store wrote, leaving out its device id, label and logs. */
function saveWrites(storage: { writes: string[] }): readonly string[] {
  return storage.writes.filter(
    (key) => key === SESSION_SAVE_KEY || key.startsWith(BACKUP_KEY),
  );
}

describe("a save from a later build (#558)", () => {
  it("a newer cloud copy writes nothing", async () => {
    const docs = new Map<string, Mountain>();
    const cloud = createMemoryCloudSave({
      docs,
      newerDocs: new Set([user.uid]),
    });
    const storage = createMemoryStorage();
    const clock = { at: 1_000 };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      now: () => clock.at,
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().newer).toBe(true);
    });
    tryToSave(progress, clock);
    await Promise.resolve();
    expect(docs.has(user.uid)).toBe(false);
    expect(saveWrites(storage)).toEqual([]);
    expect(await cloud.listCopies?.({ uid: user.uid, now: clock.at })).toEqual(
      [],
    );
    expect(progress.getSnapshot()).toMatchObject({
      newer: true,
      playing: false,
      saveKind: "loading",
    });
    expect(progress.getSnapshot().mountain.pocket).toBe(0);
    expect(progress.getSnapshot().log).toContain("save.newer");
    expect(
      progress.fieldLog().events.filter((event) => event.code === "save.newer"),
    ).toHaveLength(1);
    progress.dispose();
  });

  it("a newer phone backup writes nothing", async () => {
    const docs = new Map<string, Mountain>();
    const storage = createMemoryStorage();
    const raw = JSON.stringify({ uid: user.uid, save: { version: 9 } });
    storage.setItem(BACKUP_KEY, raw);
    storage.writes.length = 0;
    const clock = { at: 1_000 };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: storage,
      now: () => clock.at,
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().newer).toBe(true);
    });
    tryToSave(progress, clock);
    await Promise.resolve();
    expect(storage.getItem(BACKUP_KEY)).toBe(raw);
    expect(saveWrites(storage)).toEqual([]);
    expect(docs.has(user.uid)).toBe(false);
    expect(progress.getSnapshot()).toMatchObject({
      newer: true,
      saveKind: "loading",
    });
    expect(progress.getSnapshot().log).toContain("save.newer");
    progress.dispose();
  });

  it("a newer guest save writes nothing", () => {
    const storage = createMemoryStorage();
    const raw = JSON.stringify({ version: 9, lastSeen: 1 });
    storage.setItem(SESSION_SAVE_KEY, raw);
    storage.writes.length = 0;
    const clock = { at: 1_000 };
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock.at,
    });
    expect(progress.getSnapshot()).toMatchObject({
      newer: true,
      playing: false,
    });
    tryToSave(progress, clock);
    expect(storage.getItem(SESSION_SAVE_KEY)).toBe(raw);
    expect(saveWrites(storage)).toEqual([]);
    expect(progress.getSnapshot().mountain.pocket).toBe(0);
    progress.dispose();
  });

  it("the first open on this build starts fresh, and never touches the old keys", async () => {
    const storage = createMemoryStorage();
    const oldGuest = JSON.stringify({ version: 7, lastSeen: 1, rev: 3 });
    const oldBackup = JSON.stringify({ uid: user.uid, save: { version: 7 } });
    storage.setItem("dad-friendly-session", oldGuest);
    storage.setItem(`dad-friendly-phone-backup:${user.uid}`, oldBackup);
    const docs = new Map<string, Mountain>();
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: storage,
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    progress.dispatch({ kind: "dig" });
    progress.flush();
    expect(progress.getSnapshot().newer).toBe(false);
    expect(progress.getSnapshot().mountain.pocket).toBeGreaterThan(0);
    expect(storage.getItem("dad-friendly-session")).toBe(oldGuest);
    expect(storage.getItem(`dad-friendly-phone-backup:${user.uid}`)).toBe(
      oldBackup,
    );
    progress.dispose();
  });
});

describe("the writer reads back what it sends (#558)", () => {
  it("refuses a save this build could not read", async () => {
    const docs = new Map<string, Mountain>();
    const kept = minedMountain(5);
    docs.set(user.uid, kept);
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: createMemoryStorage(),
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    progress.applyMutation((mountain) => ({
      ...mountain,
      pocket: mountain.pocket + 10,
      // A recipe no build has: the reader would call this save newer.
      recipes: [...mountain.recipes, "kiln" as RecipeId],
    }));
    progress.flush();
    await Promise.resolve();
    expect(docs.get(user.uid)).toBe(kept);
    expect(progress.getSnapshot().saveKind).toBe("error");
    expect(progress.getSnapshot().log).toContain("save.shape");
    expect(
      progress.fieldLog().events.some((event) => event.code === "save.shape"),
    ).toBe(true);
    progress.dispose();
  });

  it("a fresh guest save text reads ok", () => {
    expect(
      JSON.parse(saveText(minedMountain(2), 1)) as { version: number },
    ).toMatchObject({ version: 8 });
  });
});
