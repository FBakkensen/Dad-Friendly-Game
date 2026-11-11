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

/** The fixed settings of one tab's writer. */
type WriterConfig = {
  readonly tabId: string;
  readonly storage: Storage;
  readonly now: () => number;
  readonly leaseMs: number;
  readonly yieldWaitMs: number;
  readonly handoffMs: number;
  readonly locks: LockBroker | undefined;
  readonly bus: NoteBus | undefined;
};

/** What one tab's writer knows and holds while it runs. */
type WriterState = {
  readonly config: WriterConfig;
  readonly listeners: Set<(next: TabSeat) => void>;
  seat: TabSeat;
  grant: LockGrant | undefined;
  flush: (() => void) | undefined;
  disposed: boolean;
  takeover: Promise<void> | undefined;
  pulse: ReturnType<typeof setInterval> | undefined;
  reclaim: ReturnType<typeof setInterval> | undefined;
  reclaiming: boolean;
};

/**
 * Whether the writer was disposed. A call, not a field read, so a check after
 * an await is not narrowed away by the check before it.
 */
function ended(state: WriterState): boolean {
  return state.disposed;
}

/** How often the writer renews its lease, and another tab checks for a free seat. */
function pollInterval(config: WriterConfig): number {
  return Math.max(250, Math.floor(config.leaseMs / 2));
}

function readLease(config: WriterConfig): WriterLease | undefined {
  try {
    return parseWriterLease(config.storage.getItem(WRITER_LEASE_KEY));
  } catch {
    return undefined;
  }
}

function writeLease(config: WriterConfig): void {
  try {
    config.storage.setItem(
      WRITER_LEASE_KEY,
      JSON.stringify({
        tabId: config.tabId,
        until: config.now() + config.leaseMs,
      }),
    );
  } catch {
    return;
  }
}

/** Removes the lease, unless another tab's lease has replaced ours. */
function clearLease(config: WriterConfig): void {
  const current = readLease(config);
  if (current !== undefined && current.tabId !== config.tabId) {
    return;
  }
  try {
    config.storage.removeItem(WRITER_LEASE_KEY);
  } catch {
    return;
  }
}

function leaseBlocked(config: WriterConfig): boolean {
  return leaseBlocks(readLease(config), config.tabId, config.now());
}

function setSeat(state: WriterState, next: TabSeat): void {
  if (state.seat === next) {
    return;
  }
  state.seat = next;
  for (const listener of [...state.listeners]) {
    listener(state.seat);
  }
}

function stopHeartbeat(state: WriterState): void {
  if (state.pulse === undefined) {
    return;
  }
  clearInterval(state.pulse);
  state.pulse = undefined;
}

function stopReclaim(state: WriterState): void {
  if (state.reclaim === undefined) {
    return;
  }
  clearInterval(state.reclaim);
  state.reclaim = undefined;
}

function startHeartbeat(state: WriterState): void {
  if (state.pulse !== undefined) {
    return;
  }
  state.pulse = setInterval(() => {
    confirmSeat(state);
  }, pollInterval(state.config));
}

function startReclaim(state: WriterState): void {
  if (state.reclaim !== undefined || ended(state)) {
    return;
  }
  state.reclaim = setInterval(() => {
    tryReclaim(state);
  }, pollInterval(state.config));
}

function becomeWriter(state: WriterState, next?: LockGrant): void {
  if (ended(state)) {
    next?.release();
    return;
  }
  state.grant = next;
  writeLease(state.config);
  stopReclaim(state);
  setSeat(state, "writer");
  startHeartbeat(state);
}

function dropWriter(state: WriterState): void {
  if (state.seat !== "writer") {
    return;
  }
  state.flush?.();
  state.grant?.release();
  state.grant = undefined;
  stopHeartbeat(state);
  setSeat(state, "other");
  startReclaim(state);
}

function confirmSeat(state: WriterState): void {
  if (ended(state) || state.seat !== "writer") {
    return;
  }
  // A held Web Lock is the seat. A leftover lease must not push us off.
  if (state.grant !== undefined) {
    writeLease(state.config);
    return;
  }
  if (leaseBlocked(state.config)) {
    dropWriter(state);
    return;
  }
  writeLease(state.config);
}

function tryReclaim(state: WriterState): void {
  if (ended(state) || state.seat === "writer") {
    stopReclaim(state);
    return;
  }
  const { locks } = state.config;
  if (locks === undefined) {
    if (!leaseBlocked(state.config)) {
      becomeWriter(state);
    }
    return;
  }
  if (state.reclaiming) {
    return;
  }
  state.reclaiming = true;
  void locks.tryHold().then((got) => {
    state.reclaiming = false;
    if (ended(state) || state.seat === "writer") {
      got?.release();
      return;
    }
    if (got !== undefined) {
      becomeWriter(state, got);
    }
  });
}

async function finishTake(state: WriterState, steal: boolean): Promise<void> {
  if (ended(state)) {
    return;
  }
  const { locks } = state.config;
  if (locks !== undefined) {
    const next = await locks.take(steal);
    if (ended(state)) {
      next?.release();
      return;
    }
    if (next === undefined) {
      setSeat(state, "other");
      return;
    }
    state.grant = next;
  }
  stopReclaim(state);
  writeLease(state.config);
  setSeat(state, "writer");
  startHeartbeat(state);
}

function playHere(state: WriterState): Promise<void> {
  if (state.seat === "writer") {
    return Promise.resolve();
  }
  if (state.takeover !== undefined) {
    return state.takeover;
  }
  const takeover = take(state).finally(() => {
    state.takeover = undefined;
  });
  state.takeover = takeover;
  return takeover;
}

/** Asks the writer to yield. True when it answered before the wait ran out. */
function askToYield(
  bus: NoteBus,
  tabId: string,
  yieldWaitMs: number,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
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
}

async function take(state: WriterState): Promise<void> {
  const { bus, tabId, yieldWaitMs, handoffMs } = state.config;
  if (bus === undefined) {
    await finishTake(state, true);
    return;
  }
  const polite = await askToYield(bus, tabId, yieldWaitMs);
  if (ended(state)) {
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
  if (ended(state)) {
    return;
  }
  await finishTake(state, !polite);
}

/** Another tab's yield or taken note drops this tab's seat. */
function listenForNotes(state: WriterState): (() => void) | undefined {
  const { bus, tabId } = state.config;
  if (bus === undefined) {
    return undefined;
  }
  return bus.listen((note) => {
    if (note.tabId === tabId) {
      return;
    }
    if (note.type === "yield") {
      dropWriter(state);
      clearLease(state.config);
      bus.post({ type: "taken", tabId: note.tabId });
      return;
    }
    dropWriter(state);
  });
}

function claim(state: WriterState): void {
  const { locks } = state.config;
  if (!leaseBlocked(state.config)) {
    // Free lease: play now. The lock, if any, confirms on the next turn.
    writeLease(state.config);
    setSeat(state, "writer");
    startHeartbeat(state);
  } else {
    // With a lock, a stale lease must not decide while the lock might still be free.
    setSeat(state, "other");
    startReclaim(state);
  }
  if (locks === undefined) {
    return;
  }
  void locks.tryHold().then((got) => {
    if (ended(state)) {
      got?.release();
      return;
    }
    if (got !== undefined) {
      becomeWriter(state, got);
      return;
    }
    if (state.seat === "writer") {
      stopHeartbeat(state);
      setSeat(state, "other");
      startReclaim(state);
    }
  });
}

/** Lets go of the lock, the heartbeat, the reclaim poll, and our lease. */
function letGo(state: WriterState): void {
  stopHeartbeat(state);
  stopReclaim(state);
  state.grant?.release();
  state.grant = undefined;
  clearLease(state.config);
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
  const state: WriterState = {
    config: {
      tabId,
      storage,
      now,
      leaseMs,
      yieldWaitMs,
      handoffMs,
      locks,
      bus,
    },
    listeners: new Set(),
    seat: "pending",
    grant: undefined,
    flush: undefined,
    disposed: false,
    takeover: undefined,
    pulse: undefined,
    reclaim: undefined,
    reclaiming: false,
  };
  const unlisten = listenForNotes(state);
  claim(state);

  return {
    seat: () => state.seat,
    subscribe(listener) {
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
      };
    },
    playHere: () => playHere(state),
    onYield(next) {
      state.flush = next;
    },
    confirm: () => {
      confirmSeat(state);
    },
    release() {
      if (state.disposed) {
        return;
      }
      // Save while this tab is still the writer. A later pagehide listener
      // must not be what the phone backup and the cloud write depend on.
      state.flush?.();
      letGo(state);
      setSeat(state, "other");
    },
    restore() {
      if (state.disposed) {
        return;
      }
      claim(state);
    },
    dispose() {
      state.disposed = true;
      letGo(state);
      unlisten?.();
      state.listeners.clear();
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
