import { describe, expect, it } from "vitest";
import { boostById, boostCost } from "./boosts";
import { tierLock } from "./crew";
import { promoteCost } from "./engineers";
import { howItWorks } from "./how-it-works";
import { createMountain, digStones, MOUNTAIN_STONES } from "./mountain";
import { parseSaveValue, serializeSave } from "./persist";
import {
  KID_MACHINE_OPENS,
  KID_RUN_GROWTH,
  MAX_STRETCH,
  kidStretch,
  shownStones,
  stonesLeft,
  stretch,
} from "./scale";
import { minedMountain } from "./test-fixtures";
import { tierById, tierCost } from "./tiers";
import { lockBodyLine } from "./tier-lock-words";
import { upgradeById, upgradeCost } from "./upgrades";
import { veinReward } from "./veins";
import { recipeCost, startCraft, TOPSOIL_BENCH_FROM } from "./workshop";
import { formatCompact } from "./format";

describe("kid-run stretch (M13, #253)", () => {
  it("grows the stretch every generation, with no cap", () => {
    expect(kidStretch(0)).toBe(1);
    expect(kidStretch(1)).toBeCloseTo(1.5 * (1 + KID_RUN_GROWTH) ** 2);
    const ks = Array.from({ length: 12 }, (_, i) => kidStretch(i));
    ks.slice(1).forEach((k, i) => {
      expect(k).toBeGreaterThan(ks[i] as number);
    });
    // Even at the rules' Legacy cap the stretch still fits a save.
    expect(kidStretch(1_000)).toBeLessThan(MAX_STRETCH);
  });

  it("leaves a save without a stretch as it is", () => {
    const fresh = createMountain();
    expect(stretch(fresh)).toBe(1);
    expect(stonesLeft(fresh)).toBe(MOUNTAIN_STONES);
    expect(shownStones(fresh, 7_000_000)).toBe(7_000_000);
  });

  it("makes a kid's mountain k times the stones, and every price k times", () => {
    const kid = { ...createMountain(), stretch: 2 };
    expect(stonesLeft(kid)).toBe(2 * MOUNTAIN_STONES);
    const dug = digStones(kid, 1_000);
    expect(dug.pocket).toBe(1_000);
    expect(kid.remaining - dug.remaining).toBe(500);
    expect(digStones(kid, 2 * MOUNTAIN_STONES).remaining).toBe(0);
    const cart = tierById("cart");
    expect(tierCost(cart, 0, 2)).toBe(2 * tierCost(cart, 0));
    const tap = upgradeById("tap");
    expect(upgradeCost(tap, 0, 2)).toBe(2 * (upgradeCost(tap, 0) ?? 0));
    const pricing = { crewPerSecond: 0, tapYield: 0 };
    const sharper = boostById("sharper");
    expect(boostCost(sharper, pricing, 2)).toBe(
      2 * boostCost(sharper, pricing),
    );
    expect(promoteCost(kid)).toBe(2 * promoteCost(createMountain()));
    expect(veinReward(kid)).toBe(2 * veinReward(createMountain()));
  });

  it("opens the Great Machine sooner from run 2 on, and names this run's stones", () => {
    const machine = tierById("machine");
    const runOne = minedMountain(25_000_000);
    expect(tierLock(runOne, machine)).toMatchObject({ depth: 120_000_000 });
    const kid = { ...runOne, stretch: 1.75 };
    const lock = tierLock(kid, machine);
    expect(lock).toEqual({
      kind: "depth",
      depth: 120_000_000 * KID_MACHINE_OPENS,
      at: 120_000_000 * KID_MACHINE_OPENS * 1.75,
    });
    expect(
      lockBodyLine(machine, lock ?? { kind: "depth", depth: 0, at: 0 }),
    ).toBe(
      "The Great Machine joins your crew at 189M stones. Keep digging, Dad!",
    );
    const borer = tierLock(
      { ...minedMountain(0), stretch: 2 },
      tierById("borer"),
    );
    expect(borer).toEqual({ kind: "depth", depth: 7_000_000, at: 14_000_000 });
  });

  it("prices the how-it-works copy in this run's stones", () => {
    expect(howItWorks(2).engineers.steps[0]?.[1]).not.toBe(
      howItWorks(1).engineers.steps[0]?.[1],
    );
  });

  it("saves the stretch beside the mountain, whole depth for the cloud", () => {
    const kid = digStones({ ...createMountain(), stretch: 1.75 }, 1);
    expect(Number.isInteger(kid.remaining)).toBe(false);
    const saved = serializeSave({ mountain: kid, lastSeen: 1 });
    expect(saved.mountain.remaining).toBe(MOUNTAIN_STONES);
    expect(parseSaveValue(saved)?.mountain.stretch).toBe(1.75);
    const old = serializeSave({ mountain: createMountain(), lastSeen: 1 });
    expect(parseSaveValue(old)?.mountain.stretch).toBeUndefined();
    for (const bad of [0.5, 1e8, "2"]) {
      expect(
        parseSaveValue({
          ...saved,
          workshop: { ...saved.workshop, stretch: bad },
        }),
      ).toBeUndefined();
    }
  });


  it("stretches workshop recipe stones with the mountain, not materials", () => {
    expect(recipeCost("blasting-charge").stones).toBe(100_000);
    expect(recipeCost("blasting-charge", 2).stones).toBe(200_000);
    expect(recipeCost("blasting-charge", 2).materials.clay).toBe(
      recipeCost("blasting-charge").materials.clay,
    );
    const kid = {
      ...minedMountain(TOPSOIL_BENCH_FROM),
      stretch: 2,
      pocket: 250_000,
      materials: { clay: 10, iron: 0, crystal: 0, heartstone: 0 },
    };
    const spent = startCraft(kid, "blasting-charge", 1);
    expect(spent).not.toBe(kid);
    expect(spent.pocket).toBe(50_000);
  });

  it("keeps run 10-12 numbers sane: short text, safe whole numbers, a good save", () => {
    for (const legacy of [9, 10, 11]) {
      const k = kidStretch(legacy);
      const kid = { ...createMountain(), legacy, stretch: k };
      expect(formatCompact(stonesLeft(kid))).toMatch(/^\d+(\.\d)?B$/);
      const priciest = tierCost(tierById("machine"), 3, k);
      expect(Number.isSafeInteger(Math.round(priciest))).toBe(true);
      expect(formatCompact(priciest).length).toBeLessThanOrEqual(6);
      const saved = serializeSave({
        mountain: digStones(kid, 1e9),
        lastSeen: 1,
      });
      expect(parseSaveValue(saved)?.mountain.stretch).toBe(k);
    }
  });
});
