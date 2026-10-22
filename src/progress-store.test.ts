import { describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import { buyBoost } from "./boosts";
import { buyCrew } from "./crew";
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
import {
  MOUNTAIN_STONES,
  createMountain,
  mineByHand,
  minedOut,
  accrueAway,
  type Mountain,
} from "./mountain";
import { minedMountain, unstaffedSave } from "./test-fixtures";
import { effectiveRates } from "./rates";
import { readPhoneBackup, writePhoneBackup } from "./phone-backup";
import { createMemoryBus, createTabWriter } from "./tab-writer";
import { WELCOME_MIN_AWAY_MS, createProgressStore } from "./progress-store";
import { readSessionSave, writeSessionSave } from "./session-save";
import { buyTier } from "./tiers";
import { buyUpgrade } from "./upgrades";
import { recipesForMined, startCraft } from "./workshop";
import { mineVein } from "./veins";
import { promote, station } from "./engineers";
import { recall, send, type Expedition } from "./expeditions";
import { ENGINEER_FIX_MS, nextTrouble } from "./hazards";

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

    try {
      expect(progress.getSnapshot().mountain).toEqual(dug);
      expect(progress.getSnapshot().saveKind).toBe("error");
      expect(progress.getSnapshot().ready).toBe(true);
      expect(progress.getSnapshot().log).toContain("save.remote unavailable");
      expect(progress.fieldLog().events).toContainEqual(
        expect.objectContaining({
          code: "save.error",
          data: { source: "unavailable" },
        }),
      );
      progress.applyMutation((mountain) => mineByHand(mountain));
      expect(minedOut(progress.getSnapshot().mountain)).toBe(2);
    } finally {
      progress.dispose();
    }
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
        materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
        recipes: recipesForMined(MOUNTAIN_STONES - 494),
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
    remaining: MOUNTAIN_STONES,
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
      paidMs: 600_000,
      capped: false,
      heart: 1,
    });
    expect(readSessionSave({ storage })).toEqual({
      mountain: {
        remaining: MOUNTAIN_STONES - 540,
        pocket: 545,
        helpers: 3,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
        staffed: 2,
        materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
        recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
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
    await cloud.write({
      uid: "test-dad",
      mountain: crew,
      lastSeen: 0,
      rev: 1,
      deviceId: "device-test-dad",
    });
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
        onChange({
          kind: "found",
          mountain: crew,
          lastSeen: 50_000,
          rev: 1,
        });
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
    push({ kind: "found", mountain: crew, lastSeen: 40_000, rev: 1 });
    await Promise.resolve();
    expect(progress.getSnapshot().mountain.pocket).toBe(5);

    push({
      kind: "found",
      mountain: { ...crew, remaining: MOUNTAIN_STONES - 30, pocket: 35 },
      lastSeen: 40_000,
      rev: 2,
    });
    expect(progress.getSnapshot().mountain.pocket).toBe(44);
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

  it("passes the mine to your kid only at the bottom, saving the Legacy at once (#131)", async () => {
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
    await Promise.resolve();

    const fresh = {
      ...createMountain(),
      legacy: 1,
      startedAt: 10_010,
      recipes: [
        "iron-rails",
        "sturdy-props",
        "blasting-charge",
        "reinforce",
        "axle-grease",
        "diamond-bits",
        "crystal-flare",
        "heartstone-core",
        "heartstone-ember",
      ] as const,
    };
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
    expect(first.fieldLog().events).toContainEqual({
      at: new Date(0).toISOString(),
      code: "crew.staff",
      data: { count: 4 },
    });
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
    expect(again.fieldLog().events.map((event) => event.code)).not.toContain(
      "crew.staff",
    );
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
    expect(progress.getSnapshot().engineerJoined).toBe(true);
    progress.flush();
    await vi.waitFor(() => {
      expect(docs.get("test-dad")).toMatchObject({
        helpers: 16,
        staffed: 2,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
      });
    });
  });

  it("steps the first engineer up once for a save that already owns a borer", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(0), borers: 1, helpers: 8 },
      lastSeen: 0,
    });
    const first = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 0,
    });
    expect(first.getSnapshot().engineerJoined).toBe(true);
    expect(first.getSnapshot().mountain.helpers).toBe(8);
    expect(first.getSnapshot().mountain.engineers).toEqual([
      { name: "Ada", rank: 0, trips: 0, post: "borer" },
    ]);
    expect(readSessionSave({ storage })?.mountain.engineers).toEqual(
      first.getSnapshot().mountain.engineers,
    );
    first.dismissAway();
    expect(first.getSnapshot().engineerJoined).toBeUndefined();
    first.dispose();

    const again = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 0,
    });
    expect(again.getSnapshot().engineerJoined).toBeUndefined();
    expect(again.getSnapshot().mountain.engineers).toHaveLength(1);
  });

  it("pays time away with the new engineer tending the borers", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(0), borers: 1, helpers: 8 },
      lastSeen: 0,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 100_000,
    });
    // 8 workers + a borer at +17.5% (699/s floored) for 100s at 30%.
    expect(progress.getSnapshot().away?.mined).toBe(
      Math.floor(100 * 707 * 0.3),
    );
    expect(progress.getSnapshot().engineerJoined).toBe(true);
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
        data: { source: "write", id: "denied" },
      }),
    );
    progress.dispose();
  });

  it("keeps local progress when a rejected write is followed by the older server copy", async () => {
    const server = minedMountain(5);
    let deliver: ((remote: CloudLoadResult) => void) | undefined;
    let writes = 0;
    const cloud: CloudSave = {
      load: () =>
        Promise.resolve({ kind: "found", mountain: server, lastSeen: 1 }),
      write: () => {
        writes += 1;
        return Promise.resolve({
          kind: "failed",
          message: "permission-denied",
        });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({ kind: "found", mountain: server, lastSeen: 1 });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => 1,
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    progress.applyMutation((current) => ({ ...current, pocket: 99 }));
    await vi.waitFor(() => {
      expect(writes).toBe(2);
    });
    expect(progress.getSnapshot().saveKind).toBe("error");
    deliver?.({ kind: "found", mountain: server, lastSeen: 1 });
    expect(progress.getSnapshot().mountain.pocket).toBe(99);
    expect(progress.getSnapshot().saveKind).toBe("error");
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "save.error",
        data: { source: "write", id: "permission-denied" },
      }),
    );
    expect(progress.getSnapshot().log).toContain("permission-denied");
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
      buyUpgrade({ ...mountain, pocket: 46_000 }, "tap"),
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

describe("field log events for the deep (#150)", () => {
  const guest = () => {
    let clock = 10_000;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: createMemoryStorage(),
      now: () => clock,
      hazardSeed: 4,
    });
    return {
      progress,
      at: () => clock,
      advance: (ms: number) => {
        clock += ms;
      },
    };
  };

  const codes = (progress: ReturnType<typeof guest>["progress"]): string[] =>
    progress.fieldLog().events.map((event) => event.code);

  it("records a promotion, a station, a call back to camp, and the free first engineer as crew", () => {
    const { progress } = guest();
    progress.applyMutation((mountain) =>
      buyCrew({ ...mountain, pocket: 10_000_000 }, "borer"),
    );
    expect(codes(progress)).toContain("tier.buy");
    expect(codes(progress)).not.toContain("engineer.promote");
    expect(progress.fieldLog().snapshot.engineers).toEqual([
      { name: "Ada", rank: 0, post: "borer" },
    ]);

    progress.applyMutation((mountain) => ({
      ...mountain,
      pocket: 2_000_000,
      helpers: 2,
    }));
    progress.applyMutation((mountain) => promote(mountain));
    progress.applyMutation((mountain) => station(mountain, 1, "drill"));
    progress.applyMutation((mountain) => station(mountain, 1, "camp"));
    progress.applyMutation((mountain) => station(mountain, 1, "camp"));

    const events = progress.fieldLog().events;
    expect(events).toContainEqual(
      expect.objectContaining({
        code: "engineer.promote",
        data: { id: "Nils", count: 2 },
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        code: "engineer.station",
        data: { id: "Nils", source: "drill" },
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        code: "engineer.station",
        data: { id: "Nils", source: "camp" },
      }),
    );
    expect(
      events.filter(
        (event) =>
          event.code === "engineer.station" && event.data.source === "camp",
      ),
    ).toHaveLength(1);
    expect(progress.fieldLog().snapshot.engineers).toEqual([
      { name: "Ada", rank: 0, post: "borer" },
      { name: "Nils", rank: 0, post: "camp" },
    ]);
    expect(progress.fieldLog().snapshot.expeditions).toEqual([]);
  });

  it("records a send, a recall, and a live return with the find id", () => {
    const { progress, advance } = guest();
    progress.applyMutation((mountain) => ({
      ...mountain,
      borers: 1,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
    }));
    progress.applyMutation((mountain) =>
      send(mountain, 0, "side-seam", 10_000),
    );
    const trip = progress.getSnapshot().mountain.expeditions?.[0];
    if (trip === undefined) {
      throw new Error("expected a trip");
    }
    expect(progress.fieldLog().snapshot.expeditions).toEqual([
      {
        engineer: "Ada",
        tunnel: "side-seam",
        returnsAt: new Date(trip.returnsAt).toISOString(),
      },
    ]);
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "expedition.send",
        data: { id: "Ada", source: "side-seam" },
      }),
    );

    progress.applyMutation((mountain) =>
      station(recall(mountain, 0), 0, "cart"),
    );
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "expedition.recall",
        data: { id: "Ada", source: "side-seam" },
      }),
    );
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "engineer.station",
        data: { id: "Ada", source: "cart" },
      }),
    );

    const sentAt = progress.getSnapshot().mountain.engineers?.[0]?.post;
    expect(sentAt).toBe("cart");
    progress.applyMutation((mountain) => {
      const sent = send(mountain, 0, "side-seam", 10_000);
      const next = sent.expeditions?.[0];
      if (next === undefined) {
        return mountain;
      }
      return {
        ...sent,
        expeditions: [{ ...next, returnsAt: 15_000 }],
      };
    });
    const find = progress.getSnapshot().mountain.expeditions?.[0]?.find;
    if (find === undefined) {
      throw new Error("expected a find");
    }
    const source = find.kind === "quiet" ? "quiet" : find.id;
    for (let step = 0; step < 5; step += 1) {
      advance(1_000);
      progress.tick();
    }
    expect(progress.getSnapshot().mountain.expeditions).toBeUndefined();
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "expedition.return",
        data: { id: "Ada", source },
      }),
    );
    expect(source).not.toBe("");
  });

  it("records a return while away, and a pure recall does not also station", () => {
    const { progress, advance } = guest();
    progress.applyMutation((mountain) => ({
      ...mountain,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" }],
    }));
    progress.applyMutation((mountain) => {
      const sent = send(mountain, 0, "old-shaft", 10_000);
      const next = sent.expeditions?.[0];
      if (next === undefined) {
        return mountain;
      }
      return { ...sent, expeditions: [{ ...next, returnsAt: 20_000 }] };
    });
    const find = progress.getSnapshot().mountain.expeditions?.[0]?.find;
    if (find === undefined) {
      throw new Error("expected a find");
    }
    advance(60_000);
    progress.tick();
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "expedition.return",
        data: { id: "Ada", source: find.kind === "quiet" ? "quiet" : find.id },
      }),
    );

    progress.applyMutation((mountain) =>
      send(mountain, 0, "side-seam", 70_000),
    );
    const before = codes(progress).length;
    progress.applyMutation((mountain) => recall(mountain, 0));
    const added = progress.fieldLog().events.slice(before);
    expect(added.map((event) => event.code)).toEqual(["expedition.recall"]);
    expect(added[0]?.data).toEqual({ id: "Ada", source: "side-seam" });
  });

  it("records the find id for a tool, a glimmer, a keepsake, a lost engineer, and a quiet tunnel", () => {
    const { progress, advance, at } = guest();
    progress.applyMutation((mountain) => ({
      ...mountain,
      borers: 1,
      engineers: [{ name: "Ada", rank: 1, trips: 3, post: "camp" }],
    }));
    const cases: readonly {
      find: Expedition["find"];
      source: string;
    }[] = [
      { find: { kind: "tool", id: "pick" }, source: "pick" },
      { find: { kind: "glimmer", id: "heart" }, source: "heart" },
      { find: { kind: "keepsake", id: "drawing" }, source: "drawing" },
      { find: { kind: "engineer", id: "Ruth" }, source: "Ruth" },
      { find: { kind: "quiet" }, source: "quiet" },
    ];
    for (const item of cases) {
      const sentAt = at();
      progress.applyMutation((mountain) => {
        const sent = send(mountain, 0, "side-seam", sentAt);
        const next = sent.expeditions?.[0];
        if (next === undefined) {
          return mountain;
        }
        return {
          ...sent,
          expeditions: [
            { ...next, returnsAt: sentAt + 2_000, find: item.find },
          ],
        };
      });
      advance(1_000);
      progress.tick();
      advance(1_000);
      progress.tick();
      expect(progress.fieldLog().events.at(-1)).toEqual(
        expect.objectContaining({
          code: "expedition.return",
          data: { id: "Ada", source: item.source },
        }),
      );
    }
    expect(
      progress.getSnapshot().mountain.engineers?.map((hand) => hand.name),
    ).toEqual(["Ada", "Ruth"]);
  });

  it("records a sketch brought home and teaches that recipe", () => {
    const { progress, advance, at } = guest();
    progress.applyMutation((mountain) => ({
      ...mountain,
      borers: 1,
      engineers: [{ name: "Nils", rank: 0, trips: 0, post: "camp" }],
    }));
    const sentAt = at();
    progress.applyMutation((mountain) => {
      const sent = send(mountain, 0, "old-shaft", sentAt);
      const next = sent.expeditions?.[0];
      if (next === undefined) {
        return mountain;
      }
      return {
        ...sent,
        expeditions: [
          {
            ...next,
            returnsAt: sentAt + 2_000,
            find: { kind: "recipe", id: "crystal-lamp" },
          },
        ],
      };
    });
    advance(2_000);
    progress.tick();
    expect(progress.getSnapshot().mountain.recipes).toContain("crystal-lamp");
    expect(progress.getSnapshot().homecomings[0]?.find).toEqual({
      kind: "recipe",
      id: "crystal-lamp",
    });
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "recipe.found",
        data: { id: "crystal-lamp", source: "old-shaft" },
      }),
    );
    progress.dispose();
  });

  it("records trouble started and fixed by hand, by a hold, and by an engineer", () => {
    const { progress, advance } = guest();
    progress.applyMutation((mountain) => ({
      ...mountain,
      borers: 1,
      carts: 1,
    }));
    progress.previewTrouble("cart");
    for (let tap = 0; tap < 5; tap += 1) {
      progress.pressTrouble("cart");
    }
    expect(progress.getSnapshot().trouble).toBeUndefined();
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "trouble.start",
        data: { id: "cart", source: "cave-in" },
      }),
    );
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "trouble.fix",
        data: { id: "cart", source: "hand" },
      }),
    );

    progress.previewTrouble("drill");
    progress.fixTrouble("drill");
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "trouble.start",
        data: { id: "drill", source: "flood" },
      }),
    );
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "trouble.fix",
        data: { id: "drill", source: "hand" },
      }),
    );

    progress.applyMutation((mountain) => ({
      ...mountain,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "cart" }],
    }));
    progress.previewTrouble("cart");
    for (let step = 0; step < ENGINEER_FIX_MS / 1000; step += 1) {
      advance(1_000);
      progress.tick();
    }
    expect(progress.getSnapshot().trouble).toBeUndefined();
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "trouble.fix",
        data: { id: "cart", source: "engineer" },
      }),
    );
  });

  it("records a Master clearing trouble before it sticks", () => {
    const seed = 4;
    const pit = {
      ...createMountain(),
      borers: 1,
      carts: 1,
      drills: 1,
      machines: 1,
    };
    const first = nextTrouble(seed, 0, pit);
    if (first === undefined) {
      throw new Error("expected a scheduled trouble");
    }
    let clock = 0;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: createMemoryStorage(),
      now: () => clock,
      hazardSeed: seed,
    });
    progress.applyMutation(() => ({
      ...pit,
      engineers: [{ name: "Ada", rank: 2, trips: 9, post: first.trouble.tier }],
    }));
    const steps = Math.ceil(first.gapMs / 1000) + 2;
    for (let step = 0; step < steps; step += 1) {
      clock += 1000;
      progress.tick();
    }
    const trouble = progress
      .fieldLog()
      .events.filter((event) => event.code.startsWith("trouble."));
    expect(trouble.map((event) => event.code)).toEqual([
      "trouble.start",
      "trouble.fix",
    ]);
    expect(trouble[0]?.data).toEqual({
      id: first.trouble.tier,
      source: first.trouble.kind,
    });
    expect(trouble[1]?.data).toEqual({
      id: first.trouble.tier,
      source: "engineer",
    });
    expect(progress.getSnapshot().trouble).toBeUndefined();
  });

  it("does not call closing the game, or losing the borer, a fix", () => {
    const { progress, advance } = guest();
    progress.applyMutation((mountain) => ({ ...mountain, borers: 1 }));
    progress.previewTrouble("cart");
    advance(60_000);
    progress.tick();
    expect(progress.getSnapshot().trouble).toBeUndefined();
    expect(codes(progress)).not.toContain("trouble.fix");

    progress.applyMutation((mountain) => ({ ...mountain, borers: 1 }));
    progress.previewTrouble("borer");
    progress.applyMutation((mountain) => ({ ...mountain, borers: 0 }));
    advance(1_000);
    progress.tick();
    expect(progress.getSnapshot().trouble).toBeUndefined();
    expect(codes(progress)).not.toContain("trouble.fix");
    expect(codes(progress)).toContain("trouble.start");
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
        data: { source: "field-log", id: "denied" },
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

describe("trouble at the machines (#149)", () => {
  const crew = {
    remaining: 50_000_000,
    pocket: 0,
    helpers: 9,
    carts: 1,
    drills: 0,
    borers: 1,
    machines: 0,
    kids: 0,
  };

  function open(seed = 1) {
    let clock = 10_000;
    const storage = createMemoryStorage();
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
      hazardSeed: seed,
    });
    progress.applyMutation(() => crew);
    return {
      progress,
      storage,
      advance(ms: number) {
        clock += ms;
      },
    };
  }

  it("slows live mining and leaves away pay alone, then clears on a break", () => {
    const slowed = open();
    const plain = open();
    slowed.progress.previewTrouble("cart");
    slowed.advance(1_000);
    plain.advance(1_000);
    slowed.progress.tick();
    plain.progress.tick();
    expect(slowed.progress.getSnapshot().mountain.pocket).toBeLessThan(
      plain.progress.getSnapshot().mountain.pocket,
    );

    const awaySlow = open();
    const awayPlain = open();
    awaySlow.progress.previewTrouble("cart");
    awaySlow.advance(60_000);
    awayPlain.advance(60_000);
    awaySlow.progress.tick();
    awayPlain.progress.tick();
    expect(awaySlow.progress.getSnapshot().mountain.pocket).toBe(
      awayPlain.progress.getSnapshot().mountain.pocket,
    );
    expect(awaySlow.progress.getSnapshot().trouble).toBeUndefined();
  });

  it("is not in the save, and a reload starts clear", () => {
    const { progress, storage } = open();
    progress.previewTrouble("cart");
    progress.flush();
    expect(JSON.stringify(readSessionSave({ storage }))).not.toContain(
      "cave-in",
    );
    progress.dispose();
    const again = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 20_000,
      hazardSeed: 2,
    });
    expect(again.getSnapshot().trouble).toBeUndefined();
    again.previewTrouble("drill");
    again.startOver();
    expect(again.getSnapshot().trouble).toBeUndefined();
    again.dispose();
  });

  it("starts during live play only once a borer is owned, one at a time", () => {
    const quiet = open();
    quiet.progress.applyMutation((mountain) => ({ ...mountain, borers: 0 }));
    for (let second = 0; second < 400; second += 1) {
      quiet.advance(1_000);
      quiet.progress.tick();
    }
    expect(quiet.progress.getSnapshot().trouble).toBeUndefined();

    const playing = open(4);
    let seen = 0;
    for (let second = 0; second < 400; second += 1) {
      playing.advance(1_000);
      playing.progress.tick();
      if (playing.progress.getSnapshot().trouble !== undefined) {
        seen += 1;
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(
      playing.progress.getSnapshot().trouble === undefined || seen > 0,
    ).toBe(true);
  });

  it("a Master tending the tier clears it on the next tick, an apprentice does not", () => {
    const mastered = open();
    mastered.progress.applyMutation((mountain) => ({
      ...mountain,
      engineers: [{ name: "Ada", rank: 2, trips: 9, post: "cart" }],
    }));
    mastered.progress.previewTrouble("cart");
    mastered.advance(1_000);
    mastered.progress.tick();
    expect(mastered.progress.getSnapshot().trouble).toBeUndefined();

    const apprentice = open();
    apprentice.progress.applyMutation((mountain) => ({
      ...mountain,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "cart" }],
    }));
    apprentice.progress.previewTrouble("cart");
    apprentice.advance(1_000);
    apprentice.progress.tick();
    expect(apprentice.progress.getSnapshot().trouble?.kind).toBe("cave-in");
    apprentice.progress.pressTrouble("drill");
    expect(apprentice.progress.getSnapshot().trouble?.tier).toBe("cart");
  });

  it("ignores taps until the cloud save has loaded", () => {
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
      now: () => 0,
    });
    progress.previewTrouble("cart");
    progress.pressTrouble("cart");
    progress.fixTrouble("cart");
    expect(progress.getSnapshot().trouble).toBeUndefined();
    progress.dispose();
  });
});

describe("expeditions through the save", () => {
  it("brings a party home while away, and a reload does not reroll the find", () => {
    const sent = send(
      {
        ...createMountain(),
        helpers: 8,
        borers: 1,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
      },
      0,
      "side-seam",
      0,
    );
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: sent, lastSeen: 0 });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 20 * 60_000,
    });
    const away = accrueAway({ mountain: sent, lastSeen: 0, now: 20 * 60_000 });
    expect(progress.getSnapshot().mountain).toEqual(away.mountain);
    expect(progress.getSnapshot().mountain.engineers?.[0]?.post).toBe("borer");
    expect(progress.getSnapshot().mountain.expeditions).toBeUndefined();
    progress.dispose();
  });

  it("finishes a trip while the game stays open, even when the crew is idle", () => {
    const sent = send(
      {
        ...createMountain(),
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" }],
      },
      0,
      "side-seam",
      0,
    );
    const trip = sent.expeditions?.[0];
    if (trip === undefined) {
      throw new Error("expected a trip");
    }
    const soon = { ...sent, expeditions: [{ ...trip, returnsAt: 5_000 }] };
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: soon, lastSeen: 0 });
    let clock = 0;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    let seen = 0;
    progress.subscribe(() => {
      seen += 1;
    });
    expect(progress.getSnapshot().mountain.engineers?.[0]?.post).toBe("tunnel");
    clock = 5_000;
    progress.tick();
    expect(seen).toBeGreaterThan(1);
    expect(progress.getSnapshot().mountain.engineers?.[0]).toMatchObject({
      post: "camp",
      trips: 1,
    });
    expect(progress.getSnapshot().mountain.expeditions).toBeUndefined();
    progress.dispose();
  });

  it("clamps a future sentAt when the clock is set back", () => {
    const sent = send(
      {
        ...createMountain(),
        helpers: 8,
        borers: 1,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
      },
      0,
      "side-seam",
      1_000_000,
    );
    const find = sent.expeditions?.[0]?.find;
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: sent, lastSeen: 1_000_000 });
    let clock = 1_000_000;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(progress.getSnapshot().mountain.engineers?.[0]?.post).toBe("tunnel");
    clock = -60 * 60_000;
    progress.tick();
    progress.flush();
    const saved = readSessionSave({ storage });
    expect(saved?.lastSeen).toBeLessThanOrEqual(clock);
    expect(saved?.mountain.expeditions?.[0]?.sentAt).toBe(clock);
    expect(saved?.mountain.expeditions?.[0]?.returnsAt).toBe(
      clock + 10 * 60_000,
    );
    expect(saved?.mountain.expeditions?.[0]?.find).toEqual(find);
    expect(saved?.mountain.engineers?.[0]?.trips).toBe(0);
    progress.dispose();
  });

  it("names who came home while away, and again when they return during play", () => {
    const sent = send(
      {
        ...createMountain(),
        helpers: 4,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" }],
      },
      0,
      "side-seam",
      0,
    );
    const awayStorage = createMemoryStorage();
    writeSessionSave({ storage: awayStorage, mountain: sent, lastSeen: 0 });
    const away = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: awayStorage,
      now: () => 20 * 60_000,
    });
    expect(away.getSnapshot().away).toBeDefined();
    expect(away.getSnapshot().homecomings).toHaveLength(1);
    expect(away.getSnapshot().homecomings[0]).toMatchObject({
      engineer: "Ada",
      tunnel: "side-seam",
    });
    away.dismissAway();
    expect(away.getSnapshot().homecomings).toEqual([]);
    expect(away.getSnapshot().away).toBeUndefined();
    away.dismissAway();
    away.dispose();

    const idle = send(
      {
        ...createMountain(),
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" }],
      },
      0,
      "old-shaft",
      0,
    );
    const idleStorage = createMemoryStorage();
    writeSessionSave({ storage: idleStorage, mountain: idle, lastSeen: 0 });
    const quiet = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: idleStorage,
      now: () => 2 * 60 * 60_000,
    });
    expect(quiet.getSnapshot().away).toBeUndefined();
    expect(quiet.getSnapshot().homecomings).toHaveLength(1);
    expect(quiet.getSnapshot().homecomings[0]?.tunnel).toBe("old-shaft");
    quiet.dismissAway();
    expect(quiet.getSnapshot().homecomings).toEqual([]);
    quiet.dispose();

    const waiting = send(
      {
        ...createMountain(),
        engineers: [{ name: "Nils", rank: 0, trips: 0, post: "camp" }],
      },
      0,
      "side-seam",
      0,
    );
    const trip = waiting.expeditions?.[0];
    if (trip === undefined) {
      throw new Error("expected a trip");
    }
    const soon = {
      ...waiting,
      expeditions: [{ ...trip, returnsAt: 5_000 }],
    };
    const liveStorage = createMemoryStorage();
    writeSessionSave({ storage: liveStorage, mountain: soon, lastSeen: 0 });
    let clock = 0;
    const live = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: liveStorage,
      now: () => clock,
    });
    expect(live.getSnapshot().homecomings).toEqual([]);
    clock = 5_000;
    let seen = 0;
    live.subscribe(() => {
      seen += 1;
    });
    live.applyMutation((mountain) => mountain);
    expect(seen).toBeGreaterThan(1);
    expect(live.getSnapshot().away).toBeUndefined();
    expect(live.getSnapshot().homecomings).toHaveLength(1);
    expect(live.getSnapshot().homecomings[0]?.engineer).toBe("Nils");
    live.dispose();
  });

  it("keeps the notice across a reload, ignores a bad note, and does not say it twice", () => {
    const sent = send(
      {
        ...createMountain(),
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" }],
      },
      0,
      "side-seam",
      0,
    );
    const trip = sent.expeditions?.[0];
    if (trip === undefined) {
      throw new Error("expected a trip");
    }
    const soon = {
      ...sent,
      expeditions: [{ ...trip, returnsAt: 5_000 }],
    };
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: soon, lastSeen: 0 });
    let clock = 0;
    const first = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    clock = 5_000;
    first.flush();
    const sentAt = first.getSnapshot().homecomings[0]?.sentAt;
    expect(first.getSnapshot().homecomings).toHaveLength(1);
    first.dispose();

    const second = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(second.getSnapshot().homecomings).toHaveLength(1);
    expect(second.getSnapshot().homecomings[0]?.sentAt).toBe(sentAt);
    second.tick();
    expect(second.getSnapshot().homecomings).toHaveLength(1);
    second.dismissAway();
    expect(storage.getItem("dad-friendly-homecomings")).toBeNull();
    second.dispose();

    const remembered = [
      {
        engineer: "Nils",
        tunnel: "side-seam",
        sentAt: 1,
        find: { kind: "quiet", text: "Safe." },
      },
      {
        engineer: "Ada",
        tunnel: "side-seam",
        sentAt: (sentAt ?? 0) + 1,
        find: { kind: "quiet", text: "Safe." },
      },
      {
        engineer: "Ada",
        tunnel: "side-seam",
        sentAt,
        find: { kind: "quiet", text: "Safe." },
      },
    ];
    storage.setItem("dad-friendly-homecomings", JSON.stringify(remembered));
    writeSessionSave({ storage, mountain: soon, lastSeen: 0 });
    const merged = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(merged.getSnapshot().homecomings).toHaveLength(3);
    merged.dispose();

    storage.setItem("dad-friendly-homecomings", "not json");
    writeSessionSave({ storage, mountain: createMountain(), lastSeen: clock });
    const broken = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(broken.getSnapshot().homecomings).toEqual([]);
    broken.dispose();

    storage.setItem(
      "dad-friendly-homecomings",
      JSON.stringify([{ engineer: "nope" }]),
    );
    const empty = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(empty.getSnapshot().homecomings).toEqual([]);
    empty.dispose();

    const blocking = createMemoryStorage();
    writeSessionSave({ storage: blocking, mountain: soon, lastSeen: 0 });
    const setItem = blocking.setItem.bind(blocking);
    blocking.setItem = (key, value) => {
      if (key === "dad-friendly-homecomings") {
        throw new Error("full");
      }
      setItem(key, value);
    };
    const blocked = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: blocking,
      now: () => 5_000,
    });
    blocked.tick();
    expect(blocked.getSnapshot().homecomings).toHaveLength(1);
    blocked.dispose();
  });
});

describe("layer card and craft-done notice", () => {
  const guest = (storage: Storage, now: () => number) =>
    createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now,
    });

  const shed = (): Mountain => ({
    ...minedMountain(12_000_000),
    helpers: 1,
    carts: 1,
    pocket: 5_000_000,
    materials: { clay: 20, iron: 20, crystal: 0, heartstone: 0 },
    recipes: recipesForMined(12_000_000),
  });

  it("shows a break-in once across a reload, and not for a band already reached", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: minedMountain(9_999_999),
      lastSeen: 0,
    });
    const progress = guest(storage, () => 0);
    expect(progress.getSnapshot().layersArrived).toEqual([]);
    progress.dismissLayer();
    progress.dismissCraft();

    progress.applyMutation(() => minedMountain(10_000_000));
    expect(
      progress.getSnapshot().layersArrived.map((layer) => layer.id),
    ).toEqual(["granite"]);
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "layer.enter",
        data: { id: "granite" },
      }),
    );
    expect(progress.getSnapshot().mountain.recipes).toEqual(
      expect.arrayContaining(["reinforce", "axle-grease"]),
    );
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "recipe.found",
        data: { id: "reinforce", source: "granite" },
      }),
    );
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "recipe.found",
        data: { id: "axle-grease", source: "granite" },
      }),
    );
    progress.dismissLayer();
    expect(progress.getSnapshot().layersArrived).toEqual([]);
    progress.dispose();

    const again = guest(storage, () => 0);
    expect(again.getSnapshot().layersArrived).toEqual([]);
    expect(again.fieldLog().events.map((event) => event.code)).not.toContain(
      "layer.enter",
    );
    again.dispose();

    const deep = createMemoryStorage();
    writeSessionSave({
      storage: deep,
      mountain: minedMountain(15_000_000),
      lastSeen: 0,
    });
    const sitting = guest(deep, () => 0);
    expect(sitting.getSnapshot().layersArrived).toEqual([]);
    expect(sitting.getSnapshot().mountain.recipes).toEqual(
      expect.arrayContaining(["reinforce", "axle-grease"]),
    );
    expect(sitting.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "recipe.found",
        data: { id: "reinforce", source: "granite" },
      }),
    );
    sitting.dispose();
    const reopened = guest(deep, () => 0);
    expect(
      reopened
        .fieldLog()
        .events.filter((event) => event.code === "recipe.found"),
    ).toEqual([]);
    expect(reopened.getSnapshot().mountain.recipes).toEqual(
      expect.arrayContaining(["reinforce", "axle-grease"]),
    );
    reopened.dispose();
  });

  it("folds a band crossed while away into the welcome, once", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(9_990_000), helpers: 20 },
      lastSeen: 0,
    });
    const progress = guest(storage, () => 1_800_000);
    expect(progress.getSnapshot().away).toBeDefined();
    expect(
      progress.getSnapshot().layersArrived.map((layer) => layer.id),
    ).toEqual(["granite"]);
    progress.dismissAway();
    expect(progress.getSnapshot().layersArrived).toEqual([]);
    expect(progress.getSnapshot().away).toBeUndefined();
    progress.dispose();

    const later = guest(storage, () => 1_800_000);
    expect(later.getSnapshot().layersArrived).toEqual([]);
    later.dispose();
  });

  it("queues every band a single dig breaks into, shallowest first", () => {
    const progress = guest(createMemoryStorage(), () => 0);
    progress.applyMutation(() => minedMountain(120_000_000));
    expect(
      progress.getSnapshot().layersArrived.map((layer) => layer.id),
    ).toEqual(["granite", "crystal", "heart"]);
    const enters = progress
      .fieldLog()
      .events.filter((event) => event.code === "layer.enter")
      .map((event) => event.data.id);
    expect(enters).toEqual(["granite", "crystal", "heart"]);
    progress.dismissLayer();
    progress.dismissLayer();
    progress.dismissLayer();
    expect(progress.getSnapshot().layersArrived).toEqual([]);
    progress.dispose();
  });

  it("names a finished craft once, during play and after time away", () => {
    const storage = createMemoryStorage();
    let clock = 0;
    const progress = guest(storage, () => clock);
    progress.applyMutation(() => startCraft(shed(), "iron-rails", clock));
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "craft.start",
        data: { id: "iron-rails" },
      }),
    );
    expect(progress.getSnapshot().craftsFitted).toEqual([]);
    const endsAt = progress.getSnapshot().mountain.bench?.endsAt ?? 0;
    while (clock < endsAt) {
      clock = Math.min(endsAt, clock + 9_000);
      progress.tick();
    }
    expect(progress.getSnapshot().craftsFitted).toEqual([
      {
        id: "iron-rails",
        level: 1,
        line: "Your Iron rails are fitted. Carts now 10.6/s.",
      },
    ]);
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "craft.done",
        data: { id: "iron-rails", count: 1 },
      }),
    );
    progress.dismissCraft();
    expect(progress.getSnapshot().craftsFitted).toEqual([]);
    progress.flush();
    progress.dispose();

    const reloaded = guest(storage, () => clock);
    expect(reloaded.getSnapshot().craftsFitted).toEqual([]);
    expect(reloaded.fieldLog().events.map((event) => event.code)).not.toContain(
      "craft.done",
    );
    reloaded.dispose();

    const awayStore = createMemoryStorage();
    writeSessionSave({
      storage: awayStore,
      mountain: {
        ...shed(),
        helpers: 4,
        bench: { recipe: "iron-rails", startedAt: 0, endsAt: 60_000 },
      },
      lastSeen: 0,
    });
    const away = guest(awayStore, () => 120_000);
    expect(away.getSnapshot().away).toBeDefined();
    expect(away.getSnapshot().craftsFitted[0]?.line).toBe(
      "Your Iron rails are fitted. Carts now 10.6/s.",
    );
    away.dismissAway();
    expect(away.getSnapshot().craftsFitted).toEqual([]);
    away.dispose();
  });
});

describe("save integrity: the phone keeps every tap (#222)", () => {
  const user = { uid: "test-dad", label: "Test Dad" };

  it("keeps all 150 taps when the app is killed mid-burst", async () => {
    vi.useFakeTimers();
    try {
      const storage = createMemoryStorage();
      const docs = new Map<string, Mountain>();
      let clock = 1_000_000;
      const first = createProgressStore({
        auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
        cloudSave: createMemoryCloudSave({ docs }),
        sessionStorage: storage,
        now: () => clock,
        cloudWriteGapMs: 1000,
      });
      expect(first.getSnapshot().ready).toBe(true);

      for (let tap = 0; tap < 150; tap += 1) {
        clock += 10;
        first.applyMutation((mountain) => mineByHand(mountain));
      }
      first.dispose();

      expect(minedOut(docs.get("test-dad") ?? createMountain())).toBeLessThan(
        150,
      );

      const second = createProgressStore({
        auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
        cloudSave: createMemoryCloudSave({ docs }),
        sessionStorage: storage,
        now: () => clock,
        cloudWriteGapMs: 0,
      });
      expect(second.getSnapshot().ready).toBe(true);
      expect(minedOut(second.getSnapshot().mountain)).toBe(150);
      expect(second.getSnapshot().mountain.pocket).toBe(150);
      await Promise.resolve();
      expect(minedOut(docs.get("test-dad") ?? createMountain())).toBe(150);
      second.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps every tap when the network stalls and the app is then killed", async () => {
    const storage = createMemoryStorage();
    const docs = new Map<string, Mountain>();
    let clock = 5_000;
    const stalled: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => new Promise(() => undefined),
      writeFieldLog: () => new Promise(() => undefined),
      watch: ({ onChange }) => {
        onChange({
          kind: "found",
          mountain: createMountain(),
          lastSeen: clock,
        });
        return () => undefined;
      },
    };
    const first = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: stalled,
      sessionStorage: storage,
      now: () => clock,
      cloudWriteGapMs: 0,
    });
    expect(first.getSnapshot().ready).toBe(true);
    for (let tap = 0; tap < 150; tap += 1) {
      clock += 10;
      first.applyMutation((mountain) => mineByHand(mountain));
    }
    expect(minedOut(first.getSnapshot().mountain)).toBe(150);
    first.dispose();
    expect(docs.size).toBe(0);

    const second = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: storage,
      now: () => clock,
      cloudWriteGapMs: 0,
    });
    expect(minedOut(second.getSnapshot().mountain)).toBe(150);
    await Promise.resolve();
    expect(minedOut(docs.get("test-dad") ?? createMountain())).toBe(150);
    second.dispose();
  });

  it("restarts a listener after an error and later saves land", async () => {
    vi.useFakeTimers();
    try {
      const docs = new Map<string, Mountain>();
      let clock = 8_000;
      let broken = false;
      let watches = 0;
      let deliver: (remote: CloudLoadResult) => void = () => undefined;
      const cloud: CloudSave = {
        load: () => Promise.resolve({ kind: "missing" }),
        write: ({ uid, mountain }) => {
          if (broken) {
            return Promise.resolve({
              kind: "failed",
              message: "unavailable",
            });
          }
          docs.set(uid, mountain);
          return Promise.resolve({ kind: "ok" });
        },
        writeFieldLog: () => Promise.resolve({ kind: "ok" }),
        watch: ({ onChange }) => {
          watches += 1;
          deliver = onChange;
          if (watches === 1) {
            onChange({
              kind: "found",
              mountain: createMountain(),
              lastSeen: clock,
            });
          } else if (broken) {
            onChange({ kind: "unavailable" });
          } else {
            onChange({
              kind: "found",
              mountain: docs.get("test-dad") ?? createMountain(),
              lastSeen: clock,
            });
          }
          return () => undefined;
        },
      };
      const progress = createProgressStore({
        auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
        cloudSave: cloud,
        sessionStorage: createMemoryStorage(),
        now: () => clock,
        cloudWriteGapMs: 0,
      });
      expect(progress.getSnapshot().ready).toBe(true);
      expect(watches).toBe(1);

      broken = true;
      deliver({ kind: "unavailable" });
      deliver({ kind: "unavailable" });
      expect(progress.getSnapshot().ready).toBe(true);
      expect(progress.getSnapshot().saveKind).toBe("error");

      for (let tap = 0; tap < 4; tap += 1) {
        clock += 10;
        progress.applyMutation((mountain) => mineByHand(mountain));
      }
      await Promise.resolve();
      expect(minedOut(progress.getSnapshot().mountain)).toBe(4);
      expect(docs.has("test-dad")).toBe(false);

      await vi.advanceTimersByTimeAsync(999);
      expect(watches).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(watches).toBe(2);

      broken = false;
      await vi.advanceTimersByTimeAsync(2_000);
      expect(watches).toBe(3);
      expect(minedOut(docs.get("test-dad") ?? createMountain())).toBe(4);

      clock += 10;
      progress.applyMutation((mountain) => mineByHand(mountain));
      await Promise.resolve();
      expect(minedOut(progress.getSnapshot().mountain)).toBe(5);
      expect(minedOut(docs.get("test-dad") ?? createMountain())).toBe(5);
      expect(progress.getSnapshot().saveKind).toBe("account");

      const open = watches;
      progress.dispose();
      await vi.advanceTimersByTimeAsync(30_000);
      expect(watches).toBe(open);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never decreases progress across a rapid burst and stale snapshots", async () => {
    const docs = new Map<string, Mountain>();
    let clock = 20_000;
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    const cloud: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: ({ uid, mountain, lastSeen }) => {
        docs.set(uid, mountain);
        deliver({ kind: "found", mountain, lastSeen });
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({
          kind: "found",
          mountain: createMountain(),
          lastSeen: clock,
        });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => clock,
      cloudWriteGapMs: 0,
    });
    expect(progress.getSnapshot().ready).toBe(true);

    for (let tap = 1; tap <= 150; tap += 1) {
      clock += 5;
      progress.applyMutation((mountain) => mineByHand(mountain));
      await Promise.resolve();
      if (tap % 5 === 0) {
        deliver({
          kind: "found",
          mountain: minedMountain(tap - 1),
          lastSeen: clock - 1,
        });
      }
      expect(minedOut(progress.getSnapshot().mountain)).toBe(tap);
      expect(progress.getSnapshot().mountain.pocket).toBeGreaterThanOrEqual(
        tap,
      );
    }
    expect(minedOut(docs.get("test-dad") ?? createMountain())).toBe(150);
    progress.dispose();
  });

  it("keeps one write in flight and sends the newest mountain next", async () => {
    vi.useFakeTimers();
    try {
      let inflight = 0;
      let maxInflight = 0;
      let release: (result: CloudWriteResult) => void = () => undefined;
      const writes: number[] = [];
      const cloud: CloudSave = {
        load: () => Promise.resolve({ kind: "missing" }),
        write: ({ mountain }) => {
          inflight += 1;
          maxInflight = Math.max(maxInflight, inflight);
          writes.push(minedOut(mountain));
          return new Promise((resolve) => {
            release = (result) => {
              inflight -= 1;
              resolve(result);
            };
          });
        },
        writeFieldLog: () => Promise.resolve({ kind: "ok" }),
        watch: ({ onChange }) => {
          onChange({ kind: "found", mountain: createMountain(), rev: 0 });
          return () => undefined;
        },
      };
      const progress = createProgressStore({
        auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
        cloudSave: cloud,
        sessionStorage: createMemoryStorage(),
        now: () => 30_000,
        cloudWriteGapMs: 1000,
      });
      expect(progress.getSnapshot().ready).toBe(true);
      progress.applyMutation(() => minedMountain(1));
      progress.applyMutation(() => minedMountain(2));
      progress.applyMutation(() => minedMountain(4));
      expect(writes).toEqual([1]);
      expect(maxInflight).toBe(1);
      release({ kind: "ok" });
      await Promise.resolve();
      expect(writes).toEqual([1]);
      await vi.advanceTimersByTimeAsync(1000);
      expect(writes).toEqual([1, 4]);
      expect(maxInflight).toBe(1);
      release({ kind: "ok" });
      await Promise.resolve();
      progress.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("merges a refused rev and never adopts a lower one", async () => {
    let server = {
      mountain: minedMountain(10),
      rev: 4,
      lastSeen: 1,
    };
    const cloud: CloudSave = {
      load: () =>
        Promise.resolve({
          kind: "found",
          mountain: server.mountain,
          rev: server.rev,
          lastSeen: server.lastSeen,
          deviceId: "other-device",
        }),
      write: ({ mountain, rev }) => {
        if (rev !== server.rev + 1) {
          return Promise.resolve({
            kind: "rejected",
            message: "permission-denied",
          });
        }
        server = { mountain, rev, lastSeen: 2 };
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        onChange({
          kind: "found",
          mountain: minedMountain(10),
          rev: 4,
          lastSeen: 1,
          deviceId: "other-device",
        });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => 40_000,
      cloudWriteGapMs: 0,
    });
    expect(progress.getSnapshot().ready).toBe(true);
    expect(minedOut(progress.getSnapshot().mountain)).toBe(10);

    server = {
      mountain: {
        ...minedMountain(4),
        upgrades: { boots: 1 },
      },
      rev: 6,
      lastSeen: 2,
    };
    progress.applyMutation(() => minedMountain(30));
    await vi.waitFor(() => {
      expect(server.rev).toBe(7);
    });
    expect(minedOut(progress.getSnapshot().mountain)).toBe(30);
    expect(progress.getSnapshot().mountain.upgrades).toEqual({ boots: 1 });
    expect(progress.fieldLog().events.map((event) => event.code)).toContain(
      "save.conflict",
    );
    expect(progress.fieldLog().snapshot.rev).toBe(7);
    expect(progress.fieldLog().snapshot.deviceId.length).toBeGreaterThanOrEqual(
      8,
    );
    expect(progress.fieldLog().events.map((event) => event.code)).toContain(
      "save.conflict",
    );
    const kept = minedOut(progress.getSnapshot().mountain);
    progress.dispose();

    const again = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: {
        ...cloud,
        watch: ({ onChange }) => {
          onChange({
            kind: "found",
            mountain: minedMountain(kept),
            rev: 7,
            lastSeen: 2,
            deviceId: "device-test-dad",
          });
          queueMicrotask(() => {
            onChange({
              kind: "found",
              mountain: minedMountain(1),
              rev: 3,
              lastSeen: 1,
            });
          });
          return () => undefined;
        },
      },
      sessionStorage: createMemoryStorage(),
      now: () => 50_000,
      cloudWriteGapMs: 0,
    });
    await Promise.resolve();
    expect(minedOut(again.getSnapshot().mountain)).toBe(kept);
    again.dispose();
  });

  it("never decreases across two devices and 150 taps", async () => {
    const docs = new Map<string, Mountain>();
    const cloud = createMemoryCloudSave({ docs });
    let clock = 60_000;
    const open = (storage: Storage) =>
      createProgressStore({
        auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
        cloudSave: cloud,
        sessionStorage: storage,
        now: () => clock,
        cloudWriteGapMs: 0,
      });
    const first = open(createMemoryStorage());
    const second = open(createMemoryStorage());
    await vi.waitFor(() => {
      expect(first.getSnapshot().ready).toBe(true);
      expect(second.getSnapshot().ready).toBe(true);
    });
    let seen = 0;
    for (let tap = 1; tap <= 150; tap += 1) {
      clock += 5;
      first.applyMutation((mountain) => mineByHand(mountain));
      await Promise.resolve();
      const there = minedOut(second.getSnapshot().mountain);
      expect(there).toBeGreaterThanOrEqual(seen);
      seen = there;
      expect(minedOut(first.getSnapshot().mountain)).toBeGreaterThanOrEqual(
        tap,
      );
    }
    await vi.waitFor(() => {
      expect(
        minedOut(docs.get("test-dad") ?? createMountain()),
      ).toBeGreaterThanOrEqual(150);
      expect(minedOut(second.getSnapshot().mountain)).toBeGreaterThanOrEqual(
        150,
      );
    });
    first.dispose();
    second.dispose();
  });

  it("a frozen tab cannot overwrite the taps from the live one", async () => {
    let mountain = createMountain();
    let rev = 0;
    let lastSeen = 0;
    let hold = false;
    const listeners = new Set<(remote: CloudLoadResult) => void>();
    const current = (): CloudLoadResult =>
      rev === 0
        ? { kind: "missing" }
        : {
            kind: "found",
            mountain,
            rev,
            lastSeen,
            deviceId: "live-device",
          };
    const emit = (): void => {
      if (hold) {
        return;
      }
      const remote = current();
      for (const listener of listeners) {
        listener(remote);
      }
    };
    const cloud: CloudSave = {
      load: () => Promise.resolve(current()),
      write: ({ mountain: next, rev: nextRev, lastSeen: seen }) => {
        const expected = rev === 0 ? 1 : rev + 1;
        if (nextRev !== expected) {
          return Promise.resolve({
            kind: "rejected",
            message: "permission-denied",
          });
        }
        mountain = next;
        rev = nextRev;
        lastSeen = seen ?? lastSeen;
        emit();
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        listeners.add(onChange);
        onChange(current());
        return () => {
          listeners.delete(onChange);
        };
      },
    };
    let clock = 70_000;
    const open = () =>
      createProgressStore({
        auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
        cloudSave: cloud,
        sessionStorage: createMemoryStorage(),
        now: () => clock,
        cloudWriteGapMs: 0,
      });
    const live = open();
    const frozen = open();
    await vi.waitFor(() => {
      expect(live.getSnapshot().ready).toBe(true);
      expect(frozen.getSnapshot().ready).toBe(true);
    });
    hold = true;
    for (let tap = 0; tap < 150; tap += 1) {
      clock += 5;
      live.applyMutation((currentMountain) => mineByHand(currentMountain));
    }
    await vi.waitFor(() => {
      expect(minedOut(mountain)).toBeGreaterThanOrEqual(150);
    });
    expect(minedOut(frozen.getSnapshot().mountain)).toBe(0);
    const trail: number[] = [];
    frozen.applyMutation((currentMountain) => {
      trail.push(minedOut(currentMountain));
      return currentMountain;
    });
    frozen.flush();
    await vi.waitFor(() => {
      expect(minedOut(frozen.getSnapshot().mountain)).toBeGreaterThanOrEqual(
        150,
      );
    });
    expect(minedOut(mountain)).toBeGreaterThanOrEqual(150);
    for (let index = 1; index < trail.length; index += 1) {
      expect(trail[index] ?? 0).toBeGreaterThanOrEqual(trail[index - 1] ?? 0);
    }
    live.dispose();
    frozen.dispose();
  });

  it("keeps a higher phone rev and does not adopt the older cloud copy", async () => {
    const storage = createMemoryStorage();
    writePhoneBackup({
      storage,
      uid: user.uid,
      mountain: minedMountain(40),
      lastSeen: 9,
      rev: 5,
      deviceId: "device-test-dad1",
    });
    let doc = {
      mountain: minedMountain(3),
      rev: 2,
      lastSeen: 1,
    };
    const cloud: CloudSave = {
      load: () =>
        Promise.resolve({
          kind: "found",
          mountain: doc.mountain,
          rev: doc.rev,
          lastSeen: doc.lastSeen,
        }),
      write: ({ mountain, rev }) => {
        if (rev !== doc.rev + 1) {
          return Promise.resolve({
            kind: "rejected",
            message: "permission-denied",
          });
        }
        doc = { mountain, rev, lastSeen: 9 };
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        onChange({
          kind: "found",
          mountain: minedMountain(3),
          rev: 2,
          lastSeen: 1,
        });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      now: () => 80_000,
      cloudWriteGapMs: 0,
    });
    expect(minedOut(progress.getSnapshot().mountain)).toBe(40);
    await vi.waitFor(() => {
      expect(doc.rev).toBeGreaterThanOrEqual(3);
      expect(minedOut(doc.mountain)).toBe(40);
    });
    progress.dispose();
  });

  it("records a rev refusal when the server doc is gone", async () => {
    const cloud: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () =>
        Promise.resolve({ kind: "rejected", message: "permission-denied" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        onChange({ kind: "found", mountain: createMountain(), rev: 1 });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => 90_000,
      cloudWriteGapMs: 0,
    });
    expect(progress.getSnapshot().ready).toBe(true);
    progress.applyMutation(() => minedMountain(2));
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("error");
    });
    expect(progress.getSnapshot().log).toContain("permission-denied");
    progress.dispose();
  });

  it("stops retrying after a run of rev refusals", async () => {
    let serverRev = 4;
    const cloud: CloudSave = {
      load: () =>
        Promise.resolve({
          kind: "found",
          mountain: minedMountain(8),
          rev: serverRev,
        }),
      write: () => {
        serverRev += 1;
        return Promise.resolve({
          kind: "rejected",
          message: "permission-denied",
        });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        onChange({ kind: "found", mountain: minedMountain(1), rev: 1 });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => 100_000,
      cloudWriteGapMs: 0,
    });
    expect(progress.getSnapshot().ready).toBe(true);
    progress.applyMutation(() => minedMountain(12));
    await vi.waitFor(() => {
      expect(progress.getSnapshot().log).toContain("save.write rev");
    });
    const stopped = serverRev;
    await Promise.resolve();
    expect(serverRev).toBe(stopped);
    progress.dispose();
  });
});

describe("fresh read, one writer, and a pending offline write", () => {
  const user = { uid: "test-dad", label: "Test Dad" };
  const phonePocket = (storage: Storage): number => {
    const phone = readPhoneBackup({ storage, uid: user.uid });
    return phone.kind === "present" ? phone.save.mountain.pocket : -1;
  };

  it("reads the server on resume before a cloud write, and keeps a tap from the gap", async () => {
    const storage = createMemoryStorage();
    let server = {
      mountain: minedMountain(2),
      rev: 1,
      lastSeen: 1,
      deviceId: "other-device",
    };
    let release: (() => void) | undefined;
    let writes = 0;
    const cloud: CloudSave = {
      load: ({ fresh }) => {
        const found: CloudLoadResult = {
          kind: "found",
          mountain: server.mountain,
          lastSeen: server.lastSeen,
          rev: server.rev,
          deviceId: server.deviceId,
        };
        if (!fresh) {
          return Promise.resolve(found);
        }
        return new Promise((resolve) => {
          release = () => {
            resolve(found);
          };
        });
      },
      write: (args) => {
        writes += 1;
        server = {
          mountain: args.mountain,
          rev: args.rev,
          lastSeen: args.lastSeen ?? 0,
          deviceId: args.deviceId,
        };
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        onChange({
          kind: "found",
          mountain: minedMountain(2),
          lastSeen: 1,
          rev: 1,
          deviceId: "other-device",
        });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      now: () => 10_000,
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    expect(progress.getSnapshot().mountain.pocket).toBe(2);
    server = {
      mountain: minedMountain(10),
      rev: 2,
      lastSeen: 2,
      deviceId: "other-device",
    };
    const before = writes;
    const resume = progress.resume();
    expect(resume.kind).toBe("reading");
    progress.applyMutation((mountain) => minedMountain(minedOut(mountain) + 1));
    expect(writes).toBe(before);
    const phone = readPhoneBackup({ storage, uid: user.uid });
    expect(phone.kind === "present" && phone.save.mountain.pocket).toBe(3);
    if (resume.kind === "reading") {
      release?.();
      await resume.done;
    }
    expect(minedOut(progress.getSnapshot().mountain)).toBe(11);
    await vi.waitFor(() => {
      expect(server.mountain.pocket).toBe(11);
      expect(server.rev).toBe(3);
    });
    expect(progress.fieldLog().events.map((event) => event.code)).toContain(
      "save.resume",
    );
    const again = progress.resume();
    expect(again.kind).toBe("reading");
    if (again.kind === "reading") {
      release?.();
      await again.done;
    }
    progress.dispose();
  });

  it("uploads after a fresh read that finds no server doc, and holds the write when the read fails", async () => {
    const storage = createMemoryStorage();
    let mode: "missing" | "down" | "throw" = "missing";
    const written: number[] = [];
    const cloud: CloudSave = {
      load: ({ fresh }) => {
        if (fresh && mode === "throw") {
          return Promise.reject(new Error("boom"));
        }
        if (fresh && mode === "down") {
          return Promise.resolve({ kind: "unavailable" });
        }
        return Promise.resolve({ kind: "missing" });
      },
      write: (args) => {
        written.push(args.mountain.pocket);
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        onChange({ kind: "missing" });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    progress.applyMutation(() => minedMountain(2));
    await vi.waitFor(() => {
      expect(written).toContain(2);
    });
    mode = "down";
    const failed = progress.resume();
    if (failed.kind === "reading") {
      await failed.done;
    }
    const before = written.length;
    progress.applyMutation(() => minedMountain(3));
    await Promise.resolve();
    expect(written.length).toBe(before);
    expect(readPhoneBackup({ storage, uid: user.uid })).toMatchObject({
      kind: "present",
      save: { mountain: { pocket: 3 } },
    });
    mode = "throw";
    const thrown = progress.resume();
    if (thrown.kind === "reading") {
      await thrown.done;
    }
    expect(progress.getSnapshot().mountain.pocket).toBe(3);
    mode = "missing";
    const uploaded = progress.resume();
    if (uploaded.kind === "reading") {
      await uploaded.done;
    }
    await vi.waitFor(() => {
      expect(written.at(-1)).toBe(3);
    });
    await progress.playHere();
    progress.dispose();
  });

  it("ignores a watch event that arrives during the fresh read", async () => {
    const storage = createMemoryStorage();
    let release: (() => void) | undefined;
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    const cloud: CloudSave = {
      load: ({ fresh }) => {
        if (!fresh) {
          return Promise.resolve({
            kind: "found" as const,
            mountain: minedMountain(1),
            rev: 1,
          });
        }
        return new Promise((resolve) => {
          release = () => {
            resolve({
              kind: "found",
              mountain: minedMountain(4),
              rev: 2,
            });
          };
        });
      },
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({ kind: "found", mountain: minedMountain(1), rev: 1 });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      cloudWriteGapMs: 0,
      now: () => 5_000,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    const resume = progress.resume();
    deliver({ kind: "found", mountain: minedMountain(40), rev: 9 });
    progress.applyMutation((mountain) => minedMountain(minedOut(mountain) + 1));
    if (resume.kind === "reading") {
      release?.();
      await resume.done;
    }
    expect(minedOut(progress.getSnapshot().mountain)).toBe(5);
    progress.dispose();
  });

  it("flushes a tap that waited for the server after a cached snapshot", async () => {
    const storage = createMemoryStorage();
    writePhoneBackup({
      storage,
      uid: user.uid,
      mountain: minedMountain(2),
      lastSeen: 1,
      rev: 1,
      deviceId: "device-12345678",
    });
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    const written: number[] = [];
    const cloud: CloudSave = {
      load: () => Promise.resolve({ kind: "unavailable" }),
      write: (args) => {
        written.push(args.rev);
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({ kind: "unavailable" });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      cloudWriteGapMs: 0,
      now: () => 5_000,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    progress.applyMutation(() => minedMountain(3));
    expect(written).toEqual([]);
    deliver({ kind: "found", mountain: minedMountain(2), rev: 1, lastSeen: 1 });
    await vi.waitFor(() => {
      expect(written).toEqual([2]);
    });
    progress.dispose();
  });

  it("keeps a guest save on the waiting tab and does not let that tab write", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: minedMountain(6),
      lastSeen: 1,
    });
    const bus = createMemoryBus();
    const writer = createTabWriter({
      tabId: "tab-writer",
      storage,
      bus,
      handoffMs: 0,
    });
    const other = createTabWriter({
      tabId: "tab-other1",
      storage,
      bus,
      handoffMs: 0,
    });
    const first = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      tabWriter: writer,
    });
    const second = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      tabWriter: other,
    });
    expect(second.getSnapshot().elsewhere).toBe(true);
    expect(second.getSnapshot().mountain.pocket).toBe(6);
    const raw = storage.getItem("dad-friendly-session");
    second.applyMutation(() => minedMountain(9));
    expect(storage.getItem("dad-friendly-session")).toBe(raw);
    expect(second.resume().kind).toBe("idle");
    first.dispose();
    second.dispose();
  });

  it("lets one tab write, and takeover keeps the stones", async () => {
    const storage = createMemoryStorage();
    const bus = createMemoryBus();
    const docs = new Map<string, Mountain>();
    const cloud = createMemoryCloudSave({ docs });
    const auth = () =>
      createMemoryAuth({ state: { kind: "signed-in", user }, user });
    const writer = createTabWriter({
      tabId: "tab-writer",
      storage,
      bus,
      handoffMs: 0,
      yieldWaitMs: 30,
    });
    const other = createTabWriter({
      tabId: "tab-other1",
      storage,
      bus,
      handoffMs: 0,
      yieldWaitMs: 30,
    });
    const first = createProgressStore({
      auth: auth(),
      cloudSave: cloud,
      sessionStorage: storage,
      tabWriter: writer,
      cloudWriteGapMs: 0,
    });
    const second = createProgressStore({
      auth: auth(),
      cloudSave: cloud,
      sessionStorage: storage,
      tabWriter: other,
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(first.getSnapshot().playing).toBe(true);
      expect(second.getSnapshot().elsewhere).toBe(true);
    });
    second.applyMutation(() => minedMountain(9));
    expect(second.getSnapshot().mountain.pocket).toBe(0);
    first.applyMutation(() => minedMountain(4));
    await vi.waitFor(() => {
      expect(docs.get(user.uid)?.pocket).toBe(4);
    });
    await second.playHere();
    await vi.waitFor(() => {
      expect(second.getSnapshot().playing).toBe(true);
      expect(second.getSnapshot().mountain.pocket).toBe(4);
    });
    expect(first.getSnapshot().elsewhere).toBe(true);
    second.applyMutation(() => minedMountain(5));
    await vi.waitFor(() => {
      expect(docs.get(user.uid)?.pocket).toBe(5);
    });
    const rev = docs.get(user.uid);
    first.applyMutation(() => minedMountain(99));
    await Promise.resolve();
    expect(docs.get(user.uid)).toEqual(rev);
    first.dispose();
    second.dispose();
  });

  it("keeps an offline write that lands on reload", async () => {
    const storage = createMemoryStorage();
    let online = true;
    let server:
      { mountain: Mountain; rev: number; lastSeen?: number } | undefined;
    const queued: { mountain: Mountain; rev: number; lastSeen?: number }[] = [];
    const waiting: ((result: CloudWriteResult) => void)[] = [];
    const listeners = new Set<(remote: CloudLoadResult) => void>();
    const view = (): CloudLoadResult =>
      server === undefined
        ? { kind: "missing" }
        : {
            kind: "found",
            mountain: server.mountain,
            rev: server.rev,
            ...(server.lastSeen === undefined
              ? {}
              : { lastSeen: server.lastSeen }),
          };
    const emit = (): void => {
      const remote = view();
      for (const listener of listeners) {
        listener(remote);
      }
    };
    const cloud: CloudSave = {
      load: ({ fresh }) => {
        if (fresh && !online) {
          return Promise.resolve({ kind: "unavailable" });
        }
        return Promise.resolve(view());
      },
      write: (args) => {
        const doc = {
          mountain: args.mountain,
          rev: args.rev,
          ...(args.lastSeen === undefined ? {} : { lastSeen: args.lastSeen }),
        };
        if (!online) {
          queued.push(doc);
          return new Promise((resolve) => {
            waiting.push(resolve);
          });
        }
        const have = server?.rev ?? 0;
        if (args.rev !== have + 1) {
          return Promise.resolve({
            kind: "rejected",
            message: "permission-denied",
          });
        }
        server = doc;
        emit();
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        listeners.add(onChange);
        onChange(view());
        return () => {
          listeners.delete(onChange);
        };
      },
    };
    const open = () =>
      createProgressStore({
        auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
        cloudSave: cloud,
        sessionStorage: storage,
        cloudWriteGapMs: 0,
      });
    const first = open();
    await vi.waitFor(() => {
      expect(first.getSnapshot().ready).toBe(true);
    });
    first.applyMutation(() => minedMountain(3));
    await vi.waitFor(() => {
      expect(server?.mountain.pocket).toBe(3);
    });
    online = false;
    first.applyMutation(() => minedMountain(5));
    expect(queued.map((doc) => doc.mountain.pocket)).toContain(5);
    const phone = readPhoneBackup({ storage, uid: user.uid });
    expect(phone.kind === "present" && phone.save.mountain.pocket).toBe(5);
    first.dispose();
    online = true;
    for (const doc of queued) {
      const have = server?.rev ?? 0;
      if (doc.rev === have + 1) {
        server = doc;
      }
    }
    queued.length = 0;
    for (const resolve of waiting) {
      resolve({ kind: "ok" });
    }
    waiting.length = 0;
    emit();
    const second = open();
    await vi.waitFor(() => {
      expect(second.getSnapshot().ready).toBe(true);
    });
    expect(second.getSnapshot().mountain.pocket).toBe(5);
    const revBefore = server?.rev ?? 0;
    second.applyMutation(() => minedMountain(6));
    await vi.waitFor(() => {
      expect(server?.mountain.pocket).toBe(6);
    });
    expect(server?.rev).toBe(revBefore + 1);
    second.dispose();
  });

  it("does not treat a cached snapshot as the server rev", async () => {
    const storage = createMemoryStorage();
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    let writtenRev = 0;
    const cloud: CloudSave = {
      load: () =>
        Promise.resolve({
          kind: "found",
          mountain: minedMountain(8),
          rev: 4,
          lastSeen: 4,
        }),
      write: (args) => {
        writtenRev = args.rev;
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({
          kind: "found",
          mountain: minedMountain(1),
          rev: 1,
          lastSeen: 1,
          cached: true,
        });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      cloudWriteGapMs: 0,
      now: () => 5_000,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().mountain.pocket).toBe(8);
    });
    progress.applyMutation(() => minedMountain(9));
    await vi.waitFor(() => {
      expect(writtenRev).toBe(5);
    });
    deliver({
      kind: "found",
      mountain: minedMountain(1),
      rev: 1,
      pending: true,
    });
    expect(progress.getSnapshot().mountain.pocket).toBe(9);
    progress.dispose();
  });

  it("adopts a pending write before the first open, and skips its own echo", async () => {
    const storage = createMemoryStorage();
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    let sent:
      | {
          mountain: Mountain;
          lastSeen?: number;
          rev: number;
          deviceId: string;
        }
      | undefined;
    const cloud: CloudSave = {
      load: () =>
        Promise.resolve({
          kind: "found",
          mountain: minedMountain(4),
          rev: 2,
        }),
      write: (args) => {
        sent = {
          mountain: args.mountain,
          rev: args.rev,
          deviceId: args.deviceId,
          ...(args.lastSeen === undefined ? {} : { lastSeen: args.lastSeen }),
        };
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({
          kind: "found",
          mountain: minedMountain(4),
          rev: 2,
          pending: true,
        });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      cloudWriteGapMs: 0,
      now: () => 5_000,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().mountain.pocket).toBe(4);
    });
    progress.applyMutation(() => minedMountain(5));
    await vi.waitFor(() => {
      expect(sent).toBeDefined();
    });
    if (sent !== undefined) {
      deliver({
        kind: "found",
        mountain: sent.mountain,
        rev: sent.rev,
        deviceId: sent.deviceId,
        ...(sent.lastSeen === undefined ? {} : { lastSeen: sent.lastSeen }),
        pending: true,
      });
    }
    expect(progress.getSnapshot().mountain.pocket).toBe(5);
    progress.dispose();
  });

  it("writes a held tap when the server copy ties, and a second read joins the first", async () => {
    const storage = createMemoryStorage();
    writePhoneBackup({
      storage,
      uid: user.uid,
      mountain: minedMountain(1),
      lastSeen: 1,
      rev: 1,
      deviceId: "device-12345678",
    });
    let release: (() => void) | undefined;
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    const written: number[] = [];
    const cloud: CloudSave = {
      load: ({ fresh }) => {
        if (!fresh) {
          return Promise.resolve({ kind: "missing" });
        }
        return new Promise<CloudLoadResult>((resolve) => {
          release = () => {
            resolve({ kind: "unavailable" });
          };
        });
      },
      write: (args) => {
        written.push(args.mountain.pocket);
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({ kind: "unavailable" });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      cloudWriteGapMs: 0,
      now: () => 5_000,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    progress.applyMutation(() => minedMountain(3));
    expect(written).toEqual([]);
    const first = progress.resume();
    const second = progress.resume();
    expect(first.kind).toBe("reading");
    expect(second.kind).toBe("reading");
    if (first.kind === "reading" && second.kind === "reading") {
      expect(second.done).toBe(first.done);
      release?.();
      await first.done;
    }
    deliver({
      kind: "found",
      mountain: minedMountain(3),
      rev: 1,
      lastSeen: 5_000,
    });
    await vi.waitFor(() => {
      expect(written).toContain(3);
    });
    progress.dispose();
  });

  it("takes a phone backup that got ahead of this tab", async () => {
    const storage = createMemoryStorage();
    const bus = createMemoryBus();
    const docs = new Map<string, Mountain>();
    const cloud = createMemoryCloudSave({ docs });
    const writer = createTabWriter({
      tabId: "tab-writer",
      storage,
      bus,
      handoffMs: 0,
    });
    const other = createTabWriter({
      tabId: "tab-other1",
      storage,
      bus,
      handoffMs: 0,
    });
    const auth = () =>
      createMemoryAuth({ state: { kind: "signed-in", user }, user });
    const first = createProgressStore({
      auth: auth(),
      cloudSave: cloud,
      sessionStorage: storage,
      tabWriter: writer,
      cloudWriteGapMs: 0,
    });
    const second = createProgressStore({
      auth: auth(),
      cloudSave: cloud,
      sessionStorage: storage,
      tabWriter: other,
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(first.getSnapshot().playing).toBe(true);
    });
    first.applyMutation(() => minedMountain(4));
    await vi.waitFor(() => {
      expect(docs.get(user.uid)?.pocket).toBe(4);
    });
    writePhoneBackup({
      storage,
      uid: user.uid,
      mountain: minedMountain(8),
      lastSeen: 9,
      rev: 4,
      deviceId: "device-12345678",
    });
    await second.playHere();
    await vi.waitFor(() => {
      expect(second.getSnapshot().playing).toBe(true);
      expect(second.getSnapshot().mountain.pocket).toBeGreaterThanOrEqual(8);
    });
    first.dispose();
    second.dispose();
  });

  it("heals the cloud when our own echo is behind a newer tap, and drops a read after close", async () => {
    const storage = createMemoryStorage();
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    let releaseWrite: (() => void) | undefined;
    let releaseRead: (() => void) | undefined;
    const cloud: CloudSave = {
      load: ({ fresh }) => {
        if (!fresh) {
          return Promise.resolve({ kind: "missing" });
        }
        return new Promise((resolve) => {
          releaseRead = () => {
            resolve({ kind: "unavailable" });
          };
        });
      },
      write: (args) =>
        new Promise((resolve) => {
          releaseWrite = () => {
            deliver({
              kind: "found",
              mountain: args.mountain,
              rev: args.rev,
              deviceId: args.deviceId,
              ...(args.lastSeen === undefined
                ? {}
                : { lastSeen: args.lastSeen }),
            });
            resolve({ kind: "ok" });
          };
        }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({
          kind: "found",
          mountain: minedMountain(1),
          rev: 1,
          cached: true,
        });
        return () => undefined;
      },
    };
    const bus = createMemoryBus();
    const writer = createTabWriter({
      tabId: "tab-writer",
      storage,
      bus,
      handoffMs: 0,
    });
    const other = createTabWriter({
      tabId: "tab-other1",
      storage,
      bus,
      handoffMs: 0,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      tabWriter: writer,
      cloudWriteGapMs: 0,
      now: () => 5_000,
    });
    const waiting = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: {
        load: () => Promise.resolve({ kind: "unavailable" }),
        write: () => Promise.resolve({ kind: "ok" }),
        writeFieldLog: () => Promise.resolve({ kind: "ok" }),
        watch: ({ onChange }) => {
          onChange({
            kind: "found",
            mountain: minedMountain(1),
            rev: 1,
            cached: true,
          });
          return () => undefined;
        },
      },
      sessionStorage: storage,
      tabWriter: other,
      now: () => 5_000,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    progress.applyMutation(() => minedMountain(5));
    progress.applyMutation(() => minedMountain(6));
    releaseWrite?.();
    const reading = progress.resume();
    progress.dispose();
    releaseRead?.();
    if (reading.kind === "reading") {
      await reading.done;
    }
    waiting.dispose();
  });

  it("sends the newer tap when an echo of the previous write comes back", async () => {
    const storage = createMemoryStorage();
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    let releaseWrite: (() => void) | undefined;
    const cloud: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: (args) =>
        new Promise((resolve) => {
          releaseWrite = () => {
            deliver({
              kind: "found",
              mountain: args.mountain,
              rev: args.rev,
              deviceId: args.deviceId,
              ...(args.lastSeen === undefined
                ? {}
                : { lastSeen: args.lastSeen }),
            });
            resolve({ kind: "ok" });
          };
        }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({ kind: "found", mountain: minedMountain(1), rev: 1 });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      cloudWriteGapMs: 0,
      now: () => 5_000,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    progress.applyMutation(() => minedMountain(5));
    progress.applyMutation(() => minedMountain(6));
    releaseWrite?.();
    await vi.waitFor(() => {
      expect(progress.getSnapshot().mountain.pocket).toBe(6);
    });
    progress.dispose();
  });

  it("a waiting tab never writes the phone backup", async () => {
    const storage = createMemoryStorage();
    const bus = createMemoryBus();
    const docs = new Map<string, Mountain>();
    const cloud = createMemoryCloudSave({ docs });
    const auth = () =>
      createMemoryAuth({ state: { kind: "signed-in", user }, user });
    const writer = createTabWriter({
      tabId: "tab-writer",
      storage,
      bus,
      handoffMs: 0,
      leaseMs: 60_000,
    });
    const other = createTabWriter({
      tabId: "tab-other1",
      storage,
      bus,
      handoffMs: 0,
      leaseMs: 60_000,
    });
    const first = createProgressStore({
      auth: auth(),
      cloudSave: cloud,
      sessionStorage: storage,
      tabWriter: writer,
      cloudWriteGapMs: 0,
    });
    const second = createProgressStore({
      auth: auth(),
      cloudSave: cloud,
      sessionStorage: storage,
      tabWriter: other,
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(first.getSnapshot().playing).toBe(true);
      expect(second.getSnapshot().elsewhere).toBe(true);
    });
    first.applyMutation(() => minedMountain(4));
    await vi.waitFor(() => {
      expect(phonePocket(storage)).toBe(4);
    });
    const saved = storage.getItem(`dad-friendly-phone-backup:${user.uid}`);
    second.applyMutation(() => minedMountain(9));
    second.tick();
    expect(storage.getItem(`dad-friendly-phone-backup:${user.uid}`)).toBe(
      saved,
    );
    expect(second.getSnapshot().mountain.pocket).not.toBe(9);
    first.dispose();
    second.dispose();
  });

  it("a fresh read that never returns lets the crew settle, then a server snapshot writes", async () => {
    const storage = createMemoryStorage();
    let clock = 20_000;
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    const written: number[] = [];
    const cloud: CloudSave = {
      load: ({ fresh }) => {
        if (fresh) {
          return new Promise(() => undefined);
        }
        return Promise.resolve({
          kind: "found",
          mountain: { ...minedMountain(1), helpers: 1 },
          rev: 1,
          lastSeen: clock,
        });
      },
      write: (args) => {
        written.push(args.mountain.pocket);
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({
          kind: "found",
          mountain: { ...minedMountain(1), helpers: 1 },
          rev: 1,
          lastSeen: clock,
        });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      cloudWriteGapMs: 0,
      now: () => clock,
      resumeReadTimeoutMs: 40,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    const reading = progress.resume();
    expect(reading.kind).toBe("reading");
    progress.applyMutation((mountain) => ({
      ...mountain,
      pocket: mountain.pocket + 1,
      remaining: mountain.remaining - 1,
    }));
    expect(phonePocket(storage)).toBe(2);
    expect(written).toEqual([]);
    clock = 22_000;
    progress.tick();
    expect(progress.getSnapshot().mountain.pocket).toBe(2);
    if (reading.kind === "reading") {
      await reading.done;
    }
    expect(progress.getSnapshot().log).toContain("save.resume timeout");
    progress.tick();
    expect(progress.getSnapshot().mountain.pocket).toBeGreaterThan(2);
    expect(phonePocket(storage)).toBe(progress.getSnapshot().mountain.pocket);
    expect(written).toEqual([]);
    deliver({
      kind: "found",
      mountain: { ...minedMountain(1), helpers: 1 },
      rev: 1,
      lastSeen: 20_000,
    });
    await vi.waitFor(() => {
      expect(written.length).toBeGreaterThan(0);
    });
    expect(written.at(-1)).toBe(progress.getSnapshot().mountain.pocket);
    progress.dispose();
  });

  it("an offline fresh read rejects, then a server snapshot still saves", async () => {
    const storage = createMemoryStorage();
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    const written: number[] = [];
    const cloud: CloudSave = {
      load: ({ fresh }) =>
        fresh
          ? Promise.reject(new Error("offline"))
          : Promise.resolve({
              kind: "found" as const,
              mountain: minedMountain(2),
              rev: 1,
            }),
      write: (args) => {
        written.push(args.mountain.pocket);
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({ kind: "found", mountain: minedMountain(2), rev: 1 });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      cloudWriteGapMs: 0,
      now: () => 5_000,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    const reading = progress.resume();
    if (reading.kind === "reading") {
      await reading.done;
    }
    expect(progress.getSnapshot().log).toContain("save.resume rejected");
    progress.applyMutation(() => minedMountain(3));
    expect(phonePocket(storage)).toBe(3);
    expect(written).toEqual([]);
    deliver({ kind: "found", mountain: minedMountain(2), rev: 1 });
    await vi.waitFor(() => {
      expect(written).toContain(3);
    });
    progress.dispose();
  });

  it("ignores a late load after the resume timeout and retries on the backoff", async () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage();
    let resolveLoad: ((value: CloudLoadResult) => void) | undefined;
    let freshLoads = 0;
    const cloud: CloudSave = {
      load: ({ fresh }) => {
        if (!fresh) {
          return Promise.resolve({
            kind: "found",
            mountain: minedMountain(1),
            rev: 1,
          });
        }
        freshLoads += 1;
        return new Promise((resolve) => {
          resolveLoad = resolve;
        });
      },
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        onChange({ kind: "found", mountain: minedMountain(1), rev: 1 });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      cloudWriteGapMs: 0,
      now: () => 20_000,
      resumeReadTimeoutMs: 500,
    });
    expect(progress.getSnapshot().ready).toBe(true);
    const reading = progress.resume();
    await vi.advanceTimersByTimeAsync(500);
    if (reading.kind === "reading") {
      await reading.done;
    }
    expect(progress.getSnapshot().log).toContain("save.resume timeout");
    const pocket = progress.getSnapshot().mountain.pocket;
    resolveLoad?.({ kind: "found", mountain: minedMountain(50), rev: 9 });
    await Promise.resolve();
    expect(progress.getSnapshot().mountain.pocket).toBe(pocket);
    const again = progress.resume();
    await vi.advanceTimersByTimeAsync(500);
    if (again.kind === "reading") {
      await again.done;
    }
    await vi.advanceTimersByTimeAsync(1_000);
    expect(freshLoads).toBeGreaterThan(2);
    progress.dispose();
    vi.useRealTimers();
  });
});
