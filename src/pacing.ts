import { buyCrew, tierLocked } from "./crew";
import {
  accrue,
  accrueAway,
  createMountain,
  mineByHand,
  minedOut,
  type Mountain,
} from "./mountain";
import { TIERS, owned, tierCost, tierShown } from "./tiers";

/** How a typical dad plays: see docs/DESIGN.md "Pacing". */
const DAD = {
  sessionsPerDay: 2,
  sessionSeconds: 10 * 60,
  tapsPerSecond: 3,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The tier giving the most speed per stone that can be built now. */
function bestValue(mountain: Mountain) {
  let best:
    | { id: (typeof TIERS)[number]["id"]; cost: number; value: number }
    | undefined;
  for (const tier of TIERS) {
    if (!tierShown(mountain, tier) || tierLocked(mountain, tier)) {
      continue;
    }
    const cost = tierCost(tier, owned(mountain, tier));
    const value = tier.perSecond / cost;
    if (best === undefined || value > best.value) {
      best = { id: tier.id, cost, value };
    }
  }
  return best;
}

/**
 * Plays the game second by second through each session, and pays capped idle
 * time between them, until the mountain is empty or `maxDays` pass.
 * Returns the day (1-based, fractional) each stone count was first reached.
 */
export function simulateDad({
  milestones,
  maxDays = 30,
}: {
  milestones: readonly number[];
  maxDays?: number;
}): Map<number, number> {
  const reached = new Map<number, number>();
  let mountain = createMountain();
  let clock = 0;
  const note = () => {
    for (const mark of milestones) {
      if (!reached.has(mark) && minedOut(mountain) >= mark) {
        reached.set(mark, clock / DAY_MS + 1);
      }
    }
  };
  const gapMs = DAY_MS / DAD.sessionsPerDay - DAD.sessionSeconds * 1000;
  for (let session = 0; session < maxDays * DAD.sessionsPerDay; session += 1) {
    for (let second = 0; second < DAD.sessionSeconds; second += 1) {
      for (let tap = 0; tap < DAD.tapsPerSecond; tap += 1) {
        mountain = mineByHand(mountain);
      }
      mountain = accrue({ mountain, from: clock, to: clock + 1000 }).mountain;
      clock += 1000;
      for (
        let pick = bestValue(mountain);
        pick !== undefined && pick.cost <= mountain.pocket;
        pick = bestValue(mountain)
      ) {
        mountain = buyCrew(mountain, pick.id);
      }
      note();
    }
    mountain = accrueAway({
      mountain,
      lastSeen: clock,
      now: clock + gapMs,
    }).mountain;
    clock += gapMs;
    note();
    if (mountain.remaining === 0) {
      break;
    }
  }
  return reached;
}
