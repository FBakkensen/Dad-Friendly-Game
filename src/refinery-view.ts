import { formatCompact, shiftDuration } from "./format";
import { BAY_ORDER, GOOD_NAMES, GOOD_WORDS, stockpiles } from "./frame-view";
import {
  makerJob,
  makerMakes,
  makerOutput,
  makerPrice,
  makerRate,
  makerTakes,
  refineryMakers,
  runningMakers,
  type MakerId,
  type MakerJob,
} from "./makers";
import { openGranite } from "./mine-levels";
import {
  chainMade,
  graniteChain,
  makerHolds,
  topsoilChain,
} from "./mine-piles";
import {
  PILE_LABELS,
  capital,
  levelHoppers,
  pileWords,
  type LevelHopper,
} from "./mine-view";
import { accrueAway, type Mountain } from "./mountain";
import { chainSpill, type Chain } from "./piles";
import { crewTimer } from "./rates";
import { MAKER_WORDS, plural } from "./screen-words";
import { canPay, type GoodId } from "./stock";
import { MAX_STOCKYARD_LEVEL, ROOM_GROWTH, expandPrice } from "./stockyard";
import { placeable } from "./workforce";
import { JOB_NAMES, noMakersYet } from "./workforce-view";

/**
 * The refinery on slice 1's frame (#671; spec, The refinery): a flow from
 * top to bottom. The Topsoil's rock comes up, fills the kilns' own pile
 * first, and what finds no room there bypasses to stone. The kilns' plate
 * reads like a stage's row, and the stockyard is at the foot. The page shows
 * the numbers and never names the one that limits. Pure: it reads the
 * mountain and never writes it.
 *
 * Part 3 (#754): once the Granite is open, its rock comes up into a hopper
 * of its own over the saws, whose plate reads as the kilns' does, and what
 * the saws' pile cannot take bypasses to stone with the Topsoil's.
 */

/** The bypass chute's recipe: a rock no maker takes is a stone. */
export const BYPASS_RECIPE = "1 rock → 1 stone";

/** The key for one more maker, in the mine keys' form. */
type MakerKey = {
  /** "+Kiln · 12/s", "+Saw · 30/s". */
  readonly face: string;
  readonly price: string;
  /** "1 to run". */
  readonly staff: string;
  readonly can: boolean;
  readonly label: string;
  /** The good its price is in, for the key's icon: stone for a kiln, brick for a saw. */
  readonly good: GoodId;
};

/** A maker's plate: the kilns', and the saws' once the Granite is open (#754). */
export type MakerPlate = {
  readonly id: MakerId;
  /** "Recipe: 2 rock → 1 brick". */
  readonly recipe: string;
  /** Its job's name: "Kilns", "Saws". */
  readonly name: (typeof JOB_NAMES)[MakerJob];
  /** What the makers make now, and what the running ones can make. */
  readonly now: string;
  readonly can: string;
  /** "brick/s", "cut stone/s". */
  readonly unit: `${(typeof GOOD_WORDS)[ReturnType<typeof makerOutput>]}/s`;
  /** "4 kilns: 4 of 4 workers", "1 of 2 kilns: 1 of 2 workers", "No kilns yet". */
  readonly machines: string;
  /** "+ 2 without a kiln": workers on the job with no maker to run. */
  readonly idle?: string;
  /** "Rock at the kilns: 120 of 300", while he owns one. */
  readonly pile?: string;
  readonly workers: number;
  /** For − and +, as a job's row has them. */
  readonly job: MakerJob;
  readonly canPlace: boolean;
  readonly canFree: boolean;
  readonly key: MakerKey;
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

/** The saws' side of the scene (#754): as the kilns' fields are. */
type SawScene = {
  /** The saws' pile, 0..1 of its room. */
  readonly hopper: number;
  readonly saws: number;
  readonly running: number;
  /** The Granite's rock comes up, into its own hopper. */
  readonly lifting: boolean;
  readonly making: boolean;
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
  /** Set only with the saws open. */
  readonly saws?: SawScene;
};

export type RefineryView = {
  /** Each open level's name and the rock hoisting lifts from it now: the Topsoil's, then the Granite's. */
  readonly hoppers: readonly LevelHopper[];
  /** The kilns', then the saws' once they are open. */
  readonly plates: readonly MakerPlate[];
  readonly bypass: { readonly rate: string; readonly recipe: string };
  readonly stockyard: StockyardView;
  readonly scene: RefineryScene;
};

const rate = (perSecond: number): string => `${formatCompact(perSecond)}/s`;

/** Each maker's level's chain now: the kilns' the Topsoil's, the saws' the Granite's while it is open. */
function makerChains(mountain: Mountain): Record<MakerId, Chain | undefined> {
  return { kiln: topsoilChain(mountain), saw: graniteChain(mountain) };
}

/**
 * What reaches the stockpiles a second now: each maker's good, and what no
 * maker takes on either level as stone.
 */
function incomeNow(
  mountain: Mountain,
  timer: number,
): {
  readonly made: Readonly<Record<MakerId, number>>;
  readonly stones: number;
} {
  const chains = makerChains(mountain);
  const made = (chain: Chain | undefined): number =>
    chain === undefined ? 0 : chainMade(chain) * timer;
  const stones = Object.values(chains).reduce(
    (sum, chain) => sum + (chain === undefined ? 0 : chainSpill(chain)),
    0,
  );
  return {
    made: { kiln: made(chains.kiln), saw: made(chains.saw) },
    stones: stones * timer,
  };
}

function machinesLine(id: MakerId, owned: number, running: number): string {
  if (owned === 0) {
    return noMakersYet(id);
  }
  // The mine's runs line (mine-view's partWords): what runs, then who runs it.
  const runs =
    running < owned ? `${String(running)} of ${String(owned)}` : String(owned);
  return `${runs} ${plural(owned, MAKER_WORDS[id])}: ${String(running)} of ${String(owned)} ${plural(owned, ["worker", "workers"])}`;
}

function makerKey(mountain: Mountain, id: MakerId): MakerKey {
  const price = makerPrice(mountain, id);
  const amount = formatCompact(price[0]?.amount ?? 0);
  const good = price[0]?.good ?? "stones";
  const makes = formatCompact(makerMakes(id));
  const [one] = MAKER_WORDS[id];
  return {
    face: `+${capital(one)} · ${makes}/s`,
    price: amount,
    staff: "1 to run",
    can: canPay(mountain.stock, price),
    label: `Buy a ${one} for ${amount} ${GOOD_WORDS[good]}. It makes ${makes} ${GOOD_WORDS[makerOutput(id)]} a second and takes 1 to run.`,
    good,
  };
}

/** The rock in a maker's pile: the kilns' on the Topsoil, the saws' on the Granite. */
function makerHeld(mountain: Mountain, id: MakerId): number {
  return id === "kiln"
    ? mountain.piles.kiln
    : (openGranite(mountain)?.piles.saw ?? 0);
}

/** A maker's pile's words while he owns one: "Rock at the kilns: 120 of 300". */
function makerPile(mountain: Mountain, id: MakerId): string | undefined {
  const holds = makerHolds(mountain, id);
  return holds > 0
    ? pileWords({
        label: PILE_LABELS[id],
        held: makerHeld(mountain, id),
        holds,
      })
    : undefined;
}

function makerPlate(
  mountain: Mountain,
  id: MakerId,
  made: number,
  timer: number,
): MakerPlate {
  const owned = mountain.makers[id];
  const job = makerJob(id);
  const workers = mountain.jobs[job];
  const extra = workers - owned;
  const pile = makerPile(mountain, id);
  const output = GOOD_WORDS[makerOutput(id)];
  return {
    id,
    recipe: `Recipe: ${String(makerTakes(id))} rock → 1 ${output}`,
    name: JOB_NAMES[job],
    unit: `${output}/s` as const,
    now: formatCompact(made),
    can: formatCompact(makerRate(mountain, id) * timer),
    machines: machinesLine(id, owned, runningMakers(mountain, id)),
    ...(extra > 0
      ? { idle: `+ ${String(extra)} without a ${MAKER_WORDS[id][0]}` }
      : {}),
    ...(pile === undefined ? {} : { pile }),
    workers,
    job,
    canPlace: placeable(mountain, job) > 0,
    canFree: workers > 0,
    key: makerKey(mountain, id),
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
  if (night.stop === "stockyard") {
    return night.producedMs < FULL_NOW_MS
      ? "Full now."
      : `Full after ${shiftDuration(night.producedMs)} unattended.`;
  }
  return night.producedMs > 0 ? "Holds 12 h unattended." : "No output.";
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
  const hoppers = levelHoppers(mountain, now);
  const timer = crewTimer(mountain, now);
  const income = incomeNow(mountain, timer);
  const makers = refineryMakers(mountain);
  const yard = bays(mountain);
  const expand = expandKey(mountain);
  return {
    hoppers,
    plates: makers.map((id) =>
      makerPlate(mountain, id, income.made[id], timer),
    ),
    bypass: { rate: rate(income.stones), recipe: BYPASS_RECIPE },
    stockyard: { bays: yard, ...(expand === undefined ? {} : { expand }) },
    scene: {
      hopper: pileFill(mountain, "kiln"),
      kilns: mountain.makers.kiln,
      running: runningMakers(mountain, "kiln"),
      lifting: lifted(hoppers, "topsoil"),
      making: income.made.kiln > 0,
      bypassing: income.stones > 0,
      bays: yard,
      ...(makers.includes("saw")
        ? {
            saws: {
              hopper: pileFill(mountain, "saw"),
              saws: mountain.makers.saw,
              running: runningMakers(mountain, "saw"),
              lifting: lifted(hoppers, "granite"),
              making: income.made.saw > 0,
            },
          }
        : {}),
    },
  };
}

/** Whether hoisting lifts any of a level's rock now: rock falls into its hopper. */
const lifted = (
  hoppers: readonly LevelHopper[],
  level: LevelHopper["level"],
): boolean => (hoppers.find((each) => each.level === level)?.lifted ?? 0) > 0;

/** A maker's pile, 0..1 of its room: its hopper is as full. */
function pileFill(mountain: Mountain, id: MakerId): number {
  const holds = makerHolds(mountain, id);
  return holds > 0 ? Math.min(1, makerHeld(mountain, id) / holds) : 0;
}
