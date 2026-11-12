import { describe, expect, it, vi } from "vitest";
import type { AuthController, AuthState, AuthUser } from "./auth";
import {
  createMemoryCloudSave,
  type CloudLoadResult,
  type CloudSave,
  type CloudWriteResult,
} from "./cloud-save";
import { createMountain, type Mountain } from "./mountain";
import { createProgressStore } from "./progress-store";
import type { TabWriter } from "./tab-writer";

type TabSeat = ReturnType<TabWriter["seat"]>;

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

const dad: AuthUser = { uid: "test-dad", label: "Test Dad" };
const mom: AuthUser = { uid: "test-mom", label: "Test Mom" };

/** An account the test can report again, as Firebase's sign-in may. */
function reportingAuth(user: AuthUser): {
  auth: AuthController;
  report: (next: AuthUser) => void;
} {
  let state: AuthState = { kind: "signed-in", user };
  const listeners = new Set<(next: AuthState) => void>();
  return {
    auth: {
      getState: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        listener(state);
        return () => {
          listeners.delete(listener);
        };
      },
      signIn: () => Promise.resolve(),
      signOut: () => Promise.resolve(),
    },
    report: (next) => {
      state = { kind: "signed-in", user: next };
      for (const listener of [...listeners]) {
        listener(state);
      }
    },
  };
}

const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 5);
  });

/** A cloud whose fresh reads (the read on resume) wait until released. */
function slowReadCloud(docs: Map<string, Mountain>): {
  cloud: CloudSave;
  releaseReads: () => void;
} {
  const base = createMemoryCloudSave({ docs });
  const waiting: (() => void)[] = [];
  return {
    cloud: {
      ...base,
      load: (args) =>
        args.fresh === true
          ? new Promise<CloudLoadResult>((resolve) => {
              waiting.push(() => {
                void base.load(args).then(resolve);
              });
            })
          : base.load(args),
    },
    releaseReads: () => {
      for (const release of waiting.splice(0)) {
        release();
      }
    },
  };
}

/** A cloud whose writes wait until released. */
function slowWriteCloud(): {
  cloud: CloudSave;
  base: CloudSave;
  releaseWrites: () => void;
} {
  const base = createMemoryCloudSave();
  const waiting: (() => void)[] = [];
  return {
    base,
    cloud: {
      ...base,
      write: (args) =>
        new Promise<CloudWriteResult>((resolve) => {
          waiting.push(() => {
            void base.write(args).then(resolve);
          });
        }),
    },
    releaseWrites: () => {
      for (const release of waiting.splice(0)) {
        release();
      }
    },
  };
}

/** A writer seat the test can hand to another tab. */
function movableSeat(): {
  tabWriter: TabWriter;
  move: (next: TabSeat) => void;
} {
  let seat: TabSeat = "writer";
  const listeners = new Set<(next: TabSeat) => void>();
  return {
    tabWriter: {
      seat: () => seat,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      playHere: () => Promise.resolve(),
      onYield: () => undefined,
      confirm: () => undefined,
      release: () => undefined,
      restore: () => undefined,
      dispose: () => undefined,
    },
    move: (next) => {
      seat = next;
      for (const listener of [...listeners]) {
        listener(next);
      }
    },
  };
}

const resumeLines = (progress: {
  fieldLog: () => { events: readonly { code: string }[] };
}) =>
  progress.fieldLog().events.filter((event) => event.code === "save.resume")
    .length;

const pocketIn = async (cloud: CloudSave, uid: string): Promise<number> => {
  const saved = await cloud.load({ uid });
  return saved.kind === "found" ? saved.mountain.pocket : -1;
};

describe("the account reported again (#481)", () => {
  it("keeps playing when the same account reports in during the read on resume", async () => {
    const docs = new Map<string, Mountain>([
      [dad.uid, { ...createMountain(), remaining: 0, helpers: 5 }],
    ]);
    const { cloud, releaseReads } = slowReadCloud(docs);
    const { auth, report } = reportingAuth(dad);
    const progress = createProgressStore({
      auth,
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => 50_000,
      resumeReadTimeoutMs: 60_000,
    });
    await settle();
    expect(progress.getSnapshot().ready).toBe(true);
    void progress.resume();
    report(dad);
    await settle();
    releaseReads();
    await settle();
    progress.tick();
    expect(progress.getSnapshot().ready).toBe(true);
    expect(progress.passTheMine()).toBe(true);
    expect(progress.getSnapshot().mountain.legacy).toBe(1);
    progress.dispose();
  });

  it("loads the new account when another one signs in during the read on resume", async () => {
    const docs = new Map<string, Mountain>([
      [dad.uid, { ...createMountain(), pocket: 10 }],
      // A later run, so mom's copy is ahead of the dad's game still in play.
      [mom.uid, { ...createMountain(), startedAt: 40_000, pocket: 77 }],
    ]);
    const { cloud, releaseReads } = slowReadCloud(docs);
    const { auth, report } = reportingAuth(dad);
    const progress = createProgressStore({
      auth,
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      now: () => 50_000,
      resumeReadTimeoutMs: 60_000,
    });
    await settle();
    void progress.resume();
    report(mom);
    await settle();
    releaseReads();
    await settle();
    expect(progress.getSnapshot().ready).toBe(true);
    expect(progress.getSnapshot().mountain.pocket).toBe(77);
    expect(await pocketIn(cloud, dad.uid)).toBe(10);
    progress.dispose();
  });

  it("keeps saving to the cloud when the same account reports in during a write", async () => {
    const { cloud, base, releaseWrites } = slowWriteCloud();
    const { auth, report } = reportingAuth(dad);
    const progress = createProgressStore({
      auth,
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      cloudWriteGapMs: 0,
      now: () => 50_000,
    });
    await settle();
    releaseWrites();
    await settle();
    progress.applyMutation((mountain) => ({ ...mountain, pocket: 50 }));
    await settle();
    report(dad);
    await settle();
    releaseWrites();
    await settle();
    progress.applyMutation((mountain) => ({ ...mountain, pocket: 99 }));
    await settle();
    releaseWrites();
    await settle();
    expect(await pocketIn(base, dad.uid)).toBe(99);
    progress.dispose();
  });

  it("keeps saving to the cloud when another account signs in during a write", async () => {
    const { cloud, base, releaseWrites } = slowWriteCloud();
    const { auth, report } = reportingAuth(dad);
    const progress = createProgressStore({
      auth,
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      cloudWriteGapMs: 0,
      now: () => 50_000,
    });
    await settle();
    progress.applyMutation((mountain) => ({ ...mountain, pocket: 50 }));
    await settle();
    report(mom);
    await settle();
    releaseWrites();
    await settle();
    progress.applyMutation((mountain) => ({ ...mountain, pocket: 33 }));
    await settle();
    releaseWrites();
    await settle();
    expect(await pocketIn(base, mom.uid)).toBe(33);
    progress.dispose();
  });

  it("drops a read on resume that answers after another tab took the seat", async () => {
    const docs = new Map<string, Mountain>([
      [dad.uid, { ...createMountain(), pocket: 10 }],
    ]);
    const { cloud, releaseReads } = slowReadCloud(docs);
    const { tabWriter, move } = movableSeat();
    const progress = createProgressStore({
      auth: reportingAuth(dad).auth,
      cloudSave: cloud,
      sessionStorage: createMemoryStorage(),
      tabWriter,
      now: () => 50_000,
      resumeReadTimeoutMs: 60_000,
    });
    await settle();
    void progress.resume();
    move("other");
    releaseReads();
    await settle();
    expect(resumeLines(progress)).toBe(0);
    progress.dispose();
  });

  it("a retry after a read that gave up waits while another tab has the seat", async () => {
    vi.useFakeTimers();
    try {
      const fresh = vi.fn();
      const base = createMemoryCloudSave();
      const cloud: CloudSave = {
        ...base,
        load: (args) => {
          if (args.fresh === true) {
            fresh();
            return Promise.reject(new Error("offline"));
          }
          return base.load(args);
        },
      };
      const { tabWriter, move } = movableSeat();
      const progress = createProgressStore({
        auth: reportingAuth(dad).auth,
        cloudSave: cloud,
        sessionStorage: createMemoryStorage(),
        tabWriter,
        now: () => 50_000,
      });
      await vi.advanceTimersByTimeAsync(10);
      void progress.resume();
      await vi.advanceTimersByTimeAsync(10);
      expect(fresh).toHaveBeenCalledTimes(1);
      move("other");
      await vi.advanceTimersByTimeAsync(5_000);
      expect(fresh).toHaveBeenCalledTimes(1);
      progress.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a late read from the account that left keeps the new account's give-up timer", async () => {
    vi.useFakeTimers();
    try {
      const base = createMemoryCloudSave({
        docs: new Map<string, Mountain>([
          [dad.uid, { ...createMountain(), pocket: 10 }],
          [mom.uid, { ...createMountain(), startedAt: 40_000, pocket: 77 }],
        ]),
      });
      let answerDad: (() => void) | undefined;
      const momReads = vi.fn();
      const cloud: CloudSave = {
        ...base,
        load: (args) => {
          if (args.fresh !== true) {
            return base.load(args);
          }
          if (args.uid === dad.uid) {
            return new Promise<CloudLoadResult>((resolve) => {
              answerDad = () => {
                void base.load(args).then(resolve);
              };
            });
          }
          // Mom's read on resume never answers: only its give-up ends it.
          momReads();
          return new Promise<CloudLoadResult>(() => undefined);
        },
      };
      const { auth, report } = reportingAuth(dad);
      const progress = createProgressStore({
        auth,
        cloudSave: cloud,
        sessionStorage: createMemoryStorage(),
        now: () => 50_000,
        resumeReadTimeoutMs: 1_000,
      });
      await vi.advanceTimersByTimeAsync(10);
      void progress.resume();
      report(mom);
      await vi.advanceTimersByTimeAsync(10);
      expect(progress.getSnapshot().ready).toBe(true);
      void progress.resume();
      await vi.advanceTimersByTimeAsync(10);
      expect(momReads).toHaveBeenCalledTimes(1);
      answerDad?.();
      // Mom's read gives up after a second, and the retry asks again.
      await vi.advanceTimersByTimeAsync(5_000);
      expect(momReads.mock.calls.length).toBeGreaterThan(1);
      progress.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
