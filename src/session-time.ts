/**
 * The one time step the game and the lab share: a mountain and its hazards
 * moved through live play, time away, or a clock that went back. Pure.
 */
import { settle as settleExpeditions, type Homecoming } from "./expeditions";
import { closeHazards, stepHazards, type HazardState } from "./hazards";
import { accrue, accrueAway, type AwayReport, type Mountain } from "./mountain";

/** Longer than this between ticks and the game was not on screen. */
export const LIVE_GAP_MS = 10 * 1000;

/** What a stretch of time was: play on screen, a closed game, or a clock set back. */
export type TimeInput =
  | {
      readonly kind: "live";
      readonly from: number;
      readonly to: number;
      /** The lab's player fixes trouble by hand after this long. */
      readonly playerFixMs?: number;
    }
  | { readonly kind: "away"; readonly from: number; readonly to: number }
  | { readonly kind: "clock-back"; readonly to: number };

/** The parts of the world that time moves. */
export type Timed = {
  readonly mountain: Mountain;
  readonly hazards: HazardState;
};

export type Advanced = Timed & {
  /** The moment the crew is paid up to. */
  readonly settledAt: number;
  readonly mined: number;
  readonly homecomings: readonly Homecoming[];
  /** What the time away paid; set only for away time. */
  readonly away: AwayReport | undefined;
};

/**
 * Ticks come every second while the game is on screen. A longer gap means
 * the app sat in the background: that is time away, paid like it. A clock
 * that went back (a time zone fix, a manual change) pays nothing.
 */
export function timeInput(
  lastSeen: number | undefined,
  now: number,
): TimeInput {
  if (lastSeen !== undefined && now < lastSeen) {
    return { kind: "clock-back", to: now };
  }
  if (lastSeen !== undefined && now - lastSeen > LIVE_GAP_MS) {
    return { kind: "away", from: lastSeen, to: now };
  }
  return { kind: "live", from: lastSeen ?? now, to: now };
}

/**
 * Moves the world through one stretch of time. Live play brings home any
 * party due by the end of the stretch, pays the crew with the trouble that
 * is up, then steps the hazards. Away time pays the capped gap (parties come
 * home as they arrive) and clears trouble, the same as closing the game.
 */
export function advance(world: Timed, input: TimeInput): Advanced {
  switch (input.kind) {
    case "live":
      return advanceLive(world, input);
    case "away":
      return advanceAway(world, input.from, input.to);
    case "clock-back": {
      // Same rule as lastSeen: a departure still in the future moves to now.
      const settled = settleExpeditions(world.mountain, input.to);
      return {
        mountain: settled.mountain,
        hazards: world.hazards,
        settledAt: input.to,
        mined: 0,
        homecomings: settled.homecomings,
        away: undefined,
      };
    }
  }
}

function advanceLive(
  world: Timed,
  input: Extract<TimeInput, { kind: "live" }>,
): Advanced {
  // A live gap is short, so coming home at the end of it pays that short
  // stretch with the bonus. Away time splits exactly.
  const settled = settleExpeditions(world.mountain, input.to);
  const trouble =
    world.hazards.phase === "trouble" ? world.hazards.trouble : undefined;
  const result = accrue({
    mountain: settled.mountain,
    from: input.from,
    to: input.to,
    live: true,
    ...(trouble === undefined ? {} : { trouble }),
  });
  const hazards = stepHazards(world.hazards, {
    now: input.to,
    liveMs: Math.max(0, input.to - input.from),
    mountain: result.mountain,
    ...(input.playerFixMs === undefined
      ? {}
      : { playerFixMs: input.playerFixMs }),
  });
  return {
    mountain: result.mountain,
    hazards,
    settledAt: result.settledAt,
    mined: result.mined,
    homecomings: settled.homecomings,
    away: undefined,
  };
}

function advanceAway(world: Timed, from: number, to: number): Advanced {
  const result = accrueAway({
    mountain: world.mountain,
    lastSeen: from,
    now: to,
  });
  return {
    mountain: result.mountain,
    // Away is rest. Trouble ends, and the time away does not count toward the next one.
    hazards: closeHazards(world.hazards, result.mountain),
    settledAt: result.settledAt,
    mined: result.mined,
    homecomings: result.homecomings,
    away: result.report,
  };
}
