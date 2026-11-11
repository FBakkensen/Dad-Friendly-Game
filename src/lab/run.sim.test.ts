import { describe, expect, it } from "vitest";
import { plainPolicy } from "./plain";
import { runPolicy } from "./run";

// Plays a lab day twice, so it lives in the sim project (#468).
describe("the lab's quick vein (#468)", () => {
  it("taps it as he opens after an hour away, never after a short break", () => {
    const rushesFor = (sessionsPerDay: number): number => {
      const policy = plainPolicy({
        id: "rush-probe",
        label: "Rush probe",
        kind: "casual",
        sessionsPerDay,
        minutesPerSession: 2,
      });
      const starts = new Set<number>();
      runPolicy({
        policy,
        seed: 1,
        maxDays: 1,
        observe: (world) => {
          if (world.mountain.rushUntil !== undefined) {
            starts.add(world.mountain.rushUntil);
          }
        },
      });
      return starts.size;
    };
    // Four sittings a day, about six hours apart: each gap ends in a tap.
    expect(rushesFor(4)).toBe(4);
    // Sittings every half hour or so: no gap reaches an hour.
    expect(rushesFor(48)).toBe(0);
  });
});
