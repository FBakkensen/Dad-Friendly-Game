import {
  SITE_GOOD_CAP,
  applyCityWork,
  buildRate,
  goodsTotal,
  shareOutKeys,
  shareProportional,
} from "./building-site";
import { buildIn, receive, stillRequired, stillToBuild } from "./city";
import {
  FACTORY_LINES_FOR_GOOD,
  FACTORY_MAKER_IDS,
  distributeFactoryInput,
  factoryOutputRoom,
  hasOwnedFactoryLine,
  type FactoryInputGood,
  type FactoryMakerId,
} from "./factory";
import {
  MAKER_IDS,
  REFINERY_MAKER_IDS,
  makerBuffer,
  makerCycleLimit,
  makerInputRoom,
  makerInputs,
  makerOutput,
  makerOutputAmount,
  makerRate,
  makerRecord,
  makerSite,
  makerTakes,
  stepMakerCycle,
  type CycleInput,
  type MakerBuffers,
  type MakerId,
  type MakerInputId,
} from "./makers";
import { flowMineToPitheadLive } from "./mine-cages";
import {
  MINE_LEVEL_IDS,
  crystalOpen,
  graniteOpen,
  openLevels,
  type MineLevelId,
} from "./mine-levels";
import {
  flowUndergroundToPithead,
  pitheadRoom,
  steadyLevels,
  undergroundPitheadChains,
} from "./mine-piles";
import type { Mountain } from "./mountain";
import { slice2Part2On } from "./part-switch";
import { chainChange, chainFlows, evenShares, stepQuota } from "./piles";
import { receiveResearch, researchStillRequired } from "./research";
import {
  EMPTY_STOCK,
  GOOD_IDS,
  addedStock,
  pay as payStock,
  type GoodId,
  type Stock,
} from "./stock";
import { stockpileRoom } from "./stockyard";
import {
  CITY_RUN_GOODS,
  RUN_ORDER,
  STOCK_RUNS_BY_GOOD,
  allocateRunRates,
  applyTransportTransfer,
  cityRunId,
  factoryRunId,
  fleetRate,
  isMakerBufferOpen,
  planTransportTransfer,
  priceOf,
  researchRunId,
  runRecord,
  runSnapshots,
  type CityRunGood,
  type RunId,
} from "./transport";

/**
 * Slice 2 coupled-stretch simulation engine (#766, #771, spec rule 5.3).
 * Runtime stepping is imported by `src/mountain.ts`; steady-state lab queries
 * are also imported by `src/lab/fresh-kit.ts`.
 *
 * - Live play (`accrueSlice2Live`): fixed 1 s 4-phase order:
 *   (a) mine drilling/haulage/hoisting -> pithead (zero Stone bypass),
 *   (b) physical transport runs (water-filling + proportional source contention),
 *   (c) multi-input Refinery makers & steady-flow Factory lines with integer `cycleMicros`,
 *   (d) City builders (`shareOut`).
 * - Offline / rate play (`stretchSlice2`): deterministic event-driven stretches
 *   using damped fixed-point `coupledRates` and minimum time to next state
 *   change (1 s floor), keeping 8-hour live vs. offline agreement within <= 1%.
 */

export type Slice2Step = {
  readonly mountain: Mountain;
  readonly mined: number;
  readonly gained: Partial<Stock>;
  readonly settledAt: number;
  readonly producing: boolean;
};

const RATE_EPS = 1e-9;
const FILL_EPS = 1e-6;
const MAX_FIXED_POINT_PASSES = 32;
const LEVEL_KEYS: readonly MineLevelId[] = MINE_LEVEL_IDS;
const FACTORY_INPUT_GOODS: readonly FactoryInputGood[] = [
  "brick",
  "cutStone",
  "glass",
];

type FactorySplitMap = Readonly<
  Record<FactoryMakerId, Readonly<Partial<Record<FactoryInputGood, number>>>>
>;

/** Snapshot of converged continuous rates across the entire Slice 2 chain. */
type CoupledRates = {
  readonly hoist: Readonly<Record<MineLevelId, number>>;
  readonly runRates: Readonly<Record<RunId, number>>;
  readonly pitheadDrain: Readonly<Record<MineLevelId, number>>;
  readonly stoneFromPithead: Readonly<Record<MineLevelId, number>>;
  readonly makerOut: Readonly<Record<MakerId, number>>;
  readonly factorySplits: FactorySplitMap;
  readonly build: Readonly<Record<CityRunGood, number>>;
};

function stockDrainRate(
  runRates: Readonly<Record<RunId, number>>,
  good: GoodId,
): number {
  let sum = 0;
  for (const id of STOCK_RUNS_BY_GOOD[good]) {
    sum += runRates[id];
  }
  return sum;
}

function updatedMakerBuf(
  mountain: Mountain,
  id: MakerId,
  consumed: Readonly<Partial<Record<MakerInputId, number>>>,
): MakerBuffers[MakerId] {
  let changed = false;
  const next: Partial<Record<MakerInputId, number>> = {};
  for (const spec of makerInputs(id)) {
    const held = makerBuffer(mountain, id, spec.id);
    const used = consumed[spec.id] ?? 0;
    if (used > 0) {
      changed = true;
    }
    const left = held - used;
    if (left > 0) {
      next[spec.id] = left;
    }
  }
  return changed ? next : mountain.makerBuffers[id];
}

function stepSingleMaker(
  mountain: Mountain,
  id: MakerId,
  dt: number,
  pay: number,
  outRoom: number,
): {
  readonly changed: boolean;
  readonly buffer: MakerBuffers[MakerId];
  readonly nextMicros: number;
  readonly produced: number;
} {
  const prevMicros = mountain.cycleMicros[id] ?? 0;
  if (!isMakerBufferOpen(mountain, id)) {
    return {
      changed: false,
      buffer: mountain.makerBuffers[id],
      nextMicros: prevMicros,
      produced: 0,
    };
  }
  const inputs: CycleInput[] = makerInputs(id).map((spec) => ({
    id: spec.id,
    amount: spec.amount,
    held: makerBuffer(mountain, id, spec.id),
  }));
  const result = stepMakerCycle({
    inputs,
    outputAmount: makerOutputAmount(id),
    outputRoom: outRoom,
    staffedOutputRate: makerRate(mountain, id) * pay,
    dt,
    cycleMicros: prevMicros,
  });
  const buffer = updatedMakerBuf(mountain, id, result.consumed);
  const changed =
    buffer !== mountain.makerBuffers[id] ||
    result.produced > 0 ||
    result.nextMicros !== prevMicros;
  return {
    changed,
    buffer,
    nextMicros: result.nextMicros,
    produced: result.produced,
  };
}

function stockRoomWithExtra(
  mountain: Mountain,
  good: GoodId,
  extraStockRoom: Readonly<Partial<Record<GoodId, number>>>,
): number {
  const base = stockpileRoom(mountain, good) - mountain.stock[good];
  return Number.isFinite(base)
    ? Math.max(0, base + (extraStockRoom[good] ?? 0))
    : Number.MAX_SAFE_INTEGER;
}

/** Runs selected makers (`REFINERY_MAKER_IDS`, `FACTORY_MAKER_IDS`, or all) for `dt` seconds. */
function initialCycleMicrosMap(
  cycleMicros: Mountain["cycleMicros"],
): Map<MakerId, number> {
  const map = new Map<MakerId, number>();
  for (const id of MAKER_IDS) {
    const val = cycleMicros[id];
    if (val !== undefined && val > 0) {
      map.set(id, val);
    }
  }
  return map;
}

function factoryOutputQuotas(
  mountain: Mountain,
  ids: readonly MakerId[],
  dt: number,
  pay: number,
  roomLeft: number,
  tickIndex?: number,
): Partial<Record<FactoryMakerId, number>> {
  const active = FACTORY_MAKER_IDS.filter(
    (id) => ids.includes(id) && isMakerBufferOpen(mountain, id),
  );
  if (active.length <= 1 || roomLeft <= 0) {
    return Object.fromEntries(active.map((id) => [id, roomLeft]));
  }
  const wants: Partial<Record<FactoryMakerId, number>> = {};
  let totalWant = 0;
  for (const id of active) {
    const maxOut = stepSingleMaker(mountain, id, dt, pay, roomLeft).produced;
    wants[id] = maxOut;
    totalWant += maxOut;
  }
  if (totalWant <= roomLeft) {
    return wants;
  }
  const shares = shareOutKeys(roomLeft, active, wants, tickIndex ?? 0);
  const wPress = wants.partsPress ?? 0;
  const wPrec = wants.precisionAssembly ?? 0;
  const sPress = shares.partsPress ?? 0;
  const sPrec = shares.precisionAssembly ?? 0;
  if (sPress >= wPress || sPrec >= wPrec) {
    return shares;
  }
  const outAmt = makerOutputAmount("precisionAssembly");
  const pCycles =
    tickIndex !== undefined
      ? stepQuota(sPrec / outAmt, tickIndex)
      : Math.floor(sPrec / outAmt);
  const precRoom = Math.min(wPrec, roomLeft, pCycles * outAmt);
  return {
    partsPress: Math.min(wPress, Math.max(0, roomLeft - precRoom)),
    precisionAssembly: precRoom,
  };
}

function stepMakersList(
  mountain: Mountain,
  ids: readonly MakerId[],
  dt: number,
  pay: number,
  extraStockRoom: Readonly<Partial<Record<GoodId, number>>> = {},
  extraFactoryRoom = 0,
  tickIndex?: number,
): { readonly mountain: Mountain; readonly made: Partial<Stock> } {
  const made: Partial<Record<GoodId, number>> = {};
  const nextBuffers: Record<MakerId, MakerBuffers[MakerId]> = {
    ...mountain.makerBuffers,
  };
  const nextMicros = initialCycleMicrosMap(mountain.cycleMicros);
  let factoryProduced = 0;
  const factoryRoomLeft = Math.max(
    0,
    factoryOutputRoom(mountain) -
      mountain.factoryOutput.parts +
      extraFactoryRoom,
  );
  const factoryQuotas = factoryOutputQuotas(
    mountain,
    ids,
    dt,
    pay,
    factoryRoomLeft,
    tickIndex,
  );
  let changed = false;
  for (const id of ids) {
    const outGood = makerOutput(id);
    const isFactory = makerSite(id) === "factory";
    const outRoom = isFactory
      ? (factoryQuotas[id as FactoryMakerId] ?? 0)
      : stockRoomWithExtra(mountain, outGood, extraStockRoom);
    const step = stepSingleMaker(mountain, id, dt, pay, outRoom);
    if (step.nextMicros > 0) {
      nextMicros.set(id, step.nextMicros);
    } else {
      nextMicros.delete(id);
    }
    if (!step.changed) {
      continue;
    }
    changed = true;
    nextBuffers[id] = step.buffer;
    if (step.produced > 0 && isFactory) {
      factoryProduced += step.produced;
    } else if (step.produced > 0) {
      made[outGood] = (made[outGood] ?? 0) + step.produced;
    }
  }
  if (!changed) {
    return { mountain, made: {} };
  }
  return {
    mountain: {
      ...mountain,
      makerBuffers: nextBuffers,
      cycleMicros: Object.fromEntries(nextMicros),
      factoryOutput:
        factoryProduced > 0
          ? { parts: mountain.factoryOutput.parts + factoryProduced }
          : mountain.factoryOutput,
      stock:
        goodsTotal(made) > 0
          ? addedStock(mountain.stock, made)
          : mountain.stock,
    },
    made,
  };
}

/** Per-good City destination room for a 1 s tick with `buildCap` builder budget. */
function cityTickDestOverride(
  mountain: Mountain,
  buildCap: number,
): Partial<Record<RunId, number>> | undefined {
  if (mountain.project.kind !== "delivering" || buildCap <= 0) {
    return undefined;
  }
  const site = mountain.project.site;
  const need = stillRequired(site);
  const maxOnSite = CITY_RUN_GOODS.map(
    (good) =>
      site.onSite[good] +
      (need[good] > 0 ? Math.min(need[good], mountain.stock[good]) : 0),
  );
  const shares = evenShares(buildCap, maxOnSite);
  const override: Partial<Record<RunId, number>> = {};
  let hasOverride = false;
  for (const [idx, good] of CITY_RUN_GOODS.entries()) {
    if (need[good] > 0) {
      const headroom = Math.floor(shares[idx] ?? 0);
      const cap = Math.max(0, SITE_GOOD_CAP - site.onSite[good] + headroom);
      override[cityRunId(good)] = Math.min(need[good], cap);
      hasOverride = true;
    }
  }
  return hasOverride ? override : undefined;
}

/** Phase (d) of a 1 s step: City builders build from what is already on site. */
function stepBuildersOnly(
  mountain: Mountain,
  buildCap: number,
  tickIndex: number,
): Mountain {
  if (mountain.project.kind === "unordered" || buildCap <= 0) {
    return mountain;
  }
  const built = shareOutKeys(
    buildCap,
    GOOD_IDS,
    mountain.project.site.onSite,
    tickIndex,
  );
  return goodsTotal(built) > 0 ? buildIn(mountain, built) : mountain;
}

/** Shared Phases (b)–(d) for one discrete 1-second tick (live & 1 s offline stretches). */
function stepSlice2Surface(
  mountain: Mountain,
  pay: number,
  tickIndex: number,
): {
  readonly mountain: Mountain;
  readonly gained: Partial<Stock>;
} {
  const buildCap = stepQuota(buildRate(mountain) * pay, tickIndex);
  const transfer = planTransportTransfer(
    mountain,
    stepQuota(fleetRate(mountain) * pay, tickIndex),
    cityTickDestOverride(mountain, buildCap),
    tickIndex,
  );
  const moved = applyTransportTransfer(mountain, transfer, tickIndex);
  const made = stepMakersList(
    moved.mountain,
    MAKER_IDS,
    1,
    pay,
    {},
    0,
    tickIndex,
  );
  const after = stepBuildersOnly(made.mountain, buildCap, tickIndex);
  const gained: Partial<Record<GoodId, number>> = { ...made.made };
  if (moved.gainedStones > 0) {
    gained.stones = (gained.stones ?? 0) + moved.gainedStones;
  }
  if (moved.gainedParts > 0) {
    gained.parts = (gained.parts ?? 0) + moved.gainedParts;
  }
  return { mountain: after, gained };
}

/** One live 1-second tick in fixed 4-phase order (spec rule 5.3). */
function stepSlice2LiveSecond(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
  tickIndex: number,
): {
  readonly mountain: Mountain;
  readonly mined: number;
  readonly gained: Partial<Stock>;
} {
  const mine = flowMineToPitheadLive(mountain, 1, pay, drilling, tickIndex);
  const surface = stepSlice2Surface(mine.mountain, pay, tickIndex);
  return {
    mountain: surface.mountain,
    mined: mine.mined,
    gained: surface.gained,
  };
}

/** Advances live Slice 2 play from `from` to `to` in 1-second ticks. */
export function accrueSlice2Live(
  mountain: Mountain,
  from: number,
  to: number,
  pay: number,
  drilling = true,
): Slice2Step {
  const whole = Math.floor((to - from) / 1000);
  if (whole <= 0) {
    return {
      mountain,
      mined: 0,
      gained: {},
      settledAt: from,
      producing: false,
    };
  }
  const startTick = Math.floor(from / 1000);
  let state = mountain;
  let mined = 0;
  let gained: Stock = EMPTY_STOCK;
  for (let sec = 0; sec < whole; sec += 1) {
    const step = stepSlice2LiveSecond(state, pay, drilling, startTick + sec);
    state = step.mountain;
    mined += step.mined;
    if (goodsTotal(step.gained) > 0) {
      gained = addedStock(gained, step.gained);
    }
  }
  return {
    mountain: state,
    mined,
    gained,
    settledAt: from + whole * 1000,
    producing: mined > 0 || goodsTotal(gained) > 0,
  };
}

// ---------------------------------------------------------------------------
// Event-driven coupled-stretch solver (offline & rate play)

function openRunMap(mountain: Mountain): Record<RunId, boolean> {
  const out = runRecord(false);
  for (const snap of runSnapshots(mountain)) {
    out[snap.id] = snap.open;
  }
  return out;
}

function buildRatesFor(
  mountain: Mountain,
  pay: number,
  runRates: Readonly<Record<RunId, number>>,
): Record<CityRunGood, number> {
  const out: Record<CityRunGood, number> = { ...EMPTY_STOCK };
  if (mountain.project.kind === "unordered") {
    return out;
  }
  const site = mountain.project.site;
  const wants = CITY_RUN_GOODS.map((good) =>
    site.onSite[good] > 0 ? Infinity : runRates[cityRunId(good)],
  );
  const shares = evenShares(buildRate(mountain) * pay, wants);
  for (const [idx, good] of CITY_RUN_GOODS.entries()) {
    out[good] = shares[idx] ?? 0;
  }
  return out;
}

function makerInputConsPerSec(
  id: MakerId,
  inputId: MakerInputId,
  makerOutRate: number,
): number {
  const spec = makerInputs(id).find((entry) => entry.id === inputId);
  return spec === undefined
    ? 0
    : (makerOutRate / makerOutputAmount(id)) * spec.amount;
}

function tiedTwoLineSplit(
  r0: number,
  r1: number,
  h0: number,
  h1: number,
  a0: number,
  a1: number,
  c0: number,
  c1: number,
  totalRate: number,
): readonly [number, number] {
  if (h0 < a0 && h1 < a1 && totalRate <= c0 + c1 + RATE_EPS) {
    const shares = evenShares(totalRate, [c0, c1]);
    return [shares[0] ?? 0, shares[1] ?? 0];
  }
  if (h0 >= r0 && h1 >= r1) {
    const sumC = c0 + c1;
    return sumC > RATE_EPS
      ? [(totalRate * c0) / sumC, (totalRate * c1) / sumC]
      : [0, 0];
  }
  const k = (totalRate - c0 - c1) / Math.max(1, r0 + r1);
  const in0 = Math.max(0, Math.min(totalRate, c0 + k * r0));
  return [in0, Math.max(0, totalRate - in0)];
}

/** Maximum rate `id` can consume `good` limited only by staffed speed and its other inputs. */
function factoryLineInputDemand(
  mountain: Mountain,
  id: FactoryMakerId,
  good: FactoryInputGood,
  pay: number,
  runRates: Readonly<Record<RunId, number>>,
  factorySplits: FactorySplitMap,
): number {
  const outAmt = makerOutputAmount(id);
  let maxOut = makerRate(mountain, id) * pay;
  for (const spec of makerInputs(id)) {
    if (spec.id === good || makerBuffer(mountain, id, spec.id) >= spec.amount) {
      continue;
    }
    const specGood = spec.id as FactoryInputGood;
    // Another input also shared by both Factory lines must not feed back via
    // `prevSplits`, which would lock `brick` and `cutStone` into an arbitrary
    // room-weighted fixed point instead of the 50/50 starved split.
    const otherIn =
      FACTORY_LINES_FOR_GOOD[specGood].length > 1
        ? runRates[factoryRunId(specGood)]
        : makerInputRate(id, spec.id, runRates, factorySplits);
    maxOut = Math.min(maxOut, (otherIn / spec.amount) * outAmt);
  }
  return makerInputConsPerSec(id, good, maxOut);
}

function makerInputAmount(id: MakerId, inputId: MakerInputId): number {
  return makerInputs(id).find((s) => s.id === inputId)?.amount ?? 1;
}

/**
 * Whether a maker input buffer sits at its steady-state ceiling: at exact
 * capacity (`room === 0`) or within one 1 s tick's discrete consumption
 * (consumption rate + one cycle's rounding) after a 1 s Phase (b)->(c) step,
 * preventing `stretchSlice2` from looping 1 s at a time.
 */
function makerInputAtCeiling(
  capacity: number,
  held: number,
  consPerSec: number,
  cycleAmount: number,
): boolean {
  const room = capacity - held;
  if (room === 0) {
    return true;
  }
  return (
    slice2Part2On() &&
    room > 0 &&
    consPerSec > RATE_EPS &&
    held > 0 &&
    room <= Math.ceil(consPerSec) + 2 * cycleAmount
  );
}

function splitTwoFactoryLines(
  mountain: Mountain,
  good: FactoryInputGood,
  totalRate: number,
  pay: number,
  runRates: Readonly<Record<RunId, number>>,
  prevSplits: FactorySplitMap,
  makerOut: Readonly<Record<MakerId, number>>,
): readonly [number, number] {
  const r0 = makerInputRoom(mountain, "partsPress", good);
  const r1 = makerInputRoom(mountain, "precisionAssembly", good);
  const h0 = makerBuffer(mountain, "partsPress", good);
  const h1 = makerBuffer(mountain, "precisionAssembly", good);
  const a0 = makerInputAmount("partsPress", good);
  const a1 = makerInputAmount("precisionAssembly", good);
  if (h0 < a0 && h1 < a1) {
    const d0 = factoryLineInputDemand(
      mountain,
      "partsPress",
      good,
      pay,
      runRates,
      prevSplits,
    );
    const d1 = factoryLineInputDemand(
      mountain,
      "precisionAssembly",
      good,
      pay,
      runRates,
      prevSplits,
    );
    return tiedTwoLineSplit(r0, r1, h0, h1, a0, a1, d0, d1, totalRate);
  }
  const c0 = makerInputConsPerSec("partsPress", good, makerOut.partsPress);
  const c1 = makerInputConsPerSec(
    "precisionAssembly",
    good,
    makerOut.precisionAssembly,
  );
  if (
    makerInputAtCeiling(r0, h0, c0, a0) &&
    makerInputAtCeiling(r1, h1, c1, a1)
  ) {
    const sumC = c0 + c1;
    return sumC > RATE_EPS
      ? [(totalRate * c0) / sumC, (totalRate * c1) / sumC]
      : [0, 0];
  }
  const f0 = r0 > 0 ? h0 / r0 : 1;
  const f1 = r1 > 0 ? h1 / r1 : 1;
  if (f0 < f1 - FILL_EPS && h0 < r0) {
    return [totalRate, 0];
  }
  if (f1 < f0 - FILL_EPS && h1 < r1) {
    return [0, totalRate];
  }
  return tiedTwoLineSplit(r0, r1, h0, h1, a0, a1, c0, c1, totalRate);
}

/** Splits each `stockToFactory*` rate across owned open Factory lines matching live fill-fraction rules. */
function factorySplitsFor(
  mountain: Mountain,
  pay: number,
  runRates: Readonly<Record<RunId, number>>,
  prevSplits: FactorySplitMap,
  makerOut: Readonly<Record<MakerId, number>>,
): FactorySplitMap {
  const splits: Record<
    FactoryMakerId,
    Partial<Record<FactoryInputGood, number>>
  > = { partsPress: {}, precisionAssembly: {} };
  if (!slice2Part2On()) {
    return splits;
  }
  for (const good of FACTORY_INPUT_GOODS) {
    const total = runRates[factoryRunId(good)];
    const openLines = FACTORY_LINES_FOR_GOOD[good].filter((id) =>
      isMakerBufferOpen(mountain, id),
    );
    const [only] = openLines;
    if (openLines.length === 1 && only !== undefined) {
      splits[only][good] = total;
    } else if (openLines.length === 2) {
      const [s0, s1] = splitTwoFactoryLines(
        mountain,
        good,
        total,
        pay,
        runRates,
        prevSplits,
        makerOut,
      );
      splits.partsPress[good] = s0;
      splits.precisionAssembly[good] = s1;
    }
  }
  return splits;
}

function makerInputRate(
  id: MakerId,
  inputId: MakerInputId,
  runRates: Readonly<Record<RunId, number>>,
  factorySplits: FactorySplitMap,
): number {
  if (id === "kiln") {
    return runRates.pitTopsoilToKilns;
  }
  if (id === "saw") {
    return runRates.pitGraniteToSaws;
  }
  if (id === "glassworks") {
    return inputId === "crystalRock"
      ? runRates.pitCrystalToGlassworks
      : runRates.stockToGlassworksStones;
  }
  return factorySplits[id][inputId as FactoryInputGood] ?? 0;
}

function makerInputCap(
  mountain: Mountain,
  id: MakerId,
  runRates: Readonly<Record<RunId, number>>,
  factorySplits: FactorySplitMap,
): number {
  const outAmt = makerOutputAmount(id);
  let cap = Infinity;
  for (const spec of makerInputs(id)) {
    const held = makerBuffer(mountain, id, spec.id);
    if (held < spec.amount) {
      const inRate = makerInputRate(id, spec.id, runRates, factorySplits);
      cap = Math.min(cap, (inRate / spec.amount) * outAmt);
    }
  }
  return cap;
}

function makerRatesFor(
  mountain: Mountain,
  pay: number,
  runRates: Readonly<Record<RunId, number>>,
  factorySplits: FactorySplitMap,
): Record<MakerId, number> {
  const out = makerRecord(0);
  const fRoom = factoryOutputRoom(mountain) - mountain.factoryOutput.parts;
  const fUncapped: Record<FactoryMakerId, number> = {
    partsPress: 0,
    precisionAssembly: 0,
  };
  for (const id of MAKER_IDS) {
    if (!isMakerBufferOpen(mountain, id)) {
      continue;
    }
    const baseCap = Math.min(
      makerRate(mountain, id) * pay,
      makerInputCap(mountain, id, runRates, factorySplits),
    );
    if (makerSite(id) === "factory") {
      fUncapped[id as FactoryMakerId] = baseCap;
      continue;
    }
    const outGood = makerOutput(id);
    const outRoom = stockpileRoom(mountain, outGood) - mountain.stock[outGood];
    const outCap =
      outRoom > 0
        ? Infinity
        : outRoom === 0
          ? stockDrainRate(runRates, outGood)
          : 0;
    out[id] = Math.min(baseCap, outCap);
  }
  if (fRoom > 0) {
    out.partsPress = fUncapped.partsPress;
    out.precisionAssembly = fUncapped.precisionAssembly;
  } else if (fRoom === 0) {
    const shares = evenShares(runRates.factoryToStockyardParts, [
      fUncapped.partsPress,
      fUncapped.precisionAssembly,
    ]);
    out.partsPress = shares[0] ?? 0;
    out.precisionAssembly = shares[1] ?? 0;
  }
  return out;
}

function factoryDestCap(
  mountain: Mountain,
  good: FactoryInputGood,
  makerOut: Readonly<Record<MakerId, number>>,
): number {
  if (!slice2Part2On()) {
    return 0;
  }
  let cap = 0;
  for (const id of FACTORY_LINES_FOR_GOOD[good]) {
    if (!isMakerBufferOpen(mountain, id)) {
      continue;
    }
    const roomCap = makerInputRoom(mountain, id, good);
    const held = makerBuffer(mountain, id, good);
    const cons = makerInputConsPerSec(id, good, makerOut[id]);
    if (roomCap < held) {
      continue;
    }
    if (!makerInputAtCeiling(roomCap, held, cons, makerInputAmount(id, good))) {
      return Infinity;
    }
    cap += cons;
  }
  return cap;
}

function refineryDestCap(
  mountain: Mountain,
  id: "kiln" | "saw" | "glassworks",
  inputId: MakerInputId,
  makerOut: Readonly<Record<MakerId, number>>,
): number {
  if (!isMakerBufferOpen(mountain, id)) {
    return 0;
  }
  const roomCap = makerInputRoom(mountain, id, inputId);
  const held = makerBuffer(mountain, id, inputId);
  const cons = makerInputConsPerSec(id, inputId, makerOut[id]);
  if (roomCap < held) {
    return 0;
  }
  return makerInputAtCeiling(roomCap, held, cons, makerInputAmount(id, inputId))
    ? cons
    : Infinity;
}

function stockpileDestCap(room: number, drainRate: number): number {
  return room > 0 ? Infinity : room === 0 ? drainRate : 0;
}

function cityGoodDestCap(onSite: number, buildGood: number): number {
  if (onSite < SITE_GOOD_CAP) {
    return Infinity;
  }
  return onSite === SITE_GOOD_CAP ? buildGood : 0;
}

function fillCityAndResearchCaps(
  mountain: Mountain,
  build: Readonly<Record<CityRunGood, number>>,
  caps: Record<RunId, number>,
): void {
  const project = mountain.project;
  if (project.kind === "delivering") {
    const cityNeed = stillRequired(project.site);
    for (const good of CITY_RUN_GOODS) {
      if (cityNeed[good] > 0) {
        caps[cityRunId(good)] = cityGoodDestCap(
          project.site.onSite[good],
          build[good],
        );
      }
    }
  }
  const resActive = slice2Part2On() ? mountain.research.active : undefined;
  if (resActive !== undefined) {
    const resNeed = researchStillRequired(resActive);
    for (const good of CITY_RUN_GOODS) {
      if (resNeed[good] > 0) {
        caps[researchRunId(good)] = Infinity;
      }
    }
  }
}

function destCapsFor(
  mountain: Mountain,
  runRates: Readonly<Record<RunId, number>>,
  makerOut: Readonly<Record<MakerId, number>>,
  build: Readonly<Record<CityRunGood, number>>,
): Record<RunId, number> {
  const stoneRoom = stockpileRoom(mountain, "stones") - mountain.stock.stones;
  const partsOpen = slice2Part2On() && hasOwnedFactoryLine(mountain);
  const partsRoom = partsOpen
    ? stockpileRoom(mountain, "parts") - mountain.stock.parts
    : -1;
  const caps = runRecord(0);
  caps.pitToStockyardStones = stockpileDestCap(
    stoneRoom,
    stockDrainRate(runRates, "stones"),
  );
  caps.pitTopsoilToKilns = refineryDestCap(
    mountain,
    "kiln",
    "topsoilRock",
    makerOut,
  );
  caps.pitGraniteToSaws = refineryDestCap(
    mountain,
    "saw",
    "graniteRock",
    makerOut,
  );
  caps.pitCrystalToGlassworks = refineryDestCap(
    mountain,
    "glassworks",
    "crystalRock",
    makerOut,
  );
  caps.stockToGlassworksStones = refineryDestCap(
    mountain,
    "glassworks",
    "stones",
    makerOut,
  );
  caps.stockToFactoryBrick = factoryDestCap(mountain, "brick", makerOut);
  caps.stockToFactoryCutStone = factoryDestCap(mountain, "cutStone", makerOut);
  caps.stockToFactoryGlass = factoryDestCap(mountain, "glass", makerOut);
  caps.factoryToStockyardParts = partsOpen
    ? stockpileDestCap(partsRoom, stockDrainRate(runRates, "parts"))
    : 0;
  fillCityAndResearchCaps(mountain, build, caps);
  return caps;
}

function recordSettled<K extends string>(
  keys: readonly K[],
  prev: Readonly<Record<K, number>>,
  next: Readonly<Record<K, number>>,
): boolean {
  return keys.every((key) => Math.abs(prev[key] - next[key]) <= RATE_EPS);
}

function hoistRatesFor(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
  pitheadDrain: Readonly<Record<MineLevelId, number>>,
): Record<MineLevelId, number> {
  const chains = undergroundPitheadChains(
    mountain,
    pay,
    drilling,
    pitheadDrain,
  );
  return {
    topsoil:
      chains.topsoil === undefined ? 0 : (chainFlows(chains.topsoil)[2] ?? 0),
    granite:
      chains.granite === undefined ? 0 : (chainFlows(chains.granite)[2] ?? 0),
    crystal:
      chains.crystal === undefined ? 0 : (chainFlows(chains.crystal)[2] ?? 0),
  };
}

function capOrInflow(held: number, inflow: number): number {
  return held > 0 ? Infinity : inflow;
}

function weightOrInflow(held: number, inflow: number): number {
  return held > 0 ? held : inflow;
}

/**
 * Whether a pass-through buffer (`stock[good]` or `factoryOutput.parts`) sits
 * at its 1-tick pipeline/rounding residue (`<= ceil(inflow) + 3`), so Part 2
 * stretches treat it as steady pass-through instead of draining at fleet speed
 * in 1 s loops.
 */
function bufferAtFloor(held: number, inflow: number): boolean {
  return (
    held === 0 ||
    (held > 0 && inflow > RATE_EPS && held <= Math.ceil(inflow) + 3)
  );
}

function floorSourceCap(held: number, inflow: number): number {
  return slice2Part2On()
    ? bufferAtFloor(held, inflow)
      ? inflow
      : Infinity
    : capOrInflow(held, inflow);
}

function runSourcesFor(
  mountain: Mountain,
  openLvls: readonly MineLevelId[],
  hoist: Readonly<Record<MineLevelId, number>>,
  runRates: Readonly<Record<RunId, number>>,
  makerOut: Readonly<Record<MakerId, number>>,
) {
  const topHeld = mountain.pithead.topsoil;
  const graniteHeld = graniteOpen(mountain) ? mountain.pithead.granite : 0;
  const crystalHeld = crystalOpen(mountain) ? mountain.pithead.crystal : 0;
  const factoryPartsOut = makerOut.partsPress + makerOut.precisionAssembly;
  return {
    openLvls,
    pitheadCap: {
      topsoil: capOrInflow(topHeld, hoist.topsoil),
      granite: capOrInflow(graniteHeld, hoist.granite),
      crystal: capOrInflow(crystalHeld, hoist.crystal),
    },
    pitheadWeight: {
      topsoil: weightOrInflow(topHeld, hoist.topsoil),
      granite: weightOrInflow(graniteHeld, hoist.granite),
      crystal: weightOrInflow(crystalHeld, hoist.crystal),
    },
    stockCap: {
      stones: floorSourceCap(
        mountain.stock.stones,
        runRates.pitToStockyardStones,
      ),
      brick: floorSourceCap(mountain.stock.brick, makerOut.kiln),
      cutStone: floorSourceCap(mountain.stock.cutStone, makerOut.saw),
      glass: floorSourceCap(mountain.stock.glass, makerOut.glassworks),
      parts: floorSourceCap(
        mountain.stock.parts,
        runRates.factoryToStockyardParts,
      ),
    },
    factoryOutputCap: slice2Part2On()
      ? bufferAtFloor(mountain.factoryOutput.parts, factoryPartsOut)
        ? factoryPartsOut
        : Infinity
      : 0,
  };
}

function dampRecord<K extends string>(
  keys: readonly K[],
  prev: Readonly<Record<K, number>>,
  next: Readonly<Record<K, number>>,
): Record<K, number> {
  return Object.fromEntries(
    keys.map((key) => [key, (prev[key] + next[key]) * 0.5]),
  ) as Record<K, number>;
}

/**
 * Fixed-point solver for instantaneous coupled rates across underground mine,
 * physical transport runs, Refinery makers, Factory lines, City, and Research.
 */
function coupledRates(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
): CoupledRates {
  const open = openRunMap(mountain);
  const openLvls = openLevels(mountain);
  const totalFleet = fleetRate(mountain) * pay;
  let pitheadDrain: Readonly<Record<MineLevelId, number>> = {
    topsoil: 0,
    granite: 0,
    crystal: 0,
  };
  let stoneFromPithead: Readonly<Record<MineLevelId, number>> = {
    topsoil: 0,
    granite: 0,
    crystal: 0,
  };
  let runRates: Readonly<Record<RunId, number>> = runRecord(0);
  let prevDrain: Readonly<Record<MineLevelId, number>> | undefined;
  let hoist: Record<MineLevelId, number> = {
    topsoil: 0,
    granite: 0,
    crystal: 0,
  };
  let build: Record<CityRunGood, number> = { ...EMPTY_STOCK };
  let makerOut: Record<MakerId, number> = makerRecord(0);
  let factorySplits: FactorySplitMap = {
    partsPress: {},
    precisionAssembly: {},
  };
  let settled = false;

  for (let pass = 0; pass < MAX_FIXED_POINT_PASSES; pass += 1) {
    if (
      prevDrain === undefined ||
      !recordSettled(LEVEL_KEYS, prevDrain, pitheadDrain)
    ) {
      hoist = hoistRatesFor(mountain, pay, drilling, pitheadDrain);
      prevDrain = pitheadDrain;
    }
    build = buildRatesFor(mountain, pay, runRates);
    factorySplits = factorySplitsFor(
      mountain,
      pay,
      runRates,
      factorySplits,
      makerOut,
    );
    makerOut = makerRatesFor(mountain, pay, runRates, factorySplits);
    const destCaps = destCapsFor(mountain, runRates, makerOut, build);
    const sources = runSourcesFor(
      mountain,
      openLvls,
      hoist,
      runRates,
      makerOut,
    );
    const next = allocateRunRates(totalFleet, open, destCaps, sources);
    settled =
      pass > 0 &&
      recordSettled(RUN_ORDER, runRates, next.runRates) &&
      recordSettled(LEVEL_KEYS, pitheadDrain, next.pitheadDrain) &&
      recordSettled(LEVEL_KEYS, stoneFromPithead, next.stoneFromPithead);
    if (settled) {
      runRates = next.runRates;
      pitheadDrain = next.pitheadDrain;
      stoneFromPithead = next.stoneFromPithead;
      break;
    }
    const damp = pass >= 4;
    runRates = damp
      ? dampRecord(RUN_ORDER, runRates, next.runRates)
      : next.runRates;
    pitheadDrain = damp
      ? dampRecord(LEVEL_KEYS, pitheadDrain, next.pitheadDrain)
      : next.pitheadDrain;
    stoneFromPithead = damp
      ? dampRecord(LEVEL_KEYS, stoneFromPithead, next.stoneFromPithead)
      : next.stoneFromPithead;
  }
  if (!settled) {
    hoist = hoistRatesFor(mountain, pay, drilling, pitheadDrain);
    build = buildRatesFor(mountain, pay, runRates);
    factorySplits = factorySplitsFor(
      mountain,
      pay,
      runRates,
      factorySplits,
      makerOut,
    );
    makerOut = makerRatesFor(mountain, pay, runRates, factorySplits);
  }
  return {
    hoist,
    runRates,
    pitheadDrain,
    stoneFromPithead,
    makerOut,
    factorySplits,
    build,
  };
}

/** Seconds until a buffer crosses 0, `room`, or `floor` at `net` units/s. */
function bufferEventTime(
  held: number,
  room: number,
  net: number,
  floor = 0,
): number {
  if (net > RATE_EPS && held < room) {
    return Number.isFinite(room) ? (room - held) / net : Infinity;
  }
  if (net < -RATE_EPS && held > room) {
    return (held - room) / -net;
  }
  if (net < -RATE_EPS && held > floor) {
    return (held - floor) / -net;
  }
  return Infinity;
}

function cityEventTime(mountain: Mountain, rates: CoupledRates): number {
  if (mountain.project.kind === "unordered") {
    return Infinity;
  }
  const site = mountain.project.site;
  const need = stillRequired(site);
  const toBuild = stillToBuild(site);
  let soonest = Infinity;
  for (const good of CITY_RUN_GOODS) {
    const deliverRate = rates.runRates[cityRunId(good)];
    const buildRateGood = rates.build[good];
    soonest = Math.min(
      soonest,
      bufferEventTime(
        site.onSite[good],
        SITE_GOOD_CAP,
        deliverRate - buildRateGood,
      ),
    );
    if (
      mountain.project.kind === "delivering" &&
      deliverRate > RATE_EPS &&
      need[good] > 0
    ) {
      soonest = Math.min(soonest, need[good] / deliverRate);
    }
    if (buildRateGood > RATE_EPS && toBuild[good] > 0) {
      soonest = Math.min(soonest, toBuild[good] / buildRateGood);
    }
  }
  return soonest;
}

function researchEventTime(mountain: Mountain, rates: CoupledRates): number {
  if (!slice2Part2On() || mountain.research.active === undefined) {
    return Infinity;
  }
  const need = researchStillRequired(mountain.research.active);
  let soonest = Infinity;
  for (const good of GOOD_IDS) {
    const rate = rates.runRates[researchRunId(good)];
    if (need[good] > 0 && rate > RATE_EPS) {
      soonest = Math.min(soonest, need[good] / rate);
    }
  }
  return soonest;
}

function factoryTieEventTime(mountain: Mountain, rates: CoupledRates): number {
  if (
    !slice2Part2On() ||
    !isMakerBufferOpen(mountain, "partsPress") ||
    !isMakerBufferOpen(mountain, "precisionAssembly")
  ) {
    return Infinity;
  }
  let soonest = Infinity;
  for (const good of ["brick", "cutStone"] as const) {
    const r0 = makerInputRoom(mountain, "partsPress", good);
    const r1 = makerInputRoom(mountain, "precisionAssembly", good);
    const h0 = makerBuffer(mountain, "partsPress", good);
    const h1 = makerBuffer(mountain, "precisionAssembly", good);
    if (
      h0 < makerInputAmount("partsPress", good) &&
      h1 < makerInputAmount("precisionAssembly", good)
    ) {
      continue;
    }
    const f0 = h0 / r0;
    const f1 = h1 / r1;
    if (Math.abs(f0 - f1) <= FILL_EPS) {
      continue;
    }
    const df0 =
      ((rates.factorySplits.partsPress[good] ?? 0) -
        makerInputConsPerSec("partsPress", good, rates.makerOut.partsPress)) /
      r0;
    const df1 =
      ((rates.factorySplits.precisionAssembly[good] ?? 0) -
        makerInputConsPerSec(
          "precisionAssembly",
          good,
          rates.makerOut.precisionAssembly,
        )) /
      r1;
    const closing = f0 < f1 ? df0 - df1 : df1 - df0;
    if (closing > RATE_EPS) {
      soonest = Math.min(soonest, Math.abs(f1 - f0) / closing);
    }
  }
  return soonest;
}

function makerAndFactoryEventTime(
  mountain: Mountain,
  rates: CoupledRates,
): number {
  let soonest = factoryTieEventTime(mountain, rates);
  for (const id of MAKER_IDS) {
    if (!isMakerBufferOpen(mountain, id)) {
      continue;
    }
    for (const spec of makerInputs(id)) {
      const inRate = makerInputRate(
        id,
        spec.id,
        rates.runRates,
        rates.factorySplits,
      );
      const consRate = makerInputConsPerSec(id, spec.id, rates.makerOut[id]);
      soonest = Math.min(
        soonest,
        bufferEventTime(
          makerBuffer(mountain, id, spec.id),
          makerInputRoom(mountain, id, spec.id),
          inRate - consRate,
          spec.amount - 1,
        ),
      );
    }
  }
  if (slice2Part2On() && hasOwnedFactoryLine(mountain)) {
    const fProd = rates.makerOut.partsPress + rates.makerOut.precisionAssembly;
    const fNet = fProd - rates.runRates.factoryToStockyardParts;
    if (fNet > 0 || !bufferAtFloor(mountain.factoryOutput.parts, fProd)) {
      soonest = Math.min(
        soonest,
        bufferEventTime(
          mountain.factoryOutput.parts,
          factoryOutputRoom(mountain),
          fNet,
        ),
      );
    }
  }
  return soonest;
}

/** Minimum seconds until any pile, pithead, maker/factory buffer, stockpile, Research, or City step changes. */
function nextEventSeconds(
  mountain: Mountain,
  rates: CoupledRates,
  pay: number,
  drilling: boolean,
): number {
  let soonest = Math.min(
    cityEventTime(mountain, rates),
    researchEventTime(mountain, rates),
    makerAndFactoryEventTime(mountain, rates),
  );
  const chains = undergroundPitheadChains(
    mountain,
    pay,
    drilling,
    rates.pitheadDrain,
  );
  const pRoom = pitheadRoom(mountain);
  for (const level of openLevels(mountain)) {
    const chain = chains[level];
    if (chain !== undefined) {
      soonest = Math.min(soonest, chainChange(chain));
    }
    soonest = Math.min(
      soonest,
      bufferEventTime(
        mountain.pithead[level],
        pRoom,
        rates.hoist[level] - rates.pitheadDrain[level],
      ),
    );
  }
  const stockIn: Record<GoodId, number> = {
    stones: rates.runRates.pitToStockyardStones,
    brick: rates.makerOut.kiln,
    cutStone: rates.makerOut.saw,
    glass: rates.makerOut.glassworks,
    parts: rates.runRates.factoryToStockyardParts,
  };
  for (const good of GOOD_IDS) {
    const sNet = stockIn[good] - stockDrainRate(rates.runRates, good);
    if (
      sNet > 0 ||
      !slice2Part2On() ||
      !bufferAtFloor(mountain.stock[good], stockIn[good])
    ) {
      soonest = Math.min(
        soonest,
        bufferEventTime(
          mountain.stock[good],
          stockpileRoom(mountain, good),
          sNet,
        ),
      );
    }
  }
  return soonest;
}

/** Whole builder capacity over a stretch (discrete Bresenham quota on 1 s ticks). */
function stretchBuildCap(
  mountain: Mountain,
  seconds: number,
  pay: number,
  tickIndex?: number,
): number {
  const rate = buildRate(mountain) * pay;
  return tickIndex !== undefined
    ? stepQuota(rate, tickIndex)
    : Math.floor(rate * seconds + RATE_EPS);
}

function wholeOver(
  rate: number,
  seconds: number,
  dryEq: boolean,
  tickIndex?: number,
): number {
  const raw = rate * seconds;
  if (dryEq) {
    return Math.ceil(raw - RATE_EPS);
  }
  return tickIndex !== undefined
    ? stepQuota(rate, tickIndex)
    : Math.floor(raw + RATE_EPS);
}

/** Whole City deliveries bounded by `applyCityWork` (`stillRequired` + `SITE_GOOD_CAP` headroom). */
function cityOutCap(
  mountain: Mountain,
  rates: CoupledRates,
  stockIn: Readonly<Record<GoodId, number>>,
  seconds: number,
  pay: number,
  tickIndex?: number,
): Record<GoodId, number> {
  if (mountain.project.kind !== "delivering") {
    return { ...EMPTY_STOCK };
  }
  const need = stillRequired(mountain.project.site);
  const rawDesired: Partial<Record<GoodId, number>> = {};
  for (const good of CITY_RUN_GOODS) {
    const rate = rates.runRates[cityRunId(good)];
    const dryEq =
      mountain.stock[good] === 0 &&
      stockDrainRate(rates.runRates, good) >= stockIn[good] - RATE_EPS;
    const want = Math.min(
      need[good],
      Math.max(0, wholeOver(rate, seconds, dryEq, tickIndex)),
    );
    if (want > 0) {
      rawDesired[good] = want;
    }
  }
  const accepted = applyCityWork(
    mountain.project.site,
    rawDesired,
    stretchBuildCap(mountain, seconds, pay, tickIndex),
  ).delivered;
  return {
    stones: accepted.stones ?? 0,
    brick: accepted.brick ?? 0,
    cutStone: accepted.cutStone ?? 0,
    glass: accepted.glass ?? 0,
    parts: accepted.parts ?? 0,
  };
}

/** Whole Research deliveries bounded by `researchStillRequired`. */
function researchOutCap(
  mountain: Mountain,
  rates: CoupledRates,
  stockIn: Readonly<Record<GoodId, number>>,
  seconds: number,
  tickIndex?: number,
): Record<GoodId, number> {
  if (!slice2Part2On() || mountain.research.active === undefined) {
    return { ...EMPTY_STOCK };
  }
  const need = researchStillRequired(mountain.research.active);
  const out: Record<GoodId, number> = { ...EMPTY_STOCK };
  for (const good of GOOD_IDS) {
    const rate = rates.runRates[researchRunId(good)];
    const dryEq =
      mountain.stock[good] === 0 &&
      stockDrainRate(rates.runRates, good) >= stockIn[good] - RATE_EPS;
    out[good] = Math.min(
      need[good],
      Math.max(0, wholeOver(rate, seconds, dryEq, tickIndex)),
    );
  }
  return out;
}

/** Exact integer input budget for one maker input over `seconds` without overshooting room. */
function stretchMakerInputCap(
  mountain: Mountain,
  id: MakerId,
  inputId: MakerInputId,
  rates: CoupledRates,
  extraOutRoom: number,
  seconds: number,
  pay: number,
): number {
  if (!isMakerBufferOpen(mountain, id)) {
    return 0;
  }
  const spec = makerInputs(id).find((entry) => entry.id === inputId);
  if (spec === undefined) {
    return 0;
  }
  const outAmt = makerOutputAmount(id);
  const outRoomBase =
    makerSite(id) === "factory"
      ? factoryOutputRoom(mountain) - mountain.factoryOutput.parts
      : stockpileRoom(mountain, makerOutput(id)) -
        mountain.stock[makerOutput(id)];
  const outRoom = Number.isFinite(outRoomBase)
    ? Math.max(0, outRoomBase + extraOutRoom)
    : Number.MAX_SAFE_INTEGER;
  const maxByRate = makerCycleLimit(
    makerRate(mountain, id) * pay,
    seconds,
    mountain.cycleMicros[id] ?? 0,
    outAmt,
  );
  const expectedCycles = (rates.makerOut[id] * seconds) / outAmt;
  const cycleCap =
    makerSite(id) === "factory"
      ? Math.floor(expectedCycles + RATE_EPS)
      : Math.ceil(expectedCycles - RATE_EPS);
  const cycles = Math.min(cycleCap, Math.floor(outRoom / outAmt), maxByRate);
  const bufRoomBase =
    makerInputRoom(mountain, id, inputId) - makerBuffer(mountain, id, inputId);
  return Math.max(0, bufRoomBase + cycles * spec.amount);
}

/** Planned integer pithead withdrawals per level over a multi-second stretch. */
function planStretchPithead(
  mountain: Mountain,
  rates: CoupledRates,
  stockOutPlan: Readonly<Record<GoodId, number>>,
  seconds: number,
  pay: number,
  tickIndex?: number,
): {
  readonly wantStone: Readonly<Record<MineLevelId, number>>;
  readonly wantMaker: Readonly<Record<MineLevelId, number>>;
  readonly drainRate: Readonly<Record<MineLevelId, number>>;
} {
  const openLvls = openLevels(mountain);
  const stoneRoomBase =
    stockpileRoom(mountain, "stones") - mountain.stock.stones;
  const stoneCap = Number.isFinite(stoneRoomBase)
    ? Math.max(0, stoneRoomBase + stockOutPlan.stones)
    : Number.MAX_SAFE_INTEGER;
  const dryEq = (level: MineLevelId): boolean =>
    mountain.pithead[level] === 0 &&
    rates.pitheadDrain[level] >= rates.hoist[level] - RATE_EPS;
  const rawStone: Record<MineLevelId, number> = {
    topsoil: wholeOver(
      rates.stoneFromPithead.topsoil,
      seconds,
      dryEq("topsoil"),
      tickIndex,
    ),
    granite: graniteOpen(mountain)
      ? wholeOver(
          rates.stoneFromPithead.granite,
          seconds,
          dryEq("granite"),
          tickIndex,
        )
      : 0,
    crystal: crystalOpen(mountain)
      ? wholeOver(
          rates.stoneFromPithead.crystal,
          seconds,
          dryEq("crystal"),
          tickIndex,
        )
      : 0,
  };
  const scaled =
    rawStone.topsoil + rawStone.granite + rawStone.crystal > stoneCap
      ? shareProportional(stoneCap, openLvls, rawStone)
      : rawStone;
  const wantStone: Record<MineLevelId, number> = {
    topsoil: scaled.topsoil ?? 0,
    granite: scaled.granite ?? 0,
    crystal: scaled.crystal ?? 0,
  };
  const makerWant = (
    level: MineLevelId,
    id: "kiln" | "saw" | "glassworks",
    input: "topsoilRock" | "graniteRock" | "crystalRock",
    run: RunId,
  ): number =>
    isMakerBufferOpen(mountain, id)
      ? Math.min(
          wholeOver(rates.runRates[run], seconds, dryEq(level), tickIndex),
          stretchMakerInputCap(
            mountain,
            id,
            input,
            rates,
            stockOutPlan[makerOutput(id)],
            seconds,
            pay,
          ),
        )
      : 0;
  const wantMaker: Record<MineLevelId, number> = {
    topsoil: makerWant("topsoil", "kiln", "topsoilRock", "pitTopsoilToKilns"),
    granite: makerWant("granite", "saw", "graniteRock", "pitGraniteToSaws"),
    crystal: makerWant(
      "crystal",
      "glassworks",
      "crystalRock",
      "pitCrystalToGlassworks",
    ),
  };
  if (seconds === 1) {
    spillMakerCapToStone(openLvls, rates, stoneCap, wantStone, wantMaker);
  }
  return {
    wantStone,
    wantMaker,
    drainRate: {
      topsoil: (wantStone.topsoil + wantMaker.topsoil) / seconds,
      granite: (wantStone.granite + wantMaker.granite) / seconds,
      crystal: (wantStone.crystal + wantMaker.crystal) / seconds,
    },
  };
}

function spillMakerCapToStone(
  openLvls: readonly MineLevelId[],
  rates: CoupledRates,
  stoneCap: number,
  wantStone: Record<MineLevelId, number>,
  wantMaker: Readonly<Record<MineLevelId, number>>,
): void {
  let stoneLeft = Math.max(
    0,
    stoneCap - wantStone.topsoil - wantStone.granite - wantStone.crystal,
  );
  for (const level of openLvls) {
    const mRun: RunId =
      level === "topsoil"
        ? "pitTopsoilToKilns"
        : level === "granite"
          ? "pitGraniteToSaws"
          : "pitCrystalToGlassworks";
    const floorMaker = Math.floor(rates.runRates[mRun] + RATE_EPS);
    const spill = Math.max(0, floorMaker - wantMaker[level]);
    const extra = Math.min(spill, stoneLeft);
    wantStone[level] += extra;
    stoneLeft -= extra;
  }
}

/** Moves pithead rock into Stone and Refinery rock buffers over a multi-second stretch. */
function moveStretchPithead(
  mountain: Mountain,
  wantStone: Readonly<Record<MineLevelId, number>>,
  wantMaker: Readonly<Record<MineLevelId, number>>,
): { readonly mountain: Mountain; readonly gainedStones: number } {
  const openLvls = openLevels(mountain);
  const stoneFrom: Record<MineLevelId, number> = {
    topsoil: 0,
    granite: 0,
    crystal: 0,
  };
  const makerMoved: Record<MineLevelId, number> = {
    topsoil: 0,
    granite: 0,
    crystal: 0,
  };
  for (const level of openLvls) {
    const split = shareProportional(
      mountain.pithead[level],
      ["stone", "maker"],
      { stone: wantStone[level], maker: wantMaker[level] },
    );
    stoneFrom[level] = split.stone ?? 0;
    makerMoved[level] = split.maker ?? 0;
  }
  const gainedStones =
    stoneFrom.topsoil + stoneFrom.granite + stoneFrom.crystal;
  if (
    gainedStones +
      makerMoved.topsoil +
      makerMoved.granite +
      makerMoved.crystal <=
    0
  ) {
    return { mountain, gainedStones: 0 };
  }
  const moved = runRecord(0);
  moved.pitToStockyardStones = gainedStones;
  moved.pitTopsoilToKilns = makerMoved.topsoil;
  moved.pitGraniteToSaws = makerMoved.granite;
  moved.pitCrystalToGlassworks = makerMoved.crystal;
  const applied = applyTransportTransfer(mountain, {
    moved,
    stoneFromPithead: stoneFrom,
  });
  return { mountain: applied.mountain, gainedStones: applied.gainedStones };
}

/** Splits one stockyard good proportionally across a producer feed, City, and Research. */
function splitStockGood(
  available: number,
  feedWant: number,
  cityWant: number,
  resWant: number,
): { readonly feed: number; readonly city: number; readonly research: number } {
  const split = shareProportional(available, ["feed", "city", "research"], {
    feed: feedWant,
    city: cityWant,
    research: resWant,
  });
  return {
    feed: split.feed ?? 0,
    city: split.city ?? 0,
    research: split.research ?? 0,
  };
}

/** Moves `stockToGlassworksStones` into Glassworks' stones buffer over a stretch. */
function moveStretchGlassworksStones(
  mountain: Mountain,
  amount: number,
): Mountain {
  if (amount <= 0) {
    return mountain;
  }
  const moved = runRecord(0);
  moved.stockToGlassworksStones = amount;
  return applyTransportTransfer(mountain, {
    moved,
    stoneFromPithead: ZERO_DRAIN,
  }).mountain;
}

function splitFactoryStretchGood(
  mountain: Mountain,
  good: FactoryInputGood,
  amt: number,
  rates: CoupledRates,
  factoryPartsOutWant: number,
  seconds: number,
  pay: number,
): Partial<Record<FactoryMakerId, number>> {
  const openLines = FACTORY_LINES_FOR_GOOD[good].filter((id) =>
    isMakerBufferOpen(mountain, id),
  );
  const [only] = openLines;
  if (only === undefined) {
    return {};
  }
  const lineCap = (line: FactoryMakerId): number =>
    stretchMakerInputCap(
      mountain,
      line,
      good,
      rates,
      factoryPartsOutWant,
      seconds,
      pay,
    );
  if (openLines.length === 1) {
    return { [only]: Math.min(amt, lineCap(only)) };
  }
  if (seconds > 1) {
    const w0 = Math.min(
      lineCap("partsPress"),
      Math.round((rates.factorySplits.partsPress[good] ?? 0) * seconds),
    );
    const w1 = Math.min(
      lineCap("precisionAssembly"),
      Math.round((rates.factorySplits.precisionAssembly[good] ?? 0) * seconds),
    );
    if (w0 + w1 > 0) {
      return shareProportional(amt, ["partsPress", "precisionAssembly"], {
        partsPress: w0,
        precisionAssembly: w1,
      });
    }
  }
  return distributeFactoryInput(mountain, good, amt);
}

/** Moves `stockToFactory*` into Factory input buffers over a stretch. */
function moveStretchFactoryInputs(
  mountain: Mountain,
  amounts: Readonly<Record<FactoryInputGood, number>>,
  rates: CoupledRates,
  factoryPartsOutWant: number,
  seconds: number,
  pay: number,
): Mountain {
  if (amounts.brick + amounts.cutStone + amounts.glass <= 0) {
    return mountain;
  }
  const nextBuffers: Record<MakerId, MakerBuffers[MakerId]> = {
    ...mountain.makerBuffers,
  };
  const stockDelta: Partial<Record<GoodId, number>> = {};
  for (const good of FACTORY_INPUT_GOODS) {
    const amt = Math.min(amounts[good], mountain.stock[good]);
    if (amt <= 0) {
      continue;
    }
    const split = splitFactoryStretchGood(
      mountain,
      good,
      amt,
      rates,
      factoryPartsOutWant,
      seconds,
      pay,
    );
    let taken = 0;
    for (const line of FACTORY_MAKER_IDS) {
      const add = split[line] ?? 0;
      if (add > 0) {
        nextBuffers[line] = {
          ...nextBuffers[line],
          [good]: (nextBuffers[line][good] ?? 0) + add,
        };
        taken += add;
      }
    }
    if (taken > 0) {
      stockDelta[good] = -taken;
    }
  }
  return Object.keys(stockDelta).length === 0
    ? mountain
    : {
        ...mountain,
        makerBuffers: nextBuffers,
        stock: addedStock(mountain.stock, stockDelta),
      };
}

/**
 * Returns any multi-second pre-staged Factory input units that were not
 * consumed during `stepMakersList` and would leave a buffer above its room
 * (never lowering below a pre-existing over-cap `beforeHeld`), preserving exact
 * stock conservation.
 */
function refundUnconsumedFactoryInputs(
  before: Mountain,
  after: Mountain,
): Mountain {
  const refund: Partial<Record<GoodId, number>> = {};
  const nextBuffers: Record<MakerId, MakerBuffers[MakerId]> = {
    ...after.makerBuffers,
  };
  let changed = false;
  for (const line of FACTORY_MAKER_IDS) {
    let lineBuf = nextBuffers[line];
    for (const spec of makerInputs(line)) {
      const good = spec.id as FactoryInputGood;
      const ceiling = Math.max(
        makerInputRoom(after, line, good),
        makerBuffer(before, line, good),
      );
      const held = lineBuf[good] ?? 0;
      if (held > ceiling) {
        const excess = held - ceiling;
        lineBuf = { ...lineBuf, [good]: ceiling };
        refund[good] = (refund[good] ?? 0) + excess;
        changed = true;
      }
    }
    nextBuffers[line] = lineBuf;
  }
  return changed
    ? {
        ...after,
        makerBuffers: nextBuffers,
        stock: addedStock(after.stock, refund),
      }
    : after;
}

/** Runs Factory lines and moves `factoryOutput.parts` -> `stock.parts` over a stretch. */
function applyStretchFactory(
  beforeInputs: Mountain,
  mountain: Mountain,
  budgets: StretchBudgets,
  seconds: number,
  pay: number,
  tickIndex?: number,
): { readonly mountain: Mountain; readonly gainedParts: number } {
  if (!slice2Part2On() || !hasOwnedFactoryLine(mountain)) {
    return { mountain, gainedParts: 0 };
  }
  const stepped = stepMakersList(
    mountain,
    FACTORY_MAKER_IDS,
    seconds,
    pay,
    {},
    budgets.factoryPartsOutWant,
    tickIndex,
  ).mountain;
  const state = refundUnconsumedFactoryInputs(beforeInputs, stepped);
  const partsRoomBase = stockpileRoom(state, "parts") - state.stock.parts;
  const partsRoom = Number.isFinite(partsRoomBase)
    ? Math.max(0, partsRoomBase + budgets.cityOut.parts + budgets.resOut.parts)
    : Number.MAX_SAFE_INTEGER;
  const partsMove = Math.min(
    state.factoryOutput.parts,
    budgets.factoryPartsOutWant,
    partsRoom,
  );
  if (partsMove <= 0) {
    return { mountain: state, gainedParts: 0 };
  }
  const moved = runRecord(0);
  moved.factoryToStockyardParts = partsMove;
  const applied = applyTransportTransfer(state, {
    moved,
    stoneFromPithead: ZERO_DRAIN,
  });
  return { mountain: applied.mountain, gainedParts: applied.gainedParts };
}

/** Applies City transport + builder work over a multi-second stretch cleanly. */
function applyStretchCity(
  mountain: Mountain,
  cityOut: Readonly<Record<GoodId, number>>,
  seconds: number,
  pay: number,
  tickIndex?: number,
): Mountain {
  if (mountain.project.kind === "unordered") {
    return mountain;
  }
  const desired: Partial<Record<GoodId, number>> = {};
  if (mountain.project.kind === "delivering") {
    for (const good of CITY_RUN_GOODS) {
      const want = Math.min(mountain.stock[good], cityOut[good]);
      if (want > 0) {
        desired[good] = want;
      }
    }
  }
  const buildCap = stretchBuildCap(mountain, seconds, pay, tickIndex);
  const { delivered, built } = applyCityWork(
    mountain.project.site,
    desired,
    buildCap,
  );
  let state = mountain;
  if (goodsTotal(delivered) > 0) {
    state = receive(payStock(state, priceOf(delivered)), delivered);
  }
  if (goodsTotal(built) > 0) {
    state = buildIn(state, built);
  }
  return state;
}

/** Applies Research deliveries from stock over a multi-second stretch. */
function applyStretchResearch(
  mountain: Mountain,
  resOut: Readonly<Record<GoodId, number>>,
): Mountain {
  if (!slice2Part2On() || mountain.research.active === undefined) {
    return mountain;
  }
  const need = researchStillRequired(mountain.research.active);
  const delivered: Partial<Record<GoodId, number>> = {};
  for (const good of GOOD_IDS) {
    const amt = Math.min(mountain.stock[good], resOut[good], need[good]);
    if (amt > 0) {
      delivered[good] = amt;
    }
  }
  return goodsTotal(delivered) > 0
    ? receiveResearch(payStock(mountain, priceOf(delivered)), delivered)
    : mountain;
}

const ZERO_DRAIN: Readonly<Record<MineLevelId, number>> = {
  topsoil: 0,
  granite: 0,
  crystal: 0,
};

/** One discrete 1-second offline stretch: zero assumed pithead drain (matches live Phase (a)->(b)->(c)->(d)). */
function applyOneSecondStretch(
  mountain: Mountain,
  pay: number,
  drilling: boolean,
  tickIndex: number,
): {
  readonly mountain: Mountain;
  readonly mined: number;
  readonly gained: Partial<Stock>;
} {
  const mine = flowUndergroundToPithead(
    mountain,
    1,
    pay,
    drilling,
    ZERO_DRAIN,
    tickIndex,
  );
  const surface = stepSlice2Surface(mine.mountain, pay, tickIndex);
  return {
    mountain: surface.mountain,
    mined: mine.hoisted.topsoil + mine.hoisted.granite + mine.hoisted.crystal,
    gained: surface.gained,
  };
}

type StretchBudgets = {
  readonly cityOut: Record<GoodId, number>;
  readonly resOut: Record<GoodId, number>;
  readonly gwStonesWant: number;
  readonly factoryInWant: Record<FactoryInputGood, number>;
  readonly factoryPartsOutWant: number;
  readonly stockOutPlan: Record<GoodId, number>;
};

function planFactoryPartsOutWant(
  mountain: Mountain,
  rates: CoupledRates,
  cityParts: number,
  resParts: number,
  seconds: number,
  tickIndex?: number,
): number {
  if (!slice2Part2On() || !hasOwnedFactoryLine(mountain)) {
    return 0;
  }
  const dryEq =
    mountain.factoryOutput.parts === 0 &&
    rates.runRates.factoryToStockyardParts >=
      rates.makerOut.partsPress + rates.makerOut.precisionAssembly - RATE_EPS;
  const raw = wholeOver(
    rates.runRates.factoryToStockyardParts,
    seconds,
    dryEq,
    tickIndex,
  );
  const roomBase = stockpileRoom(mountain, "parts") - mountain.stock.parts;
  const room = Number.isFinite(roomBase)
    ? Math.max(0, roomBase + cityParts + resParts)
    : Number.MAX_SAFE_INTEGER;
  return Math.min(raw, room);
}

function planFactoryInWants(
  mountain: Mountain,
  rates: CoupledRates,
  stockIn: Readonly<Record<GoodId, number>>,
  factoryPartsOutWant: number,
  seconds: number,
  pay: number,
  tickIndex?: number,
): Record<FactoryInputGood, number> {
  const out: Record<FactoryInputGood, number> = {
    brick: 0,
    cutStone: 0,
    glass: 0,
  };
  if (!slice2Part2On()) {
    return out;
  }
  for (const good of FACTORY_INPUT_GOODS) {
    const run = factoryRunId(good);
    const dryEq =
      mountain.stock[good] === 0 &&
      stockDrainRate(rates.runRates, good) >= stockIn[good] - RATE_EPS;
    const raw = wholeOver(rates.runRates[run], seconds, dryEq, tickIndex);
    let cap = 0;
    for (const line of FACTORY_LINES_FOR_GOOD[good]) {
      cap += stretchMakerInputCap(
        mountain,
        line,
        good,
        rates,
        factoryPartsOutWant,
        seconds,
        pay,
      );
    }
    out[good] = Math.min(raw, cap);
  }
  return out;
}

function planStretchBudgets(
  mountain: Mountain,
  rates: CoupledRates,
  seconds: number,
  pay: number,
  tickIndex?: number,
): StretchBudgets {
  const stockIn: Record<GoodId, number> = {
    stones: rates.runRates.pitToStockyardStones,
    brick: rates.makerOut.kiln,
    cutStone: rates.makerOut.saw,
    glass: rates.makerOut.glassworks,
    parts: rates.runRates.factoryToStockyardParts,
  };
  const cityOut = cityOutCap(mountain, rates, stockIn, seconds, pay, tickIndex);
  const resOut = researchOutCap(mountain, rates, stockIn, seconds, tickIndex);
  const factoryPartsOutWant = planFactoryPartsOutWant(
    mountain,
    rates,
    cityOut.parts,
    resOut.parts,
    seconds,
    tickIndex,
  );
  const factoryInWant = planFactoryInWants(
    mountain,
    rates,
    stockIn,
    factoryPartsOutWant,
    seconds,
    pay,
    tickIndex,
  );
  const gwStonesWant =
    slice2Part2On() && isMakerBufferOpen(mountain, "glassworks")
      ? Math.min(
          wholeOver(
            rates.runRates.stockToGlassworksStones,
            seconds,
            mountain.stock.stones === 0 &&
              stockDrainRate(rates.runRates, "stones") >=
                stockIn.stones - RATE_EPS,
            tickIndex,
          ),
          stretchMakerInputCap(
            mountain,
            "glassworks",
            "stones",
            rates,
            factoryInWant.glass + cityOut.glass + resOut.glass,
            seconds,
            pay,
          ),
        )
      : 0;
  const stockOutPlan: Record<GoodId, number> = {
    stones: gwStonesWant + cityOut.stones + resOut.stones,
    brick: factoryInWant.brick + cityOut.brick + resOut.brick,
    cutStone: factoryInWant.cutStone + cityOut.cutStone + resOut.cutStone,
    glass: factoryInWant.glass + cityOut.glass + resOut.glass,
    parts: cityOut.parts + resOut.parts,
  };
  return {
    cityOut,
    resOut,
    gwStonesWant,
    factoryInWant,
    factoryPartsOutWant,
    stockOutPlan,
  };
}

/** Runs the surface DAG (stones -> Refinery -> Factory -> Research & City) for one stretch. */
function applyStretchSurface(
  mountain: Mountain,
  budgets: StretchBudgets,
  rates: CoupledRates,
  seconds: number,
  pay: number,
  tickIndex?: number,
): {
  readonly mountain: Mountain;
  readonly refMade: Partial<Stock>;
  readonly gainedParts: number;
} {
  const stoneSplit = splitStockGood(
    mountain.stock.stones,
    budgets.gwStonesWant,
    budgets.cityOut.stones,
    budgets.resOut.stones,
  );
  let state = moveStretchGlassworksStones(mountain, stoneSplit.feed);
  const refMade = stepMakersList(state, REFINERY_MAKER_IDS, seconds, pay, {
    brick: budgets.stockOutPlan.brick,
    cutStone: budgets.stockOutPlan.cutStone,
    glass: budgets.stockOutPlan.glass,
  });
  state = refMade.mountain;
  const brickSplit = splitStockGood(
    state.stock.brick,
    budgets.factoryInWant.brick,
    budgets.cityOut.brick,
    budgets.resOut.brick,
  );
  const cutSplit = splitStockGood(
    state.stock.cutStone,
    budgets.factoryInWant.cutStone,
    budgets.cityOut.cutStone,
    budgets.resOut.cutStone,
  );
  const glassSplit = splitStockGood(
    state.stock.glass,
    budgets.factoryInWant.glass,
    budgets.cityOut.glass,
    budgets.resOut.glass,
  );
  const beforeFactory = state;
  state = moveStretchFactoryInputs(
    state,
    {
      brick: brickSplit.feed,
      cutStone: cutSplit.feed,
      glass: glassSplit.feed,
    },
    rates,
    budgets.factoryPartsOutWant,
    seconds,
    pay,
  );
  const factory = applyStretchFactory(
    beforeFactory,
    state,
    budgets,
    seconds,
    pay,
    tickIndex,
  );
  state = factory.mountain;
  const partsSplit = splitStockGood(
    state.stock.parts,
    0,
    budgets.cityOut.parts,
    budgets.resOut.parts,
  );
  state = applyStretchResearch(state, {
    stones: stoneSplit.research,
    brick: brickSplit.research,
    cutStone: cutSplit.research,
    glass: glassSplit.research,
    parts: partsSplit.research,
  });
  const after = applyStretchCity(
    state,
    {
      stones: stoneSplit.city,
      brick: brickSplit.city,
      cutStone: cutSplit.city,
      glass: glassSplit.city,
      parts: partsSplit.city,
    },
    seconds,
    pay,
    tickIndex,
  );
  return {
    mountain: after,
    refMade: refMade.made,
    gainedParts: factory.gainedParts,
  };
}

/**
 * One event-driven coupled stretch of Slice 2 (spec rule 5.3):
 * advances up to `end` or the next buffer/stockpile/step state change (1 s floor).
 */
export function stretchSlice2(
  mountain: Mountain,
  { from, end }: { readonly from: number; readonly end: number },
  pay: number,
  drilling: boolean,
): Slice2Step {
  const remaining = Math.floor((end - from) / 1000);
  if (remaining <= 0) {
    return {
      mountain,
      mined: 0,
      gained: {},
      settledAt: from,
      producing: false,
    };
  }
  const rates = coupledRates(mountain, pay, drilling);
  const eventSec = nextEventSeconds(mountain, rates, pay, drilling);
  const seconds = Math.min(remaining, Math.max(1, Math.floor(eventSec)));
  const tickIndex = seconds === 1 ? Math.floor(from / 1000) : undefined;
  const budgets = planStretchBudgets(mountain, rates, seconds, pay, tickIndex);
  const pitPlan = planStretchPithead(
    mountain,
    rates,
    budgets.stockOutPlan,
    seconds,
    pay,
    tickIndex,
  );
  const mine = flowUndergroundToPithead(
    mountain,
    seconds,
    pay,
    drilling,
    pitPlan.drainRate,
    tickIndex,
  );
  const movedPit = moveStretchPithead(
    mine.mountain,
    pitPlan.wantStone,
    pitPlan.wantMaker,
  );
  const surface = applyStretchSurface(
    movedPit.mountain,
    budgets,
    rates,
    seconds,
    pay,
    tickIndex,
  );
  const mined =
    mine.hoisted.topsoil + mine.hoisted.granite + mine.hoisted.crystal;
  const gained: Partial<Stock> = {
    ...surface.refMade,
    ...(movedPit.gainedStones > 0 ? { stones: movedPit.gainedStones } : {}),
    ...(surface.gainedParts > 0 ? { parts: surface.gainedParts } : {}),
  };
  if (seconds === 1 && surface.mountain === mountain) {
    const one = applyOneSecondStretch(
      mountain,
      pay,
      drilling,
      Math.floor(from / 1000),
    );
    return {
      ...one,
      settledAt: from + 1000,
      producing: one.mined > 0 || goodsTotal(one.gained) > 0,
    };
  }
  return {
    mountain: surface.mountain,
    mined,
    gained,
    settledAt: from + seconds * 1000,
    producing: mined > 0 || goodsTotal(gained) > 0,
  };
}

/** Advances Slice 2 in event-driven stretches from `from` to `to` (rate / offline mode). */
export function accrueSlice2Stretches(
  mountain: Mountain,
  from: number,
  to: number,
  pay: number,
  drilling = true,
): Slice2Step {
  let state = mountain;
  let cursor = from;
  let mined = 0;
  let gained: Stock = EMPTY_STOCK;
  while (to - cursor >= 1000) {
    const part = stretchSlice2(state, { from: cursor, end: to }, pay, drilling);
    state = part.mountain;
    mined += part.mined;
    if (goodsTotal(part.gained) > 0) {
      gained = addedStock(gained, part.gained);
    }
    cursor = Math.max(part.settledAt, cursor + 1000);
  }
  return {
    mountain: state,
    mined,
    gained,
    settledAt: cursor,
    producing: mined > 0 || goodsTotal(gained) > 0,
  };
}

// ---------------------------------------------------------------------------
// Steady-state Slice 2 rates for the lab planner (#767)

type SteadyBase = {
  readonly openLvls: readonly MineLevelId[];
  readonly topsoil: number;
  readonly granite: number;
  readonly crystal: number;
  readonly kilnNeed: number;
  readonly sawNeed: number;
  readonly fleet: number;
};

function steadyBase(mountain: Mountain): SteadyBase {
  const levels = steadyLevels(mountain);
  const topsoil = Math.min(
    levels.topsoil.face,
    levels.topsoil.haul,
    levels.topsoil.lift,
  );
  const granite = graniteOpen(mountain)
    ? Math.min(levels.granite.face, levels.granite.haul, levels.granite.lift)
    : 0;
  const crystal = crystalOpen(mountain)
    ? Math.min(levels.crystal.face, levels.crystal.haul, levels.crystal.lift)
    : 0;
  return {
    openLvls: openLevels(mountain),
    topsoil,
    granite,
    crystal,
    kilnNeed:
      mountain.makers.kiln > 0
        ? makerRate(mountain, "kiln") * makerTakes("kiln")
        : 0,
    sawNeed:
      mountain.makers.saw > 0
        ? makerRate(mountain, "saw") * makerTakes("saw")
        : 0,
    fleet: fleetRate(mountain),
  };
}

function incomeFromRunRates(
  runRates: Readonly<Record<RunId, number>>,
): Partial<Stock> {
  return {
    stones: runRates.pitToStockyardStones,
    brick: runRates.pitTopsoilToKilns / makerTakes("kiln"),
    cutStone: runRates.pitGraniteToSaws / makerTakes("saw"),
    glass: 0,
    parts: 0,
  };
}

function runSteadyAlloc(
  mountain: Mountain,
  base: SteadyBase,
  cityOpen: Readonly<Record<GoodId, boolean>>,
  cityDest: Readonly<Record<GoodId, number>>,
  stockCap: Readonly<Record<GoodId, number>>,
) {
  const open = runRecord(false);
  open.pitToStockyardStones = true;
  open.pitTopsoilToKilns = mountain.makers.kiln > 0;
  open.pitGraniteToSaws = graniteOpen(mountain) && mountain.makers.saw > 0;
  const destCaps = runRecord(0);
  destCaps.pitToStockyardStones = Infinity;
  destCaps.pitTopsoilToKilns = base.kilnNeed;
  destCaps.pitGraniteToSaws = base.sawNeed;
  for (const good of CITY_RUN_GOODS) {
    const id = cityRunId(good);
    open[id] = cityOpen[good];
    destCaps[id] = cityOpen[good] ? cityDest[good] : 0;
  }
  return allocateRunRates(base.fleet, open, destCaps, {
    openLvls: base.openLvls,
    pitheadCap: {
      topsoil: base.topsoil,
      granite: base.granite,
      crystal: base.crystal,
    },
    pitheadWeight: {
      topsoil: base.topsoil,
      granite: base.granite,
      crystal: base.crystal,
    },
    stockCap,
  });
}

const NO_CITY_OPEN: Readonly<Record<GoodId, boolean>> = {
  stones: false,
  brick: false,
  cutStone: false,
  glass: false,
  parts: false,
};

const ZERO_STOCK_CAP: Readonly<Record<GoodId, number>> = { ...EMPTY_STOCK };

const INF_CITY_DEST: Readonly<Record<GoodId, number>> = {
  stones: Infinity,
  brick: Infinity,
  cutStone: Infinity,
  glass: Infinity,
  parts: Infinity,
};

function steadyCityDest(
  build: number,
  cityOpen: Readonly<Record<GoodId, boolean>>,
  stockCap: Readonly<Record<GoodId, number>>,
): Readonly<Record<GoodId, number>> {
  if (build <= 0) {
    return INF_CITY_DEST;
  }
  const wants = CITY_RUN_GOODS.map((good) =>
    cityOpen[good] ? stockCap[good] : 0,
  );
  const shares = evenShares(build, wants);
  return {
    stones: shares[0] ?? 0,
    brick: shares[1] ?? 0,
    cutStone: shares[2] ?? 0,
    glass: shares[3] ?? 0,
    parts: shares[4] ?? 0,
  };
}

type SteadyPart2Spec = {
  readonly glassOpen: boolean;
  readonly pressOpen: boolean;
  readonly precOpen: boolean;
  readonly glassMax: number;
  readonly pressMax: number;
  readonly precMax: number;
  readonly glassCrystal: number;
  readonly glassStones: number;
  readonly pressBrick: number;
  readonly pressCut: number;
  readonly precBrickPerPart: number;
  readonly precCutPerPart: number;
  readonly precGlassPerPart: number;
};

type SteadyPart2State = {
  readonly gross: Record<GoodId, number>;
  readonly factoryOutCap: number;
  readonly glassEffective: number;
  readonly precEffective: number;
  readonly runRates: Readonly<Record<RunId, number>>;
  readonly glassOut: number;
  readonly pressOut: number;
  readonly precOut: number;
};

function steadyPart2Spec(mountain: Mountain): SteadyPart2Spec {
  const glassOpen = crystalOpen(mountain) && mountain.makers.glassworks > 0;
  const pressOpen =
    hasOwnedFactoryLine(mountain) && mountain.makers.partsPress > 0;
  const precOpen =
    hasOwnedFactoryLine(mountain) && mountain.makers.precisionAssembly > 0;
  const glassOut = makerOutputAmount("glassworks");
  const pressOut = makerOutputAmount("partsPress");
  const precOut = makerOutputAmount("precisionAssembly");
  return {
    glassOpen,
    pressOpen,
    precOpen,
    glassMax: glassOpen ? makerRate(mountain, "glassworks") : 0,
    pressMax: pressOpen ? makerRate(mountain, "partsPress") : 0,
    precMax: precOpen ? makerRate(mountain, "precisionAssembly") : 0,
    glassCrystal: makerInputAmount("glassworks", "crystalRock") / glassOut,
    glassStones: makerInputAmount("glassworks", "stones") / glassOut,
    pressBrick: makerInputAmount("partsPress", "brick") / pressOut,
    pressCut: makerInputAmount("partsPress", "cutStone") / pressOut,
    precBrickPerPart: makerInputAmount("precisionAssembly", "brick") / precOut,
    precCutPerPart: makerInputAmount("precisionAssembly", "cutStone") / precOut,
    precGlassPerPart: makerInputAmount("precisionAssembly", "glass") / precOut,
  };
}

function splitSteadyTwo(
  total: number,
  d0: number,
  d1: number,
): [number, number] {
  const sum = d0 + d1;
  if (total <= 0 || sum <= 0) {
    return [0, 0];
  }
  const first = Math.min(d0, (total * d0) / sum);
  return [first, Math.min(d1, total - first)];
}

function steadyPart2StockCap(
  mountain: Mountain,
  gross: Readonly<Record<GoodId, number>>,
  includeStock: boolean,
): Record<GoodId, number> {
  return {
    stones: includeStock && mountain.stock.stones > 0 ? Infinity : gross.stones,
    brick: includeStock && mountain.stock.brick > 0 ? Infinity : gross.brick,
    cutStone:
      includeStock && mountain.stock.cutStone > 0 ? Infinity : gross.cutStone,
    glass: includeStock && mountain.stock.glass > 0 ? Infinity : gross.glass,
    parts: includeStock && mountain.stock.parts > 0 ? Infinity : gross.parts,
  };
}

function runSteadyPart2Alloc(
  mountain: Mountain,
  base: SteadyBase,
  spec: SteadyPart2Spec,
  state: SteadyPart2State,
  cityOpen: Readonly<Record<GoodId, boolean>>,
  cityDest: Readonly<Record<GoodId, number>>,
  stockCap: Readonly<Record<GoodId, number>>,
) {
  const open = runRecord(false);
  open.pitToStockyardStones = true;
  open.pitTopsoilToKilns = mountain.makers.kiln > 0;
  open.pitGraniteToSaws = graniteOpen(mountain) && mountain.makers.saw > 0;
  open.pitCrystalToGlassworks = spec.glassOpen;
  open.stockToGlassworksStones = spec.glassOpen;
  open.stockToFactoryBrick = spec.pressOpen || spec.precOpen;
  open.stockToFactoryCutStone = spec.pressOpen || spec.precOpen;
  open.stockToFactoryGlass = spec.precOpen;
  open.factoryToStockyardParts = spec.pressOpen || spec.precOpen;
  // Cap production runs by sustainable `state.gross[good]` so `includeStock`
  // lets City delivery drain existing stockpiles without inventing phantom
  // permanent Glassworks/Factory supply when a stockpile holds > 0 units.
  const destCaps = runRecord(0);
  destCaps.pitToStockyardStones = Infinity;
  destCaps.pitTopsoilToKilns = base.kilnNeed;
  destCaps.pitGraniteToSaws = base.sawNeed;
  destCaps.pitCrystalToGlassworks = spec.glassMax * spec.glassCrystal;
  destCaps.stockToGlassworksStones = Math.min(
    state.glassEffective * spec.glassStones,
    state.gross.stones,
  );
  destCaps.stockToFactoryBrick = Math.min(
    spec.pressMax * spec.pressBrick +
      state.precEffective * spec.precBrickPerPart,
    state.gross.brick,
  );
  destCaps.stockToFactoryCutStone = Math.min(
    spec.pressMax * spec.pressCut + state.precEffective * spec.precCutPerPart,
    state.gross.cutStone,
  );
  destCaps.stockToFactoryGlass = Math.min(
    spec.precMax * spec.precGlassPerPart,
    state.gross.glass,
  );
  destCaps.factoryToStockyardParts = Infinity;
  for (const good of CITY_RUN_GOODS) {
    const id = cityRunId(good);
    open[id] = cityOpen[good];
    destCaps[id] = cityOpen[good] ? cityDest[good] : 0;
  }
  return allocateRunRates(base.fleet, open, destCaps, {
    openLvls: base.openLvls,
    pitheadCap: {
      topsoil: base.topsoil,
      granite: base.granite,
      crystal: base.crystal,
    },
    pitheadWeight: {
      topsoil: base.topsoil,
      granite: base.granite,
      crystal: base.crystal,
    },
    stockCap,
    factoryOutputCap: state.factoryOutCap,
  });
}

function initialSteadyPart2(
  base: SteadyBase,
  spec: SteadyPart2Spec,
): SteadyPart2State {
  const glassMax = spec.glassOpen
    ? Math.min(spec.glassMax, base.crystal / spec.glassCrystal)
    : 0;
  const precEffective = spec.precOpen
    ? Math.min(spec.precMax, glassMax / spec.precGlassPerPart)
    : 0;
  const partsMax = spec.pressMax + precEffective;
  return {
    gross: {
      stones: base.topsoil + base.granite + base.crystal,
      brick: Math.min(base.topsoil, base.kilnNeed) / makerTakes("kiln"),
      cutStone: Math.min(base.granite, base.sawNeed) / makerTakes("saw"),
      glass: glassMax,
      parts: partsMax,
    },
    factoryOutCap: partsMax,
    glassEffective: glassMax,
    precEffective,
    runRates: runRecord(0),
    glassOut: 0,
    pressOut: 0,
    precOut: 0,
  };
}

function steadyPart2Step(
  mountain: Mountain,
  base: SteadyBase,
  spec: SteadyPart2Spec,
  prev: SteadyPart2State,
  cityOpen: Readonly<Record<GoodId, boolean>>,
  build: number,
  includeStock: boolean,
): SteadyPart2State {
  const stockCap = steadyPart2StockCap(mountain, prev.gross, includeStock);
  const cityDest = steadyCityDest(build, cityOpen, stockCap);
  const runRates = runSteadyPart2Alloc(
    mountain,
    base,
    spec,
    prev,
    cityOpen,
    cityDest,
    stockCap,
  ).runRates;
  const gStones = runRates.pitToStockyardStones;
  const gBrick = runRates.pitTopsoilToKilns / makerTakes("kiln");
  const gCut = runRates.pitGraniteToSaws / makerTakes("saw");
  const glassCrystalOut = spec.glassOpen
    ? Math.min(
        spec.glassMax,
        runRates.pitCrystalToGlassworks / spec.glassCrystal,
      )
    : 0;
  const glassOut = spec.glassOpen
    ? Math.min(
        glassCrystalOut,
        runRates.stockToGlassworksStones / spec.glassStones,
      )
    : 0;
  const [brickPress, brickPrec] = splitSteadyTwo(
    runRates.stockToFactoryBrick,
    spec.pressMax * spec.pressBrick,
    prev.precEffective * spec.precBrickPerPart,
  );
  const [cutPress, cutPrec] = splitSteadyTwo(
    runRates.stockToFactoryCutStone,
    spec.pressMax * spec.pressCut,
    prev.precEffective * spec.precCutPerPart,
  );
  const pressOut = spec.pressOpen
    ? Math.min(
        spec.pressMax,
        brickPress / spec.pressBrick,
        cutPress / spec.pressCut,
      )
    : 0;
  const precGlassOut = spec.precOpen
    ? Math.min(
        spec.precMax,
        runRates.stockToFactoryGlass / spec.precGlassPerPart,
      )
    : 0;
  const precOut = spec.precOpen
    ? Math.min(
        precGlassOut,
        brickPrec / spec.precBrickPerPart,
        cutPrec / spec.precCutPerPart,
      )
    : 0;
  const partsMade = pressOut + precOut;
  return {
    gross: {
      stones: gStones,
      brick: gBrick,
      cutStone: gCut,
      glass: glassOut,
      parts: Math.min(partsMade, runRates.factoryToStockyardParts),
    },
    factoryOutCap: partsMade,
    glassEffective: glassCrystalOut,
    precEffective: precGlassOut,
    runRates,
    glassOut,
    pressOut,
    precOut,
  };
}

function steadyPart2Converged(
  prev: SteadyPart2State,
  next: SteadyPart2State,
): boolean {
  return (
    GOOD_IDS.every(
      (good) => Math.abs(prev.gross[good] - next.gross[good]) <= RATE_EPS,
    ) &&
    Math.abs(prev.precEffective - next.precEffective) <= RATE_EPS &&
    Math.abs(prev.glassEffective - next.glassEffective) <= RATE_EPS
  );
}

function steadyPart2Solve(
  mountain: Mountain,
  base: SteadyBase,
  cityOpen: Readonly<Record<GoodId, boolean>>,
  build: number,
  includeStock: boolean,
): { readonly income: Partial<Stock>; readonly cityCarry: number } {
  const spec = steadyPart2Spec(mountain);
  let state = initialSteadyPart2(base, spec);
  for (let pass = 0; pass < 6; pass += 1) {
    const next = steadyPart2Step(
      mountain,
      base,
      spec,
      state,
      cityOpen,
      build,
      includeStock,
    );
    const done = pass > 0 && steadyPart2Converged(state, next);
    state = next;
    if (done) {
      break;
    }
  }
  const cityUsed = CITY_RUN_GOODS.reduce(
    (sum, good) => sum + state.runRates[cityRunId(good)],
    0,
  );
  const totalUsed = RUN_ORDER.reduce((sum, id) => sum + state.runRates[id], 0);
  return {
    income: {
      stones: Math.max(
        0,
        state.gross.stones - state.glassOut * spec.glassStones,
      ),
      brick: Math.max(
        0,
        state.gross.brick -
          (state.pressOut * spec.pressBrick +
            state.precOut * spec.precBrickPerPart),
      ),
      cutStone: Math.max(
        0,
        state.gross.cutStone -
          (state.pressOut * spec.pressCut +
            state.precOut * spec.precCutPerPart),
      ),
      glass: Math.max(
        0,
        state.gross.glass - state.precOut * spec.precGlassPerPart,
      ),
      parts: state.gross.parts,
    },
    cityCarry: cityUsed + Math.max(0, base.fleet - totalUsed),
  };
}

function hasPart2Maker(mountain: Mountain): boolean {
  return (
    (crystalOpen(mountain) && mountain.makers.glassworks > 0) ||
    hasOwnedFactoryLine(mountain)
  );
}

/**
 * Steady-state good income/s into the stockyard under Slice 2 physical
 * transport (pithead -> stockyard/makers only, ignoring full stockpiles).
 */
export function slice2SteadyIncome(mountain: Mountain): Partial<Stock> {
  const base = steadyBase(mountain);
  if (base.fleet <= 0) {
    return { ...EMPTY_STOCK };
  }
  if (slice2Part2On() && hasPart2Maker(mountain)) {
    return steadyPart2Solve(mountain, base, NO_CITY_OPEN, 0, false).income;
  }
  const alloc = runSteadyAlloc(
    mountain,
    base,
    NO_CITY_OPEN,
    ZERO_STOCK_CAP,
    ZERO_STOCK_CAP,
  );
  return incomeFromRunRates(alloc.runRates);
}

function steadyPart1OrderRates(
  mountain: Mountain,
  base: SteadyBase,
  cityOpen: Readonly<Record<GoodId, boolean>>,
  build: number,
): { readonly income: Partial<Stock>; readonly cityCarry: number } {
  const canProduce: Record<GoodId, boolean> = {
    stones: base.topsoil + base.granite + base.crystal > 0,
    brick: base.topsoil > 0 && base.kilnNeed > 0,
    cutStone: base.granite > 0 && base.sawNeed > 0,
    glass: false,
    parts: false,
  };
  const stockCap1: Record<GoodId, number> = {
    stones: mountain.stock.stones > 0 || canProduce.stones ? Infinity : 0,
    brick: mountain.stock.brick > 0 || canProduce.brick ? Infinity : 0,
    cutStone: mountain.stock.cutStone > 0 || canProduce.cutStone ? Infinity : 0,
    glass: mountain.stock.glass > 0 || canProduce.glass ? Infinity : 0,
    parts: mountain.stock.parts > 0 || canProduce.parts ? Infinity : 0,
  };
  const pass1 = incomeFromRunRates(
    runSteadyAlloc(
      mountain,
      base,
      cityOpen,
      steadyCityDest(build, cityOpen, stockCap1),
      stockCap1,
    ).runRates,
  );
  const stockCap2: Record<GoodId, number> = {
    stones: mountain.stock.stones > 0 ? Infinity : (pass1.stones ?? 0),
    brick: mountain.stock.brick > 0 ? Infinity : (pass1.brick ?? 0),
    cutStone: mountain.stock.cutStone > 0 ? Infinity : (pass1.cutStone ?? 0),
    glass: mountain.stock.glass > 0 ? Infinity : (pass1.glass ?? 0),
    parts: mountain.stock.parts > 0 ? Infinity : (pass1.parts ?? 0),
  };
  const pass2 = runSteadyAlloc(
    mountain,
    base,
    cityOpen,
    steadyCityDest(build, cityOpen, stockCap2),
    stockCap2,
  );
  const cityUsed = CITY_RUN_GOODS.reduce(
    (sum, good) => sum + pass2.runRates[cityRunId(good)],
    0,
  );
  const totalUsed = RUN_ORDER.reduce((sum, id) => sum + pass2.runRates[id], 0);
  return {
    income: incomeFromRunRates(pass2.runRates),
    cityCarry: cityUsed + Math.max(0, base.fleet - totalUsed),
  };
}

/**
 * Steady-state production income and City delivery carry rate under Slice 2
 * physical transport when a City project is delivering.
 */
export function slice2OrderRates(mountain: Mountain): {
  readonly income: Partial<Stock>;
  readonly cityCarry: number;
} {
  if (mountain.project.kind !== "delivering") {
    return { income: slice2SteadyIncome(mountain), cityCarry: 0 };
  }
  const base = steadyBase(mountain);
  if (base.fleet <= 0) {
    return { income: { ...EMPTY_STOCK }, cityCarry: 0 };
  }
  const need = stillRequired(mountain.project.site);
  const cityOpen: Record<GoodId, boolean> = {
    stones: need.stones > 0,
    brick: need.brick > 0,
    cutStone: need.cutStone > 0,
    glass: need.glass > 0,
    parts: need.parts > 0,
  };
  const build = buildRate(mountain);
  return slice2Part2On() && hasPart2Maker(mountain)
    ? steadyPart2Solve(mountain, base, cityOpen, build, true)
    : steadyPart1OrderRates(mountain, base, cityOpen, build);
}

/**
 * Instantaneous Slice 2 flow snapshot from the coupled solver (pay=1, live
 * drilling) so Transport sheet and City order readouts match actual simulation
 * rates, per-good SITE_GOOD_CAP buffers, maker-buffer supply, and City pass-through.
 */
export function slice2LiveSnapshot(mountain: Mountain): {
  readonly runRates: Readonly<Record<RunId, number>>;
  readonly destCaps: Readonly<Record<RunId, number>>;
  readonly pitheadCap: Readonly<Record<MineLevelId, number>>;
  readonly stockCap: Readonly<Record<GoodId, number>>;
  readonly factoryOutputCap: number;
  readonly hoist: Readonly<Record<MineLevelId, number>>;
  readonly makerOut: Readonly<Record<MakerId, number>>;
  readonly build: Readonly<Record<GoodId, number>>;
} {
  const rates = coupledRates(mountain, 1, true);
  const destCaps = destCapsFor(
    mountain,
    rates.runRates,
    rates.makerOut,
    rates.build,
  );
  const sources = runSourcesFor(
    mountain,
    openLevels(mountain),
    rates.hoist,
    rates.runRates,
    rates.makerOut,
  );
  return {
    runRates: rates.runRates,
    destCaps,
    pitheadCap: sources.pitheadCap,
    stockCap: sources.stockCap,
    factoryOutputCap: sources.factoryOutputCap,
    hoist: rates.hoist,
    makerOut: rates.makerOut,
    build: rates.build,
  };
}
