import { freshHazards, type HazardState } from "../hazards";
import { freshMineOn } from "../line-switch";
import { createMountain, type Mountain, type NightReport } from "../mountain";
import { advance } from "../session-time";

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
  /** A fresh mine's last step, when it was time away: how long, and how the night went (#667). */
  readonly night?: { readonly awayMs: number; readonly report: NightReport };
};

/**
 * A lab run of today's mountain starts with one worker (#728): the dig that
 * bought the first one is gone, and a mountain with nobody never starts. A
 * fresh mine already starts with its worker (rule 2.10).
 */
export function withFirstWorker(mountain: Mountain): Mountain {
  return freshMineOn() || mountain.owned.helper > 0
    ? mountain
    : { ...mountain, owned: { ...mountain.owned, helper: 1 } };
}

/** A new run. `seed` is the first hazard roll. */
export function createWorld(
  seed: number,
  mountain: Mountain = withFirstWorker(createMountain()),
): World {
  return { mountain, hazards: freshHazards(seed), clock: 0 };
}

/**
 * Moves the clock by `ms` through the game's own time step (`advance`), so
 * the lab plays the same order as the game: parties due come home, the crew
 * is paid, then the hazards step. Away time pays the capped gap and clears
 * trouble, the same as closing the game. No time returns the same world.
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
  const clock = world.clock + ms;
  const playerFixMs = options?.playerFixMs;
  const next = advance(
    world,
    mode === "away"
      ? { kind: "away", from: world.clock, to: clock }
      : {
          kind: "live",
          from: world.clock,
          to: clock,
          ...(playerFixMs === undefined ? {} : { playerFixMs }),
        },
  );
  const away = next.away;
  const night =
    away?.night === undefined
      ? undefined
      : { awayMs: away.awayMs, report: away.night };
  return {
    mountain: next.mountain,
    hazards: next.hazards,
    clock,
    ...(night === undefined ? {} : { night }),
  };
}
