import { describe, expect, it } from "vitest";
import {
  QUICK_VEIN_AWAY_MS,
  RUSH_MS,
  RUSH_MULTIPLIER,
  resumeRush,
  rushLeft,
  rushMultiplier,
  startRush,
} from "./gold-rush";
import { accrueAway } from "./mountain";
import { minedMountain } from "./test-fixtures";

const T = 1_000_000;

describe("the Gold rush", () => {
  it("runs ×10 for 90 seconds of live play", () => {
    const rushed = startRush(minedMountain(0), T);
    expect(RUSH_MULTIPLIER).toBe(10);
    expect(RUSH_MS).toBe(90_000);
    expect(rushLeft(rushed, T)).toBe(90_000);
    expect(rushMultiplier(rushed, T + 89_999)).toBe(10);
    expect(rushMultiplier(rushed, T + 90_000)).toBe(1);
  });

  it("never counts without a clock, so away pay never sees it", () => {
    expect(rushMultiplier(startRush(minedMountain(0), T), undefined)).toBe(1);
  });

  it("stops at the bottom of the mountain", () => {
    const rushed = startRush({ ...minedMountain(0), remaining: 0 }, T);
    expect(rushLeft(rushed, T)).toBe(0);
  });

  it("cannot be stretched by a clock set back", () => {
    expect(rushLeft(startRush(minedMountain(0), T), T - 60_000)).toBe(90_000);
  });

  it("keeps its time left over a short break", () => {
    const rushed = startRush(minedMountain(0), T);
    const back = resumeRush(rushed, T + 30_000, T + 30_000 + 5 * 60_000);
    expect(rushLeft(back, T + 30_000 + 5 * 60_000)).toBe(60_000);
  });

  it("is dropped after an hour away, or once it has ended", () => {
    const rushed = startRush(minedMountain(0), T);
    expect(
      resumeRush(rushed, T + 1_000, T + 1_000 + QUICK_VEIN_AWAY_MS),
    ).not.toHaveProperty("rushUntil");
    expect(
      resumeRush(rushed, T + RUSH_MS, T + RUSH_MS + 1_000),
    ).not.toHaveProperty("rushUntil");
    const plain = minedMountain(0);
    expect(resumeRush(plain, T, T + 1_000)).toBe(plain);
  });

  it("pauses through away time without speeding the away pay", () => {
    const crew = { ...minedMountain(0), helpers: 10, kids: 0 };
    const rushed = startRush(crew, T);
    const away = accrueAway({
      mountain: rushed,
      lastSeen: T,
      now: T + 600_000,
    });
    const plain = accrueAway({ mountain: crew, lastSeen: T, now: T + 600_000 });
    expect(away.mined).toBe(plain.mined);
    expect(rushLeft(away.mountain, T + 600_000)).toBe(90_000);
  });
});
