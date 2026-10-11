import { describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import {
  createMemoryCloudSave,
  createUnavailableCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import { createMountain, type Mountain } from "./mountain";
import { minedMountain } from "./test-fixtures";
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
  it("starts unsigned with a full mountain", () => {
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: createMemoryStorage(),
    });

    expect(progress.getSnapshot()).toMatchObject({
      mountain: createMountain(),
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
    const dug = minedMountain(1);

    progress.applyMutation(dug);

    expect(progress.getSnapshot().saveKind).toBe("session");
    expect(progress.getSnapshot().mountain).toEqual(dug);
    expect(readSessionSave({ storage })?.mountain).toEqual(dug);
    expect(progress.getSnapshot().log).toContain("save.session ok");

    progress.dispose();
    const restored = createProgressStore({
      auth,
      sessionStorage: storage,
    });
    expect(restored.getSnapshot().mountain).toEqual(dug);
    expect(restored.getSnapshot().saveKind).toBe("session");
    expect(restored.getSnapshot().log).toContain("save.session resume");
  });

  it("loads the cloud mountain after sign-in", async () => {
    const remote = minedMountain(9);
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
    expect(progress.getSnapshot().mountain).toEqual(remote);
    expect(progress.getSnapshot().ready).toBe(true);
    expect(progress.getSnapshot().log).toContain("save.remote found");
  });

  it("uploads a session dig when the cloud has no save", async () => {
    const docs = new Map<string, Mountain>();
    const auth = createMemoryAuth();
    const progress = createProgressStore({
      auth,
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: createMemoryStorage(),
    });
    progress.applyMutation(minedMountain(1));

    await auth.signIn();

    await vi.waitFor(() => {
      expect(docs.get("test-dad")?.pocket).toBe(1);
    });
    expect(progress.getSnapshot().saveKind).toBe("account");
  });

  it("writes a mutation to the cloud while signed in", async () => {
    const docs = new Map<string, Mountain>();
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: createMemoryStorage(),
      cloudWriteGapMs: 0,
    });

    await vi.waitFor(() => {
      expect(docs.has("test-dad")).toBe(true);
    });

    progress.applyMutation(minedMountain(1));

    expect(docs.get("test-dad")?.pocket).toBe(1);
  });

  it("keeps the session mountain when the cloud is down", async () => {
    const auth = createMemoryAuth();
    const progress = createProgressStore({
      auth,
      cloudSave: createUnavailableCloudSave(),
      sessionStorage: createMemoryStorage(),
    });
    const dug = minedMountain(1);
    progress.applyMutation(dug);

    await auth.signIn();
    await Promise.resolve();

    expect(progress.getSnapshot().mountain).toEqual(dug);
    expect(progress.getSnapshot().saveKind).toBe("error");
    expect(progress.getSnapshot().ready).toBe(false);
    expect(progress.getSnapshot().log).toContain("save.remote unavailable");
  });

  it("ignores mutations until the cloud save has loaded", async () => {
    let finishLoad: (result: CloudLoadResult) => void = () => {
      throw new Error("load was not pending");
    };
    const docs = new Map<string, Mountain>();
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: ({ uid, mountain }) => {
        docs.set(uid, mountain);
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

    progress.applyMutation(minedMountain(1));
    expect(progress.getSnapshot().mountain).toEqual(createMountain());
    expect(progress.getSnapshot().ready).toBe(false);

    finishLoad({
      kind: "found",
      mountain: minedMountain(9),
    });
    await Promise.resolve();

    expect(progress.getSnapshot().mountain.pocket).toBe(9);
    expect(progress.getSnapshot().ready).toBe(true);
  });

  it("shows the same cloud mountain on a second signed-in store", async () => {
    const docs = new Map<string, Mountain>();
    const cloudSave = createMemoryCloudSave({ docs });
    const user = { uid: "test-dad", label: "Test Dad" };
    const first = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave,
      sessionStorage: createMemoryStorage(),
      cloudWriteGapMs: 0,
    });
    const second = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave,
      sessionStorage: createMemoryStorage(),
      cloudWriteGapMs: 0,
    });

    await vi.waitFor(() => {
      expect(first.getSnapshot().saveKind).toBe("account");
      expect(second.getSnapshot().saveKind).toBe("account");
    });

    first.applyMutation(minedMountain(1));

    await vi.waitFor(() => {
      expect(second.getSnapshot().mountain.pocket).toBe(1);
    });
  });

  it("writes the cloud mountain on flush", async () => {
    const docs = new Map<string, Mountain>();
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: createMemoryStorage(),
    });

    await vi.waitFor(() => {
      expect(docs.has("test-dad")).toBe(true);
    });

    progress.applyMutation(minedMountain(1));
    docs.delete("test-dad");
    progress.flush();
    expect(docs.get("test-dad")?.pocket).toBe(1);
  });

  it("clears the tab scratch on sign-in and restores it on sign-out", async () => {
    const storage = createMemoryStorage();
    const docs = new Map<string, Mountain>();
    const auth = createMemoryAuth();
    const progress = createProgressStore({
      auth,
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: storage,
    });
    const dug = minedMountain(4);
    progress.applyMutation(dug);

    await auth.signIn();
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    expect(readSessionSave({ storage })).toBeUndefined();

    await auth.signOut();
    expect(progress.getSnapshot().mountain).toEqual(dug);
    expect(progress.getSnapshot().saveKind).toBe("session");
    expect(readSessionSave({ storage })?.mountain).toEqual(dug);
  });

  it("does not write unsigned digs to a signed-in session scratch", async () => {
    const storage = createMemoryStorage();
    const docs = new Map<string, Mountain>();
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: storage,
      cloudWriteGapMs: 0,
    });

    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    progress.applyMutation(minedMountain(2));

    expect(readSessionSave({ storage })).toBeUndefined();
    expect(docs.get("test-dad")?.pocket).toBe(2);
  });
});

describe("cloud write throttle", () => {
  it("writes the first tap at once, folds a burst into one trailing write, and ignores stale echoes meanwhile", async () => {
    vi.useFakeTimers();
    try {
      const writes: Mountain[] = [];
      let push: (remote: CloudLoadResult) => void = () => undefined;
      const cloudSave: CloudSave = {
        load: () => Promise.resolve({ kind: "missing" }),
        write: ({ mountain }) => {
          writes.push(mountain);
          return Promise.resolve({ kind: "ok" });
        },
        watch: ({ onChange }) => {
          push = onChange;
          onChange({ kind: "found", mountain: createMountain() });
          return () => undefined;
        },
      };
      let clock = 10_000;
      const user = { uid: "test-dad", label: "Test Dad" };
      const progress = createProgressStore({
        auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
        cloudSave,
        sessionStorage: createMemoryStorage(),
        now: () => clock,
        cloudWriteGapMs: 1000,
      });

      progress.applyMutation(minedMountain(1));
      expect(writes).toEqual([minedMountain(1)]);
      await Promise.resolve();

      for (let taps = 2; taps <= 5; taps += 1) {
        clock += 100;
        progress.applyMutation(minedMountain(taps));
      }
      expect(writes).toHaveLength(1);

      push({ kind: "found", mountain: minedMountain(1) });
      expect(progress.getSnapshot().mountain).toEqual(minedMountain(5));

      clock += 500;
      await vi.advanceTimersByTimeAsync(500);
      expect(writes).toHaveLength(1);
      clock += 400;
      await vi.advanceTimersByTimeAsync(400);
      expect(writes).toEqual([minedMountain(1), minedMountain(5)]);
      progress.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("flush writes a pending burst immediately", async () => {
    vi.useFakeTimers();
    try {
      const docs = new Map<string, Mountain>();
      const user = { uid: "test-dad", label: "Test Dad" };
      const progress = createProgressStore({
        auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
        cloudSave: createMemoryCloudSave({ docs }),
        sessionStorage: createMemoryStorage(),
        now: () => 5_000,
      });
      await vi.waitFor(() => {
        expect(docs.has("test-dad")).toBe(true);
      });
      progress.applyMutation(minedMountain(1));
      progress.applyMutation(minedMountain(2));
      expect(docs.get("test-dad")).toEqual(createMountain());

      progress.flush();
      expect(docs.get("test-dad")).toEqual(minedMountain(2));
      await vi.advanceTimersByTimeAsync(2000);
      expect(docs.get("test-dad")).toEqual(minedMountain(2));
      progress.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
