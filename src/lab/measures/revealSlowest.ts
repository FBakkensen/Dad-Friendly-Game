import { defineMeasure } from "../measure";
import { REVEAL_LIST_HOURS, REVEAL_LIST_SIZE } from "../targets";
import { gapsOf } from "./revealToUse";

/** Longest wait per id across every run, as `id 12.3h`, longest first. */
export function slowestReveals(
  gaps: readonly { readonly id: string; readonly hours: number }[],
): readonly string[] {
  const worst = new Map<string, number>();
  for (const gap of gaps) {
    worst.set(gap.id, Math.max(worst.get(gap.id) ?? 0, gap.hours));
  }
  return [...worst]
    .filter(([, hours]) => hours >= REVEAL_LIST_HOURS)
    .sort((left, right) => right[1] - left[1])
    .slice(0, REVEAL_LIST_SIZE)
    .map(([id, hours]) => `${id} ${hours.toFixed(1)}h`);
}

/** Report only: names what waits longest between showing up and first use. */
export default defineMeasure({
  id: "revealSlowest",
  label: "Waits longest after it shows",
  unit: "ids",
  why: "Names the things that show up long before the dad uses them.",
  aggregate: (samples) => slowestReveals(gapsOf(samples)),
});
