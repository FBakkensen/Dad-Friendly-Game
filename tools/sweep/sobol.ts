/**
 * Scrambled Sobol sequence and the Saltelli design.
 * Direction numbers are Joe and Kuo's. Points use the Gray code.
 * Scramble is a binary Owen scramble from the seed.
 * Indices: Saltelli 2010 for S1, Jansen 1999 for ST.
 */

/** Joe–Kuo primitive polynomials for dimensions 2 onward: degree, coefficient, initial m. */
const POLYS: readonly (readonly [number, number, readonly number[]])[] = [
  [1, 0, [1]],
  [2, 1, [1, 3]],
  [3, 1, [1, 3, 1]],
  [3, 2, [1, 1, 1]],
  [4, 1, [1, 1, 3, 3]],
  [4, 4, [1, 3, 5, 13]],
  [5, 2, [1, 1, 5, 5, 17]],
  [5, 4, [1, 1, 5, 5, 5]],
  [5, 7, [1, 1, 7, 11, 19]],
  [5, 11, [1, 1, 5, 1, 1]],
  [5, 13, [1, 1, 1, 3, 11]],
  [5, 14, [1, 3, 5, 5, 31]],
  [6, 1, [1, 3, 3, 9, 7, 49]],
  [6, 13, [1, 1, 1, 15, 21, 21]],
  [6, 16, [1, 3, 1, 13, 27, 49]],
  [6, 19, [1, 1, 1, 15, 7, 5]],
  [6, 22, [1, 3, 1, 15, 13, 25]],
  [6, 25, [1, 1, 5, 5, 19, 61]],
  [7, 1, [1, 3, 7, 11, 23, 15, 103]],
  [7, 4, [1, 3, 7, 13, 13, 15, 69]],
  [7, 7, [1, 1, 3, 13, 7, 35, 63]],
  [7, 8, [1, 3, 5, 9, 1, 25, 53]],
  [7, 14, [1, 3, 1, 13, 9, 35, 107]],
  [7, 19, [1, 3, 1, 5, 27, 61, 31]],
  [7, 21, [1, 1, 5, 11, 19, 41, 61]],
  [7, 28, [1, 3, 5, 3, 3, 13, 69]],
  [7, 31, [1, 1, 7, 13, 1, 19, 1]],
  [7, 32, [1, 3, 7, 5, 13, 19, 59]],
  [7, 37, [1, 1, 3, 9, 25, 29, 41]],
  [7, 41, [1, 3, 5, 13, 23, 1, 55]],
  [7, 42, [1, 3, 7, 3, 13, 59, 17]],
  [7, 50, [1, 3, 1, 3, 5, 53, 69]],
  [7, 55, [1, 1, 5, 5, 23, 33, 13]],
  [7, 56, [1, 1, 7, 7, 1, 61, 123]],
  [7, 59, [1, 1, 7, 9, 13, 61, 49]],
  [7, 62, [1, 3, 3, 5, 3, 55, 33]],
  [8, 14, [1, 3, 1, 15, 31, 13, 49, 245]],
  [8, 21, [1, 3, 5, 15, 31, 59, 63, 97]],
  [8, 22, [1, 3, 1, 11, 11, 11, 77, 249]],
];

const BITS = 32;
const SCALE = 2 ** BITS;

const DIRECTIONS: readonly (readonly number[])[] = [
  dimensionOne(),
  ...POLYS.map(([degree, coefficient, initial]) =>
    expand(degree, coefficient, initial),
  ),
];

const SOBOL_MAX_DIMENSIONS = DIRECTIONS.length;

export type SobolIndices = {
  /** First-order index. One row per factor, one entry per output. */
  readonly s1: readonly (readonly number[])[];
  /** Total-order index. Same shape as `s1`. */
  readonly st: readonly (readonly number[])[];
  readonly evaluations: number;
};

/** Unscrambled Sobol point `index` (0 is the origin) in `dimensions`. */
export function sobolPoint(
  index: number,
  dimensions: number,
): readonly number[] {
  return integers(index, dimensions).map((value) => value / SCALE);
}

/** Owen-scrambled Sobol point. The same seed replays the same point. */
export function scrambledSobol(
  index: number,
  dimensions: number,
  seed: number,
): readonly number[] {
  return integers(index, dimensions).map(
    (value, dimension) => owen(value, seed, dimension) / SCALE,
  );
}

/**
 * Saltelli design on a scrambled Sobol sequence of width `2 * factors`.
 * The first half of each point is A and the second half is B.
 * A_B^i is A with column i taken from B.
 */
export function sobolIndices(options: {
  readonly factors: number;
  readonly samples: number;
  readonly seed: number;
  readonly evaluate: (unit: readonly number[]) => readonly number[];
}): SobolIndices {
  if (options.factors < 1 || options.samples < 1) {
    throw new Error("Sobol needs at least one factor and one sample.");
  }
  const width = options.factors * 2;
  if (width > SOBOL_MAX_DIMENSIONS) {
    throw new Error(
      `Sobol supports up to ${String(Math.floor(SOBOL_MAX_DIMENSIONS / 2))} factors.`,
    );
  }
  const matrixA: number[][] = [];
  const matrixB: number[][] = [];
  for (let row = 0; row < options.samples; row += 1) {
    const point = scrambledSobol(row, width, options.seed);
    matrixA.push(point.slice(0, options.factors));
    matrixB.push(point.slice(options.factors));
  }
  const outputA: number[][] = [];
  const outputB: number[][] = [];
  const mixed: number[][][] = Array.from({ length: options.factors }, () => []);
  let outputs = 0;
  let evaluations = 0;
  const take = (unit: readonly number[]): number[] => {
    const sample = options.evaluate(unit);
    if (evaluations === 0) {
      outputs = sample.length;
    } else if (sample.length !== outputs) {
      throw new Error("Sobol outputs changed length between samples.");
    }
    evaluations += 1;
    return sample.slice();
  };
  for (let row = 0; row < options.samples; row += 1) {
    const a = matrixA[row];
    const b = matrixB[row];
    if (a === undefined || b === undefined) {
      throw new Error("Sobol lost a row.");
    }
    outputA.push(take(a));
    outputB.push(take(b));
    for (let factor = 0; factor < options.factors; factor += 1) {
      const column = mixed[factor];
      if (column === undefined) {
        throw new Error("Sobol lost a factor.");
      }
      column.push(take(replaceColumn(a, b, factor)));
    }
  }
  const s1: number[][] = [];
  const st: number[][] = [];
  for (let factor = 0; factor < options.factors; factor += 1) {
    const first: number[] = [];
    const total: number[] = [];
    const column = mixed[factor] ?? [];
    for (let output = 0; output < outputs; output += 1) {
      const pair = indicesFor(outputA, outputB, column, output);
      first.push(pair.s1);
      total.push(pair.st);
    }
    s1.push(first);
    st.push(total);
  }
  return { s1, st, evaluations };
}

function indicesFor(
  outputA: readonly (readonly number[])[],
  outputB: readonly (readonly number[])[],
  mixed: readonly (readonly number[])[],
  output: number,
): { readonly s1: number; readonly st: number } {
  const pooled: number[] = [];
  for (const row of outputA) {
    pooled.push(row[output] ?? Number.NaN);
  }
  for (const row of outputB) {
    pooled.push(row[output] ?? Number.NaN);
  }
  if (pooled.some((value) => !Number.isFinite(value))) {
    return { s1: Number.NaN, st: Number.NaN };
  }
  for (const row of mixed) {
    const value = row[output];
    if (value === undefined || !Number.isFinite(value)) {
      return { s1: Number.NaN, st: Number.NaN };
    }
  }
  const variance = sampleVariance(pooled);
  if (!(variance > 0)) {
    return { s1: 0, st: 0 };
  }
  let first = 0;
  let total = 0;
  for (let row = 0; row < outputA.length; row += 1) {
    const a = outputA[row]?.[output] ?? 0;
    const b = outputB[row]?.[output] ?? 0;
    const ab = mixed[row]?.[output] ?? 0;
    first += b * (ab - a);
    const gap = a - ab;
    total += gap * gap;
  }
  const count = outputA.length;
  return {
    s1: first / count / variance,
    st: (0.5 * total) / count / variance,
  };
}

function sampleVariance(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
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
  return square / (values.length - 1);
}

function replaceColumn(
  rowA: readonly number[],
  rowB: readonly number[],
  factor: number,
): number[] {
  const next = rowA.slice();
  const value = rowB[factor];
  if (value === undefined) {
    throw new Error("Sobol lost a column.");
  }
  next[factor] = value;
  return next;
}

function integers(index: number, dimensions: number): readonly number[] {
  if (dimensions < 1 || dimensions > SOBOL_MAX_DIMENSIONS) {
    throw new Error(
      `Sobol supports 1 to ${String(SOBOL_MAX_DIMENSIONS)} dimensions.`,
    );
  }
  const coords = Array.from({ length: dimensions }, () => 0);
  let gray = index ^ (index >>> 1);
  let bit = 0;
  while (gray !== 0) {
    if ((gray & 1) === 1) {
      for (let dimension = 0; dimension < dimensions; dimension += 1) {
        const direction = DIRECTIONS[dimension]?.[bit];
        const current = coords[dimension];
        if (direction === undefined || current === undefined) {
          throw new Error("Sobol lost a direction number.");
        }
        coords[dimension] = (current ^ direction) >>> 0;
      }
    }
    gray >>>= 1;
    bit += 1;
  }
  return coords;
}

function owen(value: number, seed: number, dimension: number): number {
  let out = 0;
  for (let shift = BITS - 1; shift >= 0; shift -= 1) {
    const cell = shift === BITS - 1 ? 0 : value >>> (shift + 1);
    const bit = (value >>> shift) & 1;
    const flip = hashBit(seed, dimension, shift, cell);
    out = (out | ((bit ^ flip) << shift)) >>> 0;
  }
  return out;
}

function hashBit(
  seed: number,
  dimension: number,
  bit: number,
  cell: number,
): number {
  let mixed = (seed + 0x9e3779b9) >>> 0;
  mixed = Math.imul(mixed ^ (dimension + 1), 0x85ebca6b);
  mixed = Math.imul(mixed ^ (bit + 1), 0xc2b2ae35);
  mixed = Math.imul(mixed ^ cell, 0x27d4eb2d);
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed & 1;
}

function dimensionOne(): number[] {
  const dirs: number[] = [];
  for (let bit = 0; bit < BITS; bit += 1) {
    dirs.push((0x80000000 >>> bit) >>> 0);
  }
  return dirs;
}

function expand(
  degree: number,
  coefficient: number,
  initial: readonly number[],
): number[] {
  if (initial.length !== degree) {
    throw new Error(
      "Sobol degree does not match its initial direction numbers.",
    );
  }
  const values: bigint[] = [0n];
  for (const value of initial) {
    values.push(BigInt(value));
  }
  for (let index = degree + 1; index <= BITS; index += 1) {
    const earlier = values[index - degree];
    if (earlier === undefined) {
      throw new Error("Sobol lost an m value.");
    }
    let next = (earlier << BigInt(degree)) ^ earlier;
    for (let lag = 1; lag < degree; lag += 1) {
      const bit = (coefficient >> (degree - 1 - lag)) & 1;
      if (bit !== 1) {
        continue;
      }
      const previous = values[index - lag];
      if (previous === undefined) {
        throw new Error("Sobol lost an m value.");
      }
      next ^= previous << BigInt(lag);
    }
    if (next < 0n || next >= 1n << BigInt(index)) {
      throw new Error("Sobol direction number fell outside its bit width.");
    }
    values.push(next);
  }
  const dirs: number[] = [];
  for (let index = 1; index <= BITS; index += 1) {
    const value = values[index];
    if (value === undefined) {
      throw new Error("Sobol lost an m value.");
    }
    dirs.push(Number((value << BigInt(BITS - index)) & 0xffffffffn));
  }
  return dirs;
}
