import type { DecisionSample, ScoreMethod } from "./measure";
import { HOUR_MS } from "./targets";

export type Stretch = {
  readonly startMs: number;
  readonly endMs: number;
  readonly hours: number;
};

function counts(
  sample: DecisionSample,
  method: ScoreMethod,
): { readonly live: number; readonly affordable: number } {
  if (method === "value") {
    return {
      live: sample.byValue.liveCount,
      affordable: sample.byValue.affordableLive,
    };
  }
  return { live: sample.liveCount, affordable: sample.affordableLive };
}

/**
 * True when the dad is only waiting: the table has a live option, and the
 * pocket cannot pay for any of them.
 */
function isDeadSample(sample: DecisionSample, method: ScoreMethod): boolean {
  const { live, affordable } = counts(sample, method);
  return live > 0 && affordable === 0;
}

/** Every waiting run, in order. Length is hours until the wait breaks. */
function deadStretches(
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
