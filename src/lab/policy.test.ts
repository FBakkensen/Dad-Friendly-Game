import { describe, expect, it } from "vitest";
import casual from "./fresh-policies/casual-2x10";
import evening from "./fresh-policies/evening-1x20";
import fiveMin from "./fresh-policies/five-min-a-day";
import marathon from "./fresh-policies/marathon";
import { DAY_MS } from "./targets";

const MINUTE_MS = 60 * 1000;

describe("the player types' sittings", () => {
  it("keeps the plain dad's day: two 10-minute sittings, no jitter", () => {
    expect(casual.schedule.sessionMs).toBe(10 * MINUTE_MS);
    expect(casual.schedule.gapMs(0, 1)).toBe(DAY_MS / 2 - 10 * MINUTE_MS);
    expect(casual.schedule.gapMs(1, 2)).toBe(casual.schedule.gapMs(0, 1));
  });

  it("gives the evening dad one 20-minute sitting", () => {
    expect(evening.params).toMatchObject({
      sessionsPerDay: 1,
      minutesPerSession: 20,
      gapJitter: 0,
    });
    expect(evening.schedule.gapMs(0, 1)).toBe(DAY_MS - 20 * MINUTE_MS);
  });

  it("gives five minutes, or one long sitting, and nothing else changes", () => {
    expect(fiveMin.params).toMatchObject({
      sessionsPerDay: 1,
      minutesPerSession: 5,
      gapJitter: 0,
    });
    expect(fiveMin.schedule.sessionMs).toBe(5 * MINUTE_MS);
    expect(fiveMin.schedule.gapMs(0, 1)).toBe(DAY_MS - 5 * MINUTE_MS);
    expect(marathon.params).toMatchObject({
      sessionsPerDay: 1,
      minutesPerSession: 180,
      gapJitter: 0,
    });
    expect(marathon.schedule.gapMs(3, 7)).toBe(DAY_MS - 180 * MINUTE_MS);
    expect(fiveMin.fresh).toEqual(marathon.fresh);
    expect(fiveMin.params.hoardK).toBe(marathon.params.hoardK);
    expect(fiveMin.params.trouble).toBe(marathon.params.trouble);
  });
});
