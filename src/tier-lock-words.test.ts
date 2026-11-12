import { describe, expect, it } from "vitest";
import { tierLock } from "./crew";
import { createMountain } from "./mountain";
import { shownStones } from "./scale";
import { minedMountain } from "./test-fixtures";
import {
  lockAria,
  lockBodyLine,
  lockRateLine,
  lockShortLine,
} from "./tier-lock-words";
import { tierById } from "./tiers";

const lockOf = (id: Parameters<typeof tierById>[0]) => {
  const tier = tierById(id);
  const lock = tierLock(createMountain(), tier);
  if (lock === undefined) {
    throw new Error(`${id} is not locked on a new mountain`);
  }
  return { tier, lock };
};

describe("locked tier card words (#250, #508)", () => {
  it("names the borer's depth, short and in the dad's voice", () => {
    const { tier, lock } = lockOf("borer");
    expect(lockRateLine(lock)).toBe("Opens at 10M stones");
    expect(lockShortLine(lock)).toBe("Opens at 10M");
    expect(lockBodyLine(tier, lock)).toBe(
      "The Tunnel borer joins your crew at 10M stones. Keep digging, Dad!",
    );
    expect(lockAria(tier, lock)).toBe(
      "Tunnel borer, locked. Joins your crew at 10 million stones down.",
    );
  });

  it("names the Deep Heart depth for the Great Machine (#252)", () => {
    const { tier, lock } = lockOf("machine");
    // The Deep Heart is 120M deep, and the Granite and Crystal take more stones per depth.
    // Shown to one decimal, rounded down (the band scales are pinned in src/tuning.test.ts).
    const at =
      Math.floor(shownStones(createMountain(), 120_000_000) / 100_000) / 10;
    expect(lockRateLine(lock)).toBe(`Opens at ${String(at)}M stones`);
    expect(lockBodyLine(tier, lock)).toBe(
      `The Great Machine joins your crew at ${String(at)}M stones. Keep digging, Dad!`,
    );
    expect(lockAria(tier, lock)).toBe(
      `Great Machine, locked. Joins your crew at ${String(at)} million stones down.`,
    );
  });

  it("says another relic tier joins with its relic", () => {
    const { tier, lock } = lockOf("kid");
    // Shown to one decimal, rounded down.
    const at = String(
      Math.floor(shownStones(createMountain(), 70_000_000) / 100_000) / 10,
    );
    expect(lockRateLine(lock)).toMatch(new RegExp(`^With the \\S+ at ${at}M$`));
    expect(lockShortLine(lock)).toBeUndefined();
    expect(lockBodyLine(tier, lock)).toMatch(
      new RegExp(
        `^.+s join with the \\S+ at ${at}M stones\\. Nearly there, Dad!$`,
      ),
    );
    for (const line of [
      lockRateLine(lock),
      lockBodyLine(tier, lock),
      lockAria(tier, lock),
    ]) {
      expect(line).not.toContain("?");
    }
  });

  it("has no lock once the depth is reached", () => {
    expect(
      tierLock(minedMountain(10_000_000), tierById("borer")),
    ).toBeUndefined();
  });
});
