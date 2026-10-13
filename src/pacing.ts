import { BOOSTS, buyBoost } from "./boosts";
import {
  promote,
  promoteCost,
  staffForBuy,
  staffNeeded,
  tendBestTier,
} from "./engineers";
import {
  send,
  settle as settleExpeditions,
  type TunnelId,
} from "./expeditions";
import {
  applyAction,
  listActions,
  valueOf,
  type Action,
  type ValueContext,
} from "./economy/actions";
import { createWorld, step, type World } from "./lab/world";
import {
  createMountain,
  mineByHand,
  minedOut,
  type Mountain,
} from "./mountain";
import { effectiveRates } from "./rates";
import { TIERS, owned, tierById, tierCost } from "./tiers";
import { upgradeById, upgradeCost, upgradeLevel } from "./upgrades";

/** How a typical dad plays: see docs/DESIGN.md "Pacing". */
const DAD = {
  sessionsPerDay: 2,
  sessionSeconds: 10 * 60,
  tapsPerSecond: 3,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const GAP_MS = DAY_MS / DAD.sessionsPerDay - DAD.sessionSeconds * 1000;

/**
 * The same day the sim plays, handed to `valueOf`. Stones a day per stone
 * is this schedule's gain per second divided by the move's cost.
 */
const DAD_SCHEDULE: ValueContext = {
  tapsPerSecond: DAD.tapsPerSecond,
  liveSeconds: DAD.sessionSeconds,
  awaySeconds: GAP_MS / 1000,
};

/**
 * Permanent buys. A non-positive horizon asks `valueOf` for the gain while
 * the move lasts, which is the whole schedule for these.
 */
const PERMANENT_HORIZON_SEC = 0;

/** The sim dad puts trouble right within three seconds. */
const SIM_FIX_MS = 3_000;

/**
 * Nils, the moment the pocket can pay the same promotion a player would.
 * Ada is already tending. He waits at camp. One try a second.
 */
function promoteScout(mountain: Mountain): Mountain {
  const engineers = mountain.engineers;
  if (
    engineers === undefined ||
    engineers.length !== 1 ||
    mountain.borers < 1
  ) {
    return mountain;
  }
  return promote(mountain);
}

/**
 * Engineers who are not tending a machine. Ada stays on the borers, then
 * the Great Machine. The others walk the tunnels.
 */
function sendScouts(
  mountain: Mountain,
  now: number,
  tunnel: TunnelId,
): Mountain {
  const engineers = mountain.engineers ?? [];
  let next = mountain;
  for (const [index, engineer] of engineers.entries()) {
    if (
      engineer.post === "tunnel" ||
      engineer.post === "cart" ||
      engineer.post === "drill" ||
      engineer.post === "borer" ||
      engineer.post === "machine"
    ) {
      continue;
    }
    if (tunnel === "deep-dark" && engineer.rank < 1) {
      continue;
    }
    next = send(next, index, tunnel, now);
  }
  return next;
}

type DadBuy = Extract<Action, { kind: "buyTier" | "buyUpgrade" }>;

type Pick = {
  readonly action: DadBuy;
  /** What the pocket pays. A machine's workers are not in this price. */
  readonly cost: number;
  /** Gain per second from `valueOf`, per stone of its full cost. */
  readonly value: number;
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

/** One promotion the sim dad paid, on a 1-based fractional day. */
type DadPromotion = {
  readonly day: number;
  readonly name: string;
  readonly price: number;
  readonly helpersBefore: number;
  readonly helpersAfter: number;
  /** Pocket the second he paid, before the price came out, and after. */
  readonly pocketBefore: number;
  readonly pocketAfter: number;
};

export type DadRun = {
  readonly reached: Map<number, number>;
  readonly mountain: Mountain;
  readonly buys: readonly DadPurchase[];
  readonly promotions: readonly DadPromotion[];
};

/** True when `candidate` is higher by more than float noise. */
const TIE = 1e-9;

function outranks(candidate: number, current: number): boolean {
  const scale = Math.max(Math.abs(candidate), Math.abs(current), 1);
  return (candidate - current) / scale > TIE;
}

function isDadBuy(action: Action, withUpgrades: boolean): action is DadBuy {
  return (
    action.kind === "buyTier" || (withUpgrades && action.kind === "buyUpgrade")
  );
}

/**
 * Sticker price. `valueOf`'s cost also counts workers a machine still needs.
 * A listed upgrade still has a level to buy, so the price is present.
 */
function sticker(mountain: Mountain, action: DadBuy): number {
  if (action.kind === "buyTier") {
    const tier = tierById(action.id);
    return tierCost(tier, owned(mountain, tier));
  }
  return upgradeCost(
    upgradeById(action.id),
    upgradeLevel(mountain, action.id),
  ) as number;
}

/**
 * The buy with the most gain per stone, from the catalogue. Crew is always
 * on offer. Lasting upgrades are, when this dad buys them. Boosts, posts,
 * and promotions are decided elsewhere.
 */
function bestValue(
  mountain: Mountain,
  now: number,
  withUpgrades: boolean,
): Pick | undefined {
  let best: Pick | undefined;
  for (const action of listActions(mountain, now)) {
    if (!isDadBuy(action, withUpgrades)) {
      continue;
    }
    const cost = sticker(mountain, action);
    const priced = valueOf(
      mountain,
      action,
      PERMANENT_HORIZON_SEC,
      DAD_SCHEDULE,
    );
    const value = priced.gainPerSec / priced.cost;
    // Unrounded gains leave a true tie a few ulps apart. The earlier offer
    // wins, matching the catalogue order.
    if (best === undefined || outranks(value, best.value)) {
      best = { action, cost, value };
    }
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
  const promotions: DadPromotion[] = [];
  let world: World = createWorld(
    1,
    legacy > 0 ? { ...createMountain(), legacy } : createMountain(),
  );
  const note = () => {
    for (const mark of milestones) {
      if (!reached.has(mark) && minedOut(world.mountain) >= mark) {
        reached.set(mark, world.clock / DAY_MS + 1);
      }
    }
  };
  for (let session = 0; session < maxDays * DAD.sessionsPerDay; session += 1) {
    for (let second = 0; second < DAD.sessionSeconds; second += 1) {
      const trouble =
        world.hazards.phase === "trouble" ? world.hazards.trouble : undefined;
      if (buysBoosts) {
        let mountain = world.mountain;
        for (const boost of BOOSTS) {
          mountain = buyBoost({
            mountain,
            id: boost.id,
            now: world.clock,
            pricing: effectiveRates(mountain),
          });
        }
        world = { ...world, mountain };
      }
      world = { ...world, mountain: tendBestTier(world.mountain) };
      if (second === 0) {
        world = {
          ...world,
          mountain: sendScouts(world.mountain, world.clock, "old-shaft"),
        };
      }
      let tapped = world.mountain;
      for (let tap = 0; tap < DAD.tapsPerSecond; tap += 1) {
        tapped = mineByHand(tapped, world.clock, trouble);
      }
      world = step(
        { ...world, mountain: tapped },
        1_000,
        "live",
        fixesTrouble ? { playerFixMs: SIM_FIX_MS } : undefined,
      );
      for (
        let pick = bestValue(world.mountain, world.clock, buysUpgrades);
        pick !== undefined && pick.cost <= world.mountain.pocket;
        pick = bestValue(world.mountain, world.clock, buysUpgrades)
      ) {
        const mountain = world.mountain;
        const ratesNow = effectiveRates(mountain);
        const spare =
          mountain.helpers +
          mountain.kids -
          TIERS.reduce(
            (used, tier) =>
              used + ratesNow.running[tier.id] * staffNeeded(mountain, tier),
            0,
          );
        const tier =
          pick.action.kind === "buyTier" ? tierById(pick.action.id) : undefined;
        const short =
          tier === undefined || tier.staff === 0
            ? 0
            : Math.max(0, staffForBuy(mountain, tier) - spare);
        let shortCost = 0;
        for (let extra = 0; extra < short; extra += 1) {
          shortCost += tierCost(tierById("helper"), mountain.helpers + extra);
        }
        let next = applyAction(mountain, pick.action, world.clock);
        if (tier !== undefined && tier.staff > 0) {
          next = tendBestTier(next);
        }
        world = { ...world, mountain: next };
        buys.push({
          day: world.clock / DAY_MS + 1,
          id: pick.action.id,
          count: tier === undefined ? 0 : owned(world.mountain, tier),
          price: pick.cost,
          spare,
          short,
          shortCost,
        });
      }
      const beforeScout = world.mountain;
      const promoted = promoteScout(beforeScout);
      world = { ...world, mountain: promoted };
      const hired = promoted.engineers?.[beforeScout.engineers?.length ?? 0];
      if (hired !== undefined) {
        promotions.push({
          day: world.clock / DAY_MS + 1,
          name: hired.name,
          price: promoteCost(beforeScout),
          helpersBefore: beforeScout.helpers,
          helpersAfter: promoted.helpers,
          pocketBefore: beforeScout.pocket,
          pocketAfter: promoted.pocket,
        });
      }
      note();
    }
    const gapEnd = world.clock + GAP_MS;
    // Each night the old shaft comes home, then a journeyman walks the deep dark.
    // One away payment for the whole gap, so the cap is not paid twice.
    if (session % 2 === 1) {
      const due = (world.mountain.expeditions ?? [])
        .map((trip) => trip.returnsAt)
        .filter((returnsAt) => returnsAt > world.clock && returnsAt < gapEnd);
      const back = due.length === 0 ? world.clock : Math.min(...due);
      if (back > world.clock) {
        world = {
          ...world,
          mountain: settleExpeditions(world.mountain, back).mountain,
        };
      }
      world = {
        ...world,
        mountain: sendScouts(world.mountain, back, "deep-dark"),
      };
    }
    world = step(world, GAP_MS, "away");
    note();
    if (world.mountain.remaining === 0) {
      break;
    }
  }
  return { reached, mountain: world.mountain, buys, promotions };
}
