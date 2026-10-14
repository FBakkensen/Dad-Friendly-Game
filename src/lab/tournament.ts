import { dayNumber, isSampleSecond, withFinish } from "./casual";
import { actionsOnTable } from "./decide";
import { readFinishDay } from "./measures/finishDay";
import {
  type DecisionSample,
  type Measure,
  type MeasureContext,
  type MeasureValue,
  type ScoreMethod,
} from "./measure";
import { valueContext, type Policy } from "./policy";
import { runPolicy } from "./run";
import { scoreDecision } from "./score";
import { mean, median } from "./stats";
import { deadStretches } from "./stretch";
import { applyScope } from "./scope";
import {
  CASUAL_REFERENCE_ID,
  HOUR_MS,
  OPTIMIZER_REFERENCE_ID,
  REPORT_DEAD_HOURS,
  meetsTarget,
  type Target,
} from "./targets";

/**
 * Plays every policy it is given and scores every measure it is given.
 * Policy ids and measure ids stay in the registries. This file names neither.
 */

export type TournamentInput = {
  readonly policies: readonly Policy[];
  readonly measures: readonly Measure[];
  readonly targets: readonly Target[];
  readonly seeds: readonly number[];
  readonly days: number;
};

export type PolicySeedRun = {
  readonly policy: Policy;
  readonly seed: number;
  readonly samples: readonly DecisionSample[];
};

type Column = {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly why: string;
};

type JudgementBase = {
  readonly targetId: string;
  readonly why: string;
  readonly value: number;
  readonly pass: boolean;
};

export type Judgement = JudgementBase &
  (
    | { readonly op: "lte" | "gte"; readonly limit: number }
    | { readonly op: "between"; readonly limit: readonly [number, number] }
  );

export type Cell = {
  readonly measureId: string;
  readonly label: string;
  readonly unit: string;
  readonly why: string;
  readonly value: MeasureValue;
  readonly judgements: readonly Judgement[];
};

export type PolicyRow = {
  readonly id: string;
  readonly label: string;
  readonly kind: Policy["kind"];
  readonly finishDay: number;
  readonly cells: readonly Cell[];
};

export type TimelineRow = {
  readonly policyId: string;
  readonly label: string;
  readonly seed: number;
  readonly hour: number;
  readonly day: number;
  readonly live: number;
  readonly bestId: string;
  readonly crewPerSec: number;
  readonly pocket: number;
};

export type DeadStretchNote = {
  readonly policyId: string;
  readonly label: string;
  readonly seed: number;
  readonly score: ScoreMethod;
  readonly startDay: number;
  readonly hours: number;
  readonly savingFor: string;
  readonly nextPaybackRatio: number;
};

export type TournamentResult = {
  readonly seeds: readonly number[];
  readonly days: number;
  readonly optimizerFinishDay: number | undefined;
  readonly casualFinishDay: number | undefined;
  readonly columns: readonly Column[];
  readonly rows: readonly PolicyRow[];
  readonly timelines: readonly TimelineRow[];
  readonly deadStretches: readonly DeadStretchNote[];
};

export type JudgedInput = TournamentInput & {
  readonly runs: readonly PolicySeedRun[];
};

/** One policy on one seed, sampled every play-minute, with the finish day stamped on. */
function samplePolicy(
  policy: Policy,
  seed: number,
  days: number,
): readonly DecisionSample[] {
  const samples: DecisionSample[] = [];
  let live = 0;
  const context = valueContext(policy.params);
  const run = runPolicy({
    policy,
    seed,
    maxDays: days,
    observe(world) {
      if (isSampleSecond(live)) {
        const trouble =
          world.hazards.phase === "trouble" ? world.hazards.trouble : undefined;
        const stretchActions =
          trouble === undefined
            ? actionsOnTable(world.mountain, world.clock, policy.params)
            : actionsOnTable(
                world.mountain,
                world.clock,
                policy.params,
                trouble,
              );
        samples.push(
          scoreDecision({
            mountain: world.mountain,
            now: world.clock,
            context,
            atMs: world.clock,
            stretchActions,
            ...(trouble === undefined ? {} : { trouble }),
          }),
        );
      }
      live += 1;
    },
  });
  return withFinish(samples, run.finishDay);
}

/** Every policy, every seed. The measures and targets decide the columns and the pass/fail. */
export function runTournament(input: TournamentInput): TournamentResult {
  const runs: PolicySeedRun[] = [];
  for (const policy of input.policies) {
    for (const seed of input.seeds) {
      runs.push({
        policy,
        seed,
        samples: samplePolicy(policy, seed, input.days),
      });
    }
  }
  return judgeTournament({ ...input, runs });
}

/**
 * Scores runs the caller already played. Tests hand in samples.
 * `npm run lab` goes through `runTournament`.
 */
export function judgeTournament(input: JudgedInput): TournamentResult {
  const grouped = groupRuns(input.runs);
  const finishes = new Map<string, number>();
  for (const policy of input.policies) {
    finishes.set(policy.id, finishDayOf(grouped.get(policy.id) ?? []));
  }
  const optimizerFinishDay = finishes.get(OPTIMIZER_REFERENCE_ID);
  const casualFinishDay = finishes.get(CASUAL_REFERENCE_ID);
  const context = measureContext(optimizerFinishDay, casualFinishDay);
  const rows = input.policies.map((policy) =>
    rowFor(policy, grouped.get(policy.id) ?? [], input, context, finishes),
  );
  return {
    seeds: input.seeds,
    days: input.days,
    optimizerFinishDay,
    casualFinishDay,
    columns: input.measures.map((measure) => ({
      id: measure.id,
      label: measure.label,
      unit: measure.unit,
      why: measure.why,
    })),
    rows,
    timelines: timelinesFor(input, grouped),
    deadStretches: stretchesFor(input, grouped),
  };
}

function measureContext(
  optimizerFinishDay: number | undefined,
  casualFinishDay: number | undefined,
): MeasureContext {
  return {
    ...(optimizerFinishDay === undefined ? {} : { optimizerFinishDay }),
    ...(casualFinishDay === undefined ? {} : { casualFinishDay }),
  };
}

function groupRuns(
  runs: readonly PolicySeedRun[],
): ReadonlyMap<string, readonly PolicySeedRun[]> {
  const grouped = new Map<string, PolicySeedRun[]>();
  for (const run of runs) {
    const list = grouped.get(run.policy.id) ?? [];
    list.push(run);
    grouped.set(run.policy.id, list);
  }
  return grouped;
}

function finishDayOf(runs: readonly PolicySeedRun[]): number {
  if (runs.length === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return mean(runs.map((run) => readFinishDay(run.samples)));
}

function rowFor(
  policy: Policy,
  runs: readonly PolicySeedRun[],
  input: JudgedInput,
  context: MeasureContext,
  finishes: ReadonlyMap<string, number>,
): PolicyRow {
  return {
    id: policy.id,
    label: policy.label,
    kind: policy.kind,
    finishDay: finishes.get(policy.id) ?? Number.POSITIVE_INFINITY,
    cells: input.measures.map((measure) =>
      cellFor(policy, measure, runs, input.targets, context),
    ),
  };
}

function cellFor(
  policy: Policy,
  measure: Measure,
  runs: readonly PolicySeedRun[],
  targets: readonly Target[],
  context: MeasureContext,
): Cell {
  const unscoped = across(measure, runs, (run) => run.samples, context);
  const judgements: Judgement[] = [];
  let unavailable = false;
  for (const target of targets) {
    if (target.measure !== measure.id || !coversPolicy(target, policy)) {
      continue;
    }
    const judged = across(
      measure,
      runs,
      (run) => applyScope(target.scope, run.samples),
      context,
    );
    if (typeof judged !== "number" || Number.isNaN(judged)) {
      if (Number.isNaN(judged)) {
        unavailable = true;
      }
      continue;
    }
    const shared = {
      targetId: target.id,
      why: target.why,
      value: judged,
      pass: meetsTarget(target, judged),
    };
    if (target.op === "between") {
      judgements.push({ ...shared, op: target.op, limit: target.value });
    } else {
      judgements.push({ ...shared, op: target.op, limit: target.value });
    }
  }
  return {
    measureId: measure.id,
    label: measure.label,
    unit: measure.unit,
    why: measure.why,
    value:
      judgements.length === 0 && unavailable
        ? Number.NaN
        : displayValue(unscoped, judgements),
    judgements,
  };
}

function coversPolicy(target: Target, policy: Policy): boolean {
  switch (target.scope.kind) {
    case "all":
    case "fromSource":
      return true;
    case "afterHour":
      return (
        target.scope.kinds === undefined ||
        target.scope.kinds.includes(policy.kind)
      );
    case "policies":
      return target.scope.ids.includes(policy.id);
    case "policyKinds":
      return target.scope.kinds.includes(policy.kind);
  }
}

function displayValue(
  unscoped: MeasureValue,
  judgements: readonly Judgement[],
): MeasureValue {
  if (judgements.length !== 1) {
    return unscoped;
  }
  const only = judgements[0];
  return only === undefined ? unscoped : only.value;
}

function across(
  measure: Measure,
  runs: readonly PolicySeedRun[],
  samplesOf: (run: PolicySeedRun) => readonly DecisionSample[],
  context: MeasureContext,
): MeasureValue {
  if (runs.length === 0) {
    return measure.aggregate([], context);
  }
  const values = runs.map((run) => measure.aggregate(samplesOf(run), context));
  if (isNumbers(values)) {
    const defined: number[] = [];
    for (const value of values) {
      if (!Number.isNaN(value)) {
        defined.push(value);
      }
    }
    if (defined.length === 0) {
      return Number.NaN;
    }
    return mean(defined);
  }
  return measure.aggregate(
    runs.flatMap((run) => samplesOf(run)),
    context,
  );
}

function isNumbers(
  values: readonly MeasureValue[],
): values is readonly number[] {
  return values.every((value) => typeof value === "number");
}

function timelinesFor(
  input: JudgedInput,
  grouped: ReadonlyMap<string, readonly PolicySeedRun[]>,
): readonly TimelineRow[] {
  const seed = input.seeds[0];
  if (seed === undefined) {
    return [];
  }
  const rows: TimelineRow[] = [];
  for (const policy of input.policies) {
    if (policy.kind !== "casual" && policy.kind !== "optimizer") {
      continue;
    }
    const run = (grouped.get(policy.id) ?? []).find(
      (item) => item.seed === seed,
    );
    const samples = [...(run?.samples ?? [])].sort(
      (left, right) => left.atMs - right.atMs,
    );
    const buckets = new Map<number, DecisionSample[]>();
    for (const sample of samples) {
      const hour = Math.floor(sample.atMs / HOUR_MS);
      const bucket = buckets.get(hour) ?? [];
      bucket.push(sample);
      buckets.set(hour, bucket);
    }
    for (const hour of [...buckets.keys()].sort(
      (left, right) => left - right,
    )) {
      const bucket = buckets.get(hour) ?? [];
      const last = bucket[bucket.length - 1];
      if (last === undefined) {
        continue;
      }
      rows.push({
        policyId: policy.id,
        label: policy.label,
        seed,
        hour,
        day: dayNumber(last.atMs),
        live: median(bucket.map((sample) => sample.liveCount)),
        bestId: last.bestId,
        crewPerSec: last.crewPerSec,
        pocket: last.pocket,
      });
    }
  }
  return rows;
}

function stretchesFor(
  input: JudgedInput,
  grouped: ReadonlyMap<string, readonly PolicySeedRun[]>,
): readonly DeadStretchNote[] {
  const notes: DeadStretchNote[] = [];
  for (const policy of input.policies) {
    for (const run of grouped.get(policy.id) ?? []) {
      for (const score of ["payback", "value"] as const) {
        for (const stretch of deadStretches(run.samples, score)) {
          if (!(stretch.hours > REPORT_DEAD_HOURS)) {
            continue;
          }
          const opening = [...run.samples]
            .sort((left, right) => left.atMs - right.atMs)
            .find((sample) => sample.atMs >= stretch.startMs);
          const saving =
            score === "value"
              ? opening?.stretch.value.bestId
              : opening?.stretch.payback.bestId;
          notes.push({
            policyId: policy.id,
            label: policy.label,
            seed: run.seed,
            score,
            startDay: dayNumber(stretch.startMs),
            hours: stretch.hours,
            savingFor: saving ?? "",
            nextPaybackRatio:
              opening?.stretch.nextPaybackRatio ?? Number.POSITIVE_INFINITY,
          });
        }
      }
    }
  }
  return notes;
}
