import { describe, expect, it, vi } from "vitest";
import { canCraftNow } from "./afford-glow";
import { boostById, boostCost } from "./boosts";
import { canPromote } from "./engineers";
import type { Expedition } from "./expeditions";
import type { Trouble } from "./hazards";
import { KEY_IDS, keyViews, type KeyView } from "./key-rail";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { stretch } from "./scale";
import { troubleAria } from "./screen-words";
import { showsDot } from "./teach";
import { tierById, tierCost } from "./tiers";
import { recipesForMined } from "./workshop";

const NOW = 1_700_000_000_000;
const MINUTE = 60_000;

function mountainWith(fields: Partial<Mountain>): Mountain {
  return { ...createMountain(), ...fields };
}

/** Stones mined out so far: this deep. */
function at(depth: number): Pick<Mountain, "remaining"> {
  return { remaining: MOUNTAIN_STONES - depth };
}

const ada = { name: "Ada", rank: 0, trips: 1, post: "borer" } as const;

/** After the first trip, with the price of the second engineer (#246). */
function crew(): Mountain {
  return mountainWith({
    remaining: 200_000_000,
    pocket: 6_500_000,
    helpers: 60,
    carts: 10,
    drills: 6,
    borers: 2,
    engineers: [ada],
    seen: ["workshop", "engineers"],
    taught: ["workshop", "engineers", "staffing"],
  });
}

/** The Workshop's shed with clay and iron, as the afford glow tests it. */
function shed(): Mountain {
  return mountainWith({
    ...at(12_000_000),
    helpers: 4,
    carts: 1,
    pocket: 1_000_000,
    materials: { clay: 10, iron: 10, crystal: 0, heartstone: 0 },
    recipes: recipesForMined(12_000_000),
  });
}

/** Ten carts and a crew too small to run them all (#246). */
function shortHanded(): Mountain {
  return mountainWith({
    remaining: 220_000_000,
    pocket: 2_000_000,
    helpers: 6,
    carts: 10,
    seen: ["workshop"],
    taught: ["workshop"],
  });
}

function trip(engineer: "Ada" | "Nils", returnsAt: number): Expedition {
  return {
    engineer,
    tunnel: "side-seam",
    sentAt: NOW - MINUTE,
    returnsAt,
    find: { kind: "quiet" },
  };
}

const rest = (aria: string, sub = ""): KeyView => ({
  cap: "rest",
  sub,
  dot: false,
  aria,
});

describe("the key rail (#373)", () => {
  it("names five keys in the rail's order", () => {
    expect(KEY_IDS).toEqual([
      "buys",
      "workshop",
      "engineers",
      "upgrades",
      "ledger",
    ]);
    expect(Object.keys(keyViews(createMountain(), NOW, undefined))).toEqual(
      KEY_IDS,
    );
  });

  it("a fresh mountain", () => {
    const keys = keyViews(createMountain(), NOW, undefined);
    expect(keys.buys).toEqual(rest("Buys"));
    expect(keys.workshop).toEqual({
      cap: "locked",
      sub: "With the clay",
      dot: false,
      aria: "Workshop, locked. Opens as the clay comes in",
    });
    expect(keys.engineers).toEqual({
      cap: "locked",
      sub: "With 1st borer",
      dot: false,
      aria: "Engineers, locked until the first tunnel borer",
    });
    expect(keys.upgrades).toEqual(rest("Upgrades"));
    expect(keys.ledger).toEqual(rest("Ledger"));
  });

  it("lit caps take today's afford glow, except Buys", () => {
    // The pocket over Sharper picks.
    const carts = mountainWith({ helpers: 1, carts: 1 });
    const sharper = boostCost(
      boostById("sharper"),
      effectiveRates(carts),
      stretch(carts),
    );
    expect(
      keyViews({ ...carts, pocket: sharper }, NOW, undefined).upgrades,
    ).toMatchObject({ cap: "lit", aria: "Upgrades, one is affordable" });
    expect(
      keyViews({ ...carts, pocket: sharper - 1 }, NOW, undefined).upgrades,
    ).toMatchObject({ cap: "rest", aria: "Upgrades" });

    // A craft that can start.
    expect(canCraftNow(shed(), NOW)).toBe(true);
    expect(keyViews(shed(), NOW, undefined).workshop).toMatchObject({
      cap: "lit",
      sub: "",
      aria: "Workshop, a craft can start",
    });
    const broke = {
      ...shed(),
      pocket: 0,
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
    };
    expect(keyViews(broke, NOW, undefined).workshop).toMatchObject({
      cap: "rest",
      sub: "",
      aria: "Workshop",
    });

    // A promotion affordable.
    expect(canPromote(crew())).toBe(true);
    expect(keyViews(crew(), NOW, undefined).engineers).toMatchObject({
      cap: "lit",
      sub: "",
      aria: "Engineers, a promotion is affordable",
    });
    expect(
      keyViews({ ...crew(), pocket: 0 }, NOW, undefined).engineers,
    ).toMatchObject({ cap: "rest", aria: "Engineers" });

    // Buys is never lit, even with every tier affordable.
    const rich = mountainWith({
      ...at(MOUNTAIN_STONES - 1),
      pocket: Number.MAX_SAFE_INTEGER,
      helpers: 500,
      carts: 50,
      drills: 50,
      borers: 50,
      machines: 1,
    });
    expect(rich.pocket).toBeGreaterThan(
      tierCost(tierById("cart"), rich.carts, stretch(rich)),
    );
    expect(keyViews(rich, NOW, undefined).buys.cap).toBe("rest");
  });

  it("red dot lamps", () => {
    // Staffing teaching: Buys.
    expect(showsDot(shortHanded(), "staffing")).toBe(true);
    expect(keyViews(shortHanded(), NOW, undefined).buys).toEqual({
      cap: "rest",
      sub: "",
      dot: true,
      aria: "Buys",
    });

    // The Workshop note unseen: the dot stays until the first craft.
    const open = mountainWith({ ...at(12_000_000), helpers: 4, carts: 1 });
    expect(showsDot(open, "workshop")).toBe(true);
    expect(keyViews(open, NOW, undefined).workshop.dot).toBe(true);
    expect(
      keyViews({ ...open, taught: ["workshop"] }, NOW, undefined).workshop.dot,
    ).toBe(false);

    // Engineers, first trip not yet taken.
    const fresh = { ...crew(), engineers: [{ ...ada, trips: 0 }], taught: [] };
    expect(showsDot(fresh, "engineers")).toBe(true);
    expect(keyViews(fresh, NOW, undefined).engineers.dot).toBe(true);

    // Tending: Ada waits at camp beside a Great Machine, promotion out of reach.
    const tend = {
      ...crew(),
      pocket: 0,
      machines: 1,
      engineers: [{ ...ada, post: "camp" as const }],
    };
    expect(showsDot(tend, "tending")).toBe(true);
    expect(showsDot(tend, "promotion")).toBe(false);
    expect(keyViews(tend, NOW, undefined).engineers.dot).toBe(true);

    // Promotion, with tending already used.
    const promo: Mountain = {
      ...crew(),
      taught: [...crew().taught, "tending"],
    };
    expect(showsDot(promo, "tending")).toBe(false);
    expect(showsDot(promo, "promotion")).toBe(true);
    expect(keyViews(promo, NOW, undefined).engineers.dot).toBe(true);

    // Neither.
    const quiet = { ...promo, pocket: 0 };
    expect(keyViews(quiet, NOW, undefined).engineers.dot).toBe(false);

    // An unbought upgrade row: Steady hands shows with the first cart.
    const cart = mountainWith({ helpers: 1, carts: 1 });
    expect(showsDot(cart, "upgrade:steady")).toBe(true);
    expect(keyViews(cart, NOW, undefined).upgrades.dot).toBe(true);
    // A boost row alone lights it too.
    const boostOnly: Mountain = {
      ...cart,
      taught: ["upgrade:steady", "upgrade:cartSyn"],
    };
    expect(showsDot(boostOnly, "upgrade:steady")).toBe(false);
    expect(showsDot(boostOnly, "boost:sharper")).toBe(true);
    expect(keyViews(boostOnly, NOW, undefined).upgrades.dot).toBe(true);
    const none: Mountain = {
      ...boostOnly,
      taught: [...boostOnly.taught, "boost:sharper"],
    };
    expect(keyViews(none, NOW, undefined).upgrades.dot).toBe(false);

    // The Ledger never has one.
    expect(keyViews(shortHanded(), NOW, undefined).ledger).toEqual(
      rest("Ledger"),
    );
  });

  it("trouble on a tier with no bay lights Buys", () => {
    // In the Great Machine era the bays are drill, borer and machine.
    const late = mountainWith({
      ...at(125_000_000),
      helpers: 40,
      carts: 10,
      drills: 4,
      borers: 2,
      taught: ["staffing"],
    });
    expect(showsDot(late, "staffing")).toBe(false);
    const caveIn: Trouble = { kind: "cave-in", tier: "cart", startedAt: NOW };
    expect(keyViews(late, NOW, caveIn).buys).toEqual({
      cap: "rest",
      sub: "",
      dot: true,
      aria: `Buys. ${troubleAria("cave-in", tierById("cart"))}`,
    });

    // A drill flood has its bay: the bay shows it, not Buys.
    const flood: Trouble = { kind: "flood", tier: "drill", startedAt: NOW };
    expect(keyViews(late, NOW, flood).buys).toEqual(rest("Buys"));

    // Before the machine, carts have a bay.
    const early = { ...late, ...at(20_000_000) };
    expect(keyViews(early, NOW, caveIn).buys).toEqual(rest("Buys"));
  });

  it("timers", () => {
    // A bench ending in 4:12.
    const running = {
      ...shed(),
      bench: {
        recipe: "blasting-charge",
        startedAt: NOW - MINUTE,
        endsAt: NOW + 4 * MINUTE + 12_000,
      },
    } as const;
    expect(keyViews(running, NOW, undefined).workshop).toMatchObject({
      cap: "rest",
      sub: "4:12",
      aria: "Workshop, bench 4:12 left",
    });
    // A bench that ended.
    expect(keyViews(running, NOW + 5 * MINUTE, undefined).workshop.sub).toBe(
      "",
    );

    // Two trips back in 12:03 and 30:00, and one already home.
    const away = {
      ...crew(),
      pocket: 0,
      expeditions: [
        trip("Nils", NOW + 30 * MINUTE),
        trip("Ada", NOW + 12 * MINUTE + 3_000),
        trip("Ada", NOW - MINUTE),
      ],
    };
    expect(keyViews(away, NOW, undefined).engineers).toMatchObject({
      cap: "rest",
      sub: "12:03",
      aria: "Engineers, back in 12:03",
    });
    expect(
      keyViews({ ...away, pocket: 6_500_000 }, NOW, undefined).engineers,
    ).toMatchObject({
      cap: "lit",
      sub: "12:03",
      aria: "Engineers, back in 12:03, a promotion is affordable",
    });
    // Every trip home: no sub-line.
    expect(keyViews(away, NOW + 31 * MINUTE, undefined).engineers.sub).toBe("");
    // Locked keeps its unlock line over any timer.
    const noHands = { ...away, engineers: [] };
    expect(keyViews(noHands, NOW, undefined).engineers.sub).toBe(
      "With 1st borer",
    );
  });

  it("display only", () => {
    const mountain = Object.freeze({
      ...crew(),
      expeditions: Object.freeze([trip("Nils", NOW + 30 * MINUTE)]),
    });
    const trouble = Object.freeze<Trouble>({
      kind: "cave-in",
      tier: "cart",
      startedAt: NOW,
    });
    const before = JSON.stringify(mountain);
    const clock = vi.spyOn(Date, "now");
    const first = keyViews(mountain, NOW, trouble);
    expect(clock).not.toHaveBeenCalled();
    clock.mockRestore();
    expect(JSON.stringify(mountain)).toBe(before);
    expect(keyViews(mountain, NOW, trouble)).toEqual(first);
    // The clock is the caller's: the same now, the same sub-lines.
    expect(keyViews(mountain, NOW + 1_000, trouble).engineers.sub).toBe(
      "29:59",
    );
  });
});
