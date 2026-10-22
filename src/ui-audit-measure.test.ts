import { describe, expect, it } from "vitest";
import {
  containsBox,
  contrastRatio,
  edgeGap,
  isLargeText,
  passesContrast,
  scrollOverflows,
  targetsCloserThan,
  undersizedTargets,
} from "./ui-audit-measure";

const box = (
  selector: string,
  top: number,
  left: number,
  width: number,
  height: number,
) => ({ selector, top, left, width, height });

describe("undersizedTargets", () => {
  it("keeps a 48px square and flags either side under the minimum", () => {
    const targets = [
      box("ok", 0, 0, 48, 48),
      box("short", 0, 0, 48, 47.9),
      box("thin", 0, 0, 20, 64),
    ];
    expect(undersizedTargets(targets).map((target) => target.selector)).toEqual(
      ["short", "thin"],
    );
    expect(undersizedTargets(targets, 20)).toEqual([]);
  });
});

describe("targetsCloserThan", () => {
  it("flags a gap under 8px, including a diagonal, and skips a nested control", () => {
    const side = box("side", 0, 0, 40, 40);
    const near = box("near", 0, 47, 40, 40);
    const far = box("far", 0, 100, 40, 40);
    const below = box("below", 44, 0, 40, 40);
    const diagonal = box("diagonal", 14, 14, 10, 10);
    const corner = box("corner", 0, 0, 10, 10);
    const card = box("card", 200, 0, 200, 80);
    const label = box("label", 210, 10, 40, 40);
    expect(edgeGap(side, near)).toBe(7);
    expect(edgeGap(side, below)).toBe(4);
    expect(edgeGap(corner, diagonal)).toBeCloseTo(Math.hypot(4, 4));
    expect(containsBox(card, label)).toBe(true);
    expect(
      targetsCloserThan([side, near, far, below, card, label]).map(
        (pair) => `${pair.a}+${pair.b}`,
      ),
    ).toEqual(["side+near", "side+below"]);
    expect(targetsCloserThan([corner, diagonal])).toHaveLength(1);
    expect(targetsCloserThan([side, far], 8)).toEqual([]);
  });
});

describe("scrollOverflows", () => {
  it("scrolls only when scrollHeight is taller than the client", () => {
    expect(scrollOverflows({ scrollHeight: 560, clientHeight: 560 })).toEqual({
      scrolls: false,
      overflow: 0,
    });
    expect(scrollOverflows({ scrollHeight: 640, clientHeight: 560 })).toEqual({
      scrolls: true,
      overflow: 80,
    });
  });
});

describe("contrast", () => {
  it("rates black on white at 21:1 and applies the AA bars", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21);
    expect(contrastRatio([255, 255, 255], [0, 0, 0])).toBeCloseTo(21);
    expect(passesContrast(4.5, "body")).toBe(true);
    expect(passesContrast(4.49, "body")).toBe(false);
    expect(passesContrast(3, "large")).toBe(true);
    expect(passesContrast(2.9, "control")).toBe(false);
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 650)).toBe(false);
    expect(isLargeText(14, 700)).toBe(false);
  });
});
