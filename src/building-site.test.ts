import { describe, expect, it } from "vitest";
import { SITE_HOLDS, goodsTotal, stepWork } from "./building-site";
import type { Site } from "./city";
import { flowWhole } from "./piles";
import { EMPTY_STOCK } from "./stock";

/** The Light Tower's first step (25,000 stones) with `arrived` in and `held` of it on the site. */
function lightTower(arrived: number, held: number): Site {
  return {
    building: "lightTower",
    step: 0,
    arrived: { ...EMPTY_STOCK, stones: arrived },
    onSite: { ...EMPTY_STOCK, stones: held },
  };
}

describe("the building site's flow (#690, #703)", () => {
  const cases = [
    {
      name: "builders faster than transport",
      pocket: 10_000,
      held: 0,
      carry: 9,
      build: 16,
      seconds: 100,
    },
    {
      name: "transport faster, and the site fills mid-stretch",
      pocket: 10_000,
      held: 100,
      carry: 18,
      build: 8,
      seconds: 100,
    },
    {
      name: "the site starts full",
      pocket: 10_000,
      held: SITE_HOLDS,
      carry: 36,
      build: 8,
      seconds: 37.3,
    },
    {
      name: "the pocket runs dry mid-stretch",
      pocket: 300,
      held: 450,
      carry: 18,
      build: 2,
      seconds: 90,
    },
  ] as const;

  it("the site's flow is the shared chain", () => {
    for (const { pocket, held, carry, build, seconds } of cases) {
      const work = stepWork(
        lightTower(1_000, held),
        { ...EMPTY_STOCK, stones: pocket },
        carry,
        build,
        seconds,
      );
      const chain = flowWhole(
        {
          source: pocket,
          rates: [carry, build],
          piles: [{ held, holds: SITE_HOLDS }],
        },
        seconds,
      );
      expect(work.done).toBe(false);
      expect([goodsTotal(work.delivered), goodsTotal(work.built)]).toEqual(
        chain.moved,
      );
    }
  });
});
