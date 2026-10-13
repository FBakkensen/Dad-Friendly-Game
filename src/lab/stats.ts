import { MIDPOINT_DIVISOR, PERCENT } from "./targets";

/** Mean of the values. An empty list is 0. */
export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  let total = 0;
  for (const value of values) {
    total += value;
  }
  return total / values.length;
}

function sortedCopy(values: readonly number[]): number[] {
  return [...values].sort((left, right) => left - right);
}

/**
 * Inclusive rank. `p` is a percent (10 is the tenth percentile).
 * An empty list is 0.
 */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = sortedCopy(values);
  const rank = (p / PERCENT) * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const left = sorted[lower] ?? 0;
  const right = sorted[upper] ?? left;
  return left + (right - left) * (rank - lower);
}

/** Middle of the sorted values. An even count averages the two middle ones. */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = sortedCopy(values);
  const mid = (sorted.length - 1) / MIDPOINT_DIVISOR;
  const lower = Math.floor(mid);
  const upper = Math.ceil(mid);
  const left = sorted[lower] ?? 0;
  const right = sorted[upper] ?? left;
  return left + (right - left) * (mid - lower);
}
