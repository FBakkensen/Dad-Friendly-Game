import { formatCompact, shiftDuration } from "./format";
import { GOOD_NAMES, GOOD_WORDS, bayOrder, stockpiles } from "./frame-view";
import {
  MAKER_IDS,
  makerBuffer,
  makerInputRoom,
  makerInputs,
  makerJob,
  makerMakes,
  makerOutput,
  makerOutputAmount,
  makerPrice,
  makerRate,
  makerTakes,
  makerWorkersPerUnit,
  refineryMakers,
  runningMakers,
  type MakerId,
  type MakerInputId,
  type MakerJob,
} from "./makers";
import { shortestRound } from "./cages";
import { openGranite, openLevels, type MineLevelId } from "./mine-levels";
import {
  chainMade,
  graniteChain,
  makerHolds,
  mineWork,
  topsoilChain,
} from "./mine-piles";
import type { KeyPricePart } from "./mine-site";
import {
  PILE_LABELS,
  capital,
  levelHoppers,
  pileWords,
  type LevelHopper,
} from "./mine-view";
import { accrueAway, type Mountain } from "./mountain";
import { slice2Part1On } from "./part-switch";
import { chainFlows, chainSpill, type Chain } from "./piles";
import { crewTimer } from "./rates";
import { makerResearchMultiplier } from "./research";
import { MAKER_WORDS, formatSpeed, plural } from "./screen-words";
import { slice2LiveSnapshot } from "./slice2-flow";
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
 *
 * Slice 2 Part 1 (#769): under physical transport, makers draw from their
 * own finite input buffers (`makerBuffers`), and live output + stone flow
 * read from `slice2LiveSnapshot`.
 */

/** The bypass chute's recipe: a rock no maker takes is a stone. */
export const BYPASS_RECIPE = "1 rock → 1 stone";

/** One input buffer readout on a multi-input Refinery maker or Factory line (#779). */
export type InputBufferView = {
  readonly id: MakerInputId;
  readonly label: string;
  readonly held: number;
  readonly room: number;
  /** "450 of 4.5K". */
  readonly text: string;
  /** 0..1 fill fraction. */
  readonly fill: number;
  /** True while held is below one cycle's requirement. */
  readonly empty: boolean;
};

/** The key for one more maker or Factory line, in the mine keys' form. */
export type MakerKey = {
  /** "+Kiln · 12/s", "+Saw · 30/s", "+Glassworks · 25/s". */
  readonly face: string;
  readonly price: string;
  /** Present only for 2-good prices (#779). */
  readonly priceParts?: readonly KeyPricePart[];
  /** "1 to run", "2 to run", "3 to run". */
  readonly staff: string;
  readonly can: boolean;
  readonly label: string;
  /** Primary good of the price (stone for a kiln, brick for a saw/glassworks/press). */
  readonly good: GoodId;
};

/** A maker's plate: the kilns', the saws' once Granite is open (#754), and Glassworks once Crystal Caves is open (#779). */
export type MakerPlate = {
  readonly id: MakerId;
  /** "Recipe: 2 rock → 1 brick", "Recipe: 3 crystal rock + 2 stone → 1 glass". */
  readonly recipe: string;
  /** Its job's name: "Kilns", "Saws", "Glassworks". */
  readonly name: (typeof JOB_NAMES)[MakerJob];
  /** What the makers make now, and what the running ones can make. */
  readonly now: string;
  readonly can: string;
  /** "brick/s", "cut stone/s", "glass/s". */
  readonly unit: `${(typeof GOOD_WORDS)[ReturnType<typeof makerOutput>]}/s`;
  /** "4 kilns: 4 of 4 workers", "1 glassworks: 2 of 2 workers", "No kilns yet". */
  readonly machines: string;
  /** "+ 2 without a kiln": workers on the job with no maker to run. */
  readonly idle?: string;
  /** "Rock at the kilns: 120 of 300", while he owns one (single-input makers). */
  readonly pile?: string;
  /** Separate input buffers for multi-input makers (Glassworks). */
  readonly buffers?: readonly InputBufferView[];
  /** True when staffed units cannot complete a cycle (input empty or output full). */
  readonly standing: boolean;
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

/** The Glassworks side of the scene (#779). */
type GlassworksScene = {
  readonly hopper: number;
  readonly furnaces: number;
  readonly running: number;
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
  /** Set only with Glassworks open (Slice 2 Part 2, #779). */
  readonly glassworks?: GlassworksScene;
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

/** The level whose rock each rock-taking maker consumes (Slice 1 chains & Part 1 view). */
const MAKER_LEVELS: Readonly<Partial<Record<MakerId, MineLevelId>>> = {
  kiln: "topsoil",
  saw: "granite",
  glassworks: "crystal",
};

/** Each level's chain now: the Granite's only while it is open. */
const LEVEL_CHAINS: Readonly<
  Record<MineLevelId, (mountain: Mountain) => Chain | undefined>
> = {
  topsoil: topsoilChain,
  granite: graniteChain,
  crystal: () => undefined,
};

/** Each maker's level's chain now, read through `MAKER_LEVELS`. */
function makerChains(mountain: Mountain): Record<MakerId, Chain | undefined> {
  return {
    kiln: LEVEL_CHAINS.topsoil(mountain),
    saw: LEVEL_CHAINS.granite(mountain),
    glassworks: undefined,
    partsPress: undefined,
    precisionAssembly: undefined,
  };
}

/**
 * What a level's rock bypasses to stone a second, read steady (#754). The
 * cages unload in loads: right after one the makers' pile is full and the
 * rest bypasses, then the makers drain it until a cage that serves the
 * level comes again, at most `between` seconds later (the shortest round
 * trip among them, `shortestRound`, in the chain's seconds). So while the
 * pile's room is no more than the makers take in that time, the bypass
 * reads what the chain spills from a full pile: the lift past the makers.
 * Outside that window, and with no cage serving the level (part 2 has no
 * cages) or no lift, it is the chain's own spill now, which is 0 while the
 * pile has room: a pile filling from below shows no stone that does not
 * arrive. The night and the piles' rules are the chain's, untouched: this
 * is how the screen reads it.
 */
export function steadySpill(chain: Chain, between: number): number {
  const from = chain.spill?.from;
  const pile = from === undefined ? undefined : chain.piles[from];
  if (from === undefined || pile === undefined) {
    return chainSpill(chain);
  }
  const flows = chainFlows(chain);
  const lift = flows[from] ?? 0;
  const takes = (flows[from + 1] ?? 0) * (chain.takes?.[from + 1] ?? 1);
  const room = pile.holds - pile.held;
  if (room <= 0 || lift <= 0 || !(room <= takes * between)) {
    return chainSpill(chain);
  }
  const full = { held: pile.holds, holds: pile.holds };
  return chainSpill({
    ...chain,
    piles: chain.piles.map((each) => (each === pile ? full : each)),
  });
}

/**
 * What reaches the stockpiles a second now: each maker's good, and stone
 * arriving at the stockyard (via physical transport in Slice 2, or steady
 * spill in Slice 1).
 */
function incomeNow(
  mountain: Mountain,
  timer: number,
): {
  readonly made: Readonly<Record<MakerId, number>>;
  readonly stones: number;
} {
  if (slice2Part1On()) {
    const snap = slice2LiveSnapshot(mountain);
    return {
      made: {
        kiln: snap.makerOut.kiln * timer,
        saw: snap.makerOut.saw * timer,
        glassworks: snap.makerOut.glassworks * timer,
        partsPress: snap.makerOut.partsPress * timer,
        precisionAssembly: snap.makerOut.precisionAssembly * timer,
      },
      stones: snap.runRates.pitToStockyardStones * timer,
    };
  }
  const chains = makerChains(mountain);
  const made = (chain: Chain | undefined): number =>
    chain === undefined ? 0 : chainMade(chain) * timer;
  const { cages } = mineWork(mountain);
  const open = openLevels(mountain);
  /** The longest a maker's pile waits for a load, in the chain's seconds: none with no cage serving its level. */
  const between = (id: MakerId): number => {
    const level = MAKER_LEVELS[id];
    if (level === undefined) {
      return 0;
    }
    const round = shortestRound(cages, level, open);
    return Number.isFinite(round) ? round * timer : 0;
  };
  const stones = MAKER_IDS.reduce((sum, id) => {
    const chain = chains[id];
    return sum + (chain === undefined ? 0 : steadySpill(chain, between(id)));
  }, 0);
  return {
    made: {
      kiln: made(chains.kiln),
      saw: made(chains.saw),
      glassworks: 0,
      partsPress: 0,
      precisionAssembly: 0,
    },
    stones: stones * timer,
  };
}

const INPUT_LABELS: Readonly<Record<MakerInputId, string>> = {
  topsoilRock: "Topsoil rock",
  graniteRock: "Granite rock",
  crystalRock: "Crystal rock",
  stones: GOOD_NAMES.stones,
  brick: GOOD_NAMES.brick,
  cutStone: GOOD_NAMES.cutStone,
  glass: GOOD_NAMES.glass,
};

const INPUT_RECIPE_WORDS: Readonly<Record<MakerInputId, string>> = {
  topsoilRock: "rock",
  graniteRock: "rock",
  crystalRock: "crystal rock",
  stones: GOOD_WORDS.stones,
  brick: GOOD_WORDS.brick,
  cutStone: GOOD_WORDS.cutStone,
  glass: GOOD_WORDS.glass,
};

const OUTPUT_RECIPE_WORDS: Readonly<Record<GoodId, readonly [string, string]>> =
  {
    stones: [GOOD_WORDS.stones, GOOD_WORDS.stones],
    brick: [GOOD_WORDS.brick, GOOD_WORDS.brick],
    cutStone: [GOOD_WORDS.cutStone, GOOD_WORDS.cutStone],
    glass: [GOOD_WORDS.glass, GOOD_WORDS.glass],
    parts: ["part", GOOD_WORDS.parts],
  };

/** Recipe line shared by Refinery makers and Factory lines (#779). */
export function makerRecipeLine(id: MakerId): string {
  const inputs = makerInputs(id);
  const outAmt = makerOutputAmount(id);
  const output = plural(outAmt, OUTPUT_RECIPE_WORDS[makerOutput(id)]);
  if (inputs.length === 1) {
    return `Recipe: ${String(makerTakes(id))} rock → ${String(outAmt)} ${output}`;
  }
  const lhs = inputs
    .map((spec) => `${String(spec.amount)} ${INPUT_RECIPE_WORDS[spec.id]}`)
    .join(" + ");
  return `Recipe: ${lhs} → ${String(outAmt)} ${output}`;
}

/** Separate input buffer views for any multi-input maker or Factory line (#779). */
export function makerInputBuffers(
  mountain: Mountain,
  id: MakerId,
): readonly InputBufferView[] {
  return makerInputs(id).map((spec): InputBufferView => {
    const held = makerBuffer(mountain, id, spec.id);
    const room = makerInputRoom(mountain, id, spec.id);
    return {
      id: spec.id,
      label: INPUT_LABELS[spec.id],
      held,
      room,
      text: `${formatCompact(held)} of ${formatCompact(room)}`,
      fill: room > 0 ? Math.min(1, held / room) : 0,
      empty: held < spec.amount,
    };
  });
}

/** Shared machine-count and staffing line for Refinery makers and Factory lines (#779). */
export function makerMachinesLine(
  id: MakerId,
  owned: number,
  running: number,
): string {
  if (owned === 0) {
    return noMakersYet(id);
  }
  const perUnit = makerWorkersPerUnit(id);
  const runs =
    running < owned ? `${String(running)} of ${String(owned)}` : String(owned);
  const has = running * perUnit;
  const takes = owned * perUnit;
  return `${runs} ${plural(owned, MAKER_WORDS[id])}: ${String(has)} of ${String(takes)} ${plural(takes, ["worker", "workers"])}`;
}

/** Shared buy key view for Refinery makers and Factory lines (1- or 2-good prices, research multiplier). */
export function makerKeyView(mountain: Mountain, id: MakerId): MakerKey {
  const price = makerPrice(mountain, id);
  const priceParts: readonly KeyPricePart[] = price.map((line) => ({
    good: line.good,
    text: formatCompact(line.amount),
  }));
  const amount = priceParts[0]?.text ?? "0";
  const good = priceParts[0]?.good ?? "stones";
  const makes = formatSpeed(
    makerMakes(id, makerResearchMultiplier(mountain, id)),
  );
  const perUnit = makerWorkersPerUnit(id);
  const [one] = MAKER_WORDS[id];
  const priceWords = priceParts
    .map((part) => `${part.text} ${GOOD_WORDS[part.good]}`)
    .join(" and ");
  return {
    face: `+${capital(one)} · ${makes}/s`,
    price: amount,
    ...(priceParts.length > 1 ? { priceParts } : {}),
    staff: `${String(perUnit)} to run`,
    can: canPay(mountain.stock, price),
    label: `Buy a ${one} for ${priceWords}. It makes ${makes} ${GOOD_WORDS[makerOutput(id)]} a second and takes ${String(perUnit)} to run.`,
    good,
  };
}

/** The rock in a maker's input buffer (Slice 2) or pile (Slice 1). */
function makerHeld(mountain: Mountain, id: MakerId): number {
  if (slice2Part1On()) {
    const primary = makerInputs(id)[0]?.id ?? "topsoilRock";
    return makerBuffer(mountain, id, primary);
  }
  return id === "kiln"
    ? mountain.piles.kiln
    : (openGranite(mountain)?.piles.saw ?? 0);
}

/** Capacity of a maker's input buffer (Slice 2) or pile (Slice 1). */
function makerRoom(mountain: Mountain, id: MakerId): number {
  return slice2Part1On()
    ? makerInputRoom(mountain, id)
    : makerHolds(mountain, id);
}

/** A maker's pile's words while he owns one: "Rock at the kilns: 120 of 300". */
function makerPile(mountain: Mountain, id: MakerId): string | undefined {
  const holds = makerRoom(mountain, id);
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
  const running = runningMakers(mountain, id);
  const perUnit = makerWorkersPerUnit(id);
  const extra = workers - owned * perUnit;
  const multiInput = makerInputs(id).length > 1;
  const pile = multiInput ? undefined : makerPile(mountain, id);
  const buffers = multiInput ? makerInputBuffers(mountain, id) : undefined;
  const output = GOOD_WORDS[makerOutput(id)];
  return {
    id,
    recipe: makerRecipeLine(id),
    name: JOB_NAMES[job],
    unit: `${output}/s` as const,
    now: formatCompact(made),
    can: formatCompact(makerRate(mountain, id) * timer),
    machines: makerMachinesLine(id, owned, running),
    ...(extra > 0
      ? { idle: `+ ${String(extra)} without a ${MAKER_WORDS[id][0]}` }
      : {}),
    ...(pile === undefined ? {} : { pile }),
    ...(buffers === undefined ? {} : { buffers }),
    standing: running > 0 && made <= 0,
    workers,
    job,
    canPlace: placeable(mountain, job) > 0,
    canFree: workers > 0,
    key: makerKeyView(mountain, id),
  };
}

const COMPACT_BAY_NAMES: Readonly<Record<GoodId, string>> = {
  stones: "Stone",
  brick: "Brick",
  cutStone: "Cut",
  glass: "Glass",
  parts: "Parts",
};

/** The stockpiles' bays, read from the top row's own stockpiles (compact labels when 4+ bays). */
function bays(mountain: Mountain): readonly Bay[] {
  const piles = stockpiles(mountain);
  const order = bayOrder(mountain);
  const compact = order.length >= 4;
  return order.flatMap((good) => {
    const pile = piles.find((each) => each.good === good);
    return pile?.room === undefined
      ? []
      : [
          {
            good,
            text: compact
              ? `${COMPACT_BAY_NAMES[good]} ${pile.text}`
              : `${GOOD_NAMES[good]} ${pile.text} ${pile.room}`,
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
 * The refinery now. A kiln is bought one at a time (a maker has no amount key).
 */
export function refineryView(mountain: Mountain): RefineryView {
  const hoppers = levelHoppers(mountain);
  const timer = crewTimer();
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
      ...(makers.includes("glassworks")
        ? {
            glassworks: {
              hopper: pileFill(mountain, "glassworks"),
              furnaces: mountain.makers.glassworks,
              running: runningMakers(mountain, "glassworks"),
              lifting: lifted(hoppers, "crystal"),
              making: income.made.glassworks > 0,
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
  const holds = makerRoom(mountain, id);
  return holds > 0 ? Math.min(1, makerHeld(mountain, id) / holds) : 0;
}
