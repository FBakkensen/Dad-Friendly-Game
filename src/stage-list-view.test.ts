import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { FRESH_OFF } from "./line-switch";
import { machineKey, stageRows } from "./mine-view";
import { createMountain, type Mountain } from "./mountain";
import { stageList, workersList } from "./stage-list-view";
import { tierById } from "./tiers";

/** A stage's list and the workers' upgrades (#661), on a fresh mine. */
const fresh = <T>(body: () => T): T => withFactors({ [FRESH_OFF]: 0 }, body);

const rich = (patch: Partial<Mountain> = {}): Mountain => {
  const mountain = createMountain();
  return {
    ...mountain,
    stock: { ...mountain.stock, stones: 5_000_000 },
    ...patch,
  };
};

describe("a stage's list", () => {
  it("says the stage's row in one sentence, under its name", () => {
    fresh(() => {
      const mountain = rich();
      const row = stageRows(mountain).find((each) => each.stage === "haul");
      const list = stageList(mountain, "haul", "one");
      expect(list.name).toBe("Haulage");
      expect(list.sentence).toBe(
        `Moves ${row?.now ?? ""}/s of ${row?.can ?? ""}: ${row?.sum[0] ?? ""}.`,
      );
      expect(list.sentence).toBe("Moves 18/s of 18/s: 6 with barrows 18/s.");
    });
  });

  it("has the stage's machine with what he owns, its next mark and the mine's key", () => {
    fresh(() => {
      const mountain = rich({
        owned: { ...createMountain().owned, cart: 4 },
      });
      const [cart] = stageList(mountain, "haul", "one").machines;
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
      const [drill] = stageList(rich(), "face", "ten").machines;
      expect(drill?.key.count).toBe(10);
      expect(drill?.key.face).toMatch(/^\+10 Drills · /);
    });
  });

  it("says the marks are reached once he owns past the last", () => {
    fresh(() => {
      const mountain = rich({
        owned: { ...createMountain().owned, hoist: 200 },
      });
      const [hoist] = stageList(mountain, "lift", "one").machines;
      expect(hoist?.mark).toBe("Twice as fast now.");
    });
  });

  it("shows an upgrade once it opens, with its numbers, and Owned once bought", () => {
    fresh(() => {
      const few = rich({ owned: { ...createMountain().owned, cart: 4 } });
      expect(stageList(few, "haul", "one").upgrades).toEqual([]);
      const five = rich({ owned: { ...createMountain().owned, cart: 5 } });
      const [helpers] = stageList(five, "haul", "one").upgrades;
      expect(helpers).toMatchObject({
        id: "cartSyn",
        name: "Cart helpers",
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
      expect(stageList(bought, "haul", "one").upgrades[0]?.owned).toBe(true);
    });
  });

  it("keeps a stage's upgrades in its own list: Cart roads under drilling", () => {
    fresh(() => {
      const drills = rich({ owned: { ...createMountain().owned, drill: 5 } });
      expect(
        stageList(drills, "face", "one").upgrades.map((row) => row.id),
      ).toEqual(["drillSyn"]);
      expect(stageList(drills, "haul", "one").upgrades).toEqual([]);
      expect(stageList(drills, "lift", "one").upgrades).toEqual([]);
    });
  });

  it("is dark on an upgrade he cannot pay for", () => {
    fresh(() => {
      const poor = {
        ...rich({ owned: { ...createMountain().owned, cart: 5 } }),
        stock: { ...createMountain().stock, stones: 10 },
      };
      expect(stageList(poor, "haul", "one").upgrades[0]?.can).toBe(false);
    });
  });
});

describe("the workers' upgrades", () => {
  it("has Better boots with the tool's numbers, and the workers' next mark", () => {
    fresh(() => {
      const list = workersList(rich());
      expect(list.upgrades.map((row) => row.name)).toEqual(["Better boots"]);
      expect(list.upgrades[0]?.effect).toBe(
        "Workers with a tool 3/s to 7.1/s.",
      );
      expect(list.mark).toBe("21 of 25 · Every worker digs twice as fast.");
    });
  });

  it("never says hands, and names no limit", () => {
    fresh(() => {
      const mountain = rich({
        owned: { ...createMountain().owned, cart: 5, drill: 5 },
      });
      const words = JSON.stringify([
        stageList(mountain, "face", "one"),
        stageList(mountain, "haul", "one"),
        stageList(mountain, "lift", "one"),
        workersList(mountain),
      ]);
      expect(words).not.toMatch(
        /\bhands?\b|by hand|bottleneck|limit|best buy/i,
      );
    });
  });
});
