import { describe, expect, it } from "vitest";
import {
  applyMove,
  listActions,
  valueOf,
  type Action,
} from "./economy/actions";
import { withFactors } from "./economy/factors";
import type { Station } from "./factory";
import { fieldEntry } from "./field-log";
import { sticker } from "./lab/decide";
import { NO_GRANITE_PILES, NO_LEVEL_MACHINES } from "./mine-levels";
import { createMountain, type Mountain } from "./mountain";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { EMPTY_STOCK } from "./stock";
import { CHARGE_MS } from "./workshop";

/** The factory's moves (slice 1, rule 7.13, #674): place, cancel, install. */
const partThree = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);
const partTwo = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0 }, body);

const FACTORY_KINDS: readonly Action["kind"][] = [
  "placeWorkOrder",
  "cancelWorkOrder",
  "installWorkOrder",
];

function mine(sunk: boolean, station: Station = { kind: "idle" }): Mountain {
  return {
    ...createMountain(),
    operational: ["lightTower"],
    granite: sunk
      ? {
          kind: "sunk",
          machines: NO_LEVEL_MACHINES,
          piles: NO_GRANITE_PILES,
        }
      : { kind: "unsunk" },
    station,
  };
}

function factoryMoves(mountain: Mountain): readonly Action[] {
  return listActions(mountain, 0).filter((action) =>
    FACTORY_KINDS.includes(action.kind),
  );
}

describe("the factory's moves (#674)", () => {
  it("lists a blueprint for each gear not at its last level on an idle station, once the shaft is sunk", () => {
    partThree(() => {
      expect(factoryMoves(mine(true))).toEqual([
        { kind: "placeWorkOrder", blueprint: "iron-rails" },
        { kind: "placeWorkOrder", blueprint: "blasting-charge" },
        { kind: "placeWorkOrder", blueprint: "reinforce" },
        { kind: "placeWorkOrder", blueprint: "axle-grease" },
      ]);
      const railed = {
        ...mine(true),
        crafted: { ...mine(true).crafted, "iron-rails": 2 },
      };
      expect(
        factoryMoves(railed).some(
          (action) =>
            action.kind === "placeWorkOrder" &&
            action.blueprint === "iron-rails",
        ),
      ).toBe(false);
      expect(factoryMoves(mine(false))).toEqual([]);
    });
    partTwo(() => {
      expect(factoryMoves(mine(true))).toEqual([]);
    });
  });

  it("lists cancel while a work order delivers, and install and cancel once it is done", () => {
    partThree(() => {
      const busy = mine(true, {
        kind: "delivering",
        blueprint: "reinforce",
        arrived: EMPTY_STOCK,
      });
      expect(factoryMoves(busy)).toEqual([{ kind: "cancelWorkOrder" }]);
      const done = mine(true, { kind: "done", blueprint: "reinforce" });
      expect(factoryMoves(done)).toEqual([
        { kind: "installWorkOrder" },
        { kind: "cancelWorkOrder" },
      ]);
      // The old bench took the props to their last level first.
      const capped = {
        ...mine(true, { kind: "done", blueprint: "sturdy-props" }),
        crafted: { ...mine(true).crafted, "sturdy-props": 1 },
      };
      expect(factoryMoves(capped)).toEqual([{ kind: "cancelWorkOrder" }]);
    });
  });

  it("places a work order for nothing, and logs it", () => {
    partThree(() => {
      const result = applyMove(
        mine(true),
        { kind: "placeWorkOrder", blueprint: "blasting-charge" },
        0,
      );
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") {
        return;
      }
      expect(result.mountain.station.kind).toBe("delivering");
      expect(result.spent).toEqual(EMPTY_STOCK);
      expect(result.events).toEqual([
        { kind: "workOrderPlaced", blueprint: "blasting-charge" },
      ]);
      expect(
        fieldEntry({ kind: "workOrderPlaced", blueprint: "blasting-charge" }),
      ).toEqual({ code: "work.place", data: { id: "blasting-charge" } });
    });
  });

  it("cancels one and gives back what arrived, and logs it", () => {
    partThree(() => {
      const busy = mine(true, {
        kind: "delivering",
        blueprint: "iron-rails",
        arrived: { ...EMPTY_STOCK, stones: 700, iron: 900 },
      });
      const result = applyMove(busy, { kind: "cancelWorkOrder" }, 0);
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") {
        return;
      }
      expect(result.mountain.station).toEqual({ kind: "idle" });
      expect(result.gained).toEqual({ ...EMPTY_STOCK, stones: 700, iron: 2 });
      expect(result.events).toEqual([
        { kind: "workOrderCancelled", blueprint: "iron-rails" },
      ]);
      expect(
        fieldEntry({ kind: "workOrderCancelled", blueprint: "iron-rails" }),
      ).toEqual({ code: "work.cancel", data: { id: "iron-rails" } });
    });
  });

  it("installs a done one at the tap's moment, and logs the gear's level", () => {
    partThree(() => {
      const done = mine(true, { kind: "done", blueprint: "blasting-charge" });
      const result = applyMove(done, { kind: "installWorkOrder" }, 7_000);
      expect(result.kind).toBe("applied");
      if (result.kind !== "applied") {
        return;
      }
      expect(result.mountain.clocks["blasting-charge"]).toBe(7_000 + CHARGE_MS);
      expect(result.events).toEqual([
        { kind: "workOrderInstalled", blueprint: "blasting-charge", level: 1 },
      ]);
      expect(
        fieldEntry({
          kind: "workOrderInstalled",
          blueprint: "blasting-charge",
          level: 1,
        }),
      ).toEqual({
        code: "work.install",
        data: { id: "blasting-charge", count: 1 },
      });
    });
  });

  it("refuses every factory move with part 3 off, or with nothing to act on", () => {
    partTwo(() => {
      for (const move of [
        { kind: "placeWorkOrder", blueprint: "iron-rails" },
        { kind: "cancelWorkOrder" },
        { kind: "installWorkOrder" },
      ] as const) {
        expect(
          applyMove(
            mine(true, { kind: "done", blueprint: "reinforce" }),
            move,
            0,
          ).kind,
        ).toBe("refused");
      }
    });
    partThree(() => {
      expect(applyMove(mine(true), { kind: "cancelWorkOrder" }, 0).kind).toBe(
        "refused",
      );
      expect(applyMove(mine(true), { kind: "installWorkOrder" }, 0).kind).toBe(
        "refused",
      );
    });
  });

  it("is worth nothing to the lab yet, and costs no stone (#675)", () => {
    partThree(() => {
      const action: Action = {
        kind: "placeWorkOrder",
        blueprint: "iron-rails",
      };
      expect(
        valueOf(mine(true), action, 600, { liveSeconds: 1, awaySeconds: 1 }),
      ).toEqual({ gainPerSec: 0, cost: 0, paybackSec: Infinity });
      expect(sticker(mine(true), action)).toBe(0);
    });
  });
});
