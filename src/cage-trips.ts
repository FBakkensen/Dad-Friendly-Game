import {
  cageAt,
  legSeconds,
  type Cage,
  type CageKey,
  type CageTrips,
  type ShaftCage,
} from "./cages";
import type { MineLevelId } from "./mine-levels";
import { pour, type Pile } from "./piles";

/**
 * The shaft's cages played trip by trip (slice 1, part 3, rules 5.5 to 5.11,
 * #724). At an instant each cage arrives, unloads, loads and leaves (ruling
 * 10). Pure: it decides where a cage goes and how much it may take, and the
 * rock moves only through `piles`' `pour`. Between instants `mine-cages`
 * moves the rock with `piles`' chains.
 */

/** What a cage finds at one open level: its piles, and whether rock is coming and the level is in the turn. */
export type LevelScene = {
  readonly shaft: Pile;
  readonly maker: Pile;
  /** Pithead rock buffer (Slice 2, #766): cages unload strictly here when `pitheadOnly` is true. */
  readonly pithead?: Pile;
  readonly coming: boolean;
  readonly inTurn: boolean;
};

/**
 * The piles the cages pour into and take from, with only the open levels.
 * The stone stockpile only ever fills here in Slice 1; in Slice 2
 * (`pitheadOnly: true`) cages unload strictly into `pithead` with zero Stone bypass.
 */
export type ShaftScene = {
  readonly levels: Readonly<Partial<Record<MineLevelId, LevelScene>>>;
  readonly stone: Pile;
  readonly pitheadOnly?: boolean;
};

/** One instant's outcome: the cages, the piles, what was poured at the top, and whether anything changed. */
export type Instant = {
  readonly trips: CageTrips;
  readonly scene: ShaftScene;
  readonly toMaker: Readonly<Partial<Record<MineLevelId, number>>>;
  readonly toPithead: Readonly<Partial<Record<MineLevelId, number>>>;
  readonly toStone: number;
  readonly changed: boolean;
};

type Leg = Cage["leg"];

const TOP: Leg = { kind: "top" };
const LOADING: Leg = { kind: "loading" };

/**
 * The most steps one cage takes within an instant. A cage rests after at
 * most four (turned back, landed, unloaded, down), since no leg down is 0 s.
 */
const SETTLE_STEPS = 8;

/** The piles as an instant changes them, and what it pours at the top. */
type Work = {
  readonly levels: Partial<Record<MineLevelId, LevelScene>>;
  stone: Pile;
  readonly pitheadOnly: boolean;
  readonly toMaker: Partial<Record<MineLevelId, number>>;
  readonly toPithead: Partial<Record<MineLevelId, number>>;
  toStone: number;
  /** Whether any rock moved, at the top or at a shaft. */
  moved: boolean;
};

function startWork(scene: ShaftScene): Work {
  return {
    levels: { ...scene.levels },
    stone: scene.stone,
    pitheadOnly: scene.pitheadOnly === true,
    toMaker: {},
    toPithead: {},
    toStone: 0,
    moved: false,
  };
}

function otherLevel(level: MineLevelId): MineLevelId {
  return level === "topsoil" ? "granite" : "topsoil";
}

/** Whether a cage carrying this much has room for one more good, as `pour` counts room. */
function hasRoom(cage: ShaftCage, carried: number): boolean {
  return (pour(1, [{ held: carried, holds: cage.load }]).into[0] ?? 0) > 0;
}

/**
 * A leg whose time is up arrives; a cage that does not run turns back on its
 * way down, by the way it came (rule 5.11). Otherwise it travels on.
 */
function arrived(cage: ShaftCage, trip: Cage): Cage {
  const { leg } = trip;
  if (leg.kind === "up") {
    return leg.left <= 0 ? { ...trip, leg: TOP } : trip;
  }
  if (leg.kind !== "down") {
    return trip;
  }
  if (leg.left <= 0) {
    return { ...trip, leg: LOADING };
  }
  if (cage.runs) {
    return trip;
  }
  const travelled = Math.max(0, legSeconds(trip.level, "down") - leg.left);
  return { ...trip, leg: { kind: "up", left: travelled } };
}

/** Slice 2 unload (rule 1.4): pours strictly into the level's pithead buffer, zero Stone bypass. */
function unloadToPithead(trip: Cage, work: Work): Cage {
  const here = work.levels[trip.level];
  if (here?.pithead === undefined) {
    return trip;
  }
  const { into, left } = pour(trip.carried, [here.pithead]);
  const poured = into[0] ?? 0;
  if (poured <= 0) {
    return trip;
  }
  work.levels[trip.level] = {
    ...here,
    pithead: { ...here.pithead, held: here.pithead.held + poured },
  };
  work.toPithead[trip.level] = (work.toPithead[trip.level] ?? 0) + poured;
  work.moved = true;
  return { ...trip, carried: left };
}

/** The cage's rock poured at the top: into pithead in Slice 2, else maker pile then stone (rule 5.6). */
function unload(trip: Cage, work: Work): Cage {
  if (trip.carried <= 0) {
    return trip;
  }
  if (work.pitheadOnly) {
    return unloadToPithead(trip, work);
  }
  const here = work.levels[trip.level];
  const piles = here === undefined ? [work.stone] : [here.maker, work.stone];
  const { into, left } = pour(trip.carried, piles);
  if (left === trip.carried) {
    return trip;
  }
  const toStone = into[into.length - 1] ?? 0;
  if (here !== undefined) {
    const toMaker = into[0] ?? 0;
    work.levels[trip.level] = {
      ...here,
      maker: { ...here.maker, held: here.maker.held + toMaker },
    };
    if (toMaker > 0) {
      work.toMaker[trip.level] = (work.toMaker[trip.level] ?? 0) + toMaker;
    }
  }
  work.stone = { ...work.stone, held: work.stone.held + toStone };
  work.toStone += toStone;
  work.moved = true;
  return { ...trip, carried: left };
}

/**
 * Where an empty cage goes down to (rules 5.7, 5.8): its own level; or, for
 * a cage for both, the other level if it is in the turn, else the same one
 * if it is. Undefined: it stands.
 */
function nextLevel(
  cage: ShaftCage,
  trip: Cage,
  levels: Work["levels"],
): MineLevelId | undefined {
  if (!cage.runs) {
    return undefined;
  }
  if (cage.serves !== "both") {
    return levels[cage.serves] === undefined ? undefined : cage.serves;
  }
  const other = otherLevel(trip.level);
  if (levels[other]?.inTurn === true) {
    return other;
  }
  return levels[trip.level]?.inTurn === true ? trip.level : undefined;
}

/** At the top: it unloads, waits with what finds no room, else goes down or stands. */
function atTop(cage: ShaftCage, trip: Cage, work: Work): Cage {
  const unloaded = unload(trip, work);
  if (unloaded.carried > 0) {
    return unloaded;
  }
  const level = nextLevel(cage, unloaded, work.levels);
  if (level === undefined) {
    return unloaded;
  }
  return {
    level,
    carried: 0,
    leg: { kind: "down", left: legSeconds(level, "down") },
  };
}

/**
 * Whether the cage has one level to serve at this one (ruling 10): it is
 * assigned there, the mine has one level, or it serves both and the other
 * level is out of the turn.
 */
function oneLevel(
  cage: ShaftCage,
  level: MineLevelId,
  levels: Work["levels"],
): boolean {
  if (cage.serves === level) {
    return true;
  }
  const other = levels[otherLevel(level)];
  return other === undefined || (cage.serves === "both" && !other.inTurn);
}

/**
 * A cage waits at a level (rule 5.9) while it runs, has one level to serve
 * there, has room, and either rock is coming or it is empty.
 */
function waits(
  cage: ShaftCage,
  trip: Cage,
  here: LevelScene,
  levels: Work["levels"],
): boolean {
  return (
    cage.runs &&
    oneLevel(cage, trip.level, levels) &&
    hasRoom(cage, trip.carried) &&
    (here.coming || trip.carried <= 0)
  );
}

/** The rock at the shaft poured into a cage that runs, up to its load. */
function loaded(cage: ShaftCage, trip: Cage, work: Work): Cage {
  const here = work.levels[trip.level];
  if (!cage.runs || here === undefined || here.shaft.held <= 0) {
    return trip;
  }
  const { into, left } = pour(here.shaft.held, [
    { held: trip.carried, holds: cage.load },
  ]);
  const taken = into[0] ?? 0;
  if (taken <= 0) {
    return trip;
  }
  work.levels[trip.level] = { ...here, shaft: { ...here.shaft, held: left } };
  work.moved = true;
  return { ...trip, carried: trip.carried + taken };
}

/** At a level: it takes the rock at the shaft, then waits or goes up. */
function atLevel(cage: ShaftCage, trip: Cage, work: Work): Cage {
  const after = loaded(cage, trip, work);
  const here = work.levels[after.level];
  if (here !== undefined && waits(cage, after, here, work.levels)) {
    return after;
  }
  return {
    ...after,
    leg: { kind: "up", left: legSeconds(after.level, "up") },
  };
}

/** One step of a cage at an instant; the same object while it rests. */
function cageStep(cage: ShaftCage, trip: Cage, work: Work): Cage {
  switch (trip.leg.kind) {
    case "top":
      return atTop(cage, trip, work);
    case "loading":
      return atLevel(cage, trip, work);
    default:
      return arrived(cage, trip);
  }
}

/**
 * A cage stepped until it rests, within the same instant, so a second
 * instant changes nothing. It rests within `SETTLE_STEPS`; one that does not
 * would break that, so it is a bug and throws.
 */
function settled(cage: ShaftCage, trip: Cage, work: Work): Cage {
  let now = trip;
  for (let step = 0; step < SETTLE_STEPS; step += 1) {
    const next = cageStep(cage, now, work);
    if (next === now) {
      return now;
    }
    now = next;
  }
  throw new Error(`cage ${cage.key} did not rest within an instant`);
}

/** The instant's outcome; the same trips and scene when nothing changed. */
function outcome(
  trips: CageTrips,
  written: Partial<Record<CageKey, Cage>> | undefined,
  scene: ShaftScene,
  work: Work,
): Instant {
  const changed = written !== undefined || work.moved;
  return {
    trips: written === undefined ? trips : { ...trips, ...written },
    scene: work.moved
      ? {
          levels: work.levels,
          stone: work.stone,
          ...(scene.pitheadOnly === true ? { pitheadOnly: true } : {}),
        }
      : scene,
    toMaker: work.toMaker,
    toPithead: work.toPithead,
    toStone: work.toStone,
    changed,
  };
}

/**
 * The cages at one instant (ruling 10), in order: each arrives, unloads,
 * loads and leaves until it rests. A cage with no entry is fresh
 * (`cageAt`). A second instant on its own result changes nothing.
 */
export function cageInstant(
  cages: readonly ShaftCage[],
  trips: CageTrips,
  scene: ShaftScene,
): Instant {
  const work = startWork(scene);
  let written: Partial<Record<CageKey, Cage>> | undefined;
  cages.forEach((cage, place) => {
    const start = cageAt(trips, cage.key, place);
    const end = settled(cage, start, work);
    if (end !== start) {
      written = { ...written, [cage.key]: end };
    }
  });
  return outcome(trips, written, scene, work);
}

/**
 * Every cage brought to the top and unloaded as at an instant, keeping what
 * finds no room (ruling 13). It loads nothing and goes nowhere.
 */
export function landCages(
  cages: readonly ShaftCage[],
  trips: CageTrips,
  scene: ShaftScene,
): Instant {
  const work = startWork(scene);
  let written: Partial<Record<CageKey, Cage>> | undefined;
  for (const cage of cages) {
    const start = trips[cage.key];
    if (start === undefined) {
      continue;
    }
    const top = start.leg.kind === "top" ? start : { ...start, leg: TOP };
    const end = unload(top, work);
    if (end !== start) {
      written = { ...written, [cage.key]: end };
    }
  }
  return outcome(trips, written, scene, work);
}

/** Every leg's time left less `seconds`, never below 0. */
export function cagesAfter(trips: CageTrips, seconds: number): CageTrips {
  if (seconds <= 0) {
    return trips;
  }
  let after: Partial<Record<CageKey, Cage>> | undefined;
  for (const [key, trip] of Object.entries(trips) as [CageKey, Cage][]) {
    const { leg } = trip;
    if (leg.kind !== "down" && leg.kind !== "up") {
      continue;
    }
    const left = Math.max(0, leg.left - seconds);
    if (left !== leg.left) {
      after = { ...after, [key]: { ...trip, leg: { kind: leg.kind, left } } };
    }
  }
  return after === undefined ? trips : { ...trips, ...after };
}

/** The least time left on a leg, or Infinity while no cage travels. */
export function nextLegEnd(trips: CageTrips): number {
  let next = Infinity;
  for (const trip of Object.values(trips)) {
    const leg = trip?.leg;
    if (leg?.kind === "down" || leg?.kind === "up") {
      next = Math.min(next, leg.left);
    }
  }
  return next;
}

/** The first cage in order loading at `level` with room: the last pile of that level's chain. */
export function waitingCage(
  cages: readonly ShaftCage[],
  trips: CageTrips,
  level: MineLevelId,
): { readonly key: CageKey; readonly pile: Pile } | undefined {
  for (const cage of cages) {
    const trip = trips[cage.key];
    if (
      trip?.leg.kind === "loading" &&
      trip.level === level &&
      hasRoom(cage, trip.carried)
    ) {
      return { key: cage.key, pile: { held: trip.carried, holds: cage.load } };
    }
  }
  return undefined;
}

/** A cage's trip carrying this much rock. Unchanged for a cage with no entry. */
export function withCarried(
  trips: CageTrips,
  key: CageKey,
  carried: number,
): CageTrips {
  const trip = trips[key];
  if (trip === undefined || trip.carried === carried) {
    return trips;
  }
  return { ...trips, [key]: { ...trip, carried } };
}

/** Whether some cage at the top still carries rock: it tries again as transport makes room. */
export function topWaits(trips: CageTrips): boolean {
  return Object.values(trips).some(
    (trip) => trip?.leg.kind === "top" && trip.carried > 0,
  );
}
