import type { DecisionSample, ScoreMethod } from "./measure";
import { DEAD_STRETCH, HOUR_MS } from "./targets";

export type Stretch = {
  readonly startMs: number;
  readonly endMs: number;
  readonly hours: number;
};

/**
 * True when the only live options on this dad's spend table need at least
 * one session of saving. A cheaper legal move the dad will not buy, or a
 * free post, does not end the wait. A shorter save is the end of a sitting.
 */
function isDeadSample(sample: DecisionSample, method: ScoreMethod): boolean {
  const view =
    method === "value" ? sample.stretch.value : sample.stretch.payback;
  return (
    view.liveCount > 0 &&
    view.affordableLive === 0 &&
    view.waitToAffordSec >= DEAD_STRETCH.minWaitSec
  );
}

/** Every waiting run, in order. Length is hours until the wait breaks. */
export function deadStretches(
  samples: readonly DecisionSample[],
  method: ScoreMethod,
): readonly Stretch[] {
  const ordered = [...samples].sort((left, right) => left.atMs - right.atMs);
  const found: Stretch[] = [];
  let start: number | undefined;
  const close = (from: number, to: number) => {
    found.push({
      startMs: from,
      endMs: to,
      hours: (to - from) / HOUR_MS,
    });
  };
  for (const sample of ordered) {
    if (isDeadSample(sample, method)) {
      if (start === undefined) {
        start = sample.atMs;
      }
      continue;
    }
    if (start !== undefined) {
      close(start, sample.atMs);
      start = undefined;
    }
  }
  const last = ordered[ordered.length - 1];
  if (start !== undefined && last !== undefined) {
    close(start, last.atMs);
  }
  return found;
}

/** The longest waiting run, or undefined when the dad is never stuck. */
export function longestStretch(
  samples: readonly DecisionSample[],
  method: ScoreMethod,
): Stretch | undefined {
  let worst: Stretch | undefined;
  for (const stretch of deadStretches(samples, method)) {
    if (worst === undefined || stretch.hours > worst.hours) {
      worst = stretch;
    }
  }
  return worst;
}

/** Hours of the longest wait. 0 when there is no wait. */
export function longestDeadHours(
  samples: readonly DecisionSample[],
  method: ScoreMethod,
): number {
  return longestStretch(samples, method)?.hours ?? 0;
}
