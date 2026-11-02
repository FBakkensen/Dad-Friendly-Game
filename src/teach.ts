import type { Mountain } from "./mountain";
import { BOOSTS } from "./boosts";
import {
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

type TeachSpec = {
  readonly id: string;
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
      Object.values(mountain.crafted ?? {}).some((level) => level > 0),
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

function has(list: readonly string[] | undefined, id: string): boolean {
  return list?.includes(id) ?? false;
}

function specOf(id: string): TeachSpec | undefined {
  return TEACH_SPECS.find((spec) => spec.id === id);
}

/** Used now or before. */
function isTaught(mountain: Mountain, id: string): boolean {
  const spec = specOf(id);
  return has(mountain.taught, id) || (spec?.used(mountain) ?? false);
}

/** The red dot: open, and not yet used. */
export function showsDot(mountain: Mountain, id: string): boolean {
  const spec = specOf(id);
  return (
    spec !== undefined && spec.unlocked(mountain) && !isTaught(mountain, id)
  );
}

/** The one big system whose note shows now, if any. */
export function noteFor(mountain: Mountain): string | undefined {
  return TEACH_SPECS.find(
    (spec) =>
      spec.size === "big" &&
      spec.unlocked(mountain) &&
      !has(mountain.seen, spec.id) &&
      !isTaught(mountain, spec.id),
  )?.id;
}

function added(
  list: readonly string[] | undefined,
  id: string,
): readonly string[] {
  return [...(list ?? []), id];
}

/** The sheet was opened: its note goes. The dot stays. */
export function markSeen(mountain: Mountain, id: string): Mountain {
  if (has(mountain.seen, id) || specOf(id) === undefined) {
    return mountain;
  }
  return { ...mountain, seen: added(mountain.seen, id) };
}

/** Marks each id seen. The same mountain comes back when none is new. */
export function markAllSeen(
  mountain: Mountain,
  ids: readonly string[],
): Mountain {
  return ids.reduce(markSeen, mountain);
}

/**
 * Writes down every system the mountain now shows a first use of. The same
 * mountain comes back when nothing is new, so a no-op stays a no-op.
 */
export function recordFirstUse(mountain: Mountain): Mountain {
  let next = mountain;
  for (const spec of TEACH_SPECS) {
    if (!has(next.taught, spec.id) && spec.used(next)) {
      next = {
        ...next,
        taught: added(next.taught, spec.id),
        seen: has(next.seen, spec.id) ? next.seen : added(next.seen, spec.id),
      } as Mountain;
    }
  }
  return next;
}

/**
 * Reads a saved id list. Missing is empty. Ids from a newer build are kept
 * so the next write does not forget them. Anything that is not a list of
 * short strings is "bad".
 */
export function parseTeachIds(value: unknown): readonly string[] | "bad" {
  if (value === undefined) {
    return [];
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
  return ids;
}
