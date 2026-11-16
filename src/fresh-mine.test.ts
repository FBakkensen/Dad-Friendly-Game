import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { applyMove, listActions, type Action } from "./economy/actions";
import { tierLock, tierLocked } from "./crew";
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
import { layerOf } from "./layers";
import { stonesLeft, stonesToNextBand } from "./scale";
import { TIERS, tierById, tierInPlay, tierShown, type TierId } from "./tiers";
import { UPGRADES, buyUpgrade } from "./upgrades";
import { upgradeShown } from "./upgrade-reveal";
import { promote } from "./engineers";
import { workshopUnlocked } from "./workshop";

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
  it("starts with one worker on drilling, a horse wagon and nobody driving or building (#703)", () => {
    fresh(() => {
      const start = createMountain();
      expect(start.owned.helper).toBe(1);
      expect(start.jobs).toEqual({
        drilling: 1,
        haulage: 0,
        hoisting: 0,
        driving: 0,
        building: 0,
        kilns: 0,
      });
      expect(start.fleet.horseWagon).toBe(1);
      expect(start.piles).toEqual({ face: 0, shaft: 0, kiln: 0 });
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

  it("a month of live play never mines it out or leaves the Topsoil", () => {
    fresh(() => {
      const crew = {
        ...owning({ helper: 40, cart: 10, hoist: 10, drill: 10 }, 0),
        jobs: {
          drilling: 6,
          haulage: 6,
          hoisting: 6,
          driving: 1,
          building: 2,
          kilns: 0,
        },
      };
      const month = accrue({ mountain: crew, from: 0, to: 30 * DAY });
      expect(month.mined).toBeGreaterThan(MOUNTAIN_STONES);
      expect(month.mountain.stock.stones).toBe(month.mined);
      expect(month.mountain.remaining).toBe(MOUNTAIN_STONES);
      expect(layerOf(month.mountain).name).toBe(layerOf(createMountain()).name);
      expect(workshopUnlocked(month.mountain)).toBe(false);
      // No band's material comes up with it.
      expect(month.mountain.stock).toEqual({
        ...createMountain().stock,
        stones: month.mined,
      });
    });
  });

  it("pays time away in full", () => {
    fresh(() => {
      const crew = owning({ helper: 12, cart: 1 }, 0);
      const speed = effectiveRates(crew).crewPerSecond;
      const away = accrueAway({ mountain: crew, lastSeen: 0, now: 2 * HOUR });
      expect(away.mined).toBe(Math.floor(2 * 3600 * speed * 0.3));
      expect(away.mountain.stock.stones).toBe(away.mined);
      expect(away.mountain.remaining).toBe(MOUNTAIN_STONES);
    });
  });

  it("the Topsoil leans on no stage: the line reads every machine at its rating", () => {
    fresh(() => {
      // The Topsoil has no lean on the line: each machine runs at its
      // rating (×3 today's, the cart ×10 in a fresh mine, #655), with no
      // band slowing or speeding it.
      const crew = owning({ helper: 12, cart: 1, hoist: 1, drill: 1 }, 0);
      const rates = effectiveRates(crew);
      expect(rates.tierSpeed.cart).toBe(60);
      expect(rates.tierSpeed.hoist).toBe(60);
      expect(rates.tierSpeed.drill).toBe(108);
    });
  });
});

describe("machines open by where they open, and nothing else (rule 1's table, rule 2.6)", () => {
  it("offers workers, the cart, the hoist and the drill from the first evening (#689)", () => {
    fresh(() => {
      const start = owning({}, 1e12);
      expect(buys(start)).toEqual(["helper", "cart", "hoist", "drill"]);
      for (const id of ["cart", "hoist", "drill"] as const) {
        expect(tierShown(start, tierById(id))).toBe(true);
        expect(tierLock(start, tierById(id))).toBeUndefined();
      }
    });
  });

  it("sells a machine before anyone can run it, and it stands idle", () => {
    fresh(() => {
      const start = owning({}, 1e12);
      const bought = applyMove(start, { kind: "buyTier", id: "drill" }, 0);
      if (bought.kind !== "applied") {
        throw new Error("drill refused");
      }
      expect(bought.mountain.owned.helper).toBe(start.owned.helper);
      expect(bought.mountain.jobs).toEqual(start.jobs);
      // Three on drilling: the drill takes one, so it runs (108) with two on
      // picks (6).
      expect(effectiveRates(bought.mountain).running.drill).toBe(1);
    });
  });

  it("keeps the later machines out: the Granite, the Foundry and the School are later parts", () => {
    fresh(() => {
      const crew = owning({ helper: 200, cart: 50, hoist: 50, drill: 50 });
      for (const id of ["borer", "train", "machine", "kid"] as const) {
        const tier = tierById(id);
        expect(tierInPlay(tier)).toBe(false);
        expect(tierShown(crew, tier)).toBe(false);
        const tap = applyMove(crew, { kind: "buyTier", id }, 0);
        expect(tap.kind).toBe("refused");
      }
      expect(buys(crew)).toEqual(["helper", "cart", "hoist", "drill"]);
    });
  });

  it("locks the later machines, so nothing reads them as for sale", () => {
    fresh(() => {
      const crew = owning({ helper: 60, cart: 5, hoist: 5, drill: 5 });
      const doors = {
        borer: "granite",
        train: "granite",
        machine: "foundry",
        kid: "school",
      } as const;
      for (const [id, at] of Object.entries(doors)) {
        const tier = tierById(id as TierId);
        expect(tierLock(crew, tier)).toEqual({ kind: "later", at });
        expect(tierLocked(crew, tier)).toBe(true);
      }
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
  it("keeps Work boots and the machine upgrades", () => {
    fresh(() => {
      const crew = owning({ helper: 40, cart: 10, hoist: 5, drill: 10 });
      const shown = UPGRADES.filter((upgrade) =>
        upgradeShown(crew, upgrade),
      ).map((upgrade) => upgrade.id);
      expect(shown).toEqual(["boots", "cartSyn", "drillSyn"]);
      expect(buyUpgrade(crew, "boots")).not.toBe(crew);
      const offered = listActions(crew, 0).flatMap((action) =>
        action.kind === "buyUpgrade" ? [action.id] : [],
      );
      expect(offered).toEqual(["boots", "cartSyn", "drillSyn"]);
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
  it("still lets a worker buy a cart, and a promotion go through", () => {
    const today = owning({ helper: 1 }, 1e9);
    expect(buys(today)).toContain("cart");
    expect(promote(today)).not.toBe(today);
    expect(digStones(createMountain(), 10).remaining).toBe(
      MOUNTAIN_STONES - 10,
    );
  });
});
