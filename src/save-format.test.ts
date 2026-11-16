import { describe, expect, it } from "vitest";
import { onTrip } from "./engineers";
import { createMountain, MOUNTAIN_STONES, type Mountain } from "./mountain";
import { readGame, writeGame } from "./save-format";

const ADA = { name: "Ada", rank: 0, trips: 0, post: "borer" } as const;

/** Writes and reads a mountain's game map through JSON. */
function roundTrip(mountain: Mountain): Mountain | undefined {
  const read = readGame(
    JSON.parse(JSON.stringify(writeGame(mountain))),
    mountain.startedAt,
  );
  return read.kind === "ok" ? read.mountain : undefined;
}

describe("the game map (#558)", () => {
  it("saves every field of the mountain: a mountain with none at its default comes back whole", () => {
    // A new Mountain field must be named here, with the map it is saved in.
    const homes = {
      remaining: "run",
      stock: "stock",
      owned: "owned",
      upgrades: "levels",
      startedAt: "envelope",
      engineers: "engineers",
      expeditions: "expeditions",
      finds: "marks",
      bench: "bench",
      crafted: "levels",
      recipes: "marks",
      clocks: "clocks",
      seen: "marks",
      taught: "marks",
      fleet: "fleet",
      operational: "marks",
      project: "project",
      jobs: "jobs",
      piles: "piles",
      makers: "makers",
      stockyard: "stockyard",
      rockDug: "run",
      granite: "granite",
    } as const satisfies Record<keyof Mountain, string>;
    const fresh = createMountain();
    const full: Mountain = {
      ...fresh,
      remaining: MOUNTAIN_STONES - 5_000,
      stock: {
        ...fresh.stock,
        stones: 7,
        clay: 3,
        iron: 2,
        crystal: 1,
        heartstone: 0,
        brick: 4,
      },
      owned: {
        ...fresh.owned,
        helper: 9,
        cart: 2,
        hoist: 3,
        drill: 1,
        borer: 1,
        train: 2,
        machine: 1,
        kid: 1,
      },
      upgrades: { ...fresh.upgrades, boots: 1 },
      startedAt: 500,
      engineers: [ADA],
      expeditions: [
        {
          engineer: "Ada",
          tunnel: "side-seam",
          sentAt: 100,
          returnsAt: 200,
          find: { kind: "quiet" },
        },
      ],
      finds: ["map"],
      bench: { recipe: "iron-rails", startedAt: 10, endsAt: 20 },
      crafted: { ...fresh.crafted, "sturdy-props": 1 },
      recipes: [...fresh.recipes, "reinforce"],
      clocks: {
        ...fresh.clocks,
        "axle-grease": 3_000,
        "blasting-charge": 4_000,
      },
      seen: ["workshop"],
      taught: ["engineers"],
      fleet: { ...fresh.fleet, horseWagon: 3 },
      operational: ["lightTower"],
      project: { kind: "unordered" },
      jobs: {
        drilling: 2,
        haulage: 1,
        hoisting: 0,
        driving: 3,
        building: 2,
        kilns: 1,
        graniteDrilling: 0,
        graniteHaulage: 0,
        saws: 0,
      },
      piles: { face: 40, shaft: 9, kiln: 30 },
      makers: { kiln: 2, saw: 0 },
      stockyard: 1,
      rockDug: 12_345,
      granite: {
        kind: "sunk",
        machines: { cart: 1, drill: 0, borer: 1, train: 0 },
        piles: { face: 5, shaft: 0, saw: 3 },
      },
    };
    // Part 1 has one building, so an operational one and a project in hand
    // are two mountains (#654).
    const ordered: Mountain = {
      ...full,
      operational: [],
      project: {
        kind: "onHold",
        site: {
          building: "lightTower",
          step: 1,
          arrived: { ...fresh.stock, stones: 500 },
          onSite: { ...fresh.stock, stones: 120 },
        },
      },
    };
    for (const key of Object.keys(homes) as (keyof Mountain)[]) {
      expect(
        [full, ordered].some(
          (one) => JSON.stringify(one[key]) !== JSON.stringify(fresh[key]),
        ),
        key,
      ).toBe(true);
    }
    expect(roundTrip(full)).toEqual(full);
    expect(roundTrip(ordered)).toEqual(ordered);
  });

  it("saves a fresh mine's fleet, project and buildings only when they are not empty (#654)", () => {
    const today = writeGame(createMountain());
    expect(today).not.toHaveProperty("fleet");
    expect(today).not.toHaveProperty("project");
    const fresh = createMountain();
    const game = writeGame({
      ...fresh,
      fleet: { horseWagon: 2, truck: 0 },
      project: {
        kind: "delivering",
        site: {
          building: "lightTower",
          step: 2,
          arrived: { ...fresh.stock, stones: 40 },
          onSite: fresh.stock,
        },
      },
    });
    expect(game.fleet).toEqual({ horseWagon: 2 });
    expect(game.project).toEqual({
      building: "lightTower",
      state: "delivering",
      step: 2,
      arrived: { stones: 40 },
    });
  });

  it("saves what is on the building site, and refuses a site that cannot be (#690)", () => {
    const fresh = createMountain();
    const game = writeGame({
      ...fresh,
      project: {
        kind: "delivering",
        site: {
          building: "lightTower",
          step: 0,
          arrived: { ...fresh.stock, stones: 400 },
          onSite: { ...fresh.stock, stones: 300 },
        },
      },
    });
    expect(game.project).toEqual({
      building: "lightTower",
      state: "delivering",
      step: 0,
      arrived: { stones: 400 },
      onSite: { stones: 300 },
    });
    const project = (value: unknown) => readGame({ project: value }, 0).kind;
    const good = {
      building: "lightTower",
      state: "delivering",
      step: 0,
      arrived: { stones: 600 },
      onSite: { stones: 500 },
    };
    expect(project(good)).toBe("ok");
    // All of a step arrived, some still to build in, is a step in hand.
    expect(
      project({ ...good, arrived: { stones: 25_000 }, onSite: { stones: 1 } }),
    ).toBe("ok");
    expect(project({ ...good, onSite: { stones: 501 } })).toBe("bad");
    expect(
      project({ ...good, arrived: { stones: 10 }, onSite: { stones: 11 } }),
    ).toBe("bad");
    expect(project({ ...good, onSite: { stones: -1 } })).toBe("bad");
    expect(project({ ...good, onSite: { clay: 1 } })).toBe("bad");
    expect(project({ ...good, onSite: { bricks: 1 } })).toBe("newer");
  });

  it("refuses a project that cannot be: past the roof, all in, or for a building that stands (#654)", () => {
    const project = (value: unknown, marks?: unknown) =>
      readGame(
        marks === undefined ? { project: value } : { project: value, marks },
        0,
      ).kind;
    const good = {
      building: "lightTower",
      state: "onHold",
      step: 0,
      arrived: { stones: 10 },
    };
    expect(project(good)).toBe("ok");
    expect(
      project({ building: "lightTower", state: "delivering", step: 1 }),
    ).toBe("ok");
    // Marks from a newer build leave the project to that build.
    expect(project(good, { operational: ["rocketPad"] })).toBe("newer");
    expect(project({ ...good, step: 3 })).toBe("bad");
    expect(project({ ...good, step: 0.5 })).toBe("bad");
    expect(project({ ...good, arrived: { stones: 25_001 } })).toBe("bad");
    // All of the step in and built in is a step done, never a project.
    expect(project({ ...good, arrived: { stones: 25_000 } })).toBe("bad");
    expect(project({ ...good, arrived: { clay: 1 } })).toBe("bad");
    expect(project({ ...good, state: 7 })).toBe("bad");
    expect(project(good, { operational: ["lightTower"] })).toBe("bad");
    expect(project({ ...good, state: "rushing" })).toBe("newer");
    expect(project({ ...good, building: "rocketPad" })).toBe("newer");
    // Nonsense wins over a newer build's name.
    expect(
      project({ ...good, building: "rocketPad", arrived: { stones: -5 } }),
    ).toBe("bad");
    expect(readGame({ fleet: { crane: 1 } }, 0).kind).toBe("newer");
  });

  it("saves the workers on each job, and refuses more on jobs than he owns (#689)", () => {
    expect(writeGame(createMountain())).not.toHaveProperty("jobs");
    const crew = {
      ...createMountain(),
      owned: { ...createMountain().owned, helper: 5 },
      jobs: {
        drilling: 2,
        haulage: 0,
        hoisting: 1,
        driving: 1,
        building: 0,
        kilns: 0,
        graniteDrilling: 0,
        graniteHaulage: 0,
        saws: 0,
      },
    };
    expect(writeGame(crew).jobs).toEqual({
      drilling: 2,
      hoisting: 1,
      driving: 1,
    });
    const read = (game: unknown) => readGame(game, 0).kind;
    expect(read({ owned: { helper: 5 }, jobs: { drilling: 5 } })).toBe("ok");
    expect(
      read({ owned: { helper: 5 }, jobs: { drilling: 4, driving: 2 } }),
    ).toBe("bad");
    expect(read({ jobs: { haulage: 1 } })).toBe("bad");
    expect(read({ owned: { helper: 5 }, jobs: { drilling: -1 } })).toBe("bad");
    expect(read({ owned: { helper: 5 }, jobs: { building: 1 } })).toBe("ok");
    expect(read({ owned: { helper: 5 }, jobs: { crushers: 1 } })).toBe("newer");
  });

  it("keys each fact by id, in the five maps", () => {
    const fresh = createMountain();
    const game = writeGame({
      ...fresh,
      owned: { ...fresh.owned, helper: 3, hoist: 1 },
      stock: { ...fresh.stock, stones: 40 },
      upgrades: { ...fresh.upgrades, cartSyn: 1 },
      crafted: { ...fresh.crafted, "iron-rails": 1 },
      clocks: { ...fresh.clocks, "blasting-charge": 7, "axle-grease": 9 },
    });
    expect(game.owned).toEqual({ helper: 3, hoist: 1 });
    expect(game.stock).toEqual({ stones: 40 });
    expect(game.levels).toEqual({ cartSyn: 1, "iron-rails": 1 });
    expect(game.clocks).toEqual({
      "blasting-charge": 7,
      "axle-grease": 9,
    });
  });

  it("saves an engineer on a trip in the tunnel, and loads them back on the trip", () => {
    const trip = {
      engineer: "Ada",
      tunnel: "side-seam",
      sentAt: 100,
      returnsAt: 200,
      find: { kind: "quiet" },
    } as const;
    const mountain: Mountain = {
      ...createMountain(),
      owned: { ...createMountain().owned, borer: 1 },
      engineers: [ADA],
      expeditions: [trip],
    };
    const saved = writeGame(mountain);
    expect(saved.engineers).toEqual([{ ...ADA, post: "tunnel" }]);
    expect(saved.expeditions).toEqual([{ ...trip, home: "borer" }]);
    const loaded = roundTrip(mountain);
    expect(loaded?.engineers).toEqual([ADA]);
    expect(loaded?.expeditions).toEqual([trip]);
    expect(loaded !== undefined && onTrip(loaded, "Ada")).toBe(true);
    // A trip whose engineer the crew does not hold comes home to camp.
    expect(writeGame({ ...mountain, engineers: [] }).expeditions).toEqual([
      { ...trip, home: "camp" },
    ]);
  });

  it("a game map that is not a map is bad", () => {
    for (const value of [null, "stones", 7, [], undefined]) {
      expect(readGame(value, 0).kind).toBe("bad");
    }
  });

  it("a trip whose find has the wrong types is bad; an unknown find is newer", () => {
    const mountain: Mountain = {
      ...createMountain(),
      owned: { ...createMountain().owned, borer: 1 },
      engineers: [ADA],
      expeditions: [
        {
          engineer: "Ada",
          tunnel: "side-seam",
          sentAt: 100,
          returnsAt: 200,
          find: { kind: "quiet" },
        },
      ],
    };
    const game = writeGame(mountain);
    const trip = { ...game.expeditions?.[0] };
    expect(
      readGame({ ...game, expeditions: [{ ...trip, find: "quiet" }] }, 0).kind,
    ).toBe("bad");
    expect(
      readGame(
        { ...game, expeditions: [{ ...trip, find: { kind: "comet" } }] },
        0,
      ).kind,
    ).toBe("newer");
    expect(
      readGame({ ...game, expeditions: [{ ...trip, tunnel: "moon" }] }, 0).kind,
    ).toBe("newer");
  });

  it("a bench with the wrong types is bad; an unknown recipe on it is newer", () => {
    const bench = { recipe: "iron-rails", startedAt: 10, endsAt: 20 };
    expect(readGame({ bench }, 0).kind).toBe("ok");
    expect(readGame({ bench: { ...bench, endsAt: "20" } }, 0).kind).toBe("bad");
    expect(readGame({ bench: { ...bench, recipe: "kiln" } }, 0).kind).toBe(
      "newer",
    );
  });

  it("a retired stretch past its cap is newer, below 1 is bad", () => {
    expect(readGame({ run: { stretch: 2_000_000 } }, 0).kind).toBe("newer");
    expect(readGame({ run: { stretch: 0.5 } }, 0).kind).toBe("bad");
    expect(readGame({ run: { stretch: 2.5 } }, 0).kind).toBe("ok");
  });

  it("a retired generation past its cap is newer, a part-run is bad", () => {
    expect(readGame({ run: { generation: 1000 } }, 0).kind).toBe("ok");
    expect(readGame({ run: { generation: 1001 } }, 0).kind).toBe("newer");
    expect(readGame({ run: { generation: 1.5 } }, 0).kind).toBe("bad");
  });

  it("a v10 save with run.generation 0 and run.stretch 1 reads ok, and the writer writes neither (#729)", () => {
    const read = readGame(
      { run: { generation: 0, stretch: 1, dug: 5_000, rock: 12 } },
      0,
    );
    expect(read.kind).toBe("ok");
    const mountain = read.kind === "ok" ? read.mountain : createMountain();
    expect(mountain.remaining).toBe(MOUNTAIN_STONES - 5_000);
    expect(mountain.rockDug).toBe(12);
    expect(mountain).not.toHaveProperty("legacy");
    expect(mountain).not.toHaveProperty("stretch");
    expect(writeGame(mountain).run).toEqual({ dug: 5_000, rock: 12 });
  });

  it("a v10 save from a kid run reads ok at the retired caps, and drops both on the next write (#729)", () => {
    const read = readGame(
      { run: { generation: 1000, stretch: 1_000_000, dug: 7 } },
      0,
    );
    expect(read.kind).toBe("ok");
    const mountain = read.kind === "ok" ? read.mountain : createMountain();
    expect(writeGame(mountain).run).toEqual({ dug: 7 });
  });

  it("a mark twice is newer", () => {
    expect(
      readGame({ marks: { seen: ["workshop", "workshop"] } }, 0).kind,
    ).toBe("newer");
  });
});
