import { describe, expect, it } from "vitest";
import { pcZoom, trackPcZoom } from "./pc-zoom";

describe("pcZoom", () => {
  it("leaves supported phones alone", () => {
    expect(pcZoom(424, 924)).toBe(1);
    expect(pcZoom(440, 1200)).toBe(1);
  });
  it("enlarges the column to fill a PC screen", () => {
    expect(pcZoom(1920, 1080)).toBe(1.3);
    expect(pcZoom(1440, 900)).toBe(1.08);
  });
  it("never shrinks a short PC window", () => {
    expect(pcZoom(1280, 600)).toBe(1);
  });
  it("sets and updates the root variable", () => {
    trackPcZoom();
    expect(document.documentElement.style.getPropertyValue("--pc-zoom")).toBe(
      String(pcZoom(innerWidth, innerHeight)),
    );
    window.dispatchEvent(new Event("resize"));
  });
});
