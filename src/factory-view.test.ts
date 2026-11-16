import { describe, expect, it } from "vitest";
import { withFactors } from "./economy/factors";
import {
  BLUEPRINT_IDS,
  IDLE_STATION,
  type BlueprintId,
  type Station,
} from "./factory";
import {
  STATION_IDLE,
  STATION_IDLE_LINE,
  factoryView,
  type FactoryView,
} from "./factory-view";
import { NO_GRANITE_PILES, NO_LEVEL_MACHINES } from "./mine-levels";
import { createMountain, type Mountain } from "./mountain";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { formatSpeed } from "./screen-words";
import { EMPTY_STOCK, type Stock } from "./stock";
import { NOTHING_CRAFTED, type RecipeId } from "./workshop";

/** The factory's screen (slice 1, part 3, #681): numbers, never the answer. */
const partThree = <T>(body: () => T): T =>
  withFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 }, body);

const delivering = (
  blueprint: BlueprintId,
  arrived: Partial<Stock> = {},
): Station => ({
  kind: "delivering",
  blueprint,
  arrived: { ...EMPTY_STOCK, ...arrived },
});

/** The shaft sunk, `wagons` horse wagons with a driver each, this stock and this station. */
function sunk({
  wagons = 4,
  stock = {},
  station = IDLE_STATION,
  crafted = {},
  clocks = {},
}: {
  wagons?: number;
  stock?: Partial<Stock>;
  station?: Station;
  crafted?: Partial<Record<RecipeId, number>>;
  clocks?: Partial<Mountain["clocks"]>;
} = {}): Mountain {
  const start = createMountain();
  return {
    ...start,
    owned: { ...start.owned, helper: wagons },
    jobs: { ...start.jobs, drilling: 0, driving: wagons },
    fleet: { ...start.fleet, horseWagon: wagons },
    stock: { ...EMPTY_STOCK, ...stock },
    operational: ["lightTower", "warehouse"],
    granite: {
      kind: "sunk",
      machines: NO_LEVEL_MACHINES,
      piles: NO_GRANITE_PILES,
    },
    crafted: { ...NOTHING_CRAFTED, ...crafted },
    clocks: { ...start.clocks, ...clocks },
    station,
  };
}

const view = (mountain: Mountain, now = 0): FactoryView =>
  partThree(() => factoryView(mountain, now));

describe("the factory's bins (#681)", () => {
  it("has a bin for each material with its count, what it holds and its source", () => {
    const bins = view(sunk({ stock: { clay: 8, iron: 11 } })).bins;
    expect(bins.map((bin) => bin.text)).toEqual([
      "Clay 8/10 · source: Topsoil",
      "Iron 11/35 · source: Granite",
    ]);
    expect(bins.map((bin) => [bin.good, bin.count, bin.holds])).toEqual([
      ["clay", 8, 10],
      ["iron", 11, 35],
    ]);
  });
});

describe("the station (#681)", () => {
  it("says it is idle, and how a work order is placed", () => {
    const station = view(sunk()).station;
    expect(station).toEqual({
      kind: "idle",
      title: STATION_IDLE,
      line: STATION_IDLE_LINE,
    });
    expect(STATION_IDLE).toBe("Station idle");
    expect(STATION_IDLE_LINE).toBe(
      "Drag a blueprint here. Transport brings the materials.",
    );
  });

  it("shows a work order delivering: its blueprint, what arrives a second, how far, and each good", () => {
    const station = view(
      sunk({
        stock: { stones: 1_000_000, clay: 10, iron: 35 },
        station: delivering("sturdy-props", {
          stones: 105_000,
          clay: 1_500,
          iron: 0,
        }),
      }),
    ).station;
    if (station.kind !== "delivering") {
      throw new Error(`delivering, not ${station.kind}`);
    }
    expect(station.blueprint).toBe("sturdy-props");
    expect(station.title).toBe("Sturdy props");
    // Four wagons, 9 loads a second each, all to the station, split evenly
    // between the three goods: 12 stone, and 12 loads of clay and of iron,
    // a clay or an iron a load of 500. Goods, not loads: 12.05 a second.
    expect(station.line).toBe("arriving 12/s");
    expect(station.goods.map((good) => good.text)).toEqual([
      "Stone 105K of 250K",
      "Clay 3 of 10",
      "Iron 0 of 4",
    ]);
    // 106,500 of 257,000 loads: 41%.
    expect(station.percent).toBe("41%");
    expect(station.share).toBeCloseTo(106_500 / 257_000);
    expect(station.cancel).toBe("Cancel · what arrived goes back");
  });

  it("counts goods arriving, not loads: an iron-only work order brings little a second", () => {
    const station = view(
      sunk({
        stock: { stones: 0, clay: 0, iron: 35 },
        station: delivering("reinforce", {}),
      }),
    ).station;
    if (station.kind !== "delivering") {
      throw new Error(`delivering, not ${station.kind}`);
    }
    // 36 loads a second of iron, 500 to an iron: 0.072 iron a second.
    expect(station.line).toBe(`arriving ${formatSpeed(36 / 500)}/s`);
  });

  it("names no limit when a material it requires is out of stock: the count says it", () => {
    const station = view(
      sunk({
        stock: { stones: 0, clay: 0 },
        station: delivering("blasting-charge", { stones: 50_000 }),
      }),
    ).station;
    if (station.kind !== "delivering") {
      throw new Error(`delivering, not ${station.kind}`);
    }
    expect(station.line).toBe("arriving 0/s");
    expect(station.goods.map((good) => good.text)).toEqual([
      "Stone 50K of 50K",
      "Clay 0 of 4",
    ]);
    expect(JSON.stringify(station)).not.toMatch(
      /waiting|no clay|bottleneck|limit/i,
    );
  });

  it("shows a done work order with its effect and the key that installs it", () => {
    const station = view(
      sunk({ station: { kind: "done", blueprint: "iron-rails" } }),
    ).station;
    expect(station).toMatchObject({
      kind: "done",
      blueprint: "iron-rails",
      title: "Iron rails: complete",
      line: "Carts +25%",
      install: "Install",
      installable: true,
      cancel: "Cancel · what arrived goes back",
    });
  });

  it("offers no install when the gear reached its last level meanwhile", () => {
    const station = view(
      sunk({
        station: { kind: "done", blueprint: "sturdy-props" },
        crafted: { "sturdy-props": 1 },
      }),
    ).station;
    expect(station).toMatchObject({ kind: "done", installable: false });
  });
});

describe("the blueprints (#681)", () => {
  it("lie under the station, each with its effect and what it requires", () => {
    const cards = view(
      sunk({ stock: { stones: 300_000, clay: 2 } }),
    ).blueprints;
    expect(cards.map((card) => card.id)).toEqual(BLUEPRINT_IDS);
    expect(cards.map((card) => [card.name, card.effect])).toEqual([
      ["Iron rails", "Carts +25%"],
      ["Sturdy props", "Trouble 30% rarer"],
      ["Blasting charge", "Throughput ×2 for 20 min"],
      ["Reinforce", "Drills +5%"],
      ["Axle grease", "Throughput ×2 for 20 min"],
    ]);
    expect(cards[1]?.requires.map((need) => need.text)).toEqual([
      "250K",
      "10",
      "4",
    ]);
    expect(cards[1]?.requires.map((need) => need.good)).toEqual([
      "stones",
      "clay",
      "iron",
    ]);
    // What the stockyard holds less than: shown, not said.
    expect(cards[1]?.requires.map((need) => need.short)).toEqual([
      false,
      true,
      true,
    ]);
  });

  it("count what is installed of the last level, and say when it is full", () => {
    const cards = view(
      sunk({ crafted: { "iron-rails": 1, "sturdy-props": 1 } }),
    ).blueprints;
    expect(cards.map((card) => card.level)).toEqual([
      "1/2",
      "1/1",
      "",
      "0/5",
      "",
    ]);
    expect(cards[1]).toMatchObject({ state: "installed" });
    expect(cards[1]?.requires).toEqual([]);
    expect(cards[1]?.line).toBe("Fully installed");
  });

  it("are placeable on an idle station only", () => {
    const idle = view(sunk()).blueprints;
    expect(idle.every((card) => card.state === "open")).toBe(true);
    const busy = view(sunk({ station: delivering("reinforce") })).blueprints;
    expect(busy.every((card) => card.state === "busy")).toBe(true);
  });

  it("name the machine reinforce lifts now", () => {
    const start = createMountain();
    const drills = view({
      ...sunk(),
      owned: { ...start.owned, cart: 1, drill: 2 },
    }).blueprints;
    expect(drills[3]?.effect).toBe("Borers +5%");
  });
});

describe("the factory's head (#681)", () => {
  it("says what is installed of the lasting gear", () => {
    expect(view(sunk({ crafted: { "iron-rails": 1 } })).installed).toBe(
      "Installed: rails 1/2 · props 0/1 · reinforce 0/5",
    );
  });

  it("says a live timer while it runs", () => {
    const minute = 60_000;
    expect(
      view(sunk({ clocks: { "blasting-charge": 14 * minute } }), 0).timers,
    ).toEqual(["Throughput ×2: 14:00"]);
    expect(view(sunk(), 0).timers).toEqual([]);
  });
});
