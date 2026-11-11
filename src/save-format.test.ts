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
    const { staffed: _staffed, ...older } = savedMountain({
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 1_000,
      drills: 3,
    });
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

  it("rejects a map that is not an object, on either side", () => {
    expect(parseMountain(null)).toBeUndefined();
    expect(parseMountain("stones")).toBeUndefined();
    expect(withWorkshop(createMountain(), null)).toBeUndefined();
    expect(withWorkshop(createMountain(), 7)).toBeUndefined();
  });
});
