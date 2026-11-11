import type { Mountain } from "./mountain";
import { atHome } from "./engineers";
import { BOOSTS } from "./boosts";
import { firstIdleTier, firstTend, promotePayoff } from "./rates";
import {
  type RevealRowId,
  boostRowId,
  boostShown,
  boostUsed,
  upgradeRowId,
  upgradeShown,
  upgradeUsed,
} from "./upgrade-reveal";
import { UPGRADES } from "./upgrades";
import { workshopUnlocked } from "./workshop";

/**
 * Which systems the dad has been shown and which he has used (M11, #241).
 *
 * The hybrid pattern from #240: a big system gets a red dot on its button
 * and one "New" note above the bar; a small system gets the dot only. The
 * note goes once the sheet is opened (`seen`). The dot stays until the
 * first real use (`taught`). Only one note shows at a time.
 *
 * Both lists are saved in the workshop map. A save from before them has
 * neither: nothing is seen, and anything already used counts as taught,
 * because `used` reads the mountain itself.
 */

type TeachSize = "big" | "small";

/** Every system the game teaches: its big notes, its small dots, and each boost and upgrade row. */
export type TeachId =
  "workshop" | "engineers" | "tending" | "promotion" | "staffing" | RevealRowId;

type TeachSpec = {
  readonly id: TeachId;
  readonly size: TeachSize;
  /** The system is open to this dad. */
  readonly unlocked: (mountain: Mountain) => boolean;
  /** The mountain shows a real first use. */
  readonly used: (mountain: Mountain) => boolean;
};

/** In the order their notes take turns. */
const TEACH_SPECS: readonly TeachSpec[] = [
  {
    id: "workshop",
    size: "big",
    unlocked: workshopUnlocked,
    used: (mountain) =>
      mountain.bench !== undefined ||
      Object.values(mountain.crafted).some((level) => level > 0),
  },
  // Big system (#246): the first engineer arrives with the first borer.
  // The first trip is the first use.
  {
    id: "engineers",
    size: "big",
    unlocked: (mountain) => mountain.engineers.length > 0,
    used: (mountain) =>
      mountain.expeditions.length > 0 ||
      mountain.engineers.some((engineer) => engineer.trips > 0),
  },
  // Small system (#246): after the first trip, once there is a machine to
  // step up to. The dot only. A move off the starting borers is a use.
  {
    id: "tending",
    size: "small",
    unlocked: (mountain) =>
      isTaught(mountain, "engineers") && firstTend(mountain) !== undefined,
    used: (mountain) =>
      atHome(mountain).some(
        (engineer) =>
          engineer.post === "cart" ||
          engineer.post === "drill" ||
          engineer.post === "machine",
      ),
  },
  // Small system (#246): the second engineer, once he can pay for one and
  // the new hand would really leave the crew faster. Dot only.
  {
    id: "promotion",
    size: "small",
    unlocked: (mountain) =>
      isTaught(mountain, "engineers") &&
      mountain.engineers.length === 1 &&
      promotePayoff(mountain) !== undefined,
    used: (mountain) => mountain.engineers.length >= 2,
  },
  // Small system (#246): the first machine standing idle for want of crew.
  // The dot only. The first worker hired while one stands idle is the use.
  {
    id: "staffing",
    size: "small",
    unlocked: (mountain) => firstIdleTier(mountain) !== undefined,
    used: () => false,
  },
  // Small systems (#245): each boost and upgrade row, once it shows.
  ...BOOSTS.map((boost): TeachSpec => ({
    id: boostRowId(boost),
    size: "small",
    unlocked: (mountain) => boostShown(mountain, boost),
    used: (mountain) => boostUsed(mountain, boost),
  })),
  ...UPGRADES.map((upgrade): TeachSpec => ({
    id: upgradeRowId(upgrade),
    size: "small",
    unlocked: (mountain) => upgradeShown(mountain, upgrade),
    used: (mountain) => upgradeUsed(mountain, upgrade),
  })),
];

/** Longest id and most ids a save keeps, known or from a newer build. */
const MAX_TEACH_ID = 40;
const MAX_TEACH_IDS = 32;

function specOf(id: TeachId): TeachSpec | undefined {
  return TEACH_SPECS.find((spec) => spec.id === id);
}

function isTeachId(value: string): value is TeachId {
  return TEACH_SPECS.some((spec) => spec.id === value);
}

/** Used now or before. */
function isTaught(mountain: Mountain, id: TeachId): boolean {
  const spec = specOf(id);
  return mountain.taught.includes(id) || (spec?.used(mountain) ?? false);
}

/** The red dot: open, and not yet used. */
export function showsDot(mountain: Mountain, id: TeachId): boolean {
  const spec = specOf(id);
  return (
    spec !== undefined && spec.unlocked(mountain) && !isTaught(mountain, id)
  );
}

/** The one big system whose note shows now, if any. */
export function noteFor(mountain: Mountain): TeachId | undefined {
  return TEACH_SPECS.find(
    (spec) =>
      spec.size === "big" &&
      spec.unlocked(mountain) &&
      !mountain.seen.includes(spec.id) &&
      !isTaught(mountain, spec.id),
  )?.id;
}

function added(list: readonly TeachId[], id: TeachId): readonly TeachId[] {
  return list.includes(id) ? list : [...list, id];
}

/** The sheet was opened: its note goes. The dot stays. */
export function markSeen(mountain: Mountain, id: TeachId): Mountain {
  if (mountain.seen.includes(id)) {
    return mountain;
  }
  return { ...mountain, seen: [...mountain.seen, id] };
}

/** Marks each id seen. The same mountain comes back when none is new. */
export function markAllSeen(
  mountain: Mountain,
  ids: readonly TeachId[],
): Mountain {
  return ids.reduce(markSeen, mountain);
}

/** A first use the mountain cannot show by itself, such as a first tend. */
export function markTaught(mountain: Mountain, id: TeachId): Mountain {
  if (mountain.taught.includes(id)) {
    return mountain;
  }
  return {
    ...mountain,
    taught: [...mountain.taught, id],
    seen: added(mountain.seen, id),
  };
}

/**
 * Writes down every system the mountain now shows a first use of. The same
 * mountain comes back when nothing is new, so a no-op stays a no-op.
 */
export function recordFirstUse(mountain: Mountain): Mountain {
  let next = mountain;
  for (const spec of TEACH_SPECS) {
    if (!next.taught.includes(spec.id) && spec.used(next)) {
      next = {
        ...next,
        taught: [...next.taught, spec.id],
        seen: added(next.seen, spec.id),
      };
    }
  }
  return next;
}

/**
 * Reads a saved id list. Missing is empty. Ids this build knows are
 * `known`; ids from a newer build are `kept`, so the next write does not
 * forget them. Anything that is not a list of short strings is "bad".
 */
export function parseTeachIds(
  value: unknown,
):
  | { readonly known: readonly TeachId[]; readonly kept: readonly string[] }
  | "bad" {
  if (value === undefined) {
    return { known: [], kept: [] };
  }
  if (!Array.isArray(value)) {
    return "bad";
  }
  const ids: string[] = [];
  for (const item of value) {
    if (
      typeof item !== "string" ||
      item.length === 0 ||
      item.length > MAX_TEACH_ID ||
      ids.includes(item) ||
      ids.length >= MAX_TEACH_IDS
    ) {
      continue;
    }
    ids.push(item);
  }
  return {
    known: ids.filter(isTeachId),
    kept: ids.filter((id) => !isTeachId(id)),
  };
}
