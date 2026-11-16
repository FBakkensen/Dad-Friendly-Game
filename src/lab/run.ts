import type { Action } from "../economy/actions";
import type { Mountain } from "../mountain";
import { nextBuilding } from "../city";
import { createWorld, step, type World } from "./world";
import { sticker } from "./decide";
import { playFresh } from "./fresh-dad";
import { fixDelayMs, type Policy, type PolicyParams } from "./policy";
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

export type PolicyRun = {
  readonly finishDay: number | undefined;
  readonly buys: readonly PolicyPurchase[];
  readonly world: World;
};

export type RunOptions = {
  readonly policy: Policy;
  readonly seed: number;
  readonly maxDays?: number;
  /** Stop after this many live seconds. The gap after them is not played. */
  readonly maxLiveSeconds?: number;
  readonly mountain?: Mountain;
  /** Called at the end of each live second, after the dad's moves. */
  readonly observe?: (world: World) => void;
  /** Stop after the second or gap where this becomes true. */
  readonly until?: (world: World) => boolean;
};

/**
 * Plays one policy on the shared clock. Live seconds tick and the dad
 * plays his plans. The gap pays away time. The same seed replays the same
 * run.
 */
export function runPolicy(options: RunOptions): PolicyRun {
  const { policy, seed } = options;
  const params = policy.params;
  const maxDays = options.maxDays ?? DEFAULT_MAX_DAYS;
  let world = createWorld(seed, options.mountain);
  const buys: PolicyPurchase[] = [];
  let finishDay: number | undefined;
  let live = 0;
  const note = () => {
    if (finishDay === undefined && runDone(world.mountain)) {
      finishDay = world.clock / DAY_MS + 1;
    }
  };
  const stop = (): boolean => {
    options.observe?.(world);
    return options.until?.(world) === true;
  };
  const spent = (): boolean =>
    options.maxLiveSeconds !== undefined && live >= options.maxLiveSeconds;

  for (
    let session = 0;
    session < maxDays * params.sessionsPerDay;
    session += 1
  ) {
    const seconds = params.minutesPerSession * SAMPLE_INTERVAL_SEC;
    for (let second = 0; second < seconds; second += 1) {
      if (spent()) {
        return { finishDay, buys, world };
      }
      world = playSecond(world, policy, buys);
      live += 1;
      note();
      if (stop()) {
        return { finishDay, buys, world };
      }
    }
    if (spent()) {
      return { finishDay, buys, world };
    }
    world = step(world, policy.schedule.gapMs(session, seed), "away");
    note();
    if (stop() || runDone(world.mountain)) {
      break;
    }
  }
  return { finishDay, buys, world };
}

/**
 * The run's end: the last building built so far is operational (slice 1,
 * Lab: the Warehouse's roof with part 2 on).
 */
export function runDone(mountain: Mountain): boolean {
  return nextBuilding(mountain) === undefined;
}

/** One live second of the mine, with the dad's way of fixing trouble. */
function liveSecond(world: World, params: PolicyParams): World {
  const fix = fixDelayMs(params.trouble);
  return step(
    world,
    MS_PER_SECOND,
    "live",
    fix === undefined ? undefined : { playerFixMs: fix },
  );
}

/** The moves that spend stones, which the run records with their price. */
const BUY_KINDS: ReadonlySet<Action["kind"]> = new Set([
  "buyTier",
  "buyUpgrade",
  "buyVehicle",
  "buyMaker",
]);

type Buy = Extract<
  Action,
  { kind: "buyTier" | "buyUpgrade" | "buyVehicle" | "buyMaker" }
>;

function isBuy(action: Action): action is Buy {
  return BUY_KINDS.has(action.kind);
}

/**
 * A second in a fresh mine (#655): the mine works, then the dad plays his
 * plans. No engineers or tunnels: the fresh mine has none.
 */
function playSecond(
  world: World,
  policy: Policy,
  buys: PolicyPurchase[],
): World {
  const worked = liveSecond(world, policy.params);
  const day = worked.clock / DAY_MS + 1;
  const played = playFresh(
    worked.mountain,
    worked.clock,
    policy.fresh,
    policy.params.hoardK,
    (before, action) => {
      if (isBuy(action)) {
        buys.push({ day, id: action.id, price: sticker(before, action) });
      }
    },
  );
  return { ...worked, mountain: played };
}
