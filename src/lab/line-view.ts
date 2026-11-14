import { lineOn, lineView, type Stage } from "../line";
import type { Mountain } from "../mountain";
import { effectiveRates } from "../rates";
import { moreStones } from "../staffing";
import { TIERS, isMachine, owned } from "../tiers";
import type { DecisionSample } from "./measure";
import type { SittingEvent } from "./sittings";
import { median } from "./stats";

/**
 * What the lab reads off the line while a run plays it (#534, spec "Lab").
 * Every reading is undefined, or NaN in a measure, while the line is off.
 */

/** The narrow stage on this mountain now, or undefined with the line off. */
export function narrowAt(mountain: Mountain, now: number): Stage | undefined {
  if (!lineOn()) {
    return undefined;
  }
  const rates = effectiveRates(mountain, now);
  return lineView(rates.tierSpeed, rates.running).narrow;
}

/**
 * Machines bought between `before` and `after` that the line does not need:
 * each kind bought is weighed alone, as `after` with that kind set back to
 * its count before, at `now`, so a worker bought in the same second does not
 * hide a machine that moved nothing. 0 when nothing was bought. Undefined
 * with the line off.
 */
export function zeroGainBuysBetween(
  before: Mountain,
  after: Mountain,
  now: number,
): number | undefined {
  if (!lineOn()) {
    return undefined;
  }
  let zero = 0;
  let line: number | undefined;
  for (const tier of TIERS.filter(isMachine)) {
    const bought = owned(after, tier) - owned(before, tier);
    if (bought <= 0) {
      continue;
    }
    line ??= effectiveRates(after, now).exactCrewPerSecond;
    const without = { ...after, [tier.field]: owned(before, tier) };
    if (!moreStones(line, effectiveRates(without, now).exactCrewPerSecond)) {
      zero += bought;
    }
  }
  return zero;
}

function narrows(events: readonly SittingEvent[]): readonly Stage[] {
  return events.flatMap((event) =>
    event.narrow === undefined ? [] : [event.narrow],
  );
}

/** The longest run of sittings that open on the same narrow stage. NaN with none. */
export function narrowRunOf(events: readonly SittingEvent[]): number {
  const stages = narrows(events);
  if (stages.length === 0) {
    return Number.NaN;
  }
  let longest = 0;
  let run = 0;
  for (const [at, stage] of stages.entries()) {
    run = at > 0 && stages[at - 1] === stage ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  return longest;
}

/** The largest share of sittings one stage opens as the narrow one. NaN with none. */
export function narrowShareOf(events: readonly SittingEvent[]): number {
  const stages = narrows(events);
  if (stages.length === 0) {
    return Number.NaN;
  }
  const counts = new Map<Stage, number>();
  for (const stage of stages) {
    counts.set(stage, (counts.get(stage) ?? 0) + 1);
  }
  return Math.max(...counts.values()) / stages.length;
}

/** Machines bought over the run that added nothing to the line. NaN with the line off. */
export function zeroGainBuysOf(events: readonly SittingEvent[]): number {
  const counted = events.flatMap((event) =>
    event.zeroGainBuys === undefined ? [] : [event.zeroGainBuys],
  );
  return counted.length === 0
    ? Number.NaN
    : counted.reduce((total, n) => total + n, 0);
}

/** The median share of the line the hands carry on the narrow stage. NaN with none. */
export function handsCarryOf(samples: readonly DecisionSample[]): number {
  const shares = samples.flatMap((sample) =>
    sample.line === undefined ? [] : [sample.line.handsCarry],
  );
  return shares.length === 0 ? Number.NaN : median(shares);
}
