import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { PART_TWO_OFF } from "./part-switch";
import type { Mountain } from "./mountain";
import { crewedStart } from "./test-fixtures";
import { levels, partThree, partTwo } from "./part-three.harness";
import { NO_FREE_WORKER, jobSites, workforceView } from "./workforce-view";

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
      const view = workforceView(crewedStart());
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
      expect(notes(crewedStart())).toEqual({
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
      const start = crewedStart();
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

  it("says one vehicle runs whether or not it has a driver (#715)", () => {
    fresh(() => {
      const start = crewedStart();
      const idle = { ...start, jobs: { ...start.jobs, driving: 0 } };
      expect(notes(idle).Transport).toBe("0 of 1 vehicle runs");
      const cart = {
        ...idle,
        owned: { ...idle.owned, cart: 1 },
        jobs: { ...idle.jobs, haulage: 0 },
      };
      expect(notes(cart).Haulage).toBe("0 of 1 cart runs");
    });
  });

  it("offers + on transport only while a vehicle has no driver (#715)", () => {
    fresh(() => {
      const start = crewedStart();
      const free = { ...start, jobs: { ...start.jobs, building: 0 } };
      const transport = (mountain: Mountain) =>
        workforceView(mountain).groups[1]?.rows[0];
      expect(transport(free)).toMatchObject({ count: 1, canPlace: false });
      expect(
        transport({ ...free, fleet: { ...free.fleet, horseWagon: 2 } }),
      ).toMatchObject({ canPlace: true });
    });
  });

  it("shows a machine short of workers beside the tools", () => {
    fresh(() => {
      const start = crewedStart();
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
      const start = crewedStart();
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

describe("the refinery's jobs (#671)", () => {
  const partTwo = <T>(body: () => T): T =>
    withFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0 }, body);

  /** The Light Tower operational, kilns bought and workers on them. */
  function kilns(owned: number, on: number): Mountain {
    const start = crewedStart();
    return {
      ...start,
      owned: { ...start.owned, helper: start.owned.helper + on },
      operational: ["lightTower"],
      makers: { kiln: owned, saw: 0 },
      jobs: { ...start.jobs, kilns: on },
    };
  }

  it("groups the kilns under the refinery, between the mine and the city", () => {
    partTwo(() => {
      expect(
        workforceView(kilns(2, 1)).groups.map((group) => group.name),
      ).toEqual(["Mine", "Refinery", "City"]);
      expect(notes(kilns(2, 1))["Kilns"]).toBe("1 of 2 kilns run");
      // As the kilns' plate says it before the first kiln.
      expect(notes(kilns(0, 0))["Kilns"]).toBe("No kilns yet");
      expect(notes(kilns(1, 1))["Kilns"]).toBe("1 of 1 kiln runs");
      expect(notes(kilns(1, 3))["Kilns"]).toBe("1 of 1 kiln runs");
    });
  });

  it("has no refinery before it opens, or in part 1", () => {
    partTwo(() => {
      const before = { ...kilns(0, 0), operational: [] };
      expect(workforceView(before).groups.map((group) => group.name)).toEqual([
        "Mine",
        "City",
      ]);
    });
    fresh(() => {
      expect(
        workforceView(kilns(0, 0)).groups.map((group) => group.name),
      ).toEqual(["Mine", "City"]);
    });
  });
});

describe("the mine's jobs by level (#680)", () => {
  const names = (mountain: Mountain) =>
    jobSites(mountain).map((group) => group.name);

  it("lists the mine's jobs by level once the Granite is open", () => {
    const groups = partThree(() => jobSites(levels({})));
    expect(groups.slice(0, 3).map((group) => group.name)).toEqual([
      "Topsoil",
      "Granite",
      "Shaft",
    ]);
    expect(
      groups.slice(0, 3).map((group) => group.jobs.map((job) => job.job)),
    ).toEqual([
      ["drilling", "haulage"],
      ["graniteDrilling", "graniteHaulage"],
      ["hoisting"],
    ]);
  });

  it("is today's one mine group with part 3 off, or the shaft not sunk", () => {
    expect(partTwo(() => names(levels({})))[0]).toBe("Mine");
    expect(partThree(() => names(levels({ sunk: false })))[0]).toBe("Mine");
  });

  it("counts each level's own machines in its notes", () => {
    const view = partThree(() =>
      workforceView(
        levels({
          topsoil: 3,
          granite: 3,
          machines: { drill: 1 },
        }),
      ),
    );
    const mine = view.groups.filter((group) => group.site === "mine");
    expect(mine.map((group) => group.name)).toEqual([
      "Topsoil",
      "Granite",
      "Shaft",
    ]);
    const granite = mine[1]?.rows[0];
    expect(granite?.job).toBe("graniteDrilling");
    expect(granite?.note).toMatch(/^1 of 1 drill runs/);
    expect(mine[0]?.rows[0]?.note).not.toMatch(/drill/);
  });
});
