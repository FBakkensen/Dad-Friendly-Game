import { describe, expect, it } from "vitest";
import {
  QUICK_VEIN_AWAY_MS,
  RUSH_MS,
  RUSH_MULTIPLIER,
  holdForRush,
  payRush,
  releaseRush,
  resumeRush,
  rushLeft,
  rushOwed,
  rushPerSecond,
  startRush,
} from "./gold-rush";
import { accrue, accrueAway, type Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { minedMountain } from "./test-fixtures";

const T = 1_000_000;
const HOUR = 60 * 60 * 1000;

/** A crew of 10 workers: 10 stones a second. */
const crew = (): Mountain => ({ ...minedMountain(0), helpers: 10, kids: 0 });

/** Plays `seconds` of live time one second at a time, as the screen's tick does. */
function play(mountain: Mountain, from: number, seconds: number): Mountain {
  let m = mountain;
  for (let s = 0; s < seconds; s += 1) {
    m = accrue({
      mountain: m,
      from: from + s * 1000,
      to: from + (s + 1) * 1000,
      live: true,
    }).mountain;
  }
  return m;
}

describe("the Gold rush", () => {
  it("holds back what the crew would dig on top of itself, never more than the haul", () => {
    expect(RUSH_MULTIPLIER).toBe(10);
    expect(RUSH_MS).toBe(90_000);
    const held = holdForRush({ ...crew(), pocket: 100_000 }, 50_000, 10);
    // 9 × 10/s × 90 s
    expect(held.rushBank).toBe(8_100);
    expect(held.pocket).toBe(100_000 - 8_100);
    expect(holdForRush(crew(), 500, 10).rushBank).toBe(500);
    const none = crew();
    expect(holdForRush(none, 0, 10)).toBe(none);
  });

  it("is owed until the quick vein starts it, and needs held stones to start", () => {
    const held = holdForRush(crew(), 50_000, 10);
    expect(rushOwed(held)).toBe(true);
    const rushed = startRush(held, T);
    expect(rushOwed(rushed)).toBe(false);
    expect(rushLeft(rushed, T)).toBe(90_000);
    const none = crew();
    expect(startRush(none, T)).toBe(none);
  });

  it("pays the held stones over 90 seconds of live play: the crew digs ×10", () => {
    const held = holdForRush({ ...crew(), pocket: 50_000 }, 50_000, 10);
    const rushed = startRush(held, T);
    expect(rushPerSecond(rushed, T)).toBe(90);
    expect(effectiveRates(rushed, T).crewPerSecond).toBe(100);
    expect(effectiveRates(rushed).crewPerSecond).toBe(10);
    const after = play(rushed, T, 90);
    // the crew's own 10/s, plus every held stone
    expect(after.pocket - held.pocket).toBe(90 * 10 + 8_100);
    expect(after).not.toHaveProperty("rushBank");
    expect(after).not.toHaveProperty("rushUntil");
    // the mountain only gave the crew's own stones: the held ones were dug away
    expect(held.remaining - after.remaining).toBe(900);
  });

  it("never counts without a clock, so away pay never sees it", () => {
    const rushed = startRush(holdForRush(crew(), 50_000, 10), T);
    expect(rushPerSecond(rushed, undefined)).toBe(0);
  });

  it("pays what is left at once when the mountain bottoms out", () => {
    const rushed = startRush(
      holdForRush({ ...crew(), pocket: 50_000, remaining: 0 }, 50_000, 10),
      T,
    );
    expect(rushLeft(rushed, T)).toBe(0);
    const paid = payRush(rushed, T, 1);
    expect(paid.paid).toBe(8_100);
    expect(paid.mountain.pocket).toBe(50_000);
  });

  it("cannot be stretched by a clock set back", () => {
    const rushed = startRush(holdForRush(crew(), 50_000, 10), T);
    expect(rushLeft(rushed, T - 60_000)).toBe(90_000);
  });

  it("lands every held stone when it is missed", () => {
    const held = holdForRush({ ...crew(), pocket: 1_000 }, 50_000, 10);
    const missed = releaseRush(held);
    expect(missed.pocket).toBe(1_000);
    expect(missed).not.toHaveProperty("rushBank");
  });

  it("keeps its time left over a short break, and lands after an hour away", () => {
    const rushed = startRush(holdForRush(crew(), 50_000, 10), T);
    const back = resumeRush(rushed, T + 30_000, T + 30_000 + 5 * 60_000);
    expect(rushLeft(back, T + 30_000 + 5 * 60_000)).toBe(60_000);
    const gone = resumeRush(rushed, T + 1_000, T + 1_000 + QUICK_VEIN_AWAY_MS);
    expect(gone).not.toHaveProperty("rushUntil");
    expect(gone).not.toHaveProperty("rushBank");
    expect(gone.pocket).toBe(rushed.pocket + 8_100);
    const ended = resumeRush(rushed, T + RUSH_MS, T + RUSH_MS + 1_000);
    expect(ended).not.toHaveProperty("rushBank");
    const plain = crew();
    expect(resumeRush(plain, T, T + 1_000)).toBe(plain);
  });

  it("holds part of an hour's haul on the open, and the total stays the same", () => {
    const start = { ...crew(), pocket: 0 };
    const away = accrueAway({ mountain: start, lastSeen: T, now: T + HOUR });
    expect(away.report.heldForRush).toBe(8_100);
    expect(away.mountain.rushBank).toBe(8_100);
    expect(away.mountain.pocket).toBe(away.mined - 8_100);
    // a short break holds nothing
    const brief = accrueAway({
      mountain: start,
      lastSeen: T,
      now: T + 600_000,
    });
    expect(brief.report.heldForRush).toBe(0);
    expect(brief.mountain).not.toHaveProperty("rushBank");
    // played or missed, the pocket ends the same
    const at = T + HOUR;
    const played = play(startRush(away.mountain, at), at, 90);
    const missed = play(releaseRush(away.mountain), at, 90);
    expect(played.pocket).toBe(missed.pocket);
  });

  it("pauses through a short break without speeding the away pay", () => {
    const held = holdForRush(crew(), 50_000, 10);
    const rushed = startRush(held, T);
    const away = accrueAway({
      mountain: rushed,
      lastSeen: T,
      now: T + 600_000,
    });
    const plain = accrueAway({ mountain: held, lastSeen: T, now: T + 600_000 });
    expect(away.mined).toBe(plain.mined);
    expect(rushLeft(away.mountain, T + 600_000)).toBe(90_000);
  });

  it("an owed rush survives a short break and lands at the next hour away", () => {
    const held = holdForRush(crew(), 50_000, 10);
    const brief = accrueAway({ mountain: held, lastSeen: T, now: T + 60_000 });
    expect(rushOwed(brief.mountain)).toBe(true);
    expect(brief.mountain.rushBank).toBe(8_100);
    const long = accrueAway({ mountain: held, lastSeen: T, now: T + 2 * HOUR });
    // the old hold landed, and a fresh one waits
    expect(long.mountain.pocket).toBe(held.pocket + 8_100 + long.mined - 8_100);
    expect(long.mountain.rushBank).toBe(8_100);
  });
});
