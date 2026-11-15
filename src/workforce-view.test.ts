import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { createMountain, type Mountain } from "./mountain";
import { NO_FREE_WORKER, workforceView } from "./workforce-view";

/** The workforce's jobs (slice 1, #659). */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

function notes(mountain: Mountain): Record<string, string> {
  return Object.fromEntries(
    workforceView(mountain).groups.flatMap((group) =>
      group.rows.map((row) => [row.name, row.note]),
    ),
  );
}

describe("workforce view", () => {
  it("lists every open job, grouped by site, with its count", () => {
    fresh(() => {
      const view = workforceView(createMountain());
      expect(view.owned).toBe(21);
      expect(view.free).toBe(0);
      expect(
        view.groups.map((group) => [
          group.name,
          group.rows.map((row) => [row.name, row.count]),
        ]),
      ).toEqual([
        [
          "Mine",
          [
            ["Drilling", 6],
            ["Haulage", 6],
            ["Hoisting", 6],
          ],
        ],
        [
          "City",
          [
            ["Transport", 1],
            ["Building", 2],
          ],
        ],
      ]);
    });
  });

  it("says what each job's workers run on the first evening", () => {
    fresh(() => {
      expect(notes(createMountain())).toEqual({
        Drilling: "6 with picks",
        Haulage: "6 with barrows",
        Hoisting: "6 on winches",
        Transport: "1 of 1 vehicle runs",
        Building: "each builds 8/s",
      });
    });
  });

  it("counts the machines that run of the ones he owns, then the tools", () => {
    fresh(() => {
      const start = createMountain();
      const carts: Mountain = {
        ...start,
        owned: { ...start.owned, cart: 3, helper: 14 },
        jobs: { ...start.jobs, haulage: 3, hoisting: 1, drilling: 0 },
        fleet: { ...start.fleet, horseWagon: 3 },
      };
      const said = notes(carts);
      // A cart takes one worker and beats a barrow: three workers run three carts.
      expect(said.Haulage).toBe("3 of 3 carts run");
      expect(said.Hoisting).toBe("1 on a winch");
      expect(said.Drilling).toBe("0 with picks");
      expect(said.Transport).toBe("1 of 3 vehicles run");
    });
  });

  it("shows a machine short of workers beside the tools", () => {
    fresh(() => {
      const start = createMountain();
      const short: Mountain = {
        ...start,
        owned: { ...start.owned, cart: 3 },
        jobs: { ...start.jobs, haulage: 2 },
      };
      expect(notes(short).Haulage).toBe("2 of 3 carts run");
    });
  });

  it("offers + only with a free worker, and − only with one on the job", () => {
    fresh(() => {
      const start = createMountain();
      const none = workforceView({
        ...start,
        jobs: { ...start.jobs, building: 0 },
      });
      const building = none.groups[1]?.rows[1];
      expect(none.free).toBe(2);
      expect(building).toMatchObject({ canPlace: true, canFree: false });
      const full = workforceView(start).groups[0]?.rows[0];
      expect(full).toMatchObject({ canPlace: false, canFree: true });
    });
  });

  it("says how to find a worker when none is free", () => {
    expect(NO_FREE_WORKER).toBe(
      "No free worker. Hire one, or take one off another job.",
    );
  });
});
