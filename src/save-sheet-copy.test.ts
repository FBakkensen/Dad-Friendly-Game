import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { createMountain, type Mountain } from "./mountain";
import { minedMountain } from "./test-fixtures";
import {
  keptUntilWords,
  lastPlayedWords,
  saveCardLines,
} from "./save-sheet-copy";

const at = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
) => new Date(year, month - 1, day, hour, minute).getTime();

describe("save card lines", () => {
  it("says yesterday, a date, how long a copy is kept, and not played yet", () => {
    expect(
      lastPlayedWords(at(2026, 10, 21, 21, 5), at(2026, 10, 22, 8, 0)),
    ).toBe("Yesterday 21:05");
    expect(lastPlayedWords(at(2026, 10, 1, 9, 4), at(2026, 10, 22, 8, 0))).toBe(
      "1 Oct 09:04",
    );
    expect(keptUntilWords(at(2026, 10, 29, 14, 32))).toBe("Until 29 Oct");
    expect(
      saveCardLines(minedMountain(0), undefined, at(2026, 10, 22, 8, 0)).played,
    ).toBe("Not played yet");
  });
});

/** A save card in a fresh mine (#707): its project, stone, machines and workers. */
describe("save card lines in a fresh mine", () => {
  const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);
  const now = at(2026, 11, 15, 21, 0);

  const grown = (): Mountain => {
    const mountain = createMountain();
    return {
      ...mountain,
      stock: { ...mountain.stock, stones: 4_200 },
      owned: { ...mountain.owned, helper: 30, cart: 6, drill: 5, hoist: 3 },
      fleet: { ...mountain.fleet, horseWagon: 2 },
      project: {
        kind: "delivering",
        site: {
          building: "lightTower",
          step: 0,
          arrived: { ...mountain.stock, stones: 1_400 },
          onSite: { ...mountain.stock, stones: 200 },
        },
      },
    };
  };

  it("names the project in the order strip's words, the stone, the machines and the workers with their wagons", () => {
    const lines = fresh(() => saveCardLines(grown(), now - 60_000, now));
    expect(lines).toEqual({
      depth: "The Light Tower · Foundation",
      pocket: "4,200 stone in the stockpile",
      machines: "5 drills · 6 carts · 3 hoists",
      crew: "30 workers · 2 horse wagons",
      played: "Today 20:59",
    });
  });

  it("says the building is operational after its roof, and no machines yet", () => {
    const mountain = createMountain();
    const lines = fresh(() =>
      saveCardLines(
        {
          ...mountain,
          owned: { ...mountain.owned, helper: 1 },
          fleet: { ...mountain.fleet, horseWagon: 0 },
          operational: ["lightTower"],
        },
        undefined,
        now,
      ),
    );
    expect(lines.depth).toBe("The Light Tower is operational");
    expect(lines.machines).toBe("No machines yet");
    expect(lines.crew).toBe("1 worker");
  });
});
