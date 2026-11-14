import { describe, expect, it } from "vitest";
import { boostById } from "./boosts";
import { staffExisting } from "./crew";
import { onTrip } from "./engineers";
import { createMountain, MOUNTAIN_STONES, type Mountain } from "./mountain";
import { parseSaveValue, serializeSave } from "./persist";
import {
  parseMountain,
  savedMountain,
  savedWorkshop,
  withWorkshop,
} from "./save-format";
import { boostUsed } from "./upgrade-reveal";

const ADA = { name: "Ada", rank: 0, trips: 0, post: "borer" } as const;

/** Saves and loads a mountain through the v6 document. */
function roundTrip(mountain: Mountain): Mountain | undefined {
  const doc: unknown = JSON.parse(
    JSON.stringify(serializeSave({ mountain, lastSeen: 1_000 })),
  );
  return parseSaveValue(doc)?.mountain;
}

describe("save format", () => {
  it("writes a fresh mountain exactly as before (#415)", () => {
    expect(
      JSON.stringify(
        serializeSave({ mountain: createMountain(), lastSeen: 1000 }),
      ),
    ).toBe(
      '{"version":6,"mountain":{"remaining":240000000,"pocket":0,"helpers":0,"carts":0,"drills":0,"borers":0,"machines":0,"kids":0,"staffed":2},"workshop":{"materials":{"clay":0,"iron":0,"crystal":0,"heartstone":0},"recipes":["iron-rails","sturdy-props","blasting-charge"]},"lastSeen":1000}',
    );
  });

  it("writes back the ids a newer build saved and this one does not know", () => {
    const workshop = {
      materials: { clay: 1, iron: 2, crystal: 0, heartstone: 0 },
      recipes: ["iron-rails", "future-recipe"],
      bench: { recipe: "future-bench", startedAt: 10, endsAt: 20 },
      crafted: { "iron-rails": 1, "future-bit": 3 },
      seen: ["future-note", "workshop"],
      taught: ["engineers", "future-system"],
    };
    const loaded = parseSaveValue({
      version: 6,
      mountain: savedMountain(createMountain()),
      workshop,
      lastSeen: 5,
    })?.mountain;
    expect(loaded?.recipes).toEqual(["iron-rails"]);
    expect(loaded?.bench).toBeUndefined();
    expect(loaded?.seen).toEqual(["workshop"]);
    expect(loaded?.taught).toEqual(["engineers"]);
    expect(loaded?.kept).toEqual({
      recipes: ["future-recipe"],
      bench: { recipe: "future-bench", startedAt: 10, endsAt: 20 },
      crafted: { "future-bit": 3 },
      seen: ["future-note"],
      taught: ["future-system"],
    });
    if (loaded === undefined) {
      throw new Error("the save loads");
    }
    const written = savedWorkshop(loaded);
    expect(written.recipes).toEqual(["iron-rails", "future-recipe"]);
    expect(written.bench).toEqual(workshop.bench);
    expect(written.crafted).toEqual({ "future-bit": 3, "iron-rails": 1 });
    expect(written.seen).toEqual(["workshop", "future-note"]);
    expect(written.taught).toEqual(["engineers", "future-system"]);
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
    const saved = savedMountain(mountain);
    expect(saved.engineers).toEqual([{ ...ADA, post: "tunnel" }]);
    expect(saved.expeditions).toEqual([{ ...trip, home: "borer" }]);
    expect(Object.keys(saved.expeditions?.[0] ?? {})).toEqual([
      "engineer",
      "tunnel",
      "sentAt",
      "returnsAt",
      "home",
      "find",
    ]);
    const loaded = roundTrip(mountain);
    expect(loaded?.engineers).toEqual([ADA]);
    expect(loaded?.expeditions).toEqual([trip]);
    expect(loaded !== undefined && onTrip(loaded, "Ada")).toBe(true);
  });

  it("loads a v5 save as a complete mountain that still gets its free crew", () => {
    // An older save never wrote `staffed`.
    const older = savedMountain({
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 1_000,
      drills: 3,
      staffed: 0,
    });
    expect(older).not.toHaveProperty("staffed");
    const loaded = parseSaveValue({
      version: 5,
      mountain: older,
      lastSeen: 8,
    })?.mountain;
    expect(loaded?.staffed).toBe(0);
    expect(loaded?.clocks).toEqual(createMountain().clocks);
    expect(loaded?.kept).toEqual(createMountain().kept);
    expect(
      loaded === undefined ? 0 : staffExisting(loaded).joined,
    ).toBeGreaterThan(0);
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
    expect(roundTrip(createMountain())?.boosts.overtime).toBe(0);
  });

  it("saves every field of the mountain: a mountain with none at its default comes back whole", () => {
    // A new Mountain field must be named here, with the map it is saved in.
    const homes = {
      remaining: "mountain",
      pocket: "mountain",
      helpers: "mountain",
      carts: "mountain",
      drills: "mountain",
      borers: "mountain",
      machines: "mountain",
      kids: "mountain",
      hoists: "mountain",
      trains: "mountain",
      upgrades: "mountain",
      boosts: "mountain",
      startedAt: "mountain",
      staffed: "mountain",
      legacy: "mountain",
      engineers: "mountain",
      expeditions: "mountain",
      finds: "mountain",
      stretch: "workshop",
      materials: "workshop",
      bench: "workshop",
      crafted: "workshop",
      recipes: "workshop",
      clocks: "workshop",
      rushUntil: "workshop",
      rushBank: "workshop",
      seen: "workshop",
      taught: "workshop",
      kept: "workshop",
    } as const satisfies Record<keyof Mountain, "mountain" | "workshop">;
    const fresh = createMountain();
    const full: Mountain = {
      ...fresh,
      remaining: MOUNTAIN_STONES - 5_000,
      pocket: 7,
      helpers: 9,
      carts: 2,
      drills: 1,
      borers: 1,
      machines: 1,
      kids: 1,
      hoists: 3,
      trains: 2,
      upgrades: { ...fresh.upgrades, tap: 1 },
      boosts: { ...fresh.boosts, sharper: 9_000 },
      startedAt: 500,
      staffed: 1,
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
      kept: {
        recipes: ["future-recipe"],
        bench: undefined,
        crafted: { "future-bit": 1 },
        seen: ["future-note"],
        taught: ["future-system"],
      },
    };
    for (const key of Object.keys(homes) as (keyof Mountain)[]) {
      expect(full[key], key).not.toEqual(fresh[key]);
    }
    expect(roundTrip(full)).toEqual(full);
  });

  it("rejects a map that is not an object, on either side", () => {
    expect(parseMountain(null)).toBeUndefined();
    expect(parseMountain("stones")).toBeUndefined();
    expect(withWorkshop(createMountain(), null)).toBeUndefined();
    expect(withWorkshop(createMountain(), 7)).toBeUndefined();
  });
});

describe("the line's hoists and pit trains in the save (#533)", () => {
  it("an old save without them loads with none, and writes no new keys", () => {
    const old = { ...createMountain(), helpers: 12, carts: 3 };
    const saved = savedMountain(old);
    expect(saved).not.toHaveProperty("hoists");
    expect(saved).not.toHaveProperty("trains");
    const loaded = parseMountain(saved);
    expect(loaded?.hoists).toBe(0);
    expect(loaded?.trains).toBe(0);
    expect(roundTrip(old)).toEqual(old);
  });

  it("round-trips them once owned, and rejects a bad count", () => {
    const line = { ...createMountain(), hoists: 4, trains: 2 };
    expect(savedMountain(line)).toMatchObject({ hoists: 4, trains: 2 });
    expect(roundTrip(line)).toEqual(line);
    const saved = savedMountain(createMountain());
    for (const field of ["hoists", "trains"]) {
      for (const bad of [-1, 1.5, "7"]) {
        expect(
          parseMountain({ ...saved, [field]: bad }),
          field,
        ).toBeUndefined();
      }
    }
  });
});
