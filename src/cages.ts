import { factor } from "./economy/factors";
import type { MineLevelId } from "./mine-levels";
import type { TierId } from "./tiers";
import { toolSpeed, type StageWork } from "./workforce";

/**
 * The shaft's cages (slice 1, part 3, rules 5.5 to 5.14, #724): which cages
 * the shaft has, what each carries a trip, which level each serves, and what
 * they lift a second when counted as rates. Pure: it never moves rock, which
 * is `piles`' job.
 */

/** A trip down and up again, before its knob (Starting numbers, call 71). */
const TRIP_BASE: Readonly<Record<MineLevelId, number>> = {
  topsoil: 10,
  granite: 20,
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

export const NO_HOISTS_ASSIGNED: HoistsAssigned = { topsoil: 0, granite: 0 };

/** What a cage serves: one level, or both in turn. */
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
  readonly twoLevels: boolean;
  readonly pay: number;
};

/** A cage's kind and its place among its kind, from its key. */
function cageKind(
  key: CageKey,
):
  | { readonly id: (typeof CAGE_TIERS)[number]; readonly index: number }
  | undefined {
  if (key === "winch") {
    return undefined;
  }
  const [id, index] = key.split(":") as [(typeof CAGE_TIERS)[number], string];
  return { id, index: Number(index) };
}

/**
 * What a cage lifts a second: a hoist or engine its rating; the winch its
 * workers' tools, never more than a hoist (ruling 3).
 */
function cageRating(key: CageKey, input: CageInput): number {
  const kind = cageKind(key);
  if (kind === undefined) {
    return Math.min(
      input.hoisting.tools * toolSpeed(input.speed),
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
 * What each cage serves, in order (ruling 4): the first `assigned.topsoil`
 * the Topsoil, the next `assigned.granite` the Granite, the rest both in
 * turn. The winch always serves both. With one level open, all the Topsoil.
 */
function cageServices(
  keys: readonly CageKey[],
  assigned: HoistsAssigned,
  twoLevels: boolean,
): readonly CageService[] {
  if (!twoLevels) {
    return keys.map(() => "topsoil");
  }
  return keys.map((key, place): CageService => {
    if (key === "winch") {
      return "both";
    }
    if (place < assigned.topsoil) {
      return "topsoil";
    }
    return place < assigned.topsoil + assigned.granite ? "granite" : "both";
  });
}

/**
 * The shaft's cages, in `cageKeys` order (rulings 2 to 4). A cage's load is
 * what it is rated to lift in one trip to the Topsoil and back, times pay.
 */
export function shaftCages(input: CageInput): readonly ShaftCage[] {
  const keys = cageKeys(input.owned);
  const services = cageServices(keys, input.assigned, input.twoLevels);
  const trip = tripSeconds("topsoil");
  return keys.map((key, place) => ({
    key,
    load: cageRating(key, input) * trip * input.pay,
    runs: cageRuns(key, input.hoisting),
    serves: services[place] ?? "both",
  }));
}

/** The largest load of a hoist or engine he owns, 0 with none. The winch is never counted. */
export function largestLoad(cages: readonly ShaftCage[]): number {
  let largest = 0;
  for (const cage of cages) {
    if (cage.key !== "winch") {
      largest = Math.max(largest, cage.load);
    }
  }
  return largest;
}

/**
 * What a pile the cages use holds (ruling 7): three loads of the largest
 * hoist or engine he owns, never less than it holds today.
 */
export function cagePileRoom(base: number, largest: number): number {
  return Math.max(base, Math.ceil(3 * factor("piles.loads") * largest));
}

/** The cages as rates (rule 5.14): each level's own, and the loads of the cages for both. */
export type CageRates = {
  readonly own: Readonly<Record<MineLevelId, number>>;
  readonly loads: number;
};

/**
 * A running cage for one level lifts its load each trip to that level; the
 * running cages for both lift their loads together once a round (ruling 6).
 */
export function cageRates(cages: readonly ShaftCage[]): CageRates {
  const own: Record<MineLevelId, number> = { topsoil: 0, granite: 0 };
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
