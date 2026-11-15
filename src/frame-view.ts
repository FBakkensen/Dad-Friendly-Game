import {
  BUILDINGS,
  buildingById,
  nextBuilding,
  stepRequires,
  type Building,
  type Site,
  type StepIndex,
} from "./city";
import { formatCompact } from "./format";
import type { Mountain } from "./mountain";
import { workforceCount } from "./next-view";
import { EMPTY_STOCK, priceAmount, type GoodId } from "./stock";
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
const GOOD_NAMES: Readonly<Record<GoodId, string>> = {
  stones: "Stone",
  clay: "Clay",
  iron: "Iron",
  crystal: "Crystal",
  heartstone: "Heartstone",
  // Part 2 (#666): not on screen until the refinery's sliver (#671).
  brick: "Brick",
};

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
};

/** The goods he has met. Part 1 has one, stone. */
export function stockpiles(mountain: Mountain): readonly Stockpile[] {
  const count = mountain.stock.stones;
  return [{ good: "stones", count, text: formatCompact(count) }];
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
