import { EMPTY_STOCK, priceAmount, stonesPrice, UNSHOWN_PRICE } from "../stock";
import { RUSH_MS } from "../gold-rush";
import { describe, expect, it } from "vitest";
import { BOOSTS, boostById, buyBoost, boostLeft, NO_BOOSTS } from "../boosts";
import { buyCrew } from "../crew";
import {
  promote,
  promoteCost,
  promotePrice,
  staffForBuy,
  staffNeeded,
  station,
  type Engineer,
} from "../engineers";
import { recall, send } from "../expeditions";
import { markTaught, showsDot } from "../teach";
import type { Trouble } from "../hazards";
import { createMountain, mineByHand, type Mountain } from "../mountain";
import { minedMountain, patched, type MountainPatch } from "../test-fixtures";
import {
  AWAY_FULL_MS,
  AWAY_PAY_RATE,
  effectiveRates,
  paidAwayMs,
} from "../rates";
import {
  CART_SHOWN_AT,
  TIERS,
  owned,
  tierById,
  tierCost,
  tierQuote,
  type TierId,
} from "../tiers";
import {
  BOOTS_SPEED_PER_LEVEL,
  STEADY_AWAY_PER_LEVEL,
  SYNERGY_PER_UNIT,
  TAP_SHARE_PER_LEVEL,
  buyUpgrade,
  upgradeById,
  upgradeCost,
  upgradeLevel,
  upgradePrice,
  type UpgradeId,
  NO_UPGRADES,
} from "../upgrades";
import { MATERIAL_EVERY, EMPTY_MATERIALS } from "../layers";
import { lineRating } from "../line";
import { BAND_SCALE, minedOut, oneOffStretch } from "../scale";
import {
  MAX_CRAFTED_LEVEL,
  cancelCraft,
  recipeById,
  recipePrice,
  recipesForMined,
  startCraft,
  NOTHING_CRAFTED,
} from "../workshop";
import {
  applyAction,
  applyMove,
  buyEveryBoost,
  buyWithTeach,
  listActions,
  sinkRecipes,
  valueOf,
  type Action,
  type Move,
  type ValueContext,
} from "./actions";

const NOW = 1_700_000_000_000;
const HORIZON = 6 * 60 * 60;

/** At the mountain the whole time, never tapping. Income is the unrounded crew. */
const LIVE: ValueContext = {
  tapsPerSecond: 0,
  liveSeconds: 1,
  awaySeconds: 0,
};

/** One session and the gap before the next, as the pacing dad plays it. */
const SESSION_S = 10 * 60;
const GAP_S = 12 * 60 * 60 - SESSION_S;
const CASUAL: ValueContext = {
  tapsPerSecond: 3,
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
  buyUpgrade: { kind: "buyUpgrade", id: "tap", price: [] },
  buyBoost: { kind: "buyBoost", id: "sharper" },
  promote: { kind: "promote", price: [] },
  station: { kind: "station", index: 0, post: "drill" },
  send: { kind: "send", index: 0, tunnel: "old-shaft" },
  recall: { kind: "recall", index: 0 },
  fixTrouble: { kind: "fixTrouble", tier: "borer", startedAt: NOW },
  craft: { kind: "craft", recipe: "iron-rails" },
  cancelCraft: { kind: "cancelCraft" },
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
    case "buyBoost":
      return buyBoost({
        mountain,
        id: action.id,
        now,
        pricing: effectiveRates(mountain),
      });
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
    case "craft": {
      const known = mountain.recipes;
      const depth = recipesForMined(minedOut(mountain));
      const prepared =
        known.includes(action.recipe) || !depth.includes(action.recipe)
          ? mountain
          : { ...mountain, recipes: [...known, action.recipe] };
      const started = startCraft(prepared, action.recipe, now);
      return started === prepared ? mountain : started;
    }
    case "cancelCraft":
      return cancelCraft(mountain, now);
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

/** Spare hands, as `pacing.ts` `bestValue` counts them. */
function freeHelpers(mountain: Mountain): number {
  const rates = effectiveRates(mountain);
  return (
    mountain.owned.helper +
    mountain.owned.kid -
    TIERS.reduce(
      (used, tier) =>
        used + rates.running[tier.id] * staffNeeded(mountain, tier),
      0,
    )
  );
}

/**
 * Gain and cost `bestValue` would score for this tier today.
 * Workers: crew delta of one hire. Machines: the line's rise with one more
 * running, plus the workers still needed on the cost.
 */
function simTier(
  mountain: Mountain,
  id: TierId,
): { gain: number; cost: number } {
  const tier = tierById(id);
  const price = tierCost(tier, owned(mountain, tier));
  if (tier.staff === 0) {
    const bought = buyCrew(
      { ...mountain, stock: { ...mountain.stock, stones: price } },
      id,
    );
    return {
      gain:
        effectiveRates(bought).exactCrewPerSecond -
        effectiveRates(mountain).exactCrewPerSecond,
      cost: price,
    };
  }
  const helper = tierById("helper");
  const short = Math.max(
    0,
    staffForBuy(mountain, tier) - freeHelpers(mountain),
  );
  let crewCost = 0;
  for (let extra = 0; extra < short; extra += 1) {
    crewCost += tierCost(helper, mountain.owned.helper + extra);
  }
  // What the line gains with one more running (#536), with hands enough
  // that every machine owned and the new one all run. A mark it crosses
  // speeds up every one already owned too.
  const pad = TIERS.reduce(
    (total, item) =>
      total + (owned(mountain, item) + 1) * staffNeeded(mountain, item),
    0,
  );
  const rested = patched(mountain, {
    owned: { helper: mountain.owned.helper + pad },
  });
  const running = patched(rested, { owned: { [id]: owned(rested, tier) + 1 } });
  return {
    gain:
      effectiveRates(running).exactCrewPerSecond -
      effectiveRates(rested).exactCrewPerSecond,
    cost: price + crewCost,
  };
}

function crewDelta(before: Mountain, after: Mountain): number {
  return (
    effectiveRates(after).crewPerSecond - effectiveRates(before).crewPerSecond
  );
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

/**
 * A Granite crew whose train and Great Machine outrun its face, so the face
 * holds the line and Ada's borer, a jam on it, and her trips all count (#536).
 */
const rich: Mountain = {
  ...minedMountain(25_000_000),
  owned: {
    ...minedMountain(25_000_000).owned,
    helper: 48,
    cart: 4,
    drill: 2,
    borer: 1,
    train: 1,
    machine: 1,
  },
  stock: { ...minedMountain(25_000_000).stock, stones: 1e15, ...STOCK },
  engineers: [ada],
};
const broke: Mountain = { ...rich, stock: { ...rich.stock, stones: 0 } };
const travelling = send(rich, 0, "old-shaft", NOW);
/** A train is owned, so the Great Machine shows, but it is still locked. */
const lockedMachine: Mountain = {
  ...minedMountain(24_999_999),
  owned: {
    ...minedMountain(24_999_999).owned,
    helper: 18,
    cart: 1,
    drill: 1,
    borer: 1,
    train: 1,
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
  it("offers only the first worker on a new mountain, and the rest as the crew grows", () => {
    const names = (mountain: Mountain) =>
      listActions(mountain, NOW).map((action) =>
        "id" in action ? `${action.kind}:${action.id}` : action.kind,
      );
    expect(names(fresh)).toEqual(["buyTier:helper"]);
    // A full pocket opens nothing (#250); the crew it owns does.
    expect(
      names({ ...fresh, stock: { ...fresh.stock, stones: 1e12 } }),
    ).toEqual(["buyTier:helper"]);
    expect(
      names({ ...fresh, owned: { ...fresh.owned, helper: 1, cart: 3 } }),
    ).toEqual(
      expect.arrayContaining([
        "buyUpgrade:tap",
        "buyUpgrade:steady",
        "buyBoost:sharper",
      ]),
    );
    expect(
      names({ ...fresh, owned: { ...fresh.owned, helper: 1, cart: 3 } }),
    ).not.toContain("buyBoost:overtime");
  });

  it("shows the next tier once the previous one is owned, and hides a locked one", () => {
    const listsCart = (mountain: Mountain) =>
      listActions(mountain, NOW).some(
        (action) => action.kind === "buyTier" && action.id === "cart",
      );
    // The cart waits for eight workers (#536).
    expect(listsCart(withHelper)).toBe(false);
    expect(
      listsCart({
        ...withHelper,
        owned: { ...withHelper.owned, helper: CART_SHOWN_AT },
      }),
    ).toBe(true);
    const locked = listActions(lockedMachine, NOW).filter(
      (action) => action.kind === "buyTier",
    );
    expect(locked.map((action) => action.id)).not.toContain("machine");
    expect(locked.map((action) => action.id)).toContain("borer");
  });

  it("lists a kid once the Crown is found and a machine is owned", () => {
    const ids = listActions(crowned, NOW)
      .filter((action) => action.kind === "buyTier")
      .map((action) => action.id);
    expect(ids).toContain("kid");
    expect(ids).toContain("machine");
  });

  it("keeps unaffordable buys and drops a maxed upgrade or a running boost", () => {
    const offers = listActions(broke, NOW);
    expect(offers.some((action) => action.kind === "buyTier")).toBe(true);
    expect(offers.some((action) => action.kind === "promote")).toBe(true);
    const maxed: Mountain = { ...rich, upgrades: { ...NO_UPGRADES, tap: 10 } };
    expect(
      listActions(maxed, NOW).some(
        (action) => action.kind === "buyUpgrade" && action.id === "tap",
      ),
    ).toBe(false);
    const running: Mountain = {
      ...rich,
      boosts: { sharper: NOW + 60_000, overtime: NOW + 60_000 },
    };
    expect(
      listActions(running, NOW).some((action) => action.kind === "buyBoost"),
    ).toBe(false);
    expect(boostLeft(running, "sharper", NOW)).toBeGreaterThan(0);
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
    expect(withTrouble.at(-1)).toEqual({
      kind: "fixTrouble",
      tier: "borer",
      startedAt: NOW,
    });
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
        action.kind === "buyBoost" ||
        action.kind === "promote"
      ) {
        expect(applyAction(broke, action, NOW)).toBe(broke);
      }
    }
  });

  it("brings Ada with the first borer, the same as buyCrew", () => {
    const funded: Mountain = {
      ...fresh,
      ...minedMountain(10_000_000),
      owned: { ...minedMountain(10_000_000).owned, drill: 1, helper: 8 },
      stock: { ...fresh.stock, stones: 10_000_000 },
    };
    const bought = applyAction(funded, { kind: "buyTier", id: "borer" }, NOW);
    expect(bought.owned.borer).toBe(1);
    expect(bought.engineers[0]?.name).toBe("Ada");
    expect(bought.engineers[0]?.post).toBe("borer");
    expect(bought).toEqual(buyCrew(funded, "borer"));
  });
});

describe("valueOf", () => {
  // valueOf reads no price: the buys here carry 0 (#367).
  it("matches bestValue for every listed tier", () => {
    const mountains = [fresh, withHelper, rich, broke, lockedMachine, crowned];
    for (const mountain of mountains) {
      for (const action of listActions(mountain, NOW)) {
        if (action.kind !== "buyTier") {
          continue;
        }
        const expected = simTier(mountain, action.id);
        const value = score(mountain, action, HORIZON);
        // A tender's 9% floor moves the marginal a little off the bare tier.
        const gap = Math.abs(value.gainPerSec - expected.gain);
        expect(gap).toBeLessThanOrEqual(0.15 * expected.gain + 1e-9);
        expect(value.cost).toBe(expected.cost);
        expect(score(mountain, action, 60).gainPerSec).toBe(value.gainPerSec);
      }
    }
  });

  it("scores a worker by the crew they add, including an idle machine they start", () => {
    const worker = tierCost(tierById("helper"), 0);
    expect(score(fresh, FIXTURES.buyTier, HORIZON)).toMatchObject({
      gainPerSec: 1,
      cost: worker,
      paybackSec: Number.POSITIVE_INFINITY,
    });
    const covered = score(
      { ...fresh, stock: { ...fresh.stock, stones: worker } },
      FIXTURES.buyTier,
      HORIZON,
    );
    expect(covered.paybackSec).toBe(worker);
    // 25 workers run the Great Machine, the borer and the cart; the train
    // waits. Past the workers' first mark each hand moves 2, so 6 on one
    // job: the haul's one cart (18) holds the line, lifted by 150.
    const idleDrill: Mountain = {
      ...fresh,
      owned: {
        ...fresh.owned,
        helper: 25,
        cart: 1,
        borer: 1,
        train: 1,
        machine: 1,
      },
    };
    const hired = score(idleDrill, { kind: "buyTier", id: "helper" }, HORIZON);
    // The 26th starts the train and the cart loses its hand: the face (one
    // borer, 1,071) holds the line now, lifted by 156.
    expect(hired.gainPerSec).toBe(1_071 + 6 * 26 - (18 + 6 * 25));
    expect(hired.cost).toBe(tierCost(tierById("helper"), 25));
    expect(hired.paybackSec).toBe(
      hired.cost / effectiveRates(idleDrill).crewPerSecond +
        hired.cost / hired.gainPerSec,
    );
  });

  it("bundles the workers a machine still needs, and ignores the first engineer's tend", () => {
    // At 10M the borer is in the Granite, which suits it (×1.1). A train
    // and a Great Machine outrun the face, so a borer adds all its 1,178.1.
    const bare: Mountain = {
      ...fresh,
      ...minedMountain(10_000_000),
      owned: {
        ...minedMountain(10_000_000).owned,
        drill: 1,
        train: 1,
        machine: 1,
      },
    };
    const borer = score(bare, { kind: "buyTier", id: "borer" }, HORIZON);
    expect(borer.gainPerSec).toBeCloseTo(1_071 * 1.1, 8);
    const sticker = tierCost(tierById("borer"), 0);
    expect(borer.cost).toBeGreaterThan(sticker);
    const staffed: Mountain = {
      ...bare,
      stock: { ...bare.stock, stones: 0 },
      // 19 run the drill, the train and the machine: 8 free.
      owned: { ...bare.owned, helper: 27 },
    };
    const tended = score(staffed, { kind: "buyTier", id: "borer" }, HORIZON);
    expect(tended.gainPerSec).toBeCloseTo(1_071 * 1.1, 8);
    expect(tended.cost).toBe(sticker);
    const applied = buyCrew(
      { ...staffed, stock: { ...staffed.stock, stones: 10_000_000 } },
      "borer",
    );
    // On the line the first borer and Ada's tend (×1.21875) both count.
    expect(crewDelta(staffed, applied)).toBe(
      Math.floor(86.4 + 1_071 * 1.1 * 1.21875 + 3 * 27) -
        Math.floor(86.4 + 3 * 27),
    );

    // Nine borers and four trains outrun any lift, so a first Great
    // Machine adds all it moves.
    const hammer: Mountain = {
      ...minedMountain(120_000_000),
      owned: {
        ...minedMountain(120_000_000).owned,
        // Two hands run the cart and the drill: none is free.
        helper: 2,
        cart: 1,
        drill: 1,
        borer: 9,
        train: 4,
      },
      stock: { ...minedMountain(120_000_000).stock, stones: 0 },
      engineers: [ada],
    };
    const machine = score(hammer, { kind: "buyTier", id: "machine" }, HORIZON);
    expect(staffForBuy(hammer, tierById("machine"))).toBe(5);
    // 6,930 in the Deep Heart (its 2,100 rated ×3, and ×1.1 for the band).
    expect(machine.gainPerSec).toBeCloseTo(6_930, 6);
    let bill = 0;
    for (let extra = 0; extra < 5; extra += 1) {
      bill += tierCost(tierById("helper"), hammer.owned.helper + extra);
    }
    expect(machine.cost).toBe(tierById("machine").firstCost + bill);
  });

  it("scores a second cart plus the one worker it needs", () => {
    const idle: Mountain = { ...fresh, owned: { ...fresh.owned, cart: 1 } };
    const value = score(idle, { kind: "buyTier", id: "cart" }, HORIZON);
    expect(value.gainPerSec).toBe(6);
    // The second cart, plus the worker it needs.
    expect(value.cost).toBe(
      tierCost(tierById("cart"), 1) + tierCost(tierById("helper"), 0),
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
          oneOffStretch(mountain),
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

  it("keeps a fraction of a stone and only the carts that run", () => {
    const ten: Mountain = {
      ...fresh,
      owned: { ...fresh.owned, helper: 10, cart: 5 },
    };
    // The carts run the haul; the hands share the face and the lift, so
    // the line rises by half of what their three jobs' worth adds (#536).
    const boots = score(ten, { kind: "buyUpgrade", id: "boots", price: [] });
    expect(boots.gainPerSec).toBeCloseTo(
      (3 * 10 * effectiveRates(ten).tierSpeed.helper * BOOTS_SPEED_PER_LEVEL) /
        2,
      8,
    );

    const eleven: Mountain = {
      ...fresh,
      owned: { ...fresh.owned, helper: 11 },
    };
    expect(
      score(eleven, { kind: "buyUpgrade", id: "boots", price: [] }).gainPerSec,
    ).toBeCloseTo(11 * BOOTS_SPEED_PER_LEVEL, 10);
    const quietSchedule: ValueContext = {
      tapsPerSecond: 0,
      liveSeconds: 0,
      awaySeconds: 0,
    };
    expect(
      score(
        eleven,
        { kind: "buyUpgrade", id: "boots", price: [] },
        HORIZON,
        quietSchedule,
      ).gainPerSec,
    ).toBeCloseTo(11 * BOOTS_SPEED_PER_LEVEL, 10);

    const heir: Mountain = { ...ten, legacy: 1 };
    expect(
      score(heir, { kind: "buyUpgrade", id: "boots", price: [] }).gainPerSec,
    ).toBeCloseTo(
      (3 * 10 * effectiveRates(heir).tierSpeed.helper * BOOTS_SPEED_PER_LEVEL) /
        2,
      8,
    );

    // Cart synergy lifts the line only where the haul holds it (#536): a
    // borer and a Great Machine run the face and the lift here.
    const cartSyn = { kind: "buyUpgrade", id: "cartSyn", price: [] } as const;
    const cartSpeed = tierById("cart").perSecond * lineRating("cart");
    const hauling: Mountain = {
      ...fresh,
      owned: { ...fresh.owned, helper: 23, cart: 5, borer: 1, machine: 1 },
    };
    expect(score(hauling, cartSyn).gainPerSec).toBeCloseTo(
      23 * SYNERGY_PER_UNIT * 5 * cartSpeed,
      8,
    );
    // Two workers fewer: three carts run, and only those count.
    const short: Mountain = {
      ...hauling,
      owned: { ...hauling.owned, helper: 21 },
    };
    expect(effectiveRates(short).running.cart).toBe(3);
    expect(score(short, cartSyn).gainPerSec).toBeCloseTo(
      21 * SYNERGY_PER_UNIT * 3 * cartSpeed,
      8,
    );
    // Where the haul has room to spare, it adds nothing.
    expect(score(ten, cartSyn).gainPerSec).toBe(0);
  });

  it("pays Strong arms for taps, Steady hands for time away, and Sharper picks for both", () => {
    const tapping: ValueContext = {
      tapsPerSecond: 3,
      liveSeconds: 1,
      awaySeconds: 0,
    };
    const arms = { kind: "buyUpgrade", id: "tap", price: [] } as const;
    const crew: Mountain = {
      ...fresh,
      owned: { ...fresh.owned, helper: 100, cart: 3 },
    };
    expect(score(crew, arms, HORIZON, tapping).gainPerSec).toBeGreaterThan(0);
    expect(score(crew, arms, HORIZON, LIVE).gainPerSec).toBe(0);
    const small: Mountain = {
      ...fresh,
      owned: { ...fresh.owned, helper: 10, cart: 3 },
    };
    expect(score(small, arms, HORIZON, tapping).gainPerSec).toBe(0);

    const yard: Mountain = {
      ...fresh,
      owned: { ...fresh.owned, helper: 10, cart: 1 },
    };
    const steady = { kind: "buyUpgrade", id: "steady", price: [] } as const;
    const aMinute: ValueContext = {
      tapsPerSecond: 0,
      liveSeconds: 0,
      awaySeconds: 60,
    };
    expect(score(yard, steady, HORIZON, aMinute).gainPerSec).toBeGreaterThan(0);
    expect(score(yard, steady, HORIZON, LIVE).gainPerSec).toBe(0);
    const week: ValueContext = {
      tapsPerSecond: 0,
      liveSeconds: 0,
      awaySeconds: 7 * 24 * 60 * 60,
    };
    const atCap: ValueContext = {
      tapsPerSecond: 0,
      liveSeconds: 0,
      awaySeconds: AWAY_FULL_MS / 1000,
    };
    expect(score(yard, steady, HORIZON, week).gainPerSec).toBeLessThan(
      score(yard, steady, HORIZON, atCap).gainPerSec,
    );

    const sharper = { kind: "buyBoost", id: "sharper" } as const;
    expect(score(small, sharper, 10 * 60, tapping).gainPerSec).toBeGreaterThan(
      0,
    );
    expect(score(small, sharper, 10 * 60, LIVE).gainPerSec).toBe(0);
  });

  it("spreads a boost across the horizon and leaves a permanent gain alone", () => {
    const crew: Mountain = {
      ...fresh,
      stock: { ...fresh.stock, stones: 1e15 },
      owned: { ...fresh.owned, helper: 10 },
    };
    const overtime = { kind: "buyBoost", id: "overtime" } as const;
    const full = score(crew, overtime, 30 * 60);
    const half = score(crew, overtime, 60 * 60);
    expect(full.gainPerSec).toBe(10);
    expect(half.gainPerSec).toBe(5);
    // Its crew seconds' worth of a 10-a-second crew.
    const price = boostById("overtime").priceUnits * 10;
    expect(full.cost).toBe(price);
    expect(full.paybackSec).toBe(price / 10);
    expect(score(crew, overtime, Number.POSITIVE_INFINITY).gainPerSec).toBe(0);
    expect(score(crew, FIXTURES.buyTier, 0).gainPerSec).toBe(1);
    const queued: Mountain = {
      ...crew,
      boosts: { sharper: 5_000, overtime: 1_000 },
    };
    expect(score(queued, overtime, 30 * 60).gainPerSec).toBe(full.gainPerSec);
    const sharper = score(crew, { kind: "buyBoost", id: "sharper" }, 60 * 60);
    expect(sharper.gainPerSec).toBe(0);
    expect(sharper.paybackSec).toBe(Number.POSITIVE_INFINITY);
  });

  it("does not let a running boost change a tier's score", () => {
    const plain = score(withHelper, { kind: "buyTier", id: "helper" }, HORIZON);
    const boosted = score(
      { ...withHelper, boosts: { ...NO_BOOSTS, overtime: NOW + 60_000 } },
      { kind: "buyTier", id: "helper" },
      HORIZON,
    );
    expect(boosted).toEqual(plain);
  });

  it("values a fix as the crew speed trouble was holding back", () => {
    const slowed = effectiveRates(rich, NOW, trouble).exactCrewPerSecond;
    const clear = effectiveRates(rich, NOW).exactCrewPerSecond;
    const value = score(rich, FIXTURES.fixTrouble, HORIZON);
    expect(value.gainPerSec).toBeCloseTo(clear - slowed, 8);
    expect(value.cost).toBe(0);
    expect(value.paybackSec).toBe(0);
    expect(applyAction(rich, FIXTURES.fixTrouble, NOW)).toBe(rich);
  });

  it("reports a loss as an infinite payback", () => {
    const moved = score(
      rich,
      { kind: "station", index: 0, post: "camp" },
      HORIZON,
    );
    expect(moved.gainPerSec).toBeLessThan(0);
    expect(moved.cost).toBe(0);
    expect(moved.paybackSec).toBe(Number.POSITIVE_INFINITY);
    const home = score(
      { ...rich, engineers: [{ ...ada, post: "camp" }] },
      { kind: "station", index: 0, post: "borer" },
      HORIZON,
    );
    expect(home.gainPerSec).toBeGreaterThan(0);
    expect(home.paybackSec).toBe(0);
  });

  it("scores promote, send, and recall from the crew before and after", () => {
    const stepUp = score(rich, { kind: "promote", price: [] }, HORIZON);
    // 25M mined is the Granite: one-off buys cost its band scale (#356).
    expect(stepUp.cost).toBe(promoteCost(rich));
    expect(oneOffStretch(rich)).toBe(BAND_SCALE[1]);
    expect(stepUp.gainPerSec).toBeGreaterThan(0);
    expect(stepUp.paybackSec).toBeGreaterThan(0);
    expect(Number.isFinite(stepUp.paybackSec)).toBe(true);
    const trip = score(
      rich,
      { kind: "send", index: 0, tunnel: "old-shaft" },
      HORIZON,
    );
    expect(trip.gainPerSec).toBeGreaterThan(0);
    // Leaving the borers costs the tending she skips. The find does not
    // pay that back at once.
    expect(trip.cost).toBeGreaterThan(0);
    expect(trip.paybackSec).toBeGreaterThan(0);
    const back = score(
      travelling,
      { kind: "recall", index: 0 },
      HORIZON,
      LIVE,
      NOW + 60_000,
    );
    expect(back.gainPerSec).toBeGreaterThan(0);
    expect(back.cost).toBeGreaterThan(0);
    expect(Number.isFinite(back.paybackSec)).toBe(true);
    const early = score(
      travelling,
      { kind: "recall", index: 0 },
      HORIZON,
      LIVE,
      0,
    );
    const late = score(
      travelling,
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
        { ...rich, owned: { ...rich.owned, helper: 0 } },
        { kind: "promote", price: [] },
        HORIZON,
      ).gainPerSec,
    ).toBe(0);
    expect(
      score(rich, { kind: "promote", price: [] }, 0).gainPerSec,
    ).toBeGreaterThan(0);
    const home: Mountain = {
      ...rich,
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
    const idleRecall = score(rich, { kind: "recall", index: 0 }, 0);
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
      { ...rich, upgrades: { ...NO_UPGRADES, tap: 10 } },
      { kind: "buyUpgrade", id: "tap", price: [] },
      HORIZON,
    );
    expect(maxed.gainPerSec).toBe(0);
    expect(maxed.cost).toBe(0);
  });

  it("matches the casual dad's stones a day, and shows where the upgrade dad's hand formulas differ", () => {
    const cycle = SESSION_S + GAP_S;
    const perDay = (gainPerSec: number) => gainPerSec * cycle * 2;
    const paidGapS = paidAwayMs(fresh, GAP_S * 1000) / 1000;
    const crewDay = 2 * (SESSION_S + paidGapS * AWAY_PAY_RATE);
    const tapDay = 2 * SESSION_S;

    const worker = score(
      fresh,
      { kind: "buyTier", id: "helper" },
      HORIZON,
      CASUAL,
    );
    expect(perDay(worker.gainPerSec)).toBeCloseTo(crewDay, 4);

    const eleven: Mountain = {
      ...fresh,
      owned: { ...fresh.owned, helper: 11 },
    };
    const boots = score(
      eleven,
      { kind: "buyUpgrade", id: "boots", price: [] },
      HORIZON,
      CASUAL,
    );
    expect(perDay(boots.gainPerSec)).toBeCloseTo(
      11 * BOOTS_SPEED_PER_LEVEL * crewDay,
      4,
    );

    const yard: Mountain = {
      ...fresh,
      owned: { ...fresh.owned, helper: 10, cart: 1 },
    };
    const steady = score(
      yard,
      { kind: "buyUpgrade", id: "steady", price: [] },
      HORIZON,
      CASUAL,
    );
    const steadyHand =
      effectiveRates(yard).exactCrewPerSecond *
      AWAY_PAY_RATE *
      STEADY_AWAY_PER_LEVEL *
      2 *
      paidGapS;
    expect(perDay(steady.gainPerSec)).toBeCloseTo(steadyHand, 4);

    const small: Mountain = { ...fresh, owned: { ...fresh.owned, helper: 50 } };
    const arms = score(
      small,
      { kind: "buyUpgrade", id: "tap", price: [] },
      HORIZON,
      CASUAL,
    );
    expect(arms.gainPerSec).toBe(0);
    expect(
      effectiveRates(small).exactCrewPerSecond * TAP_SHARE_PER_LEVEL,
    ).toBeCloseTo(3.3, 6);

    // Carts and hoists run the haul and the lift; the hands' 72 go to the
    // empty face, a crew big enough for a stronger tap.
    const hundred: Mountain = {
      ...fresh,
      owned: { ...fresh.owned, helper: 24, cart: 9, hoist: 2 },
    };
    const bigArms = score(
      hundred,
      { kind: "buyUpgrade", id: "tap", price: [] },
      HORIZON,
      CASUAL,
    );
    expect(perDay(bigArms.gainPerSec)).toBeCloseTo(
      CASUAL.tapsPerSecond * tapDay,
      4,
    );

    // The haul holds the line, and 21 workers run three of five carts:
    // synergy counts those three, never the idle two (#536).
    const idle: Mountain = {
      ...fresh,
      owned: { ...fresh.owned, helper: 21, cart: 5, borer: 1, machine: 1 },
    };
    const hands = score(
      idle,
      { kind: "buyUpgrade", id: "cartSyn", price: [] },
      HORIZON,
      CASUAL,
    );
    const each =
      21 * SYNERGY_PER_UNIT * tierById("cart").perSecond * lineRating("cart");
    expect(perDay(hands.gainPerSec)).toBeCloseTo(3 * each * crewDay, 3);
    expect(perDay(hands.gainPerSec)).not.toBeCloseTo(5 * each * crewDay, 3);

    const sharper = score(
      fresh,
      { kind: "buyBoost", id: "sharper" },
      HORIZON,
      CASUAL,
    );
    expect(sharper.gainPerSec).toBeGreaterThan(0);
  });

  it("values gear, timers, and reinforce, and keeps a refund off the table", () => {
    const shed = (extra: MountainPatch = {}): Mountain =>
      patched(
        {
          ...minedMountain(12_000_000),
          owned: {
            ...minedMountain(12_000_000).owned,
            helper: 8,
            cart: 2,
            drill: 1,
            borer: 1,
          },
          stock: { ...minedMountain(12_000_000).stock, stones: 1e15, ...STOCK },
          engineers: [ada],
        },
        extra,
      );
    const quiet: ValueContext = {
      tapsPerSecond: 0,
      liveSeconds: 0,
      awaySeconds: 0,
    };

    expect(
      listActions(fresh, NOW).some((action) => action.kind === "craft"),
    ).toBe(false);
    expect(sinkRecipes(shed())).toContain("reinforce");
    expect(sinkRecipes(shed()).includes("crystal-lamp")).toBe(false);
    const withLamp = shed({
      recipes: [...shed().recipes, "crystal-lamp", "engineers-kit"],
    });
    expect(
      listActions(withLamp, NOW).some(
        (action) => action.kind === "craft" && action.recipe === "crystal-lamp",
      ),
    ).toBe(true);
    expect(
      sinkRecipes(shed({ crafted: { ...NOTHING_CRAFTED, "iron-rails": 3 } })),
    ).not.toContain("iron-rails");
    expect(
      sinkRecipes(
        shed({
          crafted: { ...NOTHING_CRAFTED, "blasting-charge": MAX_CRAFTED_LEVEL },
        }),
      ),
    ).not.toContain("blasting-charge");

    // A borer and a hoist run the face and the lift, so the haul (two
    // carts) holds the line and rails lift it (#536).
    const yard = shed({
      engineers: [],
      owned: { helper: 11, drill: 0, borer: 1, hoist: 1 },
    });
    const rails = score(yard, { kind: "craft", recipe: "iron-rails" });
    expect(rails.gainPerSec).toBeGreaterThan(0);
    const railsBill = recipePrice("iron-rails");
    // Iron is priced by its best other use over the horizon, never by the
    // stones it took to dig: a shorter horizon prices it lower. (On the line
    // Reinforce is worth more than the digging, so no bound by dig cost.)
    expect(rails.cost).toBeGreaterThanOrEqual(priceAmount(railsBill, "stones"));
    expect(rails.cost).not.toBe(
      priceAmount(railsBill, "stones") +
        priceAmount(railsBill, "iron") * MATERIAL_EVERY.iron,
    );
    expect(
      score(yard, { kind: "craft", recipe: "iron-rails" }, HORIZON / 2).cost,
    ).toBeLessThan(rails.cost);
    expect(rails.paybackSec).toBeCloseTo(
      rails.cost / rails.gainPerSec + recipeById("iron-rails").craftMs / 1000,
      5,
    );
    expect(
      score(fresh, { kind: "craft", recipe: "iron-rails" }).paybackSec,
    ).toBe(Number.POSITIVE_INFINITY);
    const noPocket = { ...yard, stock: { ...yard.stock, ...EMPTY_MATERIALS } };
    expect(
      score(noPocket, { kind: "craft", recipe: "iron-rails" }).gainPerSec,
    ).toBeGreaterThan(0);
    expect(
      score(yard, {
        kind: "craft",
        recipe: "iron-rails",
      }).gainPerSec,
    ).toBeGreaterThan(0);
    expect(
      score(
        { ...yard, crafted: { ...NOTHING_CRAFTED, "iron-rails": 3 } },
        { kind: "craft", recipe: "iron-rails" },
      ).gainPerSec,
    ).toBe(0);
    const busy = startCraft(shed(), "iron-rails", NOW);
    expect(
      score(
        busy,
        { kind: "craft", recipe: "blasting-charge" },
        HORIZON,
        LIVE,
        NOW,
      ).gainPerSec,
    ).toBe(0);

    // Reinforce speeds the Great Machine: borers and trains outrun the
    // lift here, so it lifts the line (#536).
    const armed = shed({
      owned: { helper: 80, cart: 0, drill: 0, borer: 6, train: 3, machine: 1 },
    });
    const reinforce = score(armed, { kind: "craft", recipe: "reinforce" });
    expect(reinforce.gainPerSec).toBeGreaterThan(0);
    const ironBill = recipePrice("reinforce");
    expect(priceAmount(ironBill, "stones")).toBe(0);
    // The iron could have gone into rails, so that is what it costs here.
    expect(reinforce.cost).toBeGreaterThan(0);
    // With no horizon to spend it in, the iron has no other use to price.
    expect(score(armed, { kind: "craft", recipe: "reinforce" }, 0).cost).toBe(
      0,
    );
    expect(reinforce.paybackSec).toBeGreaterThan(
      recipeById("reinforce").craftMs / 1000,
    );
    const hoist = score(armed, { kind: "buyTier", id: "hoist" });
    expect(hoist.paybackSec).toBeLessThan(reinforce.paybackSec);
    expect(
      score(shed({ owned: { cart: 0, drill: 0, borer: 0 } }), {
        kind: "craft",
        recipe: "reinforce",
      }).gainPerSec,
    ).toBe(0);

    const charge = { kind: "craft", recipe: "blasting-charge" } as const;
    const liveCharge = score(shed(), charge, HORIZON, LIVE);
    const awayCharge = score(shed(), charge, HORIZON, CASUAL);
    expect(liveCharge.gainPerSec).toBeGreaterThan(0);
    expect(awayCharge.gainPerSec).toBeGreaterThan(0);
    expect(liveCharge.gainPerSec).toBeGreaterThan(awayCharge.gainPerSec);

    const deep = shed({
      owned: { machine: 1, helper: 40 },
      recipes: [
        ...shed().recipes,
        "diamond-bits",
        "crystal-flare",
        "crystal-lamp",
        "engineers-kit",
        "heartstone-core",
        "heartstone-ember",
      ],
    });
    // Bits speed the drills, so they count where the face holds the line;
    // the core speeds the Great Machine, where the lift does (#536).
    const faceHolds = { ...deep, owned: { ...deep.owned, train: 1 } };
    expect(
      score(faceHolds, { kind: "craft", recipe: "diamond-bits" }).gainPerSec,
    ).toBeGreaterThan(0);
    const liftHolds = {
      ...deep,
      owned: { ...deep.owned, helper: 80, borer: 6, train: 3 },
    };
    expect(
      score(liftHolds, { kind: "craft", recipe: "heartstone-core" }).gainPerSec,
    ).toBeGreaterThan(0);
    // The ember warms the Great Machine too.
    expect(
      score(liftHolds, { kind: "craft", recipe: "heartstone-ember" })
        .gainPerSec,
    ).toBeGreaterThan(0);
    expect(
      score(deep, { kind: "craft", recipe: "crystal-flare" }, HORIZON, CASUAL)
        .gainPerSec,
    ).toBeGreaterThan(0);
    expect(
      score(deep, { kind: "craft", recipe: "crystal-lamp" }, HORIZON, quiet)
        .gainPerSec,
    ).toBeGreaterThan(0);
    expect(
      score(deep, { kind: "craft", recipe: "engineers-kit" }).gainPerSec,
    ).toBeGreaterThan(0);
    // Her kit is worth the same while she is out: the post calls her back (#415).
    const deepAway = send(deep, 0, "side-seam", 0);
    expect(deepAway.expeditions).toHaveLength(1);
    expect(
      score(deepAway, { kind: "craft", recipe: "engineers-kit" }).gainPerSec,
    ).toBe(score(deep, { kind: "craft", recipe: "engineers-kit" }).gainPerSec);
    const kitOnly = shed({
      recipes: [...shed().recipes, "engineers-kit"],
    });
    const noCrew = { ...kitOnly, engineers: [] };
    expect(
      score(noCrew, { kind: "craft", recipe: "engineers-kit" }).gainPerSec,
    ).toBe(0);
    const unwritten = { ...armed, recipes: [] };
    expect(
      score(unwritten, { kind: "craft", recipe: "reinforce" }).gainPerSec,
    ).toBeGreaterThan(0);
    expect(sinkRecipes(unwritten)).toContain("reinforce");
    expect(
      score(shed(), { kind: "craft", recipe: "sturdy-props" }).gainPerSec,
    ).toBeGreaterThan(0);
    expect(
      score(shed({ engineers: [], owned: { borer: 0 } }), {
        kind: "craft",
        recipe: "sturdy-props",
      }).gainPerSec,
    ).toBe(0);

    const refund = score(busy, { kind: "cancelCraft" }, HORIZON, LIVE, NOW);
    expect(refund.paybackSec).toBe(Number.POSITIVE_INFINITY);
    expect(refund.gainPerSec).toBe(0);
    const finishedAt = busy.bench?.endsAt ?? NOW;
    expect(
      score(busy, { kind: "cancelCraft" }, HORIZON, LIVE, finishedAt)
        .gainPerSec,
    ).toBe(0);
    expect(score(shed(), { kind: "cancelCraft" }).gainPerSec).toBe(0);
    // A bench whose time is up is collected by the store: no cancel, and no new craft yet.
    const benchMoves = (at: number) =>
      listActions(busy, at).filter(
        (action) => action.kind === "craft" || action.kind === "cancelCraft",
      );
    expect(benchMoves(NOW)).toEqual([{ kind: "cancelCraft" }]);
    expect(benchMoves(finishedAt)).toEqual([]);

    const granted = applyAction(
      shed(),
      { kind: "craft", recipe: "reinforce" },
      NOW,
    );
    expect(granted.recipes).toContain("reinforce");
    expect(granted.bench?.recipe).toBe("reinforce");
    const plain = shed();
    expect(
      applyAction(plain, { kind: "craft", recipe: "crystal-lamp" }, NOW),
    ).toBe(plain);
  });
});

describe("applyMove (#409)", () => {
  const calm = { trouble: undefined };

  it("applies a buy, with what it spent, and refuses one the pocket cannot pay", () => {
    const cart = { kind: "buyTier", id: "cart" } as const;
    const bought = applyMove(rich, cart, NOW, calm);
    expect(bought.kind).toBe("applied");
    if (bought.kind !== "applied") return;
    expect(bought.mountain.owned.cart).toBe(rich.owned.cart + 1);
    expect(bought.spent).toEqual({
      ...EMPTY_STOCK,
      stones: rich.stock.stones - bought.mountain.stock.stones,
    });
    expect(bought.gained).toEqual(EMPTY_STOCK);
    expect(applyMove(broke, cart, NOW, calm)).toEqual({ kind: "refused" });
  });

  it("buys several of a tier as one move, all or nothing (#358)", () => {
    const tenCarts = { kind: "buyTiers", id: "cart", count: 10 } as const;
    const quote = tierQuote(rich, tierById("cart"), "ten");
    const bought = applyMove(rich, tenCarts, NOW, calm);
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
    expect(applyMove(short, tenCarts, NOW, calm)).toEqual({ kind: "refused" });
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
      calm,
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
    const hired = applyMove(idle, { kind: "buyTier", id: "helper" }, NOW, calm);
    expect(hired.kind === "applied" && hired.mountain.taught).toContain(
      "staffing",
    );
  });

  it("marks tending taught on a real station, and refuses a station that changes nothing", () => {
    const moved = applyMove(
      rich,
      { kind: "station", index: 0, post: "camp" },
      NOW,
      calm,
    );
    expect(moved.kind === "applied" && moved.mountain.taught).toContain(
      "tending",
    );
    // No engineer at that index: nothing changes, so nothing is marked either.
    expect(
      applyMove(rich, { kind: "station", index: 9, post: "camp" }, NOW, calm),
    ).toEqual({ kind: "refused" });
  });

  it("calls a party back before stationing its engineer, so no expedition is left without them", () => {
    const moved = applyMove(
      travelling,
      { kind: "station", index: 0, post: "camp" },
      NOW,
      calm,
    );
    expect(moved.kind).toBe("applied");
    if (moved.kind !== "applied") return;
    expect(moved.mountain.expeditions).toEqual([]);
    expect(moved.mountain.engineers[0]?.post).toBe("camp");
    expect(moved.mountain.taught).toContain("tending");
  });

  it("digs with the trouble it is given: a slowed machine gives a tap less, never nothing", () => {
    const tapper: Mountain = { ...rich, upgrades: { ...NO_UPGRADES, tap: 5 } };
    const calmDig = applyMove(tapper, { kind: "dig" }, NOW, calm);
    const caveIn = applyMove(tapper, { kind: "dig" }, NOW, { trouble });
    const gained = (result: typeof calmDig) =>
      result.kind === "applied" ? result.gained.stones : -1;
    expect(gained(caveIn)).toBe(
      mineByHand(tapper, NOW, trouble).stock.stones - tapper.stock.stones,
    );
    expect(gained(caveIn)).toBeGreaterThan(0);
    expect(gained(caveIn)).toBeLessThan(gained(calmDig));
  });

  it("digs by hand with what it mined, and taps a vein", () => {
    const dug = applyMove(fresh, { kind: "dig" }, NOW, calm);
    expect(dug.kind === "applied" && dug.gained.stones).toBeGreaterThan(0);
    expect(dug.kind === "applied" && dug.spent.stones).toBe(0);
    const vein = applyMove(rich, { kind: "tapVein" }, NOW, calm);
    expect(vein.kind === "applied" && vein.gained.stones).toBeGreaterThan(0);
  });

  it("pays a quick vein like a vein, then starts a Gold rush", () => {
    const owed = { ...rich, rushBank: 8_100 };
    const vein = applyMove(rich, { kind: "tapVein" }, NOW, calm);
    const quick = applyMove(owed, { kind: "tapQuickVein" }, NOW, calm);
    expect(quick.kind === "applied" && quick.gained.stones).toBe(
      vein.kind === "applied" ? vein.gained.stones : -1,
    );
    expect(quick.kind === "applied" && quick.mountain.rushUntil).toBe(
      NOW + RUSH_MS,
    );
    expect(quick.kind === "applied" && quick.events).toEqual([
      {
        kind: "quickVeinTapped",
        stones: quick.kind === "applied" ? quick.gained.stones : -1,
      },
    ]);
  });

  it("lands the held stones when the quick vein is missed, once", () => {
    const owed = { ...rich, rushBank: 8_100 };
    const missed = applyMove(owed, { kind: "missQuickVein" }, NOW, calm);
    expect(missed.kind === "applied" && missed.gained.stones).toBe(8_100);
    expect(missed.kind === "applied" && missed.events).toEqual([
      { kind: "rushLanded", stones: 8_100 },
    ]);
    expect(applyMove(rich, { kind: "missQuickVein" }, NOW, calm).kind).toBe(
      "refused",
    );
    // a rush that has started is not landed early
    const rushed = { ...owed, rushUntil: NOW + RUSH_MS };
    expect(applyMove(rushed, { kind: "missQuickVein" }, NOW, calm).kind).toBe(
      "refused",
    );
  });

  it("marks a sheet seen, and refuses a mark already made", () => {
    const seen = applyMove(
      fresh,
      { kind: "markSeen", id: "workshop" },
      NOW,
      calm,
    );
    expect(seen.kind).toBe("applied");
    if (seen.kind !== "applied") return;
    expect(seen.mountain.seen).toContain("workshop");
    expect(
      applyMove(seen.mountain, { kind: "markSeen", id: "workshop" }, NOW, calm),
    ).toEqual({ kind: "refused" });
    const all = applyMove(
      fresh,
      { kind: "markAllSeen", ids: ["workshop", "engineers"] },
      NOW,
      calm,
    );
    expect(all.kind === "applied" && all.mountain.seen).toEqual([
      "workshop",
      "engineers",
    ]);
  });

  const eventsOf = (mountain: Mountain, move: Move) => {
    const result = applyMove(mountain, move, NOW, calm);
    return result.kind === "applied" ? result.events : undefined;
  };

  it("says what a buy, an upgrade, a boost and a craft did", () => {
    expect(eventsOf(rich, { kind: "buyTier", id: "cart" })).toEqual([
      { kind: "tierBought", id: "cart", count: rich.owned.cart + 1 },
    ]);
    expect(eventsOf(rich, upgradeAt(rich, "tap"))).toEqual([
      { kind: "upgradeBought", id: "tap", level: 1 },
    ]);
    const boosted = applyMove(
      rich,
      { kind: "buyBoost", id: "sharper" },
      NOW,
      calm,
    );
    expect(boosted.kind === "applied" && boosted.events).toEqual([
      {
        kind: "boostStarted",
        id: "sharper",
        endsAt:
          boosted.kind === "applied" ? boosted.mountain.boosts.sharper : 0,
      },
    ]);
    expect(eventsOf(rich, { kind: "craft", recipe: "sturdy-props" })).toEqual([
      { kind: "craftStarted", recipe: "sturdy-props" },
    ]);
  });

  it("names the promoted engineer and the crew size", () => {
    expect(eventsOf(rich, promoteAt(rich))).toEqual([
      { kind: "promoted", name: "Nils", crew: 2 },
    ]);
  });

  it("charges an upgrade and a promotion only at the price that was shown (#367)", () => {
    // A crew a stone short of the Granite: the shown prices are the Topsoil ones.
    const topsoil: Mountain = {
      ...rich,
      remaining: minedMountain(9_999_999).remaining,
    };
    const granite: Mountain = {
      ...rich,
      remaining: minedMountain(10_000_000).remaining,
    };
    const armsShown = upgradePrice(topsoil, "tap") ?? [];
    const promoteShown = promotePrice(topsoil);
    expect(oneOffStretch(granite)).toBeGreaterThan(oneOffStretch(topsoil));
    const arms = { kind: "buyUpgrade", id: "tap", price: armsShown } as const;
    const stepUp = { kind: "promote", price: promoteShown } as const;
    // The band crossed between the paint and the tap: the dearer price is refused.
    expect(applyMove(granite, arms, NOW, calm)).toEqual({ kind: "refused" });
    expect(applyMove(granite, stepUp, NOW, calm)).toEqual({ kind: "refused" });
    // At the price he saw, it buys, and that is what it takes.
    const bought = applyMove(topsoil, arms, NOW, calm);
    expect(bought.kind === "applied" && bought.spent.stones).toBe(
      priceAmount(armsShown, "stones"),
    );
    // An upgrade with no level left has no price today: nothing it was
    // shown, not even a free price, buys it.
    const maxed: Mountain = { ...rich, upgrades: { ...NO_UPGRADES, tap: 10 } };
    for (const price of [[], UNSHOWN_PRICE, armsShown]) {
      expect(
        applyMove(maxed, { kind: "buyUpgrade", id: "tap", price }, NOW, calm),
      ).toEqual({ kind: "refused" });
    }
    // Every good of the shown price must match, not only the stones.
    const plusClay = {
      kind: "promote",
      price: [...promoteShown, { good: "clay", amount: 1 }],
    } as const;
    expect(applyMove(topsoil, plusClay, NOW, calm)).toEqual({
      kind: "refused",
    });
    const promoted = applyMove(topsoil, stepUp, NOW, calm);
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
              oneOffStretch(rich),
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
      owned: { ...fresh.owned, helper: 1 },
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

  it("says what a vein tap gave, and nothing for a dig, a seen mark or a cancelled craft", () => {
    const vein = applyMove(rich, { kind: "tapVein" }, NOW, calm);
    expect(vein.kind === "applied" && vein.events).toEqual([
      {
        kind: "veinTapped",
        stones: vein.kind === "applied" ? vein.gained.stones : -1,
      },
    ]);
    expect(eventsOf(fresh, { kind: "dig" })).toEqual([]);
    expect(eventsOf(fresh, { kind: "markSeen", id: "workshop" })).toEqual([]);
    const crafting = applyMove(
      rich,
      { kind: "craft", recipe: "sturdy-props" },
      NOW,
      calm,
    );
    if (crafting.kind !== "applied") throw new Error("craft refused");
    expect(eventsOf(crafting.mountain, { kind: "cancelCraft" })).toEqual([]);
  });

  it("buys a boost again once it has run out, with the new end", () => {
    const first = applyMove(
      rich,
      { kind: "buyBoost", id: "sharper" },
      NOW,
      calm,
    );
    if (first.kind !== "applied") throw new Error("boost refused");
    const topped = {
      ...first.mountain,
      stock: { ...first.mountain.stock, stones: 1e15 },
    };
    const later = NOW + boostById("sharper").durationMs + 1;
    const again = applyMove(
      topped,
      { kind: "buyBoost", id: "sharper" },
      later,
      calm,
    );
    if (again.kind !== "applied") throw new Error("boost not bought again");
    const endsAt = again.mountain.boosts.sharper;
    expect(again.events).toEqual([
      { kind: "boostStarted", id: "sharper", endsAt },
    ]);
    expect(endsAt).toBeGreaterThan(first.mountain.boosts.sharper);
  });

  it("gives the lab's applyAction the same mountain for every listed move", () => {
    for (const action of listActions(rich, NOW, trouble)) {
      const moved = applyMove(rich, action, NOW, calm);
      expect(applyAction(rich, action, NOW)).toEqual(
        moved.kind === "applied" ? moved.mountain : rich,
      );
    }
  });
});

describe("buyEveryBoost", () => {
  const NOW = 1_000_000;

  it("starts every boost the pocket can pay, in catalogue order", () => {
    const rich = {
      ...createMountain(),
      stock: { ...createMountain().stock, stones: 1_000_000 },
    };
    const one = buyBoost({
      mountain: rich,
      id: "sharper",
      now: NOW,
      pricing: effectiveRates(rich),
    });
    const both = buyBoost({
      mountain: one,
      id: "overtime",
      now: NOW,
      pricing: effectiveRates(one),
    });
    expect(BOOSTS.map((boost) => boost.id)).toEqual(["sharper", "overtime"]);
    expect(buyEveryBoost(rich, NOW)).toEqual(both);
    expect(boostLeft(both, "sharper", NOW)).toBeGreaterThan(0);
    expect(boostLeft(both, "overtime", NOW)).toBeGreaterThan(0);
  });

  it("leaves a running boost, and one the pocket cannot pay", () => {
    const running = {
      ...createMountain(),
      stock: { ...createMountain().stock, stones: 0 },
      boosts: { ...NO_BOOSTS, sharper: NOW + 1_000 },
    };
    expect(buyEveryBoost(running, NOW)).toBe(running);
  });
});
