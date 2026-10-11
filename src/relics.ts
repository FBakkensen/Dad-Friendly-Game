import { MOUNTAIN_STONES, minedOut, type Mountain } from "./mountain";

export type RelicId =
  "lantern" | "shield" | "hammer" | "heart" | "crown" | "mantle";

export type Relic = {
  readonly id: RelicId;
  readonly name: string;
  readonly virtue: string;
  /** What finding it does, in the player's words. */
  readonly power: string;
  /** Stones mined out of the mountain when it is uncovered. */
  readonly depth: number;
};

/** Deepest last. Depths are the tuning knob; see docs/DESIGN.md. */
export const RELICS: readonly Relic[] = [
  {
    id: "lantern",
    name: "Lantern of Guidance",
    virtue: "Guidance",
    power:
      "It lights the way to the next relic, and golden veins glint more often.",
    depth: 20_000,
  },
  {
    id: "shield",
    name: "Shield of Protection",
    virtue: "Protection",
    power: "Your crew keeps mining however long you're away.",
    depth: 100_000,
  },
  {
    id: "hammer",
    name: "Hammer of the Builder",
    virtue: "Building",
    power: "Bigger machines can be built.",
    depth: 250_000,
  },
  {
    id: "heart",
    name: "Heart of Patience",
    virtue: "Patience",
    power: "Your crew grows stronger the longer you're away.",
    depth: 450_000,
  },
  {
    id: "crown",
    name: "Crown of Wisdom",
    virtue: "Wisdom",
    power: "Kid helpers can learn to run their own machines.",
    depth: 700_000,
  },
  {
    id: "mantle",
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
