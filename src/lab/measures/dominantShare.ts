import { defineMeasure, type DecisionSample } from "../measure";
import { HOUR_MS, OPENING_HOURS } from "../targets";

function afterOpening(
  samples: readonly DecisionSample[],
): readonly DecisionSample[] {
  const from = OPENING_HOURS * HOUR_MS;
  return samples.filter((sample) => sample.atMs >= from);
}

/**
 * Share of samples, after the first hour, where the most common best spend
 * on this dad's own table is the best one. Samples with nothing on the
 * table (`""`) are skipped.
 */
function dominantShareOf(samples: readonly DecisionSample[]): number {
  const later = afterOpening(samples).filter(
    (sample) => sample.stretch.payback.bestId !== "",
  );
  if (later.length === 0) {
    return 0;
  }
  const counts = new Map<string, number>();
  for (const sample of later) {
    const id = sample.stretch.payback.bestId;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  let bestCount = 0;
  for (const count of counts.values()) {
    if (count > bestCount) {
      bestCount = count;
    }
  }
  return bestCount / later.length;
}

export default defineMeasure({
  id: "dominantShare",
  label: "Dominant move",
  unit: "share",
  why: "If one spend is usually best on the dad's own table, the other buttons are scenery.",
  aggregate: (samples) => dominantShareOf(samples),
});
