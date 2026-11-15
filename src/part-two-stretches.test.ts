import { describe, expect, it, vi } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import * as minePiles from "./mine-piles";
import { accrueAway, createMountain, type Mountain } from "./mountain";
import { PART_TWO_OFF } from "./part-switch";
import { EMPTY_STOCK } from "./stock";

vi.mock("./mine-piles", async (original) => {
  const real = await original<typeof import("./mine-piles")>();
  return { ...real, flowMine: vi.fn(real.flowMine) };
});

const HOUR = 60 * 60 * 1000;

/**
 * The clockless night in stretches (#666, PR review): transport that
 * outruns the mine takes a dry stockpile at what comes in, so the night is
 * not cut into one-second stretches.
 */
describe("a long night with transport faster than the mine (#666)", () => {
  it("runs in a handful of stretches, not one a second", () => {
    withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, () => {
      const start = createMountain();
      const mountain: Mountain = {
        ...start,
        owned: { ...start.owned, helper: 23 },
        jobs: {
          drilling: 1,
          haulage: 1,
          hoisting: 1,
          driving: 15,
          building: 4,
          kilns: 1,
        },
        stock: EMPTY_STOCK,
        makers: { kiln: 1 },
        piles: { face: 300, shaft: 300, kiln: 300 },
        operational: ["lightTower"],
        project: {
          kind: "delivering",
          site: {
            building: "warehouse",
            step: 0,
            arrived: EMPTY_STOCK,
            onSite: EMPTY_STOCK,
          },
        },
      };
      const flowMine = vi.mocked(minePiles.flowMine);
      flowMine.mockClear();
      const away = accrueAway({ mountain, lastSeen: 0, now: 48 * HOUR });
      expect(away.report.night?.delivered.brick).toBeGreaterThan(0);
      expect(flowMine.mock.calls.length).toBeLessThan(20);
    });
  });
});
