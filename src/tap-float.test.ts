import { describe, expect, it } from "vitest";
import { TAP_FLOAT_LIFT_PX, tapFloatSpot } from "./tap-float";

const box = { left: 10, top: 100, width: 200, height: 200 };
const middle = () => 0.5;

describe("tapFloatSpot", () => {
  it("starts well above the finger, not under it", () => {
    const spot = tapFloatSpot(box, { x: 110, y: 250 }, middle);
    expect(spot.x).toBeCloseTo(50);
    expect(spot.y).toBeCloseTo(((150 - TAP_FLOAT_LIFT_PX) / 200) * 100);
    expect(TAP_FLOAT_LIFT_PX).toBeGreaterThanOrEqual(60);
  });

  it("jitters sideways a little either way", () => {
    expect(tapFloatSpot(box, { x: 110, y: 250 }, () => 0).x).toBeCloseTo(44);
    expect(tapFloatSpot(box, { x: 110, y: 250 }, () => 1).x).toBeCloseTo(56);
  });

  it("stays inside the mountain near its edges", () => {
    expect(tapFloatSpot(box, { x: 10, y: 110 }, () => 0)).toEqual({
      x: 8,
      y: 8,
    });
    expect(tapFloatSpot(box, { x: 210, y: 300 }, () => 1).x).toBe(92);
  });

  it("uses the upper middle for keyboard taps or an unmeasured box", () => {
    expect(tapFloatSpot(box, undefined)).toEqual({ x: 50, y: 40 });
    expect(tapFloatSpot({ ...box, width: 0 }, { x: 1, y: 1 })).toEqual({
      x: 50,
      y: 40,
    });
  });
});
