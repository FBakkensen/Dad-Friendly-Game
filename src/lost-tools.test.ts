import { describe, expect, it } from "vitest";
import {
  LOST_TOOLS,
  MAP_RETURN_DENOMINATOR,
  MAP_RETURN_NUMERATOR,
  expeditionAwayMs,
  hasLostTool,
  wearsSteelToes,
} from "./lost-tools";
import { BARE_MOUNTAIN } from "./mountain";

describe("lost tools", () => {
  it("names the two tools found only below, one each", () => {
    expect(LOST_TOOLS).toEqual(["map", "boots"]);
  });

  it("is found only when that id is on the shelf", () => {
    expect(hasLostTool(BARE_MOUNTAIN, "map")).toBe(false);
    expect(hasLostTool({ ...BARE_MOUNTAIN, finds: [] }, "map")).toBe(false);
    expect(
      hasLostTool({ ...BARE_MOUNTAIN, finds: ["boots", "drawing"] }, "map"),
    ).toBe(false);
    expect(hasLostTool({ ...BARE_MOUNTAIN, finds: ["map"] }, "map")).toBe(true);
    expect(hasLostTool({ ...BARE_MOUNTAIN, finds: ["boots"] }, "boots")).toBe(
      true,
    );
  });
});

describe("Worn map", () => {
  const hour = 60 * 60_000;

  it("brings the next expedition home sooner, and leaves the old time otherwise", () => {
    expect(expeditionAwayMs(hour, BARE_MOUNTAIN)).toBe(hour);
    expect(expeditionAwayMs(hour, { ...BARE_MOUNTAIN, finds: ["boots"] })).toBe(
      hour,
    );
    expect(expeditionAwayMs(hour, { ...BARE_MOUNTAIN, finds: ["map"] })).toBe(
      Math.round((hour * MAP_RETURN_NUMERATOR) / MAP_RETURN_DENOMINATOR),
    );
    expect(
      expeditionAwayMs(10 * 60_000, { ...BARE_MOUNTAIN, finds: ["map"] }),
    ).toBe(450_000);
    expect(
      expeditionAwayMs(4 * hour, { ...BARE_MOUNTAIN, finds: ["map"] }),
    ).toBe(3 * hour);
  });
});

describe("Steel-toe boots", () => {
  it("is the query hazards reads, true only once the boots are home", () => {
    expect(wearsSteelToes(BARE_MOUNTAIN)).toBe(false);
    expect(wearsSteelToes({ ...BARE_MOUNTAIN, finds: ["map"] })).toBe(false);
    expect(wearsSteelToes({ ...BARE_MOUNTAIN, finds: ["boots"] })).toBe(true);
  });
});
