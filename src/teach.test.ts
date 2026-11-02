import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "./mountain";
import {
  markSeen,
  noteFor,
  parseTeachIds,
  recordFirstUse,
  showsDot,
} from "./teach";
import { workshopUnlocked } from "./workshop";

function granite(): Mountain {
  // Mine until the Workshop opens, without using it.
  let mountain = createMountain();
  let mined = 0;
  while (!workshopUnlocked(mountain) && mountain.remaining > 0) {
    mined += 1_000;
    mountain = {
      ...mountain,
      remaining: Math.max(0, mountain.remaining - 1_000),
    };
  }
  expect(mined).toBeGreaterThan(0);
  return mountain;
}

describe("teach", () => {
  it("shows nothing before the system opens", () => {
    const fresh = createMountain();
    expect(showsDot(fresh, "workshop")).toBe(false);
    expect(noteFor(fresh)).toBeUndefined();
  });

  it("shows the note and the dot once the Workshop opens", () => {
    const mountain = granite();
    expect(noteFor(mountain)).toBe("workshop");
    expect(showsDot(mountain, "workshop")).toBe(true);
  });

  it("drops the note when seen but keeps the dot until first use", () => {
    const seen = markSeen(granite(), "workshop");
    expect(noteFor(seen)).toBeUndefined();
    expect(showsDot(seen, "workshop")).toBe(true);
    expect(markSeen(seen, "workshop")).toBe(seen);
  });

  it("drops the dot and writes taught at the first craft", () => {
    const used = recordFirstUse({
      ...granite(),
      crafted: { "blasting-charge": 1 },
    });
    expect(used.taught).toEqual(["workshop"]);
    expect(used.seen).toEqual(["workshop"]);
    expect(showsDot(used, "workshop")).toBe(false);
    expect(noteFor(used)).toBeUndefined();
    // Taught sticks even once the evidence is gone.
    const cleared = { ...used, crafted: {} } as Mountain;
    expect(showsDot(cleared, "workshop")).toBe(false);
  });

  it("returns the same mountain when nothing is new", () => {
    const mountain = granite();
    expect(recordFirstUse(mountain)).toBe(mountain);
  });

  it("counts an old save that already crafted as taught", () => {
    const old = { ...granite(), crafted: { "blasting-charge": 2 } } as Mountain;
    expect(old.taught).toBeUndefined();
    expect(showsDot(old, "workshop")).toBe(false);
    expect(noteFor(old)).toBeUndefined();
  });

  it("reads saved ids leniently and keeps unknown ones", () => {
    expect(parseTeachIds(undefined)).toEqual([]);
    expect(parseTeachIds("workshop")).toBe("bad");
    expect(
      parseTeachIds(["workshop", "workshop", 3, "", "x".repeat(41), "future"]),
    ).toEqual(["workshop", "future"]);
    expect(
      parseTeachIds(Array.from({ length: 50 }, (_, i) => `id${String(i)}`)),
    ).toHaveLength(32);
  });
});
