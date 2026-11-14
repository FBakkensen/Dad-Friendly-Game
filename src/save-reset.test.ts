// @vitest-environment happy-dom
/**
 * A save from before this version is set aside, never read (#558): its text
 * moves aside on the phone, or into Saved copies in the cloud, and a fresh
 * mountain keeps its run stamp.
 */
import { describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import {
  createMemoryCloudSave,
  type CloudSave,
  type RawArchive,
} from "./cloud-save";
import { createMountain, minedOut, type Mountain } from "./mountain";
import { createProgressStore } from "./progress-store";
import { SESSION_SAVE_KEY } from "./session-save";
import { minedMountain, saveText } from "./test-fixtures";

const user = { uid: "test-dad", label: "Test Dad" };
const BACKUP_KEY = `dad-friendly-game-backup:${user.uid}`;

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

function signedIn(cloudSave: CloudSave, storage: Storage) {
  return createProgressStore({
    auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
    cloudSave,
    sessionStorage: storage,
    cloudWriteGapMs: 0,
    archiveWaitMs: 50,
  });
}

/** A version 7 phone backup at the new key, as a later version bump would leave one. */
function olderBackup(storage: Storage, startedAt: number): string {
  const raw = JSON.stringify({
    uid: user.uid,
    save: { version: 7, lastSeen: 3, startedAt, rev: 2, mountain: {} },
  });
  storage.setItem(BACKUP_KEY, raw);
  return raw;
}

describe("an older save is set aside (#558)", () => {
  it("an older phone backup is set aside and the stamp kept", async () => {
    const storage = createMemoryStorage();
    const raw = olderBackup(storage, 500);
    const docs = new Map<string, Mountain>();
    const progress = signedIn(createMemoryCloudSave({ docs }), storage);
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    expect(storage.getItem(`${BACKUP_KEY}:v7`)).toBe(raw);
    expect(progress.getSnapshot().mountain).toEqual({
      ...createMountain(),
      startedAt: 500,
    });
    expect(
      progress
        .fieldLog()
        .events.filter((event) => event.code === "save.set-aside"),
    ).toEqual([
      expect.objectContaining({ data: { source: "phone", id: "v7" } }),
    ]);
    progress.dispose();
  });

  it("an older guest save is set aside for a fresh mountain", () => {
    const storage = createMemoryStorage();
    const raw = JSON.stringify({ version: 7, lastSeen: 1, startedAt: 40 });
    storage.setItem(SESSION_SAVE_KEY, raw);
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
    });
    expect(storage.getItem(`${SESSION_SAVE_KEY}:v7`)).toBe(raw);
    expect(storage.getItem(SESSION_SAVE_KEY)).toBeNull();
    expect(progress.getSnapshot()).toMatchObject({
      playing: true,
      mountain: { ...createMountain(), startedAt: 40 },
    });
    expect(progress.getSnapshot().log).toContain("save.set-aside");
    progress.dispose();
  });

  it("an older cloud copy lands in the archive before the fresh mountain's first write", async () => {
    const docs = new Map<string, Mountain>();
    const rawArchives: RawArchive[] = [];
    const old = { version: 7, rev: 3, startedAt: 700, mountain: {} };
    const cloud = createMemoryCloudSave({
      docs,
      olderDocs: new Map([
        [user.uid, { version: 7, rev: 3, startedAt: 700, raw: old }],
      ]),
      rawArchives,
    });
    const archivedAtWrite: number[] = [];
    const write = cloud.write;
    const spied: CloudSave = {
      ...cloud,
      write: (args) => {
        archivedAtWrite.push(rawArchives.length);
        expect(args.rev).toBe(4);
        return write(args);
      },
    };
    const progress = signedIn(spied, createMemoryStorage());
    await vi.waitFor(() => {
      expect(docs.get(user.uid)?.startedAt).toBe(700);
    });
    expect(rawArchives).toEqual([
      { uid: user.uid, raw: old, version: 7, rev: 3, reason: "reset" },
    ]);
    expect(archivedAtWrite[0]).toBe(1);
    expect(minedOut(docs.get(user.uid) ?? createMountain())).toBe(0);
    expect(progress.getSnapshot()).toMatchObject({
      playing: true,
      saveKind: "account",
    });
    expect(progress.getSnapshot().mountain.startedAt).toBe(700);
    expect(await cloud.listCopies?.({ uid: user.uid, now: 0 })).toEqual([]);
    progress.dispose();
  });

  it("a failed archive keeps the board held", async () => {
    const docs = new Map<string, Mountain>();
    const writes: number[] = [];
    const cloud = createMemoryCloudSave({
      docs,
      olderDocs: new Map([
        [user.uid, { version: 7, rev: 3, startedAt: 700, raw: {} }],
      ]),
      archiveGate: { fail: true },
    });
    const progress = signedIn(
      {
        ...cloud,
        write: (args) => {
          writes.push(args.rev);
          return cloud.write(args);
        },
      },
      createMemoryStorage(),
    );
    await vi.waitFor(() => {
      expect(progress.getSnapshot().log).toContain("save.archive");
    });
    progress.dispatch({ kind: "dig" });
    progress.flush();
    await Promise.resolve();
    expect(writes).toEqual([]);
    expect(docs.has(user.uid)).toBe(false);
    expect(progress.getSnapshot()).toMatchObject({
      playing: false,
      saveKind: "error",
    });
    expect(progress.getSnapshot().mountain.pocket).toBe(0);
    progress.dispose();
  });
});

describe("an older cloud copy with nowhere to go (#558)", () => {
  const older = () =>
    new Map([[user.uid, { version: 7, rev: 3, startedAt: 700, raw: {} }]]);

  it("a cloud with no Saved copies keeps the board held", async () => {
    const docs = new Map<string, Mountain>();
    const cloud = createMemoryCloudSave({ docs, olderDocs: older() });
    const noArchive: CloudSave = { ...cloud };
    delete (noArchive as { archiveRaw?: unknown }).archiveRaw;
    const progress = signedIn(noArchive, createMemoryStorage());
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("error");
    });
    expect(docs.has(user.uid)).toBe(false);
    expect(progress.getSnapshot().playing).toBe(false);
    progress.dispose();
  });

  it("a copy still on its way when the page closes changes nothing after", async () => {
    const docs = new Map<string, Mountain>();
    const cloud = createMemoryCloudSave({ docs, olderDocs: older() });
    let land: (result: { kind: "ok" }) => void = () => undefined;
    const progress = signedIn(
      {
        ...cloud,
        archiveRaw: () =>
          new Promise((resolve) => {
            land = resolve;
          }),
      },
      createMemoryStorage(),
    );
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("loading");
    });
    progress.dispose();
    land({ kind: "ok" });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(docs.has(user.uid)).toBe(false);
    expect(progress.getSnapshot().saveKind).toBe("loading");
  });
});

describe("a blank reset meets a copy of this version (#558)", () => {
  it("a device that played is ahead of one that reset to a blank mountain", async () => {
    const storage = createMemoryStorage();
    olderBackup(storage, 700);
    const played = { ...minedMountain(50), startedAt: 700 };
    const docs = new Map<string, Mountain>([[user.uid, played]]);
    const progress = signedIn(createMemoryCloudSave({ docs }), storage);
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    expect(progress.getSnapshot().mountain).toBe(played);
    expect(docs.get(user.uid)).toBe(played);
    progress.dispose();
  });

  it("a blank reset meets a cloud copy of this version that ties it", async () => {
    const storage = createMemoryStorage();
    olderBackup(storage, 700);
    const tied = { ...createMountain(), startedAt: 700 };
    const docs = new Map<string, Mountain>([[user.uid, tied]]);
    const progress = signedIn(createMemoryCloudSave({ docs }), storage);
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    expect(progress.getSnapshot().mountain).toBe(tied);
    expect(docs.get(user.uid)).toBe(tied);
    progress.dispose();
  });
});

describe("a set-aside never costs a played copy (#558)", () => {
  it("a played copy of this version is kept, at the later run stamp", async () => {
    const storage = createMemoryStorage();
    olderBackup(storage, 500);
    storage.setItem(SESSION_SAVE_KEY, saveText(minedMountain(5_000), 9));
    const docs = new Map<string, Mountain>();
    const progress = signedIn(createMemoryCloudSave({ docs }), storage);
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    expect(minedOut(progress.getSnapshot().mountain)).toBe(5_000);
    expect(progress.getSnapshot().mountain.startedAt).toBe(500);
    expect(storage.getItem(BACKUP_KEY) ?? "").toContain('"startedAt":500');
    await vi.waitFor(() => {
      expect(minedOut(docs.get(user.uid) ?? createMountain())).toBe(5_000);
    });
    progress.dispose();
  });

  it("a move aside that fails keeps the old text where it was", () => {
    const storage = createMemoryStorage();
    const raw = JSON.stringify({ version: 7, lastSeen: 1, startedAt: 40 });
    storage.setItem(SESSION_SAVE_KEY, raw);
    const full = refusing(storage, ":v7");
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: full,
    });
    progress.dispatch({ kind: "dig" });
    progress.flush();
    progress.dispose();
    expect(storage.getItem(SESSION_SAVE_KEY)).toBe(raw);
    expect(progress.getSnapshot().log).toContain("error save.error set-aside");
    expect(
      progress.fieldLog().events.filter((event) => event.code === "save.error"),
    ).toEqual([expect.objectContaining({ data: { source: "set-aside" } })]);
  });

  it("a phone backup that cannot move aside keeps its old text, signed in", async () => {
    const storage = createMemoryStorage();
    const raw = olderBackup(storage, 500);
    const full = refusing(storage, ":v7");
    const docs = new Map<string, Mountain>();
    const progress = signedIn(createMemoryCloudSave({ docs }), full);
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    progress.dispatch({ kind: "dig" });
    progress.flush();
    await vi.waitFor(() => {
      expect(minedOut(docs.get(user.uid) ?? createMountain())).toBe(1);
    });
    expect(storage.getItem(BACKUP_KEY)).toBe(raw);
    progress.dispose();
  });
});

/** A phone that is full for any key ending in the suffix. */
function refusing(storage: Storage, suffix: string): Storage {
  return {
    get length() {
      return storage.length;
    },
    clear: () => {
      storage.clear();
    },
    key: (index) => storage.key(index),
    getItem: (key) => storage.getItem(key),
    removeItem: (key) => {
      storage.removeItem(key);
    },
    setItem: (key, value) => {
      if (key.endsWith(suffix)) {
        throw new Error("QuotaExceededError");
      }
      storage.setItem(key, value);
    },
  };
}
