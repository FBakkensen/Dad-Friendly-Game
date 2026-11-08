import { formatCompact } from "./format";

/** The dial's full scale in the current unit: 0..15 of the x100 unit. */
export const GAUGE_FULL = 1500;
/** The highest unit step: x100T. */
export const GAUGE_MAX_K = 12;
/** Frames in gauge-output-sheet.png (11 columns, 5 rows), one per 5 degrees. */
export const GAUGE_FRAMES = 55;

const ANGLE_MIN = -135;
const ANGLE_SWEEP = 270;
const ANGLE_PIN = 138;

function clean(rate: number): number {
  return Number.isNaN(rate) ? 0 : Math.max(0, rate);
}

/** The smallest unit step k whose dial (GAUGE_FULL x 10^k) holds the rate. */
export function gaugeRange(rate: number): number {
  const value = clean(rate);
  for (let k = 0; k < GAUGE_MAX_K; k += 1) {
    if (value <= GAUGE_FULL * 10 ** k) {
      return k;
    }
  }
  return GAUGE_MAX_K;
}

/** The mark beside the dial: "x100", "x1000", "x10K" ... "x100T". */
export function gaugeUnitText(k: number): string {
  const unit = 100 * 10 ** k;
  return unit < 10_000 ? `×${String(unit)}` : `×${formatCompact(unit)}`;
}

/** Where the needle should point for this rate in unit k, in degrees. */
export function gaugeAngle(rate: number, k: number): number {
  const share = Math.min(1, clean(rate) / (GAUGE_FULL * 10 ** k));
  return ANGLE_MIN + ANGLE_SWEEP * share;
}

export type Needle = { readonly angle: number; readonly velocity: number };

export const NEEDLE_REST: Needle = { angle: ANGLE_MIN, velocity: 0 };

/** One step of the damped spring (the mockup's paintGauge). */
export function needleStep(needle: Needle, target: number, dt: number): Needle {
  const accel = 46 * (target - needle.angle) - 8.2 * needle.velocity;
  const velocity = needle.velocity + accel * dt;
  const angle = needle.angle + velocity * dt;
  if (angle > ANGLE_PIN) {
    return { angle: ANGLE_PIN, velocity: -Math.abs(velocity) * 0.3 };
  }
  if (angle < ANGLE_MIN) {
    return { angle: ANGLE_MIN, velocity: 0 };
  }
  return { angle, velocity };
}

/** A tap's jolt: adds to the needle's velocity. */
export function needleKick(needle: Needle, by: number): Needle {
  return { angle: needle.angle, velocity: needle.velocity + by };
}

/** The sheet frame for an angle: column f % 11, row floor(f / 11). */
export function needleFrame(angle: number): number {
  const frame = Math.round((angle - ANGLE_MIN) / 5);
  return Math.max(0, Math.min(GAUGE_FRAMES - 1, frame));
}

const READING_UNITS: readonly {
  readonly value: number;
  readonly suffix: string;
}[] = [
  { value: 1e12, suffix: "T" },
  { value: 1e9, suffix: "B" },
  { value: 1e6, suffix: "M" },
  { value: 1e3, suffix: "K" },
];

/** The counter's text, at most five characters, rounding down. */
export function gaugeReading(rate: number): string {
  if (Number.isNaN(rate) || rate < 0) {
    return "0";
  }
  if (rate >= 1e15) {
    return ">999T";
  }
  if (rate < 1000) {
    return String(Math.floor(rate));
  }
  for (const { value, suffix } of READING_UNITS) {
    if (rate >= value) {
      if (rate >= 100 * value) {
        return `${String(Math.floor(rate / value))}${suffix}`;
      }
      const tenths = Math.floor((rate * 10) / value);
      const text =
        tenths % 10 === 0
          ? String(tenths / 10)
          : `${String(Math.floor(tenths / 10))}.${String(tenths % 10)}`;
      return `${text}${suffix}`;
    }
  }
  return String(Math.floor(rate));
}
