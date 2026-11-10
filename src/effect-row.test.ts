// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { anyChipActive, createEffectChip, writeChip } from "./effect-row";

const on = {
  short: "Picks",
  full: "Sharper picks",
  leftMs: 5_000,
  active: true,
};
const off = { short: "", full: "", leftMs: 0, active: false };

describe("anyChipActive", () => {
  it("is false until a child chip is written active, and false again once it is written inactive", () => {
    const host = document.createElement("div");
    const chip = createEffectChip("boost-chip", "x.png");
    host.append(chip);
    expect(anyChipActive(host)).toBe(false);
    writeChip(chip, on);
    expect(anyChipActive(host)).toBe(true);
    writeChip(chip, off);
    expect(anyChipActive(host)).toBe(false);
  });

  it("does not count a chip outside the host", () => {
    const host = document.createElement("div");
    host.append(createEffectChip("boost-chip", "x.png"));
    const other = createEffectChip("boost-chip", "x.png");
    writeChip(other, on);
    expect(anyChipActive(host)).toBe(false);
  });
});
