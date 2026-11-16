import { describe, expect, it } from "vitest";
import { createMountain, type Mountain } from "../mountain";
import type { DecisionSample } from "./measure";
import type { RevealEvent } from "./reveal";
import {
  bestOpenShare,
  createMachineBuyLog,
  createSittingClock,
  createSittingLog,
  dayNumber,
  fewestMachineBuys,
  isSampleSecond,
  longestBestWait,
  machineRevealSittings,
  medianBuys,
  medianTaps,
  placeSittings,
  sittingsOf,
  smallRevealSittings,
  withFinish,
  zeroBuyShare,
  type MachineBuy,
  type SittingEvent,
  type SittingOpen,
} from "./sittings";
import { DAY_MS, SAMPLE_INTERVAL_SEC } from "./targets";

const AFFORDABLE: SittingOpen = { kind: "affordable" };
const WAITING: SittingOpen = { kind: "waiting", waitSec: 600 };
const NOTHING: SittingOpen = { kind: "nothing" };

function sitting(
  index: number,
  buys: number,
  open: SittingOpen = AFFORDABLE,
): SittingEvent {
  return { sitting: index, openedAtMs: index * 1000, buys, taps: buys, open };
}

describe("createSittingLog", () => {
  it("closes a sitting at the gap with its buys and its opening view", () => {
    const log = createSittingLog();
    const opens: SittingOpen[] = [WAITING, AFFORDABLE];
    let asked = 0;
    const open = (): SittingOpen => {
      const view = opens[asked] ?? NOTHING;
      asked += 1;
      return view;
    };
    // Sitting 0: two live seconds, one buy, then a second buy of two.
    expect(log.observe({ clock: 1000, owned: 1, tiers: [], open })).toEqual([]);
    expect(log.observe({ clock: 2000, owned: 3, tiers: [], open })).toEqual([]);
    // The gap: sitting 0 closes, sitting 1 opens before any buy.
    const closed = log.observe({ clock: 60_000, owned: 3, tiers: [], open });
    expect(closed).toEqual([
      { sitting: 0, openedAtMs: 1000, buys: 2, taps: 2, open: WAITING },
    ]);
    expect(log.observe({ clock: 61_000, owned: 4, tiers: [], open })).toEqual(
      [],
    );
    expect(log.flush()).toEqual([
      { sitting: 1, openedAtMs: 60_000, buys: 1, taps: 1, open: AFFORDABLE },
    ]);
    expect(asked).toBe(2);
    expect(log.flush()).toEqual([]);
  });

  it("carries the narrow stage at the open and the zero-gain buys while the line is on (#534)", () => {
    const log = createSittingLog();
    const open = (): SittingOpen => AFFORDABLE;
    const narrow = (): "haul" => "haul";
    log.observe({ clock: 1000, owned: 1, tiers: [], open, narrow });
    log.observe({
      clock: 2000,
      owned: 2,
      tiers: [],
      open,
      narrow,
      zeroGainBuys: 1,
    });
    log.observe({
      clock: 3000,
      owned: 3,
      tiers: [],
      open,
      narrow,
      zeroGainBuys: 0,
    });
    expect(log.flush()).toEqual([
      {
        sitting: 0,
        openedAtMs: 1000,
        buys: 2,
        taps: 2,
        open: AFFORDABLE,
        narrow: "haul",
        zeroGainBuys: 1,
      },
    ]);
  });

  it("adds the worker taps of a fresh mine's sitting (#655)", () => {
    const log = createSittingLog();
    const open = (): SittingOpen => AFFORDABLE;
    log.observe({ clock: 1000, owned: 1, tiers: [], open });
    log.observe({ clock: 2000, owned: 1, tiers: [], open, workerTaps: 3 });
    log.observe({ clock: 3000, owned: 1, tiers: [], open, workerTaps: 2 });
    expect(log.flush()).toEqual([
      {
        sitting: 0,
        openedAtMs: 1000,
        buys: 0,
        taps: 0,
        open: AFFORDABLE,
        workerTaps: 5,
      },
    ]);
  });

  it("drops a sitting that opened after the last gap and was never played", () => {
    const log = createSittingLog();
    const open = (): SittingOpen => AFFORDABLE;
    log.observe({ clock: 1000, owned: 1, tiers: [], open });
    log.observe({ clock: 2000, owned: 2, tiers: [], open });
    expect(
      log.observe({ clock: 90_000, owned: 2, tiers: [], open }),
    ).toHaveLength(1);
    expect(log.flush()).toEqual([]);
  });

  it("counts only rises in the owned count", () => {
    const log = createSittingLog();
    const open = (): SittingOpen => AFFORDABLE;
    log.observe({ clock: 1000, owned: 5, tiers: [], open });
    log.observe({ clock: 2000, owned: 4, tiers: [], open });
    log.observe({ clock: 3000, owned: 6, tiers: [], open });
    expect(log.flush()).toEqual([
      { sitting: 0, openedAtMs: 1000, buys: 2, taps: 2, open: AFFORDABLE },
    ]);
  });
});

describe("taps on Max (#358)", () => {
  it("counts a tier bought once however many, and every other buy on its own", () => {
    const log = createSittingLog();
    const open = (): SittingOpen => AFFORDABLE;
    log.observe({ clock: 1000, owned: 10, tiers: [8, 2], open });
    // Three workers, then four carts, then two more workers: two tiers.
    log.observe({ clock: 2000, owned: 13, tiers: [11, 2], open });
    log.observe({ clock: 3000, owned: 17, tiers: [11, 6], open });
    log.observe({ clock: 4000, owned: 19, tiers: [13, 6], open });
    // An upgrade level: a buy that is no tier's.
    log.observe({ clock: 5000, owned: 20, tiers: [13, 6], open });
    expect(log.flush()).toEqual([
      { sitting: 0, openedAtMs: 1000, buys: 10, taps: 3, open: AFFORDABLE },
    ]);
  });

  it("reads the median taps per sitting", () => {
    const tapped = (index: number, taps: number): SittingEvent => ({
      ...sitting(index, 9),
      taps,
    });
    expect(medianTaps([tapped(0, 2), tapped(1, 3), tapped(2, 7)])).toBe(3);
    expect(medianTaps([])).toBeNaN();
  });
});

describe("placeSittings", () => {
  it("hangs each sitting on its own first sample, so a window keeps it", () => {
    // Samples every 1000 ms. Sitting 3 opened at 3600 (before the window),
    // sitting 4 opened at 4500, half a sample before the window's first
    // sample at 5000, and closed later.
    const samples: { atMs: number; sittings?: readonly SittingEvent[] }[] = [
      { atMs: 3000 },
      { atMs: 4000 },
      { atMs: 5000 },
      { atMs: 6000 },
    ];
    const before: SittingEvent = {
      sitting: 3,
      openedAtMs: 3600,
      buys: 8,
      taps: 3,
      open: AFFORDABLE,
    };
    const inside: SittingEvent = {
      sitting: 4,
      openedAtMs: 4500,
      buys: 0,
      taps: 0,
      open: WAITING,
    };
    placeSittings(samples, [before]);
    placeSittings(samples, [inside]);
    expect(sittingsOf(samples)).toEqual([before, inside]);
    // A scope that starts at the 5000 sample keeps only sitting 4.
    expect(sittingsOf(samples.slice(2))).toEqual([inside]);
  });

  it("falls back to the newest sample, and skips an empty run", () => {
    const samples: { atMs: number; sittings?: readonly SittingEvent[] }[] = [
      { atMs: 1000 },
    ];
    const late = sitting(9, 1);
    placeSittings(samples, [late]);
    expect(sittingsOf(samples)).toEqual([late]);
    const none: { atMs: number }[] = [];
    placeSittings(none, [late]);
    expect(none).toEqual([]);
  });
});

describe("sitting measures", () => {
  const events = [
    sitting(0, 0, WAITING),
    sitting(1, 3, AFFORDABLE),
    sitting(2, 0, WAITING),
    sitting(3, 1, WAITING),
    sitting(4, 5, NOTHING),
  ];

  it("reads the share of sittings with no buy", () => {
    expect(zeroBuyShare(events)).toBeCloseTo(2 / 5);
  });

  it("reads the median buys per sitting", () => {
    expect(medianBuys(events)).toBe(1);
    expect(medianBuys([sitting(0, 2), sitting(1, 4)])).toBe(3);
  });

  it("reads how often the best buy is in reach at the open, skipping empty tables", () => {
    expect(bestOpenShare(events)).toBeCloseTo(1 / 4);
  });

  it("reads the longest run of sittings opening with the best buy out of reach", () => {
    expect(longestBestWait(events)).toBe(2);
    expect(longestBestWait([sitting(0, 1, AFFORDABLE)])).toBe(0);
  });

  it("is not a number with no sittings", () => {
    expect(zeroBuyShare([])).toBeNaN();
    expect(medianBuys([])).toBeNaN();
    expect(bestOpenShare([sitting(0, 1, NOTHING)])).toBeNaN();
    expect(longestBestWait([])).toBeNaN();
  });
});

describe("the sample clock", () => {
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

  it("starts a new sitting after time away", () => {
    const sittingAt = createSittingClock();
    expect(sittingAt(0)).toBe(0);
    expect(sittingAt(1000)).toBe(0);
    expect(sittingAt(60_000)).toBe(1);
    expect(sittingAt(61_000)).toBe(1);
  });
});

function withOwned(owned: Partial<Mountain["owned"]>): Mountain {
  const start = createMountain();
  return { ...start, owned: { ...start.owned, helper: 1, ...owned } };
}

function carrying(over: {
  readonly machineBuys?: readonly MachineBuy[];
  readonly reveals?: readonly RevealEvent[];
}): DecisionSample {
  return over as unknown as DecisionSample;
}

describe("machine buys (#357)", () => {
  it("logs each machine bought since the last look", () => {
    const log = createMachineBuyLog();
    expect(log(withOwned({}))).toEqual([]);
    expect(log(withOwned({ cart: 2 }))).toEqual([{ tier: "cart", count: 2 }]);
    expect(log(withOwned({ cart: 2 }))).toEqual([]);
  });

  it("reads the smallest per-tier total, and 0 for a machine never bought", () => {
    const samples = [
      carrying({
        machineBuys: [
          { tier: "cart", count: 30 },
          { tier: "drill", count: 25 },
          { tier: "borer", count: 6 },
          { tier: "machine", count: 9 },
        ],
      }),
      carrying({
        machineBuys: [
          { tier: "cart", count: 20 },
          { tier: "drill", count: 20 },
          { tier: "borer", count: 10 },
          { tier: "machine", count: 10 },
        ],
      }),
    ];
    expect(fewestMachineBuys(samples)).toBe(16);
    expect(fewestMachineBuys([carrying({ machineBuys: [] })])).toBe(0);
    expect(fewestMachineBuys([])).toBe(0);
  });
});

describe("reveal to first use (M12-4, #252)", () => {
  it("reads the worst wait in sittings for a machine and for a small thing", () => {
    const samples = [
      carrying({
        reveals: [
          { kind: "appeared", id: "tier:borer", liveSec: 0, sitting: 1 },
          { kind: "appeared", id: "tier:cart", liveSec: 0 },
          { kind: "appeared", id: "system:workshop", liveSec: 60, sitting: 1 },
          { kind: "firstUse", id: "tier:borer", liveSec: 600, sitting: 3 },
          { kind: "appeared", id: "tier:borer", liveSec: 700, sitting: 4 },
          { kind: "firstUse", id: "tier:borer", liveSec: 800, sitting: 9 },
          { kind: "firstUse", id: "system:workshop", liveSec: 180, sitting: 4 },
          { kind: "firstUse", id: "never:shown", liveSec: 1 },
        ],
      }),
      carrying({
        reveals: [{ kind: "appeared", id: "upgrade:x", liveSec: 0 }],
      }),
      carrying({
        reveals: [{ kind: "firstUse", id: "upgrade:x", liveSec: 120 }],
      }),
      carrying({}),
    ];
    // The borer's second showing does not count: a machine keeps its first wait.
    expect(machineRevealSittings(samples)).toBe(2);
    expect(smallRevealSittings(samples)).toBe(3);
  });

  it("is not a number when nothing was shown and used", () => {
    expect(machineRevealSittings([])).toBeNaN();
    expect(smallRevealSittings([])).toBeNaN();
  });
});
