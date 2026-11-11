// Long economy sims: the sim project (npm run gate -- full), not the fast tier.
import { describe, expect, it } from "vitest";
import { RELICS } from "../relics";
import { simulateDadRun } from "../pacing";
import casual from "./policies/casual-2x10";
import checker from "./policies/checker-6x3";
import optimizer from "./policies/optimizer";
import skipCrafting from "./policies/skip-crafting";
import { isSampleSecond } from "./casual";
import type { DecisionSample } from "./measure";
import { longestMaterialIdleDays } from "./measures/materialIdle";
import { valueContext } from "./policy";
import { scoreDecision } from "./score";
import { runPolicy, type PolicyRun } from "./run";
import { NOTHING_CRAFTED } from "../workshop";

const mantle = RELICS.find((relic) => relic.id === "mantle")?.depth ?? 0;

let casualRun: PolicyRun | undefined;

function playCasual(): PolicyRun {
  casualRun ??= runPolicy({ policy: casual, seed: 1 });
  return casualRun;
}

describe("casual-2x10", () => {
  it("lets a dad who skips the workshop match today's plain dad", () => {
    const dad = simulateDadRun({ milestones: [mantle] });
    const run = runPolicy({ policy: skipCrafting, seed: 1 });
    expect(run.finishDay).toBe(dad.reached.get(mantle));
    expect(run.buys).toEqual(
      dad.buys.map(({ day, id, price }) => ({ day, id, price })),
    );
    expect(run.promotions).toEqual(
      dad.promotions.map(({ day, name, price }) => ({ day, name, price })),
    );
    expect(run.world.mountain.crafted).toEqual(NOTHING_CRAFTED);
    expect(run.world.mountain.bench).toBeUndefined();
  }, 120_000);
});

describe("other schedules", () => {
  it("jitters the checker's gaps from the seed, and replays them", () => {
    expect(checker.params).toMatchObject({
      sessionsPerDay: 6,
      minutesPerSession: 3,
    });
    expect(checker.schedule.gapMs(0, 1)).toBe(checker.schedule.gapMs(0, 1));
    expect(checker.schedule.gapMs(0, 1)).not.toBe(checker.schedule.gapMs(0, 2));
    const again = runPolicy({ policy: checker, seed: 3, maxDays: 1 });
    expect(again).toEqual(runPolicy({ policy: checker, seed: 3, maxDays: 1 }));
    expect(again.world.mountain.pocket).not.toBe(
      runPolicy({ policy: checker, seed: 9, maxDays: 1 }).world.mountain.pocket,
    );
    // Three one-day runs: about 1s alone, over 5s on a busy CI runner.
  }, 30_000);
});

describe("optimizer", () => {
  it("finishes no later than casual", () => {
    const run = runPolicy({ policy: optimizer, seed: 1 });
    expect(run.finishDay).toBeLessThanOrEqual(
      playCasual().finishDay ?? Infinity,
    );
    expect(run.finishDay).toBeTypeOf("number");
  }, 120_000);
});

describe("crafting", () => {
  it("keeps a casual dad's iron inside what the open recipes can take", () => {
    const samples: DecisionSample[] = [];
    let live = 0;
    let iron = 0;
    const context = valueContext(casual.params);
    runPolicy({
      policy: casual,
      seed: 1,
      maxDays: 8,
      observe(world) {
        if (isSampleSecond(live)) {
          samples.push(
            scoreDecision({
              mountain: world.mountain,
              now: world.clock,
              context,
              atMs: world.clock,
              craft: casual.params.craft,
            }),
          );
          iron = Math.max(iron, world.mountain.materials.iron);
        }
        live += 1;
      },
    });
    expect(iron).toBeGreaterThan(0);
    expect(longestMaterialIdleDays(samples)).toBe(0);
  }, 120_000);
});
