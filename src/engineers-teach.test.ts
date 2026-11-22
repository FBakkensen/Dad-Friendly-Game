// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "./mountain";

import { showsDot } from "./teach";
import { engineersIntro, engineersNote, firstTripWords } from "./screen-words";

const ada = { name: "Ada", rank: 0, trips: 0, post: "borer" } as const;
function crew(): Mountain {
  return {
    ...createMountain(),
    stock: { ...createMountain().stock, stones: 2_000_000 },
    owned: {
      ...createMountain().owned,
      helper: 30,
      cart: 10,
      drill: 6,
      borer: 1,
    },
    engineers: [ada],
    seen: [],
    taught: [],
  };
}

describe("engineers teach (#246)", () => {
  it("is a big system: a dot with the first engineer, gone after a trip", () => {
    expect(showsDot(createMountain(), "engineers")).toBe(false);
    expect(showsDot(crew(), "engineers")).toBe(true);
    expect(
      showsDot({ ...crew(), engineers: [{ ...ada, trips: 1 }] }, "engineers"),
    ).toBe(false);
  });

  it("words the note, intro and first trip with real numbers and no question", () => {
    expect(engineersNote("Ada")).toBe("New · Ada is your first engineer");
    expect(firstTripWords("Ada", 10 * 60_000)).toBe(
      "Send Ada exploring · 10 min",
    );
    for (const line of [engineersNote("Ada"), engineersIntro("Ada")]) {
      expect(line).not.toContain("?");
    }
  });
});
