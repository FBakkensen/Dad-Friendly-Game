import { describe, expect, it } from "vitest";
import { boostById } from "./boosts";
import { onTrip } from "./engineers";
import { createMountain, MOUNTAIN_STONES, type Mountain } from "./mountain";
import { readGame, writeGame } from "./save-format";
import { boostUsed } from "./upgrade-reveal";

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
      boosts: "clocks",
      startedAt: "envelope",
      legacy: "run",
      engineers: "engineers",
      expeditions: "expeditions",
      finds: "marks",
      stretch: "run",
      bench: "bench",
      crafted: "levels",
      recipes: "marks",
      clocks: "clocks",
      rushUntil: "clocks",
      rushBank: "run",
      seen: "marks",
      taught: "marks",
      fleet: "fleet",
      operational: "marks",
      project: "project",
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
      upgrades: { ...fresh.upgrades, tap: 1 },
      boosts: { ...fresh.boosts, sharper: 9_000 },
      startedAt: 500,
      legacy: 1,
      stretch: 2,
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
      finds: ["pick"],
      bench: { recipe: "iron-rails", startedAt: 10, endsAt: 20 },
      crafted: { ...fresh.crafted, "sturdy-props": 1 },
      recipes: [...fresh.recipes, "reinforce"],
      clocks: { ...fresh.clocks, "axle-grease": 3_000, "crystal-flare": 4_000 },
      rushUntil: 6_000,
      rushBank: 40,
      seen: ["workshop"],
      taught: ["engineers"],
      fleet: { ...fresh.fleet, horseWagon: 3 },
      operational: ["lightTower"],
      project: { kind: "unordered" },
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
      fleet: { horseWagon: 2 },
      project: {
        kind: "delivering",
        site: {
          building: "lightTower",
          step: 2,
          arrived: { ...fresh.stock, stones: 40 },
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
    expect(project({ ...good, step: 3 })).toBe("bad");
    expect(project({ ...good, step: 0.5 })).toBe("bad");
    expect(project({ ...good, arrived: { stones: 150_000 } })).toBe("bad");
    expect(project({ ...good, arrived: { clay: 1 } })).toBe("bad");
    expect(project({ ...good, state: 7 })).toBe("bad");
    expect(project(good, { operational: ["lightTower"] })).toBe("bad");
    expect(project({ ...good, state: "rushing" })).toBe("newer");
    expect(project({ ...good, building: "rocketPad" })).toBe("newer");
    expect(readGame({ fleet: { truck: 1 } }, 0).kind).toBe("newer");
  });

  it("keys each fact by id, in the five maps", () => {
    const fresh = createMountain();
    const game = writeGame({
      ...fresh,
      owned: { ...fresh.owned, helper: 3, hoist: 1 },
      stock: { ...fresh.stock, stones: 40 },
      upgrades: { ...fresh.upgrades, tap: 2 },
      crafted: { ...fresh.crafted, "iron-rails": 1 },
      boosts: { ...fresh.boosts, overtime: 9 },
      clocks: { ...fresh.clocks, "blasting-charge": 7 },
      rushUntil: 11,
    });
    expect(game.owned).toEqual({ helper: 3, hoist: 1 });
    expect(game.stock).toEqual({ stones: 40 });
    expect(game.levels).toEqual({ tap: 2, "iron-rails": 1 });
    expect(game.clocks).toEqual({
      overtime: 9,
      "blasting-charge": 7,
      "gold-rush": 11,
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
  });

  it("keeps a boost's row once it has run, long after it ends", () => {
    const ran: Mountain = {
      ...createMountain(),
      boosts: { ...createMountain().boosts, overtime: 5_000 },
    };
    const loaded = roundTrip(ran);
    expect(loaded?.boosts.overtime).toBe(5_000);
    expect(
      loaded !== undefined && boostUsed(loaded, boostById("overtime")),
    ).toBe(true);
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

  it("a stretch past its cap is newer, below 1 is bad", () => {
    expect(readGame({ run: { stretch: 2_000_000 } }, 0).kind).toBe("newer");
    expect(readGame({ run: { stretch: 0.5 } }, 0).kind).toBe("bad");
    expect(readGame({ run: { stretch: 2.5 } }, 0).kind).toBe("ok");
  });

  it("a mark twice is newer", () => {
    expect(
      readGame({ marks: { seen: ["workshop", "workshop"] } }, 0).kind,
    ).toBe("newer");
  });
});
