import {
  BUILDINGS,
  buildingById,
  nextBuilding,
  stepRequires,
  type Building,
  type Site,
  type StepIndex,
} from "./city";
import { factoryOpen } from "./factory";
import { formatCompact } from "./format";
import { makerOpen } from "./makers";
import type { Mountain } from "./mountain";
import { workforceCount } from "./next-view";
import { slice2Part2On } from "./part-switch";
import { EMPTY_STOCK, priceAmount, type GoodId } from "./stock";
import { stockpileFull, stockpileRoom, stockyardOpen } from "./stockyard";
import { tierById, tierQuote, type BuyAmount } from "./tiers";
import { freeWorkers } from "./workforce";

/**
 * What the frame shows on every site (#659; spec, "The frame, the same on
 * every site"): the order strip, the stockpiles, the count of workers and
 * the hire key. Pure: it reads the mountain and never writes it.
 */

/** The step names, in order (spec, rule 6). The shift report says them too. */
export const STEP_NAMES: Readonly<Record<StepIndex, string>> = {
  0: "Foundation",
  1: "Structure",
  2: "Roof",
};

/** A good as the frame says it: "Stone", not "stones". */
export const GOOD_NAMES: Readonly<Record<GoodId, string>> = {
  stones: "Stone",
  brick: "Brick",
  cutStone: "Cut stone",
  glass: "Glass",
  parts: "Parts",
};

/** A good inside a line, as the night's report and the refinery's plates say it: "stone". */
export const GOOD_WORDS = {
  stones: "stone",
  brick: "brick",
  cutStone: "cut stone",
  glass: "glass",
  parts: "parts",
} as const satisfies Readonly<Record<GoodId, string>>;

/** A pip for each of the three steps: built, in hand, or still to come. */
export type Pip = "done" | "now" | "later";

/** One good the step requires, and what of it is built in. */
export type Requirement = {
  readonly good: GoodId;
  readonly name: string;
  readonly built: number;
  readonly requires: number;
  /** "Stone 1,200 of 250K". */
  readonly line: string;
};

/** The order strip. */
export type OrderStrip =
  /** A building in hand, ordered or not. */
  | {
      readonly kind: "project";
      readonly name: string;
      /** "Foundation · not ordered", "Structure · delivering", "Roof · on hold". */
      readonly step: string;
      /** The step alone: "Foundation". A save card has no room for its state (#707). */
      readonly stepName: string;
      readonly requires: readonly Requirement[];
      readonly pips: readonly [Pip, Pip, Pip];
    }
  /** After the part's last roof: nothing to order until the next part is live. */
  | {
      readonly kind: "planning";
      /** The last building operational. */
      readonly name: string;
      readonly line: string;
      readonly pips: readonly [Pip, Pip, Pip];
    };

const STATE_WORDS: Readonly<Record<Mountain["project"]["kind"], string>> = {
  unordered: "not ordered",
  delivering: "delivering",
  onHold: "on hold",
};

function pips(step: StepIndex): readonly [Pip, Pip, Pip] {
  const pip = (at: StepIndex): Pip =>
    at < step ? "done" : at === step ? "now" : "later";
  return [pip(0), pip(1), pip(2)];
}

/** What a step requires, good by good, with what is built in of each. */
export function requirements(site: Site): Requirement[] {
  return stepRequires(site).map(({ good }) => {
    const requires = priceAmount(stepRequires(site), good);
    const built = site.arrived[good] - site.onSite[good];
    const name = GOOD_NAMES[good];
    return {
      good,
      name,
      built,
      requires,
      line: `${name} ${formatCompact(built)} of ${formatCompact(requires)}`,
    };
  });
}

/** The site of the project in hand, or the next building's first step before the order. */
function siteInHand(
  mountain: Mountain,
  next: Building | undefined,
): Site | undefined {
  if (mountain.project.kind !== "unordered") {
    return mountain.project.site;
  }
  return next === undefined
    ? undefined
    : {
        building: next.id,
        step: 0,
        arrived: EMPTY_STOCK,
        onSite: EMPTY_STOCK,
      };
}

/** The proposed line after the part's last roof (spec, "While a part is the end of the game"). */
function planningLine(building: Building): string {
  return `${building.name} is operational · the city is planning its next building`;
}

export function orderStrip(mountain: Mountain): OrderStrip {
  const next = nextBuilding(mountain);
  const site = siteInHand(mountain, next);
  if (site === undefined) {
    const last = BUILDINGS.filter((building) =>
      mountain.operational.includes(building.id),
    ).at(-1);
    return {
      kind: "planning",
      name: last?.name ?? "",
      line: last === undefined ? "" : planningLine(last),
      pips: ["done", "done", "done"],
    };
  }
  return {
    kind: "project",
    name: buildingById(site.building).name,
    step: `${STEP_NAMES[site.step]} · ${STATE_WORDS[mountain.project.kind]}`,
    stepName: STEP_NAMES[site.step],
    requires: requirements(site),
    pips: pips(site.step),
  };
}

/** One stockpile in the top row. Part 1 has no stockyard, so it has no room. */
export type Stockpile = {
  readonly good: GoodId;
  readonly count: number;
  readonly text: string;
  /** Once the stockyard is open (part 2, #671): "of 6M", how full, and full. */
  readonly room?: string;
  readonly fill?: number;
  readonly full?: boolean;
};

/** The good the saws make: its stockpile shows once they open (part 3, #754). */
const SAWS_GOOD: GoodId = "cutStone";

/** `goods`, with cut stone once the saws open, and Part 2 goods (glass, parts) once open (#754, #779). */
function withOpenGoods(
  mountain: Pick<Mountain, "operational" | "mineLevels">,
  goods: readonly GoodId[],
): readonly GoodId[] {
  const hasSaw = makerOpen(mountain, "saw");
  const hasGlass = slice2Part2On() && makerOpen(mountain, "glassworks");
  const hasParts = slice2Part2On() && factoryOpen(mountain);
  if (!hasSaw && !hasGlass && !hasParts) {
    return goods;
  }
  return [
    ...goods,
    ...(hasSaw ? [SAWS_GOOD] : []),
    ...(hasGlass ? (["glass"] as const) : []),
    ...(hasParts ? (["parts"] as const) : []),
  ];
}

/** The goods shown in the frame stockpile strip before Part 2 UI (#779). */
const BASE_STOCKPILE_GOODS: readonly GoodId[] = ["stones", "brick"];

/**
 * The goods he has met: stone, and brick once the stockyard opens with the
 * Light Tower in part 2 (#671), each with its room, cut stone once the
 * saws open with the Granite in part 3 (#754), and glass/parts once Part 2
 * opens them (#779). Part 1 has stone alone, with no room.
 */
export function stockpiles(mountain: Mountain): readonly Stockpile[] {
  if (!stockyardOpen(mountain)) {
    const count = mountain.stock.stones;
    return [{ good: "stones", count, text: formatCompact(count) }];
  }
  return withOpenGoods(mountain, BASE_STOCKPILE_GOODS).map((good) => {
    const count = mountain.stock[good];
    const room = stockpileRoom(mountain, good);
    return {
      good,
      count,
      text: formatCompact(count),
      room: `of ${formatCompact(room)}`,
      fill: room > 0 ? Math.min(1, count / room) : 0,
      full: stockpileFull(mountain, good),
    };
  });
}

/** The stockyard's bays left to right, and the shift report's marks: brick, then stone (#671). */
export const BAY_ORDER: readonly GoodId[] = ["brick", "stones"];

/** The stockyard's bays left to right: brick and stone, then cut stone, glass, and parts as each opens (#754, #779). */
export function bayOrder(
  mountain: Pick<Mountain, "operational" | "mineLevels">,
): readonly GoodId[] {
  return withOpenGoods(mountain, BAY_ORDER);
}

/** The count of workers in the top row, and the hire key beside it. */
export type WorkersView = {
  readonly owned: number;
  readonly free: number;
  /** Green while the workforce has something he can afford (Work boots). */
  readonly lamp: boolean;
};

export function workersView(mountain: Mountain): WorkersView {
  return {
    owned: mountain.owned.helper,
    free: freeWorkers(mountain),
    lamp: workforceCount(mountain) > 0,
  };
}

/** The hire key: how many a tap hires at the amount key's amount, and what they cost. */
export type HireKey = {
  readonly count: number;
  readonly cost: number;
  readonly can: boolean;
  /** "+Worker", "+10 Workers". */
  readonly face: string;
  /** "1,300", "14.2K". */
  readonly price: string;
};

export function hireKey(mountain: Mountain, amount: BuyAmount): HireKey {
  const { count, cost } = tierQuote(mountain, tierById("helper"), amount);
  return {
    count,
    cost,
    can: cost <= mountain.stock.stones,
    face: count === 1 ? "+Worker" : `+${formatCompact(count)} Workers`,
    price: formatCompact(cost),
  };
}
