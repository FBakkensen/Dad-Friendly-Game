import { withFactors } from "../economy/factors";
import { createMountain } from "../mountain";
import type { Policy } from "./policy";
import { runPolicy } from "./run";
import { withFirstWorker } from "./world";
import { machinesInPlay } from "../tiers";

export type GenerationRun = {
  /** 1-based run number. Run N plays with Legacy N-1. */
  readonly run: number;
  readonly k: number;
  readonly finishDay: number | undefined;
  /**
   * Machines in play (`machinesInPlay`, src/tiers.ts) this run never bought. Every
   * run should still buy each one (D3: each one worth buying).
   */
  readonly unbought: readonly string[];
};

/**
 * Plays one policy's run. The pass is gone (#729), so there is no kid run
 * after it, whatever `runs` asks; #729's second task deletes this lab.
 */
export function runGenerations({
  policy,
  seed,
  runs: count,
  maxDays,
  factors = {},
}: {
  /** Lab factors held for every run (a sweep). */
  readonly factors?: Readonly<Record<string, number>>;
  readonly policy: Policy;
  readonly seed: number;
  readonly runs: number;
  readonly maxDays?: number;
}): readonly GenerationRun[] {
  if (count < 1) {
    return [];
  }
  const played = withFactors(factors, () =>
    runPolicy({
      policy,
      seed,
      mountain: withFirstWorker(createMountain()),
      ...(maxDays === undefined ? {} : { maxDays }),
    }),
  );
  const bought = new Set(played.buys.map((buy) => buy.id));
  // Read under the run's factors, so a run with the line on lists them.
  const machines = withFactors(factors, machinesInPlay);
  return [
    {
      run: 1,
      k: 1,
      finishDay: played.finishDay,
      unbought: machines.filter((id) => !bought.has(id)),
    },
  ];
}

/**
 * The run-length rule (every type): run N+1 finishes later than run N,
 * forever. Report-only until #729 (`RUN_LENGTH_RULE`, #728).
 */
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
