import { describe, expect, it } from "vitest";
import { tierLock } from "./crew";
import { createMountain } from "./mountain";
import { minedMountain } from "./test-fixtures";
import { lockAria, lockBodyLine, lockRateLine } from "./tier-lock-words";
import { tierById } from "./tiers";

const lockOf = (id: Parameters<typeof tierById>[0]) => {
  const tier = tierById(id);
  const lock = tierLock(createMountain(), tier);
  if (lock === undefined) {
    throw new Error(`${id} is not locked on a new mountain`);
  }
  return { tier, lock };
};

describe("locked tier card words (#250)", () => {
  it("names the borer's depth, short and in the dad's voice", () => {
    const { tier, lock } = lockOf("borer");
    expect(lockRateLine(tier, lock)).toBe("Borer · 7M");
    expect(lockBodyLine(tier, lock)).toBe(
      "The Tunnel borer joins your crew at 7M stones. Keep digging, Dad!",
    );
    expect(lockAria(tier, lock)).toBe(
      "Tunnel borer, locked. Joins your crew at 7 million stones down.",
    );
  });

  it("names the Great Machine's opening depth (#252, #253)", () => {
    const { tier, lock } = lockOf("machine");
    expect(lockRateLine(tier, lock)).toBe("Machine · 108M");
    expect(lockBodyLine(tier, lock)).toBe(
      "The Great Machine joins your crew at 108M stones. Keep digging, Dad!",
    );
    expect(lockAria(tier, lock)).toBe(
      "Great Machine, locked. Joins your crew at 108 million stones down.",
    );
  });

  it("says another relic tier joins with its relic", () => {
    const { tier, lock } = lockOf("kid");
    expect(lockRateLine(tier, lock)).toMatch(/^\S+ · 70M$/);
    expect(lockBodyLine(tier, lock)).toMatch(
      /^.+s join with the \S+ at 70M stones\. Nearly there, Dad!$/,
    );
    for (const line of [
      lockRateLine(tier, lock),
      lockBodyLine(tier, lock),
      lockAria(tier, lock),
    ]) {
      expect(line).not.toContain("?");
    }
  });

  it("has no lock once the depth is reached", () => {
    expect(
      tierLock(minedMountain(7_000_000), tierById("borer")),
    ).toBeUndefined();
  });
});
