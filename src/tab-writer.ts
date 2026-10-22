import {
  WRITER_CHANNEL,
  WRITER_LEASE_KEY,
  WRITER_LEASE_MS,
  WRITER_LOCK_NAME,
  leaseBlocks,
  parseWriterLease,
  parseWriterNote,
  type WriterLease,
  type WriterNote,
} from "./tab-lease";

type TabSeat = "pending" | "writer" | "other";

export type LockGrant = {
  readonly release: () => void;
};

/** Web Locks, or a fake in tests. `tryHold` fails closed when another tab has it. */
export type LockBroker = {
  readonly tryHold: () => Promise<LockGrant | undefined>;
  readonly take: (steal: boolean) => Promise<LockGrant | undefined>;
};

export type NoteBus = {
  readonly post: (note: WriterNote) => void;
  readonly listen: (handler: (note: WriterNote) => void) => () => void;
};

export type TabWriter = {
  readonly seat: () => TabSeat;
  readonly subscribe: (listener: (seat: TabSeat) => void) => () => void;
  /** Asks the writer to save, then this tab becomes the writer. */
  readonly playHere: () => Promise<void>;
  /** The writer flushes the phone backup before it lets go. Sync and quick. */
  readonly onYield: (flush: () => void) => void;
  /** Drops this tab if another tab's lease has replaced ours. */
  readonly confirm: () => void;
  /**
   * Pagehide: flush, then drop the lock and the lease so the next load
   * can play. The page is going away, so this does not start a re-claim.
   */
  readonly release: () => void;
  /** Bfcache restore. Runs the claim path again after `release`. */
  readonly restore: () => void;
  readonly dispose: () => void;
};

export function createMemoryBus(): NoteBus {
  const handlers = new Set<(note: WriterNote) => void>();
  return {
    post(note) {
      for (const handler of [...handlers]) {
        handler(note);
      }
    },
    listen(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}

export function createWebLockBroker(
  locks: LockManager,
  name = WRITER_LOCK_NAME,
): LockBroker {
  const hold = (
    steal: boolean,
    ifAvailable: boolean,
  ): Promise<LockGrant | undefined> =>
    new Promise((resolve) => {
      void locks
        .request(name, { mode: "exclusive", steal, ifAvailable }, (lock) => {
          if (lock === null) {
            resolve(undefined);
            return Promise.resolve();
          }
          let release: () => void = () => undefined;
          const released = new Promise<void>((done) => {
            release = done;
          });
          resolve({ release });
          return released;
        })
        .catch(() => {
          resolve(undefined);
        });
    });
  return {
    tryHold: () => hold(false, true),
    take: (steal) => hold(steal, false),
  };
}

function createBroadcastBus(name = WRITER_CHANNEL): NoteBus | undefined {
  if (typeof BroadcastChannel === "undefined") {
    return undefined;
  }
  const channel = new BroadcastChannel(name);
  return {
    post(note) {
      channel.postMessage(note);
    },
    listen(handler) {
      const onMessage = (event: MessageEvent<unknown>): void => {
        const note = parseWriterNote(event.data);
        if (note === undefined) {
          return;
        }
        handler(note);
      };
      channel.addEventListener("message", onMessage);
      return () => {
        channel.removeEventListener("message", onMessage);
      };
    },
  };
}

/**
 * One writer on this device. Web Locks when the browser has them, otherwise
 * a localStorage lease plus the channel. A crashed tab drops the lock; the
 * lease expires if there was no lock to drop.
 */
export function createTabWriter({
  tabId,
  storage,
  now = Date.now,
  leaseMs = WRITER_LEASE_MS,
  yieldWaitMs = 400,
  handoffMs = 50,
  locks,
  bus,
}: {
  tabId: string;
  storage: Storage;
  now?: () => number;
  leaseMs?: number;
  yieldWaitMs?: number;
  /** After a forced takeover, give the other tab a beat to flush. */
  handoffMs?: number;
  locks?: LockBroker | undefined;
  bus?: NoteBus | undefined;
}): TabWriter {
  let seat: TabSeat = "pending";
  let grant: LockGrant | undefined;
  let flush: (() => void) | undefined;
  let disposed = false;
  const ended = (): boolean => disposed;
  let takeover: Promise<void> | undefined;
  let pulse: ReturnType<typeof setInterval> | undefined;
  let reclaim: ReturnType<typeof setInterval> | undefined;
  let reclaiming = false;
  const listeners = new Set<(next: TabSeat) => void>();
  const pollMs = Math.max(250, Math.floor(leaseMs / 2));

  const readLease = (): WriterLease | undefined => {
    try {
      return parseWriterLease(storage.getItem(WRITER_LEASE_KEY));
    } catch {
      return undefined;
    }
  };

  const writeLease = (): void => {
    try {
      storage.setItem(
        WRITER_LEASE_KEY,
        JSON.stringify({ tabId, until: now() + leaseMs }),
      );
    } catch {
      return;
    }
  };

  const clearLease = (): void => {
    const current = readLease();
    if (current !== undefined && current.tabId !== tabId) {
      return;
    }
    try {
      storage.removeItem(WRITER_LEASE_KEY);
    } catch {
      return;
    }
  };

  const setSeat = (next: TabSeat): void => {
    if (seat === next) {
      return;
    }
    seat = next;
    for (const listener of [...listeners]) {
      listener(seat);
    }
  };

  const stopHeartbeat = (): void => {
    if (pulse === undefined) {
      return;
    }
    clearInterval(pulse);
    pulse = undefined;
  };

  const stopReclaim = (): void => {
    if (reclaim === undefined) {
      return;
    }
    clearInterval(reclaim);
    reclaim = undefined;
  };

  const becomeWriter = (next?: LockGrant): void => {
    if (ended()) {
      next?.release();
      return;
    }
    grant = next;
    writeLease();
    stopReclaim();
    setSeat("writer");
    startHeartbeat();
  };

  const dropWriter = (): void => {
    if (seat !== "writer") {
      return;
    }
    flush?.();
    grant?.release();
    grant = undefined;
    stopHeartbeat();
    setSeat("other");
    startReclaim();
  };

  const confirm = (): void => {
    if (disposed || seat !== "writer") {
      return;
    }
    // A held Web Lock is the seat. A leftover lease must not push us off.
    if (grant !== undefined) {
      writeLease();
      return;
    }
    if (leaseBlocks(readLease(), tabId, now())) {
      dropWriter();
      return;
    }
    writeLease();
  };

  const tryReclaim = (): void => {
    if (ended() || seat === "writer") {
      stopReclaim();
      return;
    }
    if (locks !== undefined) {
      if (reclaiming) {
        return;
      }
      reclaiming = true;
      void locks.tryHold().then((got) => {
        reclaiming = false;
        if (ended() || seat === "writer") {
          got?.release();
          return;
        }
        if (got !== undefined) {
          becomeWriter(got);
        }
      });
      return;
    }
    if (!leaseBlocks(readLease(), tabId, now())) {
      becomeWriter();
    }
  };

  const startReclaim = (): void => {
    if (reclaim !== undefined || ended()) {
      return;
    }
    reclaim = setInterval(() => {
      tryReclaim();
    }, pollMs);
  };

  const startHeartbeat = (): void => {
    if (pulse !== undefined) {
      return;
    }
    pulse = setInterval(
      () => {
        confirm();
      },
      Math.max(250, Math.floor(leaseMs / 2)),
    );
  };

  const finishTake = async (steal: boolean): Promise<void> => {
    if (ended()) {
      return;
    }
    if (locks !== undefined) {
      const next = await locks.take(steal);
      if (ended()) {
        next?.release();
        return;
      }
      if (next === undefined) {
        setSeat("other");
        return;
      }
      grant = next;
    }
    stopReclaim();
    writeLease();
    setSeat("writer");
    startHeartbeat();
  };

  const playHere = (): Promise<void> => {
    if (seat === "writer") {
      return Promise.resolve();
    }
    if (takeover !== undefined) {
      return takeover;
    }
    takeover = take().finally(() => {
      takeover = undefined;
    });
    return takeover;
  };

  const take = async (): Promise<void> => {
    if (bus === undefined) {
      await finishTake(true);
      return;
    }
    const polite = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => {
        stop();
        resolve(false);
      }, yieldWaitMs);
      const stop = bus.listen((note) => {
        if (note.type !== "taken" || note.tabId !== tabId) {
          return;
        }
        clearTimeout(timer);
        stop();
        resolve(true);
      });
      bus.post({ type: "yield", tabId });
    });
    if (ended()) {
      return;
    }
    if (!polite) {
      bus.post({ type: "taken", tabId });
      if (handoffMs > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, handoffMs);
        });
      }
    }
    if (ended()) {
      return;
    }
    await finishTake(!polite);
  };

  let unlisten: (() => void) | undefined;
  if (bus !== undefined) {
    const notes = bus;
    unlisten = notes.listen((note) => {
      if (note.tabId === tabId) {
        return;
      }
      if (note.type === "yield") {
        dropWriter();
        clearLease();
        notes.post({ type: "taken", tabId: note.tabId });
        return;
      }
      dropWriter();
    });
  }

  const claim = (): void => {
    const blocked = leaseBlocks(readLease(), tabId, now());
    if (!blocked) {
      // Free lease: play now. The lock, if any, confirms on the next turn.
      writeLease();
      setSeat("writer");
      startHeartbeat();
    } else if (locks === undefined) {
      setSeat("other");
      startReclaim();
    } else {
      // A stale lease must not decide while a lock might still be free.
      setSeat("other");
      startReclaim();
    }
    if (locks === undefined) {
      return;
    }
    void locks.tryHold().then((got) => {
      if (ended()) {
        got?.release();
        return;
      }
      if (got !== undefined) {
        becomeWriter(got);
        return;
      }
      if (seat === "writer") {
        stopHeartbeat();
        setSeat("other");
        startReclaim();
      }
    });
  };

  claim();

  return {
    seat: () => seat,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    playHere,
    onYield(next) {
      flush = next;
    },
    confirm,
    release() {
      if (disposed) {
        return;
      }
      // Save while this tab is still the writer. A later pagehide listener
      // must not be what the phone backup and the cloud write depend on.
      flush?.();
      stopHeartbeat();
      stopReclaim();
      grant?.release();
      grant = undefined;
      clearLease();
      setSeat("other");
    },
    restore() {
      if (disposed) {
        return;
      }
      claim();
    },
    dispose() {
      disposed = true;
      stopHeartbeat();
      stopReclaim();
      grant?.release();
      grant = undefined;
      clearLease();
      unlisten?.();
      listeners.clear();
    },
  };
}

/**
 * Pagehide drops the seat. A back/forward-cache restore (`pageshow` with
 * `persisted`) claims it again. Update available → Reload is a pagehide too.
 */
export function bindWriterPageHide(writer: TabWriter): () => void {
  const onHide = (): void => {
    writer.release();
  };
  const onShow = (event: PageTransitionEvent): void => {
    if (!event.persisted) {
      return;
    }
    writer.restore();
  };
  window.addEventListener("pagehide", onHide);
  window.addEventListener("pageshow", onShow);
  return () => {
    window.removeEventListener("pagehide", onHide);
    window.removeEventListener("pageshow", onShow);
  };
}

/** The browser's lock, channel, and localStorage. A broken store still plays. */
export function createBrowserTabWriter(tabId = newTabId()): TabWriter {
  const locks = browserLocks();
  return createTabWriter({
    tabId,
    storage: browserStorage(),
    ...(locks === undefined ? {} : { locks }),
    bus: createBroadcastBus(),
  });
}

function browserLocks(): LockBroker | undefined {
  const host = globalThis.navigator as {
    locks?: { request?: unknown } | null;
  };
  const locks = host.locks;
  if (
    locks === undefined ||
    locks === null ||
    typeof locks.request !== "function"
  ) {
    return undefined;
  }
  return createWebLockBroker(locks as LockManager);
}

function newTabId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tab-${Math.random().toString(16).slice(2)}00000000`.slice(0, 24);
}

function browserStorage(): Storage {
  try {
    const probe = "dad-friendly-writer-probe";
    localStorage.setItem(probe, "1");
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return memoryStorage();
  }
}

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
