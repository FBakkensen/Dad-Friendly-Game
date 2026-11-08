// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { nineSlicePlan, SKINS, skin } from "./board-skin";

describe("nineSlicePlan", () => {
  it("a frame plan stays inside its box", () => {
    for (const [width, height] of [
      [204, 27],
      [208, 44],
    ] as const) {
      for (const b of nineSlicePlan("frame", width, height)) {
        expect(b.dx).toBeGreaterThanOrEqual(0);
        expect(b.dy).toBeGreaterThanOrEqual(0);
        expect(b.dx + b.w).toBeLessThanOrEqual(width);
        expect(b.dy + b.h).toBeLessThanOrEqual(height);
        expect(b.w).toBeGreaterThan(0);
        expect(b.h).toBeGreaterThan(0);
      }
    }
  });

  it("corners are drawn last at the four corners", () => {
    const last = nineSlicePlan("tag", 118, 12).slice(-4);
    expect(last.map((b) => [b.dx, b.dy])).toEqual([
      [0, 0],
      [109, 0],
      [0, 9],
      [109, 9],
    ]);
  });

  it("rivets are pitched 22 apart", () => {
    const rivets = nineSlicePlan("frame", 204, 27).filter(
      (b) => b.sx === 10 && b.w === 6 && b.dy === 0,
    );
    expect(rivets).toHaveLength(Math.floor((204 - 16) / 22));
    expect(rivets).toHaveLength(8);
  });

  it("keyp reads the pressed half", () => {
    const plan = nineSlicePlan("keyp", 40, 40);
    expect(plan.length).toBeGreaterThan(0);
    for (const b of plan) expect(b.sx).toBeGreaterThanOrEqual(32);
  });
});

describe("SKINS", () => {
  it("keyp is the key source at the pressed cell", () => {
    expect(SKINS.keyp).toEqual({ ...SKINS.key, ox: 32 });
  });
});

describe("skin", () => {
  it("never throws without a canvas context", () => {
    const div = document.createElement("div");
    div.style.width = "100px";
    div.style.height = "40px";
    document.body.append(div);
    expect(() => {
      skin(div, "frame");
    }).not.toThrow();
    expect(div.querySelectorAll("canvas.board-skin")).toHaveLength(1);
    expect(div.classList.contains("board-skinned")).toBe(true);
  });
});
