import { formatCompact, shiftDuration } from "./format";
import { BAY_ORDER, GOOD_NAMES, stockpiles } from "./frame-view";
import {
  makerMakes,
  makerPrice,
  makerTakes,
  runningKilns,
  kilnRate,
} from "./makers";
import { chainIncome, kilnHolds, topsoilChain } from "./mine-piles";
import { PILE_LABELS, levelPlate, pileWords } from "./mine-view";
import { accrueAway, type Mountain } from "./mountain";
import { crewTimer } from "./rates";
import { plural } from "./screen-words";
import { canPay, type GoodId } from "./stock";
import { MAX_STOCKYARD_LEVEL, ROOM_GROWTH, expandPrice } from "./stockyard";
import { placeable } from "./workforce";
import { NO_KILNS } from "./workforce-view";

/**
 * The refinery on slice 1's frame (#671; spec, The refinery): a flow from
 * top to bottom. The Topsoil's rock comes up, fills the kilns' own pile
 * first, and what finds no room there bypasses to stone. The kilns' plate
 * reads like a stage's row, and the stockyard is at the foot. The page shows
 * the numbers and never names the one that limits. Pure: it reads the
 * mountain and never writes it.
 */

/** The bypass chute's recipe: a rock no maker takes is a stone. */
export const BYPASS_RECIPE = "1 rock → 1 stone";

/** The key for one more kiln, in the mine keys' form. */
type KilnKey = {
  /** "+Kiln · 12/s". */
  readonly face: string;
  readonly price: string;
  /** "1 to run". */
  readonly staff: string;
  readonly can: boolean;
  readonly label: string;
};

/** The kilns' plate. */
export type KilnPlate = {
  /** "Recipe: 2 rock → 1 brick". */
  readonly recipe: string;
  readonly name: "Kilns";
  /** What the kilns make now, and what the running kilns can make. */
  readonly now: string;
  readonly can: string;
  readonly unit: "brick/s";
  /** "4 kilns: 4 of 4 workers", "1 of 2 kilns: 1 of 2 workers", "No kilns yet". */
  readonly machines: string;
  /** "+ 2 without a kiln": workers on the job with no kiln to run. */
  readonly idle?: string;
  /** "Rock at the kilns: 120 of 300", while he owns a kiln. */
  readonly pile?: string;
  readonly workers: number;
  /** For − and +, as a job's row has them. */
  readonly job: "kilns";
  readonly canPlace: boolean;
  readonly canFree: boolean;
  readonly key: KilnKey;
};

/** One stockpile's bay at the foot. */
export type Bay = {
  readonly good: GoodId;
  /** "Brick 20.8K of 1M". */
  readonly text: string;
  /** 0..1 of its room. */
  readonly fill: number;
  readonly full: boolean;
};

/** "Expand the stockyard", while a level is left. */
type ExpandKey = {
  readonly price: string;
  readonly can: boolean;
  /** "Full after 26 min unattended.", read once a second by the site. */
  readonly gives: string;
};

export type StockyardView = {
  readonly bays: readonly Bay[];
  readonly expand?: ExpandKey;
};

/** What the scene draws: how full and how busy each part is. */
export type RefineryScene = {
  /** The kilns' pile, 0..1 of its room: the hopper is as full. */
  readonly hopper: number;
  readonly kilns: number;
  readonly running: number;
  /** Rock comes up, brick is made, stone bypasses. */
  readonly lifting: boolean;
  readonly making: boolean;
  readonly bypassing: boolean;
  readonly bays: readonly Bay[];
};

export type RefineryView = {
  /** "Topsoil" and the rock hoisting lifts now. */
  readonly hopper: { readonly name: string; readonly rate: string };
  readonly plate: KilnPlate;
  readonly bypass: { readonly rate: string; readonly recipe: string };
  readonly stockyard: StockyardView;
  readonly scene: RefineryScene;
};

const rate = (perSecond: number): string => `${formatCompact(perSecond)}/s`;

/** What reaches the stockpiles a second now: brick from the kilns, the rest as stone. */
function incomeNow(
  mountain: Mountain,
  now: number | undefined,
): { readonly brick: number; readonly stones: number } {
  const timer = crewTimer(mountain, now);
  const income = chainIncome(topsoilChain(mountain));
  return {
    brick: (income.brick ?? 0) * timer,
    stones: (income.stones ?? 0) * timer,
  };
}

function machinesLine(owned: number, running: number): string {
  if (owned === 0) {
    return NO_KILNS;
  }
  // The mine's runs line (mine-view's partWords): what runs, then who runs it.
  const runs =
    running < owned ? `${String(running)} of ${String(owned)}` : String(owned);
  return `${runs} ${plural(owned, ["kiln", "kilns"])}: ${String(running)} of ${String(owned)} ${plural(owned, ["worker", "workers"])}`;
}

function kilnKey(mountain: Mountain): KilnKey {
  const price = makerPrice(mountain, "kiln");
  const amount = price[0]?.amount ?? 0;
  const makes = formatCompact(makerMakes("kiln"));
  return {
    face: `+Kiln · ${makes}/s`,
    price: formatCompact(amount),
    staff: "1 to run",
    can: canPay(mountain.stock, price),
    label: `Buy a kiln for ${formatCompact(amount)} stone. It makes ${makes} brick a second and takes 1 to run.`,
  };
}

function kilnPlate(
  mountain: Mountain,
  brickNow: number,
  timer: number,
): KilnPlate {
  const owned = mountain.makers.kiln;
  const running = runningKilns(mountain);
  const extra = mountain.jobs.kilns - owned;
  const holds = kilnHolds(mountain);
  return {
    recipe: `Recipe: ${String(makerTakes("kiln"))} rock → 1 brick`,
    name: "Kilns",
    now: formatCompact(brickNow),
    can: formatCompact(kilnRate(mountain) * timer),
    unit: "brick/s",
    machines: machinesLine(owned, running),
    ...(extra > 0
      ? {
          idle: `+ ${String(extra)} without a kiln`,
        }
      : {}),
    ...(holds > 0
      ? {
          pile: pileWords({
            label: PILE_LABELS.kiln,
            held: mountain.piles.kiln,
            holds,
          }),
        }
      : {}),
    workers: mountain.jobs.kilns,
    job: "kilns",
    canPlace: placeable(mountain, "kilns") > 0,
    canFree: mountain.jobs.kilns > 0,
    key: kilnKey(mountain),
  };
}

/** The stockpiles' bays, brick then stone, read from the top row's own stockpiles. */
function bays(mountain: Mountain): readonly Bay[] {
  const piles = stockpiles(mountain);
  return BAY_ORDER.flatMap((good) => {
    const pile = piles.find((each) => each.good === good);
    return pile?.room === undefined
      ? []
      : [
          {
            good,
            text: `${GOOD_NAMES[good]} ${pile.text} ${pile.room}`,
            fill: pile.fill ?? 0,
            full: pile.full === true,
          },
        ];
  });
}

/** Twelve hours: a night that runs longer holds. */
const FORECAST_MS = 12 * 60 * 60 * 1000;
/** Under this, the stockyard is as good as full now (the prototype's 40 s). */
const FULL_NOW_MS = 40 * 1000;

/**
 * How long a night lasts now (spec, The refinery: "Full after 26 min
 * unattended"): the night played on a copy from `now`, for at most twelve
 * hours, read from its report. It says what would happen, never what to buy.
 */
export function nightForecast(mountain: Mountain, now: number): string {
  const night = accrueAway({
    mountain,
    lastSeen: now,
    now: now + FORECAST_MS,
  }).report.night;
  if (night?.stop === "stockyard") {
    return night.producedMs < FULL_NOW_MS
      ? "Full now."
      : `Full after ${shiftDuration(night.producedMs)} unattended.`;
  }
  return (night?.producedMs ?? 0) > 0 ? "Holds 12 h unattended." : "No output.";
}

/** The gives line without the forecast: the site adds it, once a second. */
const EXPAND_GIVES = `Expansion: capacity ×${String(ROOM_GROWTH)}.`;

function expandKey(mountain: Mountain): ExpandKey | undefined {
  if (mountain.stockyard >= MAX_STOCKYARD_LEVEL) {
    return undefined;
  }
  const price = expandPrice(mountain);
  return {
    price: formatCompact(price[0]?.amount ?? 0),
    can: canPay(mountain.stock, price),
    gives: EXPAND_GIVES,
  };
}

/**
 * The refinery now. `now` is the clock for the crew's timers, as the mine's
 * rows read it. A kiln is bought one at a time (a maker has no amount key).
 */
export function refineryView(mountain: Mountain, now?: number): RefineryView {
  const hopper = levelPlate(mountain, now);
  const income = incomeNow(mountain, now);
  const yard = bays(mountain);
  const expand = expandKey(mountain);
  const holds = kilnHolds(mountain);
  return {
    hopper,
    plate: kilnPlate(mountain, income.brick, crewTimer(mountain, now)),
    bypass: { rate: rate(income.stones), recipe: BYPASS_RECIPE },
    stockyard: { bays: yard, ...(expand === undefined ? {} : { expand }) },
    scene: {
      hopper: holds > 0 ? Math.min(1, mountain.piles.kiln / holds) : 0,
      kilns: mountain.makers.kiln,
      running: runningKilns(mountain),
      lifting: hopper.lifted > 0,
      making: income.brick > 0,
      bypassing: income.stones > 0,
      bays: yard,
    },
  };
}
