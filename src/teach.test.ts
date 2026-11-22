import { describe, expect, it } from "vitest";
import { createMountain } from "./mountain";
import { markSeen, parseTeachIds, recordFirstUse, showsDot } from "./teach";

describe("teach", () => {
  it("marks a known id seen once and stays idempotent", () => {
    const fresh = createMountain();
    const seen = markSeen(fresh, "engineers");
    expect(seen.seen).toContain("engineers");
    expect(markSeen(seen, "engineers")).toBe(seen);
    expect(showsDot(fresh, "engineers")).toBe(false);
  });

  it("returns the same mountain when nothing is new", () => {
    const mountain = createMountain();
    expect(recordFirstUse(mountain)).toBe(mountain);
  });

  it("reads saved ids leniently and keeps unknown ones", () => {
    expect(parseTeachIds(undefined)).toEqual({ known: [], kept: [] });
    expect(parseTeachIds("engineers")).toBe("bad");
    expect(
      parseTeachIds([
        "engineers",
        "engineers",
        3,
        "",
        "x".repeat(41),
        "future",
      ]),
    ).toEqual({ known: ["engineers"], kept: ["future"] });
    const many = parseTeachIds(
      Array.from({ length: 50 }, (_, i) => `id${String(i)}`),
    );
    expect(many === "bad" ? [] : many.kept).toHaveLength(32);
  });
});
