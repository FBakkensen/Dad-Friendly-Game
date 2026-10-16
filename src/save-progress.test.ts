import { describe, expect, it } from "vitest";
import { createMountain } from "./mountain";
import { compareSaveProgress } from "./save-progress";
import { minedMountain } from "./test-fixtures";

describe("compareSaveProgress", () => {
  const moment = (
    mountain: ReturnType<typeof createMountain>,
    lastSeen?: number,
  ) => ({ mountain, lastSeen });

  it("lets a later run win even when it has mined nothing", () => {
    const older = moment({ ...minedMountain(5_000_000), startedAt: 1 }, 9);
    const restarted = moment({ ...createMountain(), startedAt: 2 }, 0);
    expect(compareSaveProgress(restarted, older)).toBeGreaterThan(0);
    expect(compareSaveProgress(older, restarted)).toBeLessThan(0);
  });

  it("lets more stones mined win even when the clock is older", () => {
    const phone = moment(minedMountain(150), 10);
    const cloud = moment(minedMountain(100), 99);
    expect(compareSaveProgress(phone, cloud)).toBeGreaterThan(0);
    expect(compareSaveProgress(cloud, phone)).toBeLessThan(0);
  });

  it("lets a newer lastSeen win when the run and the stones match", () => {
    const bought = moment(minedMountain(40), 20);
    const idle = moment({ ...minedMountain(40), helpers: 3 }, 10);
    expect(compareSaveProgress(bought, idle)).toBeGreaterThan(0);
  });

  it("treats a missing lastSeen as 0 and calls an equal pair a tie", () => {
    const mountain = minedMountain(4);
    expect(compareSaveProgress(moment(mountain, 0), moment(mountain))).toBe(0);
    expect(
      compareSaveProgress(moment(mountain, 5), moment({ ...mountain }, 5)),
    ).toBe(0);
  });
});
