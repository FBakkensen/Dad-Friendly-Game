// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "./mountain";
import { firstTend } from "./rates";
import { tendingIntro } from "./screen-words";
import { noteFor, showsDot } from "./teach";

const ada = { name: "Ada", rank: 0, trips: 1, post: "camp" } as const;
/** After the first trip, Ada waiting at camp, a Great Machine to tend. */
function crew(): Mountain {
  return {
    ...createMountain(),
    remaining: 200_000_000,
    stock: { ...createMountain().stock, stones: 2_000_000 },
    owned: {
      ...createMountain().owned,
      helper: 60,
      cart: 10,
      drill: 6,
      borer: 2,
      machine: 1,
    },
    engineers: [ada],
    seen: ["workshop", "engineers"],
    taught: ["workshop", "engineers"],
  };
}

describe("tending teach (#246)", () => {
  it("is small: a dot with no note, only once there is a step up", () => {
    expect(showsDot(crew(), "tending")).toBe(true);
    expect(noteFor(crew())).toBe(undefined);
    // On the borers nothing pays more: no dot asks for a step down.
    expect(
      showsDot(
        { ...crew(), engineers: [{ ...ada, post: "borer" }] },
        "tending",
      ),
    ).toBe(false);
    expect(
      showsDot(
        { ...crew(), engineers: [{ ...ada, trips: 0 }], taught: ["workshop"] },
        "tending",
      ),
    ).toBe(false);
    expect(firstTend(crew())).toEqual({ index: 0, post: "machine" });
    expect(
      firstTend({ ...crew(), owned: { ...crew().owned, machine: 0 } }),
    ).toEqual({
      index: 0,
      post: "borer",
    });
    // A save with no crew at all has no first tend.
    const noCrew = { ...crew(), engineers: [] };
    expect(firstTend(noCrew)).toBeUndefined();
  });

  it("skips an engineer out on a trip, for the next one at home", () => {
    const nils = { ...ada, name: "Nils" } as const;
    const out: Mountain = {
      ...crew(),
      engineers: [ada, nils],
      expeditions: [
        {
          engineer: "Ada",
          tunnel: "side-seam",
          sentAt: 0,
          returnsAt: 60_000,
          find: { kind: "quiet" },
        },
      ],
    };
    expect(firstTend(out, 0)).toEqual({ index: 1, post: "machine" });
  });

  it("words the intro with no question", () => {
    expect(tendingIntro("Ada")).not.toContain("?");
  });
});
