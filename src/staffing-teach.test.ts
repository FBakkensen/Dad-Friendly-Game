// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "./mountain";
import { buyWithTeach } from "./economy/actions";
import { firstIdleTier } from "./rates";
import { STAFFING_INTRO, staffingLine } from "./screen-words";
import { showsDot } from "./teach";

/** Ten carts and two on haulage: eight carts stand idle. */
function crew(): Mountain {
  const start = createMountain();
  return {
    ...start,
    stock: { ...start.stock, stones: 2_000_000 },
    owned: { ...start.owned, helper: 3, cart: 10 },
    jobs: { ...start.jobs, haulage: 2 },
    seen: ["workshop"],
    taught: ["workshop"],
  };
}

describe("staffing teach (#246)", () => {
  it("is small: a dot with no note while a machine stands idle", () => {
    expect(firstIdleTier(crew())).toBe("cart");
    expect(showsDot(crew(), "staffing")).toBe(true);
    expect(
      showsDot(
        {
          ...crew(),
          owned: { ...crew().owned, helper: 11 },
          jobs: { ...crew().jobs, haulage: 10 },
        },
        "staffing",
      ),
    ).toBe(false);
    expect(
      showsDot({ ...crew(), taught: ["workshop", "staffing"] }, "staffing"),
    ).toBe(false);
  });

  it("words the bill without the free count and never asks", () => {
    expect(staffingLine(1, 4)).toBe("Needs 1 worker each · 4 idle");
    expect(staffingLine(3, 2)).toBe("Needs 3 workers each · 2 idle");
    expect(staffingLine(3, 2)).not.toContain("free");
    expect(STAFFING_INTRO).not.toContain("?");
  });
});

describe("buyWithTeach", () => {
  it("a worker bought while a machine stands idle marks staffing taught", () => {
    const before = crew();
    expect(showsDot(before, "staffing")).toBe(true);
    const after = buyWithTeach(before, "helper");
    expect(after.owned.helper).toBe(before.owned.helper + 1);
    expect(after.taught).toContain("staffing");
  });

  it("a cart is bought, and staffing stays untaught", () => {
    const before = crew();
    const after = buyWithTeach(before, "cart");
    expect(after.owned.cart).toBe(before.owned.cart + 1);
    expect(after.taught).not.toContain("staffing");
  });

  it("an unaffordable tier returns the same mountain", () => {
    const broke = { ...crew(), stock: { ...crew().stock, stones: 0 } };
    expect(buyWithTeach(broke, "helper")).toBe(broke);
    expect(buyWithTeach(broke, "cart")).toBe(broke);
  });
});
