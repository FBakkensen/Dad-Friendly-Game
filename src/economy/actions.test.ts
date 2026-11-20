import {
  EMPTY_STOCK,
  pay,
  priceAmount,
  stonesPrice,
  UNSHOWN_PRICE,
} from "../stock";
import { describe, expect, it } from "vitest";
import { buyCrew } from "../crew";
import { holdOrder, placeOrder } from "../city";
import { freeWorker } from "../workforce";
import { withFactors } from "./factors";
import { PART_THREE_OFF, PART_TWO_OFF } from "../part-switch";
import { NO_GRANITE_PILES, NO_LEVEL_MACHINES } from "../mine-levels";
import {
  promote,
  promoteCost,
  promotePrice,
  station,
  type Engineer,
} from "../engineers";
import { recall, send } from "../expeditions";
import { markTaught, showsDot } from "../teach";
import type { Trouble } from "../hazards";
import { createMountain, type Mountain } from "../mountain";
import {
  CREWED_JOBS,
  crewedStart,
  minedMountain,
  benchCraft,
  patched,
} from "../test-fixtures";
import { AWAY_PAY_RATE, effectiveRates, paidAwayMs } from "../rates";
import { owned, tierById, tierCost, tierQuote, type TierId } from "../tiers";
import {
  buyUpgrade,
  upgradeById,
  upgradeCost,
  upgradeLevel,
  upgradePrice,
  type UpgradeId,
  NO_UPGRADES,
} from "../upgrades";
import { cancelCraft, recipePrice } from "../workshop";
import {
  applyAction,
  applyMove,
  buyWithTeach,
  listActions,
  valueOf,
  type Action,
  type Move,
  type ValueContext,
  vehicleBuyMove,
} from "./actions";
import { vehicleQuote } from "../transport";

const NOW = 1_700_000_000_000;
const HORIZON = 6 * 60 * 60;

/** At the mountain the whole time. Income is the unrounded crew. */
const LIVE: ValueContext = {
  liveSeconds: 1,
  awaySeconds: 0,
};

/** One session and the gap before the next, as a typical dad plays it. */
const SESSION_S = 10 * 60;
const GAP_S = 12 * 60 * 60 - SESSION_S;
const CASUAL: ValueContext = {
  liveSeconds: SESSION_S,
  awaySeconds: GAP_S,
};

function score(
  mountain: Mountain,
  action: Action,
  horizon = HORIZON,
  context: ValueContext = LIVE,
  now = 0,
) {
  return valueOf(mountain, action, horizon, context, now);
}

const ada: Engineer = { name: "Ada", rank: 0, trips: 0, post: "borer" };

/**
 * One action of every kind. Adding a kind without a fixture fails typecheck.
 */
const FIXTURES = {
  buyTier: { kind: "buyTier", id: "helper" },
  buyUpgrade: { kind: "buyUpgrade", id: "boots", price: [] },
  promote: { kind: "promote", price: [] },
  station: { kind: "station", index: 0, post: "drill" },
  send: { kind: "send", index: 0, tunnel: "old-shaft" },
  recall: { kind: "recall", index: 0 },
  fixTrouble: { kind: "fixTrouble", tier: "borer", startedAt: NOW },
  cancelCraft: { kind: "cancelCraft" },
  placeOrder: { kind: "placeOrder" },
  holdOrder: { kind: "holdOrder" },
  resumeOrder: { kind: "resumeOrder" },
  buyVehicle: { kind: "buyVehicle", id: "horseWagon" },
  placeWorker: { kind: "placeWorker", job: "haulage", count: 1 },
  freeWorker: { kind: "freeWorker", job: "haulage", count: 1 },
  buyMaker: { kind: "buyMaker", id: "kiln" },
  expandStockyard: { kind: "expandStockyard" },
  sinkShaft: { kind: "sinkShaft" },
  buyGraniteMachine: { kind: "buyGraniteMachine", id: "borer", count: 1 },
  placeWorkOrder: { kind: "placeWorkOrder", blueprint: "iron-rails" },
  cancelWorkOrder: { kind: "cancelWorkOrder" },
  installWorkOrder: { kind: "installWorkOrder" },
  assignHoist: { kind: "assignHoist", level: "granite", count: 1 },
  unassignHoist: { kind: "unassignHoist", level: "topsoil", count: 1 },
} as const satisfies {
  [K in Action["kind"]]: Extract<Action, { kind: K }>;
};

const trouble: Trouble = { kind: "jam", tier: "borer", startedAt: NOW };

/** The move at the price this mountain shows, as the screen sends it (#367). */
function quoted<A extends Action>(mountain: Mountain, action: A): A {
  switch (action.kind) {
    case "buyUpgrade":
      return {
        ...action,
        price: upgradePrice(mountain, action.id) ?? [],
      };
    case "promote":
      return { ...action, price: promotePrice(mountain) };
    default:
      return action;
  }
}

/** An upgrade buy at this mountain's price, for the moves the price does not change. */
const upgradeAt = (mountain: Mountain, id: UpgradeId) =>
  quoted(mountain, { kind: "buyUpgrade", id, price: [] });

/** A promotion at this mountain's price. */
const promoteAt = (mountain: Mountain) =>
  quoted(mountain, { kind: "promote", price: [] });

function direct(mountain: Mountain, action: Action, now: number): Mountain {
  switch (action.kind) {
    case "buyTier":
      // The UI's buy (#409): a worker bought beside an idle machine marks staffing taught.
      return buyWithTeach(mountain, action.id);
    case "buyUpgrade":
      return buyUpgrade(mountain, action.id);
    case "promote":
      return promote(mountain);
    case "station": {
      // The UI's tend (#409): the party is called back first, and a real station marks
      // tending taught.
      const moved = station(
        recall(mountain, action.index),
        action.index,
        action.post,
      );
      return moved === mountain ? mountain : markTaught(moved, "tending");
    }
    case "send":
      return send(mountain, action.index, action.tunnel, now);
    case "recall":
      return recall(mountain, action.index);
    case "fixTrouble":
      return mountain;
    case "cancelCraft":
      return cancelCraft(mountain, now);
    case "placeOrder":
    case "holdOrder":
    case "resumeOrder":
    case "buyVehicle":
    case "placeWorker":
    case "freeWorker":
    case "buyMaker":
    case "expandStockyard":
    case "sinkShaft":
    case "buyGraniteMachine":
    case "placeWorkOrder":
    case "cancelWorkOrder":
    case "installWorkOrder":
    case "assignHoist":
    case "unassignHoist":
      // Their own suites prove these moves (#654, #689, #666, #673, #674,
      // #724: src/fresh-orders.test.ts, src/workforce.test.ts,
      // src/part-two.test.ts, src/part-three-moves.test.ts,
      // src/factory-moves.test.ts).
      return applyAction(mountain, action, now);
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

function expectSameMove(mountain: Mountain, action: Action, now: number): void {
  const got = applyAction(mountain, action, now);
  const want = direct(mountain, action, now);
  expect(got).toEqual(want);
  if (want === mountain) {
    expect(got).toBe(mountain);
  }
}

const fresh = createMountain();
const withHelper = {
  ...fresh,
  stock: { ...fresh.stock, stones: 0 },
  owned: { ...fresh.owned, helper: 1 },
};
const STOCK = {
  clay: 500,
  iron: 500,
  crystal: 500,
  heartstone: 500,
};

const rich: Mountain = {
  ...minedMountain(25_000_000),
  owned: {
    ...minedMountain(25_000_000).owned,
    helper: 30,
    cart: 4,
    drill: 2,
    borer: 1,
  },
  stock: { ...minedMountain(25_000_000).stock, stones: 1e15, ...STOCK },
  engineers: [ada],
};
const broke: Mountain = { ...rich, stock: { ...rich.stock, stones: 0 } };
const travelling = send(rich, 0, "old-shaft", NOW);
const lockedMachine: Mountain = {
  ...minedMountain(24_999_999),
  owned: {
    ...minedMountain(24_999_999).owned,
    helper: 10,
    cart: 1,
    drill: 1,
    borer: 1,
  },
  stock: { ...minedMountain(24_999_999).stock, stones: 1e15 },
  engineers: [ada],
};
const crowned: Mountain = {
  ...minedMountain(70_000_000),
  owned: {
    ...minedMountain(70_000_000).owned,
    helper: 30,
    cart: 1,
    drill: 1,
    borer: 1,
    machine: 1,
  },
  stock: { ...minedMountain(70_000_000).stock, stones: 1e15 },
  engineers: [{ ...ada, post: "machine" }],
};

function fullCrew(): Mountain {
  let mountain: Mountain = {
    ...fresh,
    owned: { ...fresh.owned, helper: 10, cart: 1, drill: 1, borer: 1 },
    stock: { ...fresh.stock, stones: 1e15 },
    engineers: [ada],
  };
  while (mountain.engineers.length < 5) {
    mountain = promote({
      ...mountain,
      stock: { ...mountain.stock, stones: promoteCost(mountain) },
    });
  }
  return mountain;
}

/**
 * A fresh mine at work: the crew of 21 on its jobs and nine more free, four
 * carts, four hoists and one drill, so drilling is the narrow stage, and Ada
 * on the drill (#739).
 */
const working: Mountain = {
  ...crewedStart(),
  owned: {
    ...crewedStart().owned,
    helper: 30,
    cart: 4,
    hoist: 4,
    drill: 1,
    borer: 1,
  },
  stock: { ...crewedStart().stock, stones: 1e15 },
  engineers: [{ ...ada, post: "drill" }],
};
const drillWorker = { kind: "placeWorker", job: "drilling", count: 1 } as const;

/** This mountain with one more of the tier. */
function setOwnedFor(mountain: Mountain, id: TierId): Mountain {
  return {
    ...mountain,
    owned: { ...mountain.owned, [id]: mountain.owned[id] + 1 },
  };
}

/** The line's exact pace after this move, less before it. */
function exactDelta(mountain: Mountain, action: Action): number {
  return (
    effectiveRates(applyAction(mountain, action, NOW)).exactCrewPerSecond -
    effectiveRates(mountain).exactCrewPerSecond
  );
}

describe("action fixtures", () => {
  it("has one fixture per kind", () => {
    const kinds = Object.keys(FIXTURES) as Action["kind"][];
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const kind of kinds) {
      expect(FIXTURES[kind].kind).toBe(kind);
    }
  });

  it("applies every fixture through the real function", () => {
    const mountains = [fresh, rich, travelling, broke];
    for (const mountain of mountains) {
      for (const action of Object.values(FIXTURES)) {
        expectSameMove(mountain, quoted(mountain, action), NOW);
      }
    }
  });
});

describe("listActions", () => {
  it("offers the tiers behind the start's door on a new mine, and the rest as the crew grows", () => {
    const names = (mountain: Mountain) =>
      listActions(mountain, NOW).map((action) =>
        "id" in action ? `${action.kind}:${action.id}` : action.kind,
      );
    const tiers = (mountain: Mountain) =>
      listActions(mountain, NOW).flatMap((action) =>
        action.kind === "buyTier" ? [action.id] : [],
      );
    expect(tiers(fresh)).toEqual(["helper", "cart", "hoist", "drill"]);
    // A full pocket opens nothing (#250); the crew it owns does.
    expect(
      names({ ...fresh, stock: { ...fresh.stock, stones: 1e12 } }),
    ).toEqual(names(fresh));
    expect(
      names({ ...fresh, owned: { ...fresh.owned, helper: 1, cart: 5 } }),
    ).toEqual(expect.arrayContaining(["buyUpgrade:cartSyn"]));
    expect(
      names({ ...fresh, owned: { ...fresh.owned, helper: 1, cart: 5 } }),
    ).not.toContain("buyUpgrade:boots");
  });

  it("keeps a later part's tier off the list until its door opens (#673)", () => {
    const tiers = (mountain: Mountain) =>
      listActions(mountain, NOW).flatMap((action) =>
        action.kind === "buyTier" ? [action.id] : [],
      );
    expect(tiers(lockedMachine)).not.toContain("borer");
    expect(tiers(lockedMachine)).not.toContain("machine");
    withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, () => {
      const sunk: Mountain = {
        ...lockedMachine,
        mineLevels: {
          granite: {
            machines: NO_LEVEL_MACHINES,
            piles: NO_GRANITE_PILES,
          },
        },
      };
      expect(tiers(sunk)).toContain("borer");
      expect(tiers(sunk)).not.toContain("machine");
    });
  });

  it("keeps unaffordable buys and drops a bought upgrade", () => {
    const offers = listActions(broke, NOW);
    expect(offers.some((action) => action.kind === "buyTier")).toBe(true);
    expect(offers.some((action) => action.kind === "promote")).toBe(true);
    const maxed: Mountain = { ...rich, upgrades: { ...NO_UPGRADES, boots: 1 } };
    expect(
      listActions(maxed, NOW).some(
        (action) => action.kind === "buyUpgrade" && action.id === "boots",
      ),
    ).toBe(false);
  });

  it("offers posts and tunnels for an engineer at camp, and a recall while they are out", () => {
    const atCamp: Mountain = {
      ...rich,
      engineers: [{ ...ada, post: "camp" }],
    };
    const home = listActions(atCamp, NOW);
    const stations = home.filter((action) => action.kind === "station");
    expect(stations.map((action) => action.post)).toEqual([
      "cart",
      "drill",
      "borer",
      "machine",
    ]);
    expect(
      home
        .filter((action) => action.kind === "send")
        .map((action) => action.tunnel),
    ).toEqual(["side-seam", "old-shaft"]);
    const away = listActions(travelling, NOW);
    expect(away.some((action) => action.kind === "recall")).toBe(true);
    expect(
      away.some(
        (action) => action.kind === "station" || action.kind === "send",
      ),
    ).toBe(false);
  });

  it("opens the deep dark to a journeyman and skips sends when the clock cannot hold the return", () => {
    const nils: Engineer = { name: "Nils", rank: 1, trips: 3, post: "camp" };
    const party: Mountain = { ...rich, engineers: [ada, nils] };
    const tunnels = listActions(party, NOW).flatMap((action) =>
      action.kind === "send" && action.index === 1 ? [action.tunnel] : [],
    );
    expect(tunnels).toContain("deep-dark");
    const overflow = listActions(party, Number.MAX_SAFE_INTEGER).filter(
      (action) => action.kind === "send",
    );
    expect(overflow).toEqual([]);
    expect(
      listActions(party, Number.NaN).some((action) => action.kind === "send"),
    ).toBe(false);
    const seed = send(party, 0, "old-shaft", NOW);
    const trip = seed.expeditions[0];
    expect(trip).toBeDefined();
    if (trip === undefined) {
      return;
    }
    const packed: Mountain = {
      ...seed,
      expeditions: [trip, trip, trip, trip, trip],
    };
    expect(
      listActions(packed, NOW).some((action) => action.kind === "send"),
    ).toBe(false);
  });

  it("does not promote a full crew or a mountain with no worker", () => {
    expect(
      listActions(fresh, NOW).some((action) => action.kind === "promote"),
    ).toBe(false);
    expect(
      listActions(fullCrew(), NOW).some((action) => action.kind === "promote"),
    ).toBe(false);
  });

  it("adds the fix only while trouble is passed in", () => {
    expect(
      listActions(rich, NOW).some((action) => action.kind === "fixTrouble"),
    ).toBe(false);
    const withTrouble = listActions(rich, NOW, trouble);
    expect(
      withTrouble.filter((action) => action.kind === "fixTrouble"),
    ).toEqual([{ kind: "fixTrouble", tier: "borer", startedAt: NOW }]);
  });

  it("lists every kind across these mountains", () => {
    const seen = new Set<Action["kind"]>();
    const onBench: Mountain = {
      ...rich,
      bench: {
        recipe: "iron-rails",
        startedAt: NOW - 1000,
        endsAt: NOW + 60_000,
      },
    };
    for (const mountain of [fresh, rich, travelling, crowned, broke, onBench]) {
      for (const action of listActions(mountain, NOW, trouble)) {
        seen.add(action.kind);
      }
    }
    // A fresh mine lists the orders and the wagon (#654), each by its
    // state, and moves a worker on and off a job (#689).
    withFactors({}, () => {
      const mine = createMountain();
      const ordered = placeOrder(mine);
      const oneFree = freeWorker(mine, "drilling");
      for (const one of [mine, ordered, holdOrder(ordered), oneFree]) {
        for (const action of listActions(one, NOW)) {
          seen.add(action.kind);
        }
      }
    });
    // Part 2 lists a kiln and the stockyard once the Light Tower is up (#667).
    withFactors({ [PART_TWO_OFF]: 0 }, () => {
      const lit: Mountain = {
        ...createMountain(),
        operational: ["lightTower"],
      };
      for (const action of listActions(lit, NOW)) {
        seen.add(action.kind);
      }
    });
    // Part 3 lists the shaft, then a machine for the Granite once it is sunk (#673).
    withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, () => {
      const lit: Mountain = {
        ...createMountain(),
        operational: ["lightTower"],
      };
      // Two hoists, one on the Topsoil: a hoist to assign and one to take off (#724).
      const sunk: Mountain = {
        ...lit,
        owned: { ...lit.owned, hoist: 2 },
        mineLevels: {
          granite: {
            machines: NO_LEVEL_MACHINES,
            piles: NO_GRANITE_PILES,
          },
        },
        cages: {
          ...lit.cages,
          assigned: { ...lit.cages.assigned, topsoil: 1 },
        },
      };
      // The factory's station opens with the shaft (#674).
      const done: Mountain = {
        ...sunk,
        station: { kind: "done", blueprint: "reinforce" },
      };
      for (const one of [lit, sunk, done]) {
        for (const action of listActions(one, NOW)) {
          seen.add(action.kind);
        }
      }
    });
    for (const kind of Object.keys(FIXTURES) as Action["kind"][]) {
      expect(seen.has(kind)).toBe(true);
    }
  });
});

describe("listActions, characterized (#409)", () => {
  it("lists the same moves, in the same order, as before its split", () => {
    const mountains = {
      fresh,
      withHelper,
      rich,
      broke,
      travelling,
      lockedMachine,
      crowned,
      fullCrew: fullCrew(),
    };
    const listed = Object.fromEntries(
      Object.entries(mountains).flatMap(([name, mountain]) =>
        [NOW, 0].flatMap((now) =>
          [undefined, trouble].map((passed) => [
            `${name} at ${String(now)}${passed === undefined ? "" : " in trouble"}`,
            listActions(mountain, now, passed)
              // The prices a buy carries (#367) are checked on their own, below.
              .map((action) =>
                Object.entries(action)
                  .filter(([key]) => key !== "price")
                  .map(([, value]) => String(value))
                  .join(":"),
              )
              .join(" "),
          ]),
        ),
      ),
    );
    expect(listed).toMatchSnapshot();
  });
});

describe("applyAction", () => {
  const samples = [
    fresh,
    withHelper,
    rich,
    broke,
    travelling,
    lockedMachine,
    crowned,
    fullCrew(),
  ];

  it("matches the direct call for every listed move", () => {
    for (const mountain of samples) {
      for (const now of [NOW, 0]) {
        for (const action of listActions(mountain, now, trouble)) {
          expectSameMove(mountain, action, now);
        }
      }
    }
  });

  it("changes a rich mountain for every move except the fix", () => {
    for (const action of listActions(rich, NOW, trouble)) {
      const next = applyAction(rich, action, NOW);
      if (action.kind === "fixTrouble") {
        expect(next).toBe(rich);
      } else {
        expect(next).not.toBe(rich);
      }
    }
  });

  it("leaves the mountain when the pocket cannot pay", () => {
    for (const action of listActions(broke, NOW)) {
      if (
        action.kind === "buyTier" ||
        action.kind === "buyUpgrade" ||
        action.kind === "promote"
      ) {
        expect(applyAction(broke, action, NOW)).toBe(broke);
      }
    }
  });

  it("brings Ada with the first borer, the same as buyCrew", () => {
    withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, () => {
      const funded: Mountain = {
        ...fresh,
        owned: { ...fresh.owned, drill: 1, helper: 8 },
        stock: { ...fresh.stock, stones: 1e12, cutStone: 1e9 },
        mineLevels: {
          granite: {
            machines: NO_LEVEL_MACHINES,
            piles: NO_GRANITE_PILES,
          },
        },
      };
      const bought = applyAction(funded, { kind: "buyTier", id: "borer" }, NOW);
      expect(bought.owned.borer).toBe(1);
      expect(bought.engineers[0]?.name).toBe("Ada");
      expect(bought.engineers[0]?.post).toBe("borer");
      expect(bought).toEqual(buyCrew(funded, "borer"));
    });
  });
});

describe("valueOf", () => {
  // valueOf reads no price: the buys here carry 0 (#367).
  it("values a tier by what the line gains with one more, at its sticker while workers are free", () => {
    const listed = listActions(working, NOW).flatMap((action) =>
      action.kind === "buyTier" ? [action] : [],
    );
    expect(listed.map((action) => action.id)).toEqual([
      "helper",
      "cart",
      "hoist",
      "drill",
    ]);
    for (const action of listed) {
      const tier = tierById(action.id);
      const value = score(working, action, HORIZON);
      const more = setOwnedFor(working, action.id);
      expect(value.gainPerSec).toBeCloseTo(
        effectiveRates(more).exactCrewPerSecond -
          effectiveRates(working).exactCrewPerSecond,
        8,
      );
      expect(value.cost).toBe(tierCost(tier, owned(working, tier)));
      expect(score(working, action, 60).gainPerSec).toBe(value.gainPerSec);
    }
    // Drilling is the narrow stage: only the drill moves the line.
    expect(score(working, { kind: "buyTier", id: "drill" }).gainPerSec).toBe(
      100.5,
    );
    expect(score(working, { kind: "buyTier", id: "cart" }).gainPerSec).toBe(0);
  });

  it("scores a hire as nothing until he is placed, and the placing by what the line gains", () => {
    expect(score(working, FIXTURES.buyTier, HORIZON)).toMatchObject({
      gainPerSec: 0,
      cost: tierCost(tierById("helper"), working.owned.helper),
      paybackSec: Number.POSITIVE_INFINITY,
    });
    const placed = score(working, drillWorker, HORIZON);
    expect(placed.gainPerSec).toBeGreaterThan(0);
    expect(placed.gainPerSec).toBeCloseTo(exactDelta(working, drillWorker), 8);
    expect(placed.cost).toBe(0);
    expect(placed.paybackSec).toBe(0);
    const freed = { kind: "freeWorker", job: "drilling", count: 1 } as const;
    const lost = score(working, freed, HORIZON);
    expect(lost.gainPerSec).toBeLessThan(0);
    expect(lost.gainPerSec).toBeCloseTo(exactDelta(working, freed), 8);
    expect(lost.paybackSec).toBe(Number.POSITIVE_INFINITY);
  });

  it("scores a second cart plus the one worker it needs", () => {
    // The only worker is on haulage with the first cart: none is free.
    const hauling: Mountain = {
      ...fresh,
      owned: { ...fresh.owned, cart: 1 },
      jobs: { ...fresh.jobs, drilling: 0, haulage: 1 },
    };
    expect(effectiveRates(hauling).running.cart).toBe(1);
    const value = score(hauling, { kind: "buyTier", id: "cart" }, HORIZON);
    expect(value.cost).toBe(
      tierCost(tierById("cart"), 1) +
        tierCost(tierById("helper"), hauling.owned.helper),
    );
  });

  it("uses the crew delta for every listed upgrade", () => {
    for (const mountain of [
      rich,
      crowned,
      { ...rich, owned: { ...rich.owned, helper: 10 } },
    ]) {
      for (const action of listActions(mountain, NOW)) {
        if (action.kind !== "buyUpgrade") {
          continue;
        }
        const price = upgradeCost(
          upgradeById(action.id),
          upgradeLevel(mountain, action.id),
        );
        expect(price).toBeDefined();
        if (price === undefined) {
          continue;
        }
        const bought = buyUpgrade(
          {
            ...mountain,
            stock: { ...mountain.stock, stones: mountain.stock.stones + price },
          },
          action.id,
        );
        const value = score(mountain, action, HORIZON);
        expect(value.gainPerSec).toBeCloseTo(
          effectiveRates(bought).exactCrewPerSecond -
            effectiveRates(mountain).exactCrewPerSecond,
          8,
        );
        expect(value.cost).toBe(price);
      }
    }
  });

  it("leaves a permanent gain alone at a zero horizon", () => {
    const now = score(working, drillWorker, 0).gainPerSec;
    expect(now).toBeGreaterThan(0);
    expect(now).toBe(score(working, drillWorker, HORIZON).gainPerSec);
  });

  it("values a fix as the crew speed trouble was holding back", () => {
    const flood: Trouble = { kind: "flood", tier: "drill", startedAt: NOW };
    const fix = { kind: "fixTrouble", tier: "drill", startedAt: NOW } as const;
    const slowed = effectiveRates(working, NOW, flood).exactCrewPerSecond;
    const clear = effectiveRates(working, NOW).exactCrewPerSecond;
    expect(clear).toBeGreaterThan(slowed);
    const value = score(working, fix, HORIZON);
    expect(value.gainPerSec).toBeCloseTo(clear - slowed, 8);
    expect(value.cost).toBe(0);
    expect(value.paybackSec).toBe(0);
    expect(applyAction(working, fix, NOW)).toBe(working);
  });

  it("reports a loss as an infinite payback", () => {
    const moved = score(
      working,
      { kind: "station", index: 0, post: "camp" },
      HORIZON,
    );
    expect(moved.gainPerSec).toBeLessThan(0);
    expect(moved.cost).toBe(0);
    expect(moved.paybackSec).toBe(Number.POSITIVE_INFINITY);
    const home = score(
      { ...working, engineers: [{ ...ada, post: "camp" }] },
      { kind: "station", index: 0, post: "drill" },
      HORIZON,
    );
    expect(home.gainPerSec).toBeGreaterThan(0);
    expect(home.paybackSec).toBe(0);
  });

  it("scores promote, send, and recall from the crew before and after", () => {
    const away = send(working, 0, "old-shaft", NOW);
    const stepUp = score(working, { kind: "promote", price: [] }, HORIZON);
    expect(stepUp.cost).toBe(promoteCost(working));
    expect(stepUp.gainPerSec).toBeGreaterThan(0);
    expect(stepUp.paybackSec).toBeGreaterThan(0);
    expect(Number.isFinite(stepUp.paybackSec)).toBe(true);
    const trip = score(
      working,
      { kind: "send", index: 0, tunnel: "old-shaft" },
      HORIZON,
    );
    expect(trip.gainPerSec).toBeGreaterThan(0);
    // Leaving the drill costs the tending she skips. The find does not
    // pay that back at once.
    expect(trip.cost).toBeGreaterThan(0);
    expect(trip.paybackSec).toBeGreaterThan(0);
    const back = score(
      away,
      { kind: "recall", index: 0 },
      HORIZON,
      LIVE,
      NOW + 60_000,
    );
    expect(back.gainPerSec).toBeGreaterThan(0);
    expect(back.cost).toBeGreaterThan(0);
    expect(Number.isFinite(back.paybackSec)).toBe(true);
    const early = score(away, { kind: "recall", index: 0 }, HORIZON, LIVE, 0);
    const late = score(
      away,
      { kind: "recall", index: 0 },
      HORIZON,
      LIVE,
      Number.MAX_SAFE_INTEGER,
    );
    expect(early.cost).toBe(late.cost);
    expect(early.cost).toBeGreaterThan(0);
    const brokePromote = score(
      { ...fresh, owned: { ...fresh.owned, helper: 0 } },
      { kind: "promote", price: [] },
      HORIZON,
    );
    expect(brokePromote.gainPerSec).toBe(0);
    expect(
      score(
        { ...working, owned: { ...working.owned, helper: 0 } },
        { kind: "promote", price: [] },
        HORIZON,
      ).gainPerSec,
    ).toBe(0);
    // With Ada on the carts, the next engineer takes the narrow drill.
    const onCarts: Mountain = {
      ...working,
      engineers: [{ ...ada, post: "cart" }],
    };
    expect(
      score(onCarts, { kind: "promote", price: [] }, 0).gainPerSec,
    ).toBeGreaterThan(0);
    const home: Mountain = {
      ...working,
      engineers: [{ ...ada, post: "camp" }],
    };
    const campSend = score(
      home,
      { kind: "send", index: 0, tunnel: "side-seam" },
      0,
    );
    expect(campSend.cost).toBe(0);
    expect(
      score(fresh, { kind: "send", index: 0, tunnel: "old-shaft" }, HORIZON)
        .paybackSec,
    ).toBe(Number.POSITIVE_INFINITY);
    const idleRecall = score(working, { kind: "recall", index: 0 }, 0);
    expect(idleRecall.cost).toBeGreaterThanOrEqual(0);
  });

  it("gives a locked or maxed buy no crew gain", () => {
    const lockedBoots = score(
      fresh,
      { kind: "buyUpgrade", id: "boots", price: [] },
      HORIZON,
    );
    expect(lockedBoots.gainPerSec).toBe(0);
    expect(lockedBoots.cost).toBe(upgradeCost(upgradeById("boots"), 0));
    expect(lockedBoots.paybackSec).toBe(Number.POSITIVE_INFINITY);
    const machine = score(
      lockedMachine,
      { kind: "buyTier", id: "machine" },
      HORIZON,
    );
    expect(machine.gainPerSec).toBe(0);
    expect(machine.paybackSec).toBe(Number.POSITIVE_INFINITY);
    const maxed = score(
      { ...rich, upgrades: { ...NO_UPGRADES, boots: 1 } },
      { kind: "buyUpgrade", id: "boots", price: [] },
      HORIZON,
    );
    expect(maxed.gainPerSec).toBe(0);
    expect(maxed.cost).toBe(0);
  });

  it("matches the casual dad's stones a day", () => {
    const cycle = SESSION_S + GAP_S;
    const perDay = (gainPerSec: number) => gainPerSec * cycle * 2;
    const paidGapS = paidAwayMs(GAP_S * 1000) / 1000;
    const crewDay = 2 * (SESSION_S + paidGapS * AWAY_PAY_RATE);
    const live = score(working, drillWorker, HORIZON, LIVE);
    const casual = score(working, drillWorker, HORIZON, CASUAL);
    expect(live.gainPerSec).toBeGreaterThan(0);
    expect(perDay(casual.gainPerSec)).toBeCloseTo(live.gainPerSec * crewDay, 4);
  });

  it("weighs a schedule with no time in it as live play", () => {
    const noTime: ValueContext = { liveSeconds: 0, awaySeconds: 0 };
    expect(score(working, drillWorker, HORIZON, noTime)).toEqual(
      score(working, drillWorker, HORIZON, LIVE),
    );
    expect(
      score(working, drillWorker, HORIZON, noTime).gainPerSec,
    ).toBeGreaterThan(0);
  });

  it("keeps a save's craft cancellable, with its refund off the table (#740)", () => {
    // The old bench never opens (#740), so no craft is offered; a save's
    // craft still runs, and can be called off until its time is up.
    const shed = patched(
      {
        ...createMountain(),
        owned: {
          ...createMountain().owned,
          helper: 30,
          cart: 1,
          hoist: 2,
          drill: 1,
          borer: 1,
        },
        jobs: CREWED_JOBS,
        stock: { ...createMountain().stock, stones: 1e15, ...STOCK },
        engineers: [ada],
      },
      {},
    );
    const busy = benchCraft(
      pay(shed, recipePrice("iron-rails")),
      "iron-rails",
      NOW,
    );
    const refund = score(busy, { kind: "cancelCraft" }, HORIZON, LIVE, NOW);
    expect(refund.paybackSec).toBe(Number.POSITIVE_INFINITY);
    // Cancelling loses what the rails add: the stones back are no gain.
    expect(refund.gainPerSec).toBeLessThan(0);
    const finishedAt = busy.bench?.endsAt ?? NOW;
    expect(
      score(busy, { kind: "cancelCraft" }, HORIZON, LIVE, finishedAt)
        .gainPerSec,
    ).toBe(0);
    expect(score(shed, { kind: "cancelCraft" }).gainPerSec).toBe(0);
    // A bench whose time is up is collected by the store: no cancel.
    const benchMoves = (at: number) =>
      listActions(busy, at).filter((action) => action.kind === "cancelCraft");
    expect(benchMoves(NOW)).toEqual([{ kind: "cancelCraft" }]);
    expect(benchMoves(finishedAt)).toEqual([]);
  });
});

describe("applyMove (#409)", () => {
  it("applies a buy, with what it spent, and refuses one the pocket cannot pay", () => {
    const cart = { kind: "buyTier", id: "cart" } as const;
    const bought = applyMove(rich, cart, NOW);
    expect(bought.kind).toBe("applied");
    if (bought.kind !== "applied") return;
    expect(bought.mountain.owned.cart).toBe(rich.owned.cart + 1);
    expect(bought.spent).toEqual({
      ...EMPTY_STOCK,
      stones: rich.stock.stones - bought.mountain.stock.stones,
    });
    expect(bought.gained).toEqual(EMPTY_STOCK);
    expect(applyMove(broke, cart, NOW)).toEqual({ kind: "refused" });
  });

  it("buys several of a tier as one move, all or nothing (#358)", () => {
    const tenCarts = { kind: "buyTiers", id: "cart", count: 10 } as const;
    const quote = tierQuote(rich, tierById("cart"), "ten");
    const bought = applyMove(rich, tenCarts, NOW);
    expect(bought).toEqual({
      kind: "applied",
      mountain: {
        ...rich,
        owned: { ...rich.owned, cart: rich.owned.cart + 10 },
        stock: { ...rich.stock, stones: rich.stock.stones - quote.cost },
      },
      spent: { ...EMPTY_STOCK, stones: quote.cost },
      gained: EMPTY_STOCK,
      events: [{ kind: "tierBought", id: "cart", count: rich.owned.cart + 10 }],
    });
    // Nine affordable is not ten: nothing is bought.
    const short: Mountain = {
      ...rich,
      stock: { ...rich.stock, stones: quote.cost - 1 },
    };
    expect(applyMove(short, tenCarts, NOW)).toEqual({ kind: "refused" });
  });

  it("buys several wagons as one move, all or nothing (#715)", () => {
    const tenWagons = vehicleBuyMove("horseWagon", 10);
    expect(tenWagons).toEqual({
      kind: "buyVehicles",
      id: "horseWagon",
      count: 10,
    });
    expect(vehicleBuyMove("horseWagon", 1)).toEqual({
      kind: "buyVehicle",
      id: "horseWagon",
    });
    const quote = vehicleQuote(rich, "horseWagon", "ten");
    const bought = applyMove(rich, tenWagons, NOW);
    expect(bought.kind === "applied" && bought.mountain.fleet.horseWagon).toBe(
      rich.fleet.horseWagon + 10,
    );
    expect(bought.kind === "applied" && bought.spent).toEqual({
      ...EMPTY_STOCK,
      stones: quote.cost,
    });
    const short: Mountain = {
      ...rich,
      stock: { ...rich.stock, stones: quote.cost - 1 },
    };
    expect(applyMove(short, tenWagons, NOW)).toEqual({
      kind: "refused",
    });
  });

  it("several workers beside an idle machine still mark staffing taught (#358)", () => {
    const idle: Mountain = {
      ...rich,
      engineers: [],
      owned: { ...rich.owned, helper: 0 },
    };
    const hired = applyMove(
      idle,
      { kind: "buyTiers", id: "helper", count: 3 },
      NOW,
    );
    expect(hired.kind === "applied" && hired.mountain.owned.helper).toBe(3);
    expect(hired.kind === "applied" && hired.mountain.taught).toContain(
      "staffing",
    );
  });

  it("marks staffing taught when the first worker is hired beside an idle machine", () => {
    const idle: Mountain = {
      ...rich,
      engineers: [],
      owned: { ...rich.owned, helper: 0 },
    };
    expect(showsDot(idle, "staffing")).toBe(true);
    const hired = applyMove(idle, { kind: "buyTier", id: "helper" }, NOW);
    expect(hired.kind === "applied" && hired.mountain.taught).toContain(
      "staffing",
    );
  });

  it("marks tending taught on a real station, and refuses a station that changes nothing", () => {
    const moved = applyMove(
      rich,
      { kind: "station", index: 0, post: "camp" },
      NOW,
    );
    expect(moved.kind === "applied" && moved.mountain.taught).toContain(
      "tending",
    );
    // No engineer at that index: nothing changes, so nothing is marked either.
    expect(
      applyMove(rich, { kind: "station", index: 9, post: "camp" }, NOW),
    ).toEqual({ kind: "refused" });
  });

  it("calls a party back before stationing its engineer, so no expedition is left without them", () => {
    const moved = applyMove(
      travelling,
      { kind: "station", index: 0, post: "camp" },
      NOW,
    );
    expect(moved.kind).toBe("applied");
    if (moved.kind !== "applied") return;
    expect(moved.mountain.expeditions).toEqual([]);
    expect(moved.mountain.engineers[0]?.post).toBe("camp");
    expect(moved.mountain.taught).toContain("tending");
  });

  it("marks a sheet seen, and refuses a mark already made", () => {
    const seen = applyMove(fresh, { kind: "markSeen", id: "workshop" }, NOW);
    expect(seen.kind).toBe("applied");
    if (seen.kind !== "applied") return;
    expect(seen.mountain.seen).toContain("workshop");
    expect(
      applyMove(seen.mountain, { kind: "markSeen", id: "workshop" }, NOW),
    ).toEqual({ kind: "refused" });
    const all = applyMove(
      fresh,
      { kind: "markAllSeen", ids: ["workshop", "engineers"] },
      NOW,
    );
    expect(all.kind === "applied" && all.mountain.seen).toEqual([
      "workshop",
      "engineers",
    ]);
  });

  const eventsOf = (mountain: Mountain, move: Move) => {
    const result = applyMove(mountain, move, NOW);
    return result.kind === "applied" ? result.events : undefined;
  };

  it("says what a buy and an upgrade did", () => {
    expect(eventsOf(rich, { kind: "buyTier", id: "cart" })).toEqual([
      { kind: "tierBought", id: "cart", count: rich.owned.cart + 1 },
    ]);
    expect(eventsOf(rich, upgradeAt(rich, "boots"))).toEqual([
      { kind: "upgradeBought", id: "boots", level: 1 },
    ]);
  });

  it("names the promoted engineer and the crew size", () => {
    expect(eventsOf(rich, promoteAt(rich))).toEqual([
      { kind: "promoted", name: "Nils", crew: 2 },
    ]);
  });

  it("charges an upgrade and a promotion only at the price that was shown (#367)", () => {
    const topsoil = rich;
    const bootsShown = upgradePrice(topsoil, "boots") ?? [];
    const promoteShown = promotePrice(topsoil);
    const boots = {
      kind: "buyUpgrade",
      id: "boots",
      price: bootsShown,
    } as const;
    const stepUp = { kind: "promote", price: promoteShown } as const;
    // A second engineer joined between the paint and the tap: the
    // promotion's dearer price is refused. A price that moved is refused.
    const joined: Mountain = {
      ...topsoil,
      engineers: [...topsoil.engineers, { ...ada, name: "Nils" }],
    };
    expect(promotePrice(joined)).not.toEqual(promoteShown);
    expect(applyMove(joined, stepUp, NOW)).toEqual({ kind: "refused" });
    const dearer = {
      ...boots,
      price: stonesPrice(priceAmount(bootsShown, "stones") + 1),
    } as const;
    expect(applyMove(topsoil, dearer, NOW)).toEqual({ kind: "refused" });
    // At the price he saw, it buys, and that is what it takes.
    const bought = applyMove(topsoil, boots, NOW);
    expect(bought.kind === "applied" && bought.spent.stones).toBe(
      priceAmount(bootsShown, "stones"),
    );
    // An upgrade with no level left has no price today: nothing it was
    // shown, not even a free price, buys it.
    const maxed: Mountain = { ...rich, upgrades: { ...NO_UPGRADES, boots: 1 } };
    for (const price of [[], UNSHOWN_PRICE, bootsShown]) {
      expect(
        applyMove(maxed, { kind: "buyUpgrade", id: "boots", price }, NOW),
      ).toEqual({ kind: "refused" });
    }
    // Every good of the shown price must match, not only the stones.
    const plusClay = {
      kind: "promote",
      price: [...promoteShown, { good: "clay", amount: 1 }],
    } as const;
    expect(applyMove(topsoil, plusClay, NOW)).toEqual({
      kind: "refused",
    });
    const promoted = applyMove(topsoil, stepUp, NOW);
    expect(promoted.kind === "applied" && promoted.spent.stones).toBe(
      priceAmount(promoteShown, "stones"),
    );
  });

  it("lists each upgrade and the promotion at today's price (#367)", () => {
    for (const action of listActions(rich, NOW)) {
      if (action.kind === "buyUpgrade") {
        expect(action.price).toEqual(
          stonesPrice(
            upgradeCost(
              upgradeById(action.id),
              upgradeLevel(rich, action.id),
            ) ?? Number.NaN,
          ),
        );
      }
      if (action.kind === "promote") {
        expect(action.price).toEqual(promotePrice(rich));
      }
    }
    expect(listActions(rich, NOW).some((a) => a.kind === "promote")).toBe(true);
  });

  it("promotes the first engineer from a mountain with no crew yet", () => {
    const bare: Mountain = {
      ...fresh,
      stock: { ...fresh.stock, stones: 1e15 },
      owned: { ...fresh.owned, helper: 2, borer: 1 },
    };
    expect(bare.engineers).toEqual([]);
    expect(eventsOf(bare, promoteAt(bare))).toEqual([
      { kind: "promoted", name: "Ada", crew: 1 },
    ]);
  });

  it("says who left for which tunnel", () => {
    expect(
      eventsOf(rich, { kind: "send", index: 0, tunnel: "old-shaft" }),
    ).toEqual([{ kind: "sent", name: "Ada", tunnel: "old-shaft" }]);
  });

  it("recalls a party without stationing them, and a station from a tunnel recalls first", () => {
    expect(eventsOf(travelling, { kind: "recall", index: 0 })).toEqual([
      { kind: "recalled", name: "Ada", tunnel: "old-shaft" },
    ]);
    expect(
      eventsOf(travelling, { kind: "station", index: 0, post: "camp" }),
    ).toEqual([
      { kind: "recalled", name: "Ada", tunnel: "old-shaft" },
      { kind: "stationed", name: "Ada", post: "camp" },
    ]);
    // Ada's home is the borer: stationing there is the recall alone.
    expect(
      eventsOf(travelling, { kind: "station", index: 0, post: "borer" }),
    ).toEqual([{ kind: "recalled", name: "Ada", tunnel: "old-shaft" }]);
  });

  it("says nothing for a seen mark or a cancelled craft", () => {
    expect(eventsOf(fresh, { kind: "markSeen", id: "workshop" })).toEqual([]);
    // A save's craft (the old bench never opens in play, #740).
    const crafting = benchCraft(
      pay(rich, recipePrice("sturdy-props")),
      "sturdy-props",
      NOW,
    );
    expect(eventsOf(crafting, { kind: "cancelCraft" })).toEqual([]);
  });

  it("gives the lab's applyAction the same mountain for every listed move", () => {
    for (const action of listActions(rich, NOW, trouble)) {
      const moved = applyMove(rich, action, NOW);
      expect(applyAction(rich, action, NOW)).toEqual(
        moved.kind === "applied" ? moved.mountain : rich,
      );
    }
  });
});
