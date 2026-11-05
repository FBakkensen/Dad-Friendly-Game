import { describe, expect, it } from "vitest";
import { dayNumber, isSampleSecond, withFinish } from "./casual";
import { DAY_MS, SAMPLE_INTERVAL_SEC } from "./targets";

describe("casual run", { timeout: 120_000 }, () => {
  it("samples every play-minute, including the start of a session", () => {
    expect(isSampleSecond(0)).toBe(true);
    expect(isSampleSecond(SAMPLE_INTERVAL_SEC)).toBe(true);
    expect(isSampleSecond(1)).toBe(false);
    expect(dayNumber(0)).toBe(1);
    expect(dayNumber(DAY_MS)).toBe(2);
    const bare = withFinish([], undefined);
    expect(bare).toEqual([]);
    expect(withFinish(bare, 5).map((sample) => sample.finishDay)).toEqual([]);
  });
});
