import { describe, expect, it } from "vitest";
import { minedMountain } from "./test-fixtures";
import {
  crewLine,
  keptUntilWords,
  lastPlayedWords,
  machineLine,
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
  it("uses the short numbers and the band name", () => {
    const now = at(2026, 10, 22, 15, 0);
    const lines = saveCardLines(
      {
        ...minedMountain(12_400_000),
        pocket: 1_200_000,
        carts: 6,
        drills: 4,
        borers: 1,
        machines: 1,
        helpers: 28,
        engineers: [
          { name: "Ada", rank: 0, trips: 0, post: "borer" },
          { name: "Nils", rank: 0, trips: 0, post: "camp" },
          { name: "Ruth", rank: 0, trips: 0, post: "drill" },
          { name: "Otto", rank: 0, trips: 0, post: "cart" },
        ],
      },
      at(2026, 10, 22, 14, 32),
      now,
    );
    expect(lines).toEqual({
      depth: "Granite, 12.4M deep",
      pocket: "1.2M stones in the pocket",
      machines: "6 carts · 4 drills · 1 borer · the Great Machine",
      crew: "28 workers · 4 engineers",
      played: "Today 14:32",
    });
  });

  it("says yesterday, a date, and when nothing has been built", () => {
    expect(
      lastPlayedWords(at(2026, 10, 21, 21, 5), at(2026, 10, 22, 8, 0)),
    ).toBe("Yesterday 21:05");
    expect(lastPlayedWords(at(2026, 10, 1, 9, 4), at(2026, 10, 22, 8, 0))).toBe(
      "1 Oct 09:04",
    );
    expect(machineLine(minedMountain(1))).toBe("No machines yet");
    expect(machineLine({ ...minedMountain(1), machines: 2 })).toBe(
      "2 Great Machines",
    );
    expect(crewLine({ ...minedMountain(1), helpers: 1 })).toBe(
      "1 worker · 0 engineers",
    );
    expect(keptUntilWords(at(2026, 10, 29, 14, 32))).toBe("Until 29 Oct");
    expect(
      saveCardLines(minedMountain(0), undefined, at(2026, 10, 22, 8, 0)).played,
    ).toBe("Not played yet");
  });
});
