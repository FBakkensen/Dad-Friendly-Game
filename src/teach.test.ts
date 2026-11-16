import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "./mountain";
import { levels, partThree } from "./part-three.harness";
import { markSeen, parseTeachIds, recordFirstUse, showsDot } from "./teach";
import { NOTHING_CRAFTED } from "./workshop";

/** A mine that has not crafted. */
function granite(): Mountain {
  return createMountain();
}

describe("teach", () => {
  it("never shows the Workshop's dot: the old bench never opens (#740)", () => {
    const fresh = createMountain();
    expect(showsDot(fresh, "workshop")).toBe(false);
    // Not in part 3 with the shaft sunk either: the factory's station took
    // its place.
    expect(partThree(() => showsDot(levels({}), "workshop"))).toBe(false);
    const seen = markSeen(fresh, "workshop");
    expect(showsDot(seen, "workshop")).toBe(false);
    expect(markSeen(seen, "workshop")).toBe(seen);
  });

  it("writes taught at a save's first craft", () => {
    const used = recordFirstUse({
      ...granite(),
      crafted: { ...NOTHING_CRAFTED, "blasting-charge": 1 },
    });
    expect(used.taught).toEqual(["workshop"]);
    expect(used.seen).toEqual(["workshop"]);
    expect(showsDot(used, "workshop")).toBe(false);
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
    expect(old.taught).toEqual([]);
    expect(showsDot(old, "workshop")).toBe(false);
  });

  it("reads saved ids leniently and keeps unknown ones", () => {
    expect(parseTeachIds(undefined)).toEqual({ known: [], kept: [] });
    expect(parseTeachIds("workshop")).toBe("bad");
    expect(
      parseTeachIds(["workshop", "workshop", 3, "", "x".repeat(41), "future"]),
    ).toEqual({ known: ["workshop"], kept: ["future"] });
    const many = parseTeachIds(
      Array.from({ length: 50 }, (_, i) => `id${String(i)}`),
    );
    expect(many === "bad" ? [] : many.kept).toHaveLength(32);
  });
});
