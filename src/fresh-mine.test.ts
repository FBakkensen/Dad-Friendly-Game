import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { applyMove, listActions, type Action } from "./economy/actions";
import { tierLock } from "./crew";
import { FRESH_OFF, freshMineOn, lineOn } from "./line-switch";
import {
  MOUNTAIN_STONES,
  accrue,
  accrueAway,
  createMountain,
  digStones,
  minedOut,
  type Mountain,
} from "./mountain";
import { effectiveRates } from "./rates";
import { foundRelics } from "./relics";
import { layerOf } from "./layers";
import { stonesLeft, stonesToNextBand } from "./scale";
import { TIERS, tierById, tierInPlay, tierShown, type TierId } from "./tiers";
import { UPGRADES, buyUpgrade } from "./upgrades";
import { upgradeShown, boostShown } from "./upgrade-reveal";
import { BOOSTS, buyBoost } from "./boosts";
import { promote } from "./engineers";
import { workshopUnlocked } from "./workshop";
import { mineVein } from "./veins";

/** The fresh mine (slice 1, part 1), switched on as a lab run does (#653). */
const FRESH = { [FRESH_OFF]: 0 };

function fresh<T>(body: () => T): T {
  return withFactors(FRESH, body);
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** A fresh mine with these counts owned and plenty of stone. */
function owning(
  counts: Partial<Record<TierId, number>>,
  stones = 1e12,
): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: { ...start.owned, ...counts },
    stock: { ...start.stock, stones },
  };
}

function buys(mountain: Mountain): readonly TierId[] {
  return listActions(mountain, 0).flatMap((action: Action) =>
    action.kind === "buyTier" ? [action.id] : [],
  );
}

describe("the fresh mine's switch (#653)", () => {
  it("is off in play, and on in a lab run that sets fresh.off to 0", () => {
    expect(freshMineOn()).toBe(false);
    fresh(() => {
      expect(freshMineOn()).toBe(true);
    });
  });

  it("brings the line with it: a fresh mine is built on the line (rule 2)", () => {
    expect(lineOn()).toBe(false);
    fresh(() => {
      expect(lineOn()).toBe(true);
    });
  });

  it("leaves today's start alone while it is off", () => {
    expect(createMountain().owned.helper).toBe(0);
  });
});

describe("one level, no depth (rule 1)", () => {
  it("starts with nine workers and nothing else", () => {
    fresh(() => {
      const start = createMountain();
      expect(start.owned.helper).toBe(9);
      for (const tier of TIERS) {
        if (tier.id !== "helper") {
          expect(start.owned[tier.id]).toBe(0);
        }
      }
      expect(start.stock.stones).toBe(0);
    });
  });

  it("puts what is dug in the stock and never lowers the mountain", () => {
    fresh(() => {
      const dug = digStones(createMountain(), 250_000_000);
      expect(dug.stock.stones).toBe(250_000_000);
      expect(dug.remaining).toBe(MOUNTAIN_STONES);
      expect(minedOut(dug)).toBe(0);
      expect(stonesLeft(dug)).toBe(Infinity);
      expect(stonesToNextBand(dug)).toBe(Infinity);
    });
  });

  it("a month of live play never mines it out, finds a relic or leaves the Topsoil", () => {
    fresh(() => {
      const crew = owning({ helper: 40, cart: 10, hoist: 10, drill: 10 }, 0);
      const month = accrue({ mountain: crew, from: 0, to: 30 * DAY });
      expect(month.mined).toBeGreaterThan(MOUNTAIN_STONES);
      expect(month.mountain.stock.stones).toBe(month.mined);
      expect(month.mountain.remaining).toBe(MOUNTAIN_STONES);
      expect(foundRelics(month.mountain)).toEqual([]);
      expect(layerOf(month.mountain).name).toBe(layerOf(createMountain()).name);
      expect(workshopUnlocked(month.mountain)).toBe(false);
      // No band's material comes up with it.
      expect(month.mountain.stock).toEqual({
        ...createMountain().stock,
        stones: month.mined,
      });
    });
  });

  it("pays time away in full, and holds nothing back for a Gold rush", () => {
    fresh(() => {
      const crew = owning({ helper: 12, cart: 1 }, 0);
      const speed = effectiveRates(crew).crewPerSecond;
      const away = accrueAway({ mountain: crew, lastSeen: 0, now: 2 * HOUR });
      expect(away.mined).toBe(Math.floor(2 * 3600 * speed * 0.3));
      expect(away.mountain.stock.stones).toBe(away.mined);
      expect(away.mountain.rushBank).toBe(0);
      expect(away.report.heldForRush).toBe(0);
      expect(away.mountain.remaining).toBe(MOUNTAIN_STONES);
    });
  });

  it("the Topsoil leans on no stage: the line reads every machine at its rating", () => {
    fresh(() => {
      // Twelve hands, one cart: hands fill drilling and hoisting to the
      // cart's haulage, as on any level with no lean.
      const crew = owning({ helper: 12, cart: 1, hoist: 1, drill: 1 }, 0);
      const rates = effectiveRates(crew);
      expect(rates.tierSpeed.cart).toBe(18);
      expect(rates.tierSpeed.hoist).toBe(60);
      expect(rates.tierSpeed.drill).toBe(108);
    });
  });
});

describe("nothing is mined by a tap (What goes)", () => {
  it("a tap yields nothing and a dig is refused", () => {
    fresh(() => {
      const crew = owning({ helper: 30, cart: 3 }, 0);
      expect(effectiveRates(crew).tapYield).toBe(0);
      const dig = applyMove(crew, { kind: "dig" }, 0, { trouble: undefined });
      expect(dig.kind).toBe("refused");
    });
  });

  it("a golden vein pays nothing, so its tap is refused", () => {
    fresh(() => {
      const crew = owning({ helper: 30, cart: 3 }, 0);
      expect(mineVein(crew)).toBe(crew);
      const tap = applyMove(crew, { kind: "tapVein" }, 0, {
        trouble: undefined,
      });
      expect(tap.kind).toBe("refused");
    });
  });
});

describe("machines open by what he owns (rule 1's table)", () => {
  it("offers only workers at the start, and shows the cart with its door", () => {
    fresh(() => {
      const start = owning({}, 1e12);
      expect(buys(start)).toEqual(["helper"]);
      expect(tierShown(start, tierById("cart"))).toBe(true);
      expect(tierLock(start, tierById("cart"))).toEqual({
        kind: "owns",
        tier: "helper",
        count: 12,
      });
    });
  });

  it("opens the cart at twelve workers, the hoist with a cart, the drill with a hoist", () => {
    fresh(() => {
      expect(buys(owning({ helper: 11 }))).toEqual(["helper"]);
      expect(buys(owning({ helper: 12 }))).toEqual(["helper", "cart"]);
      expect(tierLock(owning({ helper: 12 }), tierById("hoist"))).toEqual({
        kind: "owns",
        tier: "cart",
        count: 1,
      });
      expect(buys(owning({ helper: 12, cart: 1 }))).toEqual([
        "helper",
        "cart",
        "hoist",
      ]);
      expect(
        tierLock(owning({ helper: 12, cart: 1 }), tierById("drill")),
      ).toEqual({
        kind: "owns",
        tier: "hoist",
        count: 1,
      });
      expect(buys(owning({ helper: 12, cart: 1, hoist: 1 }))).toEqual([
        "helper",
        "cart",
        "hoist",
        "drill",
      ]);
    });
  });

  it("refuses a machine behind its door, even with the stone for it", () => {
    fresh(() => {
      const short = owning({ helper: 11 });
      const tap = applyMove(short, { kind: "buyTier", id: "cart" }, 0, {
        trouble: undefined,
      });
      expect(tap.kind).toBe("refused");
    });
  });

  it("keeps the later machines out: the Granite, the Foundry and the School are later parts", () => {
    fresh(() => {
      const crew = owning({ helper: 200, cart: 50, hoist: 50, drill: 50 });
      for (const id of ["borer", "train", "machine", "kid"] as const) {
        const tier = tierById(id);
        expect(tierInPlay(tier)).toBe(false);
        expect(tierShown(crew, tier)).toBe(false);
        const tap = applyMove(crew, { kind: "buyTier", id }, 0, {
          trouble: undefined,
        });
        expect(tap.kind).toBe("refused");
      }
      expect(buys(crew)).toEqual(["helper", "cart", "hoist", "drill"]);
    });
  });

  it("puts every part-1 machine in play, the hoist among them", () => {
    fresh(() => {
      for (const id of ["helper", "cart", "hoist", "drill"] as const) {
        expect(tierInPlay(tierById(id))).toBe(true);
      }
    });
  });
});

describe("what leaves the rules at part 1 (What goes)", () => {
  it("takes out Strong arms and Steady hands, and keeps Better boots and the machine upgrades", () => {
    fresh(() => {
      const crew = owning({ helper: 40, cart: 10, hoist: 5, drill: 10 });
      const shown = UPGRADES.filter((upgrade) =>
        upgradeShown(crew, upgrade),
      ).map((upgrade) => upgrade.id);
      expect(shown).toEqual(["boots", "cartSyn", "drillSyn"]);
      expect(buyUpgrade(crew, "tap")).toBe(crew);
      expect(buyUpgrade(crew, "steady")).toBe(crew);
      expect(buyUpgrade(crew, "boots")).not.toBe(crew);
      const offered = listActions(crew, 0).flatMap((action) =>
        action.kind === "buyUpgrade" ? [action.id] : [],
      );
      expect(offered).toEqual(["boots", "cartSyn", "drillSyn"]);
    });
  });

  it("takes out Sharper picks and Overtime", () => {
    fresh(() => {
      const crew = owning({ helper: 40, cart: 10, hoist: 5, drill: 10 });
      for (const boost of BOOSTS) {
        expect(boostShown(crew, boost)).toBe(false);
        const pricing = effectiveRates(crew);
        expect(
          buyBoost({ mountain: crew, id: boost.id, now: 0, pricing }),
        ).toBe(crew);
      }
      expect(
        listActions(crew, 0).some((action) => action.kind === "buyBoost"),
      ).toBe(false);
    });
  });

  it("keeps engineers for the first borer: no promotion before one", () => {
    fresh(() => {
      const crew = owning({ helper: 40, cart: 10, hoist: 5, drill: 10 });
      expect(promote(crew)).toBe(crew);
      expect(
        listActions(crew, 0).some((action) => action.kind === "promote"),
      ).toBe(false);
    });
  });
});

describe("today's game is unchanged with the switch off", () => {
  it("still lets a worker buy a cart, a tap mine, and a promotion go through", () => {
    const today = owning({ helper: 1 }, 1e9);
    expect(buys(today)).toContain("cart");
    expect(effectiveRates(today).tapYield).toBeGreaterThan(0);
    expect(promote(today)).not.toBe(today);
    expect(digStones(createMountain(), 10).remaining).toBe(
      MOUNTAIN_STONES - 10,
    );
  });
});
