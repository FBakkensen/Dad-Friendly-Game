import { describe, expect, it } from "vitest";
import type { AuthController, AuthState, AuthUser } from "./auth";
import {
  createMemoryCloudSave,
  type CloudLoadResult,
  type CloudSave,
  type CloudWriteResult,
} from "./cloud-save";
import { createMountain, type Mountain } from "./mountain";
import { createProgressStore } from "./progress-store";

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
});
