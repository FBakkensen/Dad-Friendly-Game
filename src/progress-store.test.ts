import { describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import { buyBoost } from "./boosts";
import {
  createMemoryCloudSave,
  createUnavailableCloudSave,
  type CloudLoadResult,
  type CloudSave,
  type CloudWriteResult,
} from "./cloud-save";
import {
  APP_VERSION,
  FIELD_LOG_WRITE_GAP_MS,
  fieldLogWithinBudget,
  type FieldLogDocument,
} from "./field-log";
import { createMountain, mineByHand, type Mountain } from "./mountain";
import { minedMountain, unstaffedSave } from "./test-fixtures";
import { effectiveRates } from "./rates";
import { WELCOME_MIN_AWAY_MS, createProgressStore } from "./progress-store";
import { readSessionSave, writeSessionSave } from "./session-save";
import { buyTier } from "./tiers";
import { buyUpgrade } from "./upgrades";
import { mineVein } from "./veins";

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

    progress.applyMutation(() => dug);

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
    progress.applyMutation(() => minedMountain(1));

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

    progress.applyMutation(() => minedMountain(1));

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
    progress.applyMutation(() => dug);

    await auth.signIn();
    await Promise.resolve();

    expect(progress.getSnapshot().mountain).toEqual(dug);
    expect(progress.getSnapshot().saveKind).toBe("error");
    expect(progress.getSnapshot().ready).toBe(false);
    expect(progress.getSnapshot().log).toContain("save.remote unavailable");
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "save.error",
        data: { source: "unavailable" },
      }),
    );
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
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
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

    progress.applyMutation(() => minedMountain(1));
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

    first.applyMutation(() => minedMountain(1));

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

    progress.applyMutation(() => minedMountain(1));
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
    progress.applyMutation(() => dug);

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
    progress.applyMutation(() => minedMountain(2));

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
        writeFieldLog: () => Promise.resolve({ kind: "ok" }),
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

      progress.applyMutation(() => minedMountain(1));
      expect(writes).toEqual([minedMountain(1)]);
      await Promise.resolve();

      for (let taps = 2; taps <= 5; taps += 1) {
        clock += 100;
        progress.applyMutation(() => minedMountain(taps));
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
      progress.applyMutation(() => minedMountain(1));
      progress.applyMutation(() => minedMountain(2));
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

describe("helpers mining live", () => {
  it("ticks helpers' stones into the snapshot without saving, then saves on flush", () => {
    const storage = createMemoryStorage();
    let clock = 1_000;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    progress.applyMutation(() => ({
      remaining: 500,
      pocket: 0,
      helpers: 3,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
    }));

    clock += 2_500;
    progress.tick();
    expect(progress.getSnapshot().mountain.pocket).toBe(6);
    expect(readSessionSave({ storage })?.mountain.pocket).toBe(0);

    progress.flush();
    expect(readSessionSave({ storage })).toEqual({
      mountain: {
        remaining: 494,
        pocket: 6,
        helpers: 3,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      },
      lastSeen: 3_000,
    });
  });

  it("settles helpers' work before a player action so a hire sees the latest pocket", () => {
    let clock = 0;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: createMemoryStorage(),
      now: () => clock,
    });
    progress.applyMutation(() => ({
      remaining: 500,
      pocket: 0,
      helpers: 1,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
    }));
    clock += 10_000;

    let seen = -1;
    progress.applyMutation((mountain) => {
      seen = mountain.pocket;
      return mountain;
    });
    expect(seen).toBe(10);
    expect(progress.getSnapshot().mountain.pocket).toBe(10);
  });

  it("does not tick before the cloud save has loaded", () => {
    let clock = 0;
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: {
        load: () => Promise.resolve({ kind: "missing" }),
        write: () => Promise.resolve({ kind: "ok" }),
        writeFieldLog: () => Promise.resolve({ kind: "ok" }),
        watch: () => () => undefined,
      },
      sessionStorage: createMemoryStorage(),
      now: () => clock,
    });
    const listener = vi.fn();
    progress.subscribe(listener);
    clock += 5_000;
    progress.tick();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("away earnings", () => {
  const crew = {
    remaining: 100_000_000,
    pocket: 5,
    helpers: 3,
    carts: 0,
    drills: 0,
    borers: 0,
    machines: 0,
    kids: 0,
  };

  it("pays a guest 30% of the crew's speed for time away, saves it, and shows the card only once", () => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: crew, lastSeen: 0 });
    let clock = 10 * 60_000;

    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(progress.getSnapshot().mountain.pocket).toBe(5 + 540);
    expect(progress.getSnapshot().away).toEqual({
      mined: 540,
      awayMs: 600_000,
      capped: false,
      heart: 1,
    });
    expect(readSessionSave({ storage })).toEqual({
      mountain: {
        remaining: 100_000_000 - 540,
        pocket: 545,
        helpers: 3,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
        staffed: 2,
      },
      lastSeen: 600_000,
    });

    progress.dismissAway();
    expect(progress.getSnapshot().away).toBeUndefined();
    progress.dispose();

    clock += 500;
    const reopened = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(reopened.getSnapshot().away).toBeUndefined();
    expect(reopened.getSnapshot().mountain.pocket).toBe(545);
  });

  it("shows no card when nothing was mined", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...crew, helpers: 0 },
      lastSeen: 0,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 3_600_000,
    });
    expect(progress.getSnapshot().away).toBeUndefined();
    expect(progress.getSnapshot().mountain.pocket).toBe(5);
  });

  it("pays a signed-in dad from the cloud save once and writes it back", async () => {
    const docs = new Map<string, Mountain>();
    const cloud = createMemoryCloudSave({ docs });
    await cloud.write({ uid: "test-dad", mountain: crew, lastSeen: 0 });
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => 80_000,
      cloudWriteGapMs: 0,
    });

    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    expect(progress.getSnapshot().away?.mined).toBe(72);
    expect(docs.get("test-dad")?.pocket).toBe(77);
    expect(progress.getSnapshot().mountain.pocket).toBe(77);
  });

  it("pays time in the background like time away, not as live play", () => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: crew, lastSeen: 0 });
    let clock = 0;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    clock = 1_000;
    progress.tick();
    expect(progress.getSnapshot().mountain.pocket).toBe(5 + 3);
    // Phone locked for five minutes: ticks stop, then one late tick.
    clock += 5 * 60_000;
    progress.tick();
    expect(progress.getSnapshot().mountain.pocket).toBe(5 + 3 + 270);
  });

  it("keeps the crew mining after the clock is set back (#116)", () => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: crew, lastSeen: 0 });
    let clock = 0;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    clock = 1_000;
    progress.tick();
    expect(progress.getSnapshot().mountain.pocket).toBe(5 + 3);
    // The phone's clock jumps back an hour (time zone fix, manual change).
    clock -= 60 * 60_000;
    progress.tick();
    expect(progress.getSnapshot().mountain.pocket).toBe(5 + 3);
    clock += 1_000;
    progress.tick();
    expect(progress.getSnapshot().mountain.pocket).toBe(5 + 3 + 3);
  });

  it("doesn't save a future lastSeen after the clock is set back (#116)", () => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: crew, lastSeen: 0 });
    let clock = 0;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    clock = -60 * 60_000;
    progress.tick();
    progress.flush();
    const saved = readSessionSave({ storage });
    expect(saved?.lastSeen).toBeLessThanOrEqual(clock);
  });

  it("pays a short absence quietly, with no welcome-back card", () => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: crew, lastSeen: 0 });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => WELCOME_MIN_AWAY_MS - 1_000,
    });
    expect(progress.getSnapshot().away).toBeUndefined();
    expect(progress.getSnapshot().mountain.pocket).toBe(5 + 53);
  });

  it("pays another device's save silently after the first load", async () => {
    let push: (remote: CloudLoadResult) => void = () => undefined;
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        push = onChange;
        onChange({ kind: "found", mountain: crew, lastSeen: 50_000 });
        return () => undefined;
      },
    };
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave,
      sessionStorage: createMemoryStorage(),
      now: () => 50_000,
    });
    expect(progress.getSnapshot().away).toBeUndefined();

    await Promise.resolve();
    push({ kind: "found", mountain: crew, lastSeen: 40_000 });
    await Promise.resolve();
    expect(progress.getSnapshot().mountain.pocket).toBe(5 + 9);
    expect(progress.getSnapshot().away).toBeUndefined();
  });
});

describe("relic reveals", () => {
  it("celebrates the Lantern when a tap crosses its depth, once", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: minedMountain(999_999),
      lastSeen: 0,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 0,
    });
    expect(progress.getSnapshot().revealed).toBeUndefined();

    progress.applyMutation(() => minedMountain(1_000_000));
    expect(progress.getSnapshot().revealed?.id).toBe("lantern");
    expect(progress.getSnapshot().log).toContain("relic.found lantern");

    progress.dismissReveal();
    expect(progress.getSnapshot().revealed).toBeUndefined();
    progress.applyMutation(() => minedMountain(1_000_001));
    expect(progress.getSnapshot().revealed).toBeUndefined();
  });

  it("does not celebrate relics already in a loaded save", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: minedMountain(15_000_000),
      lastSeen: 0,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 0,
    });
    expect(progress.getSnapshot().revealed).toBeUndefined();
  });

  it("celebrates a relic the crew uncovered while away", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(999_000), helpers: 10 },
      lastSeen: 0,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 400_000,
    });
    expect(progress.getSnapshot().away?.mined).toBe(1_200);
    expect(progress.getSnapshot().revealed?.id).toBe("lantern");
  });

  it("does not celebrate relics in a signed-in dad's cloud save", async () => {
    const docs = new Map([["test-dad", minedMountain(15_000_000)]]);
    const user = { uid: "test-dad", label: "Test Dad" };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: createMemoryStorage(),
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    expect(progress.getSnapshot().revealed).toBeUndefined();
  });

  it("queues several relics found at once, shallowest first", () => {
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: createMemoryStorage(),
      now: () => 0,
    });
    progress.applyMutation(() => minedMountain(12_000_000));
    expect(progress.getSnapshot().revealed?.id).toBe("lantern");
    progress.dismissReveal();
    expect(progress.getSnapshot().revealed?.id).toBe("shield");
    progress.dismissReveal();
    expect(progress.getSnapshot().revealed).toBeUndefined();
  });
});

describe("start over", () => {
  const signedInCloud = (start: Mountain) => {
    const writes: Mountain[] = [];
    let push: (remote: CloudLoadResult) => void = () => undefined;
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: ({ mountain }) => {
        writes.push(mountain);
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        push = onChange;
        onChange({ kind: "found", mountain: start, lastSeen: 0 });
        return () => undefined;
      },
    };
    return {
      writes,
      cloudSave,
      push: (remote: CloudLoadResult) => {
        push(remote);
      },
    };
  };
  const user = { uid: "test-dad", label: "Test Dad" };

  it("gives a guest a fresh mountain on the device, with no reveal or welcome", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(2_000_000),
        helpers: 5,
        carts: 2,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
        legacy: 2,
      },
      lastSeen: 0,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 60_000,
    });
    expect(progress.getSnapshot().away).toBeDefined();

    progress.startOver();

    const fresh = { ...createMountain(), startedAt: 60_000 };
    expect(progress.getSnapshot().mountain).toEqual(fresh);
    expect(progress.getSnapshot().away).toBeUndefined();
    expect(progress.getSnapshot().revealed).toBeUndefined();
    expect(readSessionSave({ storage })).toEqual({
      mountain: fresh,
      lastSeen: 60_000,
    });
  });

  it("writes the fresh mountain to the cloud at once, even inside the write throttle", async () => {
    const cloud = signedInCloud(minedMountain(5_000_000));
    let clock = 10_000;
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud.cloudSave,
      sessionStorage: createMemoryStorage(),
      now: () => clock,
      cloudWriteGapMs: 1000,
    });
    progress.applyMutation((mountain) => ({
      ...mountain,
      pocket: mountain.pocket + 1,
    }));
    await Promise.resolve();
    clock += 10;

    progress.startOver();

    expect(cloud.writes.at(-1)).toEqual({
      ...createMountain(),
      startedAt: 10_010,
    });
    expect(progress.getSnapshot().mountain.remaining).toBe(
      createMountain().remaining,
    );
  });

  it("passes the mine to your kid only at the bottom, saving the Legacy at once (#131)", () => {
    const cloud = signedInCloud(minedMountain(99_999_999));
    let clock = 10_000;
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud.cloudSave,
      sessionStorage: createMemoryStorage(),
      now: () => clock,
      cloudWriteGapMs: 60_000,
    });
    expect(progress.passTheMine()).toBe(false);
    progress.applyMutation((mountain) => ({ ...mountain, remaining: 0 }));
    clock += 10;

    expect(progress.passTheMine()).toBe(true);

    const fresh = { ...createMountain(), legacy: 1, startedAt: 10_010 };
    expect(progress.getSnapshot().mountain).toEqual(fresh);
    expect(progress.getSnapshot().revealed).toBeUndefined();
    expect(cloud.writes.at(-1)).toEqual(fresh);
    // A late snapshot of the finished run can't bring it back.
    cloud.push({
      kind: "found",
      mountain: minedMountain(100_000_000),
      lastSeen: 0,
    });
    expect(progress.getSnapshot().mountain.legacy).toBe(1);
  });

  it("ignores a stale snapshot from before the reset and re-uploads the new run", async () => {
    vi.useFakeTimers();
    try {
      const cloud = signedInCloud(minedMountain(5_000_000));
      const progress = createProgressStore({
        auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
        cloudSave: cloud.cloudSave,
        sessionStorage: createMemoryStorage(),
        now: () => Date.now(),
        cloudWriteGapMs: 0,
      });
      progress.startOver();
      await Promise.resolve();
      const writesAfterReset = cloud.writes.length;

      cloud.push({
        kind: "found",
        mountain: minedMountain(5_000_000),
        lastSeen: 0,
      });

      expect(progress.getSnapshot().mountain.remaining).toBe(
        createMountain().remaining,
      );
      expect(progress.getSnapshot().revealed).toBeUndefined();
      expect(cloud.writes.length).toBe(writesAfterReset + 1);
      expect(cloud.writes.at(-1)?.startedAt).toBeDefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it("adopts another device's newer run", () => {
    const cloud = signedInCloud({ ...minedMountain(5_000_000), startedAt: 1 });
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud.cloudSave,
      sessionStorage: createMemoryStorage(),
      now: () => 0,
    });
    const newer = { ...minedMountain(3), startedAt: 2 };
    cloud.push({ kind: "found", mountain: newer, lastSeen: 0 });
    expect(progress.getSnapshot().mountain).toEqual(newer);
  });
});

describe("one-time free helpers for saves from before staffing (#89)", () => {
  const oldSave = (fields: Partial<Mountain>): Mountain => {
    return unstaffedSave({
      ...minedMountain(1_000),
      ...fields,
    });
  };

  it("staffs a guest save on load, saves the mark, and never repeats", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: oldSave({ helpers: 2, carts: 3, drills: 1 }),
      lastSeen: 0,
    });
    const first = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 0,
    });
    expect(first.getSnapshot().crewJoined).toBe(4);
    expect(first.getSnapshot().mountain.helpers).toBe(6);
    expect(first.getSnapshot().mountain.staffed).toBe(2);
    expect(readSessionSave({ storage })?.mountain).toMatchObject({
      helpers: 6,
      staffed: 2,
    });
    first.dismissAway();
    expect(first.getSnapshot().crewJoined).toBeUndefined();
    first.dispose();

    const again = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 0,
    });
    expect(again.getSnapshot().crewJoined).toBeUndefined();
    expect(again.getSnapshot().mountain.helpers).toBe(6);
  });

  it("pays away time with the newly staffed crew", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: oldSave({ helpers: 0, carts: 10 }),
      lastSeen: 0,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 100_000,
    });
    // 10 helpers + 10 carts = 110/s, 100 s away at 30%.
    expect(progress.getSnapshot().away?.mined).toBe(3_300);
    expect(progress.getSnapshot().crewJoined).toBe(10);
  });

  it("staffs a cloud save on load and writes it back marked", async () => {
    const docs = new Map([["test-dad", oldSave({ helpers: 1, borers: 2 })]]);
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
    expect(progress.getSnapshot().crewJoined).toBe(15);
    progress.flush();
    await vi.waitFor(() => {
      expect(docs.get("test-dad")).toMatchObject({ helpers: 16, staffed: 2 });
    });
  });

  it("leaves Start over alone: a fresh mountain is already marked", () => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: minedMountain(5), lastSeen: 0 });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 0,
    });
    expect(progress.getSnapshot().crewJoined).toBeUndefined();
    progress.startOver();
    expect(progress.getSnapshot().mountain).toMatchObject({
      helpers: 0,
      staffed: 2,
    });
  });
});

describe("save status on the unhappy paths (#114 coverage)", () => {
  const user = { uid: "test-dad", label: "Test Dad" };

  it("shows an error and logs it when a cloud write fails", async () => {
    const docs = new Map([["test-dad", minedMountain(5)]]);
    const memory = createMemoryCloudSave({ docs });
    const failing: CloudSave = {
      ...memory,
      write: () => Promise.resolve({ kind: "failed", message: "denied" }),
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: failing,
      sessionStorage: createMemoryStorage(),
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    progress.applyMutation((current) => ({ ...current, pocket: 99 }));
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("error");
    });
    expect(progress.getSnapshot().log).toContain("save.write denied");
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "save.error",
        data: { source: "write" },
      }),
    );
    progress.dispose();
  });

  it("shows an error when the cloud is switched off for a signed-in dad", async () => {
    const disabled: CloudSave = {
      load: () => Promise.resolve({ kind: "disabled" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        onChange({ kind: "disabled" });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: disabled,
      sessionStorage: createMemoryStorage(),
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("error");
    });
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "save.error",
        data: { source: "disabled" },
      }),
    );
    progress.dispose();
  });

  it("keeps playing, unsigned, when the device refuses to save", () => {
    const full = createMemoryStorage();
    full.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const refused = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: full,
    });
    refused.applyMutation(() => minedMountain(2));
    expect(refused.getSnapshot().saveKind).toBe("unsigned");
    expect(refused.getSnapshot().mountain).toEqual(minedMountain(2));
    expect(refused.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "save.error",
        data: { source: "session" },
      }),
    );
  });

  it("ignores a cloud snapshot from a watch that was already replaced", async () => {
    const callbacks: ((remote: CloudLoadResult) => void)[] = [];
    const cloud: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        callbacks.push(onChange);
        return () => undefined;
      },
    };
    const auth = createMemoryAuth();
    const progress = createProgressStore({
      auth,
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
    });
    await auth.signIn();
    await auth.signOut();
    await auth.signIn();
    await vi.waitFor(() => {
      expect(callbacks).toHaveLength(2);
    });
    callbacks[0]?.({ kind: "found", mountain: minedMountain(77) });
    expect(progress.getSnapshot().mountain).not.toEqual(minedMountain(77));
    callbacks[1]?.({ kind: "found", mountain: minedMountain(88) });
    expect(progress.getSnapshot().mountain.pocket).toBe(88);
    progress.dispose();
    callbacks[1]?.({ kind: "found", mountain: minedMountain(99) });
    expect(progress.getSnapshot().mountain.pocket).toBe(88);
  });

  it("treats dismissing nothing, and starting over after dispose, as no-ops", () => {
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: createMemoryStorage(),
    });
    progress.applyMutation(() => minedMountain(3));
    const before = progress.getSnapshot();
    progress.dismissReveal();
    progress.dismissAway();
    expect(progress.getSnapshot()).toEqual(before);
    progress.dispose();
    progress.startOver();
    expect(progress.getSnapshot().mountain).toEqual(minedMountain(3));
  });
});

describe("field log", () => {
  const guest = (now?: () => number) =>
    createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: createMemoryStorage(),
      ...(now === undefined ? {} : { now }),
    });

  it("ignores a plain tap and an unaffordable buy", () => {
    const progress = guest();
    progress.applyMutation((mountain) => mineByHand(mountain));
    progress.applyMutation(
      (mountain) => buyTier(mountain, "helper"),
      "vein.tap",
    );
    expect(progress.fieldLog().events).toEqual([]);
    expect(progress.fieldLog().snapshot.version).toBe(APP_VERSION);
  });

  it("records a tier buy, an upgrade, and a boost with its end time", () => {
    const at = 1_000_000;
    const progress = guest(() => at);
    progress.applyMutation((mountain) =>
      buyTier({ ...mountain, pocket: 20 }, "helper"),
    );
    progress.applyMutation((mountain) =>
      buyUpgrade({ ...mountain, pocket: 5_000 }, "tap"),
    );
    progress.applyMutation((mountain) => {
      const rich = { ...mountain, pocket: 1_000 };
      return buyBoost({
        mountain: rich,
        id: "sharper",
        now: at,
        pricing: effectiveRates(rich),
      });
    });
    progress.applyMutation((mountain) => mountain);

    const codes = progress.fieldLog().events.map((event) => event.code);
    expect(codes).toEqual(["tier.buy", "upgrade.buy", "boost.start"]);
    expect(progress.fieldLog().events[0]?.data).toEqual({
      id: "helper",
      count: 1,
    });
    expect(progress.fieldLog().events[1]?.data).toEqual({
      id: "tap",
      count: 1,
    });
    const endsAt = progress.getSnapshot().mountain.boosts?.sharper;
    expect(endsAt).toBeTypeOf("number");
    expect(progress.fieldLog().events[2]?.data).toEqual({
      id: "sharper",
      endsAt: new Date(endsAt ?? 0).toISOString(),
    });
  });

  it("does not record a boost whose end time did not change", () => {
    const progress = guest(() => 5_000);
    const endsAt = 9_000;
    progress.applyMutation((mountain) => ({
      ...mountain,
      boosts: { sharper: endsAt },
    }));
    progress.applyMutation((mountain) => ({
      ...mountain,
      boosts: { sharper: endsAt },
    }));
    expect(
      progress
        .fieldLog()
        .events.filter((event) => event.code === "boost.start"),
    ).toHaveLength(1);
  });

  it("records a vein tap's stones, a relic, and an away report", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...createMountain(), helpers: 1 },
      lastSeen: 0,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 120_000,
    });
    progress.applyMutation((mountain) => mineVein(mountain), "vein.tap");
    progress.applyMutation(() => minedMountain(1_000_000));

    const events = progress.fieldLog().events;
    expect(events.map((event) => event.code)).toEqual([
      "away.report",
      "vein.tap",
      "relic.found",
    ]);
    expect(events[0]?.data).toEqual({ ms: 120_000, stones: 36 });
    expect(events[1]?.data).toEqual({ stones: 60 });
    expect(events[2]?.data).toEqual({ id: "lantern" });
  });

  it("records Start over and passing the mine, each on a fresh ring", () => {
    const progress = guest(() => 8_000);
    progress.applyMutation((mountain) =>
      buyTier({ ...mountain, pocket: 20 }, "helper"),
    );
    progress.startOver();
    expect(progress.fieldLog().events.map((event) => event.code)).toEqual([
      "run.start-over",
    ]);
    progress.applyMutation((mountain) => ({ ...mountain, remaining: 0 }));
    expect(progress.passTheMine()).toBe(true);
    expect(progress.passTheMine()).toBe(false);
    expect(progress.fieldLog().events.map((event) => event.code)).toEqual([
      "run.pass",
    ]);
  });

  it("copies the newest 50 events", () => {
    const progress = guest();
    for (let count = 1; count <= 60; count += 1) {
      const next = count;
      progress.applyMutation((mountain) => ({ ...mountain, helpers: next }));
    }
    const events = progress.fieldLog().events;
    expect(events).toHaveLength(50);
    expect(events[0]?.data).toEqual({ id: "helper", count: 11 });
    expect(events.at(-1)?.data).toEqual({ id: "helper", count: 60 });
  });

  it("keeps the ring in memory, not in the save", () => {
    const storage = createMemoryStorage();
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 1,
    });
    progress.applyMutation((mountain) =>
      buyTier({ ...mountain, pocket: 20 }, "helper"),
    );
    expect(progress.fieldLog().events).toHaveLength(1);
    expect(JSON.stringify(readSessionSave({ storage }))).not.toContain(
      "tier.buy",
    );
    progress.dispose();

    const again = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 1,
    });
    expect(again.fieldLog().events).toEqual([]);
    expect(again.getSnapshot().mountain.helpers).toBe(1);
  });

  it("leaves email and display name out of the log", () => {
    const progress = guest();
    const text = JSON.stringify(progress.fieldLog());
    expect(text).not.toContain("@");
    expect(text).not.toContain("displayName");
    expect(text).not.toContain("email");
  });
});

describe("field log cloud copy", () => {
  const user = { uid: "test-dad", label: "Test Dad" };

  const signedIn = (now: () => number) => {
    const fieldLogs = new Map<string, FieldLogDocument>();
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({
        docs: new Map([[user.uid, createMountain()]]),
        fieldLogs,
      }),
      sessionStorage: createMemoryStorage(),
      now,
    });
    return { fieldLogs, progress };
  };

  it("writes nothing for a guest", () => {
    const fieldLogs = new Map<string, FieldLogDocument>();
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      cloudSave: createMemoryCloudSave({ fieldLogs }),
      sessionStorage: createMemoryStorage(),
      now: () => 1,
    });
    progress.applyMutation((mountain) => ({ ...mountain, pocket: 1 }));
    progress.startOver();
    progress.flush();
    expect(fieldLogs.size).toBe(0);
    progress.dispose();
  });

  it("waits out the gap, writes on hide, and skips an unchanged copy", () => {
    let clock = 0;
    const { fieldLogs, progress } = signedIn(() => clock);
    expect(fieldLogs.size).toBe(0);

    progress.applyMutation((mountain) => ({ ...mountain, pocket: 1 }));
    expect(fieldLogs.get(user.uid)?.snapshot.pocket).toBe(1);
    expect(fieldLogs.get(user.uid)?.updatedAt).toBe(0);

    clock += 1_000;
    progress.applyMutation((mountain) => ({ ...mountain, pocket: 2 }));
    expect(fieldLogs.get(user.uid)?.snapshot.pocket).toBe(1);

    progress.flush();
    expect(fieldLogs.get(user.uid)?.snapshot.pocket).toBe(2);
    expect(fieldLogs.get(user.uid)?.updatedAt).toBe(clock);

    const writtenAt = fieldLogs.get(user.uid)?.updatedAt;
    progress.flush();
    expect(fieldLogs.get(user.uid)?.updatedAt).toBe(writtenAt);

    clock += FIELD_LOG_WRITE_GAP_MS;
    progress.applyMutation((mountain) => ({ ...mountain, pocket: 3 }));
    expect(fieldLogs.get(user.uid)?.snapshot.pocket).toBe(3);
    expect(fieldLogs.get(user.uid)?.updatedAt).toBe(clock);
    progress.dispose();
  });

  it("resets the ring and overwrites the doc on Start over and passing the mine", () => {
    let clock = 8_000;
    const { fieldLogs, progress } = signedIn(() => clock);
    progress.applyMutation((mountain) => ({ ...mountain, helpers: 4 }));
    expect(fieldLogs.get(user.uid)?.events.map((event) => event.code)).toEqual([
      "tier.buy",
    ]);

    clock += 10;
    progress.startOver();
    expect(progress.fieldLog().events.map((event) => event.code)).toEqual([
      "run.start-over",
    ]);
    expect(fieldLogs.get(user.uid)?.events.map((event) => event.code)).toEqual([
      "run.start-over",
    ]);
    expect(fieldLogs.get(user.uid)?.snapshot.crew.helper).toBe(0);
    const resetAt = fieldLogs.get(user.uid)?.updatedAt;
    progress.startOver();
    expect(fieldLogs.get(user.uid)?.updatedAt).toBe(resetAt);

    progress.applyMutation((mountain) => ({ ...mountain, remaining: 0 }));
    expect(progress.passTheMine()).toBe(true);
    const passed = fieldLogs.get(user.uid);
    expect(passed?.events.map((event) => event.code)).toEqual(["run.pass"]);
    expect(passed?.snapshot.legacy).toBe(1);
    expect(passed?.updatedAt).toBe(clock);
    progress.dispose();
  });

  it("copies the whole ring on hide, not just the menu's 50", () => {
    const { fieldLogs, progress } = signedIn(() => 50_000);
    for (let count = 1; count <= 201; count += 1) {
      progress.applyMutation((mountain) => ({ ...mountain, helpers: count }));
    }
    expect(fieldLogs.get(user.uid)?.events).toHaveLength(1);
    expect(progress.fieldLog().events).toHaveLength(50);

    progress.flush();
    const log = fieldLogs.get(user.uid);
    expect(log?.events).toHaveLength(200);
    expect(log?.events[0]?.data).toEqual({ id: "helper", count: 2 });
    expect(log?.events.at(-1)?.data).toEqual({ id: "helper", count: 201 });
    expect(log).toBeDefined();
    if (log !== undefined) {
      expect(fieldLogWithinBudget(log)).toBe(true);
    }
    progress.dispose();
  });

  it("keeps the account save when the field log is refused, then retries on hide", async () => {
    let fail = true;
    let calls = 0;
    const cloud: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => {
        calls += 1;
        return Promise.resolve(
          fail ? { kind: "failed", message: "denied" } : { kind: "ok" },
        );
      },
      watch: ({ onChange }) => {
        onChange({ kind: "found", mountain: createMountain(), lastSeen: 1 });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => 1,
    });
    progress.applyMutation((mountain) => ({ ...mountain, pocket: 4 }));
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(progress.getSnapshot().saveKind).toBe("account");
    expect(progress.getSnapshot().log).toContain("field-log.write denied");
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "save.error",
        data: { source: "field-log" },
      }),
    );

    fail = false;
    progress.flush();
    await Promise.resolve();
    expect(calls).toBe(2);
    progress.dispose();
  });

  it("drops a field-log result that lands after dispose or sign-out", async () => {
    let finish: (result: CloudWriteResult) => void = () => undefined;
    const cloud: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      watch: ({ onChange }) => {
        onChange({ kind: "found", mountain: createMountain(), lastSeen: 1 });
        return () => undefined;
      },
    };
    const auth = createMemoryAuth({
      state: { kind: "signed-in", user },
      user,
    });
    const progress = createProgressStore({
      auth,
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => 1,
    });
    progress.applyMutation((mountain) => ({ ...mountain, pocket: 2 }));
    progress.dispose();
    finish({ kind: "failed", message: "denied" });
    await Promise.resolve();
    expect(progress.fieldLog().events).toEqual([]);

    const again = createProgressStore({
      auth,
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => 1,
    });
    again.applyMutation((mountain) => ({ ...mountain, pocket: 3 }));
    await auth.signOut();
    finish({ kind: "failed", message: "denied" });
    await Promise.resolve();
    expect(
      again
        .fieldLog()
        .events.some((event) => event.data.source === "field-log"),
    ).toBe(false);
    again.dispose();
  });
});
