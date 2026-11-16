import { describe, expect, it } from "vitest";
import { accrue, BARE_MOUNTAIN } from "./mountain";
import { crewedStart } from "./test-fixtures";

describe("accrue", () => {
  // A fresh mine with six on each stage, so the line moves.
  const crew = crewedStart();

  it("adds up to the same total however the time is sliced", () => {
    let mountain = crew;
    let at = 0;
    for (const to of [300, 1_200, 2_300, 4_750, 5_000]) {
      const result = accrue({ mountain, from: at, to });
      mountain = result.mountain;
      at = result.settledAt;
    }
    expect(mountain.stock.stones).toBeGreaterThan(0);
    expect(mountain).toEqual(
      accrue({ mountain: crew, from: 0, to: 5_000 }).mountain,
    );
  });

  it("does nothing without helpers or when the clock goes backwards", () => {
    const idle = {
      ...BARE_MOUNTAIN,
      remaining: 10,
      stock: { ...BARE_MOUNTAIN.stock, stones: 0 },
      owned: {
        ...BARE_MOUNTAIN.owned,
        helper: 0,
        cart: 0,
        drill: 0,
        borer: 0,
        machine: 0,
        kid: 0,
      },
    };
    expect(accrue({ mountain: idle, from: 0, to: 9_000 })).toEqual({
      mountain: idle,
      mined: 0,
      settledAt: 9_000,
    });
    expect(accrue({ mountain: crew, from: 5_000, to: 1_000 })).toEqual({
      mountain: crew,
      mined: 0,
      settledAt: 5_000,
    });
  });
});
