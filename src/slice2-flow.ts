import {
  SITE_GOOD_CAP,
  applyCityWork,
  buildRate,
  goodsTotal,
  shareOut,
  shareProportional,
} from "./building-site";
import { buildIn, receive, stillRequired, stillToBuild } from "./city";
import {
  MAKER_IDS,
  makerBuffer,
  makerInputRoom,
  makerOutput,
  makerPrimaryInput,
  makerRate,
  makerTakes,
  stepMakerCycle,
  type MakerBuffers,
  type MakerId,
} from "./makers";
import { flowMineToPitheadLive } from "./mine-cages";
import { graniteOpen, openLevels, type MineLevelId } from "./mine-levels";
import {
  flowUndergroundToPithead,
  pitheadRoom,
  undergroundPitheadChains,
} from "./mine-piles";
import type { Mountain } from "./mountain";
import { chainChange, chainFlows, evenShares, wholeSeconds } from "./piles";
import {
  EMPTY_STOCK,
  GOOD_IDS,
  addedStock,
  pay as payStock,
  type GoodId,
  type Price,
  type Stock,
} from "./stock";
import { stockpileRoom } from "./stockyard";
import {
  CITY_RUN_GOODS,
  RUN_ORDER,
  allocateRunRates,
  applyTransportTransfer,
  cityRunId,
  fleetRate,
  planTransportTransfer,
  runSnapshots,
  type CityRunGood,
  type RunId,
} from "./transport";

/**
 * Slice 2 Part 1 coupled-stretch simulation engine (#766, spec rule 5.3).
 * Imported only by `src/mountain.ts` (mirroring `src/mine-cages.ts`).
 *
 * - Live play (`stepSlice2Live`): fixed 1 s 4-phase order:
 *   (a) mine drilling/haulage/hoisting -> pithead (zero Stone bypass),
 *   (b) physical transport runs (water-filling + proportional source contention),
 *   (c) whole-cycle makers with persisted integer `cycleMicros`,
 *   (d) City builders (`shareOut`).
 * - Offline / rate play (`stretchSlice2`): deterministic event-driven stretches
 *   using fixed-point `coupledRates` and minimum time to next state change
 *   (1 s floor), keeping 8-hour live vs. offline agreement within <= 1%.
 */

export type Slice2Step = {
  readonly mountain: Mountain;
  /** Rock hoisted into pithead buffers during this step. */
  readonly mined: number;
  /** Goods added to stockpiles (stones carried from pithead + maker outputs). */
  readonly gained: Partial<Stock>;
  readonly settledAt: number;
  readonly producing: boolean;
};

const RATE_EPS = 1e-9;
const MAX_FIXED_POINT_PASSES = 32;

/** Snapshot of converged continuous rates across the entire Slice 2 chain. */
type CoupledRates = {
  readonly hoist: Readonly<Record<MineLevelId, number>>;
  readonly runRates: Readonly<Record<RunId, number>>;
  readonly pitheadDrain: Readonly<Record<MineLevelId, number>>;
  readonly makerOut: Readonly<Record<MakerId, number>>;
  readonly build: Readonly<Record<CityRunGood, number>>;
};

function priceOfGoods(goods: Partial<Stock>): Price {
  return GOOD_IDS.flatMap((good) =>
    (goods[good] ?? 0) > 0 ? [{ good, amount: goods[good] ?? 0 }] : [],
  );
}

function stepSingleMaker(
  mountain: Mountain,
  id: MakerId,
  dt: number,
  pay: number,
  extraOutputRoom: Readonly<Partial<Record<GoodId, number>>>,
): {
  readonly changed: boolean;
  readonly buffer: MakerBuffers[MakerId];
  readonly nextMicros: number;
  readonly outGood: GoodId;
  readonly produced: number;
} {
  const inputId = makerPrimaryInput(id);
  const held = makerBuffer(mountain, id, inputId);
  const outGood = makerOutput(id);
  const prevMicros = mountain.cycleMicros[id] ?? 0;
  if (mountain.makers[id] <= 0 || (id === "saw" && !graniteOpen(mountain))) {
    return {
      changed: false,
      buffer: mountain.makerBuffers[id],
      nextMicros: prevMicros,
      outGood,
      produced: 0,
    };
  }
  const baseRoom = stockpileRoom(mountain, outGood) - mountain.stock[outGood];
  const outRoom = Number.isFinite(baseRoom)
    ? Math.max(0, baseRoom) + (extraOutputRoom[outGood] ?? 0)
    : Number.MAX_SAFE_INTEGER;
  const result = stepMakerCycle({
    inputs: [{ id: inputId, amount: makerTakes(id), held }],
    outputAmount: 1,
    outputRoom: outRoom,
    staffedOutputRate: makerRate(mountain, id) * pay,
    dt,
    cycleMicros: prevMicros,
  });
  const used = result.consumed[inputId] ?? 0;
  const left = held - used;
  const buffer =
    used > 0
      ? left > 0
        ? { [inputId]: left }
        : {}
      : mountain.makerBuffers[id];
  const changed =
    used > 0 || result.produced > 0 || result.nextMicros !== prevMicros;
  return {
    changed,
    buffer,
    nextMicros: result.nextMicros,
    outGood,
    produced: result.produced,
  };
}

/** Runs all owned Part 1 makers for `dt` seconds using exact integer `cycleMicros`. */
function stepSlice2Makers(
  mountain: Mountain,
  dt: number,
  pay: number,
  extraOutputRoom: Readonly<Partial<Record<GoodId, number>>> = {},
): { readonly mountain: Mountain; readonly made: Partial<Stock> } {
  const made: Partial<Record<GoodId, number>> = {};
  const nextBuffers: Record<MakerId, MakerBuffers[MakerId]> = {
    kiln: mountain.makerBuffers.kiln,
    saw: mountain.makerBuffers.saw,
  };
  const nextMicros: Partial<Record<MakerId, number>> = {};
  let changed = false;
  for (const id of MAKER_IDS) {
    const step = stepSingleMaker(mountain, id, dt, pay, extraOutputRoom);
    if (step.nextMicros > 0) {
      nextMicros[id] = step.nextMicros;
    }
    if (!step.changed) {
      continue;
    }
    changed = true;
    nextBuffers[id] = step.buffer;
    if (step.produced > 0) {
      made[step.outGood] = (made[step.outGood] ?? 0) + step.produced;
    }
  }
  if (!changed) {
    return { mountain, made: {} };
  }
  return {
    mountain: {
      ...mountain,
      makerBuffers: nextBuffers,
      cycleMicros: nextMicros,
      stock:
        goodsTotal(made) > 0
          ? addedStock(mountain.stock, made)
          : mountain.stock,
    },
    made,
  };
}

function stepQuota(rate: number, tickIndex: number): number {
  return Math.max(
    0,
    Math.floor((tickIndex + 1) * rate + 1e-9) -
      Math.floor(tickIndex * rate + 1e-9),
  );
}

/** Phase (d) of live 1 s step: City builders build from what is already on site. */
function stepBuildersOnly(
  mountain: Mountain,
  pay: number,
  tickIndex: number,
): Mountain {
  if (mountain.project.kind === "unordered") {
    return mountain;
  }
  const cap = stepQuota(buildRate(mountain) * pay, tickIndex);
  if (cap <= 0) {
    return mountain;
  }
  const built = shareOut(cap, mountain.project.site.onSite, tickIndex);
  return goodsTotal(built) > 0 ? buildIn(mountain, built) : mountain;
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
  // (a) Mine drilling, haulage & cages -> pithead (zero Stone bypass)
  const mine = flowMineToPitheadLive(mountain, 1, pay, drilling, tickIndex);
  // (b) Physical transport runs (water-filling + shareProportional source contention)
  const transfer = planTransportTransfer(
    mine.mountain,
    stepQuota(fleetRate(mine.mountain) * pay, tickIndex),
    undefined,
    tickIndex,
  );
  const moved = applyTransportTransfer(mine.mountain, transfer);
  // (c) Makers whole-cycle execution with persisted integer cycleMicros
  const made = stepSlice2Makers(moved.mountain, 1, pay);
  // (d) City builders
  const after = stepBuildersOnly(made.mountain, pay, tickIndex);
  const gained: Partial<Stock> = {
    ...made.made,
    ...(moved.gainedStones > 0 ? { stones: moved.gainedStones } : {}),
  };
  return { mountain: after, mined: mine.mined, gained };
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
  const out = Object.fromEntries(RUN_ORDER.map((id) => [id, false])) as Record<
    RunId,
    boolean
  >;
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
  const out: Record<CityRunGood, number> = { stones: 0, brick: 0, cutStone: 0 };
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

function makerRatesFor(
  mountain: Mountain,
  pay: number,
  runRates: Readonly<Record<RunId, number>>,
): Record<MakerId, number> {
  const out: Record<MakerId, number> = { kiln: 0, saw: 0 };
  for (const id of MAKER_IDS) {
    if (mountain.makers[id] <= 0 || (id === "saw" && !graniteOpen(mountain))) {
      continue;
    }
    const takes = makerTakes(id);
    const inId = makerPrimaryInput(id);
    const inRun: RunId =
      id === "kiln" ? "pitTopsoilToKilns" : "pitGraniteToSaws";
    const held = makerBuffer(mountain, id, inId);
    const inCap = held >= takes ? Infinity : runRates[inRun] / takes;
    const outGood = makerOutput(id);
    const outRoom = stockpileRoom(mountain, outGood) - mountain.stock[outGood];
    const outCap =
      outRoom > 0 ? Infinity : outRoom === 0 ? runRates[cityRunId(outGood)] : 0;
    out[id] = Math.min(makerRate(mountain, id) * pay, inCap, outCap);
  }
  return out;
}

function destCapsFor(
  mountain: Mountain,
  runRates: Readonly<Record<RunId, number>>,
  makerOut: Readonly<Record<MakerId, number>>,
  build: Readonly<Record<CityRunGood, number>>,
): Record<RunId, number> {
  const stoneRoom = stockpileRoom(mountain, "stones") - mountain.stock.stones;
  const kilnRoom =
    makerInputRoom(mountain, "kiln") -
    makerBuffer(mountain, "kiln", "topsoilRock");
  const sawRoom = graniteOpen(mountain)
    ? makerInputRoom(mountain, "saw") -
      makerBuffer(mountain, "saw", "graniteRock")
    : 0;
  const project = mountain.project;
  const need =
    project.kind === "delivering" ? stillRequired(project.site) : undefined;
  const cityCap = (good: CityRunGood): number => {
    if (
      project.kind !== "delivering" ||
      need === undefined ||
      need[good] <= 0
    ) {
      return 0;
    }
    const onSite = project.site.onSite[good];
    return onSite < SITE_GOOD_CAP
      ? Infinity
      : onSite === SITE_GOOD_CAP
        ? build[good]
        : 0;
  };
  return {
    pitToStockyardStones:
      stoneRoom > 0
        ? Infinity
        : stoneRoom === 0
          ? runRates["stockToCity:stones"]
          : 0,
    pitTopsoilToKilns:
      kilnRoom > 0
        ? Infinity
        : kilnRoom === 0
          ? makerOut.kiln * makerTakes("kiln")
          : 0,
    pitGraniteToSaws:
      sawRoom > 0
        ? Infinity
        : sawRoom === 0
          ? makerOut.saw * makerTakes("saw")
          : 0,
    "stockToCity:stones": cityCap("stones"),
    "stockToCity:brick": cityCap("brick"),
    "stockToCity:cutStone": cityCap("cutStone"),
  };
}

function ratesSettled(
  prev: Readonly<Record<RunId, number>>,
  next: Readonly<Record<RunId, number>>,
): boolean {
  return RUN_ORDER.every((id) => Math.abs(prev[id] - next[id]) <= RATE_EPS);
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
  };
}

function runSourcesFor(
  mountain: Mountain,
  openLvls: readonly MineLevelId[],
  hoist: Readonly<Record<MineLevelId, number>>,
  runRates: Readonly<Record<RunId, number>>,
  makerOut: Readonly<Record<MakerId, number>>,
) {
  const graniteHeld = graniteOpen(mountain) ? mountain.pithead.granite : 0;
  return {
    openLvls,
    pitheadCap: {
      topsoil: mountain.pithead.topsoil > 0 ? Infinity : hoist.topsoil,
      granite: graniteHeld > 0 ? Infinity : hoist.granite,
    },
    pitheadWeight: {
      topsoil:
        mountain.pithead.topsoil > 0 ? mountain.pithead.topsoil : hoist.topsoil,
      granite: graniteHeld > 0 ? graniteHeld : hoist.granite,
    },
    stockCap: {
      stones:
        mountain.stock.stones > 0 ? Infinity : runRates.pitToStockyardStones,
      brick: mountain.stock.brick > 0 ? Infinity : makerOut.kiln,
      cutStone: mountain.stock.cutStone > 0 ? Infinity : makerOut.saw,
    },
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
 * physical transport runs, makers, and City builders (spec rule 5.3).
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
  };
  let runRates: Readonly<Record<RunId, number>> = Object.fromEntries(
    RUN_ORDER.map((id) => [id, 0]),
  ) as Record<RunId, number>;
  let hoist: Record<MineLevelId, number> = { topsoil: 0, granite: 0 };
  let makerOut: Record<MakerId, number> = { kiln: 0, saw: 0 };
  let build: Record<CityRunGood, number> = { stones: 0, brick: 0, cutStone: 0 };

  for (let pass = 0; pass < MAX_FIXED_POINT_PASSES; pass += 1) {
    hoist = hoistRatesFor(mountain, pay, drilling, pitheadDrain);
    build = buildRatesFor(mountain, pay, runRates);
    makerOut = makerRatesFor(mountain, pay, runRates);
    const destCaps = destCapsFor(mountain, runRates, makerOut, build);
    const sources = runSourcesFor(
      mountain,
      openLvls,
      hoist,
      runRates,
      makerOut,
    );
    const next = allocateRunRates(totalFleet, open, destCaps, sources);
    const done = pass > 0 && ratesSettled(runRates, next.runRates);
    runRates =
      pass === 0
        ? next.runRates
        : dampRecord(RUN_ORDER, runRates, next.runRates);
    pitheadDrain =
      pass === 0
        ? next.pitheadDrain
        : dampRecord(["topsoil", "granite"], pitheadDrain, next.pitheadDrain);
    if (done) {
      break;
    }
  }
  return { hoist, runRates, pitheadDrain, makerOut, build };
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
    if (need[good] > 0 && deliverRate > RATE_EPS) {
      soonest = Math.min(soonest, need[good] / deliverRate);
    }
    if (toBuild[good] > 0 && buildRateGood > RATE_EPS) {
      soonest = Math.min(soonest, toBuild[good] / buildRateGood);
    }
  }
  return soonest;
}

/** Minimum seconds until any buffer/pile/stockpile/step changes state. */
function nextEventSeconds(
  mountain: Mountain,
  rates: CoupledRates,
  pay: number,
  drilling: boolean,
): number {
  const chains = undergroundPitheadChains(
    mountain,
    pay,
    drilling,
    rates.pitheadDrain,
  );
  let soonest = cityEventTime(mountain, rates);
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
  for (const id of MAKER_IDS) {
    if (mountain.makers[id] <= 0 || (id === "saw" && !graniteOpen(mountain))) {
      continue;
    }
    const inId = makerPrimaryInput(id);
    const inRun: RunId =
      id === "kiln" ? "pitTopsoilToKilns" : "pitGraniteToSaws";
    const takes = makerTakes(id);
    soonest = Math.min(
      soonest,
      bufferEventTime(
        makerBuffer(mountain, id, inId),
        makerInputRoom(mountain, id),
        rates.runRates[inRun] - rates.makerOut[id] * takes,
        takes - 1,
      ),
    );
  }
  const stockIn: Record<CityRunGood, number> = {
    stones: rates.runRates.pitToStockyardStones,
    brick: rates.makerOut.kiln,
    cutStone: rates.makerOut.saw,
  };
  for (const good of CITY_RUN_GOODS) {
    soonest = Math.min(
      soonest,
      bufferEventTime(
        mountain.stock[good],
        stockpileRoom(mountain, good),
        stockIn[good] - rates.runRates[cityRunId(good)],
      ),
    );
  }
  return soonest;
}

/** Moves pithead rock into Stone and maker buffers over a multi-second stretch. */
function moveStretchPithead(
  mountain: Mountain,
  rates: CoupledRates,
  seconds: number,
): { readonly mountain: Mountain; readonly gainedStones: number } {
  const openLvls = openLevels(mountain);
  const stoneRoomBase =
    stockpileRoom(mountain, "stones") - mountain.stock.stones;
  const stoneCap = Number.isFinite(stoneRoomBase)
    ? Math.max(0, stoneRoomBase) +
      Math.floor(rates.runRates["stockToCity:stones"] * seconds + RATE_EPS)
    : Number.MAX_SAFE_INTEGER;
  const kilnCap =
    Math.max(
      0,
      makerInputRoom(mountain, "kiln") -
        makerBuffer(mountain, "kiln", "topsoilRock"),
    ) +
    Math.floor(rates.makerOut.kiln * makerTakes("kiln") * seconds + RATE_EPS);
  const sawCap = graniteOpen(mountain)
    ? Math.max(
        0,
        makerInputRoom(mountain, "saw") -
          makerBuffer(mountain, "saw", "graniteRock"),
      ) +
      Math.floor(rates.makerOut.saw * makerTakes("saw") * seconds + RATE_EPS)
    : 0;
  const wantStone = Math.min(
    Math.floor(rates.runRates.pitToStockyardStones * seconds + RATE_EPS),
    stoneCap,
  );
  const wantMaker: Record<MineLevelId, number> = {
    topsoil: Math.min(
      Math.floor(rates.runRates.pitTopsoilToKilns * seconds + RATE_EPS),
      kilnCap,
    ),
    granite: Math.min(
      Math.floor(rates.runRates.pitGraniteToSaws * seconds + RATE_EPS),
      sawCap,
    ),
  };
  const stoneSplit = shareProportional(wantStone, openLvls, mountain.pithead);
  const stoneFrom: Record<MineLevelId, number> = { topsoil: 0, granite: 0 };
  const makerMoved: Record<MineLevelId, number> = { topsoil: 0, granite: 0 };
  for (const level of openLvls) {
    const split = shareProportional(
      mountain.pithead[level],
      ["stone", "maker"],
      { stone: stoneSplit[level] ?? 0, maker: wantMaker[level] },
    );
    stoneFrom[level] = split.stone ?? 0;
    makerMoved[level] = split.maker ?? 0;
  }
  const gainedStones = stoneFrom.topsoil + stoneFrom.granite;
  if (gainedStones + makerMoved.topsoil + makerMoved.granite <= 0) {
    return { mountain, gainedStones: 0 };
  }
  const applied = applyTransportTransfer(mountain, {
    moved: {
      pitToStockyardStones: gainedStones,
      pitTopsoilToKilns: makerMoved.topsoil,
      pitGraniteToSaws: makerMoved.granite,
      "stockToCity:stones": 0,
      "stockToCity:brick": 0,
      "stockToCity:cutStone": 0,
    },
    stoneFromPithead: stoneFrom,
  });
  return { mountain: applied.mountain, gainedStones: applied.gainedStones };
}

/** Applies City transport + builder work over a multi-second stretch cleanly. */
function applyStretchCity(
  mountain: Mountain,
  rates: CoupledRates,
  seconds: number,
  pay: number,
): Mountain {
  if (mountain.project.kind === "unordered") {
    return mountain;
  }
  const desired: Partial<Record<GoodId, number>> = {};
  if (mountain.project.kind === "delivering") {
    for (const good of CITY_RUN_GOODS) {
      const want = Math.min(
        mountain.stock[good],
        Math.floor(rates.runRates[cityRunId(good)] * seconds + RATE_EPS),
      );
      if (want > 0) {
        desired[good] = want;
      }
    }
  }
  const buildCap = Math.floor(buildRate(mountain) * pay * seconds + RATE_EPS);
  const { delivered, built } = applyCityWork(
    mountain.project.site,
    desired,
    buildCap,
  );
  let state = mountain;
  if (goodsTotal(delivered) > 0) {
    state = receive(payStock(state, priceOfGoods(delivered)), delivered);
  }
  if (goodsTotal(built) > 0) {
    state = buildIn(state, built);
  }
  return state;
}

/** One discrete 1-second offline stretch (avoids sub-unit stalls on 1 s boundaries). */
function applyOneSecondStretch(
  mountain: Mountain,
  rates: CoupledRates,
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
    rates.pitheadDrain,
  );
  const transfer = planTransportTransfer(
    mine.mountain,
    stepQuota(fleetRate(mine.mountain) * pay, tickIndex),
    undefined,
    tickIndex,
  );
  const moved = applyTransportTransfer(mine.mountain, transfer);
  const made = stepSlice2Makers(moved.mountain, 1, pay);
  const after = stepBuildersOnly(made.mountain, pay, tickIndex);
  return {
    mountain: after,
    mined: mine.hoisted.topsoil + mine.hoisted.granite,
    gained: {
      ...made.made,
      ...(moved.gainedStones > 0 ? { stones: moved.gainedStones } : {}),
    },
  };
}

/**
 * One event-driven coupled stretch of Slice 2 Part 1 (spec rule 5.3):
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
  const seconds = Math.min(remaining, Math.max(1, wholeSeconds(eventSec)));
  if (seconds === 1) {
    const one = applyOneSecondStretch(
      mountain,
      rates,
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
  const mine = flowUndergroundToPithead(
    mountain,
    seconds,
    pay,
    drilling,
    rates.pitheadDrain,
  );
  const moved = moveStretchPithead(mine.mountain, rates, seconds);
  const extraOut: Partial<Record<GoodId, number>> = {
    brick: Math.floor(rates.runRates["stockToCity:brick"] * seconds + RATE_EPS),
    cutStone: Math.floor(
      rates.runRates["stockToCity:cutStone"] * seconds + RATE_EPS,
    ),
  };
  const made = stepSlice2Makers(moved.mountain, seconds, pay, extraOut);
  const after = applyStretchCity(made.mountain, rates, seconds, pay);
  const mined = mine.hoisted.topsoil + mine.hoisted.granite;
  const gained: Partial<Stock> = {
    ...made.made,
    ...(moved.gainedStones > 0 ? { stones: moved.gainedStones } : {}),
  };
  return {
    mountain: after,
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
