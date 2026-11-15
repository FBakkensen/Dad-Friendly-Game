import { describe, expect, it } from "vitest";
import { placeOrder } from "./city";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { createMountain } from "./mountain";
import { compareSaveProgress, playedSinceNew } from "./save-progress";
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
    const idle = moment(
      {
        ...minedMountain(40),
        owned: { ...minedMountain(40).owned, helper: 3 },
      },
      10,
    );
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

describe("which copy of a fresh mine is ahead (#664, call 13)", () => {
  const at = (rockDug: number, lastSeen: number) => ({
    mountain: { ...createMountain(), rockDug },
    lastSeen,
  });

  it("the copy that dug more rock in all is ahead, whatever its clock", () => {
    expect(compareSaveProgress(at(5_000, 1), at(4_000, 9))).toBeGreaterThan(0);
    expect(compareSaveProgress(at(4_000, 9), at(5_000, 1))).toBeLessThan(0);
  });

  it("the newer clock breaks a tie, and a later run still comes first", () => {
    expect(compareSaveProgress(at(5_000, 9), at(5_000, 1))).toBeGreaterThan(0);
    const later = {
      ...at(10, 1),
      mountain: { ...at(10, 1).mountain, startedAt: 2 },
    };
    expect(compareSaveProgress(later, at(9_000, 9))).toBeGreaterThan(0);
  });
});

describe("playedSinceNew (#664)", () => {
  const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

  it("a fresh mine's start, with its worker moved, is not played", () => {
    fresh(() => {
      const start = createMountain();
      expect(playedSinceNew(start, true)).toBe(false);
      const moved = {
        ...start,
        jobs: { ...start.jobs, drilling: 0, haulage: 1 },
      };
      expect(playedSinceNew(moved, true)).toBe(false);
    });
  });

  it("rock dug, a hire, a vehicle, an order or a building is played", () => {
    fresh(() => {
      const start = createMountain();
      const played = [
        { ...start, rockDug: 1 },
        { ...start, owned: { ...start.owned, helper: start.owned.helper + 1 } },
        {
          ...start,
          fleet: { ...start.fleet, horseWagon: start.fleet.horseWagon + 1 },
        },
        placeOrder(start),
        { ...start, operational: ["lightTower" as const] },
      ];
      for (const mountain of played) {
        expect(playedSinceNew(mountain, false)).toBe(true);
      }
    });
  });

  it("a later run's stamp counts only when asked", () => {
    fresh(() => {
      const stamped = { ...createMountain(), startedAt: 40 };
      expect(playedSinceNew(stamped, true)).toBe(true);
      expect(playedSinceNew(stamped, false)).toBe(false);
    });
  });
});
