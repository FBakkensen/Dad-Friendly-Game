import { describe, expect, it } from "vitest";
import { buyBoost, boostLeft } from "../boosts";
import { buyCrew } from "../crew";
import {
  promote,
  promoteCost,
  staffForBuy,
  staffNeeded,
  station,
  type Engineer,
} from "../engineers";
import { recall, send } from "../expeditions";
import type { Trouble } from "../hazards";
import { createMountain, type Mountain } from "../mountain";
import { minedMountain } from "../test-fixtures";
import { effectiveRates, AWAY_PAY_RATE } from "../rates";
import { TIERS, owned, tierById, tierCost, type TierId } from "../tiers";
import {
  BOOTS_SPEED_PER_LEVEL,
  STEADY_AWAY_PER_LEVEL,
  SYNERGY_PER_UNIT,
  TAP_SHARE_PER_LEVEL,
  buyUpgrade,
  upgradeById,
  upgradeCost,
  upgradeLevel,
} from "../upgrades";
import { applyAction, listActions, valueOf, type Action } from "./actions";

const NOW = 1_700_000_000_000;
const HORIZON = 6 * 60 * 60;

const ada: Engineer = { name: "Ada", rank: 0, trips: 0, post: "borer" };

/**
 * One action of every kind. Adding a kind without a fixture fails typecheck.
 */
const FIXTURES = {
  buyTier: { kind: "buyTier", id: "helper" },
  buyUpgrade: { kind: "buyUpgrade", id: "tap" },
  buyBoost: { kind: "buyBoost", id: "sharper" },
  promote: { kind: "promote" },
  station: { kind: "station", index: 0, post: "drill" },
  send: { kind: "send", index: 0, tunnel: "old-shaft" },
  recall: { kind: "recall", index: 0 },
  fixTrouble: { kind: "fixTrouble", tier: "borer", startedAt: NOW },
} as const satisfies {
  [K in Action["kind"]]: Extract<Action, { kind: K }>;
};

const trouble: Trouble = { kind: "jam", tier: "borer", startedAt: NOW };

function direct(mountain: Mountain, action: Action, now: number): Mountain {
  switch (action.kind) {
    case "buyTier":
      return buyCrew(mountain, action.id);
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
    case "station":
      return station(mountain, action.index, action.post);
    case "send":
      return send(mountain, action.index, action.tunnel, now);
    case "recall":
      return recall(mountain, action.index);
    case "fixTrouble":
      return mountain;
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
    mountain.helpers +
    mountain.kids -
    TIERS.reduce(
      (used, tier) =>
        used + rates.running[tier.id] * staffNeeded(mountain, tier),
      0,
    )
  );
}

/**
 * Gain and cost `bestValue` would score for this tier today.
 * Workers: crew delta of one hire. Machines: current unit speed, plus the
 * workers still needed on the cost.
 */
function simTier(
  mountain: Mountain,
  id: TierId,
): { gain: number; cost: number } {
  const tier = tierById(id);
  const price = tierCost(tier, owned(mountain, tier));
  if (tier.staff === 0) {
    const bought = buyCrew({ ...mountain, pocket: price }, id);
    return {
      gain:
        effectiveRates(bought).crewPerSecond -
        effectiveRates(mountain).crewPerSecond,
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
    crewCost += tierCost(helper, mountain.helpers + extra);
  }
  return {
    gain: effectiveRates(mountain).tierSpeed[id],
    cost: price + crewCost,
  };
}

function crewDelta(before: Mountain, after: Mountain): number {
  return (
    effectiveRates(after).crewPerSecond - effectiveRates(before).crewPerSecond
  );
}

const fresh = createMountain();
const withHelper = { ...fresh, helpers: 1, pocket: 0 };
const rich: Mountain = {
  ...minedMountain(25_000_000),
  helpers: 30,
  carts: 4,
  drills: 2,
  borers: 1,
  pocket: 1e15,
  engineers: [ada],
};
const broke: Mountain = { ...rich, pocket: 0 };
const travelling = send(rich, 0, "old-shaft", NOW);
const lockedMachine: Mountain = {
  ...minedMountain(24_999_999),
  helpers: 10,
  carts: 1,
  drills: 1,
  borers: 1,
  pocket: 1e15,
  engineers: [ada],
};
const crowned: Mountain = {
  ...minedMountain(70_000_000),
  helpers: 30,
  carts: 1,
  drills: 1,
  borers: 1,
  machines: 1,
  pocket: 1e15,
  engineers: [{ ...ada, post: "machine" }],
};

function fullCrew(): Mountain {
  let mountain: Mountain = {
    ...fresh,
    helpers: 10,
    carts: 1,
    drills: 1,
    borers: 1,
    pocket: 1e15,
    engineers: [ada],
  };
  while ((mountain.engineers?.length ?? 0) < 5) {
    mountain = promote({ ...mountain, pocket: promoteCost(mountain) });
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
        expectSameMove(mountain, action, NOW);
      }
    }
  });
});

describe("listActions", () => {
  it("offers the first worker, strong arms, and both boosts on a new mountain", () => {
    expect(
      listActions(fresh, NOW).map((action) =>
        "id" in action ? `${action.kind}:${action.id}` : action.kind,
      ),
    ).toEqual([
      "buyTier:helper",
      "buyUpgrade:tap",
      "buyBoost:sharper",
      "buyBoost:overtime",
    ]);
  });

  it("shows the next tier once the previous one is owned, and hides a locked one", () => {
    expect(
      listActions(withHelper, NOW).some(
        (action) => action.kind === "buyTier" && action.id === "cart",
      ),
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
    const maxed: Mountain = { ...rich, upgrades: { tap: 10 } };
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
    const trip = seed.expeditions?.[0];
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

  it("repairs a tunnel post that has no expedition, and does not send them", () => {
    const stuck: Mountain = {
      ...rich,
      engineers: [{ ...ada, post: "tunnel" }],
    };
    const offers = listActions(stuck, NOW);
    expect(offers.some((action) => action.kind === "station")).toBe(true);
    expect(
      offers.some(
        (action) => action.kind === "send" || action.kind === "recall",
      ),
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
    for (const mountain of [fresh, rich, travelling, crowned, broke]) {
      for (const action of listActions(mountain, NOW, trouble)) {
        seen.add(action.kind);
      }
    }
    for (const kind of Object.keys(FIXTURES) as Action["kind"][]) {
      expect(seen.has(kind)).toBe(true);
    }
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
      drills: 1,
      helpers: 8,
      pocket: 10_000_000,
    };
    const bought = applyAction(funded, { kind: "buyTier", id: "borer" }, NOW);
    expect(bought.borers).toBe(1);
    expect(bought.engineers?.[0]?.name).toBe("Ada");
    expect(bought.engineers?.[0]?.post).toBe("borer");
    expect(bought).toEqual(buyCrew(funded, "borer"));
  });
});

describe("valueOf", () => {
  it("matches bestValue for every listed tier", () => {
    const mountains = [fresh, withHelper, rich, broke, lockedMachine, crowned];
    for (const mountain of mountains) {
      for (const action of listActions(mountain, NOW)) {
        if (action.kind !== "buyTier") {
          continue;
        }
        const expected = simTier(mountain, action.id);
        const value = valueOf(mountain, action, HORIZON);
        expect(value.gainPerSec).toBe(expected.gain);
        expect(value.cost).toBe(expected.cost);
        expect(valueOf(mountain, action, 60).gainPerSec).toBe(value.gainPerSec);
      }
    }
  });

  it("scores a worker by the crew they add, including an idle machine they start", () => {
    expect(valueOf(fresh, FIXTURES.buyTier, HORIZON)).toMatchObject({
      gainPerSec: 1,
      cost: 20,
      paybackSec: Number.POSITIVE_INFINITY,
    });
    const covered = valueOf(
      { ...fresh, pocket: 20 },
      FIXTURES.buyTier,
      HORIZON,
    );
    expect(covered.paybackSec).toBe(20);
    const idleDrill: Mountain = { ...fresh, helpers: 2, drills: 1, carts: 1 };
    const hired = valueOf(
      idleDrill,
      { kind: "buyTier", id: "helper" },
      HORIZON,
    );
    // The third worker starts the drill and the cart loses its hand.
    expect(hired.gainPerSec).toBe(51);
    expect(hired.cost).toBe(tierCost(tierById("helper"), 2));
    expect(hired.paybackSec).toBe(
      hired.cost / effectiveRates(idleDrill).crewPerSecond +
        hired.cost / hired.gainPerSec,
    );
  });

  it("bundles the workers a machine still needs, and ignores the first engineer's tend", () => {
    const bare: Mountain = { ...fresh, drills: 1 };
    const borer = valueOf(bare, { kind: "buyTier", id: "borer" }, HORIZON);
    expect(borer.gainPerSec).toBe(350);
    expect(borer.cost).toBeGreaterThan(10_000_000);
    const staffed: Mountain = { ...bare, helpers: 11, pocket: 0 };
    const tended = valueOf(staffed, { kind: "buyTier", id: "borer" }, HORIZON);
    expect(tended.gainPerSec).toBe(350);
    expect(tended.cost).toBe(10_000_000);
    const applied = buyCrew({ ...staffed, pocket: 10_000_000 }, "borer");
    expect(crewDelta(staffed, applied)).toBe(385);

    const hammer: Mountain = {
      ...minedMountain(25_000_000),
      helpers: 8,
      carts: 1,
      drills: 1,
      borers: 1,
      pocket: 0,
      engineers: [ada],
    };
    const machine = valueOf(
      hammer,
      { kind: "buyTier", id: "machine" },
      HORIZON,
    );
    expect(staffForBuy(hammer, tierById("machine"))).toBe(5);
    expect(machine.gainPerSec).toBe(3_500);
    let bill = 0;
    for (let extra = 0; extra < 5; extra += 1) {
      bill += tierCost(tierById("helper"), hammer.helpers + extra);
    }
    expect(machine.cost).toBe(50_000_000 + bill);
  });

  it("scores a second cart plus the one worker it needs", () => {
    const idle: Mountain = { ...fresh, carts: 1 };
    const value = valueOf(idle, { kind: "buyTier", id: "cart" }, HORIZON);
    expect(value.gainPerSec).toBe(10);
    expect(value.cost).toBe(220);
  });

  it("uses the crew delta for every listed upgrade", () => {
    for (const mountain of [rich, crowned, { ...rich, helpers: 10 }]) {
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
          { ...mountain, pocket: mountain.pocket + price },
          action.id,
        );
        const value = valueOf(mountain, action, HORIZON);
        expect(value.gainPerSec).toBe(crewDelta(mountain, bought));
        expect(value.cost).toBe(price);
      }
    }
  });

  it("differs from the hand formulas where the crew line does not move", () => {
    const ten: Mountain = { ...fresh, helpers: 10, carts: 5, pocket: 0 };
    const boots = valueOf(ten, { kind: "buyUpgrade", id: "boots" }, HORIZON);
    const bootsHand =
      10 * effectiveRates(ten).tierSpeed.helper * BOOTS_SPEED_PER_LEVEL;
    expect(boots.gainPerSec).toBe(1);
    expect(bootsHand).toBe(1);

    const eleven: Mountain = { ...fresh, helpers: 11 };
    const elevenBoots = valueOf(
      eleven,
      { kind: "buyUpgrade", id: "boots" },
      HORIZON,
    );
    expect(elevenBoots.gainPerSec).toBe(1);
    expect(
      11 * effectiveRates(eleven).tierSpeed.helper * BOOTS_SPEED_PER_LEVEL,
    ).toBe(1.1);

    const heir: Mountain = { ...ten, legacy: 1 };
    const heirBoots = valueOf(
      heir,
      { kind: "buyUpgrade", id: "boots" },
      HORIZON,
    );
    const heirHand =
      10 * effectiveRates(heir).tierSpeed.helper * BOOTS_SPEED_PER_LEVEL;
    expect(heirBoots.gainPerSec).toBe(1);
    expect(heirHand).toBe(1.5);

    const hands = valueOf(ten, { kind: "buyUpgrade", id: "cartSyn" }, HORIZON);
    const handsHand = 10 * SYNERGY_PER_UNIT * 5 * tierById("cart").perSecond;
    expect(hands.gainPerSec).toBe(5);
    expect(handsHand).toBe(5);

    const half: Mountain = { ...fresh, helpers: 5, carts: 5 };
    const halfHands = valueOf(
      half,
      { kind: "buyUpgrade", id: "cartSyn" },
      HORIZON,
    );
    expect(halfHands.gainPerSec).toBe(2);
    expect(5 * SYNERGY_PER_UNIT * 5 * tierById("cart").perSecond).toBe(2.5);

    const short: Mountain = { ...fresh, helpers: 4, carts: 5 };
    const shortHands = valueOf(
      short,
      { kind: "buyUpgrade", id: "cartSyn" },
      HORIZON,
    );
    expect(shortHands.gainPerSec).toBe(1);
    expect(4 * SYNERGY_PER_UNIT * 5 * 10).toBe(2);

    const arms = valueOf(ten, { kind: "buyUpgrade", id: "tap" }, HORIZON);
    expect(arms.gainPerSec).toBe(0);
    expect(
      effectiveRates(ten).crewPerSecond * TAP_SHARE_PER_LEVEL,
    ).toBeGreaterThan(0);

    const steady = valueOf(ten, { kind: "buyUpgrade", id: "steady" }, HORIZON);
    expect(steady.gainPerSec).toBe(0);
    expect(
      effectiveRates(ten).crewPerSecond * AWAY_PAY_RATE * STEADY_AWAY_PER_LEVEL,
    ).toBeGreaterThan(0);
  });

  it("spreads a boost across the horizon and leaves a permanent gain alone", () => {
    const crew: Mountain = { ...fresh, helpers: 10, pocket: 1e15 };
    const overtime = { kind: "buyBoost", id: "overtime" } as const;
    const full = valueOf(crew, overtime, 30 * 60);
    const half = valueOf(crew, overtime, 60 * 60);
    expect(full.gainPerSec).toBe(10);
    expect(half.gainPerSec).toBe(5);
    expect(full.cost).toBe(1_800);
    expect(full.paybackSec).toBe(1_800 / 10);
    expect(valueOf(crew, overtime, Number.POSITIVE_INFINITY).gainPerSec).toBe(
      0,
    );
    expect(valueOf(crew, FIXTURES.buyTier, 0).gainPerSec).toBe(1);
    const queued: Mountain = {
      ...crew,
      boosts: { sharper: 5_000, overtime: 1_000 },
    };
    expect(valueOf(queued, overtime, 30 * 60).gainPerSec).toBe(full.gainPerSec);
    const sharper = valueOf(crew, { kind: "buyBoost", id: "sharper" }, 60 * 60);
    expect(sharper.gainPerSec).toBe(0);
    expect(sharper.paybackSec).toBe(Number.POSITIVE_INFINITY);
  });

  it("does not let a running boost change a tier's score", () => {
    const plain = valueOf(
      withHelper,
      { kind: "buyTier", id: "helper" },
      HORIZON,
    );
    const boosted = valueOf(
      { ...withHelper, boosts: { overtime: NOW + 60_000 } },
      { kind: "buyTier", id: "helper" },
      HORIZON,
    );
    expect(boosted).toEqual(plain);
  });

  it("values a fix as the crew speed trouble was holding back", () => {
    const slowed = effectiveRates(rich, NOW, trouble).crewPerSecond;
    const clear = effectiveRates(rich, NOW).crewPerSecond;
    const value = valueOf(rich, FIXTURES.fixTrouble, HORIZON);
    expect(value.gainPerSec).toBe(clear - slowed);
    expect(value.cost).toBe(0);
    expect(value.paybackSec).toBe(0);
    expect(applyAction(rich, FIXTURES.fixTrouble, NOW)).toBe(rich);
  });

  it("reports a loss as an infinite payback", () => {
    const moved = valueOf(
      rich,
      { kind: "station", index: 0, post: "camp" },
      HORIZON,
    );
    expect(moved.gainPerSec).toBeLessThan(0);
    expect(moved.cost).toBe(0);
    expect(moved.paybackSec).toBe(Number.POSITIVE_INFINITY);
    const home = valueOf(
      { ...rich, engineers: [{ ...ada, post: "camp" }] },
      { kind: "station", index: 0, post: "borer" },
      HORIZON,
    );
    expect(home.gainPerSec).toBeGreaterThan(0);
    expect(home.paybackSec).toBe(0);
  });

  it("scores promote, send, and recall from the crew before and after", () => {
    const stepUp = valueOf(rich, { kind: "promote" }, HORIZON);
    expect(stepUp.cost).toBe(2_000_000);
    expect(stepUp.gainPerSec).toBeLessThan(0);
    expect(stepUp.paybackSec).toBe(Number.POSITIVE_INFINITY);
    const trip = valueOf(
      rich,
      { kind: "send", index: 0, tunnel: "old-shaft" },
      HORIZON,
    );
    expect(trip.cost).toBe(0);
    expect(trip.gainPerSec).toBeLessThan(0);
    const back = valueOf(travelling, { kind: "recall", index: 0 }, HORIZON);
    expect(back.gainPerSec).toBeGreaterThan(0);
    expect(back.paybackSec).toBe(0);
  });

  it("gives a locked or maxed buy no crew gain", () => {
    const lockedBoots = valueOf(
      fresh,
      { kind: "buyUpgrade", id: "boots" },
      HORIZON,
    );
    expect(lockedBoots.gainPerSec).toBe(0);
    expect(lockedBoots.cost).toBe(15_000);
    expect(lockedBoots.paybackSec).toBe(Number.POSITIVE_INFINITY);
    const machine = valueOf(
      lockedMachine,
      { kind: "buyTier", id: "machine" },
      HORIZON,
    );
    expect(machine.gainPerSec).toBe(0);
    expect(machine.paybackSec).toBe(Number.POSITIVE_INFINITY);
    const maxed = valueOf(
      { ...rich, upgrades: { tap: 10 } },
      { kind: "buyUpgrade", id: "tap" },
      HORIZON,
    );
    expect(maxed.gainPerSec).toBe(0);
    expect(maxed.cost).toBe(0);
  });
});
