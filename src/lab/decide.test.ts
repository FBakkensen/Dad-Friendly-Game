import { describe, expect, it } from "vitest";
import { listActions } from "../economy/actions";
import { withFactors } from "../economy/factors";
import { promoteCost } from "../engineers";
import { createMountain, type Mountain } from "../mountain";
import { LEVEL_MACHINE_IDS } from "../mine-levels";
import { PLAY_FACTORS } from "../part-switch";
import { stonesPrice } from "../stock";
import { NO_UPGRADES } from "../upgrades";
import { NONE_OWNED, patched } from "../test-fixtures";
import { actionsOnTable, sticker } from "./decide";

const ada = {
  name: "Ada",
  rank: 0,
  trips: 0,
  post: "borer",
} as const;

describe("the spends the lab weighs", () => {
  it("weighs crew, machines and crafts, and leaves out a free post and an upgrade", () => {
    const mountain = {
      ...createMountain(),
      // Five carts open Loading crews (#250).
      owned: { ...createMountain().owned, helper: 4, cart: 5 },
      stock: { ...createMountain().stock, stones: 3_000_000 },
      engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" } as const],
    };
    const kinds = new Set(
      listActions(mountain, 0).map((action) => action.kind),
    );
    expect(kinds).toContain("station");
    expect(kinds).toContain("buyUpgrade");
    const weighed = actionsOnTable(mountain, 0);
    expect(weighed.some((action) => action.kind === "buyTier")).toBe(true);
    expect(weighed.every((action) => action.kind === "buyTier")).toBe(true);
  });

  it("leaves out a kiln and the stockyard: the fresh dad weighs them himself (#667)", () => {
    withFactors(PLAY_FACTORS, () => {
      const lit: Mountain = {
        ...createMountain(),
        operational: ["lightTower"],
      };
      const kinds = listActions(lit, 0).map((action) => action.kind);
      expect(kinds).toContain("buyMaker");
      expect(kinds).toContain("expandStockyard");
      const weighed = actionsOnTable(lit, 0);
      expect(weighed.some((action) => action.kind === "buyTier")).toBe(true);
      expect(
        weighed.some(
          (action) =>
            action.kind === "buyMaker" || action.kind === "expandStockyard",
        ),
      ).toBe(false);
    });
  });
});

describe("sticker", () => {
  it("prices every move, and a free one at 0", () => {
    const mountain = patched(
      {
        ...createMountain(),
        stock: { ...createMountain().stock, stones: 100 },
      },
      { owned: { ...NONE_OWNED, helper: 1, borer: 1 }, engineers: [ada] },
    );
    expect(
      sticker(mountain, { kind: "buyTier", id: "helper" }),
    ).toBeGreaterThan(0);
    expect(
      sticker(mountain, {
        kind: "buyUpgrade",
        id: "boots",
        price: stonesPrice(0),
      }),
    ).toBeGreaterThan(0);
    expect(
      sticker(
        { ...mountain, upgrades: { ...NO_UPGRADES, boots: 1 } },
        { kind: "buyUpgrade", id: "boots", price: stonesPrice(0) },
      ),
    ).toBe(Number.POSITIVE_INFINITY);
    expect(sticker(mountain, { kind: "promote", price: stonesPrice(0) })).toBe(
      promoteCost(mountain),
    );
    expect(sticker(mountain, { kind: "station", index: 0, post: "camp" })).toBe(
      0,
    );
    // A fresh mine's moves (#654): a wagon and a kiln have their price, an
    // order is free, and the stockyard is paid in brick.
    expect(
      sticker(
        { ...mountain, fleet: { horseWagon: 1, truck: 0 } },
        { kind: "buyVehicle", id: "horseWagon" },
      ),
    ).toBe(500);
    expect(sticker(mountain, { kind: "buyMaker", id: "kiln" })).toBeGreaterThan(
      0,
    );
    expect(sticker(mountain, { kind: "placeOrder" })).toBe(0);
    expect(sticker(mountain, { kind: "expandStockyard" })).toBe(0);
    // Part 3's moves (#673): the shaft has its stone price, and a Granite
    // machine is free until the lab learns the Granite (#675).
    expect(sticker(mountain, { kind: "sinkShaft" })).toBe(10_000_000);
    expect(
      sticker(mountain, {
        kind: "buyGraniteMachine",
        id: LEVEL_MACHINE_IDS[0],
        count: 1,
      }),
    ).toBe(0);
  });
});
