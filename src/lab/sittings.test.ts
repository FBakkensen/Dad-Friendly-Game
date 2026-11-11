import { describe, expect, it } from "vitest";
import {
  bestOpenShare,
  createSittingLog,
  longestBestWait,
  medianBuys,
  medianTaps,
  placeSittings,
  sittingsOf,
  zeroBuyShare,
  type SittingEvent,
  type SittingOpen,
} from "./sittings";

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
