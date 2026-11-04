import type { TierId } from "./tiers";

/**
 * M12 owned-count bonuses (#252 follow-up). Owning `at` of a machine makes
 * every one of them mine twice as fast; marks stack. AdVenture
 * Capitalist-style goals that keep older machines worth buying. The card
 * shows the next goal in plain words, never a payback number. Counts come
 * from the save, so save, load and cloud save carry them for free.
 */
type Milestone = {
  readonly at: number;
  /** The card's goal line before the mark is reached. */
  readonly goal: string;
};

const MILESTONE_MULTIPLIER = 2;

/** Shown once a mark is reached. */
const REACHED_LINE = "Twice as fast now.";

export type MilestoneTable = Readonly<
  Partial<Record<TierId, readonly Milestone[]>>
>;

/** Ordered by `at`. A tier missing here has no milestones. M12 retune (#252). */
export const MILESTONES: MilestoneTable = {
  drill: [
    {
      at: 20,
      goal: "Twenty drills and the crew finds its rhythm. Every drill mines twice as fast.",
    },
    { at: 30, goal: "Thirty drills humming together. Twice as fast again." },
  ],
  borer: [
    {
      at: 5,
      goal: "Five borers side by side. They clear the tunnels twice as fast.",
    },
    { at: 10, goal: "Ten borers in step. Twice as fast again." },
  ],
  machine: [
    {
      at: 2,
      goal: "Two Great Machines working as one. Both run twice as fast.",
    },
    { at: 3, goal: "Three Great Machines in step. Twice as fast again." },
  ],
};

/** Marks reached with `count` owned. */
export function milestonesReached(
  id: TierId,
  count: number,
  table: MilestoneTable = MILESTONES,
): number {
  return (table[id] ?? []).filter((mark) => count >= mark.at).length;
}

/** Output multiplier from reached marks. 1 with none. */
export function milestoneMultiplier(
  id: TierId,
  count: number,
  table: MilestoneTable = MILESTONES,
): number {
  return MILESTONE_MULTIPLIER ** milestonesReached(id, count, table);
}

/**
 * The card line: the next goal with progress, or once every mark is
 * reached, the "twice as fast now" line. Undefined for a tier without marks.
 */
export function milestoneLine(
  id: TierId,
  count: number,
  format: (value: number) => string,
  table: MilestoneTable = MILESTONES,
): string | undefined {
  const marks = table[id] ?? [];
  const reached = milestonesReached(id, count, table);
  const now = reached === 0 ? undefined : REACHED_LINE;
  const next = marks.find((mark) => count < mark.at);
  if (next === undefined) {
    return now;
  }
  const goal = `${format(count)} of ${format(next.at)} · ${next.goal}`;
  return now === undefined ? goal : `${now} ${goal}`;
}
