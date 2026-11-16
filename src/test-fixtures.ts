import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import { readSave, serializeSave, type ParsedSave } from "./persist";
import { readSessionSave } from "./session-save";
import { readGame } from "./save-format";
import { tierRecord, type TierId } from "./tiers";

/** A mountain after `count` hand taps. */
export function minedMountain(count: number): Mountain {
  return {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - count,
    stock: { ...createMountain().stock, stones: count },
  };
}

/** The mountain after a save through JSON and back, or undefined when it does not read `ok`. */
export function reloaded(
  mountain: Mountain,
  lastSeen = 1,
): Mountain | undefined {
  const read = readSave(
    JSON.parse(JSON.stringify(serializeSave({ mountain, lastSeen }))),
  );
  return read.kind === "ok" ? read.save.mountain : undefined;
}

/** A game map read on its own, or undefined when it does not read `ok`. */
export function gameOf(game: unknown): Mountain | undefined {
  const read = readGame(game, 0);
  return read.kind === "ok" ? read.mountain : undefined;
}

/** The stored text of a save holding this mountain, laid over a fresh one. */
export function saveText(
  mountain: Partial<Mountain>,
  lastSeen: number,
): string {
  return JSON.stringify(
    serializeSave({ mountain: { ...createMountain(), ...mountain }, lastSeen }),
  );
}

/** The guest save on this storage when it reads `ok`, else undefined. */
export function guestSave(storage: Storage): ParsedSave | undefined {
  const read = readSessionSave({ storage });
  return read.kind === "ok" ? read.save : undefined;
}

/** Nothing owned: the base for a test's `owned` record (#559). */
export const NONE_OWNED: Readonly<Record<TierId, number>> = tierRecord(0);

/** A change to a mountain, where `owned` and `stock` name only the entries they change. */
export type MountainPatch = Partial<Omit<Mountain, "owned" | "stock">> & {
  readonly owned?: Partial<Mountain["owned"]>;
  readonly stock?: Partial<Mountain["stock"]>;
};

/** `base` with `patch` on top; the counts and goods `patch` leaves out stay as they were. */
export function patched(base: Mountain, patch: MountainPatch): Mountain {
  return {
    ...base,
    ...patch,
    owned: { ...base.owned, ...patch.owned },
    stock: { ...base.stock, ...patch.stock },
  };
}

/** The crew a fresh mine started with before #703: six on each stage, one driver, two builders. */
export const CREWED_JOBS = {
  drilling: 6,
  haulage: 6,
  hoisting: 6,
  driving: 1,
  building: 2,
  kilns: 0,
  graniteDrilling: 0,
  graniteHaulage: 0,
} as const;

/**
 * A fresh mine's start with that crew of 21 placed: the tests of the views
 * and the moves that need a working line start from it, since the game
 * starts with one worker (#703). Call it with the fresh mine on.
 */
export function crewedStart(): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: { ...start.owned, helper: 21 },
    jobs: CREWED_JOBS,
  };
}

/** A `Storage` in memory, for the phone backup and the session in tests. */
export function createMemoryStorage(): Storage {
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
