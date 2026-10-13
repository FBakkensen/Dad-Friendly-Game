import { BOOSTS, buyBoost } from "./boosts";
import { buyCrew, tierLocked } from "./crew";
import { staffForBuy, staffNeeded, tendBestTier } from "./engineers";
import { closeHazards, freshHazards, stepHazards } from "./hazards";
import { AWAY_PAY_RATE, effectiveRates, BASE_AWAY_CAP_MS } from "./rates";
import {
  BOOTS_SPEED_PER_LEVEL,
  STEADY_AWAY_PER_LEVEL,
  SYNERGY_PER_UNIT,
  UPGRADES,
  type UpgradeId,
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

/** The sim dad puts trouble right within three seconds. */
const SIM_FIX_MS = 3_000;

const DAY_MS = 24 * 60 * 60 * 1000;

type Pick = {
  readonly buy: (mountain: Mountain) => Mountain;
  readonly cost: number;
  readonly value: number;
  readonly id: string;
};

/** One thing the sim dad bought, on a 1-based fractional day. */
type DadPurchase = {
  readonly day: number;
  readonly id: string;
  /** Owned after the buy; 0 for an upgrade. */
  readonly count: number;
  readonly price: number;
  /** Workers free before the buy. */
  readonly spare: number;
  /** Workers still to hire so this machine can run, and what they cost. */
  readonly short: number;
  readonly shortCost: number;
};

export type DadRun = {
  readonly reached: Map<number, number>;
  readonly mountain: Mountain;
  readonly buys: readonly DadPurchase[];
};

/** Stones a day one more stone a second of crew speed earns, live plus away. */
const CREW_DAY_SECONDS =
  DAD.sessionsPerDay *
  (DAD.sessionSeconds + (BASE_AWAY_CAP_MS / 1000) * AWAY_PAY_RATE);
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
  const rates = effectiveRates(mountain);
  const helper = tierById("helper");
  const freeHelpers =
    mountain.helpers +
    mountain.kids -
    TIERS.reduce(
      (used, tier) =>
        used + rates.running[tier.id] * staffNeeded(mountain, tier),
      0,
    );
  for (const tier of TIERS) {
    if (!tierShown(mountain, tier) || tierLocked(mountain, tier)) {
      continue;
    }
    const cost = tierCost(tier, owned(mountain, tier));
    if (tier.staff === 0) {
      // A helper is worth its own stones plus any idle machine it starts.
      const gain =
        effectiveRates(buyCrew({ ...mountain, pocket: cost }, tier.id))
          .crewPerSecond - rates.crewPerSecond;
      consider({
        buy: (current) => buyCrew(current, tier.id),
        cost,
        value: (gain * CREW_DAY_SECONDS) / cost,
        id: tier.id,
      });
      continue;
    }
    // A machine is weighed with the helpers it still needs, bought next.
    // A Great Machine counts the tended crew, because buying one posts the engineer.
    const staff = staffForBuy(mountain, tier);
    const short = Math.max(0, staff - freeHelpers);
    let crewCost = 0;
    for (let extra = 0; extra < short; extra += 1) {
      crewCost += tierCost(helper, mountain.helpers + extra);
    }
    consider({
      buy: (current) => tendBestTier(buyCrew(current, tier.id)),
      cost,
      value: (rates.tierSpeed[tier.id] * CREW_DAY_SECONDS) / (cost + crewCost),
      id: tier.id,
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
        id: "tap",
      });
    }
    const rates = effectiveRates(mountain);
    const oneShot = (id: UpgradeId, stonesPerDay: number): void => {
      const upgrade = upgradeById(id);
      const price = upgradeCost(upgrade, upgradeLevel(mountain, id));
      if (price !== undefined && upgradeUnlocked(mountain, upgrade)) {
        consider({
          buy: (current) => buyUpgrade(current, id),
          cost: price,
          value: stonesPerDay / price,
          id,
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
    for (const upgrade of UPGRADES) {
      if (upgrade.synergy !== undefined) {
        const to = tierById(upgrade.synergy.to);
        oneShot(
          upgrade.id,
          owned(mountain, tierById(upgrade.synergy.from)) *
            SYNERGY_PER_UNIT *
            owned(mountain, to) *
            to.perSecond *
            CREW_DAY_SECONDS,
        );
      }
    }
    oneShot(
      "steady",
      rates.crewPerSecond *
        AWAY_PAY_RATE *
        STEADY_AWAY_PER_LEVEL *
        DAD.sessionsPerDay *
        (BASE_AWAY_CAP_MS / 1000),
    );
  }
  return best;
}

/** Milestone days only. `simulateDadRun` also returns the purchases. */
export function simulateDad(
  options: Parameters<typeof simulateDadRun>[0],
): Map<number, number> {
  return simulateDadRun(options).reached;
}

/**
 * Plays the game second by second through each session, and pays capped idle
 * time between them, until the mountain is empty or `maxDays` pass.
 * Returns the day (1-based, fractional) each stone count was first reached,
 * plus every purchase, so pacing tests can see a dead zone.
 */
export function simulateDadRun({
  milestones,
  maxDays = 30,
  buysUpgrades = false,
  buysBoosts = false,
  legacy = 0,
  fixesTrouble = true,
}: {
  /** Mountains already passed down: a second run starts with legacy 1. */
  legacy?: number;
  /**
   * Puts trouble right within three seconds. A never-fixing dad leaves it
   * until an engineer clears it, or the session ends.
   */
  fixesTrouble?: boolean;
  /** Also starts Sharper picks and Overtime whenever they're affordable and idle. */
  buysBoosts?: boolean;
  /** Also weighs Strong arms, Better boots and Steady hands against crew, by stones a day per stone. */
  buysUpgrades?: boolean;
  milestones: readonly number[];
  maxDays?: number;
}): DadRun {
  const reached = new Map<number, number>();
  const buys: DadPurchase[] = [];
  let mountain: Mountain =
    legacy > 0 ? { ...createMountain(), legacy } : createMountain();
  let hazards = freshHazards(1);
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
      const trouble = hazards.phase === "trouble" ? hazards.trouble : undefined;
      if (buysBoosts) {
        for (const boost of BOOSTS) {
          mountain = buyBoost({
            mountain,
            id: boost.id,
            now: clock,
            pricing: effectiveRates(mountain),
          });
        }
      }
      mountain = tendBestTier(mountain);
      for (let tap = 0; tap < DAD.tapsPerSecond; tap += 1) {
        mountain = mineByHand(mountain, clock, trouble);
      }
      mountain = accrue({
        mountain,
        from: clock,
        to: clock + 1000,
        live: true,
        ...(trouble === undefined ? {} : { trouble }),
      }).mountain;
      clock += 1000;
      hazards = stepHazards(hazards, {
        now: clock,
        liveMs: 1000,
        mountain,
        ...(fixesTrouble ? { playerFixMs: SIM_FIX_MS } : {}),
      });
      for (
        let pick = bestValue(mountain, buysUpgrades);
        pick !== undefined && pick.cost <= mountain.pocket;
        pick = bestValue(mountain, buysUpgrades)
      ) {
        const ratesNow = effectiveRates(mountain);
        const spare =
          mountain.helpers +
          mountain.kids -
          TIERS.reduce(
            (used, tier) =>
              used + ratesNow.running[tier.id] * staffNeeded(mountain, tier),
            0,
          );
        const tier = TIERS.find((candidate) => candidate.id === pick.id);
        const short =
          tier === undefined || tier.staff === 0
            ? 0
            : Math.max(0, staffForBuy(mountain, tier) - spare);
        let shortCost = 0;
        for (let extra = 0; extra < short; extra += 1) {
          shortCost += tierCost(tierById("helper"), mountain.helpers + extra);
        }
        mountain = pick.buy(mountain);
        buys.push({
          day: clock / DAY_MS + 1,
          id: pick.id,
          count: tier === undefined ? 0 : owned(mountain, tier),
          price: pick.cost,
          spare,
          short,
          shortCost,
        });
      }
      note();
    }
    mountain = accrueAway({
      mountain,
      lastSeen: clock,
      now: clock + gapMs,
    }).mountain;
    clock += gapMs;
    // Closing the game clears trouble. The gap itself is away, so it never counts.
    hazards = closeHazards(hazards, mountain);
    note();
    if (mountain.remaining === 0) {
      break;
    }
  }
  return { reached, mountain, buys };
}
