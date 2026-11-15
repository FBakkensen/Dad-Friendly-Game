import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { machineKey, stageRows } from "./mine-view";
import type { Mountain } from "./mountain";
import { crewedStart } from "./test-fixtures";
import { listPart, stageList, workersList } from "./stage-list-view";
import { tierById } from "./tiers";

/** A stage's list and the workers' upgrades (#661), on a fresh mine. */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

const rich = (patch: Partial<Mountain> = {}): Mountain => {
  const mountain = crewedStart();
  return {
    ...mountain,
    stock: { ...mountain.stock, stones: 5_000_000 },
    ...patch,
  };
};

describe("a stage's list", () => {
  it("has what the stage moves, and who works with what a line each", () => {
    fresh(() => {
      const mountain = rich({
        owned: { ...crewedStart().owned, cart: 2 },
      });
      const row = stageRows(mountain).find((each) => each.stage === "haul");
      const list = stageList(mountain, "haul", "one", 0);
      expect(list.name).toBe("Haulage");
      expect(list.can).toBe(row?.can);
      expect(list.parts).toEqual([
        { name: "2 carts", detail: "2 of 2 workers", moves: "120/s" },
        { name: "4 with barrows", detail: "", moves: "12/s" },
      ]);
      expect(list.sentence).toBe(
        "Moves 18/s of 132/s: 2 carts: 2 of 2 workers 120/s + 4 with barrows 12/s.",
      );
    });
  });

  it("says a machine that stands, with its workers on their tools, in the call 51 form", () => {
    expect(
      listPart(
        "haul",
        {
          kind: "stands",
          id: "cart",
          standing: 1,
          workers: 12,
          moves: 430,
          onMachines: 360,
        },
        "430",
      ),
    ).toEqual({
      name: "1 cart stands",
      detail: "12 workers move with barrows, 360/s on the cart",
      moves: "430/s",
    });
    expect(
      listPart(
        "lift",
        {
          kind: "stands",
          id: "hoist",
          standing: 2,
          workers: 0,
          moves: 0,
          onMachines: 0,
        },
        "0",
      ),
    ).toEqual({ name: "2 hoists stand", detail: "", moves: "0/s" });
  });

  it("has the stage's machine with what he owns, its next mark and the mine's key", () => {
    fresh(() => {
      const mountain = rich({
        owned: { ...crewedStart().owned, cart: 4 },
      });
      const [cart] = stageList(mountain, "haul", "one", 0).machines;
      expect(cart?.name).toBe("Carts");
      expect(cart?.owned).toBe("4 owned");
      expect(cart?.mark).toBe("4 of 10 · Every cart hauls twice as fast.");
      expect(cart?.key).toEqual(
        machineKey(mountain, "haul", tierById("cart"), "one"),
      );
    });
  });

  it("follows the amount key on a machine's key", () => {
    fresh(() => {
      const [drill] = stageList(rich(), "face", "ten", 0).machines;
      expect(drill?.key.count).toBe(10);
      expect(drill?.key.face).toMatch(/^\+10 Drills · /);
    });
  });

  it("says the marks are reached once he owns past the last", () => {
    fresh(() => {
      const mountain = rich({
        owned: { ...crewedStart().owned, hoist: 200 },
      });
      const [hoist] = stageList(mountain, "lift", "one", 0).machines;
      expect(hoist?.mark).toBe("Twice as fast now.");
    });
  });

  it("shows an upgrade once it opens, with its numbers, and Owned once bought", () => {
    fresh(() => {
      const few = rich({ owned: { ...crewedStart().owned, cart: 4 } });
      expect(stageList(few, "haul", "one", 0).upgrades).toEqual([]);
      const five = rich({ owned: { ...crewedStart().owned, cart: 5 } });
      const [helpers] = stageList(five, "haul", "one", 0).upgrades;
      expect(helpers).toMatchObject({
        id: "cartSyn",
        name: "Loading crews",
        effect: "Carts 60/s to 63/s.",
        why: "Each worker on haulage makes carts 1% faster.",
        owned: false,
        price: "2M",
        can: true,
      });
      const bought = {
        ...five,
        upgrades: { ...five.upgrades, cartSyn: 1 },
      };
      expect(stageList(bought, "haul", "one", 0).upgrades[0]?.owned).toBe(true);
    });
  });

  it("keeps a stage's upgrades in its own list: Haul roads under drilling", () => {
    fresh(() => {
      const drills = rich({ owned: { ...crewedStart().owned, drill: 5 } });
      expect(
        stageList(drills, "face", "one", 0).upgrades.map((row) => row.id),
      ).toEqual(["drillSyn"]);
      expect(stageList(drills, "haul", "one", 0).upgrades).toEqual([]);
      expect(stageList(drills, "lift", "one", 0).upgrades).toEqual([]);
    });
  });

  it("is dark on an upgrade he cannot pay for", () => {
    fresh(() => {
      const poor = {
        ...rich({ owned: { ...crewedStart().owned, cart: 5 } }),
        stock: { ...crewedStart().stock, stones: 10 },
      };
      expect(stageList(poor, "haul", "one", 0).upgrades[0]?.can).toBe(false);
    });
  });
});

describe("the workers' upgrades", () => {
  it("has Work boots with the tool's numbers, and the workers' next mark", () => {
    fresh(() => {
      const list = workersList(rich(), 0);
      expect(list.upgrades.map((row) => row.name)).toEqual(["Work boots"]);
      expect(list.upgrades[0]?.effect).toBe(
        "Workers with a tool 3/s to 7.1/s.",
      );
      expect(list.mark).toBe(
        "21 of 25 · Every worker with a tool works twice as fast.",
      );
    });
  });

  it("never says hands, and names no limit", () => {
    fresh(() => {
      const mountain = rich({
        owned: { ...crewedStart().owned, cart: 5, drill: 5 },
      });
      const words = JSON.stringify([
        stageList(mountain, "face", "one", 0),
        stageList(mountain, "haul", "one", 0),
        stageList(mountain, "lift", "one", 0),
        workersList(mountain, 0),
      ]);
      expect(words).not.toMatch(
        /\bhands?\b|by hand|bottleneck|limit|best buy/i,
      );
    });
  });
});
