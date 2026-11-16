// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "./mountain";
import { promotePayoff } from "./rates";
import { PROMOTION_INTRO, promotionPayoff } from "./screen-words";
import { showsDot } from "./teach";

const ada = { name: "Ada", rank: 0, trips: 1, post: "camp" } as const;
/**
 * After the first trip, the face the narrow stage (one drill against two
 * carts and two hoists), one worker free, and the stone for the second
 * engineer.
 */
function crew(): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: {
      ...start.owned,
      helper: 6,
      drill: 1,
      cart: 2,
      hoist: 2,
      borer: 1,
    },
    jobs: { ...start.jobs, drilling: 1, haulage: 2, hoisting: 2 },
    stock: { ...start.stock, stones: 1e9 },
    engineers: [ada],
    seen: ["workshop", "engineers"],
    taught: ["workshop", "engineers", "staffing"],
  };
}

describe("promotion teach (#246)", () => {
  it("is small: a dot with no note, only when he can pay and it pays", () => {
    expect(promotePayoff(crew())?.post).toBe("drill");
    expect(showsDot(crew(), "promotion")).toBe(true);
    expect(
      showsDot(
        { ...crew(), stock: { ...crew().stock, stones: 0 } },
        "promotion",
      ),
    ).toBe(false);
    // Nobody free to step up.
    expect(
      showsDot(
        { ...crew(), owned: { ...crew().owned, helper: 5 } },
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
    // Ada already on the drill: no post left that pays, so no nudge to
    // lose a worker.
    expect(
      showsDot(
        { ...crew(), engineers: [{ ...ada, post: "drill" }] },
        "promotion",
      ),
    ).toBe(false);
  });

  it("words the payoff with no question", () => {
    expect(promotionPayoff("Nils", "drill", "+217 stones/sec")).toBe(
      "Nils could tend the drills: +217 stones/sec",
    );
    expect(PROMOTION_INTRO).not.toContain("?");
  });
});
