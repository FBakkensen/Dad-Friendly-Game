import path from "node:path";
import { describe, expect, it } from "vitest";
import { withFactors } from "../economy/factors";
import { PART_THREE_OFF, PART_TWO_OFF, PLAY_FACTORS } from "../part-switch";
import checker from "./fresh-policies/checker-6x3";
import { discover } from "./registry";
import { freshPlan } from "./fresh-dad";
import { freshView } from "./fresh-view";
import { parsePolicyExport } from "./policy";
import { LAB_FACTORS, runPolicy } from "./run";
import { MS_PER_SECOND, SAMPLE_INTERVAL_SEC } from "./targets";

// Plays part 1 to the Light Tower's roof for every player type, so it lives
// in the sim project (#655).
describe("the lab plays part 1 (#655)", { timeout: 300_000 }, () => {
  it("brings every player type to the Light Tower's roof, with machines tools never beat", async () => {
    const policies = await discover(
      path.resolve("src/lab/fresh-policies"),
      parsePolicyExport,
    );
    expect(policies.length).toBeGreaterThan(0);
    // Part 1 alone: the lab plays it only when the switch is named (#739).
    withFactors({ [PART_TWO_OFF]: 1 }, () => {
      for (const policy of policies) {
        let tick = 0;
        let last = 0;
        let idle = 0;
        let read = 0;
        const run = runPolicy({
          policy,
          seed: 1,
          observe: (world) => {
            tick += 1;
            const live = world.clock - last === MS_PER_SECOND;
            last = world.clock;
            if (tick % SAMPLE_INTERVAL_SEC !== 0) {
              return;
            }
            // A live second's plans settle well inside PLANS_A_SECOND.
            if (live) {
              expect(
                freshPlan(world.mountain, policy.fresh, policy.params.hoardK),
                policy.id,
              ).toEqual([]);
            }
            const share = freshView(world.mountain).idleMachines;
            if (!Number.isNaN(share)) {
              idle += share;
              read += 1;
            }
          },
        });
        expect(run.finishDay, policy.id).toBeDefined();
        expect(run.world.mountain.operational, policy.id).toEqual([
          "lightTower",
        ]);
        expect(read === 0 ? 0 : idle / read, policy.id).toBeLessThan(0.05);
      }
    });
  });
});

// Plays parts 1 and 2 alone to the Warehouse's roof for every player type (#667): the game
// before part 3's switch-on (#682), as `--factors part3.off=1` plays it.
describe("the lab plays part 2 (#667)", { timeout: 600_000 }, () => {
  it("brings every player type to the Warehouse's roof, with kilns and a stockyard", async () => {
    const policies = await discover(
      path.resolve("src/lab/fresh-policies"),
      parsePolicyExport,
    );
    withFactors({ ...PLAY_FACTORS, [PART_THREE_OFF]: 1 }, () => {
      for (const policy of policies) {
        const run = runPolicy({ policy, seed: 1 });
        const mountain = run.world.mountain;
        expect(run.finishDay, policy.id).toBeDefined();
        expect(mountain.operational, policy.id).toEqual([
          "lightTower",
          "warehouse",
        ]);
        expect(mountain.makers.kiln, policy.id).toBeGreaterThan(0);
        expect(mountain.jobs.kilns, policy.id).toBe(mountain.makers.kiln);
      }
    });
  });
});

// Plays the whole slice to the Foundry's roof for every player type (#675).
describe("the lab plays part 3 (#675)", { timeout: 900_000 }, () => {
  it("brings every player type to the Foundry's roof, with the shaft sunk and saws running", async () => {
    const policies = await discover(
      path.resolve("src/lab/fresh-policies"),
      parsePolicyExport,
    );
    withFactors(LAB_FACTORS, () => {
      for (const policy of policies) {
        const run = runPolicy({ policy, seed: 1 });
        const mountain = run.world.mountain;
        expect(run.finishDay, policy.id).toBeDefined();
        expect(mountain.operational, policy.id).toEqual([
          "lightTower",
          "warehouse",
          "foundry",
        ]);
        expect(mountain.granite.kind, policy.id).toBe("sunk");
        expect(mountain.makers.saw, policy.id).toBeGreaterThan(0);
        expect(mountain.jobs.saws, policy.id).toBe(mountain.makers.saw);
      }
    });
  });
});

// Three one-day runs of the checker in the game's mine: the sim project.
describe("the checker's sittings", () => {
  it("jitters the checker's gaps from the seed, and replays them", () => {
    expect(checker.params).toMatchObject({
      sessionsPerDay: 6,
      minutesPerSession: 3,
    });
    expect(checker.schedule.gapMs(0, 1)).toBe(checker.schedule.gapMs(0, 1));
    expect(checker.schedule.gapMs(0, 1)).not.toBe(checker.schedule.gapMs(0, 2));
    withFactors(PLAY_FACTORS, () => {
      const again = runPolicy({ policy: checker, seed: 3, maxDays: 1 });
      expect(again).toEqual(
        runPolicy({ policy: checker, seed: 3, maxDays: 1 }),
      );
      const other = runPolicy({ policy: checker, seed: 9, maxDays: 1 });
      expect(other.world.clock).not.toBe(again.world.clock);
    });
  }, 30_000);
});
