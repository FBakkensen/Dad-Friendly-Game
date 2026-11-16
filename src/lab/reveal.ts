import { tierLocked } from "../crew";
import { atHome } from "../engineers";
import type { Mountain } from "../mountain";
import { owned, tierInPlay, TIERS } from "../tiers";
import { UPGRADES, upgradeLevel } from "../upgrades";
import { upgradeShown } from "../upgrade-reveal";
import { HOUR_MS, MS_PER_SECOND } from "./targets";

/**
 * When a thing first shows on screen and when the dad first uses it.
 * Ids read `kind:id`, e.g. `upgrade:boots` or `system:expeditions`.
 * `liveSec` counts live play only, so a night away adds nothing.
 */
export type RevealEvent = {
  readonly kind: "appeared" | "firstUse";
  readonly id: string;
  readonly liveSec: number;
  /** Sittings started before this one. The tournament stamps it. */
  readonly sitting?: number;
};

/** One thing's wait, from showing up to its first use, in live hours. */
export type RevealGap = {
  readonly id: string;
  readonly hours: number;
};

const SECONDS_PER_HOUR = HOUR_MS / MS_PER_SECOND;

type Watch = {
  readonly id: string;
  /** On screen. */
  readonly shown: (mountain: Mountain) => boolean;
  readonly used: (mountain: Mountain) => boolean;
};

/**
 * Everything the lab watches: buys and systems. The old bench's recipes,
 * its materials and the workshop went in #740: the bench never opens.
 */
const WATCHES: readonly Watch[] = [
  ...TIERS.map((tier) => ({
    id: `tier:${tier.id}`,
    // A locked preview card (a level still shut, #250) is not
    // a reveal: the wait starts when the card opens for sale.
    shown: (mountain: Mountain) =>
      tierInPlay(tier) && !tierLocked(mountain, tier),
    used: (mountain: Mountain) => owned(mountain, tier) > 0,
  })),
  ...UPGRADES.map((upgrade) => ({
    id: `upgrade:${upgrade.id}`,
    // The row shows once its owned count opens it (#250).
    shown: (mountain: Mountain) => upgradeShown(mountain, upgrade),
    used: (mountain: Mountain) => upgradeLevel(mountain, upgrade.id) > 0,
  })),
  {
    id: "system:expeditions",
    shown: (mountain: Mountain) => mountain.engineers.length > 0,
    used: (mountain: Mountain) =>
      mountain.expeditions.length > 0 ||
      mountain.engineers.some((engineer) => engineer.trips > 0),
  },
  {
    id: "system:tending",
    shown: (mountain: Mountain) => mountain.engineers.length > 0,
    used: (mountain: Mountain) =>
      atHome(mountain).some((engineer) => engineer.post !== "camp"),
  },
  {
    id: "system:promote",
    shown: (mountain: Mountain) => mountain.engineers.length > 0,
    used: (mountain: Mountain) => mountain.engineers.length > 1,
  },
];

/**
 * Remembers what already appeared and what was already used, and returns
 * the new events each time it looks at the mountain. A first use with no
 * appearance before it logs both in that second, so every use has a start.
 */
export function createRevealLog(): (
  mountain: Mountain,
  liveSec: number,
) => readonly RevealEvent[] {
  const appeared = new Set<string>();
  const used = new Set<string>();
  return (mountain, liveSec) => {
    const events: RevealEvent[] = [];
    for (const watch of WATCHES) {
      const isUsed = !used.has(watch.id) && watch.used(mountain);
      if (!appeared.has(watch.id) && (isUsed || watch.shown(mountain))) {
        appeared.add(watch.id);
        events.push({ kind: "appeared", id: watch.id, liveSec });
      }
      if (isUsed) {
        used.add(watch.id);
        events.push({ kind: "firstUse", id: watch.id, liveSec });
      }
    }
    return events;
  };
}

/**
 * Pairs each first use with its appearance. Events from several runs can
 * be read in one list: a second appearance of an id starts a new run's wait.
 * Things that appeared and were never used are left out.
 */
export function revealGaps(
  events: readonly RevealEvent[],
): readonly RevealGap[] {
  const start = new Map<string, number>();
  const gaps: RevealGap[] = [];
  for (const event of events) {
    if (event.kind === "appeared") {
      start.set(event.id, event.liveSec);
      continue;
    }
    const from = start.get(event.id);
    if (from !== undefined) {
      gaps.push({
        id: event.id,
        hours: (event.liveSec - from) / SECONDS_PER_HOUR,
      });
      start.delete(event.id);
    }
  }
  return gaps;
}

/** Ids that appeared and were never used, in the order they appeared. */
export function neverUsed(events: readonly RevealEvent[]): readonly string[] {
  const used = new Set(
    events
      .filter((event) => event.kind === "firstUse")
      .map((event) => event.id),
  );
  const ids: string[] = [];
  for (const event of events) {
    if (
      event.kind === "appeared" &&
      !used.has(event.id) &&
      !ids.includes(event.id)
    ) {
      ids.push(event.id);
    }
  }
  return ids;
}
