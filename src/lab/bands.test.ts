import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "../mountain";
import { MOUNTAIN_STONES } from "../scale";
import {
  bandShare,
  createBandLog,
  createSittingClock,
  runBands,
  summarizeBands,
  type BandEvent,
  type RunBands,
} from "./bands";
import type { DecisionSample } from "./measure";
import type { RevealEvent } from "./reveal";

const GRANITE = 10_000_000;
const CRYSTAL = 45_000_000;

function at(mined: number, extra: Partial<Mountain> = {}): Mountain {
  return {
    ...createMountain(),
    helpers: 1,
    remaining: MOUNTAIN_STONES - mined,
    ...extra,
  };
}

function sample(
  bands: readonly BandEvent[],
  reveals: readonly RevealEvent[] = [],
): DecisionSample {
  return { bands, reveals } as unknown as DecisionSample;
}

describe("bandShare", () => {
  it("runs from 0 at a band's top to 1 at the next band", () => {
    expect(bandShare(0)).toBe(0);
    expect(bandShare(GRANITE)).toBe(0);
    expect(bandShare((GRANITE + CRYSTAL) / 2)).toBeCloseTo(0.5);
    expect(bandShare(MOUNTAIN_STONES)).toBe(1);
  });
});

describe("createBandLog", () => {
  it("logs what is on sale, first affordable and each buy, once per band", () => {
    const log = createBandLog();
    // The first cart's price (#356 tune).
    const first = log(at(0, { pocket: 150 }));
    expect(first).toEqual([
      { kind: "available", tier: "cart", layer: "topsoil" },
      {
        kind: "affordable",
        tier: "cart",
        layer: "topsoil",
        share: 0,
        count: 0,
      },
    ]);
    expect(log(at(0, { pocket: 150 }))).toEqual([]);
    const bought = log(at(GRANITE, { carts: 2 }));
    expect(bought).toContainEqual({
      kind: "bought",
      tier: "cart",
      layer: "granite",
      share: 0,
      count: 2,
    });
    // A buy with an empty pocket still counts as affordable in that band.
    expect(bought).toContainEqual({
      kind: "affordable",
      tier: "cart",
      layer: "granite",
      share: 0,
      count: 0,
    });
  });

  it("skips a machine still waiting on its relic", () => {
    const log = createBandLog();
    const events = log(at(0, { borers: 1, pocket: 1e12 }));
    expect(events.some((event) => event.tier === "machine")).toBe(false);
  });
});

describe("runBands", () => {
  it("reads favoured shares, buys per band and reveal waits", () => {
    const run = runBands([
      sample([
        { kind: "available", tier: "borer", layer: "granite" },
        {
          kind: "affordable",
          tier: "borer",
          layer: "granite",
          share: 0.1,
          count: 0,
        },
        { kind: "available", tier: "cart", layer: "granite" },
      ]),
      sample(
        [
          {
            kind: "bought",
            tier: "borer",
            layer: "granite",
            share: 0.3,
            count: 1,
          },
          {
            kind: "bought",
            tier: "borer",
            layer: "granite",
            share: 0.4,
            count: 1,
          },
          {
            kind: "bought",
            tier: "cart",
            layer: "granite",
            share: 0.4,
            count: 1,
          },
        ],
        [
          {
            kind: "appeared",
            id: "tier:borer",
            liveSec: 0,
            sitting: 1,
            mined: GRANITE,
          },
          { kind: "appeared", id: "tier:cart", liveSec: 0 },
          { kind: "appeared", id: "system:workshop", liveSec: 60, sitting: 1 },
          { kind: "firstUse", id: "tier:borer", liveSec: 600, sitting: 3 },
          { kind: "appeared", id: "tier:borer", liveSec: 700, sitting: 4 },
          { kind: "firstUse", id: "tier:borer", liveSec: 800, sitting: 4 },
          { kind: "firstUse", id: "system:workshop", liveSec: 180, sitting: 3 },
          { kind: "firstUse", id: "never:shown", liveSec: 1 },
        ],
      ),
      {
        reveals: [{ kind: "appeared", id: "upgrade:x", liveSec: 0 }],
      } as unknown as DecisionSample,
      {
        reveals: [{ kind: "firstUse", id: "upgrade:x", liveSec: 120 }],
      } as unknown as DecisionSample,
      { bands: [] } as unknown as DecisionSample,
    ]);
    expect(run.favoured.get("granite")).toEqual({ afford: 0.1, buy: 0.3 });
    expect(run.buys.get("granite")?.get("borer")).toBe(2);
    expect(run.buys.get("granite")?.get("cart")).toBe(1);
    expect(run.machines.get("borer")).toEqual({
      layer: "granite",
      share: 0,
      minutes: 10,
      sittings: 2,
    });
    expect(run.machines.get("cart")).toEqual({ layer: "topsoil", share: 0 });
    expect(run.small).toEqual([
      { id: "system:workshop", sittings: 2, minutes: 2 },
      { id: "upgrade:x", sittings: 0, minutes: 2 },
    ]);
  });
});

function runOf(overrides: Partial<RunBands>): RunBands {
  return {
    favoured: new Map(),
    buys: new Map(),
    machines: new Map(),
    small: [],
    ...overrides,
  };
}

describe("summarizeBands", () => {
  it("is empty with no runs", () => {
    const summary = summarizeBands([]);
    expect(summary.runs).toBe(0);
    expect(summary.favoured.map((entry) => entry.machine)).toEqual([
      "borer",
      "drill",
      "machine",
    ]);
    expect(summary.favoured[0]?.afford).toEqual({ mean: 0, max: 0, runs: 0 });
    expect(summary.unbought).toEqual([]);
    expect(summary.machines).toEqual([]);
  });

  it("averages runs and flags misses and long waits", () => {
    const one = runOf({
      favoured: new Map([["granite", { afford: 0.2, buy: 0.4 }]]),
      buys: new Map([
        [
          "granite",
          new Map([
            ["cart", 0],
            ["borer", 2],
          ]),
        ],
      ]),
      machines: new Map([
        ["borer", { layer: "granite", share: 0.1, minutes: 30, sittings: 3 }],
      ]),
      small: [
        { id: "a", sittings: 2, minutes: 5 },
        { id: "b", sittings: 1, minutes: 9 },
      ],
    });
    const two = runOf({
      favoured: new Map([["granite", { afford: 0.4 }]]),
      buys: new Map([
        [
          "granite",
          new Map([
            ["cart", 1],
            ["borer", 4],
          ]),
        ],
      ]),
      machines: new Map([
        ["borer", { layer: "topsoil", share: 0.3 }],
        ["drill", { layer: "topsoil", share: 0, minutes: 1, sittings: 0 }],
      ]),
      small: [
        { id: "a", sittings: 3, minutes: 7 },
        { id: "a", sittings: 1, minutes: 1 },
        { id: "c", sittings: 4, minutes: 2 },
      ],
    });
    const summary = summarizeBands([one, two]);
    expect(summary.favoured[0]).toEqual({
      layer: "granite",
      machine: "borer",
      afford: { mean: 0.30000000000000004, max: 0.4, runs: 2 },
      buy: { mean: 0.4, max: 0.4, runs: 1 },
    });
    expect(summary.buys).toEqual([
      { layer: "granite", machine: "cart", mean: 0.5 },
      { layer: "granite", machine: "borer", mean: 3 },
    ]);
    expect(summary.unbought).toEqual([
      { layer: "granite", machine: "cart", runs: 1, of: 2 },
    ]);
    expect(summary.machines).toEqual([
      {
        machine: "drill",
        layer: "topsoil",
        share: 0,
        minutes: { mean: 1, max: 1, runs: 1 },
        sittings: { mean: 0, max: 0, runs: 1 },
        flagged: false,
      },
      {
        machine: "borer",
        layer: "granite",
        share: 0.2,
        minutes: { mean: 30, max: 30, runs: 1 },
        sittings: { mean: 3, max: 3, runs: 1 },
        flagged: true,
      },
    ]);
    expect(summary.small).toEqual([
      { id: "c", sittings: 4, minutes: 2 },
      { id: "a", sittings: 3, minutes: 7 },
    ]);
  });
});

describe("summarizeBands reveal band", () => {
  it("names the band a machine shows in most often", () => {
    const shown = (layer: "topsoil" | "granite") =>
      runOf({ machines: new Map([["cart", { layer, share: 0 }]]) });
    const summary = summarizeBands([
      shown("topsoil"),
      shown("granite"),
      shown("granite"),
    ]);
    expect(summary.machines[0]?.layer).toBe("granite");
  });
});

describe("createSittingClock", () => {
  it("starts a new sitting after time away", () => {
    const sittingAt = createSittingClock();
    expect(sittingAt(0)).toBe(0);
    expect(sittingAt(1000)).toBe(0);
    expect(sittingAt(60_000)).toBe(1);
    expect(sittingAt(61_000)).toBe(1);
  });
});
