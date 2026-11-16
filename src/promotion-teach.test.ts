// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "./mountain";
import { effectiveRates, promotePayoff } from "./rates";
import { promote, station } from "./engineers";
import { PROMOTION_INTRO, promotionPayoff } from "./screen-words";
import { showsDot } from "./teach";

const ada = { name: "Ada", rank: 0, trips: 1, post: "borer" } as const;
/** After the first trip, with 2M for the second engineer. */
function crew(): Mountain {
  return {
    ...createMountain(),
    remaining: 200_000_000,
    // 40M mined is the Granite: the second engineer costs 2M × 3 (#356).
    stock: { ...createMountain().stock, stones: 6_500_000 },
    owned: {
      ...createMountain().owned,
      helper: 60,
      cart: 10,
      drill: 6,
      borer: 2,
    },
    engineers: [ada],
    seen: ["workshop", "engineers"],
    taught: ["workshop", "engineers", "staffing"],
  };
}

function withoutEngineers(): Mountain {
  return { ...crew(), engineers: [] };
}

describe("promotion teach (#246)", () => {
  it("is small: a dot with no note, only when he can pay and it pays", () => {
    expect(showsDot(crew(), "promotion")).toBe(true);
    expect(
      showsDot(
        { ...crew(), stock: { ...crew().stock, stones: 1_000_000 } },
        "promotion",
      ),
    ).toBe(false);
    expect(
      showsDot(
        { ...crew(), owned: { ...crew().owned, helper: 0 } },
        "promotion",
      ),
    ).toBe(false);
    expect(
      showsDot(
        {
          ...crew(),
          engineers: [{ ...ada, trips: 0 }],
          taught: ["workshop", "staffing"],
        },
        "promotion",
      ),
    ).toBe(false);
    // No machine for the new hand to tend: no nudge to lose a worker.
    expect(
      showsDot(
        { ...crew(), owned: { ...crew().owned, cart: 0, drill: 0, borer: 1 } },
        "promotion",
      ),
    ).toBe(false);
  });

  it("counts the worker who steps up in the payoff", () => {
    const payoff = promotePayoff(crew(), 0);
    expect(payoff?.name).toBe("Nils");
    expect(payoff?.post).toBe("drill");
    const promoted = promote(crew());
    const after = effectiveRates(
      station(promoted, 1, "drill"),
      0,
    ).crewPerSecond;
    expect(payoff?.gain).toBeCloseTo(
      after - effectiveRates(crew(), 0).crewPerSecond,
    );
    // With no engineer yet, the first hand is Ada, and any post is free.
    expect(promotePayoff(withoutEngineers(), 0)?.name).toBe("Ada");
    expect(
      promotePayoff({ ...crew(), stock: { ...crew().stock, stones: 0 } }, 0),
    ).toBe(undefined);
    expect(promotionPayoff("Nils", "drill", "+217 stones/sec")).toBe(
      "Nils could tend the drills: +217 stones/sec",
    );
    expect(PROMOTION_INTRO).not.toContain("?");
  });
});
