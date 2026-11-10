// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { nineSlicePlan, SKINS, skin, skinArtSize } from "./board-skin";

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

  it("the brass plate keeps its four rivets", () => {
    const plan = nineSlicePlan("brass", 64, 16);
    for (const b of plan) {
      expect(b.dx).toBeGreaterThanOrEqual(0);
      expect(b.dy).toBeGreaterThanOrEqual(0);
      expect(b.dx + b.w).toBeLessThanOrEqual(64);
      expect(b.dy + b.h).toBeLessThanOrEqual(16);
      expect(b.sx).toBeGreaterThanOrEqual(3);
    }
    expect(plan.slice(-4).map((b) => [b.dx, b.dy])).toEqual([
      [0, 0],
      [55, 0],
      [0, 8],
      [55, 8],
    ]);
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

describe("skinArtSize", () => {
  it("paints half the host's CSS size, with a floor per kind", () => {
    expect(skinArtSize("frame", 212, 48)).toEqual({ width: 106, height: 24 });
    expect(skinArtSize("frame", 20, 20)).toEqual({ width: 18, height: 17 });
    expect(skinArtSize("tag", 88, 20)).toEqual({ width: 44, height: 10 });
  });

  it("a brass plate 32px tall paints 16 art px, not the frame's 17", () => {
    expect(skinArtSize("brass", 128, 32)).toEqual({ width: 64, height: 16 });
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

  it("takes no room until it is painted, even on a host built hidden", () => {
    // A canvas left at its default 300x150 sticks out of a small host until the first paint,
    // a frame later: the "i" cards' Back overflowed its drawer that way (#403).
    const div = document.createElement("div");
    div.hidden = true;
    document.body.append(div);
    skin(div, "brass");
    const canvas = div.querySelector("canvas.board-skin");
    expect(canvas).toBeInstanceOf(HTMLCanvasElement);
    expect([
      (canvas as HTMLCanvasElement).width,
      (canvas as HTMLCanvasElement).height,
    ]).toEqual([0, 0]);
  });
});

describe("skin: a pressed kind", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a pressed skin asks its getter on every paint, the resize repaint included", () => {
    let resized: (() => void) | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe(): void {}
        disconnect(): void {}
      },
    );
    const div = document.createElement("div");
    Object.defineProperty(div, "offsetWidth", { value: 100 });
    Object.defineProperty(div, "offsetHeight", { value: 40 });
    document.body.append(div);
    const down = vi.fn(() => false);
    const repaint = skin(div, "key", { kind: "keyp", down });
    expect(down).toHaveBeenCalledTimes(1);
    repaint();
    expect(down).toHaveBeenCalledTimes(2);
    resized?.();
    expect(down).toHaveBeenCalledTimes(3);
  });
});
