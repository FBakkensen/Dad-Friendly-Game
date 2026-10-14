import { withFactors } from "../../src/economy/factors";
import { isSampleSecond, withFinish } from "../../src/lab/casual";
import { type DecisionSample, type Measure } from "../../src/lab/measure";
import { valueContext, type Policy } from "../../src/lab/policy";
import { runPolicy } from "../../src/lab/run";
import { scoreDecision } from "../../src/lab/score";

/**
 * One policy, one seed, scored by the measures it is given.
 * The minute grid matches the tournament. The sweep keeps its own copy so
 * a change to the tournament runner does not have to land here.
 */
export function scorePolicy(input: {
  readonly policy: Policy;
  readonly measures: readonly Measure[];
  readonly seed: number;
  readonly days: number;
  readonly multipliers: Readonly<Record<string, number>>;
}): readonly number[] {
  return withFactors(input.multipliers, () => {
    const samples = samplePolicy(input.policy, input.seed, input.days);
    return input.measures.map((measure) => {
      const value = measure.aggregate(samples);
      if (typeof value !== "number") {
        throw new Error(`Measure "${measure.id}" is not a single number.`);
      }
      return value;
    });
  });
}

function samplePolicy(
  policy: Policy,
  seed: number,
  days: number,
): readonly DecisionSample[] {
  const samples: DecisionSample[] = [];
  let live = 0;
  const context = valueContext(policy.params);
  const run = runPolicy({
    policy,
    seed,
    maxDays: days,
    observe(world) {
      if (isSampleSecond(live)) {
        const trouble =
          world.hazards.phase === "trouble" ? world.hazards.trouble : undefined;
        samples.push(
          scoreDecision({
            mountain: world.mountain,
            now: world.clock,
            context,
            atMs: world.clock,
            craft: policy.params.craft,
            ...(trouble === undefined ? {} : { trouble }),
          }),
        );
      }
      live += 1;
    },
  });
  return withFinish(samples, run.finishDay);
}
