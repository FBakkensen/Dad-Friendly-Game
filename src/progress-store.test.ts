import { describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import {
  createMemoryCloudSave,
  createUnavailableCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import { combine, createPocketGrid, dig, place, type PocketGrid } from "./grid";
import { createProgressStore } from "./progress-store";
import { readSessionSave } from "./session-save";

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

describe("createProgressStore", () => {
  it("starts unsigned with an empty grid", () => {
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: createMemoryStorage(),
    });

    expect(progress.getSnapshot()).toMatchObject({
      grid: createPocketGrid(),
      saveKind: "unsigned",
      ready: true,
    });
  });

  it("writes unsigned digs to this tab and restores them", () => {
    const storage = createMemoryStorage();
    const auth = createMemoryAuth();
    const progress = createProgressStore({
      auth,
      sessionStorage: storage,
    });
    const dug = dig({ grid: createPocketGrid(), index: 0 });

    progress.applyMutation(dug);

    expect(progress.getSnapshot().saveKind).toBe("session");
    expect(progress.getSnapshot().grid).toEqual(dug);
    expect(readSessionSave({ storage })?.grid).toEqual(dug);
    expect(progress.getSnapshot().log).toContain("save.session ok");

    progress.dispose();
    const restored = createProgressStore({
      auth,
      sessionStorage: storage,
    });
    expect(restored.getSnapshot().grid).toEqual(dug);
    expect(restored.getSnapshot().saveKind).toBe("session");
    expect(restored.getSnapshot().log).toContain("save.session resume");
  });

  it("loads the cloud grid after sign-in", async () => {
    const remote = dig({ grid: createPocketGrid(), index: 8 });
    const docs = new Map([["test-dad", remote]]);
    const auth = createMemoryAuth();
    const progress = createProgressStore({
      auth,
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: createMemoryStorage(),
    });

    await auth.signIn();

    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    expect(progress.getSnapshot().grid).toEqual(remote);
    expect(progress.getSnapshot().ready).toBe(true);
    expect(progress.getSnapshot().log).toContain("save.remote found");
  });

  it("uploads a session dig when the cloud has no save", async () => {
    const docs = new Map<string, PocketGrid>();
    const auth = createMemoryAuth();
    const progress = createProgressStore({
      auth,
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: createMemoryStorage(),
    });
    progress.applyMutation(dig({ grid: createPocketGrid(), index: 0 }));

    await auth.signIn();

    await vi.waitFor(() => {
      expect(docs.get("test-dad")?.cells[0]).toEqual({ kind: "dug" });
    });
    expect(progress.getSnapshot().saveKind).toBe("account");
  });

  it("writes a mutation to the cloud while signed in", async () => {
    const docs = new Map<string, PocketGrid>();
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: createMemoryStorage(),
    });

    await vi.waitFor(() => {
      expect(docs.has("test-dad")).toBe(true);
    });

    progress.applyMutation(dig({ grid: createPocketGrid(), index: 0 }));

    expect(docs.get("test-dad")?.cells[0]).toEqual({ kind: "dug" });
  });

  it("writes a placed stone and a combined chunk", async () => {
    const docs = new Map<string, PocketGrid>();
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: createMemoryStorage(),
    });

    await vi.waitFor(() => {
      expect(docs.has("test-dad")).toBe(true);
    });

    const first = place({
      grid: dig({ grid: createPocketGrid(), index: 0 }),
      index: 0,
    });
    progress.applyMutation(first);
    expect(docs.get("test-dad")?.cells[0]).toEqual({ kind: "stone" });

    const two = place({
      grid: dig({ grid: first, index: 1 }),
      index: 1,
    });
    const fused = combine({ grid: two, from: 0, to: 1 });
    progress.applyMutation(fused);
    expect(docs.get("test-dad")?.cells[0]).toEqual({ kind: "dug" });
    expect(docs.get("test-dad")?.cells[1]).toEqual({ kind: "chunk" });
  });

  it("keeps the session grid when the cloud is down", async () => {
    const auth = createMemoryAuth();
    const progress = createProgressStore({
      auth,
      cloudSave: createUnavailableCloudSave(),
      sessionStorage: createMemoryStorage(),
    });
    const dug = dig({ grid: createPocketGrid(), index: 0 });
    progress.applyMutation(dug);

    await auth.signIn();
    await Promise.resolve();

    expect(progress.getSnapshot().grid).toEqual(dug);
    expect(progress.getSnapshot().saveKind).toBe("error");
    expect(progress.getSnapshot().ready).toBe(false);
    expect(progress.getSnapshot().log).toContain("save.remote unavailable");
  });

  it("ignores mutations until the cloud save has loaded", async () => {
    let finishLoad: (result: CloudLoadResult) => void = () => {
      throw new Error("load was not pending");
    };
    const docs = new Map<string, PocketGrid>();
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: ({ uid, grid }) => {
        docs.set(uid, grid);
        return Promise.resolve({ kind: "ok" });
      },
      watch: ({ onChange }) => {
        finishLoad = onChange;
        return () => {
          return;
        };
      },
    };
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave,
      sessionStorage: createMemoryStorage(),
    });

    progress.applyMutation(dig({ grid: createPocketGrid(), index: 0 }));
    expect(progress.getSnapshot().grid).toEqual(createPocketGrid());
    expect(progress.getSnapshot().ready).toBe(false);

    finishLoad({
      kind: "found",
      grid: dig({ grid: createPocketGrid(), index: 8 }),
    });
    await Promise.resolve();

    expect(progress.getSnapshot().grid.cells[8]).toEqual({ kind: "dug" });
    expect(progress.getSnapshot().ready).toBe(true);
  });

  it("shows the same cloud grid on a second signed-in store", async () => {
    const docs = new Map<string, PocketGrid>();
    const cloudSave = createMemoryCloudSave({ docs });
    const user = { uid: "test-dad", label: "Test Dad" };
    const first = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave,
      sessionStorage: createMemoryStorage(),
    });
    const second = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave,
      sessionStorage: createMemoryStorage(),
    });

    await vi.waitFor(() => {
      expect(first.getSnapshot().saveKind).toBe("account");
      expect(second.getSnapshot().saveKind).toBe("account");
    });

    first.applyMutation(dig({ grid: createPocketGrid(), index: 0 }));

    await vi.waitFor(() => {
      expect(second.getSnapshot().grid.cells[0]).toEqual({ kind: "dug" });
    });
  });

  it("writes the cloud grid on flush", async () => {
    const docs = new Map<string, PocketGrid>();
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: createMemoryStorage(),
    });

    await vi.waitFor(() => {
      expect(docs.has("test-dad")).toBe(true);
    });

    progress.applyMutation(dig({ grid: createPocketGrid(), index: 0 }));
    docs.delete("test-dad");
    progress.flush();
    expect(docs.get("test-dad")?.cells[0]).toEqual({ kind: "dug" });
  });

  it("clears the tab scratch on sign-in and restores it on sign-out", async () => {
    const storage = createMemoryStorage();
    const docs = new Map<string, PocketGrid>();
    const auth = createMemoryAuth();
    const progress = createProgressStore({
      auth,
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: storage,
    });
    const dug = dig({ grid: createPocketGrid(), index: 3 });
    progress.applyMutation(dug);

    await auth.signIn();
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    expect(readSessionSave({ storage })).toBeUndefined();

    await auth.signOut();
    expect(progress.getSnapshot().grid).toEqual(dug);
    expect(progress.getSnapshot().saveKind).toBe("session");
    expect(readSessionSave({ storage })?.grid).toEqual(dug);
  });

  it("does not write unsigned digs to a signed-in session scratch", async () => {
    const storage = createMemoryStorage();
    const docs = new Map<string, PocketGrid>();
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: storage,
    });

    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    progress.applyMutation(dig({ grid: createPocketGrid(), index: 1 }));

    expect(readSessionSave({ storage })).toBeUndefined();
    expect(docs.get("test-dad")?.cells[1]).toEqual({ kind: "dug" });
  });

  it("settles stones while away and stamps the return moment", async () => {
    const docs = new Map<string, PocketGrid>();
    const cloud = createMemoryCloudSave({ docs });
    const awayGrid = (() => {
      let g = createPocketGrid();
      for (const index of [0, 1] as const) {
        g = dig({ grid: g, index });
      }
      return g;
    })();
    const oldSeen = 1_000_000;
    await cloud.write({ uid: "test-dad", grid: awayGrid, lastSeen: oldSeen });

    // 11 minutes away: two settle intervals, so two stones.
    let clock = oldSeen + 11 * 60 * 1000;
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      now: () => clock,
    });

    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    expect(progress.getSnapshot().grid.cells[0]).toEqual({ kind: "stone" });
    expect(progress.getSnapshot().awayNote).toContain("2 stones settled in");

    clock += 60 * 1000;
    progress.flush();
    await vi.waitFor(() => {
      expect(docs.get("test-dad")?.cells[0]).toEqual({ kind: "stone" });
    });
    progress.dispose();
  });
});
