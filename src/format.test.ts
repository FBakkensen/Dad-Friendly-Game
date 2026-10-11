import { describe, expect, it } from "vitest";
import { formatCompact, formatCount, formatDuration } from "./format";

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
    [999_999_999_999_999, "999.9 trillion"],
    [1e15, "1,000+ trillion"],
    [1.3e61, "1,000+ trillion"],
    [1_250_000, "1.2 million"],
    [3_000_000_000, "3 billion"],
    [-5, "0"],
    [2.9, "2"],
  ])("formats %d as %s", (count, text) => {
    expect(formatCount(count)).toBe(text);
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0 seconds"],
    [1_000, "1 second"],
    [59_999, "59 seconds"],
    [60_000, "1 minute"],
    [45 * 60_000, "45 minutes"],
    [60 * 60_000, "1 hour"],
    [125 * 60_000, "2 hours 5 minutes"],
    [24 * 3_600_000, "1 day"],
    [76 * 3_600_000, "3 days 4 hours"],
    [-10, "0 seconds"],
  ])("formats %d ms as %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});

describe("formatCompact", () => {
  it.each([
    [9_999, "9,999"],
    [12_345, "12.3K"],
    [190_123_456, "190.1M"],
    [2_500_000_000, "2.5B"],
    [999_999_999_999_999, "999.9T"],
    [1.3e61, ">999T"],
    [-5, "0"],
  ])("formats %d as %s", (count, text) => {
    expect(formatCompact(count)).toBe(text);
  });
});
