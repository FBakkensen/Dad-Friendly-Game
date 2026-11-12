import type { TierId } from "./tiers";

/**
 * Owned-count bonuses (M12 #252, widened in #357 spec C). Owning `at` of a
 * machine, or of workers, makes every one of them work twice as fast; marks
 * stack. Every staffed tier and the workers have marks; kids have none. AdVenture
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
export const REACHED_LINE = "Twice as fast now.";

export type MilestoneTable = Readonly<
  Partial<Record<TierId, readonly Milestone[]>>
>;

/** Ordered by `at`. A tier missing here (the kids) has no milestones. */
export const MILESTONES: MilestoneTable = {
  cart: [
    { at: 10, goal: "Ten carts on the rails. Every cart hauls twice as fast." },
    {
      at: 25,
      goal: "Twenty-five carts in a long, rattling line. Twice as fast again.",
    },
    {
      at: 50,
      goal: "Fifty carts and the rails never rest. Twice as fast again.",
    },
    { at: 100, goal: "A hundred carts, a river of rock. Twice as fast again." },
    {
      at: 150,
      goal: "A hundred and fifty carts. The tracks hum all night. Twice as fast again.",
    },
    {
      at: 200,
      goal: "Two hundred carts. The old mine was never this busy. Twice as fast again.",
    },
  ],
  drill: [
    {
      at: 10,
      goal: "Ten drills and the crew finds its rhythm. Every drill mines twice as fast.",
    },
    {
      at: 25,
      goal: "Twenty-five drills humming together. Twice as fast again.",
    },
    {
      at: 50,
      goal: "Fifty drills in step, like one long breath. Twice as fast again.",
    },
    {
      at: 100,
      goal: "A hundred drills. The whole hill thrums. Twice as fast again.",
    },
    {
      at: 150,
      goal: "A hundred and fifty drills, and nobody has to shout. Twice as fast again.",
    },
    {
      at: 200,
      goal: "Two hundred drills. The rock just gives way. Twice as fast again.",
    },
  ],
  // Borers keep today's mark at 5 (Flemming, after the Task 3 stop, #357).
  borer: [
    {
      at: 5,
      goal: "Five borers side by side. They clear the tunnels twice as fast.",
    },
    { at: 10, goal: "Ten borers in step. Twice as fast again." },
    { at: 25, goal: "Twenty-five borers in step. Twice as fast again." },
    {
      at: 50,
      goal: "Fifty borers, a slow and steady thunder. Twice as fast again.",
    },
    {
      at: 100,
      goal: "A hundred borers. New tunnels open by the hour. Twice as fast again.",
    },
    {
      at: 150,
      goal: "A hundred and fifty borers working the deep dark. Twice as fast again.",
    },
    {
      at: 200,
      goal: "Two hundred borers. The mountain rings like a bell. Twice as fast again.",
    },
  ],
  machine: [
    {
      at: 2,
      goal: "Two Great Machines working as one. Both run twice as fast.",
    },
    { at: 3, goal: "Three Great Machines in step. Twice as fast again." },
    {
      at: 5,
      goal: "Five Great Machines. The ground hums under your feet. Twice as fast again.",
    },
    {
      at: 10,
      goal: "Ten Great Machines, a little town of iron. Twice as fast again.",
    },
    {
      at: 25,
      goal: "Twenty-five Great Machines turning in the dark. Twice as fast again.",
    },
    {
      at: 50,
      goal: "Fifty Great Machines. The mountain has met its match. Twice as fast again.",
    },
  ],
  helper: [
    {
      at: 25,
      goal: "Twenty-five workers who know the songs. Every worker digs twice as fast.",
    },
    {
      at: 50,
      goal: "Fifty workers around one long lunch table. Twice as fast again.",
    },
    {
      at: 100,
      goal: "A hundred workers. The camp is a little village now. Twice as fast again.",
    },
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
 * The whole line, a bay's longest option: the next goal with progress, or once every mark is
 * reached, the "twice as fast now" line. Undefined for a tier without marks. A Buys row shows
 * `nextMark` instead (#506).
 */
export function milestoneLine(
  id: TierId,
  count: number,
  format: (value: number) => string,
  table: MilestoneTable = MILESTONES,
): string | undefined {
  const reached = milestonesReached(id, count, table);
  const now = reached === 0 ? undefined : REACHED_LINE;
  const next = upcoming(id, count, format, table);
  if (next === undefined) {
    return now;
  }
  const goal = `${next.progress} · ${next.goal}`;
  return now === undefined ? goal : `${now} ${goal}`;
}

/** The next mark's goal with the progress toward it (`5 of 10`), or undefined past the last. */
function upcoming(
  id: TierId,
  count: number,
  format: (value: number) => string,
  table: MilestoneTable,
): { readonly progress: string; readonly goal: string } | undefined {
  const next = (table[id] ?? []).find((mark) => count < mark.at);
  return next === undefined
    ? undefined
    : {
        progress: `${format(count)} of ${format(next.at)}`,
        goal: next.goal,
      };
}

/** The short payoff, where a row has one line for it (#506): what every mark's goal ends on. */
export const MARK_SHORT = "Twice as fast";

/**
 * The next mark for a Buys row (#506): the progress (`5 of 10`) and the goal's payoff, its last
 * sentence (`Every cart hauls twice as fast.`). Undefined past the last mark and for a tier
 * without marks.
 */
export function nextMark(
  id: TierId,
  count: number,
  format: (value: number) => string,
  table: MilestoneTable = MILESTONES,
): { readonly progress: string; readonly payoff: string } | undefined {
  const next = upcoming(id, count, format, table);
  if (next === undefined) {
    return undefined;
  }
  const scene = next.goal.lastIndexOf(". ");
  return {
    progress: next.progress,
    payoff: scene === -1 ? next.goal : next.goal.slice(scene + 2),
  };
}
