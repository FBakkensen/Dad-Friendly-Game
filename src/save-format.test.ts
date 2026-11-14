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
    // `staffed` and `kept` go with the load-time grants (#558, Task 2).
    const homes = {
      remaining: "run",
      pocket: "stock",
      helpers: "owned",
      carts: "owned",
      hoists: "owned",
      drills: "owned",
      borers: "owned",
      trains: "owned",
      machines: "owned",
      kids: "owned",
      upgrades: "levels",
      boosts: "clocks",
      startedAt: "envelope",
      staffed: "none",
      legacy: "run",
      engineers: "engineers",
      expeditions: "expeditions",
      finds: "marks",
      stretch: "run",
      materials: "stock",
      bench: "bench",
      crafted: "levels",
      recipes: "marks",
      clocks: "clocks",
      rushUntil: "clocks",
      rushBank: "run",
      seen: "marks",
      taught: "marks",
      kept: "none",
    } as const satisfies Record<keyof Mountain, string>;
    const fresh = createMountain();
    const full: Mountain = {
      ...fresh,
      remaining: MOUNTAIN_STONES - 5_000,
      pocket: 7,
      helpers: 9,
      carts: 2,
      hoists: 3,
      drills: 1,
      borers: 1,
      trains: 2,
      machines: 1,
      kids: 1,
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
      materials: { clay: 3, iron: 2, crystal: 1, heartstone: 0 },
      bench: { recipe: "iron-rails", startedAt: 10, endsAt: 20 },
      crafted: { ...fresh.crafted, "sturdy-props": 1 },
      recipes: [...fresh.recipes, "reinforce"],
      clocks: { ...fresh.clocks, "axle-grease": 3_000, "crystal-flare": 4_000 },
      rushUntil: 6_000,
      rushBank: 40,
      seen: ["workshop"],
      taught: ["engineers"],
    };
    for (const key of Object.keys(homes) as (keyof Mountain)[]) {
      if (homes[key] !== "none") {
        expect(full[key], key).not.toEqual(fresh[key]);
      }
    }
    expect(roundTrip(full)).toEqual(full);
  });

  it("keys each fact by id, in the five maps", () => {
    const fresh = createMountain();
    const game = writeGame({
      ...fresh,
      helpers: 3,
      hoists: 1,
      pocket: 40,
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
      borers: 1,
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
      borers: 1,
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
