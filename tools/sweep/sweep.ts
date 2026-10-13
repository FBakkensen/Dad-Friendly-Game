import { multiplierAt, type Knob } from "./knobs";
import { MORRIS_LEVELS, morrisScreen } from "./morris";
import { sobolIndices } from "./sobol";

/** Tool defaults. The game's own numbers stay in `targets.ts`. */
export const DEFAULT_MEASURE_IDS = [
  "longestDeadStretch",
  "singleShare",
  "dominantShare",
  "finishDay",
] as const;

export const DEFAULT_SEED = 1;
export const DEFAULT_TRAJECTORIES = 4;
export const DEFAULT_SAMPLES = 16;
export const DEFAULT_TOP = 4;

export type SweepOutput = {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
};

type MorrisRow = {
  readonly id: string;
  readonly label: string;
  /** Mean absolute elementary effect, one per output. */
  readonly muStar: readonly number[];
  /** Spread of those effects, one per output. */
  readonly sigma: readonly number[];
  /** Sum of μ* after each output is scaled by its largest μ*. */
  readonly score: number;
};

type SobolRow = {
  readonly id: string;
  readonly label: string;
  readonly s1: readonly number[];
  readonly st: readonly number[];
};

export type SweepResult = {
  readonly seed: number;
  readonly levels: number;
  readonly trajectories: number;
  readonly samples: number;
  readonly outputs: readonly SweepOutput[];
  /** Every knob, highest score first. Ties break by id. */
  readonly morris: readonly MorrisRow[];
  /** Knobs the Sobol step kept, in that same rank order. */
  readonly kept: readonly string[];
  readonly sobol: readonly SobolRow[];
  readonly morrisEvaluations: number;
  readonly sobolEvaluations: number;
};

/**
 * Morris on every knob, then Sobol on the highest scores.
 * `evaluate` receives a multiplier per factor id. 1 is the baseline.
 * The same seed replays the same design and the same indices.
 */
export function sweepModel(options: {
  readonly knobs: readonly Knob[];
  readonly outputs: readonly SweepOutput[];
  readonly evaluate: (
    multipliers: Readonly<Record<string, number>>,
  ) => readonly number[];
  readonly seed: number;
  readonly trajectories: number;
  readonly samples: number;
  readonly top: number;
}): SweepResult {
  if (options.knobs.length === 0) {
    throw new Error("The sweep needs at least one knob.");
  }
  if (options.outputs.length === 0) {
    throw new Error("The sweep needs at least one measure.");
  }
  if (options.top < 1) {
    throw new Error("The sweep keeps at least one knob for Sobol.");
  }
  assertDistinct(options.knobs);
  const morris = morrisScreen({
    factors: options.knobs.length,
    trajectories: options.trajectories,
    seed: options.seed,
    evaluate: (unit) =>
      checked(
        options.outputs.length,
        options.evaluate(multipliersFor(options.knobs, unit)),
      ),
  });
  const ranked = rankKnobs(
    options.knobs,
    morris.muStar,
    morris.sigma,
    options.outputs.length,
  );
  const keep = Math.min(options.top, ranked.length);
  const keptKnobs = knobsInRank(options.knobs, ranked).slice(0, keep);
  const sobol = sobolIndices({
    factors: keptKnobs.length,
    samples: options.samples,
    seed: options.seed,
    evaluate: (unit) => {
      const varied = multipliersFor(keptKnobs, unit);
      const all: Record<string, number> = {};
      for (const knob of options.knobs) {
        all[knob.factor] = varied[knob.factor] ?? 1;
      }
      return checked(options.outputs.length, options.evaluate(all));
    },
  });
  return {
    seed: options.seed,
    levels: MORRIS_LEVELS,
    trajectories: options.trajectories,
    samples: options.samples,
    outputs: options.outputs,
    morris: ranked,
    kept: keptKnobs.map((row) => row.id),
    sobol: keptKnobs.map((row, index) => ({
      id: row.id,
      label: row.label,
      s1: sobol.s1[index] ?? [],
      st: sobol.st[index] ?? [],
    })),
    morrisEvaluations: morris.evaluations,
    sobolEvaluations: sobol.evaluations,
  };
}

function knobsInRank(
  knobs: readonly Knob[],
  ranked: readonly MorrisRow[],
): Knob[] {
  const byId = new Map(knobs.map((knob) => [knob.id, knob]));
  return ranked.flatMap((row) => {
    const knob = byId.get(row.id);
    return knob === undefined ? [] : [knob];
  });
}

function multipliersFor(
  knobs: readonly Knob[],
  unit: readonly number[],
): Readonly<Record<string, number>> {
  const multipliers: Record<string, number> = {};
  for (let index = 0; index < knobs.length; index += 1) {
    const knob = knobs[index];
    const sample = unit[index];
    if (knob === undefined || sample === undefined) {
      throw new Error("A sweep sample missed a knob.");
    }
    multipliers[knob.factor] = multiplierAt(knob, sample);
  }
  return multipliers;
}

function rankKnobs(
  knobs: readonly Knob[],
  muStar: readonly (readonly number[])[],
  sigma: readonly (readonly number[])[],
  outputs: number,
): MorrisRow[] {
  const rows: MorrisRow[] = knobs.map((knob, index) => {
    const stars = muStar[index] ?? [];
    return {
      id: knob.id,
      label: knob.label,
      muStar: stars,
      sigma: sigma[index] ?? [],
      score: rankScore(stars, muStar, outputs),
    };
  });
  rows.sort((left, right) => {
    if (left.score !== right.score) {
      if (!Number.isFinite(left.score)) {
        return -1;
      }
      if (!Number.isFinite(right.score)) {
        return 1;
      }
      return right.score - left.score;
    }
    if (left.id < right.id) {
      return -1;
    }
    if (left.id > right.id) {
      return 1;
    }
    return 0;
  });
  return rows;
}

function rankScore(
  stars: readonly number[],
  all: readonly (readonly number[])[],
  outputs: number,
): number {
  let score = 0;
  for (let output = 0; output < outputs; output += 1) {
    const value = stars[output] ?? 0;
    if (!Number.isFinite(value)) {
      return Number.POSITIVE_INFINITY;
    }
    let largest = 0;
    let unbounded = false;
    for (const row of all) {
      const candidate = row[output] ?? 0;
      if (!Number.isFinite(candidate)) {
        unbounded = true;
        continue;
      }
      largest = Math.max(largest, candidate);
    }
    if (unbounded && value === 0 && largest === 0) {
      continue;
    }
    if (largest > 0) {
      score += value / largest;
    }
  }
  return score;
}

function assertDistinct(knobs: readonly Knob[]): void {
  const ids = new Set<string>();
  const factors = new Set<string>();
  for (const knob of knobs) {
    if (
      !(knob.low < knob.high) ||
      !Number.isFinite(knob.low) ||
      !Number.isFinite(knob.high)
    ) {
      throw new Error(`Knob "${knob.id}" needs a finite low below its high.`);
    }
    if (ids.has(knob.id)) {
      throw new Error(`Duplicate knob "${knob.id}".`);
    }
    if (factors.has(knob.factor)) {
      throw new Error(`Duplicate factor "${knob.factor}".`);
    }
    ids.add(knob.id);
    factors.add(knob.factor);
  }
}

function checked(
  outputs: number,
  values: readonly number[],
): readonly number[] {
  if (values.length !== outputs) {
    throw new Error(
      `The model returned ${String(values.length)} numbers for ${String(outputs)} measures.`,
    );
  }
  return values;
}
