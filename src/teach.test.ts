import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "./mountain";
import { levels, partThree } from "./part-three.harness";
import { markSeen, parseTeachIds, recordFirstUse, showsDot } from "./teach";
import { NOTHING_CRAFTED } from "./workshop";

/** The shaft sunk: the Workshop opens with the Granite, in part 3 (#740). */
function granite(): Mountain {
  return levels({});
}

describe("teach", () => {
  it("shows nothing before the system opens", () => {
    const fresh = createMountain();
    expect(showsDot(fresh, "workshop")).toBe(false);
    // Closed until part 3: a sunk shaft alone does not open it.
    expect(showsDot(granite(), "workshop")).toBe(false);
  });

  it("shows the dot once the Workshop opens", () => {
    partThree(() => {
      expect(showsDot(granite(), "workshop")).toBe(true);
    });
  });

  it("keeps the dot when seen, until first use", () => {
    partThree(() => {
      const seen = markSeen(granite(), "workshop");
      expect(showsDot(seen, "workshop")).toBe(true);
      expect(markSeen(seen, "workshop")).toBe(seen);
    });
  });

  it("drops the dot and writes taught at the first craft", () => {
    partThree(() => {
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
  });

  it("returns the same mountain when nothing is new", () => {
    partThree(() => {
      const mountain = granite();
      expect(recordFirstUse(mountain)).toBe(mountain);
    });
  });

  it("counts an old save that already crafted as taught", () => {
    partThree(() => {
      const old = {
        ...granite(),
        crafted: { "blasting-charge": 2 },
      } as Mountain;
      expect(old.taught).toEqual([]);
      expect(showsDot(old, "workshop")).toBe(false);
    });
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
