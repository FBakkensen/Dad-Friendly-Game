// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { EMPTY_MATERIALS } from "./layers";
import { createMemoryAuth } from "./auth";
import {
  createMemoryCloudSave,
  createUnavailableCloudSave,
  type CloudLoadResult,
  type CloudSave,
  type CloudWriteResult,
  fieldLogOf,
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
  minedOut,
  accrue,
  accrueAway,
  type Mountain,
  BARE_MOUNTAIN,
} from "./mountain";
import {
  CREWED_JOBS,
  crewedStart,
  guestSave,
  minedMountain,
} from "./test-fixtures";
import { NO_JOBS } from "./workforce";
import { withFactors } from "./economy/factors";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { NO_GRANITE_PILES, NO_LEVEL_MACHINES } from "./mine-levels";
import { readDeviceId } from "./device-id";
import { readPhoneBackup, writePhoneBackup } from "./phone-backup";
import {
  bindWriterPageHide,
  createMemoryBus,
  createTabWriter,
} from "./tab-writer";
import { WELCOME_MIN_AWAY_MS, createProgressStore } from "./progress-store";
import { SESSION_SAVE_KEY, writeSessionSave } from "./session-save";
import { buyTier, tierById, tierCost } from "./tiers";
import { upgradeById, upgradeCost, NO_UPGRADES } from "./upgrades";
import { recipesForMined } from "./workshop";
import { onTrip, promoteCost, promotePrice } from "./engineers";
import { EMPTY_STOCK, stonesPrice } from "./stock";
import { send, type Expedition } from "./expeditions";
import { ENGINEER_FIX_MS, nextTrouble } from "./hazards";
import { firstNotice, noticesOf } from "./session";

/**
 * A tap's worth of progress: `count` stones taken from the mountain into
 * the stock, so the merge's rock dug in all (`rockDugInAll`) grows with it.
 * The fresh mine's own `digStones` only adds stock (#739).
 */
function dig(mountain: Mountain, count: number): Mountain {
  return {
    ...mountain,
    remaining: mountain.remaining - count,
    stock: { ...mountain.stock, stones: mountain.stock.stones + count },
  };
}

/** `minedMountain(count)` with the crew of 21 at work, so the line mines live. */
function crewedMined(count: number): Mountain {
  return {
    ...minedMountain(count),
    owned: { ...minedMountain(count).owned, helper: 21 },
    jobs: CREWED_JOBS,
  };
}

/** The worker a fresh mine starts with (#703). */
const START_CREW = createMountain().owned.helper;

/** The next worker's price on a fresh start, so a buy below always goes through. */
const firstWorker = tierCost(tierById("helper"), START_CREW);

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

  it("does not save an untouched guest mountain on a tick (#573)", () => {
    const storage = createMemoryStorage();
    let clock = 1_000;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    clock += 3_000;
    progress.tick();
    expect(guestSave(storage)).toBeUndefined();
    expect(progress.getSnapshot().saveKind).toBe("unsigned");
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
    expect(guestSave(storage)?.mountain).toEqual(dug);
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
      expect(docs.get("test-dad")?.stock.stones).toBe(1);
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

    expect(docs.get("test-dad")?.stock.stones).toBe(1);
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
      progress.applyMutation((mountain) => dig(mountain, 1));
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

    expect(progress.getSnapshot().mountain.stock.stones).toBe(9);
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
      expect(second.getSnapshot().mountain.stock.stones).toBe(1);
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
    expect(docs.get("test-dad")?.stock.stones).toBe(1);
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
    expect(guestSave(storage)).toBeUndefined();

    await auth.signOut();
    expect(progress.getSnapshot().mountain).toEqual(dug);
    expect(progress.getSnapshot().saveKind).toBe("session");
    expect(guestSave(storage)?.mountain).toEqual(dug);
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

    expect(guestSave(storage)).toBeUndefined();
    expect(docs.get("test-dad")?.stock.stones).toBe(2);
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
  it("ticks the line's stones into the snapshot and the guest save, with no log line (#573)", () => {
    const storage = createMemoryStorage();
    let clock = 1_000;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    const crew = crewedStart();
    progress.applyMutation(() => crew);

    const logged = progress.getSnapshot().log;
    clock += 2_500;
    progress.tick();
    // The line moves 18 a second: two whole seconds bring 36 up, and the
    // half second waits for the next tick.
    expect(progress.getSnapshot().mountain.stock.stones).toBe(36);
    expect(progress.getSnapshot().log).toBe(logged);
    expect(guestSave(storage)).toEqual({
      mountain: accrue({ mountain: crew, from: 1_000, to: 3_000 }).mountain,
      lastSeen: 3_000,
    });
  });

  it("settles the line's work before a player action so a hire sees the latest pocket", () => {
    let clock = 0;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: createMemoryStorage(),
      now: () => clock,
    });
    progress.applyMutation(() => crewedStart());
    clock += 10_000;

    let seen = -1;
    progress.applyMutation((mountain) => {
      seen = mountain.stock.stones;
      return mountain;
    });
    expect(seen).toBe(180);
    expect(progress.getSnapshot().mountain.stock.stones).toBe(180);
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
  /** A fresh mine at work: the line moves 18 a second live, 5.4 away. */
  const crew: Mountain = {
    ...crewedStart(),
    stock: { ...crewedStart().stock, stones: 5 },
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
    expect(progress.getSnapshot().mountain.stock.stones).toBe(5 + 3240);
    expect(firstNotice(progress.getSnapshot(), "away")?.report).toMatchObject({
      mined: 3240,
      awayMs: 600_000,
      paidMs: 600_000,
      capped: false,
      materials: EMPTY_MATERIALS,
    });
    const paid = accrueAway({ mountain: crew, lastSeen: 0, now: clock });
    expect(firstNotice(progress.getSnapshot(), "away")?.report).toEqual(
      paid.report,
    );
    expect(guestSave(storage)).toEqual({
      mountain: paid.mountain,
      lastSeen: 600_000,
    });
    expect(guestSave(storage)?.mountain.stock.stones).toBe(3245);

    progress.dismiss("away");
    expect(firstNotice(progress.getSnapshot(), "away")?.report).toBeUndefined();
    progress.dispose();

    clock += 500;
    const reopened = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(firstNotice(reopened.getSnapshot(), "away")?.report).toBeUndefined();
    expect(reopened.getSnapshot().mountain.stock.stones).toBe(3245);
  });

  it("shows no card when nothing was mined", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...crew, owned: { ...crew.owned, helper: 0 }, jobs: NO_JOBS },
      lastSeen: 0,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 3_600_000,
    });
    expect(firstNotice(progress.getSnapshot(), "away")?.report).toBeUndefined();
    expect(progress.getSnapshot().mountain.stock.stones).toBe(5);
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
    // A fresh mine's night is the shift report, never the quiet note (#663).
    expect(firstNotice(progress.getSnapshot(), "away")?.report.mined).toBe(432);
    expect(docs.get("test-dad")?.stock.stones).toBe(437);
    expect(progress.getSnapshot().mountain.stock.stones).toBe(437);
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
    expect(progress.getSnapshot().mountain.stock.stones).toBe(5 + 18);
    // Phone locked for five minutes: ticks stop, then one late tick.
    clock += 5 * 60_000;
    progress.tick();
    expect(progress.getSnapshot().mountain.stock.stones).toBe(5 + 18 + 1620);
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
    expect(progress.getSnapshot().mountain.stock.stones).toBe(5 + 18);
    // The phone's clock jumps back an hour (time zone fix, manual change).
    clock -= 60 * 60_000;
    progress.tick();
    expect(progress.getSnapshot().mountain.stock.stones).toBe(5 + 18);
    clock += 1_000;
    progress.tick();
    expect(progress.getSnapshot().mountain.stock.stones).toBe(5 + 18 + 18);
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
    const saved = guestSave(storage);
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
    expect(firstNotice(progress.getSnapshot(), "away")?.report).toBeUndefined();
    expect(progress.getSnapshot().mountain.stock.stones).toBe(5 + 318);
  });

  it("keeps the full card for a real absence, and none under a minute", () => {
    const open = (at: number) => {
      const storage = createMemoryStorage();
      writeSessionSave({ storage, mountain: crew, lastSeen: 0 });
      return createProgressStore({
        auth: createMemoryAuth(),
        sessionStorage: storage,
        now: () => at,
      }).getSnapshot();
    };
    const real = open(5 * 60_000);
    expect(firstNotice(real, "away")?.report).toBeDefined();
    const reload = open(WELCOME_MIN_AWAY_MS - 1_000);
    expect(firstNotice(reload, "away")?.report).toBeUndefined();
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
    expect(firstNotice(progress.getSnapshot(), "away")?.report).toBeUndefined();

    await Promise.resolve();
    push({ kind: "found", mountain: crew, lastSeen: 40_000, rev: 1 });
    await Promise.resolve();
    expect(progress.getSnapshot().mountain.stock.stones).toBe(5);

    push({
      kind: "found",
      mountain: {
        ...crew,
        remaining: MOUNTAIN_STONES - 30,
        stock: { ...crew.stock, stones: 35 },
      },
      lastSeen: 40_000,
      rev: 2,
    });
    expect(progress.getSnapshot().mountain.stock.stones).toBe(35 + 54);
    expect(firstNotice(progress.getSnapshot(), "away")?.report).toBeUndefined();
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

  it("gives a guest a fresh mountain on the device, with no welcome", async () => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: crewedStart(), lastSeen: 0 });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 60_000,
    });
    expect(firstNotice(progress.getSnapshot(), "away")?.report).toBeDefined();

    await progress.startOver();

    const fresh = { ...createMountain(), startedAt: 60_000 };
    expect(progress.getSnapshot().mountain).toEqual(fresh);
    expect(firstNotice(progress.getSnapshot(), "away")?.report).toBeUndefined();
    expect(guestSave(storage)).toEqual({
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
      stock: { ...mountain.stock, stones: mountain.stock.stones + 1 },
    }));
    await Promise.resolve();
    clock += 10;

    await progress.startOver();

    expect(cloud.writes.at(-1)).toEqual({
      ...createMountain(),
      startedAt: 10_010,
    });
    expect(progress.getSnapshot().mountain.remaining).toBe(
      createMountain().remaining,
    );
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
      await progress.startOver();
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

describe("a loaded save gets no grant (#558)", () => {
  it("is played as it was: no free workers, no engineer, nothing written", () => {
    const storage = createMemoryStorage();
    const mountain = {
      ...minedMountain(1_000),
      owned: {
        ...minedMountain(1_000).owned,
        helper: 2,
        cart: 3,
        drill: 1,
        borer: 1,
      },
    };
    writeSessionSave({ storage, mountain, lastSeen: 0 });
    const before = storage.getItem(SESSION_SAVE_KEY);
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 0,
    });
    expect(progress.getSnapshot().mountain.owned.helper).toBe(2);
    expect(progress.getSnapshot().mountain.engineers).toEqual([]);
    expect(progress.getSnapshot().notices).toEqual([]);
    expect(storage.getItem(SESSION_SAVE_KEY)).toBe(before);
    progress.dispose();
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
    progress.applyMutation((current) => ({
      ...current,
      stock: { ...current.stock, stones: 99 },
    }));
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
    progress.applyMutation((current) => ({
      ...current,
      stock: { ...current.stock, stones: 99 },
    }));
    await vi.waitFor(() => {
      expect(writes).toBe(2);
    });
    expect(progress.getSnapshot().saveKind).toBe("error");
    deliver?.({ kind: "found", mountain: server, lastSeen: 1 });
    expect(progress.getSnapshot().mountain.stock.stones).toBe(99);
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

  it("records a tick's guest save the device refuses once the device fills (#573)", () => {
    const storage = createMemoryStorage();
    let clock = 1_000;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    progress.applyMutation(() => ({
      ...minedMountain(2),
      owned: { ...minedMountain(2).owned, helper: 3 },
    }));
    expect(progress.getSnapshot().saveKind).toBe("session");
    storage.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    clock += 2_000;
    progress.tick();
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "save.error",
        data: { source: "session" },
      }),
    );
  });

  it("keeps a reopened guest save current on ticks before any move (#573)", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: crewedMined(2),
      lastSeen: 1_000,
    });
    let clock = 1_000;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(progress.getSnapshot().saveKind).toBe("session");
    clock += 5_000;
    progress.tick();
    expect(guestSave(storage)?.lastSeen).toBe(6_000);
    expect(guestSave(storage)?.mountain.stock.stones).toBe(
      progress.getSnapshot().mountain.stock.stones,
    );
    expect(progress.getSnapshot().mountain.stock.stones).toBeGreaterThan(
      minedMountain(2).stock.stones,
    );
  });

  it("logs a phone backup the device refuses, and keeps the cloud copy", async () => {
    const docs = new Map([["test-dad", minedMountain(3)]]);
    const auth = createMemoryAuth();
    const refusing = createMemoryStorage();
    const setItem = refusing.setItem.bind(refusing);
    refusing.setItem = (key, value) => {
      if (key.startsWith("dad-friendly-game-backup:")) {
        throw new Error("QuotaExceededError");
      }
      setItem(key, value);
    };
    const progress = createProgressStore({
      auth,
      cloudSave: createMemoryCloudSave({ docs }),
      sessionStorage: refusing,
    });
    await auth.signIn();
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveKind).toBe("account");
    });
    progress.applyMutation(() => minedMountain(4));
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "save.error",
        data: { source: "phone" },
      }),
    );
    expect(progress.getSnapshot().log).toContain("save.phone failed");
    await vi.waitFor(() => {
      expect(docs.get("test-dad")).toEqual(minedMountain(4));
    });
    progress.dispose();
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
    expect(progress.getSnapshot().mountain.stock.stones).toBe(88);
    progress.dispose();
    callbacks[1]?.({ kind: "found", mountain: minedMountain(99) });
    expect(progress.getSnapshot().mountain.stock.stones).toBe(88);
  });

  it("treats dismissing nothing, and starting over after dispose, as no-ops", async () => {
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: createMemoryStorage(),
    });
    progress.applyMutation(() => minedMountain(3));
    const before = progress.getSnapshot();
    progress.dismiss("craft");
    progress.dismiss("away");
    expect(progress.getSnapshot()).toEqual(before);
    progress.dispose();
    await progress.startOver();
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

  it("ignores an unaffordable buy", () => {
    const progress = guest();
    progress.dispatch({ kind: "buyTier", id: "helper" });
    expect(progress.fieldLog().events).toEqual([]);
    expect(progress.fieldLog().snapshot.version).toBe(APP_VERSION);
  });

  it("records a tier buy and an upgrade", () => {
    const at = 1_000_000;
    const progress = guest(() => at);
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: firstWorker },
    }));
    progress.dispatch({ kind: "buyTier", id: "helper" });
    expect(progress.fieldLog().events.map((event) => event.code)).toEqual([
      "tier.buy",
    ]);
    expect(progress.fieldLog().events[0]?.data).toEqual({
      id: "helper",
      count: START_CREW + 1,
    });

    // Ten workers open Work boots (#250). The set-up is not a move.
    progress.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, helper: 10 },
      stock: {
        ...mountain.stock,
        stones: upgradeCost(upgradeById("boots"), 0) ?? Number.NaN,
      },
    }));
    const from = progress.fieldLog().events.length;
    progress.dispatch({
      kind: "buyUpgrade",
      id: "boots",
      price: stonesPrice(upgradeCost(upgradeById("boots"), 0) ?? Number.NaN),
    });

    const moves = progress.fieldLog().events.slice(from);
    expect(moves.map((event) => event.code)).toEqual(["upgrade.buy"]);
    expect(moves[0]?.data).toEqual({ id: "boots", count: 1 });
  });

  it("records no move events for the applyMutation seam", () => {
    const progress = guest();
    progress.applyMutation((mountain) =>
      buyTier(
        { ...mountain, stock: { ...mountain.stock, stones: firstWorker } },
        "helper",
      ),
    );
    expect(progress.getSnapshot().mountain.owned.helper).toBe(START_CREW + 1);
    expect(progress.fieldLog().events).toEqual([]);
  });

  it("records nothing for a refused move", () => {
    const progress = guest(() => 5_000);
    progress.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, cart: 1 },
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "cart" }],
    }));
    const before = progress.fieldLog().events;
    expect(
      progress.dispatch({ kind: "station", index: 0, post: "cart" }),
    ).toEqual({ kind: "refused", reason: "no-change" });
    expect(progress.fieldLog().events).toEqual(before);
  });

  it("records an away report", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: crewedStart(),
      lastSeen: 0,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 120_000,
    });

    const events = progress.fieldLog().events;
    expect(events.map((event) => event.code)).toEqual(["away.report"]);
    expect(events[0]?.data).toEqual({ ms: 120_000, stones: 648 });
  });

  it("keeps the old run's events through Start over, and starts Tonight afresh", async () => {
    const progress = guest(() => 8_000);
    progress.applyMutation((mountain) =>
      buyTier(
        { ...mountain, stock: { ...mountain.stock, stones: firstWorker } },
        "helper",
      ),
    );
    progress.dispatch({ kind: "buyTier", id: "helper" });
    const before = progress.fieldLog().events.map((event) => event.code);
    await progress.startOver();
    const codes = () => progress.fieldLog().events.map((event) => event.code);
    expect(codes()).toEqual([...before, "run.start-over"]);
    expect(progress.tonightEvents().map((event) => event.code)).toEqual([
      "run.start-over",
    ]);
  });

  it("copies the newest 50 events", () => {
    const progress = guest();
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 1_000_000 },
    }));
    for (let count = 1; count <= 60; count += 1) {
      progress.dispatch({ kind: "buyTier", id: "helper" });
    }
    const events = progress.fieldLog().events;
    expect(events).toHaveLength(50);
    expect(events[0]?.data).toEqual({ id: "helper", count: START_CREW + 11 });
    expect(events.at(-1)?.data).toEqual({
      id: "helper",
      count: START_CREW + 60,
    });
  });

  it("keeps the ring in memory, not in the save", () => {
    const storage = createMemoryStorage();
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 1,
    });
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: firstWorker },
    }));
    progress.dispatch({ kind: "buyTier", id: "helper" });
    expect(progress.fieldLog().events).toHaveLength(1);
    expect(JSON.stringify(guestSave(storage))).not.toContain("tier.buy");
    progress.dispose();

    const again = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 1,
    });
    expect(again.fieldLog().events).toEqual([]);
    expect(again.getSnapshot().mountain.owned.helper).toBe(START_CREW + 1);
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
    withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, () => {
      const { progress } = guest();
      progress.applyMutation((mountain) => ({
        ...mountain,
        // The borer opens with the Granite's shaft, in part 3 (#673).
        granite: {
          kind: "sunk",
          machines: NO_LEVEL_MACHINES,
          piles: NO_GRANITE_PILES,
        },
        // The borer, in cut stone, and stones for the workers it needs.
        stock: {
          ...mountain.stock,
          cutStone: tierCost(tierById("borer"), 0),
          stones: 5_000_000,
        },
      }));
      progress.dispatch({ kind: "buyTier", id: "borer" });
      expect(codes(progress)).toContain("tier.buy");
      expect(codes(progress)).not.toContain("engineer.promote");
      expect(progress.fieldLog().snapshot.engineers).toEqual([
        { name: "Ada", rank: 0, post: "borer" },
      ]);

      progress.applyMutation((mountain) => {
        const ready = { ...mountain, owned: { ...mountain.owned, helper: 2 } };
        // Exactly the second engineer's Granite price.
        return {
          ...ready,
          stock: { ...ready.stock, stones: promoteCost(ready) },
        };
      });
      progress.dispatch({
        kind: "promote",
        price: promotePrice(progress.getSnapshot().mountain),
      });
      progress.dispatch({ kind: "station", index: 1, post: "drill" });
      progress.dispatch({ kind: "station", index: 1, post: "camp" });
      progress.dispatch({ kind: "station", index: 1, post: "camp" });

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
  });

  it("records a send, a recall, and a live return with the find id", () => {
    const { progress, advance } = guest();
    progress.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, borer: 1 },
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
    }));
    progress.dispatch({ kind: "send", index: 0, tunnel: "side-seam" });
    const trip = progress.getSnapshot().mountain.expeditions[0];
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

    progress.dispatch({ kind: "station", index: 0, post: "cart" });
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

    const sentAt = progress.getSnapshot().mountain.engineers[0]?.post;
    expect(sentAt).toBe("cart");
    progress.applyMutation((mountain) => {
      const sent = send(mountain, 0, "side-seam", 10_000);
      const next = sent.expeditions[0];
      if (next === undefined) {
        return mountain;
      }
      return {
        ...sent,
        expeditions: [{ ...next, returnsAt: 15_000 }],
      };
    });
    const find = progress.getSnapshot().mountain.expeditions[0]?.find;
    if (find === undefined) {
      throw new Error("expected a find");
    }
    const source = find.kind === "quiet" ? "quiet" : find.id;
    for (let step = 0; step < 5; step += 1) {
      advance(1_000);
      progress.tick();
    }
    expect(progress.getSnapshot().mountain.expeditions).toEqual([]);
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "expedition.return",
        data: { id: "Ada", source },
      }),
    );
    expect(source).not.toBe("");
  });

  it("records a return on the first live tick after time away, and a pure recall does not also station", () => {
    const { progress, advance } = guest();
    progress.applyMutation((mountain) => ({
      ...mountain,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" }],
    }));
    progress.applyMutation((mountain) => {
      const sent = send(mountain, 0, "old-shaft", 10_000);
      const next = sent.expeditions[0];
      if (next === undefined) {
        return mountain;
      }
      return { ...sent, expeditions: [{ ...next, returnsAt: 20_000 }] };
    });
    const find = progress.getSnapshot().mountain.expeditions[0]?.find;
    if (find === undefined) {
      throw new Error("expected a find");
    }
    advance(60_000);
    progress.tick();
    // A fresh mine's night brings no party home: the live clock does (#739).
    advance(1_000);
    progress.tick();
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "expedition.return",
        data: { id: "Ada", source: find.kind === "quiet" ? "quiet" : find.id },
      }),
    );

    progress.dispatch({ kind: "send", index: 0, tunnel: "side-seam" });
    const before = codes(progress).length;
    progress.dispatch({ kind: "recall", index: 0 });
    const added = progress.fieldLog().events.slice(before);
    expect(added.map((event) => event.code)).toEqual(["expedition.recall"]);
    expect(added[0]?.data).toEqual({ id: "Ada", source: "side-seam" });
  });

  it("records the find id for a tool, a keepsake, a lost engineer, and a quiet tunnel", () => {
    const { progress, advance, at } = guest();
    progress.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, borer: 1 },
      engineers: [{ name: "Ada", rank: 1, trips: 3, post: "camp" }],
    }));
    const cases: readonly {
      find: Expedition["find"];
      source: string;
    }[] = [
      { find: { kind: "tool", id: "map" }, source: "map" },
      { find: { kind: "keepsake", id: "drawing" }, source: "drawing" },
      { find: { kind: "engineer", id: "Ruth" }, source: "Ruth" },
      { find: { kind: "quiet" }, source: "quiet" },
    ];
    for (const item of cases) {
      const sentAt = at();
      progress.applyMutation((mountain) => {
        const sent = send(mountain, 0, "side-seam", sentAt);
        const next = sent.expeditions[0];
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
      progress.getSnapshot().mountain.engineers.map((hand) => hand.name),
    ).toEqual(["Ada", "Ruth"]);
  });

  it("records a sketch brought home and teaches that recipe", () => {
    const { progress, advance, at } = guest();
    progress.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, borer: 1 },
      engineers: [{ name: "Nils", rank: 1, trips: 3, post: "camp" }],
    }));
    const sentAt = at();
    progress.applyMutation((mountain) => {
      const sent = send(mountain, 0, "deep-dark", sentAt);
      const next = sent.expeditions[0];
      if (next === undefined) {
        return mountain;
      }
      return {
        ...sent,
        expeditions: [
          {
            ...next,
            returnsAt: sentAt + 2_000,
            find: { kind: "recipe", id: "engineers-kit" },
          },
        ],
      };
    });
    advance(2_000);
    progress.tick();
    expect(progress.getSnapshot().mountain.recipes).toContain("engineers-kit");
    expect(progress.getSnapshot().homecomings[0]?.find).toEqual({
      kind: "recipe",
      id: "engineers-kit",
    });
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "recipe.found",
        data: { id: "engineers-kit", source: "deep-dark" },
      }),
    );
    progress.dispose();
  });

  it("records trouble started and fixed by hand, by a hold, and by an engineer", () => {
    const { progress, advance } = guest();
    progress.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, borer: 1, cart: 1 },
    }));
    progress.layoutPreview.trouble("cart");
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

    progress.layoutPreview.trouble("drill");
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
    progress.layoutPreview.trouble("cart");
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

  it("a tap on trouble an engineer fixed meanwhile repaints the card and fixes nothing more", () => {
    const { progress, advance } = guest();
    progress.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, cart: 1 },
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "cart" }],
    }));
    progress.layoutPreview.trouble("cart");
    advance(ENGINEER_FIX_MS);
    const painted = vi.fn();
    const stop = progress.subscribe(painted);
    painted.mockClear();
    progress.pressTrouble("cart");
    expect(progress.getSnapshot().trouble).toBeUndefined();
    expect(painted).toHaveBeenCalled();
    // The tap itself fixes nothing: no fix by hand is recorded.
    expect(progress.fieldLog().events).not.toContainEqual(
      expect.objectContaining({
        code: "trouble.fix",
        data: { id: "cart", source: "hand" },
      }),
    );
    stop();
    progress.dispose();
  });

  it("a hide after the store is put away saves nothing", () => {
    const storage = createMemoryStorage();
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 10_000,
    });
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 5 },
    }));
    const writes = vi.spyOn(storage, "setItem");
    progress.flush();
    // A hide while the store is live writes the guest's save at once.
    expect(writes).toHaveBeenCalled();
    progress.dispose();
    writes.mockClear();
    progress.flush();
    expect(writes).not.toHaveBeenCalled();
  });

  it("records a Master clearing trouble before it sticks", () => {
    const seed = 4;
    const pit = {
      ...createMountain(),
      owned: {
        ...createMountain().owned,
        borer: 1,
        cart: 1,
        drill: 1,
        machine: 1,
      },
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
    progress.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, borer: 1 },
    }));
    progress.layoutPreview.trouble("cart");
    advance(60_000);
    progress.tick();
    expect(progress.getSnapshot().trouble).toBeUndefined();
    expect(codes(progress)).not.toContain("trouble.fix");

    progress.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, borer: 1 },
    }));
    progress.layoutPreview.trouble("borer");
    progress.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, borer: 0 },
    }));
    advance(1_000);
    progress.tick();
    expect(progress.getSnapshot().trouble).toBeUndefined();
    expect(codes(progress)).not.toContain("trouble.fix");
    expect(codes(progress)).toContain("trouble.start");
  });
});

describe("field log cloud copy", () => {
  const user = { uid: "test-dad", label: "Test Dad" };

  const signedIn = (now: () => number, pocket = 0) => {
    const fieldLogs = new Map<string, FieldLogDocument>();
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({
        docs: new Map([
          [
            user.uid,
            {
              ...createMountain(),
              stock: { ...createMountain().stock, stones: pocket },
            },
          ],
        ]),
        fieldLogs,
      }),
      sessionStorage: createMemoryStorage(),
      now,
    });
    return { fieldLogs, progress };
  };

  it("writes nothing for a guest", async () => {
    const fieldLogs = new Map<string, FieldLogDocument>();
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      cloudSave: createMemoryCloudSave({ fieldLogs }),
      sessionStorage: createMemoryStorage(),
      now: () => 1,
    });
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 1 },
    }));
    await progress.startOver();
    progress.flush();
    expect(fieldLogs.size).toBe(0);
    progress.dispose();
  });

  it("waits out the gap, writes on hide, and skips an unchanged copy", () => {
    let clock = 0;
    const { fieldLogs, progress } = signedIn(() => clock);
    expect(fieldLogs.size).toBe(0);

    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 1 },
    }));
    expect(fieldLogOf(fieldLogs, user.uid)?.snapshot.pocket).toBe(1);
    expect(fieldLogOf(fieldLogs, user.uid)?.updatedAt).toBe(0);

    clock += 1_000;
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 2 },
    }));
    expect(fieldLogOf(fieldLogs, user.uid)?.snapshot.pocket).toBe(1);

    progress.flush();
    expect(fieldLogOf(fieldLogs, user.uid)?.snapshot.pocket).toBe(2);
    expect(fieldLogOf(fieldLogs, user.uid)?.updatedAt).toBe(clock);

    const writtenAt = fieldLogOf(fieldLogs, user.uid)?.updatedAt;
    progress.flush();
    expect(fieldLogOf(fieldLogs, user.uid)?.updatedAt).toBe(writtenAt);

    clock += FIELD_LOG_WRITE_GAP_MS;
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 3 },
    }));
    expect(fieldLogOf(fieldLogs, user.uid)?.snapshot.pocket).toBe(3);
    expect(fieldLogOf(fieldLogs, user.uid)?.updatedAt).toBe(clock);
    progress.dispose();
  });

  it("writes the doc at once on Start over, keeping the run before", async () => {
    let clock = 8_000;
    const { fieldLogs, progress } = signedIn(() => clock, firstWorker);
    progress.dispatch({ kind: "buyTier", id: "helper" });
    expect(
      fieldLogOf(fieldLogs, user.uid)?.events.map((event) => event.code),
    ).toEqual(["tier.buy"]);

    clock += 10;
    await progress.startOver();
    // A hired worker is a played mine, kept in Saved copies (#664).
    expect(progress.fieldLog().events.map((event) => event.code)).toEqual([
      "tier.buy",
      "save.archive",
      "run.start-over",
    ]);
    expect(
      fieldLogOf(fieldLogs, user.uid)?.events.map((event) => event.code),
    ).toEqual(["tier.buy", "save.archive", "run.start-over"]);
    expect(fieldLogOf(fieldLogs, user.uid)?.snapshot.crew.helper).toBe(
      START_CREW,
    );
    const resetAt = fieldLogOf(fieldLogs, user.uid)?.updatedAt;
    clock += 10;
    await progress.startOver();
    expect(fieldLogOf(fieldLogs, user.uid)?.updatedAt).toBe(
      (resetAt ?? 0) + 10,
    );
    progress.dispose();
  });

  it("copies the whole ring on hide, not just the menu's 50", () => {
    const { fieldLogs, progress } = signedIn(() => 50_000, 1_000_000_000);
    for (let count = 1; count <= 201; count += 1) {
      progress.dispatch({ kind: "buyTier", id: "helper" });
    }
    expect(fieldLogOf(fieldLogs, user.uid)?.events).toHaveLength(1);
    expect(progress.fieldLog().events).toHaveLength(50);

    progress.flush();
    const log = fieldLogOf(fieldLogs, user.uid);
    expect(log?.events).toHaveLength(200);
    expect(log?.events[0]?.data).toEqual({
      id: "helper",
      count: START_CREW + 2,
    });
    expect(log?.events.at(-1)?.data).toEqual({
      id: "helper",
      count: START_CREW + 201,
    });
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
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 4 },
    }));
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
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 2 },
    }));
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
    again.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 3 },
    }));
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
    ...BARE_MOUNTAIN,
    remaining: 50_000_000,
    stock: { ...BARE_MOUNTAIN.stock, stones: 0 },
    owned: {
      ...BARE_MOUNTAIN.owned,
      helper: 9,
      cart: 1,
      drill: 0,
      borer: 1,
      machine: 0,
      kid: 0,
    },
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

  // The fresh mine's live pace does not read trouble yet (trouble by stage
  // comes with part 3, #539): only the valuation weighs it.
  it("leaves away pay alone, then clears on a break", () => {
    const awaySlow = open();
    const awayPlain = open();
    awaySlow.progress.layoutPreview.trouble("cart");
    awaySlow.advance(60_000);
    awayPlain.advance(60_000);
    awaySlow.progress.tick();
    awayPlain.progress.tick();
    expect(awaySlow.progress.getSnapshot().mountain.stock.stones).toBe(
      awayPlain.progress.getSnapshot().mountain.stock.stones,
    );
    expect(awaySlow.progress.getSnapshot().trouble).toBeUndefined();
  });

  it("is not in the save, and a reload starts clear", async () => {
    const { progress, storage } = open();
    progress.layoutPreview.trouble("cart");
    progress.flush();
    expect(JSON.stringify(guestSave(storage))).not.toContain("cave-in");
    progress.dispose();
    const again = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => 20_000,
      hazardSeed: 2,
    });
    expect(again.getSnapshot().trouble).toBeUndefined();
    again.layoutPreview.trouble("drill");
    await again.startOver();
    expect(again.getSnapshot().trouble).toBeUndefined();
    again.dispose();
  });

  it("starts during live play only once a borer is owned, one at a time", () => {
    const quiet = open();
    quiet.progress.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, borer: 0 },
    }));
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
    mastered.progress.layoutPreview.trouble("cart");
    mastered.advance(1_000);
    mastered.progress.tick();
    expect(mastered.progress.getSnapshot().trouble).toBeUndefined();

    const apprentice = open();
    apprentice.progress.applyMutation((mountain) => ({
      ...mountain,
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "cart" }],
    }));
    apprentice.progress.layoutPreview.trouble("cart");
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
    progress.layoutPreview.trouble("cart");
    progress.pressTrouble("cart");
    progress.fixTrouble("cart");
    expect(progress.getSnapshot().trouble).toBeUndefined();
    progress.dispose();
  });
});

describe("expeditions through the save", () => {
  it("pays time away as the night does, and a reload does not reroll the find", () => {
    const sent = send(
      {
        ...createMountain(),
        owned: { ...createMountain().owned, helper: 8, borer: 1 },
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
    // The night brings no party home (#739): the live clock does.
    expect(progress.getSnapshot().mountain.expeditions).toEqual(
      sent.expeditions,
    );
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
    const trip = sent.expeditions[0];
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
    expect(onTrip(progress.getSnapshot().mountain, "Ada")).toBe(true);
    clock = 5_000;
    progress.tick();
    expect(seen).toBeGreaterThan(1);
    expect(progress.getSnapshot().mountain.engineers[0]).toMatchObject({
      post: "camp",
      trips: 1,
    });
    expect(progress.getSnapshot().mountain.expeditions).toEqual([]);
    progress.dispose();
  });

  it("clamps a future sentAt when the clock is set back", () => {
    const sent = send(
      {
        ...createMountain(),
        owned: { ...createMountain().owned, helper: 8, borer: 1 },
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
      },
      0,
      "side-seam",
      1_000_000,
    );
    const find = sent.expeditions[0]?.find;
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: sent, lastSeen: 1_000_000 });
    let clock = 1_000_000;
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(onTrip(progress.getSnapshot().mountain, "Ada")).toBe(true);
    clock = -60 * 60_000;
    progress.tick();
    progress.flush();
    const saved = guestSave(storage);
    expect(saved?.lastSeen).toBeLessThanOrEqual(clock);
    expect(saved?.mountain.expeditions[0]?.sentAt).toBe(clock);
    expect(saved?.mountain.expeditions[0]?.returnsAt).toBe(clock + 10 * 60_000);
    expect(saved?.mountain.expeditions[0]?.find).toEqual(find);
    expect(saved?.mountain.engineers[0]?.trips).toBe(0);
    progress.dispose();
  });

  // The night brings no party home (#739): only the live clock names them.
  it("names who came home when they return during play", () => {
    const waiting = send(
      {
        ...createMountain(),
        engineers: [{ name: "Nils", rank: 0, trips: 0, post: "camp" }],
      },
      0,
      "side-seam",
      0,
    );
    const trip = waiting.expeditions[0];
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
    expect(firstNotice(live.getSnapshot(), "away")?.report).toBeUndefined();
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
    const trip = sent.expeditions[0];
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
    second.dismiss("away");
    expect(storage.getItem("dad-friendly-game-homecomings")).toBeNull();
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
    storage.setItem(
      "dad-friendly-game-homecomings",
      JSON.stringify(remembered),
    );
    writeSessionSave({ storage, mountain: soon, lastSeen: 0 });
    const merged = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(merged.getSnapshot().homecomings).toHaveLength(3);
    merged.dispose();

    storage.setItem("dad-friendly-game-homecomings", "not json");
    writeSessionSave({ storage, mountain: createMountain(), lastSeen: clock });
    const broken = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: storage,
      now: () => clock,
    });
    expect(broken.getSnapshot().homecomings).toEqual([]);
    broken.dispose();

    storage.setItem(
      "dad-friendly-game-homecomings",
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
      if (key === "dad-friendly-game-homecomings") {
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
    owned: { ...minedMountain(12_000_000).owned, helper: 1, cart: 1 },
    stock: {
      ...minedMountain(12_000_000).stock,
      stones: 5_000_000,
      clay: 20,
      iron: 20,
      crystal: 0,
      heartstone: 0,
    },
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
    expect(
      noticesOf(progress.getSnapshot(), "layer").map(({ layer }) => layer),
    ).toEqual([]);
    progress.dismiss("layer");
    progress.dismiss("craft");

    progress.applyMutation(() => minedMountain(10_000_000));
    expect(
      noticesOf(progress.getSnapshot(), "layer")
        .map(({ layer }) => layer)
        .map((layer) => layer.id),
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
    progress.dismiss("layer");
    expect(
      noticesOf(progress.getSnapshot(), "layer").map(({ layer }) => layer),
    ).toEqual([]);
    progress.dispose();

    const again = guest(storage, () => 0);
    expect(
      noticesOf(again.getSnapshot(), "layer").map(({ layer }) => layer),
    ).toEqual([]);
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
    expect(
      noticesOf(sitting.getSnapshot(), "layer").map(({ layer }) => layer),
    ).toEqual([]);
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

  it("queues every band a single dig breaks into, shallowest first", () => {
    const progress = guest(createMemoryStorage(), () => 0);
    progress.applyMutation(() => minedMountain(120_000_000));
    expect(
      noticesOf(progress.getSnapshot(), "layer")
        .map(({ layer }) => layer)
        .map((layer) => layer.id),
    ).toEqual(["granite", "crystal", "heart"]);
    const enters = progress
      .fieldLog()
      .events.filter((event) => event.code === "layer.enter")
      .map((event) => event.data.id);
    expect(enters).toEqual(["granite", "crystal", "heart"]);
    progress.dismiss("layer");
    progress.dismiss("layer");
    progress.dismiss("layer");
    expect(
      noticesOf(progress.getSnapshot(), "layer").map(({ layer }) => layer),
    ).toEqual([]);
    progress.dispose();
  });

  it("names a finished craft once, during play and after time away", () => {
    const storage = createMemoryStorage();
    let clock = 0;
    const progress = guest(storage, () => clock);
    progress.applyMutation(() => shed());
    progress.dispatch({ kind: "craft", recipe: "iron-rails" });
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "craft.start",
        data: { id: "iron-rails" },
      }),
    );
    expect(
      noticesOf(progress.getSnapshot(), "craft").map(({ craft }) => craft),
    ).toEqual([]);
    const endsAt = progress.getSnapshot().mountain.bench?.endsAt ?? 0;
    while (clock < endsAt) {
      clock = Math.min(endsAt, clock + 9_000);
      progress.tick();
    }
    const fitted = noticesOf(progress.getSnapshot(), "craft").map(
      ({ craft }) => craft,
    );
    expect(fitted.map(({ id, level }) => ({ id, level }))).toEqual([
      { id: "iron-rails", level: 1 },
    ]);
    expect(progress.fieldLog().events).toContainEqual(
      expect.objectContaining({
        code: "craft.done",
        data: { id: "iron-rails", count: 1 },
      }),
    );
    progress.dismiss("craft");
    expect(
      noticesOf(progress.getSnapshot(), "craft").map(({ craft }) => craft),
    ).toEqual([]);
    progress.flush();
    progress.dispose();

    const reloaded = guest(storage, () => clock);
    expect(
      noticesOf(reloaded.getSnapshot(), "craft").map(({ craft }) => craft),
    ).toEqual([]);
    // The kept log comes back with the reload (#479), and names the craft no second time.
    expect(
      reloaded.fieldLog().events.filter((event) => event.code === "craft.done"),
    ).toHaveLength(1);
    reloaded.dispose();

    const awayStore = createMemoryStorage();
    writeSessionSave({
      storage: awayStore,
      mountain: {
        ...shed(),
        owned: { ...shed().owned, helper: 4 },
        bench: { recipe: "iron-rails", startedAt: 0, endsAt: 60_000 },
      },
      lastSeen: 0,
    });
    let back = 120_000;
    const away = guest(awayStore, () => back);
    // A fresh mine's night fits no gear (#739): the first live tick does.
    back += 1_000;
    away.tick();
    expect(
      noticesOf(away.getSnapshot(), "craft")
        .map(({ craft }) => craft)
        .map(({ id, level }) => ({ id, level })),
    ).toEqual([{ id: "iron-rails", level: 1 }]);
    // The fit after time away is the craft-done notice.
    away.dismiss("craft");
    expect(
      noticesOf(away.getSnapshot(), "craft").map(({ craft }) => craft),
    ).toEqual([]);
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
        first.applyMutation((mountain) => dig(mountain, 1));
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
      expect(second.getSnapshot().mountain.stock.stones).toBe(150);
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
      first.applyMutation((mountain) => dig(mountain, 1));
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
        progress.applyMutation((mountain) => dig(mountain, 1));
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
      progress.applyMutation((mountain) => dig(mountain, 1));
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
      progress.applyMutation((mountain) => dig(mountain, 1));
      await Promise.resolve();
      if (tap % 5 === 0) {
        deliver({
          kind: "found",
          mountain: minedMountain(tap - 1),
          lastSeen: clock - 1,
        });
      }
      expect(minedOut(progress.getSnapshot().mountain)).toBe(tap);
      expect(
        progress.getSnapshot().mountain.stock.stones,
      ).toBeGreaterThanOrEqual(tap);
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
        upgrades: { ...NO_UPGRADES, boots: 1 },
      },
      rev: 6,
      lastSeen: 2,
    };
    progress.applyMutation(() => minedMountain(30));
    await vi.waitFor(() => {
      expect(progress.getSnapshot().saveConflict).toBeDefined();
    });
    expect(server.rev).toBe(6);
    expect(minedOut(progress.getSnapshot().mountain)).toBe(30);
    expect(progress.getSnapshot().mountain.upgrades).toEqual(NO_UPGRADES);
    expect(
      progress.getSnapshot().saveConflict?.remote.mountain.upgrades,
    ).toEqual({ ...NO_UPGRADES, boots: 1 });
    expect(progress.fieldLog().events.map((event) => event.code)).toContain(
      "save.conflict",
    );
    expect(progress.fieldLog().snapshot.rev).toBeGreaterThan(0);
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
      first.applyMutation((mountain) => dig(mountain, 1));
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
      live.applyMutation((currentMountain) => dig(currentMountain, 1));
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

  it("holds play when a rev refusal finds a later build's save on the server", async () => {
    const cloud: CloudSave = {
      load: () => Promise.resolve({ kind: "newer" }),
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
      expect(progress.getSnapshot().saveKind).toBe("loading");
    });
    expect(progress.getSnapshot().log).toContain("save.newer");
    progress.dispose();
  });

  it("drops a rev refusal's server read that lands after the store is put away", async () => {
    let answer: (loaded: CloudLoadResult) => void = () => undefined;
    let reads = 0;
    const cloud: CloudSave = {
      load: () => {
        reads += 1;
        return new Promise<CloudLoadResult>((resolve) => {
          answer = resolve;
        });
      },
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
    progress.applyMutation(() => minedMountain(2));
    await vi.waitFor(() => {
      expect(reads).toBe(1);
    });
    const before = progress.getSnapshot().log;
    progress.dispose();
    answer({ kind: "newer" });
    await Promise.resolve();
    await Promise.resolve();
    expect(progress.getSnapshot().log).toBe(before);
    expect(progress.getSnapshot().log).not.toContain("save.newer");
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
    return phone.kind === "present" ? phone.save.mountain.stock.stones : -1;
  };

  it("reads the server on resume before a cloud write, and takes its newer copy", async () => {
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
    expect(progress.getSnapshot().mountain.stock.stones).toBe(2);
    // Another device dug on from the synced copy.
    server = {
      mountain: dig(progress.getSnapshot().mountain, 8),
      rev: 2,
      lastSeen: 2,
      deviceId: "other-device",
    };
    const before = writes;
    const resume = progress.resume();
    expect(resume.kind).toBe("reading");
    progress.applyMutation((mountain) => dig(mountain, 1));
    expect(writes).toBe(before);
    const phone = readPhoneBackup({ storage, uid: user.uid });
    expect(phone.kind === "present" && phone.save.mountain.stock.stones).toBe(
      3,
    );
    if (resume.kind === "reading") {
      release?.();
      await resume.done;
    }
    // The gap's change is lost to the newer copy: a fresh mine has no
    // hand taps to carry over the read (#739).
    expect(minedOut(progress.getSnapshot().mountain)).toBe(10);
    await vi.waitFor(() => {
      expect(server.mountain.stock.stones).toBe(10);
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
        written.push(args.mountain.stock.stones);
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
      save: { mountain: { stock: { stones: 3 } } },
    });
    mode = "throw";
    const thrown = progress.resume();
    if (thrown.kind === "reading") {
      await thrown.done;
    }
    expect(progress.getSnapshot().mountain.stock.stones).toBe(3);
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
    progress.applyMutation((mountain) => dig(mountain, 1));
    if (resume.kind === "reading") {
      release?.();
      await resume.done;
    }
    // The fresh read's copy, not the watch's 40. A fresh mine has no hand
    // taps to carry over the read (#739).
    expect(minedOut(progress.getSnapshot().mountain)).toBe(4);
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
    expect(second.getSnapshot().mountain.stock.stones).toBe(6);
    const raw = storage.getItem("dad-friendly-game");
    second.applyMutation(() => minedMountain(9));
    expect(storage.getItem("dad-friendly-game")).toBe(raw);
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
    expect(second.getSnapshot().mountain.stock.stones).toBe(0);
    first.applyMutation(() => minedMountain(4));
    await vi.waitFor(() => {
      expect(docs.get(user.uid)?.stock.stones).toBe(4);
    });
    await second.playHere();
    await vi.waitFor(() => {
      expect(second.getSnapshot().playing).toBe(true);
      expect(second.getSnapshot().mountain.stock.stones).toBe(4);
    });
    expect(first.getSnapshot().elsewhere).toBe(true);
    second.applyMutation(() => minedMountain(5));
    await vi.waitFor(() => {
      expect(docs.get(user.uid)?.stock.stones).toBe(5);
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
      expect(server?.mountain.stock.stones).toBe(3);
    });
    online = false;
    first.applyMutation(() => minedMountain(5));
    expect(queued.map((doc) => doc.mountain.stock.stones)).toContain(5);
    const phone = readPhoneBackup({ storage, uid: user.uid });
    expect(phone.kind === "present" && phone.save.mountain.stock.stones).toBe(
      5,
    );
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
    expect(second.getSnapshot().mountain.stock.stones).toBe(5);
    const revBefore = server?.rev ?? 0;
    second.applyMutation(() => minedMountain(6));
    await vi.waitFor(() => {
      expect(server?.mountain.stock.stones).toBe(6);
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
      expect(progress.getSnapshot().mountain.stock.stones).toBe(8);
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
    expect(progress.getSnapshot().mountain.stock.stones).toBe(9);
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
      expect(progress.getSnapshot().mountain.stock.stones).toBe(4);
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
    expect(progress.getSnapshot().mountain.stock.stones).toBe(5);
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
        written.push(args.mountain.stock.stones);
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
      expect(docs.get(user.uid)?.stock.stones).toBe(4);
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
      expect(second.getSnapshot().mountain.stock.stones).toBeGreaterThanOrEqual(
        8,
      );
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
      expect(progress.getSnapshot().mountain.stock.stones).toBe(6);
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
    const saved = storage.getItem(`dad-friendly-game-backup:${user.uid}`);
    second.applyMutation(() => minedMountain(9));
    second.tick();
    expect(storage.getItem(`dad-friendly-game-backup:${user.uid}`)).toBe(saved);
    expect(second.getSnapshot().mountain.stock.stones).not.toBe(9);
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
          mountain: crewedMined(1),
          rev: 1,
          lastSeen: clock,
        });
      },
      write: (args) => {
        written.push(args.mountain.stock.stones);
        return Promise.resolve({ kind: "ok" });
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({
          kind: "found",
          mountain: crewedMined(1),
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
      stock: { ...mountain.stock, stones: mountain.stock.stones + 1 },
      remaining: mountain.remaining - 1,
    }));
    expect(phonePocket(storage)).toBe(2);
    expect(written).toEqual([]);
    clock = 22_000;
    progress.tick();
    expect(progress.getSnapshot().mountain.stock.stones).toBe(2);
    if (reading.kind === "reading") {
      await reading.done;
    }
    expect(progress.getSnapshot().log).toContain("save.resume timeout");
    progress.tick();
    expect(progress.getSnapshot().mountain.stock.stones).toBeGreaterThan(2);
    expect(phonePocket(storage)).toBe(
      progress.getSnapshot().mountain.stock.stones,
    );
    expect(written).toEqual([]);
    deliver({
      kind: "found",
      mountain: {
        ...minedMountain(1),
        owned: { ...minedMountain(1).owned, helper: 1 },
      },
      rev: 1,
      lastSeen: 20_000,
    });
    await vi.waitFor(() => {
      expect(written.length).toBeGreaterThan(0);
    });
    expect(written.at(-1)).toBe(progress.getSnapshot().mountain.stock.stones);
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
        written.push(args.mountain.stock.stones);
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
    const pocket = progress.getSnapshot().mountain.stock.stones;
    resolveLoad?.({ kind: "found", mountain: minedMountain(50), rev: 9 });
    await Promise.resolve();
    expect(progress.getSnapshot().mountain.stock.stones).toBe(pocket);
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

  it("pagehide still saves when the writer listener is registered first", async () => {
    const storage = createMemoryStorage();
    const docs = new Map<string, Mountain>();
    const cloud = createMemoryCloudSave({ docs });
    const writer = createTabWriter({
      tabId: "tab-writer",
      storage,
      leaseMs: 60_000,
    });
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      tabWriter: writer,
      cloudWriteGapMs: 0,
    });
    const unbind = bindWriterPageHide(writer);
    const onHide = (): void => {
      progress.flush();
    };
    window.addEventListener("pagehide", onHide);
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    progress.applyMutation(() => minedMountain(4));
    await vi.waitFor(() => {
      expect(docs.get(user.uid)?.stock.stones).toBe(4);
    });
    docs.delete(user.uid);
    storage.removeItem(`dad-friendly-game-backup:${user.uid}`);
    window.dispatchEvent(new Event("pagehide"));
    expect(phonePocket(storage)).toBe(4);
    await vi.waitFor(() => {
      expect(docs.get(user.uid)?.stock.stones).toBe(4);
    });
    window.removeEventListener("pagehide", onHide);
    unbind();
    progress.dispose();
  });
});

describe("two saves found (#226)", () => {
  const user = { uid: "test-dad", label: "Test Dad" };
  const clock = 1_700_000_000_000;
  const materials = { clay: 3, iron: 1, crystal: 0, heartstone: 0 } as const;
  const base = (): Mountain => ({
    ...minedMountain(1_000),
    stock: { ...minedMountain(1_000).stock, stones: 500, ...materials },
  });

  const open = (
    cloud: CloudSave,
    storage: Storage,
    now: () => number = () => clock,
  ) =>
    createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: storage,
      now,
      cloudWriteGapMs: 0,
    });

  it("gives the second writer the sheet and keeps play paused", async () => {
    const docs = new Map<string, Mountain>();
    const holdEcho = { held: false };
    const cloud = createMemoryCloudSave({ docs, holdEcho });
    await cloud.write({
      uid: user.uid,
      mountain: base(),
      rev: 1,
      deviceId: "seed-device",
      deviceLabel: "Chrome on Android",
      lastSeen: clock,
    });
    const storageA = createMemoryStorage();
    const storageB = createMemoryStorage();
    const first = open(cloud, storageA);
    const second = open(cloud, storageB);
    await vi.waitFor(() => {
      expect(first.getSnapshot().ready).toBe(true);
      expect(second.getSnapshot().ready).toBe(true);
    });
    holdEcho.held = true;
    first.applyMutation((mountain) => ({
      ...mountain,
      upgrades: { ...NO_UPGRADES, boots: 1 },
    }));
    await vi.waitFor(() => {
      expect(docs.get(user.uid)?.upgrades).toEqual({
        ...NO_UPGRADES,
        boots: 1,
      });
    });
    expect(first.getSnapshot().saveConflict).toBeUndefined();
    const otherMaterials = { clay: 9, iron: 4, crystal: 0, heartstone: 0 };
    second.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, cart: 2, drill: 1, helper: 4 },
      stock: { ...mountain.stock, stones: 80, ...otherMaterials },
    }));
    await vi.waitFor(() => {
      expect(second.getSnapshot().saveConflict).toBeDefined();
    });
    const conflict = second.getSnapshot().saveConflict;
    expect(conflict?.local.mountain.owned.cart).toBe(2);
    expect(conflict?.local.mountain.stock.stones).toBe(80);
    expect(conflict?.local.mountain.stock).toMatchObject(otherMaterials);
    expect(conflict?.remote.mountain.upgrades).toEqual({
      ...NO_UPGRADES,
      boots: 1,
    });
    expect(conflict?.remote.mountain.owned.cart).toBe(0);
    expect(first.getSnapshot().saveConflict).toBeUndefined();
    const server = await cloud.load({ uid: user.uid });
    expect(server.kind === "found" && server.rev).toBe(2);

    second.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 1 },
    }));
    second.tick();
    expect(second.getSnapshot().mountain.stock.stones).toBe(80);
    expect(second.getSnapshot().mountain.owned.cart).toBe(2);
    expect(firstNotice(second.getSnapshot(), "away")?.report).toBeUndefined();
    expect((await cloud.load({ uid: user.uid })).kind === "found").toBe(true);
    const still = await cloud.load({ uid: user.uid });
    expect(still.kind === "found" && still.rev).toBe(2);

    second.dispose();
    const reloaded = open(cloud, storageB);
    await vi.waitFor(() => {
      expect(
        reloaded.getSnapshot().saveConflict?.local.mountain.owned.cart,
      ).toBe(2);
    });
    expect(
      reloaded.getSnapshot().saveConflict?.remote.mountain.upgrades,
    ).toEqual({ ...NO_UPGRADES, boots: 1 });
    expect(firstNotice(reloaded.getSnapshot(), "away")?.report).toBeUndefined();
    const phone = readPhoneBackup({ storage: storageB, uid: user.uid });
    expect(phone.kind).toBe("present");
    if (phone.kind === "present") {
      expect(phone.syncedRev).toBe(1);
      expect(phone.conflict?.remote.rev).toBe(2);
    }

    await expect(reloaded.chooseSave("local")).resolves.toBe("saved");
    await vi.waitFor(async () => {
      const saved = await cloud.load({ uid: user.uid });
      expect(saved.kind === "found" && saved.rev).toBe(3);
    });
    expect(reloaded.getSnapshot().saveConflict).toBeUndefined();
    expect(reloaded.getSnapshot().mountain.owned.cart).toBe(2);
    expect(reloaded.getSnapshot().mountain.owned.drill).toBe(1);
    expect(reloaded.getSnapshot().mountain.owned.helper).toBe(4);
    expect(reloaded.getSnapshot().mountain.stock.stones).toBe(80);
    expect(reloaded.getSnapshot().mountain.stock).toMatchObject(otherMaterials);
    expect(reloaded.getSnapshot().mountain.upgrades).toEqual(NO_UPGRADES);
    const copies = await reloaded.savedCopies();
    expect(copies).toHaveLength(1);
    expect(copies[0]?.mountain.upgrades).toEqual({ ...NO_UPGRADES, boots: 1 });
    expect(copies[0]?.mountain.owned.cart).toBe(0);
    const events = reloaded.fieldLog().events.map((event) => event.code);
    expect(events).toContain("save.conflict");
    const choice = reloaded
      .fieldLog()
      .events.find(
        (event) =>
          event.code === "save.conflict" &&
          (event.data as { chosen?: string }).chosen === "local",
      );
    expect(choice?.data).toMatchObject({
      minedLocal: 1_000,
      minedRemote: 1_000,
      chosen: "local",
    });

    const id = copies[0]?.id;
    if (id === undefined) {
      throw new Error("missing archive");
    }
    await expect(reloaded.restoreCopy(id)).resolves.toBe("saved");
    await vi.waitFor(() => {
      expect(reloaded.getSnapshot().mountain.upgrades).toEqual({
        ...NO_UPGRADES,
        boots: 1,
      });
    });
    expect(reloaded.getSnapshot().mountain.owned.cart).toBe(0);
    expect(reloaded.getSnapshot().mountain.stock.stones).toBe(500);
    expect(reloaded.fieldLog().events.map((event) => event.code)).toContain(
      "save.restore",
    );
    const restored = await reloaded.savedCopies();
    expect(
      restored.some(
        (copy) =>
          copy.mountain.owned.cart === 2 && copy.mountain.stock.stones === 80,
      ),
    ).toBe(true);
    first.dispose();
    reloaded.dispose();
  });

  it("adopts the other device exactly and archives this phone, machines included", async () => {
    const holdEcho = { held: true };
    const cloud = createMemoryCloudSave({ holdEcho });
    await cloud.write({
      uid: user.uid,
      mountain: base(),
      rev: 1,
      deviceId: "seed-device",
      deviceLabel: "Safari on iPhone",
      lastSeen: clock,
    });
    const phone = createMemoryStorage();
    const other = createMemoryStorage();
    const here = open(cloud, phone);
    const there = open(cloud, other);
    await vi.waitFor(() => {
      expect(here.getSnapshot().ready).toBe(true);
      expect(there.getSnapshot().ready).toBe(true);
    });
    here.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, cart: 3, machine: 1 },
      stock: {
        ...mountain.stock,
        stones: 40,
        clay: 1,
        iron: 0,
        crystal: 0,
        heartstone: 0,
      },
    }));
    await vi.waitFor(async () => {
      const saved = await cloud.load({ uid: user.uid });
      expect(saved.kind === "found" && saved.rev).toBe(2);
    });
    there.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, drill: 2 },
      stock: {
        ...mountain.stock,
        stones: 70,
        clay: 8,
        iron: 2,
        crystal: 1,
        heartstone: 0,
      },
    }));
    await vi.waitFor(() => {
      expect(there.getSnapshot().saveConflict).toBeDefined();
    });
    expect(here.getSnapshot().saveConflict).toBeUndefined();
    await expect(there.chooseSave("remote")).resolves.toBe("saved");
    await vi.waitFor(() => {
      expect(there.getSnapshot().saveConflict).toBeUndefined();
    });
    const chosen = there.getSnapshot().mountain;
    expect(chosen.owned.cart).toBe(3);
    expect(chosen.owned.machine).toBe(1);
    expect(chosen.owned.drill).toBe(0);
    expect(chosen.stock.stones).toBe(40);
    expect(chosen.stock).toMatchObject({
      clay: 1,
      iron: 0,
      crystal: 0,
      heartstone: 0,
    });
    const archived = await there.savedCopies();
    expect(
      archived.some(
        (copy) =>
          copy.mountain.owned.drill === 2 &&
          copy.mountain.stock.stones === 70 &&
          copy.mountain.stock.crystal === 1,
      ),
    ).toBe(true);
    const choice = there
      .fieldLog()
      .events.find(
        (event) =>
          event.code === "save.conflict" &&
          (event.data as { chosen?: string }).chosen === "remote",
      );
    expect(choice).toBeDefined();
    here.dispose();
    there.dispose();
  });

  it("keeps the sheet when the archive write fails", async () => {
    const archiveGate = { fail: true };
    const holdEcho = { held: true };
    const cloud = createMemoryCloudSave({ holdEcho, archiveGate });
    await cloud.write({
      uid: user.uid,
      mountain: base(),
      rev: 1,
      deviceId: "seed-device",
      lastSeen: clock,
    });
    const storage = createMemoryStorage();
    const progress = open(cloud, storage);
    const other = open(cloud, createMemoryStorage());
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
      expect(other.getSnapshot().ready).toBe(true);
    });
    progress.applyMutation((mountain) => ({
      ...mountain,
      upgrades: { ...NO_UPGRADES, boots: 1 },
    }));
    other.applyMutation((mountain) => ({
      ...mountain,
      owned: { ...mountain.owned, cart: 1 },
    }));
    await vi.waitFor(() => {
      expect(
        progress.getSnapshot().saveConflict ?? other.getSnapshot().saveConflict,
      ).toBeDefined();
    });
    const sheet = progress.getSnapshot().saveConflict ? progress : other;
    const before = sheet.getSnapshot().mountain;
    await expect(sheet.chooseSave("local")).resolves.toBe("kept");
    expect(sheet.getSnapshot().saveConflict?.error).toBe("archive-failed");
    expect(sheet.getSnapshot().mountain).toBe(before);
    const server = await cloud.load({ uid: user.uid });
    expect(server.kind === "found" && server.rev).toBe(2);
    expect(await sheet.savedCopies()).toEqual([]);
    progress.dispose();
    other.dispose();
  });

  it("does not open the sheet for an echo of this device", async () => {
    const storage = createMemoryStorage();
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    const cloud: CloudSave = {
      load: () =>
        Promise.resolve({
          kind: "found",
          mountain: base(),
          rev: 1,
          lastSeen: clock,
          deviceId: readDeviceId(storage),
        }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({
          kind: "found",
          mountain: base(),
          rev: 1,
          lastSeen: clock,
          deviceId: readDeviceId(storage),
        });
        return () => undefined;
      },
    };
    const progress = open(cloud, storage);
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 40 },
    }));
    deliver({
      kind: "found",
      mountain: { ...base(), owned: { ...base().owned, cart: 5 } },
      rev: 6,
      lastSeen: clock,
      deviceId: readDeviceId(storage),
      deviceLabel: "Chrome on Android",
    });
    expect(progress.getSnapshot().saveConflict).toBeUndefined();
    expect(progress.getSnapshot().mountain.stock.stones).toBe(40);
    expect(progress.getSnapshot().mountain.owned.cart).toBe(0);
    progress.dispose();
  });

  it("previews the sheet and pauses play", () => {
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-out" } }),
      sessionStorage: createMemoryStorage(),
      now: () => clock,
    });
    progress.layoutPreview.conflict();
    const conflict = progress.getSnapshot().saveConflict;
    expect(conflict?.local.deviceLabel).toBe("Chrome on Android");
    expect(conflict?.remote.deviceLabel).toBe("Safari on iPhone");
    expect(conflict?.local.mountain.owned.helper).toBe(28);
    expect(conflict?.remote.mountain.owned.cart).toBe(2);
    progress.applyMutation(() => minedMountain(3));
    progress.tick();
    expect(progress.getSnapshot().mountain.owned.cart).toBe(6);
    expect(firstNotice(progress.getSnapshot(), "away")?.report).toBeUndefined();
    progress.dispose();
  });

  it("opens from a live snapshot, adopts a clean split, and resumes into the sheet", async () => {
    const at = 5_000;
    let server = {
      mountain: base(),
      rev: 1,
      deviceId: "other-device",
      deviceLabel: "Safari on iPhone",
      lastSeen: at,
    };
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    let writes = 0;
    const cloud: CloudSave = {
      load: () =>
        Promise.resolve({
          kind: "found",
          mountain: server.mountain,
          rev: server.rev,
          lastSeen: server.lastSeen,
          deviceId: server.deviceId,
          deviceLabel: server.deviceLabel,
        }),
      write: () => {
        writes += 1;
        return new Promise(() => undefined);
      },
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({
          kind: "found",
          mountain: server.mountain,
          rev: server.rev,
          lastSeen: server.lastSeen,
          deviceId: server.deviceId,
          deviceLabel: server.deviceLabel,
        });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => at,
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    server = {
      mountain: { ...base(), owned: { ...base().owned, cart: 2 } },
      rev: 2,
      deviceId: "other-device",
      deviceLabel: "Safari on iPhone",
      lastSeen: at,
    };
    deliver({
      kind: "found",
      ...server,
    });
    expect(progress.getSnapshot().saveConflict).toBeUndefined();
    expect(progress.getSnapshot().mountain.owned.cart).toBe(2);

    progress.applyMutation((mountain) => ({
      ...mountain,
      upgrades: { ...NO_UPGRADES, boots: 1 },
    }));
    expect(writes).toBe(1);
    server = {
      mountain: { ...base(), owned: { ...base().owned, drill: 1 } },
      rev: 3,
      deviceId: "other-device",
      deviceLabel: "Safari on iPhone",
      lastSeen: at,
    };
    const reading = progress.resume();
    expect(reading.kind).toBe("reading");
    if (reading.kind === "reading") {
      await reading.done;
    }
    expect(
      progress.getSnapshot().saveConflict?.local.mountain.upgrades,
    ).toEqual({ ...NO_UPGRADES, boots: 1 });
    expect(
      progress.getSnapshot().saveConflict?.remote.mountain.owned.drill,
    ).toBe(1);
    const writesAtSheet = writes;
    progress.flush();
    deliver({
      kind: "found",
      mountain: { ...base(), owned: { ...base().owned, borer: 1 } },
      rev: 4,
      lastSeen: at,
      deviceId: "other-device",
      deviceLabel: "Safari on iPhone",
    });
    expect(progress.getSnapshot().mountain.upgrades).toEqual({
      ...NO_UPGRADES,
      boots: 1,
    });
    expect(progress.getSnapshot().mountain.owned.borer).toBe(0);
    expect(writes).toBe(writesAtSheet);
    deliver({ kind: "unavailable" });
    expect(
      progress.getSnapshot().saveConflict?.local.mountain.upgrades,
    ).toEqual({ ...NO_UPGRADES, boots: 1 });
    progress.dispose();
  });

  it("opens the sheet when another device's snapshot arrives mid-play", async () => {
    const at = 5_000;
    let deliver: (remote: CloudLoadResult) => void = () => undefined;
    const cloud: CloudSave = {
      load: () =>
        Promise.resolve({
          kind: "found",
          mountain: base(),
          rev: 1,
          lastSeen: at,
          deviceId: "other-device",
        }),
      write: () => new Promise(() => undefined),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        deliver = onChange;
        onChange({
          kind: "found",
          mountain: base(),
          rev: 1,
          lastSeen: at,
          deviceId: "other-device",
        });
        return () => undefined;
      },
    };
    const progress = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => at,
      cloudWriteGapMs: 0,
    });
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    progress.applyMutation((mountain) => ({
      ...mountain,
      upgrades: { ...NO_UPGRADES, boots: 1 },
    }));
    deliver({
      kind: "found",
      mountain: { ...base(), owned: { ...base().owned, cart: 3 } },
      rev: 2,
      deviceId: "other-device",
      deviceLabel: "Safari on iPhone",
    });
    expect(
      progress.getSnapshot().saveConflict?.local.mountain.upgrades,
    ).toEqual({ ...NO_UPGRADES, boots: 1 });
    expect(
      progress.getSnapshot().saveConflict?.remote.mountain.owned.cart,
    ).toBe(3);
    expect(progress.getSnapshot().saveKind).toBe("account");
    progress.dispose();
  });

  describe("Tonight's events (#375)", () => {
    const codes = (events: readonly { code: string }[]) =>
      events.map((event) => event.code);

    /** A signed-in store on a seeded cloud, with one worded buy recorded and saved. */
    const boughtTonight = async (holdEcho = { held: false }) => {
      const cloud = createMemoryCloudSave({ holdEcho });
      await cloud.write({
        uid: user.uid,
        mountain: base(),
        rev: 1,
        deviceId: "seed-device",
        lastSeen: clock,
      });
      const progress = open(cloud, createMemoryStorage());
      await vi.waitFor(() => {
        expect(progress.getSnapshot().ready).toBe(true);
      });
      progress.applyMutation((mountain) => ({
        ...mountain,
        stock: { ...mountain.stock, stones: firstWorker },
      }));
      progress.dispatch({ kind: "buyTier", id: "helper" });
      await vi.waitFor(async () => {
        const saved = await cloud.load({ uid: user.uid });
        expect(saved.kind === "found" && saved.mountain.owned.helper).toBe(1);
      });
      expect(codes(progress.tonightEvents())).toContain("tier.buy");
      return { cloud, progress };
    };

    it("start fresh at a restore, while the field log keeps them", async () => {
      const { cloud, progress } = await boughtTonight();
      await cloud.archiveCopy?.({
        uid: user.uid,
        mountain: { ...base(), owned: { ...base().owned, cart: 1 } },
        lastSeen: clock,
        rev: 1,
        deviceId: "other-device",
        deviceLabel: "Safari on iPhone",
        reason: "conflict",
      });
      const copies = await progress.savedCopies();
      await expect(progress.restoreCopy(copies[0]?.id ?? "")).resolves.toBe(
        "saved",
      );
      expect(codes(progress.tonightEvents())).not.toContain("tier.buy");
      expect(codes(progress.fieldLog().events)).toEqual(
        expect.arrayContaining(["tier.buy", "save.restore"]),
      );
      progress.dispose();
    });

    it("start fresh when a resume takes another device's newer copy", async () => {
      const holdEcho = { held: false };
      const { cloud, progress } = await boughtTonight(holdEcho);
      const here = progress.getSnapshot().mountain;
      const saved = await cloud.load({ uid: user.uid });
      holdEcho.held = true;
      await cloud.write({
        uid: user.uid,
        mountain: { ...here, remaining: here.remaining - 5_000 },
        rev: (saved.kind === "found" ? (saved.rev ?? 0) : 0) + 1,
        deviceId: "other-device",
        lastSeen: clock,
      });
      const resume = progress.resume();
      if (resume.kind === "reading") {
        await resume.done;
      }
      expect(progress.getSnapshot().mountain.remaining).toBe(
        here.remaining - 5_000,
      );
      expect(codes(progress.tonightEvents())).not.toContain("tier.buy");
      expect(codes(progress.fieldLog().events)).toContain("tier.buy");
      progress.dispose();
    });

    it("keep going through a resume that finds this phone's own copy", async () => {
      const { progress } = await boughtTonight();
      const resume = progress.resume();
      if (resume.kind === "reading") {
        await resume.done;
      }
      expect(codes(progress.fieldLog().events)).toContain("save.resume");
      expect(codes(progress.tonightEvents())).toContain("tier.buy");
      progress.dispose();
    });
  });

  it("refuses a choice or a restore when there is nothing to switch", async () => {
    const archiveGate = { fail: true };
    const cloud = createMemoryCloudSave({ archiveGate });
    await cloud.write({
      uid: user.uid,
      mountain: base(),
      rev: 1,
      deviceId: "seed-device",
      lastSeen: clock,
    });
    const progress = open(cloud, createMemoryStorage());
    await vi.waitFor(() => {
      expect(progress.getSnapshot().ready).toBe(true);
    });
    await expect(progress.chooseSave("local")).resolves.toBe("kept");
    await expect(progress.restoreCopy("missing-copy")).resolves.toBe("missing");
    archiveGate.fail = false;
    await cloud.archiveCopy?.({
      uid: user.uid,
      mountain: { ...base(), owned: { ...base().owned, cart: 1 } },
      lastSeen: clock,
      rev: 1,
      deviceId: "other-device",
      deviceLabel: "Safari on iPhone",
      reason: "conflict",
    });
    archiveGate.fail = true;
    const copies = await progress.savedCopies();
    expect(copies).toHaveLength(1);
    await expect(progress.restoreCopy(copies[0]?.id ?? "")).resolves.toBe(
      "kept",
    );
    expect(progress.getSnapshot().mountain.owned.cart).toBe(0);
    const guest = createProgressStore({
      auth: createMemoryAuth({ state: { kind: "signed-out" } }),
      sessionStorage: createMemoryStorage(),
    });
    await expect(guest.savedCopies()).resolves.toEqual([]);
    await expect(guest.restoreCopy("x")).resolves.toBe("kept");
    guest.dispose();
    progress.dispose();
  });

  it("restores a copy from the same run", async () => {
    const cloud = createMemoryCloudSave();
    const storage = createMemoryStorage();
    const playing = {
      ...base(),
      stock: { ...base().stock, stones: 3 },
      startedAt: 5,
      owned: { ...base().owned, cart: 1 },
    };
    const archived = {
      ...base(),
      stock: { ...base().stock, stones: 9 },
      startedAt: 5,
      owned: { ...base().owned, cart: 4, drill: 2 },
    };
    await cloud.write({
      uid: user.uid,
      mountain: playing,
      rev: 1,
      deviceId: "seed-device",
      lastSeen: clock,
    });
    await cloud.archiveCopy?.({
      uid: user.uid,
      mountain: archived,
      lastSeen: clock,
      rev: 1,
      deviceId: "other-device",
      deviceLabel: "Safari on iPhone",
      reason: "conflict",
    });
    const progress = open(cloud, storage);
    await vi.waitFor(() => {
      expect(progress.getSnapshot().mountain.stock.stones).toBe(3);
    });
    const copies = await progress.savedCopies();
    await expect(progress.restoreCopy(copies[0]?.id ?? "")).resolves.toBe(
      "saved",
    );
    await vi.waitFor(() => {
      expect(progress.getSnapshot().mountain.stock.stones).toBe(9);
    });
    expect(progress.getSnapshot().mountain.owned.cart).toBe(4);
    expect(progress.getSnapshot().mountain.owned.drill).toBe(2);
    expect(progress.getSnapshot().mountain.startedAt).toBe(5);
    const restored = await cloud.load({ uid: user.uid });
    expect(restored.kind === "found" && restored.mountain.stock.stones).toBe(9);
    const kept = await progress.savedCopies();
    expect(
      kept.some(
        (copy) =>
          copy.mountain.stock.stones === 3 && copy.mountain.owned.cart === 1,
      ),
    ).toBe(true);
    progress.dispose();
  });
});

describe("dispatch (#409)", () => {
  const store = () =>
    createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage: createMemoryStorage(),
    });

  it("applies a buy, says what it spent, saves it and tells listeners", () => {
    const sessionStorage = createMemoryStorage();
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage,
    });
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: 1_000 },
    }));
    const heard: number[] = [];
    progress.subscribe((snapshot) =>
      heard.push(snapshot.mountain.owned.helper),
    );
    const result = progress.dispatch({ kind: "buyTier", id: "helper" });
    expect(result).toEqual({
      kind: "applied",
      spent: { ...EMPTY_STOCK, stones: firstWorker },
      gained: EMPTY_STOCK,
    });
    expect(progress.getSnapshot().mountain.owned.helper).toBe(START_CREW + 1);
    expect(guestSave(sessionStorage)?.mountain.owned.helper).toBe(
      START_CREW + 1,
    );
    expect(heard.at(-1)).toBe(START_CREW + 1);
  });

  it("refuses a buy the pocket cannot pay, and changes nothing", () => {
    const progress = store();
    const before = progress.getSnapshot().mountain;
    expect(progress.dispatch({ kind: "buyTier", id: "cart" })).toEqual({
      kind: "refused",
      reason: "no-change",
    });
    expect(progress.getSnapshot().mountain).toBe(before);
  });

  it("refuses every move while the session is not playing, and writes nothing", () => {
    const sessionStorage = createMemoryStorage();
    const progress = createProgressStore({
      auth: createMemoryAuth(),
      sessionStorage,
    });
    progress.dispose();
    const saved = guestSave(sessionStorage);
    expect(progress.dispatch({ kind: "markSeen", id: "workshop" })).toEqual({
      kind: "refused",
      reason: "not-playing",
    });
    expect(guestSave(sessionStorage)).toEqual(saved);
  });

  it("records nothing for a move while the session is not playing", () => {
    const progress = store();
    progress.applyMutation((mountain) => ({
      ...mountain,
      stock: { ...mountain.stock, stones: firstWorker },
    }));
    progress.dispose();
    const before = progress.fieldLog().events;
    expect(progress.dispatch({ kind: "buyTier", id: "helper" })).toEqual({
      kind: "refused",
      reason: "not-playing",
    });
    expect(progress.fieldLog().events).toEqual(before);
  });
});
