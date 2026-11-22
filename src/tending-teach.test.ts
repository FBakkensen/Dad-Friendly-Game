// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "./mountain";
import { firstTend } from "./rates";
import { tendingIntro } from "./screen-words";
import { showsDot } from "./teach";

const ada = { name: "Ada", rank: 0, trips: 1, post: "camp" } as const;
/**
 * After the first trip, Ada waiting at camp, and the face the narrow stage:
 * one drill against two carts and two hoists.
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
    engineers: [ada],
    seen: ["engineers"],
    taught: ["engineers"],
  };
}

describe("tending teach (#246)", () => {
  it("is small: a dot with no note, only once there is a step up", () => {
    expect(showsDot(crew(), "tending")).toBe(true);
    // On the drill nothing pays more: no dot asks for a step down.
    expect(
      showsDot(
        { ...crew(), engineers: [{ ...ada, post: "drill" }] },
        "tending",
      ),
    ).toBe(false);
    expect(
      showsDot(
        { ...crew(), engineers: [{ ...ada, trips: 0 }], taught: [] },
        "tending",
      ),
    ).toBe(false);
    expect(firstTend(crew())).toEqual({ index: 0, post: "drill" });
    // A save with no crew at all has no first tend.
    expect(firstTend({ ...crew(), engineers: [] })).toBeUndefined();
  });

  it("words the intro with no question", () => {
    expect(tendingIntro("Ada")).not.toContain("?");
  });
});
