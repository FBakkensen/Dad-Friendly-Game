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
import { createLedgerLog, type LedgerEntry } from "./ledger";
import { createRevealLog, type RevealEvent } from "./reveal";
import {
  createMachineBuyLog,
  createSittingClock,
  createSittingLog,
  dayNumber,
  isSampleSecond,
  placeSittings,
  withFinish,
  type MachineBuy,
  type SittingOpen,
} from "./sittings";
import type { ValueContext } from "../economy/actions";
import type { Mountain } from "../mountain";
import { TIERS, owned } from "../tiers";
import { narrowAt, zeroGainBuysBetween } from "./line-view";
import { cageGap, freshView, shareTaps, workerTaps } from "./fresh-view";
import { nightRecord, type NightRecord } from "./nights";
import type { World } from "./world";
import { runPolicy } from "./run";
import { scoreDecision } from "./score";
import { mean, median } from "./stats";
import { deadStretches, type Stretch } from "./stretch";
import { applyScope } from "./scope";
import {
  CASUAL_REFERENCE_ID,
  HOUR_MS,
  MS_PER_SECOND,
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
  /** The run's pacing ledger row (#554). Tests that hand in samples leave it out. */
  readonly ledger?: LedgerEntry;
};

type Column = {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly why: string;
};

/** One seed's figure for a numeric measure. */
type SeedValue = { readonly seed: number; readonly value: number };

type JudgementBase = {
  readonly targetId: string;
  readonly why: string;
  readonly value: number;
  readonly pass: boolean;
  /** The seed furthest on the guardrail's wrong side, with two seeds or more (#554). */
  readonly worst?: SeedValue;
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
  /** With no guardrail, the seeds' lowest and highest, when they differ (#554). */
  readonly spread?: { readonly low: number; readonly high: number };
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
  /** The pacing ledger (#554): one row per run that carries one. */
  readonly ledger: readonly LedgerEntry[];
};

export type JudgedInput = TournamentInput & {
  readonly runs: readonly PolicySeedRun[];
};

/**
 * Crew and upgrade levels: what a buy adds to (#335). Crafts are timers
 * and are not counted.
 */
function ownedCount(mountain: Mountain): number {
  const crew = TIERS.reduce((total, tier) => total + owned(mountain, tier), 0);
  const levels = Object.values(mountain.upgrades).reduce(
    (total: number, level) => total + level,
    0,
  );
  return crew + levels;
}

/**
 * One policy on one seed, sampled every play-minute, with the finish day
 * stamped on, and its pacing ledger row.
 */
function samplePolicy(
  policy: Policy,
  seed: number,
  days: number,
): PolicySeedRun {
  const samples: DecisionSample[] = [];
  let live = 0;
  let liveSec = 0;
  let lastClock = 0;
  let pending: RevealEvent[] = [];
  let pendingBuys: MachineBuy[] = [];
  const nights = createNightLog();
  const reveal = createRevealLog();
  const machineBuys = createMachineBuyLog();
  const sittingAt = createSittingClock();
  const sittingLog = createSittingLog();
  const ledger = createLedgerLog();
  const context = valueContext(policy.params);
  let ownedBefore = 0;
  let before: Mountain | undefined;
  const run = runPolicy({
    policy,
    seed,
    maxDays: days,
    observe(world) {
      if (world.clock - lastClock === MS_PER_SECOND) {
        liveSec += 1;
      }
      lastClock = world.clock;
      ledger.observe(world);
      const sitting = sittingAt(world.clock);
      pending.push(
        ...reveal(world.mountain, liveSec).map((event) => ({
          ...event,
          sitting,
        })),
      );
      pendingBuys.push(...machineBuys(world.mountain));
      nights.observe(world);
      placeSittings(
        samples,
        sittingLog.observe({
          clock: world.clock,
          owned: ownedCount(world.mountain),
          tiers: TIERS.map((tier) => owned(world.mountain, tier)),
          open: () => openingView(world.mountain, world.clock, context),
          narrow: () => narrowAt(world.mountain, world.clock),
          zeroGainBuys:
            before === undefined
              ? undefined
              : zeroGainBuysBetween(before, world.mountain, world.clock),
          workerTaps:
            before === undefined
              ? undefined
              : workerTaps(
                  { helper: before.owned.helper, jobs: before.jobs },
                  {
                    helper: world.mountain.owned.helper,
                    jobs: world.mountain.jobs,
                  },
                ),
          shareTaps:
            before === undefined
              ? undefined
              : shareTaps(before, world.mountain),
          cageGap: () => cageGap(world.mountain),
        }),
      );
      before = world.mountain;
      if (isSampleSecond(live)) {
        const trouble =
          world.hazards.phase === "trouble" ? world.hazards.trouble : undefined;
        const stretchActions = actionsOnTable(
          world.mountain,
          world.clock,
          trouble,
        );
        const ownedNow = ownedCount(world.mountain);
        samples.push({
          boughtSince: ownedNow > ownedBefore,
          fresh: freshView(world.mountain),
          ...scoreDecision({
            mountain: world.mountain,
            now: world.clock,
            context,
            atMs: world.clock,
            stretchActions,
            ...(trouble === undefined ? {} : { trouble }),
          }),
        });
        ownedBefore = ownedNow;
        attach(samples, pending, pendingBuys);
        nights.attach(samples);
        pending = [];
        pendingBuys = [];
      }
      live += 1;
    },
  });
  placeSittings(samples, sittingLog.flush());
  attach(samples, pending, pendingBuys);
  nights.attach(samples);
  return {
    policy,
    seed,
    samples: withFinish(samples, run.finishDay),
    ledger: ledger.entry({
      policyId: policy.id,
      seed,
      finishDay: run.finishDay,
      end: run.world,
    }),
  };
}

/** The long nights since the last sample, hung on the newest one (#667). */
function createNightLog(): {
  readonly observe: (world: World) => void;
  readonly attach: (samples: DecisionSample[]) => void;
} {
  let pending: NightRecord[] = [];
  return {
    observe(world) {
      const night = nightRecord(world);
      if (night !== undefined) {
        pending.push(night);
      }
    },
    attach(samples) {
      const index = samples.length - 1;
      const last = samples[index];
      if (last === undefined || pending.length === 0) {
        return;
      }
      samples[index] = {
        ...last,
        nights: [...(last.nights ?? []), ...pending],
      };
      pending = [];
    },
  };
}

/** Hangs the events on the newest sample. */
function attach(
  samples: DecisionSample[],
  events: readonly RevealEvent[],
  buys: readonly MachineBuy[],
): void {
  const index = samples.length - 1;
  const last = samples[index];
  if (last === undefined || events.length + buys.length === 0) {
    return;
  }
  samples[index] = {
    ...last,
    reveals: [...(last.reveals ?? []), ...events],
    machineBuys: [...(last.machineBuys ?? []), ...buys],
  };
}

/**
 * The best buy on this dad's Buys sheet, by stones a second per stone, as
 * he sits down: the crew and machines he weighs. Bench timers stay off it;
 * a cheap axle grease would otherwise hide the machine he is saving for.
 * Away time has cleared any trouble, so none is passed.
 */
export function openingView(
  mountain: Mountain,
  now: number,
  context: ValueContext,
): SittingOpen {
  const table = actionsOnTable(mountain, now).filter(
    (action) => action.kind === "buyTier",
  );
  const view = scoreDecision({
    mountain,
    now,
    context,
    atMs: now,
    actions: table,
    stretchActions: table,
  }).stretch.value;
  if (view.bestId === "") {
    return { kind: "nothing" };
  }
  return view.waitToAffordSec === 0
    ? { kind: "affordable" }
    : { kind: "waiting", waitSec: view.waitToAffordSec };
}

/** Every policy, every seed. The measures and targets decide the columns and the pass/fail. */
export function runTournament(input: TournamentInput): TournamentResult {
  const runs: PolicySeedRun[] = [];
  for (const policy of input.policies) {
    for (const seed of input.seeds) {
      runs.push(samplePolicy(policy, seed, input.days));
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
    ledger: input.runs.flatMap((run) =>
      run.ledger === undefined ? [] : [run.ledger],
    ),
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
  const all: RunSamples = (run) => run.samples;
  const unscopedSeeds = perSeed(measure, runs, all, context);
  const unscoped = across(measure, runs, all, unscopedSeeds, context);
  const judgements: Judgement[] = [];
  let unavailable = false;
  for (const target of targets) {
    if (target.measure !== measure.id || !coversPolicy(target, policy)) {
      continue;
    }
    const scoped: RunSamples = (run) => applyScope(target.scope, run.samples);
    const seeds = perSeed(measure, runs, scoped, context);
    const judged = across(measure, runs, scoped, seeds, context);
    if (typeof judged !== "number" || Number.isNaN(judged)) {
      if (Number.isNaN(judged)) {
        unavailable = true;
      }
      continue;
    }
    const worst = worstSeed(target, numbersOf(seeds));
    const shared = {
      targetId: target.id,
      why: target.why,
      value: judged,
      pass: meetsTarget(target, judged),
      ...(worst === undefined ? {} : { worst }),
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
    ...spreadOf(judgements, unavailable, numbersOf(unscopedSeeds)),
  };
}

type RunSamples = (run: PolicySeedRun) => readonly DecisionSample[];

/** Each run's figure, in run order. */
function perSeed(
  measure: Measure,
  runs: readonly PolicySeedRun[],
  samplesOf: RunSamples,
  context: MeasureContext,
): readonly { readonly seed: number; readonly value: MeasureValue }[] {
  return runs.map((run) => ({
    seed: run.seed,
    value: measure.aggregate(samplesOf(run), context),
  }));
}

/** The numeric seeds with a figure. */
function numbersOf(
  seeds: readonly { readonly seed: number; readonly value: MeasureValue }[],
): readonly SeedValue[] {
  const numbers: SeedValue[] = [];
  for (const { seed, value } of seeds) {
    if (typeof value === "number" && !Number.isNaN(value)) {
      numbers.push({ seed, value });
    }
  }
  return numbers;
}

/** How far a figure sits on the guardrail's wrong side; higher is worse. */
function badness(target: Target, value: number): number {
  if (target.op === "lte") {
    return value;
  }
  if (target.op === "gte") {
    return -value;
  }
  const [low, high] = target.value;
  return Math.max(low - value, value - high);
}

/** The worst seed, with two seeds or more. The first seed wins a tie. */
function worstSeed(
  target: Target,
  seeds: readonly SeedValue[],
): SeedValue | undefined {
  if (seeds.length <= 1) {
    return undefined;
  }
  let worst: SeedValue | undefined;
  for (const seed of seeds) {
    if (
      worst === undefined ||
      badness(target, seed.value) > badness(target, worst.value)
    ) {
      worst = seed;
    }
  }
  return worst;
}

/**
 * A measure no guardrail reads has no wrong side: its seeds' range instead.
 * None on a guarded cell whose guardrails all came back n/a.
 */
function spreadOf(
  judgements: readonly Judgement[],
  unavailable: boolean,
  seeds: readonly SeedValue[],
): { readonly spread?: { readonly low: number; readonly high: number } } {
  if (unavailable || judgements.length > 0 || seeds.length <= 1) {
    return {};
  }
  const values = seeds.map((seed) => seed.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? {} : { spread: { low, high } };
}

function coversPolicy(target: Target, policy: Policy): boolean {
  switch (target.scope.kind) {
    case "all":
      return true;
    case "fromSource":
    case "fromLayer":
      return (
        target.scope.kinds === undefined ||
        target.scope.kinds.includes(policy.kind)
      );
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

/** The seed mean of a numeric measure; a list measure pools every seed's samples. */
function across(
  measure: Measure,
  runs: readonly PolicySeedRun[],
  samplesOf: RunSamples,
  seeds: readonly { readonly value: MeasureValue }[],
  context: MeasureContext,
): MeasureValue {
  if (runs.length === 0) {
    return measure.aggregate([], context);
  }
  const values = seeds.map((seed) => seed.value);
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
  return input.policies.flatMap((policy) =>
    (grouped.get(policy.id) ?? []).flatMap((run) =>
      (["payback", "value"] as const).flatMap((score) =>
        deadStretches(run.samples, score)
          .filter((stretch) => stretch.hours > REPORT_DEAD_HOURS)
          .map((stretch) => stretchNote(policy, run, score, stretch)),
      ),
    ),
  );
}

/** One dead stretch long enough to report, with what the run was saving for. */
function stretchNote(
  policy: Policy,
  run: PolicySeedRun,
  score: "payback" | "value",
  stretch: Stretch,
): DeadStretchNote {
  const opening = [...run.samples]
    .sort((left, right) => left.atMs - right.atMs)
    .find((sample) => sample.atMs >= stretch.startMs);
  const saving =
    score === "value"
      ? opening?.stretch.value.bestId
      : opening?.stretch.payback.bestId;
  return {
    policyId: policy.id,
    label: policy.label,
    seed: run.seed,
    score,
    startDay: dayNumber(stretch.startMs),
    hours: stretch.hours,
    savingFor: saving ?? "",
    nextPaybackRatio:
      opening?.stretch.nextPaybackRatio ?? Number.POSITIVE_INFINITY,
  };
}
