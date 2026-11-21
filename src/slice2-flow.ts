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
  MAKER_IDS,
  makerBuffer,
  makerCycleLimit,
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
  steadyLevels,
  undergroundPitheadChains,
} from "./mine-piles";
import type { Mountain } from "./mountain";
import { chainChange, chainFlows, evenShares, stepQuota } from "./piles";
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
  allocateRunRates,
  applyTransportTransfer,
  cityRunId,
  fleetRate,
  planTransportTransfer,
  priceOf,
  runSnapshots,
  type CityRunGood,
  type RunId,
} from "./transport";

/**
 * Slice 2 Part 1 coupled-stretch simulation engine (#766, spec rule 5.3).
 * Runtime stepping is imported by `src/mountain.ts`; steady-state lab queries
 * are also imported by `src/lab/fresh-kit.ts`.
 *
 * - Live play (`accrueSlice2Live`): fixed 1 s 4-phase order:
 *   (a) mine drilling/haulage/hoisting -> pithead (zero Stone bypass),
 *   (b) physical transport runs (water-filling + proportional source contention),
 *   (c) whole-cycle makers with persisted integer `cycleMicros`,
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
const MAX_FIXED_POINT_PASSES = 32;
const LEVEL_KEYS: readonly MineLevelId[] = ["topsoil", "granite"];

/** Snapshot of converged continuous rates across the entire Slice 2 chain. */
type CoupledRates = {
  readonly hoist: Readonly<Record<MineLevelId, number>>;
  readonly runRates: Readonly<Record<RunId, number>>;
  readonly pitheadDrain: Readonly<Record<MineLevelId, number>>;
  readonly stoneFromPithead: Readonly<Record<MineLevelId, number>>;
  readonly makerOut: Readonly<Record<MakerId, number>>;
  readonly build: Readonly<Record<CityRunGood, number>>;
};

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
    ? Math.max(0, baseRoom + (extraOutputRoom[outGood] ?? 0))
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

/**
 * Per-good City destination room for a 1 s tick with `buildCap` builder budget.
 * Uses water-filling (`evenShares`) over upper-bound on-site supply entering
 * Phase (d) so uncontested fast goods get full builder throughput while
 * Phase (d) still guarantees `onSite[good] <= SITE_GOOD_CAP`.
 */
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
  const moved = applyTransportTransfer(mountain, transfer);
  const made = stepSlice2Makers(moved.mountain, 1, pay);
  const after = stepBuildersOnly(made.mountain, buildCap, tickIndex);
  return {
    mountain: after,
    gained: {
      ...made.made,
      ...(moved.gainedStones > 0 ? { stones: moved.gainedStones } : {}),
    },
  };
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
  let stoneFromPithead: Readonly<Record<MineLevelId, number>> = {
    topsoil: 0,
    granite: 0,
  };
  let runRates: Readonly<Record<RunId, number>> = Object.fromEntries(
    RUN_ORDER.map((id) => [id, 0]),
  ) as Record<RunId, number>;

  let prevDrain: Readonly<Record<MineLevelId, number>> | undefined;
  let hoist: Record<MineLevelId, number> = { topsoil: 0, granite: 0 };
  let build: Record<CityRunGood, number> = { stones: 0, brick: 0, cutStone: 0 };
  let makerOut: Record<MakerId, number> = { kiln: 0, saw: 0 };
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
    makerOut = makerRatesFor(mountain, pay, runRates);
  }
  return { hoist, runRates, pitheadDrain, stoneFromPithead, makerOut, build };
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

/** Minimum seconds until any pile, pithead, maker buffer, stockpile, or City step changes state. */
function nextEventSeconds(
  mountain: Mountain,
  rates: CoupledRates,
  pay: number,
  drilling: boolean,
): number {
  let soonest = cityEventTime(mountain, rates);
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

/** Whole City deliveries bounded by `applyCityWork` (`stillRequired` + `SITE_GOOD_CAP` headroom). */
function cityOutCap(
  mountain: Mountain,
  rates: CoupledRates,
  seconds: number,
  pay: number,
  tickIndex?: number,
): Record<CityRunGood, number> {
  if (mountain.project.kind !== "delivering") {
    return { stones: 0, brick: 0, cutStone: 0 };
  }
  const need = stillRequired(mountain.project.site);
  const stockIn: Record<CityRunGood, number> = {
    stones: rates.runRates.pitToStockyardStones,
    brick: rates.makerOut.kiln,
    cutStone: rates.makerOut.saw,
  };
  const rawDesired: Partial<Record<GoodId, number>> = {};
  for (const good of CITY_RUN_GOODS) {
    const rate = rates.runRates[cityRunId(good)];
    const raw = rate * seconds;
    const dryEq =
      mountain.stock[good] === 0 && rate >= stockIn[good] - RATE_EPS;
    const whole = dryEq
      ? Math.ceil(raw - RATE_EPS)
      : tickIndex !== undefined
        ? stepQuota(rate, tickIndex)
        : Math.floor(raw + RATE_EPS);
    const want = Math.min(need[good], Math.max(0, whole));
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
  };
}

/** Exact integer maker input rock budget over `seconds` without overshooting buffer or stockpile caps. */
function stretchMakerRockCap(
  mountain: Mountain,
  id: MakerId,
  rates: CoupledRates,
  cityOut: Readonly<Record<CityRunGood, number>>,
  seconds: number,
  pay: number,
): number {
  if (mountain.makers[id] <= 0 || (id === "saw" && !graniteOpen(mountain))) {
    return 0;
  }
  const outGood = makerOutput(id);
  const stockRoomBase =
    stockpileRoom(mountain, outGood) - mountain.stock[outGood];
  const outRoom = Number.isFinite(stockRoomBase)
    ? Math.max(0, stockRoomBase + cityOut[outGood])
    : Number.MAX_SAFE_INTEGER;
  const maxByRate = makerCycleLimit(
    makerRate(mountain, id) * pay,
    seconds,
    mountain.cycleMicros[id] ?? 0,
  );
  const cycles = Math.min(
    Math.ceil(rates.makerOut[id] * seconds - RATE_EPS),
    outRoom,
    maxByRate,
  );
  const bufRoomBase =
    makerInputRoom(mountain, id) -
    makerBuffer(mountain, id, makerPrimaryInput(id));
  return Math.max(0, bufRoomBase + cycles * makerTakes(id));
}

/** Planned integer pithead withdrawals per level over a multi-second stretch. */
function planStretchPithead(
  mountain: Mountain,
  rates: CoupledRates,
  cityOut: Readonly<Record<CityRunGood, number>>,
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
    ? Math.max(0, stoneRoomBase + cityOut.stones)
    : Number.MAX_SAFE_INTEGER;
  const dryEq = (level: MineLevelId): boolean =>
    mountain.pithead[level] === 0 &&
    rates.pitheadDrain[level] >= rates.hoist[level] - RATE_EPS;
  const stoneWhole = (level: MineLevelId): number => {
    const rate = rates.stoneFromPithead[level];
    const raw = rate * seconds;
    return dryEq(level)
      ? Math.ceil(raw - RATE_EPS)
      : tickIndex !== undefined
        ? stepQuota(rate, tickIndex)
        : Math.floor(raw + RATE_EPS);
  };
  const rawStone: Record<MineLevelId, number> = {
    topsoil: stoneWhole("topsoil"),
    granite: graniteOpen(mountain) ? stoneWhole("granite") : 0,
  };
  const scaled =
    rawStone.topsoil + rawStone.granite > stoneCap
      ? shareProportional(stoneCap, openLvls, rawStone)
      : rawStone;
  const wantStone: Record<MineLevelId, number> = {
    topsoil: scaled.topsoil ?? 0,
    granite: scaled.granite ?? 0,
  };
  const makerWhole = (level: MineLevelId, run: RunId): number => {
    const rate = rates.runRates[run];
    const raw = rate * seconds;
    return dryEq(level)
      ? Math.ceil(raw - RATE_EPS)
      : tickIndex !== undefined
        ? stepQuota(rate, tickIndex)
        : Math.floor(raw + RATE_EPS);
  };
  const wantMaker: Record<MineLevelId, number> = {
    topsoil: Math.min(
      makerWhole("topsoil", "pitTopsoilToKilns"),
      stretchMakerRockCap(mountain, "kiln", rates, cityOut, seconds, pay),
    ),
    granite: graniteOpen(mountain)
      ? Math.min(
          makerWhole("granite", "pitGraniteToSaws"),
          stretchMakerRockCap(mountain, "saw", rates, cityOut, seconds, pay),
        )
      : 0,
  };
  if (seconds === 1) {
    let stoneLeft = Math.max(
      0,
      stoneCap - wantStone.topsoil - wantStone.granite,
    );
    for (const level of openLvls) {
      const mRun: RunId =
        level === "topsoil" ? "pitTopsoilToKilns" : "pitGraniteToSaws";
      const floorMaker = Math.floor(rates.runRates[mRun] + RATE_EPS);
      const spill = Math.max(0, floorMaker - wantMaker[level]);
      const extra = Math.min(spill, stoneLeft);
      wantStone[level] += extra;
      stoneLeft -= extra;
    }
  }
  return {
    wantStone,
    wantMaker,
    drainRate: {
      topsoil: (wantStone.topsoil + wantMaker.topsoil) / seconds,
      granite: (wantStone.granite + wantMaker.granite) / seconds,
    },
  };
}

/** Moves pithead rock into Stone and maker buffers over a multi-second stretch. */
function moveStretchPithead(
  mountain: Mountain,
  wantStone: Readonly<Record<MineLevelId, number>>,
  wantMaker: Readonly<Record<MineLevelId, number>>,
): { readonly mountain: Mountain; readonly gainedStones: number } {
  const openLvls = openLevels(mountain);
  const stoneFrom: Record<MineLevelId, number> = { topsoil: 0, granite: 0 };
  const makerMoved: Record<MineLevelId, number> = { topsoil: 0, granite: 0 };
  for (const level of openLvls) {
    const split = shareProportional(
      mountain.pithead[level],
      ["stone", "maker"],
      { stone: wantStone[level], maker: wantMaker[level] },
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
  cityOut: Readonly<Record<CityRunGood, number>>,
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

const ZERO_DRAIN: Readonly<Record<MineLevelId, number>> = {
  topsoil: 0,
  granite: 0,
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
    mined: mine.hoisted.topsoil + mine.hoisted.granite,
    gained: surface.gained,
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
  // Floor multi-second stretches so they stop before crossing any buffer/step
  // boundary; 1-second stretches use discrete `stepQuota` (with an
  // `applyOneSecondStretch` fallback if a boundary tick makes no progress).
  const seconds = Math.min(remaining, Math.max(1, Math.floor(eventSec)));
  const tickIndex = seconds === 1 ? Math.floor(from / 1000) : undefined;
  const cityOut = cityOutCap(mountain, rates, seconds, pay, tickIndex);
  const pitPlan = planStretchPithead(
    mountain,
    rates,
    cityOut,
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
  const moved = moveStretchPithead(
    mine.mountain,
    pitPlan.wantStone,
    pitPlan.wantMaker,
  );
  const extraOut: Partial<Record<GoodId, number>> = {
    brick: cityOut.brick,
    cutStone: cityOut.cutStone,
  };
  const made = stepSlice2Makers(moved.mountain, seconds, pay, extraOut);
  const after = applyStretchCity(
    made.mountain,
    cityOut,
    seconds,
    pay,
    tickIndex,
  );
  const mined = mine.hoisted.topsoil + mine.hoisted.granite;
  const gained: Partial<Stock> = {
    ...made.made,
    ...(moved.gainedStones > 0 ? { stones: moved.gainedStones } : {}),
  };
  if (seconds === 1 && after === mountain) {
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

// ---------------------------------------------------------------------------
// Steady-state Slice 2 rates for the lab planner (#767)

type SteadyBase = {
  readonly openLvls: readonly MineLevelId[];
  readonly topsoil: number;
  readonly granite: number;
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
  return {
    openLvls: openLevels(mountain),
    topsoil,
    granite,
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
  };
}

function runSteadyAlloc(
  mountain: Mountain,
  base: SteadyBase,
  cityOpen: Readonly<Record<CityRunGood, boolean>>,
  cityDest: Readonly<Record<CityRunGood, number>>,
  stockCap: Readonly<Record<CityRunGood, number>>,
) {
  const open: Record<RunId, boolean> = {
    pitToStockyardStones: true,
    pitTopsoilToKilns: mountain.makers.kiln > 0,
    pitGraniteToSaws: graniteOpen(mountain) && mountain.makers.saw > 0,
    "stockToCity:stones": cityOpen.stones,
    "stockToCity:brick": cityOpen.brick,
    "stockToCity:cutStone": cityOpen.cutStone,
  };
  const destCaps: Record<RunId, number> = {
    pitToStockyardStones: Infinity,
    pitTopsoilToKilns: base.kilnNeed,
    pitGraniteToSaws: base.sawNeed,
    "stockToCity:stones": cityOpen.stones ? cityDest.stones : 0,
    "stockToCity:brick": cityOpen.brick ? cityDest.brick : 0,
    "stockToCity:cutStone": cityOpen.cutStone ? cityDest.cutStone : 0,
  };
  return allocateRunRates(base.fleet, open, destCaps, {
    openLvls: base.openLvls,
    pitheadCap: { topsoil: base.topsoil, granite: base.granite },
    pitheadWeight: { topsoil: base.topsoil, granite: base.granite },
    stockCap,
  });
}

const NO_CITY_OPEN: Readonly<Record<CityRunGood, boolean>> = {
  stones: false,
  brick: false,
  cutStone: false,
};

const ZERO_STOCK_CAP: Readonly<Record<CityRunGood, number>> = {
  stones: 0,
  brick: 0,
  cutStone: 0,
};

const INF_CITY_DEST: Readonly<Record<CityRunGood, number>> = {
  stones: Infinity,
  brick: Infinity,
  cutStone: Infinity,
};

function steadyCityDest(
  build: number,
  cityOpen: Readonly<Record<CityRunGood, boolean>>,
  stockCap: Readonly<Record<CityRunGood, number>>,
): Readonly<Record<CityRunGood, number>> {
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
  };
}

/**
 * Steady-state good income/s into the stockyard under Slice 2 physical
 * transport (pithead -> stockyard/makers only, ignoring full stockpiles).
 */
export function slice2SteadyIncome(mountain: Mountain): Partial<Stock> {
  const base = steadyBase(mountain);
  if (base.fleet <= 0) {
    return { stones: 0, brick: 0, cutStone: 0 };
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

/**
 * Steady-state production income and City delivery carry rate under Slice 2
 * physical transport when a City project is delivering (two-pass allocation so
 * dry stockpiles return spare fleet capacity to pithead/maker runs).
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
    return { income: { stones: 0, brick: 0, cutStone: 0 }, cityCarry: 0 };
  }
  const need = stillRequired(mountain.project.site);
  const cityOpen: Record<CityRunGood, boolean> = {
    stones: need.stones > 0,
    brick: need.brick > 0,
    cutStone: need.cutStone > 0,
  };
  const build = buildRate(mountain);
  const canProduce: Record<CityRunGood, boolean> = {
    stones: base.topsoil + base.granite > 0,
    brick: base.topsoil > 0 && base.kilnNeed > 0,
    cutStone: base.granite > 0 && base.sawNeed > 0,
  };
  const stockCap1: Record<CityRunGood, number> = {
    stones: mountain.stock.stones > 0 || canProduce.stones ? Infinity : 0,
    brick: mountain.stock.brick > 0 || canProduce.brick ? Infinity : 0,
    cutStone: mountain.stock.cutStone > 0 || canProduce.cutStone ? Infinity : 0,
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
  const stockCap2: Record<CityRunGood, number> = {
    stones: mountain.stock.stones > 0 ? Infinity : (pass1.stones ?? 0),
    brick: mountain.stock.brick > 0 ? Infinity : (pass1.brick ?? 0),
    cutStone: mountain.stock.cutStone > 0 ? Infinity : (pass1.cutStone ?? 0),
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
  const unused = Math.max(0, base.fleet - totalUsed);
  return {
    income: incomeFromRunRates(pass2.runRates),
    cityCarry: cityUsed + unused,
  };
}
