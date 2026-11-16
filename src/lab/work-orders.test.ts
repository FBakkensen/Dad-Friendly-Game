import { describe, expect, it } from "vitest";
import { CHARGE_MS, AXLE_MS } from "../workshop";
import { PART_THREE_START } from "./targets";
import { workOrderTimes } from "./work-orders";

/**
 * The work orders sized again with no clock (#674): what each takes of
 * transport at the start of part 3, beside what its effect gives.
 */
describe("the work orders, sized with no clock (#674)", () => {
  const times = Object.fromEntries(
    workOrderTimes(PART_THREE_START).map((time) => [
      time.blueprint,
      { ...time, carryMinutes: time.carryHours * 60 },
    ]),
  );

  it("takes lasting gear about half an hour of half the fleet", () => {
    for (const id of ["iron-rails", "sturdy-props"]) {
      expect(times[id]?.carryMinutes, id).toBeGreaterThan(20);
      expect(times[id]?.carryMinutes, id).toBeLessThan(40);
    }
  });

  it("carries a blasting charge in well under the twenty minutes it lasts", () => {
    const charge = times["blasting-charge"]?.carryMinutes ?? Infinity;
    expect(charge).toBeGreaterThan(3);
    expect(charge).toBeLessThan(CHARGE_MS / 60_000 / 2);
  });

  it("keeps reinforce and axle grease iron only: under a minute to carry, waiting on the Granite", () => {
    for (const id of ["reinforce", "axle-grease"]) {
      expect(times[id]?.carryMinutes, id).toBeLessThan(1);
      expect(times[id]?.materialHours, id).toBeGreaterThan(0.25);
    }
    expect(times["axle-grease"]?.carryMinutes ?? Infinity).toBeLessThan(
      AXLE_MS / 60_000,
    );
  });

  it("reads its numbers", () => {
    expect(
      workOrderTimes(PART_THREE_START).map((time) => ({
        id: time.blueprint,
        carry: Math.round(time.carryHours * 600) / 10,
        materials: Math.round(time.materialHours * 100) / 100,
      })),
    ).toEqual([
      { id: "iron-rails", carry: 26.3, materials: 1.85 },
      { id: "sturdy-props", carry: 26.8, materials: 1.85 },
      { id: "blasting-charge", carry: 5.4, materials: 0.37 },
      { id: "reinforce", carry: 0.3, materials: 2.31 },
      { id: "axle-grease", carry: 0.1, materials: 0.46 },
    ]);
  });
});
