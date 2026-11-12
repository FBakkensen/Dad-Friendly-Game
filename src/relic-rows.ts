import { KEEPSAKES, type KeepsakeId } from "./expeditions";
import { formatCount } from "./format";
import { MOUNTAIN_STONES, type Mountain } from "./mountain";
import {
  RELICS,
  depthHint,
  foundRelics,
  hasRelic,
  nextRelic,
  type Relic,
} from "./relics";
import type { RowLamp, RowView } from "./row-view";
import { shownStones } from "./scale";
import { TIERS, owned } from "./tiers";

/*
 * What the relics drawer says (#465): the shelf's rows, its kick, the keepsakes on a found
 * relic's detail and the Legend's line. Display only: read from the mountain, never changing it.
 * The words are today's shelf, reveal and Legend words.
 */

/**
 * The words for one relic, shared by the shelf rows and the board's relic plate so they never
 * disagree. The hint is the guided next relic's only.
 */
export function relicNote(
  mountain: Mountain,
  relic: Relic,
): {
  readonly title: string;
  readonly line: string;
  readonly hint: string | undefined;
} {
  const hint = depthHint(mountain);
  const isNext =
    hasRelic(mountain, "lantern") &&
    relic === nextRelic(mountain) &&
    hint !== undefined;
  return {
    title: relic.name,
    line: hasRelic(mountain, relic.id)
      ? `The virtue of ${relic.virtue}. Your power: ${relic.boost}`
      : relic.tease,
    hint: isNext ? `Next · ${hint}` : undefined,
  };
}

/** A shelf row shows no price, gain or verb: the shelf buys nothing. */
const SHELF_ROW = {
  badge: "",
  need: "",
  flag: [],
  gain: "",
  price: "",
  dimTag: false,
  verb: "",
  pick: false,
} as const satisfies Partial<RowView>;

/**
 * One relic on the shelf: found, it shows its virtue and power and opens its detail, its lamp
 * dark (#509); the next to find is amber with its tease and, once the Lantern guides, the vague
 * hint; any further down is dark with its tease.
 */
export function shelfRowView(mountain: Mountain, relic: Relic): RowView {
  const words = relicNote(mountain, relic);
  if (hasRelic(mountain, relic.id)) {
    return {
      ...SHELF_ROW,
      name: words.title,
      info: [words.line, `Your power: ${relic.boost}`],
      why: "",
      // Found is done: dark, and the next to find is the amber one (#509).
      lamp: "off",
      state: "found",
      can: true,
      aria: `${relic.name}: see your power`,
    };
  }
  const why = words.hint ?? "";
  const lamp: RowLamp = relic === nextRelic(mountain) ? "amber" : "off";
  return {
    ...SHELF_ROW,
    name: words.title,
    info: [words.line],
    why,
    lamp,
    state: "locked",
    can: false,
    aria: `${relic.name}. ${words.line}${why === "" ? "" : ` ${why}`}`,
  };
}

/** "2 of 6 found": the drawer's resting kick, in the sockets' count words. */
export function relicsKick(mountain: Mountain): string {
  return `${String(foundRelics(mountain).length)} of ${String(RELICS.length)} found`;
}

/** The keepsakes brought home, in the shelf's order. Lost tools stay on Upgrades. */
export function shelfKeepsakes(mountain: Mountain): readonly KeepsakeId[] {
  const finds: readonly string[] = mountain.finds;
  return KEEPSAKES.filter((id) => finds.includes(id));
}

/** The Legend's line: the stones moved, the six relics and the crew beside you. */
export function legendStats(mountain: Mountain): string {
  const crewSize = TIERS.reduce(
    (total, tier) => total + owned(mountain, tier),
    0,
  );
  return `${formatCount(shownStones(mountain, MOUNTAIN_STONES))} stones moved. Six relics found. A crew of ${formatCount(crewSize)} beside you.`;
}
