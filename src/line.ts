import { freshMineOn, lineOn } from "./line-switch";
import { MACHINE_IDS, tierById, type MachineId, type TierId } from "./tiers";

/**
 * The line (M15, spec `2026-11-14-line-works-village-design.md`, step 1):
 * rock goes through three stages, the face (dig), the haul (carry to the
 * shaft) and the lift (raise it). The line moves as fast as the level the
 * hands lift its lowest stage to. Off in play until #536.
 */
export type Stage = "face" | "haul" | "lift";

/** In the order rock goes through them. */
export const STAGES: readonly Stage[] = ["face", "haul", "lift"];

/** Every machine's stage, read from its row of the tier table (#559). */
const MACHINE_STAGES: readonly (readonly [MachineId, Stage])[] =
  MACHINE_IDS.map((id) => [id, machineStage(id)]);

/** The same, as a record for the staffing search's hot loops. */
export const MACHINE_STAGE: Readonly<Record<MachineId, Stage>> =
  Object.fromEntries(MACHINE_STAGES) as Record<MachineId, Stage>;

function machineStage(id: MachineId): Stage {
  const stage = tierById(id).stage;
  if (stage === undefined) {
    throw new Error(`Machine ${id} has no stage`);
  }
  return stage;
}

const STAGE_OF: ReadonlyMap<TierId, Stage> = new Map(MACHINE_STAGES);

/** Stones a second each stage's running machines can move. */
export type StageSpeeds = Readonly<Record<Stage, number>>;

/**
 * Machines are rated three times today's on the line, because a hand on one
 * job does three times his share (rule 3): so a first cart still adds 6 a
 * second to twelve workers (spec, Machines; #543).
 */
const LINE_RATING = 3;

/** A machine's stage, or none for the hands. */
export function stageOf(tierId: TierId): Stage | undefined {
  return STAGE_OF.get(tierId);
}

/**
 * Ratings a fresh mine sets apart (slice 1, risk 15, #655): a cart moves 60 a
 * second, ten times today's, so it beats what one worker moves with a tool
 * and every worker mark of part 1 (24 a second at a hundred workers), and no
 * cart stands idle because a tool moves more. The hoist (60) and the drill
 * (108) already do.
 */
const FRESH_RATING: Readonly<Partial<Record<TierId, number>>> = { cart: 10 };

/** A machine's rating on the line, times today's; the hands keep theirs. */
export function lineRating(tierId: TierId): number {
  if (!lineOn() || stageOf(tierId) === undefined) {
    return 1;
  }
  return (freshMineOn() ? FRESH_RATING[tierId] : undefined) ?? LINE_RATING;
}

/** What each stage moves: running × speed over its machines. */
export function stageSpeeds(
  speed: Readonly<Record<TierId, number>>,
  running: Readonly<Record<TierId, number>>,
): StageSpeeds {
  const stages = { face: 0, haul: 0, lift: 0 };
  for (const [id, stage] of MACHINE_STAGES) {
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
