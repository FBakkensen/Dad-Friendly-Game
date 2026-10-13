import { describe, expect, it } from "vitest";
import {
  LAMP_LINGER_SCALE,
  LOST_TOOLS,
  MAP_RETURN_DENOMINATOR,
  MAP_RETURN_NUMERATOR,
  PICK_TAP_DENOMINATOR,
  PICK_TAP_NUMERATOR,
  expeditionAwayMs,
  glintScale,
  hasLostTool,
  tapWithPick,
  wearsSteelToes,
} from "./lost-tools";

describe("lost tools", () => {
  it("names the four tools found only below, one each", () => {
    expect(LOST_TOOLS).toEqual(["pick", "lamp", "map", "boots"]);
  });

  it("is found only when that id is on the shelf", () => {
    expect(hasLostTool({}, "pick")).toBe(false);
    expect(hasLostTool({ finds: [] }, "pick")).toBe(false);
    expect(hasLostTool({ finds: ["lamp", "drawing"] }, "pick")).toBe(false);
    expect(hasLostTool({ finds: ["pick"] }, "pick")).toBe(true);
    expect(hasLostTool({ finds: ["lamp"] }, "lamp")).toBe(true);
    expect(hasLostTool({ finds: ["map"] }, "map")).toBe(true);
    expect(hasLostTool({ finds: ["boots"] }, "boots")).toBe(true);
  });
});

describe("Grandfather's pick", () => {
  const held = { finds: ["pick"] };

  it("makes a tap a little stronger, and leaves a bare tap alone", () => {
    expect(tapWithPick(1, {})).toBe(1);
    expect(tapWithPick(1, held)).toBe(
      Math.ceil((1 * PICK_TAP_NUMERATOR) / PICK_TAP_DENOMINATOR),
    );
    expect(tapWithPick(1, held)).toBe(2);
    expect(tapWithPick(4, held)).toBe(5);
    expect(tapWithPick(8, held)).toBe(10);
  });
});

describe("Old miner's lamp", () => {
  it("lets a golden vein linger longer, and only then", () => {
    expect(glintScale({})).toBe(1);
    expect(glintScale({ finds: ["pick"] })).toBe(1);
    expect(glintScale({ finds: ["lamp"] })).toBe(LAMP_LINGER_SCALE);
    expect(LAMP_LINGER_SCALE).toBeGreaterThan(1);
  });
});

describe("Worn map", () => {
  const hour = 60 * 60_000;

  it("brings the next expedition home sooner, and leaves the old time otherwise", () => {
    expect(expeditionAwayMs(hour, {})).toBe(hour);
    expect(expeditionAwayMs(hour, { finds: ["pick"] })).toBe(hour);
    expect(expeditionAwayMs(hour, { finds: ["map"] })).toBe(
      Math.round((hour * MAP_RETURN_NUMERATOR) / MAP_RETURN_DENOMINATOR),
    );
    expect(expeditionAwayMs(10 * 60_000, { finds: ["map"] })).toBe(450_000);
    expect(expeditionAwayMs(4 * hour, { finds: ["map"] })).toBe(3 * hour);
  });
});

describe("Steel-toe boots", () => {
  it("is the query hazards reads, true only once the boots are home", () => {
    expect(wearsSteelToes({})).toBe(false);
    expect(wearsSteelToes({ finds: ["pick", "lamp", "map"] })).toBe(false);
    expect(wearsSteelToes({ finds: ["boots"] })).toBe(true);
  });
});
