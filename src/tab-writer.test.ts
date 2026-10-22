import { afterEach, describe, expect, it, vi } from "vitest";
import { WRITER_LEASE_KEY } from "./tab-lease";
import {
  bindWriterPageHide,
  createBrowserTabWriter,
  createMemoryBus,
  createTabWriter,
  createWebLockBroker,
  type LockGrant,
} from "./tab-writer";

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const writers: { dispose: () => void }[] = [];

afterEach(() => {
  for (const writer of writers) {
    writer.dispose();
  }
  writers.length = 0;
  vi.useRealTimers();
});

function pair(storage = memoryStorage()) {
  const bus = createMemoryBus();
  let now = 1_000;
  const writer = createTabWriter({
    tabId: "tab-writer",
    storage,
    bus,
    now: () => now,
    leaseMs: 8_000,
    yieldWaitMs: 30,
    handoffMs: 0,
  });
  const other = createTabWriter({
    tabId: "tab-other1",
    storage,
    bus,
    now: () => now,
    leaseMs: 8_000,
    yieldWaitMs: 30,
    handoffMs: 0,
  });
  writers.push(writer, other);
  return {
    storage,
    bus,
    writer,
    other,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe("one writer tab", () => {
  it("lets the first tab write and the second wait", () => {
    const { writer, other } = pair();
    expect(writer.seat()).toBe("writer");
    expect(other.seat()).toBe("other");
  });

  it("hands the mountain over after the writer flushes", async () => {
    const { writer, other } = pair();
    const flushed: string[] = [];
    writer.onYield(() => {
      flushed.push("writer");
    });
    const seen: string[] = [];
    other.subscribe((seat) => {
      seen.push(seat);
    });
    await other.playHere();
    expect(flushed).toEqual(["writer"]);
    expect(writer.seat()).toBe("other");
    expect(other.seat()).toBe("writer");
    expect(seen).toContain("writer");
    await other.playHere();
    expect(other.seat()).toBe("writer");
  });

  it("takes over when the other tab never answers", async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    const now = 5_000;
    const flushed: string[] = [];
    const writer = createTabWriter({
      tabId: "tab-writer",
      storage,
      now: () => now,
      leaseMs: 8_000,
    });
    writers.push(writer);
    writer.onYield(() => {
      flushed.push("lost");
    });
    const other = createTabWriter({
      tabId: "tab-other1",
      storage,
      bus: createMemoryBus(),
      now: () => now,
      leaseMs: 8_000,
      yieldWaitMs: 20,
      handoffMs: 0,
    });
    writers.push(other);
    expect(other.seat()).toBe("other");
    const taking = other.playHere();
    await vi.advanceTimersByTimeAsync(25);
    await taking;
    expect(other.seat()).toBe("writer");
    expect(flushed).toEqual([]);
    writer.confirm();
    expect(writer.seat()).toBe("other");
    expect(flushed).toEqual(["lost"]);
  });

  it("uses the browser lock when two tabs share one", async () => {
    const storage = memoryStorage();
    const bus = createMemoryBus();
    const locks = fakeLocks();
    const writer = createTabWriter({
      tabId: "tab-writer",
      storage,
      bus,
      locks: createWebLockBroker(locks),
      handoffMs: 0,
      yieldWaitMs: 30,
    });
    const other = createTabWriter({
      tabId: "tab-other1",
      storage,
      bus,
      locks: createWebLockBroker(locks),
      handoffMs: 0,
      yieldWaitMs: 30,
    });
    writers.push(writer, other);
    await vi.waitFor(() => {
      expect(writer.seat()).toBe("writer");
    });
    expect(other.seat()).toBe("other");
    const flushed: string[] = [];
    writer.onYield(() => {
      flushed.push("lock");
    });
    await other.playHere();
    expect(flushed).toEqual(["lock"]);
    expect(writer.seat()).toBe("other");
    expect(other.seat()).toBe("writer");
  });

  it("steps aside when another tab's lease replaces it", () => {
    const { storage, writer } = pair();
    const flushed: string[] = [];
    writer.onYield(() => {
      flushed.push("lost");
    });
    storage.setItem(
      WRITER_LEASE_KEY,
      JSON.stringify({ tabId: "tab-thief1", until: 99_000 }),
    );
    writer.confirm();
    expect(flushed).toEqual(["lost"]);
    expect(writer.seat()).toBe("other");
    writer.confirm();
    expect(flushed).toEqual(["lost"]);
  });

  it("claims again once a dead lease expires", () => {
    const storage = memoryStorage();
    let now = 10;
    storage.setItem(
      WRITER_LEASE_KEY,
      JSON.stringify({ tabId: "tab-gone01", until: 50 }),
    );
    const blocked = createTabWriter({
      tabId: "tab-next01",
      storage,
      now: () => now,
      leaseMs: 100,
    });
    writers.push(blocked);
    expect(blocked.seat()).toBe("other");
    blocked.dispose();
    now = 51;
    const next = createTabWriter({
      tabId: "tab-next01",
      storage,
      now: () => now,
      leaseMs: 100,
    });
    writers.push(next);
    expect(next.seat()).toBe("writer");
    expect(storage.getItem(WRITER_LEASE_KEY)).toContain("tab-next01");
  });

  it("becomes the writer after a dead lease expires, without Play here", async () => {
    vi.useFakeTimers();
    const storage = memoryStorage();
    let now = 1_000;
    const leaseMs = 4_000;
    const old = createTabWriter({
      tabId: "tab-oldwriter",
      storage,
      now: () => now,
      leaseMs,
    });
    writers.push(old);
    expect(old.seat()).toBe("writer");
    // The page is gone and never called dispose, so its heartbeat stops
    // and the lease it wrote stays behind.
    vi.clearAllTimers();
    now = 3_000;
    const played: string[] = [];
    const next = createTabWriter({
      tabId: "tab-nexttab1",
      storage,
      now: () => now,
      leaseMs,
    });
    writers.push(next);
    const unsub = next.subscribe((seat) => {
      played.push(seat);
    });
    expect(next.seat()).toBe("other");
    now = 1_000 + leaseMs + 1;
    await vi.advanceTimersByTimeAsync(leaseMs / 2);
    expect(next.seat()).toBe("writer");
    expect(played).toEqual(["writer"]);
    unsub();
  });

  it("does not let a stale lease block a tab that holds the lock", async () => {
    const storage = memoryStorage();
    storage.setItem(
      WRITER_LEASE_KEY,
      JSON.stringify({ tabId: "tab-stale01", until: Date.now() + 60_000 }),
    );
    const tab = createTabWriter({
      tabId: "tab-locktab",
      storage,
      locks: createWebLockBroker(fakeLocks()),
      leaseMs: 8_000,
    });
    writers.push(tab);
    await vi.waitFor(() => {
      expect(tab.seat()).toBe("writer");
    });
  });

  it("clears the lease on pagehide so the reloaded page is the writer", () => {
    const storage = memoryStorage();
    const writer = createTabWriter({
      tabId: "tab-writer",
      storage,
      leaseMs: 60_000,
    });
    writers.push(writer);
    const unbind = bindWriterPageHide(writer);
    const reload = vi
      .spyOn(globalThis.location, "reload")
      .mockImplementation(() => {
        window.dispatchEvent(new Event("pagehide"));
      });
    globalThis.location.reload();
    expect(reload).toHaveBeenCalled();
    expect(writer.seat()).toBe("other");
    const next = createTabWriter({
      tabId: "tab-reloaded",
      storage,
      leaseMs: 60_000,
    });
    writers.push(next);
    expect(next.seat()).toBe("writer");
    reload.mockRestore();
    unbind();
  });
});

describe("web lock broker", () => {
  it("holds one exclusive lock and steals it", async () => {
    const broker = createWebLockBroker(fakeLocks());
    const first = await broker.tryHold();
    expect(first).toBeDefined();
    expect(await broker.tryHold()).toBeUndefined();
    const stolen = await broker.take(true);
    expect(stolen).toBeDefined();
    first?.release();
    stolen?.release();
  });

  it("waits for a release when it does not steal", async () => {
    const broker = createWebLockBroker(fakeLocks());
    const first = await broker.tryHold();
    let second: LockGrant | undefined;
    const pending = broker.take(false).then((grant) => {
      second = grant;
    });
    expect(second).toBeUndefined();
    first?.release();
    await pending;
    expect(second).toBeDefined();
    second?.release();
  });

  it("fails closed when the browser rejects the request", async () => {
    const locks = {
      request: () => Promise.reject(new Error("no locks")),
    } as unknown as LockManager;
    const broker = createWebLockBroker(locks);
    expect(await broker.tryHold()).toBeUndefined();
    expect(await broker.take(true)).toBeUndefined();
  });

  it("plays in this browser", async () => {
    const writer = createBrowserTabWriter("tab-browser1");
    writers.push(writer);
    await vi.waitFor(() => {
      expect(writer.seat()).toBe("writer");
    });
  });

  it("still plays when the lease store throws", () => {
    const storage = memoryStorage();
    storage.getItem = () => {
      throw new Error("blocked");
    };
    storage.setItem = () => {
      throw new Error("blocked");
    };
    const writer = createTabWriter({ tabId: "tab-throw1", storage });
    writers.push(writer);
    expect(writer.seat()).toBe("writer");
    writer.confirm();
    expect(writer.seat()).toBe("writer");
  });
});

function fakeLocks(): LockManager {
  let holder: { release: () => void } | undefined;
  const waiters: Array<(lock: Lock | null) => unknown> = [];

  const grant = (callback: (lock: Lock | null) => unknown): void => {
    let release: () => void = () => undefined;
    void new Promise<void>((done) => {
      release = () => {
        if (holder?.release !== release) {
          return;
        }
        holder = undefined;
        done();
        const next = waiters.shift();
        if (next !== undefined) {
          grant(next);
        }
      };
    });
    holder = { release };
    void Promise.resolve(
      callback({
        name: "dad-friendly-writer",
        mode: "exclusive",
      }),
    ).then(() => {
      release();
    });
  };

  const manager = {
    request(
      _name: string,
      options: LockOptions | ((lock: Lock | null) => unknown),
      callback?: (lock: Lock | null) => unknown,
    ) {
      const opts = typeof options === "function" ? {} : options;
      const granted = typeof options === "function" ? options : callback;
      if (granted === undefined) {
        return Promise.resolve();
      }
      if (opts.steal === true) {
        holder?.release();
      }
      if (holder !== undefined && opts.ifAvailable === true) {
        return Promise.resolve(granted(null));
      }
      if (holder !== undefined) {
        waiters.push(granted);
        return Promise.resolve();
      }
      grant(granted);
      return Promise.resolve();
    },
    query: () => Promise.resolve({ held: [], pending: [] }),
  };
  return manager as LockManager;
}
