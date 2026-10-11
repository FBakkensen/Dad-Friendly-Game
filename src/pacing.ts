import { buyCrew, tierLocked } from "./crew";
import { AWAY_CAP_MS } from "./mountain";
import { AWAY_PAY_RATE, effectiveRates } from "./rates";
import {
  BOOTS_SPEED_PER_LEVEL,
  STEADY_AWAY_PER_LEVEL,
  TAP_SHARE_PER_LEVEL,
  buyUpgrade,
  upgradeById,
  upgradeCost,
  upgradeLevel,
  upgradeUnlocked,
} from "./upgrades";
import {
  accrue,
  accrueAway,
  createMountain,
  mineByHand,
  minedOut,
  type Mountain,
} from "./mountain";
import { TIERS, owned, tierById, tierCost, tierShown } from "./tiers";

/** How a typical dad plays: see docs/DESIGN.md "Pacing". */
const DAD = {
  sessionsPerDay: 2,
  sessionSeconds: 10 * 60,
  tapsPerSecond: 3,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

type Pick = {
  readonly buy: (mountain: Mountain) => Mountain;
  readonly cost: number;
  readonly value: number;
};

/** Stones a day one more stone a second of crew speed earns, live plus away. */
const CREW_DAY_SECONDS =
  DAD.sessionsPerDay *
  (DAD.sessionSeconds + (AWAY_CAP_MS / 1000) * AWAY_PAY_RATE);
/** Taps only pay while playing. */
const TAP_DAY_SECONDS = DAD.sessionsPerDay * DAD.sessionSeconds;

/** The buy giving the most stones a day per stone spent, among what's on offer. */
function bestValue(
  mountain: Mountain,
  withUpgrades: boolean,
): Pick | undefined {
  let best: Pick | undefined;
  const consider = (pick: Pick) => {
    if (best === undefined || pick.value > best.value) {
      best = pick;
    }
  };
  for (const tier of TIERS) {
    if (!tierShown(mountain, tier) || tierLocked(mountain, tier)) {
      continue;
    }
    const cost = tierCost(tier, owned(mountain, tier));
    consider({
      buy: (current) => buyCrew(current, tier.id),
      cost,
      value: (tier.perSecond * CREW_DAY_SECONDS) / cost,
    });
  }
  if (withUpgrades) {
    const cost = upgradeCost(upgradeById("tap"), upgradeLevel(mountain, "tap"));
    if (cost !== undefined) {
      const extraPerTap =
        effectiveRates(mountain).crewPerSecond * TAP_SHARE_PER_LEVEL;
      consider({
        buy: (current) => buyUpgrade(current, "tap"),
        cost,
        value: (extraPerTap * DAD.tapsPerSecond * TAP_DAY_SECONDS) / cost,
      });
    }
    const rates = effectiveRates(mountain);
    const oneShot = (id: "boots" | "steady", stonesPerDay: number): void => {
      const upgrade = upgradeById(id);
      const price = upgradeCost(upgrade, upgradeLevel(mountain, id));
      if (price !== undefined && upgradeUnlocked(mountain, upgrade)) {
        consider({
          buy: (current) => buyUpgrade(current, id),
          cost: price,
          value: stonesPerDay / price,
        });
      }
    };
    oneShot(
      "boots",
      owned(mountain, tierById("helper")) *
        rates.tierSpeed.helper *
        BOOTS_SPEED_PER_LEVEL *
        CREW_DAY_SECONDS,
    );
    oneShot(
      "steady",
      rates.crewPerSecond *
        AWAY_PAY_RATE *
        STEADY_AWAY_PER_LEVEL *
        DAD.sessionsPerDay *
        (AWAY_CAP_MS / 1000),
    );
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
  buysUpgrades = false,
}: {
  /** Also weighs Strong arms, Better boots and Steady hands against crew, by stones a day per stone. */
  buysUpgrades?: boolean;
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
        let pick = bestValue(mountain, buysUpgrades);
        pick !== undefined && pick.cost <= mountain.pocket;
        pick = bestValue(mountain, buysUpgrades)
      ) {
        mountain = pick.buy(mountain);
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
