import path from "node:path";
import { describe, expect, it } from "vitest";
import { withFactors } from "../economy/factors";
import { FRESH_OFF } from "../line-switch";
import { discover } from "./registry";
import { freshView } from "./fresh-view";
import { parsePolicyExport } from "./policy";
import { runPolicy } from "./run";
import { SAMPLE_INTERVAL_SEC } from "./targets";

// Plays part 1 to the Light Tower's roof for every player type, so it lives
// in the sim project (#655).
describe("the lab plays part 1 (#655)", { timeout: 300_000 }, () => {
  it("brings every player type to the Light Tower's roof, with machines tools never beat", async () => {
    const policies = await discover(
      path.resolve("src/lab/fresh-policies"),
      parsePolicyExport,
    );
    expect(policies.length).toBeGreaterThan(0);
    withFactors({ [FRESH_OFF]: 0 }, () => {
      for (const policy of policies) {
        let tick = 0;
        let idle = 0;
        let read = 0;
        const run = runPolicy({
          policy,
          seed: 1,
          observe: (world) => {
            tick += 1;
            if (tick % SAMPLE_INTERVAL_SEC !== 0) {
              return;
            }
            const share = freshView(world.mountain)?.idleMachines;
            if (share !== undefined && !Number.isNaN(share)) {
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
