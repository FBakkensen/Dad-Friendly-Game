import { describe, expect, it } from "vitest";
import { formatCount } from "./format";

describe("formatCount", () => {
  it.each([
    [0, "0"],
    [7, "7"],
    [9_999, "9,999"],
    [10_000, "10 thousand"],
    [12_345, "12.3 thousand"],
    [987_654, "987.6 thousand"],
    [999_999, "999.9 thousand"],
    [1_000_000, "1 million"],
    [1_250_000, "1.2 million"],
    [3_000_000_000, "3 billion"],
    [-5, "0"],
    [2.9, "2"],
  ])("formats %d as %s", (count, text) => {
    expect(formatCount(count)).toBe(text);
  });
});
