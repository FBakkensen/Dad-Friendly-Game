import type { Mountain } from "./mountain";
import { MOUNTAIN_STONES, minedOut } from "./scale";

export type RelicId =
  "lantern" | "shield" | "hammer" | "heart" | "crown" | "mantle";

export type Relic = {
  readonly id: RelicId;
  readonly name: string;
  readonly virtue: string;
  /** A one-line mystery shown before it is found; no numbers. */
  readonly tease: string;
  /** The plain "Your power" line: what finding it changes. No depths. */
  readonly boost: string;
  /** Stones mined out of the mountain when it is uncovered. */
  readonly depth: number;
};

/** Deepest last. Depths are the tuning knob; see docs/DESIGN.md. */
export const RELICS: readonly Relic[] = [
  {
    id: "lantern",
    boost:
      "Golden veins appear 40% sooner, and it lights the way to the next relic.",
    tease: "A warm light waits in the dark below.",
    name: "Lantern of Guidance",
    virtue: "Guidance",
    depth: 1_000_000,
  },
  {
    id: "shield",
    boost: "Your crew keeps mining up to 24 hours while you're away.",
    tease: "A shield rests deep below, keeping watch.",
    name: "Shield of Protection",
    virtue: "Protection",
    depth: 10_000_000,
  },
  {
    id: "hammer",
    boost: "Unlocks the Great Machine.",
    tease: "Somewhere down there lies the hammer that built great things.",
    name: "Hammer of the Builder",
    virtue: "Building",
    depth: 25_000_000,
  },
  {
    id: "heart",
    boost: "Away pay grows the longer you're gone, up to ×1.5 after 12 hours.",
    tease: "A patient heart beats beneath the stone.",
    name: "Heart of Patience",
    virtue: "Patience",
    depth: 45_000_000,
  },
  {
    id: "crown",
    boost:
      "Kid workers join the crew: they mine, count as workers, and make every worker and kid 2% faster.",
    tease: "A crown of wisdom sleeps in the deep.",
    name: "Crown of Wisdom",
    virtue: "Wisdom",
    depth: 70_000_000,
  },
  {
    id: "mantle",
    boost:
      "Ends the run as a Legend. Pass the mine to your kid when you are ready.",
    tease: "At the very bottom, a hero's mantle waits.",
    name: "Mantle of the Hero",
    virtue: "Heroism",
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

/** The next relic and how far along the way to it, 0 to 1. */
function towardNext(
  mountain: Mountain,
): { readonly next: Relic; readonly progress: number } | undefined {
  const next = nextRelic(mountain);
  if (next === undefined) {
    return undefined;
  }
  const mined = MOUNTAIN_STONES - mountain.remaining;
  const from =
    RELICS.filter((relic) => relic.depth <= mined).at(-1)?.depth ?? 0;
  return { next, progress: (mined - from) / (next.depth - from) };
}

const hintFor = (progress: number): string =>
  progress >= 0.9
    ? "Almost there"
    : progress >= 0.6
      ? "Close now"
      : progress >= 0.25
        ? "Getting closer"
        : "Far below";

/** A vague sense of how near the next relic is; the progress bar carries the rest. */
export function depthHint(mountain: Mountain): string | undefined {
  const toward = towardNext(mountain);
  return toward === undefined ? undefined : hintFor(toward.progress);
}

/**
 * Where the dig is headed, once the Lantern lights the way: the next relic,
 * a vague hint, and how full the bar is. No depths or counts (discoveries
 * stay vague). The Ledger's relics row and its bar read it (#375).
 */
export type RelicGoal =
  | { readonly kind: "unguided" }
  | { readonly kind: "done" }
  | {
      readonly kind: "next";
      readonly name: string;
      readonly hint: string;
      readonly percent: number;
    };

export function relicGoal(mountain: Mountain): RelicGoal {
  if (!hasRelic(mountain, "lantern")) {
    return { kind: "unguided" };
  }
  const toward = towardNext(mountain);
  if (toward === undefined) {
    return { kind: "done" };
  }
  return {
    kind: "next",
    name: toward.next.name,
    hint: hintFor(toward.progress),
    percent: Math.floor(toward.progress * 100),
  };
}
