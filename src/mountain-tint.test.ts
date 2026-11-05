import { describe, expect, it } from "vitest";
import { LAYERS } from "./layers";
import { mountainTint } from "./mountain-tint";

describe("mountainTint (#325)", () => {
  it("leaves the Topsoil as painted", () => {
    expect(mountainTint("topsoil")).toBe("none");
  });

  it("greys the Granite, blues the Crystal Caves, and fires the Deep Heart", () => {
    expect(mountainTint("granite")).toMatch(/grayscale\(/);
    expect(mountainTint("crystal")).toMatch(
      /hue-rotate\((?:1[5-9]\d|2[0-2]\d)deg\)/,
    );
    expect(mountainTint("heart")).toMatch(/saturate\(/);
    expect(mountainTint("heart")).toMatch(/hue-rotate\(-/);
  });

  it("gives every band its own look", () => {
    const tints = LAYERS.map((layer) => mountainTint(layer.id));
    expect(new Set(tints).size).toBe(LAYERS.length);
  });

  it("is only filter functions, never a colour or a size", () => {
    for (const layer of LAYERS) {
      expect(mountainTint(layer.id)).toMatch(
        /^(none|(?:[a-z-]+\(-?[\d.]+(?:deg)?\)\s?)+)$/,
      );
    }
  });
});
