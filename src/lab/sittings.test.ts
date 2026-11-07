import { describe, expect, it } from "vitest";
import {
  bestOpenShare,
  createSittingLog,
  longestBestWait,
  medianBuys,
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
  return { sitting: index, openedAtMs: index * 1000, buys, open };
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
    expect(log.observe({ clock: 1000, owned: 1, open })).toEqual([]);
    expect(log.observe({ clock: 2000, owned: 3, open })).toEqual([]);
    // The gap: sitting 0 closes, sitting 1 opens before any buy.
    const closed = log.observe({ clock: 60_000, owned: 3, open });
    expect(closed).toEqual([
      { sitting: 0, openedAtMs: 1000, buys: 2, open: WAITING },
    ]);
    expect(log.observe({ clock: 61_000, owned: 4, open })).toEqual([]);
    expect(log.flush()).toEqual([
      { sitting: 1, openedAtMs: 60_000, buys: 1, open: AFFORDABLE },
    ]);
    expect(asked).toBe(2);
    expect(log.flush()).toEqual([]);
  });

  it("drops a sitting that opened after the last gap and was never played", () => {
    const log = createSittingLog();
    const open = (): SittingOpen => AFFORDABLE;
    log.observe({ clock: 1000, owned: 1, open });
    log.observe({ clock: 2000, owned: 2, open });
    expect(log.observe({ clock: 90_000, owned: 2, open })).toHaveLength(1);
    expect(log.flush()).toEqual([]);
  });

  it("counts only rises in the owned count", () => {
    const log = createSittingLog();
    const open = (): SittingOpen => AFFORDABLE;
    log.observe({ clock: 1000, owned: 5, open });
    log.observe({ clock: 2000, owned: 4, open });
    log.observe({ clock: 3000, owned: 6, open });
    expect(log.flush()).toEqual([
      { sitting: 0, openedAtMs: 1000, buys: 2, open: AFFORDABLE },
    ]);
  });
});

describe("sittingsOf", () => {
  it("keeps only sittings that opened inside the sample window", () => {
    // A sitting closes at the next open, so it rides on a later sample. A
    // scope that starts at hour 24 must not count the last day-one sitting.
    const early = sitting(3, 8);
    const late = sitting(4, 0, WAITING);
    const window = [
      { atMs: 4000, sittings: [early] },
      { atMs: 5000, sittings: [late] },
    ];
    expect(sittingsOf(window)).toEqual([late]);
    expect(sittingsOf([])).toEqual([]);
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
