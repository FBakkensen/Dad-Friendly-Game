import type { Trouble } from "../hazards";
import type { World } from "./world";
import { listActions } from "../economy/actions";
import { DAD_SCHEDULE, simulateDadRun } from "../pacing";
import { RELICS } from "../relics";
import type { DecisionSample, ScoreMethod } from "./measure";
import { scoreDecision } from "./score";
import { singleShareOf } from "./measures/singleShare";
import { longestStretch } from "./stretch";
import { DAY_MS, SAMPLE_INTERVAL_SEC } from "./targets";

type MethodReport = {
  readonly singleShare: number;
  readonly deadHours: number;
  /** 1-based day the longest wait starts. Absent when nothing was unpaid. */
  readonly deadStartDay: number | undefined;
};

export type Diagnosis = {
  /** Payback within `LIVE_RATIO`. The official score. */
  readonly payback: MethodReport;
  /** Stones of income per stone of cost. The earlier diagnosis. */
  readonly value: MethodReport;
};

/** 1-based day, the same clock the pacing sim prints. */
export function dayNumber(ms: number): number {
  return ms / DAY_MS + 1;
}

/** A sample second: every play-minute, which includes the session start. */
export function isSampleSecond(second: number): boolean {
  return second % SAMPLE_INTERVAL_SEC === 0;
}

function troubleAt(world: World): Trouble | undefined {
  return world.hazards.phase === "trouble" ? world.hazards.trouble : undefined;
}

/** Stamps the finish day onto every sample. An unfinished run is unchanged. */
export function withFinish(
  samples: readonly DecisionSample[],
  finishDay: number | undefined,
): readonly DecisionSample[] {
  if (finishDay === undefined) {
    return samples;
  }
  return samples.map((sample) => ({ ...sample, finishDay }));
}

function methodReport(
  samples: readonly DecisionSample[],
  method: ScoreMethod,
): MethodReport {
  const stretch = longestStretch(samples, method);
  return {
    singleShare: singleShareOf(samples, method),
    deadHours: stretch?.hours ?? 0,
    deadStartDay:
      stretch === undefined ? undefined : dayNumber(stretch.startMs),
  };
}

/** Payback and value-per-stone, side by side. */
export function diagnosisOf(samples: readonly DecisionSample[]): Diagnosis {
  return {
    payback: methodReport(samples, "payback"),
    value: methodReport(samples, "value"),
  };
}

/**
 * Today's plain dad: two ten-minute sessions, crew buys only, valued the
 * way the pacing sim ranks them. The table is crew (`buyTier`). That is the
 * run the earlier diagnosis measured.
 */
export function sampleCasualRun(): {
  readonly samples: readonly DecisionSample[];
  readonly finishDay: number | undefined;
} {
  const mantle = RELICS.find((relic) => relic.id === "mantle");
  if (mantle === undefined) {
    throw new Error('Relic "mantle" is missing');
  }
  const samples: DecisionSample[] = [];
  const run = simulateDadRun({
    milestones: [mantle.depth],
    onDecision(world, second) {
      if (!isSampleSecond(second)) {
        return;
      }
      const trouble = troubleAt(world);
      const actions = listActions(world.mountain, world.clock, trouble).filter(
        (action) => action.kind === "buyTier",
      );
      samples.push(
        scoreDecision({
          mountain: world.mountain,
          now: world.clock,
          context: DAD_SCHEDULE,
          actions,
          atMs: world.clock,
          ...(trouble === undefined ? {} : { trouble }),
        }),
      );
    },
  });
  const finishDay = run.reached.get(mantle.depth);
  return { samples: withFinish(samples, finishDay), finishDay };
}
