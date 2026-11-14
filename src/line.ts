import { factor } from "./economy/factors";
import type { MachineId, TierId } from "./tiers";

/**
 * The line (M15, spec `2026-11-14-line-works-village-design.md`, step 1):
 * rock goes through three stages, the face (dig), the haul (carry to the
 * shaft) and the lift (raise it). The line moves as fast as the level the
 * hands lift its lowest stage to. Off in play until #536.
 */
export type Stage = "face" | "haul" | "lift";

/** In the order rock goes through them. */
export const STAGES: readonly Stage[] = ["face", "haul", "lift"];

/** Every machine belongs to one stage. */
export const MACHINE_STAGE: Readonly<Record<MachineId, Stage>> = {
  cart: "haul",
  hoist: "lift",
  drill: "face",
  borer: "face",
  train: "haul",
  machine: "lift",
};

/** Stones a second each stage's running machines can move. */
export type StageSpeeds = Readonly<Record<Stage, number>>;

/**
 * The sweep factor that switches the line. A factor reads 1 when no sweep
 * runs, so 1 is off (play today) and a lab run sets it to 0 to play the line.
 */
export const LINE_OFF = "line.off";

/**
 * Machines are rated three times today's on the line, because a hand on one
 * job does three times his share (rule 3): so a first cart still adds 6 a
 * second to twelve workers (spec, Machines; #543).
 */
export const LINE_RATING = 3;

/** True when the crew moves what the line moves, not the sum of its parts. */
export function lineOn(): boolean {
  return factor(LINE_OFF) === 0;
}

/** A machine's rating on the line, times today's; the hands keep theirs. */
export function lineRating(tierId: TierId): number {
  return lineOn() && Object.hasOwn(MACHINE_STAGE, tierId) ? LINE_RATING : 1;
}

/** What each stage moves: running × speed over its machines. */
export function stageSpeeds(
  speed: Readonly<Record<TierId, number>>,
  running: Readonly<Record<TierId, number>>,
): StageSpeeds {
  const stages = { face: 0, haul: 0, lift: 0 };
  for (const [id, stage] of Object.entries(MACHINE_STAGE) as [
    MachineId,
    Stage,
  ][]) {
    stages[stage] += running[id] * speed[id];
  }
  return stages;
}

/**
 * The hands' stones a second: every worker and kid, including those who run
 * a machine, since they still lend their hands.
 */
export function handsSpeed(
  speed: Readonly<Record<TierId, number>>,
  running: Readonly<Record<TierId, number>>,
): number {
  return running.helper * speed.helper + running.kid * speed.kid;
}

/**
 * The line's speed: the largest T with Σ max(0, T − stage) ≤ jobs × hands.
 * A hand who moves 1 a second through the whole line does a third of his
 * time on each job, so on one job he does 3 a second. The hands go to the
 * lowest stage until it is level with the next, then to both, and so on.
 * More hands or a faster stage never lowers it.
 */
export function lineSpeed(stages: StageSpeeds, hands: number): number {
  const sorted = STAGES.map((stage) => stages[stage]).sort((a, b) => a - b);
  let filled = STAGES.length * Math.max(0, hands);
  let lifted = 0;
  for (const [at, speed] of sorted.entries()) {
    filled += speed;
    lifted = at + 1;
    if (filled / lifted <= (sorted[at + 1] ?? Infinity)) {
      break;
    }
  }
  return filled / lifted;
}

/** What a crew with these speeds and these running moves on the line. */
export function lineOf(
  speed: Readonly<Record<TierId, number>>,
  running: Readonly<Record<TierId, number>>,
): number {
  return lineSpeed(stageSpeeds(speed, running), handsSpeed(speed, running));
}

/** The narrow stage: the one that moves the least (the first in rock order on a tie). */
export function narrowStage(stages: StageSpeeds): Stage {
  let narrow: Stage = "face";
  for (const stage of STAGES) {
    if (stages[stage] < stages[narrow]) {
      narrow = stage;
    }
  }
  return narrow;
}

/** What the lab reads off the line at one moment (#534). */
export type LineView = {
  readonly narrow: Stage;
  /** Share of the line's speed that the hands carry on the narrow stage. */
  readonly handsCarry: number;
};

export function lineView(
  speed: Readonly<Record<TierId, number>>,
  running: Readonly<Record<TierId, number>>,
): LineView {
  const stages = stageSpeeds(speed, running);
  const narrow = narrowStage(stages);
  const level = lineOf(speed, running);
  return {
    narrow,
    handsCarry: level > 0 ? Math.max(0, level - stages[narrow]) / level : 0,
  };
}
