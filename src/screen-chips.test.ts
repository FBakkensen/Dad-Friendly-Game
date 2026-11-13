import { describe, expect, it } from "vitest";
import { createMountain } from "./mountain";
import { RUSH_MS, startRush } from "./gold-rush";
import { CRAFT_IDS, runningLabels, rushLabel } from "./screen-chips";
import {
  axleCrewMultiplier,
  emberMachineMultiplier,
  recipeById,
  withClock,
} from "./workshop";

const AT = 1_000_000;

describe("runningLabels", () => {
  it("a hot craft gets its short name, multiplier and time left", () => {
    const mountain = withClock(createMountain(), "crystal-flare", AT + 60_000);
    const flare = runningLabels(mountain, AT).crafts["crystal-flare"];
    expect(flare).toEqual({
      short: "Flare",
      full: recipeById("crystal-flare").name,
      multiplier:
        1 + (recipeById("crystal-flare").effect as { often: number }).often,
      leftMs: 60_000,
      active: true,
    });
  });

  it("a hot axle grease chip carries the crew multiplier", () => {
    const mountain = withClock(createMountain(), "axle-grease", AT + 60_000);
    const axle = runningLabels(mountain, AT).crafts["axle-grease"];
    expect(axle.active).toBe(true);
    expect(axle.multiplier).toBe(axleCrewMultiplier(mountain, AT));
  });

  it("a hot heartstone ember chip carries the machine multiplier", () => {
    const mountain = withClock(
      createMountain(),
      "heartstone-ember",
      AT + 60_000,
    );
    const ember = runningLabels(mountain, AT).crafts["heartstone-ember"];
    expect(ember.active).toBe(true);
    expect(ember.multiplier).toBe(emberMachineMultiplier(mountain, AT));
  });

  it("a cold craft is inactive", () => {
    const { crafts } = runningLabels(createMountain(), AT);
    expect(Object.keys(crafts)).toEqual([...CRAFT_IDS]);
    for (const label of Object.values(crafts)) {
      expect(label).toEqual({ short: "", full: "", leftMs: 0, active: false });
    }
  });

  it("the bench shows while it runs and is not a timer", () => {
    const mountain = {
      ...createMountain(),
      bench: { recipe: "iron-rails", startedAt: AT, endsAt: AT + 30_000 },
    } as const;
    expect(runningLabels(mountain, AT).bench).toEqual({
      short: "Rails",
      full: recipeById("iron-rails").name,
      leftMs: 30_000,
      active: true,
    });
  });

  it("a bench that is also a hot timer is not shown twice", () => {
    const mountain = {
      ...createMountain(),
      bench: {
        recipe: "blasting-charge",
        startedAt: AT,
        endsAt: AT + 30_000,
      },
    } as const;
    const labels = runningLabels(mountain, AT);
    expect(labels.crafts["blasting-charge"].active).toBe(true);
    expect(labels.bench.active).toBe(false);
  });

  it("a finished bench is inactive", () => {
    const mountain = {
      ...createMountain(),
      bench: { recipe: "iron-rails", startedAt: AT - 60_000, endsAt: AT },
    } as const;
    expect(runningLabels(mountain, AT).bench.active).toBe(false);
  });

  it("a bench this build cannot name is inactive", () => {
    const mountain = {
      ...createMountain(),
      bench: { recipe: "mystery", startedAt: AT, endsAt: AT + 1_000 },
    } as never;
    expect(runningLabels(mountain, AT).bench.active).toBe(false);
  });
});

describe("rushLabel (#468)", () => {
  it("names the Gold rush with its clock and no ×, and is off when none runs", () => {
    const rushed = startRush({ ...createMountain(), rushBank: 900 }, AT);
    expect(rushLabel(rushed, AT + 30_000)).toEqual({
      short: "Gold rush",
      full: "Gold rush",
      leftMs: RUSH_MS - 30_000,
      active: true,
    });
    expect(rushLabel(rushed, AT + RUSH_MS).active).toBe(false);
    expect(rushLabel(createMountain(), AT).active).toBe(false);
  });
});
