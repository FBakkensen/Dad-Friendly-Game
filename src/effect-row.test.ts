import { describe, expect, it } from "vitest";

import { effectRowCount } from "./effect-row";

describe("effectRowCount", () => {
  it.each([
    [-1, 0],
    [0, 0],
    [1, 1],
    [3, 1],
    [4, 2],
    [6, 2],
    [7, 3],
    [12, 4],
  ])("gives %i running countdowns %i rows", (shown, rows) => {
    expect(effectRowCount(shown)).toBe(rows);
  });
});
