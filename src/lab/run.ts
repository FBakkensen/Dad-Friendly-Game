import { BOOSTS, buyBoost } from "../boosts";
import { applyAction, type Action } from "../economy/actions";
import {
  promote,
  promoteCost,
  tendBestTier,
  type EngineerPost,
} from "../engineers";
import { send, settle, TUNNELS, type TunnelId } from "../expeditions";
import { mineByHand, type Mountain } from "../mountain";
import { effectiveRates } from "../rates";
import { tierById } from "../tiers";
import { createWorld, step, type World } from "./world";
import { canPay, sendWorthIt, sticker } from "./decide";
import {
  dayTunnel,
  fixDelayMs,
  isNightGap,
  nightTunnel,
  type Policy,
  type PolicyParams,
} from "./policy";
import {
  DAY_MS,
  DEFAULT_MAX_DAYS,
  MS_PER_SECOND,
  SAMPLE_INTERVAL_SEC,
} from "./targets";

type PolicyPurchase = {
  readonly day: number;
  readonly id: string;
  readonly price: number;
};

type PolicyPromotion = {
  readonly day: number;
  readonly name: string;
  readonly price: number;
};

export type PolicyRun = {
  readonly finishDay: number | undefined;
  readonly buys: readonly PolicyPurchase[];
  readonly promotions: readonly PolicyPromotion[];
  readonly world: World;
};

export type RunOptions = {
  readonly policy: Policy;
  readonly seed: number;
  readonly maxDays?: number;
  /** Stop after this many live seconds. The gap after them is not played. */
  readonly maxLiveSeconds?: number;
  readonly mountain?: Mountain;
  /** Called at the end of each live second, after buys and promotions. */
  readonly observe?: (world: World) => void;
  /** Stop after the second or gap where this becomes true. */
  readonly until?: (world: World) => boolean;
};

/**
 * Plays one policy on the shared clock. Live seconds tick, tap, buy, and
 * promote. The gap pays away time. The same seed replays the same run.
 */
export function runPolicy(options: RunOptions): PolicyRun {
  const { policy, seed } = options;
  const params = policy.params;
  const maxDays = options.maxDays ?? DEFAULT_MAX_DAYS;
  let world = createWorld(seed, options.mountain);
  const buys: PolicyPurchase[] = [];
  const promotions: PolicyPromotion[] = [];
  let finishDay: number | undefined;
  let live = 0;
  const note = () => {
    if (finishDay === undefined && world.mountain.remaining === 0) {
      finishDay = world.clock / DAY_MS + 1;
    }
  };
  const stop = (): boolean => {
    options.observe?.(world);
    return options.until?.(world) === true;
  };

  for (
    let session = 0;
    session < maxDays * params.sessionsPerDay;
    session += 1
  ) {
    const seconds = params.minutesPerSession * SAMPLE_INTERVAL_SEC;
    for (let second = 0; second < seconds; second += 1) {
      if (
        options.maxLiveSeconds !== undefined &&
        live >= options.maxLiveSeconds
      ) {
        return { finishDay, buys, promotions, world };
      }
      world = playSecond(world, policy, second, buys, promotions);
      live += 1;
      note();
      if (stop()) {
        return { finishDay, buys, promotions, world };
      }
    }
    if (
      options.maxLiveSeconds !== undefined &&
      live >= options.maxLiveSeconds
    ) {
      return { finishDay, buys, promotions, world };
    }
    world = playGap(world, policy, session, seed);
    note();
    const emptied = world.mountain.remaining === 0;
    if (stop() || emptied) {
      break;
    }
  }
  return { finishDay, buys, promotions, world };
}

/**
 * Promotes while the habit is asap, the borer brought Ada, and the cap
 * is still open. One scout is Nils. The whole crew is the cap at four.
 */
export function promoteAsap(
  mountain: Mountain,
  params: PolicyParams,
): { readonly mountain: Mountain; readonly hired: readonly Hired[] } {
  if (params.promote !== "asap") {
    return { mountain, hired: [] };
  }
  const hired: Hired[] = [];
  let next = mountain;
  const limit = 1 + params.promoteCap;
  while ((next.engineers?.length ?? 0) < limit) {
    const count = next.engineers?.length ?? 0;
    if (count < 1 || next.borers < 1) {
      break;
    }
    const price = promoteCost(next);
    const promoted = promote(next);
    if (promoted === next) {
      break;
    }
    const engineer = promoted.engineers?.[count];
    if (engineer !== undefined) {
      hired.push({ name: engineer.name, price });
    }
    next = promoted;
  }
  return { mountain: next, hired };
}

type Hired = {
  readonly name: string;
  readonly price: number;
};

function playSecond(
  world: World,
  policy: Policy,
  second: number,
  buys: PolicyPurchase[],
  promotions: PolicyPromotion[],
): World {
  const params = policy.params;
  let mountain = world.mountain;
  if (params.boosts === "always") {
    for (const boost of BOOSTS) {
      mountain = buyBoost({
        mountain,
        id: boost.id,
        now: world.clock,
        pricing: effectiveRates(mountain),
      });
    }
  }
  if (params.tend === "best") {
    mountain = tendBestTier(mountain);
  }
  if (second === 0 && params.explore !== "never") {
    mountain = sendExplorers(
      mountain,
      world.clock,
      dayTunnel(params.tunnel),
      params,
    );
  }
  const trouble =
    world.hazards.phase === "trouble" ? world.hazards.trouble : undefined;
  for (let tap = 0; tap < params.tapsPerSecond; tap += 1) {
    mountain = mineByHand(mountain, world.clock, trouble);
  }
  const fix = fixDelayMs(params.trouble);
  world = step(
    { ...world, mountain },
    MS_PER_SECOND,
    "live",
    fix === undefined ? undefined : { playerFixMs: fix },
  );
  for (
    let action = policy.decide({
      mountain: world.mountain,
      now: world.clock,
      params,
    });
    action !== undefined && canPay(world.mountain, action, params.hoardK);
    action = policy.decide({
      mountain: world.mountain,
      now: world.clock,
      params,
    })
  ) {
    const before = world.mountain;
    let next = applyAction(before, action, world.clock);
    if (next === before) {
      break;
    }
    if (
      params.tend === "best" &&
      action.kind === "buyTier" &&
      tierById(action.id).staff > 0
    ) {
      next = tendBestTier(next);
    }
    remember(world, before, action, next, buys, promotions);
    world = { ...world, mountain: next };
  }
  const scouted = promoteAsap(world.mountain, params);
  const day = world.clock / DAY_MS + 1;
  for (const hire of scouted.hired) {
    promotions.push({ day, name: hire.name, price: hire.price });
  }
  return { ...world, mountain: scouted.mountain };
}

function playGap(
  world: World,
  policy: Policy,
  session: number,
  seed: number,
): World {
  const params = policy.params;
  const gap = policy.schedule.gapMs(session, seed);
  if (
    params.explore !== "never" &&
    isNightGap(session, params.sessionsPerDay)
  ) {
    const gapEnd = world.clock + gap;
    const due = (world.mountain.expeditions ?? [])
      .map((trip) => trip.returnsAt)
      .filter((returnsAt) => returnsAt > world.clock && returnsAt < gapEnd);
    const back = due.length === 0 ? world.clock : Math.min(...due);
    let mountain = world.mountain;
    if (back > world.clock) {
      mountain = settle(mountain, back).mountain;
    }
    mountain = sendExplorers(
      mountain,
      back,
      nightTunnel(params.tunnel),
      params,
    );
    world = { ...world, mountain };
  }
  return step(world, gap, "away");
}

function sendExplorers(
  mountain: Mountain,
  now: number,
  tunnel: TunnelId,
  params: PolicyParams,
): Mountain {
  const spec = TUNNELS.find((item) => item.id === tunnel);
  // Tunnel ids are the closed TUNNELS list, so the find hits.
  /* v8 ignore next 3 -- unreachable for a TunnelId */
  if (spec === undefined) {
    return mountain;
  }
  let next = mountain;
  for (const [index, engineer] of (mountain.engineers ?? []).entries()) {
    if (keepsPost(engineer.post) || engineer.rank < spec.minRank) {
      continue;
    }
    if (
      params.explore === "on-value" &&
      !sendWorthIt(next, index, tunnel, params)
    ) {
      continue;
    }
    next = send(next, index, tunnel, now);
  }
  return next;
}

/** Tending and travelling engineers stay. Camp is free to walk. */
function keepsPost(post: EngineerPost): boolean {
  return (
    post === "tunnel" ||
    post === "cart" ||
    post === "drill" ||
    post === "borer" ||
    post === "machine"
  );
}

function remember(
  world: World,
  before: Mountain,
  action: Action,
  after: Mountain,
  buys: PolicyPurchase[],
  promotions: PolicyPromotion[],
): void {
  const day = world.clock / DAY_MS + 1;
  if (action.kind === "buyTier" || action.kind === "buyUpgrade") {
    buys.push({
      day,
      id: action.id,
      price: sticker(before, action),
    });
    return;
  }
  if (action.kind !== "promote") {
    return;
  }
  const hired = after.engineers?.[before.engineers?.length ?? 0];
  // apply no-ops when the hire does not happen, so this loop already stopped.
  /* v8 ignore next 3 -- promote added the engineer */
  if (hired === undefined) {
    return;
  }
  promotions.push({
    day,
    name: hired.name,
    price: sticker(before, action),
  });
}
