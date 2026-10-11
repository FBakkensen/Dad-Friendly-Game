import { minedOut, type Mountain } from "./mountain";
import { MOUNTAIN_STONES } from "./scale";

export type RelicId =
  "lantern" | "shield" | "hammer" | "heart" | "crown" | "mantle";

export type Relic = {
  readonly id: RelicId;
  readonly name: string;
  readonly virtue: string;
  /** What finding it does, in the player's words. */
  readonly power: string;
  /** A one-line mystery shown before it is found; no numbers. */
  readonly tease: string;
  /** Stones mined out of the mountain when it is uncovered. */
  readonly depth: number;
};

/** Deepest last. Depths are the tuning knob; see docs/DESIGN.md. */
export const RELICS: readonly Relic[] = [
  {
    id: "lantern",
    tease: "A warm light waits in the dark below.",
    name: "Lantern of Guidance",
    virtue: "Guidance",
    power:
      "It lights the way to the next relic, and golden veins glint more often.",
    depth: 1_000_000,
  },
  {
    id: "shield",
    tease: "A shield rests deep below, keeping watch.",
    name: "Shield of Protection",
    virtue: "Protection",
    power:
      "Your crew keeps mining for a whole day while you're away, not just 8 hours.",
    depth: 10_000_000,
  },
  {
    id: "hammer",
    tease: "Somewhere down there lies the hammer that built great things.",
    name: "Hammer of the Builder",
    virtue: "Building",
    power: "The Great Machine can be built, the mightiest crew of all.",
    depth: 25_000_000,
  },
  {
    id: "heart",
    tease: "A patient heart beats beneath the stone.",
    name: "Heart of Patience",
    virtue: "Patience",
    power:
      "The longer you're away, the harder your crew works: up to half again the away pay after 12 hours.",
    depth: 45_000_000,
  },
  {
    id: "crown",
    tease: "A crown of wisdom sleeps in the deep.",
    name: "Crown of Wisdom",
    virtue: "Wisdom",
    power:
      "Kid helpers join the crew: they mine, run machines, and each one makes every helper and kid 2% faster.",
    depth: 70_000_000,
  },
  {
    id: "mantle",
    tease: "At the very bottom, a hero's mantle waits.",
    name: "Mantle of the Hero",
    virtue: "Heroism",
    power: "You become a legend.",
    depth: MOUNTAIN_STONES,
  },
];

export function hasRelic(mountain: Mountain, id: RelicId): boolean {
  const relic = RELICS.find((candidate) => candidate.id === id);
  return relic !== undefined && minedOut(mountain) >= relic.depth;
}

export function foundRelics(mountain: Mountain): readonly Relic[] {
  const mined = minedOut(mountain);
  return RELICS.filter((relic) => mined >= relic.depth);
}

export function nextRelic(mountain: Mountain): Relic | undefined {
  const mined = minedOut(mountain);
  return RELICS.find((relic) => mined < relic.depth);
}

/** Relics uncovered by digging from `before` to `after` stones mined, shallowest first. */
export function relicsUncovered({
  before,
  after,
}: {
  before: number;
  after: number;
}): readonly Relic[] {
  return RELICS.filter((relic) => before < relic.depth && after >= relic.depth);
}

/** A vague sense of how near the next relic is; the progress bar carries the rest. */
export function depthHint(mountain: Mountain): string | undefined {
  const next = nextRelic(mountain);
  if (next === undefined) {
    return undefined;
  }
  const mined = MOUNTAIN_STONES - mountain.remaining;
  const from =
    RELICS.filter((relic) => relic.depth <= mined).at(-1)?.depth ?? 0;
  const progress = (mined - from) / (next.depth - from);
  if (progress >= 0.9) {
    return "Almost there";
  }
  if (progress >= 0.6) {
    return "Close now";
  }
  if (progress >= 0.25) {
    return "Getting closer";
  }
  return "Far below";
}
