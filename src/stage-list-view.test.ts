import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import { hoistingRow, mineLevels } from "./mine-level-view";
import { machineKey, stageRows } from "./mine-view";
import type { Mountain } from "./mountain";
import { levels, partThree } from "./part-three.harness";
import { crewedStart } from "./test-fixtures";
import { listPart, stageList, workersList } from "./stage-list-view";
import { tierById } from "./tiers";

/** A stage's list and the workers' upgrades (#661), on a fresh mine. */
const fresh = <T>(body: () => T): T => withFactors({}, body);

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
      expect(list.owned).toBe("21 hired");
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

/** The lists with two levels (#680): each says what the row he tapped says. */
describe("a stage's list with two levels", () => {
  /** 3 hoists, one for each level and one for both, and 5 on hoisting; 3 drills on the Topsoil and 2 on the Granite. */
  const two = (): Mountain => {
    const m = levels({
      topsoil: 3,
      granite: 2,
      hoisting: 5,
      hoists: 3,
      assigned: { topsoil: 1, granite: 1 },
      machines: { drill: 2 },
      stock: { stones: 1e9, cutStone: 1e9 },
    });
    return { ...m, owned: { ...m.owned, drill: m.owned.drill + 3 } };
  };

  it("gives Hoisting's list the numbers of Hoisting's row", () => {
    partThree(() => {
      const m = two();
      const row = hoistingRow(m, 0);
      const list = stageList(m, "lift", "one", 0);
      expect(list.name).toBe("Hoisting");
      expect(list.now).toBe(`${row.now}/s`);
      expect(list.can).toBe(row.can);
      expect(list.band).toEqual(row.band);
      expect(list.sentence).toBe(
        `Moves ${row.now}/s of ${row.can}: ${row.sum[0]}.`,
      );
      // Not the one-level row, which counts the cages another way.
      expect(list.can).not.toBe(stageRows(m, 0)[2]?.can);
    });
  });

  it("gives a level's row its own list: its name, its numbers and its machines", () => {
    partThree(() => {
      const m = two();
      const [topsoil, granite] = mineLevels(m, 0);
      const list = stageList(m, "face", "one", 0, "granite");
      expect(list.name).toBe("Granite drilling");
      expect(list.now).toBe(`${granite?.rows[0].now ?? ""}/s`);
      expect(list.can).toBe(granite?.rows[0].can);
      expect(list.sentence).toBe(
        `Moves ${granite?.rows[0].now ?? ""}/s of ${granite?.rows[0].can ?? ""}: ${granite?.rows[0].sum[0] ?? ""}.`,
      );
      const drills = list.machines.find((each) => each.id === "drill");
      expect(drills?.owned).toBe("2 owned");
      const topList = stageList(m, "face", "one", 0, "topsoil");
      expect(topList.name).toBe("Topsoil drilling");
      expect(topList.can).toBe(topsoil?.rows[0].can);
      expect(topList.machines.find((each) => each.id === "drill")?.owned).toBe(
        "3 owned",
      );
      expect(stageList(m, "haul", "one", 0, "granite").name).toBe(
        "Granite haulage",
      );
    });
  });

  it("is today's list with one level", () => {
    partThree(() => {
      const m = levels({ topsoil: 2, hoisting: 2, hoists: 1, sunk: false });
      const list = stageList(m, "face", "one", 0, "granite");
      expect(list.name).toBe("Drilling");
      expect(list).toEqual(stageList(m, "face", "one", 0));
      expect(stageList(m, "lift", "one", 0).can).toBe(stageRows(m, 0)[2]?.can);
    });
  });
});
