import { settle } from "../expeditions";
import {
  closeHazards,
  freshHazards,
  stepHazards,
  type HazardState,
} from "../hazards";
import { accrue, accrueAway, createMountain, type Mountain } from "../mountain";

/** Live play ticks the crew. Away time pays the cap and clears trouble. */
export type PlayMode = "live" | "away";

/**
 * One clock the pacing sim and the strategy lab share.
 * The seed rolls hazards. A find is fixed when its expedition leaves.
 */
export type World = {
  readonly mountain: Mountain;
  readonly hazards: HazardState;
  readonly clock: number;
};

/** A new run. `seed` is the first hazard roll. */
export function createWorld(
  seed: number,
  mountain: Mountain = createMountain(),
): World {
  return { mountain, hazards: freshHazards(seed), clock: 0 };
}

/**
 * Moves the clock by `ms`. Live play accrues, steps hazards, then brings
 * home any party whose return has passed. Away time pays the capped gap
 * (parties come home as they arrive) and clears trouble, the same as
 * closing the game. No time returns the same world.
 */
export function step(
  world: World,
  ms: number,
  mode: PlayMode,
  options?: { readonly playerFixMs?: number },
): World {
  if (!(ms > 0)) {
    return world;
  }
  if (mode === "away") {
    return stepAway(world, ms);
  }
  return stepLive(world, ms, options?.playerFixMs);
}

function stepLive(
  world: World,
  ms: number,
  playerFixMs: number | undefined,
): World {
  const trouble =
    world.hazards.phase === "trouble" ? world.hazards.trouble : undefined;
  const accrued = accrue({
    mountain: world.mountain,
    from: world.clock,
    to: world.clock + ms,
    live: true,
    ...(trouble === undefined ? {} : { trouble }),
  });
  const clock = world.clock + ms;
  const hazards = stepHazards(world.hazards, {
    now: clock,
    liveMs: ms,
    mountain: accrued.mountain,
    ...(playerFixMs === undefined ? {} : { playerFixMs }),
  });
  return {
    mountain: settle(accrued.mountain, clock).mountain,
    hazards,
    clock,
  };
}

function stepAway(world: World, ms: number): World {
  const clock = world.clock + ms;
  const accrued = accrueAway({
    mountain: world.mountain,
    lastSeen: world.clock,
    now: clock,
  });
  // Away pay already walks parties home. Settle again so a return exactly
  // at this clock is home even if that walk changes.
  const mountain = settle(accrued.mountain, clock).mountain;
  return {
    mountain,
    hazards: closeHazards(world.hazards, mountain),
    clock,
  };
}
