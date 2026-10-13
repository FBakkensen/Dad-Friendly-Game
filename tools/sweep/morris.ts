import { createRng } from "./random";

/**
 * Morris screening. Four levels, step 2/3. Each trajectory changes one
 * knob at a time, so the elementary effect is that step's change in the
 * measure divided by the step.
 */

export const MORRIS_LEVELS = 4;

/** Grid step. With 4 levels this is 2/3. */
export const MORRIS_DELTA = MORRIS_LEVELS / (2 * (MORRIS_LEVELS - 1));

export type MorrisScreen = {
  /** Mean absolute elementary effect. One row per factor, one entry per output. */
  readonly muStar: readonly (readonly number[])[];
  /** Sample standard deviation of the elementary effects. Same shape as `muStar`. */
  readonly sigma: readonly (readonly number[])[];
  readonly evaluations: number;
};

/** One trajectory is `factors + 1` points in the unit interval. */
export function morrisTrajectories(
  factors: number,
  trajectories: number,
  rng: () => number,
): number[][][] {
  if (factors < 1 || trajectories < 1) {
    throw new Error("Morris needs at least one factor and one trajectory.");
  }
  const jump = MORRIS_LEVELS / 2;
  const steps = MORRIS_LEVELS - 1;
  const slots = MORRIS_LEVELS - jump;
  const paths: number[][][] = [];
  for (let trajectory = 0; trajectory < trajectories; trajectory += 1) {
    const base = Array.from(
      { length: factors },
      () => Math.floor(rng() * slots) / steps,
    );
    const sign = Array.from({ length: factors }, () => (rng() < 0.5 ? -1 : 1));
    const order = shuffle(
      Array.from({ length: factors }, (_, index) => index),
      rng,
    );
    const point = base.map((value, index) => {
      const direction = sign[index];
      return direction === -1 ? value + MORRIS_DELTA : value;
    });
    const points = [point.slice()];
    for (const index of order) {
      const direction = sign[index];
      const current = point[index];
      if (direction === undefined || current === undefined) {
        throw new Error("Morris lost a coordinate.");
      }
      point[index] = current + direction * MORRIS_DELTA;
      points.push(point.slice());
    }
    paths.push(points);
  }
  return paths;
}

/** Screens `evaluate` over a Morris design from `seed`. */
export function morrisScreen(options: {
  readonly factors: number;
  readonly trajectories: number;
  readonly seed: number;
  readonly evaluate: (unit: readonly number[]) => readonly number[];
}): MorrisScreen {
  const paths = morrisTrajectories(
    options.factors,
    options.trajectories,
    createRng(options.seed),
  );
  const effects: number[][][] = Array.from(
    { length: options.factors },
    () => [],
  );
  let evaluations = 0;
  let outputs = 0;
  for (const path of paths) {
    const values: number[][] = [];
    for (const point of path) {
      const sample = options.evaluate(point);
      if (values.length === 0) {
        outputs = sample.length;
      } else if (sample.length !== outputs) {
        throw new Error("Morris outputs changed length between samples.");
      }
      values.push(sample.slice());
      evaluations += 1;
    }
    for (let step = 0; step < path.length - 1; step += 1) {
      const before = path[step];
      const after = path[step + 1];
      const y0 = values[step];
      const y1 = values[step + 1];
      if (
        before === undefined ||
        after === undefined ||
        y0 === undefined ||
        y1 === undefined
      ) {
        throw new Error("Morris lost a step.");
      }
      const index = changedIndex(before, after);
      const stepSize = (after[index] ?? 0) - (before[index] ?? 0);
      const row = effects[index];
      if (row === undefined || stepSize === 0) {
        throw new Error("Morris step had no change.");
      }
      const effect: number[] = [];
      for (let output = 0; output < outputs; output += 1) {
        effect.push(((y1[output] ?? 0) - (y0[output] ?? 0)) / stepSize);
      }
      row.push(effect);
    }
  }
  return {
    muStar: effects.map((row) => summarise(row, outputs, muStarOf)),
    sigma: effects.map((row) => summarise(row, outputs, sigmaOf)),
    evaluations,
  };
}

function changedIndex(
  before: readonly number[],
  after: readonly number[],
): number {
  let found = -1;
  for (let index = 0; index < before.length; index += 1) {
    const left = before[index] ?? 0;
    const right = after[index] ?? 0;
    if (Math.abs(left - right) <= 1e-9) {
      continue;
    }
    if (found !== -1) {
      throw new Error("Morris step moved two factors.");
    }
    found = index;
  }
  if (found < 0) {
    throw new Error("Morris step moved nothing.");
  }
  return found;
}

function summarise(
  effects: readonly (readonly number[])[],
  outputs: number,
  reduce: (values: readonly number[]) => number,
): readonly number[] {
  const columns: number[] = [];
  for (let output = 0; output < outputs; output += 1) {
    columns.push(reduce(effects.map((effect) => effect[output] ?? 0)));
  }
  return columns;
}

function muStarOf(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  if (values.some((value) => !Number.isFinite(value))) {
    return Number.POSITIVE_INFINITY;
  }
  let sum = 0;
  for (const value of values) {
    sum += Math.abs(value);
  }
  return sum / values.length;
}

function sigmaOf(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  if (values.some((value) => !Number.isFinite(value))) {
    return Number.POSITIVE_INFINITY;
  }
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  const mean = sum / values.length;
  let square = 0;
  for (const value of values) {
    const delta = value - mean;
    square += delta * delta;
  }
  return Math.sqrt(square / (values.length - 1));
}

function shuffle(items: readonly number[], rng: () => number): number[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    const here = copy[index];
    const there = copy[swap];
    if (here === undefined || there === undefined) {
      continue;
    }
    copy[index] = there;
    copy[swap] = here;
  }
  return copy;
}
