import { factor } from "./economy/factors";
import { MINE_LEVEL_IDS, openLevels, type MineLevelId } from "./mine-levels";
import type { Mountain } from "./mountain";
import type { TierId } from "./tiers";
import { movable, toolSpeed, type StageWork } from "./workforce";

/**
 * The shaft's cages (slice 1, part 3, rules 5.5 to 5.14, #724; slice 2, #770):
 * which cages the shaft has, what each carries a trip, which level each serves,
 * and what they lift a second when counted as rates. Pure: it never moves rock,
 * which is `piles`' job.
 */

/** A trip down and up again, before its knob (Starting numbers, call 71, #770). */
const TRIP_BASE: Readonly<Record<MineLevelId, number>> = {
  topsoil: 10,
  granite: 20,
  crystal: 30,
};

/** No trip is shorter than this, whatever its knob. */
const SHORTEST_TRIP = 2;

/** A cage's trip to this level and back, in whole seconds, for every cage (ruling 3). */
export function tripSeconds(level: MineLevelId): number {
  return Math.max(
    SHORTEST_TRIP,
    Math.round(TRIP_BASE[level] * factor(`trip.${level}`)),
  );
}

/** One way of a trip: down is half the trip, floored, and up is the rest. */
export function legSeconds(level: MineLevelId, way: "down" | "up"): number {
  const trip = tripSeconds(level);
  const down = Math.floor(trip / 2);
  return way === "down" ? down : trip - down;
}

/** A cage's stable key: buying another hoist adds one and moves no other. */
export type CageKey = `machine:${number}` | `hoist:${number}` | "winch";

/** The tiers that are cages, in the shaft's order: the engines, then the hoists (call 70). */
const CAGE_TIERS = ["machine", "hoist"] as const satisfies readonly TierId[];

/** Every cage the shaft has: the engines, then the hoists, then the winch. */
export function cageKeys(
  owned: Readonly<Record<TierId, number>>,
): readonly CageKey[] {
  const keys: CageKey[] = [];
  for (const id of CAGE_TIERS) {
    for (let index = 0; index < owned[id]; index += 1) {
      // The template holds a whole number, which the key's type says.
      keys.push(`${id}:${String(index)}` as CageKey);
    }
  }
  keys.push("winch");
  return keys;
}

/** The hoists he owns, the engines among them: what may be assigned (ruling 5). */
export function hoistsOwned(owned: Readonly<Record<TierId, number>>): number {
  return owned.hoist + owned.machine;
}

/** The hoists assigned to each level: together never more than he owns. */
export type HoistsAssigned = Readonly<Record<MineLevelId, number>>;

export const NO_HOISTS_ASSIGNED: HoistsAssigned = {
  topsoil: 0,
  granite: 0,
  crystal: 0,
};

/** What a cage serves: one level, or all open levels in turn ("both" kept for internal stability). */
type CageService = MineLevelId | "both";

/** One cage: its key, what it carries a trip, whether it runs, and what it serves. */
export type ShaftCage = {
  readonly key: CageKey;
  readonly load: number;
  readonly runs: boolean;
  readonly serves: CageService;
};

type CageInput = {
  readonly owned: Readonly<Record<TierId, number>>;
  readonly hoisting: StageWork;
  readonly speed: Readonly<Record<TierId, number>>;
  readonly assigned: HoistsAssigned;
  /** Open levels in depth order (`openLevels(mountain)`). Takes precedence over `twoLevels`. */
  readonly levels?: readonly MineLevelId[];
  /** Legacy 2-level shorthand used by existing unit tests. */
  readonly twoLevels?: boolean;
  readonly pay: number;
};

const TWO_LEVELS: readonly MineLevelId[] = ["topsoil", "granite"];
const ONE_LEVEL: readonly MineLevelId[] = ["topsoil"];

function inputLevels(
  input: Pick<CageInput, "levels" | "twoLevels">,
): readonly MineLevelId[] {
  if (input.levels !== undefined) {
    return input.levels;
  }
  return input.twoLevels === true ? TWO_LEVELS : ONE_LEVEL;
}

/** A cage's kind and its place among its kind, from its key. */
function cageKind(
  key: CageKey,
):
  | { readonly id: (typeof CAGE_TIERS)[number]; readonly index: number }
  | undefined {
  if (key === "winch") {
    return undefined;
  }
  const id = key.startsWith("machine:") ? "machine" : "hoist";
  return { id, index: Number(key.slice(id.length + 1)) };
}

/**
 * What a cage lifts a second: a hoist or engine its rating; the winch its
 * workers' tools, never more than a hoist (ruling 3).
 */
function cageRating(key: CageKey, input: CageInput): number {
  const kind = cageKind(key);
  if (kind === undefined) {
    return Math.min(
      input.hoisting.tools * toolSpeed(input.speed, "lift"),
      input.speed.hoist,
    );
  }
  return input.speed[kind.id];
}

/** Whether hoisting's workers run this cage: the first of each kind they run. */
function cageRuns(key: CageKey, hoisting: StageWork): boolean {
  const kind = cageKind(key);
  if (kind === undefined) {
    return hoisting.tools > 0;
  }
  return kind.index < (hoisting.running[kind.id] ?? 0);
}

/**
 * What the cage at `place` in order serves (ruling 4, #770): the first
 * `assigned[level]` for each open level in depth order, the rest all open
 * levels in turn. With one level open, all serve the Topsoil. The winch
 * always serves all open levels in turn when 2+ levels are open.
 */
function cageService(
  key: CageKey,
  place: number,
  input: Pick<CageInput, "assigned" | "levels" | "twoLevels">,
): CageService {
  const levels = inputLevels(input);
  if (levels.length <= 1) {
    return "topsoil";
  }
  if (key === "winch") {
    return "both";
  }
  let cursor = 0;
  for (const level of levels) {
    cursor += input.assigned[level];
    if (place < cursor) {
      return level;
    }
  }
  return "both";
}

/**
 * The shaft's cages, in `cageKeys` order (rulings 2 to 4). A cage's load is
 * what it is rated to lift in one trip to the Topsoil and back, times pay.
 */
export function shaftCages(input: CageInput): readonly ShaftCage[] {
  const trip = tripSeconds("topsoil");
  return cageKeys(input.owned).map((key, place) => ({
    key,
    load: cageRating(key, input) * trip * input.pay,
    runs: cageRuns(key, input.hoisting),
    serves: cageService(key, place, input),
  }));
}

/**
 * The largest load of any cage he has, the winch's among them (rule 5.10:
 * the winch is a cage), 0 with none. Leaving the winch out would starve a
 * shaft with no hoist: its 300 at the shaft fills during the trip of a
 * winch that carries up to a hoist's load (Task 7's gap).
 */
export function largestLoad(cages: readonly ShaftCage[]): number {
  let largest = 0;
  for (const cage of cages) {
    largest = Math.max(largest, cage.load);
  }
  return largest;
}

/**
 * The shortest round trip among the running cages that serve `level` (#754, #770):
 * a cage that serves it unloads there at least once a round while rock
 * waits. A cage for that level alone goes there every trip; one for all open
 * levels in turn goes there once a round of `open`. Infinity with no cage
 * serving it.
 */
export function shortestRound(
  cages: readonly ShaftCage[],
  level: MineLevelId,
  open: readonly MineLevelId[] = TWO_LEVELS,
): number {
  const inOpen = open.includes(level);
  const round = open.reduce((sum, each) => sum + tripSeconds(each), 0);
  let shortest = Infinity;
  for (const cage of cages) {
    if (cage.runs && cage.serves === level) {
      shortest = Math.min(shortest, tripSeconds(level));
    } else if (cage.runs && cage.serves === "both" && inOpen) {
      shortest = Math.min(shortest, round);
    }
  }
  return shortest;
}

/** The fewest loads a pile the cages use holds: the spec's "three loads". */
const LEAST_LOADS = 3;

/**
 * What a pile the cages use holds (ruling 7, Task 7's ruling): a load of the
 * largest cage for every cage in the shaft, and never fewer than three, so
 * cages that arrive together each find a load; never less than `base`.
 * With more than three cages, three loads leave the cages that come last
 * empty, and play falls behind a night's rates. #675 sets the real room.
 */
export function cagePileRoom(
  base: number,
  cages: readonly ShaftCage[],
): number {
  const loads = Math.max(LEAST_LOADS, cages.length);
  return Math.max(
    base,
    Math.ceil(loads * factor("piles.loads") * largestLoad(cages)),
  );
}

/** The cages as rates (rule 5.14): each level's own, and the loads of the cages for all in turn. */
export type CageRates = {
  readonly own: Readonly<Record<MineLevelId, number>>;
  readonly loads: number;
};

/**
 * A running cage for one level lifts its load each trip to that level; the
 * running cages for all in turn lift their loads together once a round (ruling 6).
 */
export function cageRates(cages: readonly ShaftCage[]): CageRates {
  const own: Record<MineLevelId, number> = {
    topsoil: 0,
    granite: 0,
    crystal: 0,
  };
  let loads = 0;
  for (const cage of cages) {
    if (!cage.runs) {
      continue;
    }
    if (cage.serves === "both") {
      loads += cage.load;
    } else {
      own[cage.serves] += cage.load / tripSeconds(cage.serves);
    }
  }
  return { own, loads };
}

/** Where a cage is on its trip: at the top, on the way down or up (seconds left), or loading at its level. */
type CageLeg =
  | { readonly kind: "top" }
  | { readonly kind: "down"; readonly left: number }
  | { readonly kind: "loading" }
  | { readonly kind: "up"; readonly left: number };

/** One cage's trip (ruling 9): the level it serves this trip, the rock it carries, and its leg. */
export type Cage = {
  readonly level: MineLevelId;
  readonly carried: number;
  readonly leg: CageLeg;
};

/** The cages that are not fresh, by key. A cage with no entry is empty at the top. */
export type CageTrips = Readonly<Partial<Record<CageKey, Cage>>>;

/** The shaft's live state on the mountain: the hoists assigned to each level, and the cages' trips. */
export type Cages = {
  readonly assigned: HoistsAssigned;
  readonly trips: CageTrips;
};

export const NO_CAGES: Cages = { assigned: NO_HOISTS_ASSIGNED, trips: {} };

/**
 * A cage's trip, or a fresh one: empty at the top, spread across `open` so
 * fresh cages for all levels start staggered across the open levels (ruling 9,
 * #770). For two levels (`topsoil`, `granite`) even places start last at the
 * Granite and odd at the Topsoil, matching Slice 1.
 */
export function cageAt(
  trips: CageTrips,
  key: CageKey,
  place: number,
  open: readonly MineLevelId[] = TWO_LEVELS,
): Cage {
  const existing = trips[key];
  if (existing !== undefined) {
    return existing;
  }
  const pool = open.length > 0 ? open : TWO_LEVELS;
  const level = pool[(place + pool.length - 1) % pool.length] ?? "topsoil";
  return {
    level,
    carried: 0,
    leg: { kind: "top" },
  };
}

/** The rock every cage carries, level by level. */
export function carriedBy(
  trips: CageTrips,
): Readonly<Record<MineLevelId, number>> {
  const carried: Record<MineLevelId, number> = {
    topsoil: 0,
    granite: 0,
    crystal: 0,
  };
  for (const cage of Object.values(trips)) {
    if (cage !== undefined) {
      carried[cage.level] += cage.carried;
    }
  }
  return carried;
}

/**
 * The trips a save's carried rock comes back as (ruling 12): each level with
 * rock puts it in the next cage in order, at the top, the Topsoil first.
 * The reader refuses a save with more such levels than cages, so this throws.
 */
export function restoredTrips(
  carried: Readonly<Record<MineLevelId, number>>,
  keys: readonly CageKey[],
): CageTrips {
  const trips: Partial<Record<CageKey, Cage>> = {};
  let next = 0;
  for (const level of MINE_LEVEL_IDS) {
    if (carried[level] <= 0) {
      continue;
    }
    const key = keys[next];
    if (key === undefined) {
      throw new Error(`no cage for the rock carried from ${level}`);
    }
    trips[key] = { level, carried: carried[level], leg: { kind: "top" } };
    next += 1;
  }
  return trips;
}

/** The hoists he owns, the engines among them, that no level has (ruling 5, #770). */
export function unassignedHoists(
  mountain: Pick<Mountain, "owned" | "cages">,
): number {
  let assignedTotal = 0;
  for (const level of MINE_LEVEL_IDS) {
    assignedTotal += mountain.cages.assigned[level];
  }
  // Never below 0, though the save reader already refuses more assigned than owned.
  return Math.max(0, hoistsOwned(mountain.owned) - assignedTotal);
}

/**
 * Up to `count` unassigned hoists onto an open level, free and at once, only
 * while at least two levels are open (ruling 5, #770).
 */
export function assignHoists<
  M extends Pick<Mountain, "owned" | "cages" | "mineLevels">,
>(mountain: M, level: MineLevelId, count = 1): M {
  const open = openLevels(mountain);
  if (open.length < 2 || !open.includes(level)) {
    return mountain;
  }
  return assignedBy(
    mountain,
    level,
    Math.min(movable(count), unassignedHoists(mountain)),
  );
}

/** Up to `count` hoists off a level, at any time: there is no lock (ruling 5). */
export function unassignHoists<M extends Pick<Mountain, "cages">>(
  mountain: M,
  level: MineLevelId,
  count = 1,
): M {
  return assignedBy(
    mountain,
    level,
    -Math.min(movable(count), mountain.cages.assigned[level]),
  );
}

/** The mountain with a level's assigned count moved by `by`, already clipped by the caller; the same mountain for 0. */
function assignedBy<M extends Pick<Mountain, "cages">>(
  mountain: M,
  level: MineLevelId,
  by: number,
): M {
  if (by === 0) {
    return mountain;
  }
  const { cages } = mountain;
  return {
    ...mountain,
    cages: {
      ...cages,
      assigned: { ...cages.assigned, [level]: cages.assigned[level] + by },
    },
  };
}
