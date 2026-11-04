import { withFactors } from "../economy/factors";
import { passTheMine } from "../legacy";
import { createMountain, type Mountain } from "../mountain";
import type { Policy } from "./policy";
import { runPolicy } from "./run";
import { ONCE_A_DAY_SPREAD_DAYS, RUN_CAP_DAYS } from "./targets";

/** The machines every run should still buy (D3: each one worth buying). */
export const MACHINE_IDS = ["cart", "drill", "borer", "machine"] as const;

export type GenerationRun = {
  /** 1-based run number. Run N plays with Legacy N-1. */
  readonly run: number;
  readonly k: number;
  readonly finishDay: number | undefined;
  /** Machines from `MACHINE_IDS` this run never bought. */
  readonly unbought: readonly string[];
};

/**
 * Plays one policy through consecutive kid runs. Each run starts from
 * `passTheMine` of the last, so the Legacy grows by one. Run N plays with
 * `generation.k` = `ks[N-1]`: the run is a copy stretched by k (bigger
 * mountain, layer starts and prices). Stops early if a run never finishes.
 */
export function runGenerations({
  policy,
  seed,
  ks,
  maxDays,
  factors = {},
}: {
  /** Other lab factors held for every run (a sweep), beside the stretch. */
  readonly factors?: Readonly<Record<string, number>>;
  readonly policy: Policy;
  readonly seed: number;
  readonly ks: readonly number[];
  readonly maxDays?: number;
}): readonly GenerationRun[] {
  const runs: GenerationRun[] = [];
  let mountain: Mountain = createMountain();
  for (const [index, k] of ks.entries()) {
    const played = withFactors({ ...factors, "generation.k": k }, () =>
      runPolicy({
        policy,
        seed,
        mountain,
        ...(maxDays === undefined ? {} : { maxDays }),
      }),
    );
    const bought = new Set(played.buys.map((buy) => buy.id));
    runs.push({
      run: index + 1,
      k,
      finishDay: played.finishDay,
      unbought: MACHINE_IDS.filter((id) => !bought.has(id)),
    });
    const next = passTheMine(played.world.mountain, played.world.clock);
    if (next === undefined) {
      break;
    }
    // Each run is its own lab clock, starting at 0.
    mountain = { ...next, startedAt: 0 };
  }
  return runs;
}

/** Run N+1 finishes later than run N, for every pair. Report-only. */
export function eachRunLonger(days: readonly (number | undefined)[]): boolean {
  let before = Number.NEGATIVE_INFINITY;
  for (const day of days) {
    if (day === undefined || day <= before) {
      return false;
    }
    before = day;
  }
  return true;
}

/** No run past `RUN_CAP_DAYS`, and every run finished. Report-only. */
export function noRunPastCap(days: readonly (number | undefined)[]): boolean {
  return days.every((day) => day !== undefined && day <= RUN_CAP_DAYS);
}

/** The model the design doc proposed: a run stretches by k / bonus. */
export function linearModelDays(
  firstRunDays: number,
  k: number,
  bonus: number,
): number {
  return (firstRunDays * k) / bonus;
}

/** The fit to today's runs: a run stretches by the square root of k / bonus. */
export function rootModelDays(
  firstRunDays: number,
  k: number,
  bonus: number,
): number {
  return firstRunDays * Math.sqrt(k / bonus);
}

/** Each run at least as long as the last, and within the spread of run 1. */
export function onceADayRunsOk(days: readonly (number | undefined)[]): boolean {
  const first = days[0];
  let before = Number.NEGATIVE_INFINITY;
  for (const day of days) {
    if (
      first === undefined ||
      day === undefined ||
      day < before ||
      day > first + ONCE_A_DAY_SPREAD_DAYS
    ) {
      return false;
    }
    before = day;
  }
  return true;
}

/**
 * The approved run-length rule for a player type (report-only until
 * Flemming OKs strict). Twice a day or more: each run longer, none past the
 * cap. Once a day: `onceADayRunsOk`.
 */
export function runLengthOk(
  days: readonly (number | undefined)[],
  sessionsPerDay: number,
): boolean {
  return sessionsPerDay >= 2
    ? eachRunLonger(days) && noRunPastCap(days)
    : onceADayRunsOk(days);
}
