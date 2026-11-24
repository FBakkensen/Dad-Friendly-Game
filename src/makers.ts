import { factor } from "./economy/factors";
import { crystalOpen, graniteOpen } from "./mine-levels";
import type { Mountain } from "./mountain";
import { partTwoOn, slice2Part1On, slice2Part2On } from "./part-switch";
import { makerResearchMultiplier } from "./research";
import { pay, type GoodId, type Price } from "./stock";
import {
  LINE_MACHINE_COST_GROWTH,
  quotePriceRun,
  type BuyAmount,
  type MultiGoodCurve,
  type PriceQuote,
} from "./tiers";
import type { JobId } from "./workforce";

/**
 * Multi-input Refinery makers and steady-flow Factory lines (slice 1 rule 3,
 * #666; slice 2 rules 3.2–3.4, #766, #771).
 *
 * Every maker and Factory line shares one uniform multi-input recipe engine
 * with separate finite input buffers (`makerBuffers`), multi-worker staffing
 * (`workersPerUnit`), 1- or 2-good price curves (`MultiGoodCurve`), and
 * persisted integer sub-cycle progress (`cycleMicros` in `0..999_999`).
 */

export type MakerSite = "refinery" | "factory";

export type MakerInputId =
  | "topsoilRock"
  | "graniteRock"
  | "crystalRock"
  | "stones"
  | "brick"
  | "cutStone"
  | "glass";

export type MakerInputSpec = {
  readonly id: MakerInputId;
  readonly amount: number;
};

type MakerOutputSpec = {
  readonly good: GoodId;
  readonly amount: number;
};

type MakerRow = {
  readonly id: string;
  readonly name: string;
  readonly site: MakerSite;
  /** 1- or 2-good price curve (spec rule 3.2). */
  readonly price: MultiGoodCurve;
  readonly growth: number;
  /** Workers required to staff one running unit (spec rule 3.2). */
  readonly workersPerUnit: number;
  /** Goods a second one running unit makes at full output, before factors/research. */
  readonly outputPerSecond: number;
  /** Multi-input recipe requirements for one whole cycle. */
  readonly inputs: readonly MakerInputSpec[];
  /** Good and whole-unit quantity produced by one cycle. */
  readonly output: MakerOutputSpec;
  /** The job whose workers run it (rule 2.7). */
  readonly job: JobId;
};

/** Refinery makers (kiln, saw, glassworks) and steady-flow Factory lines (partsPress, precisionAssembly). */
const MAKER_ROWS = [
  {
    id: "kiln",
    name: "Kiln",
    site: "refinery",
    price: [{ good: "stones", firstCost: 15_000 }],
    growth: LINE_MACHINE_COST_GROWTH,
    workersPerUnit: 1,
    outputPerSecond: 12,
    inputs: [{ id: "topsoilRock", amount: 2 }],
    output: { good: "brick", amount: 1 },
    job: "kilns",
  },
  {
    id: "saw",
    name: "Saw",
    site: "refinery",
    price: [{ good: "brick", firstCost: 25_000 }],
    growth: LINE_MACHINE_COST_GROWTH,
    workersPerUnit: 1,
    outputPerSecond: 30,
    inputs: [{ id: "graniteRock", amount: 3 }],
    output: { good: "cutStone", amount: 1 },
    job: "saws",
  },
  {
    id: "glassworks",
    name: "Glassworks",
    site: "refinery",
    price: [
      { good: "brick", firstCost: 200_000 },
      { good: "cutStone", firstCost: 100_000 },
    ],
    growth: LINE_MACHINE_COST_GROWTH,
    workersPerUnit: 2,
    outputPerSecond: 25,
    inputs: [
      { id: "crystalRock", amount: 3 },
      { id: "stones", amount: 2 },
    ],
    output: { good: "glass", amount: 1 },
    job: "glassworks",
  },
  {
    id: "partsPress",
    name: "Parts Press",
    site: "factory",
    price: [
      { good: "brick", firstCost: 350_000 },
      { good: "cutStone", firstCost: 175_000 },
    ],
    growth: LINE_MACHINE_COST_GROWTH,
    workersPerUnit: 2,
    outputPerSecond: 4,
    inputs: [
      { id: "brick", amount: 2 },
      { id: "cutStone", amount: 2 },
    ],
    output: { good: "parts", amount: 1 },
    job: "partsPress",
  },
  {
    id: "precisionAssembly",
    name: "Precision Assembly",
    site: "factory",
    price: [
      { good: "cutStone", firstCost: 300_000 },
      { good: "glass", firstCost: 80_000 },
    ],
    growth: LINE_MACHINE_COST_GROWTH,
    workersPerUnit: 3,
    outputPerSecond: 36,
    inputs: [
      { id: "brick", amount: 2 },
      { id: "cutStone", amount: 2 },
      { id: "glass", amount: 2 },
    ],
    output: { good: "parts", amount: 3 },
    job: "precisionAssembly",
  },
] as const satisfies readonly MakerRow[];

export type MakerId = (typeof MAKER_ROWS)[number]["id"];

/** The jobs whose workers run makers and Factory lines. */
export type MakerJob = (typeof MAKER_ROWS)[number]["job"];

/** The goods makers and Factory lines produce. */
type MakerOutput = (typeof MAKER_ROWS)[number]["output"]["good"];

type Maker = Omit<MakerRow, "id" | "job" | "output"> & {
  readonly id: MakerId;
  readonly job: MakerJob;
  readonly output: { readonly good: MakerOutput; readonly amount: number };
};

const MAKERS: readonly Maker[] = MAKER_ROWS;

export const MAKER_IDS: readonly MakerId[] = MAKERS.map((maker) => maker.id);

export const REFINERY_MAKER_IDS: readonly MakerId[] = MAKERS.filter(
  (maker) => maker.site === "refinery",
).map((maker) => maker.id);

/** A complete record over the maker ids, every entry `value`. */
export function makerRecord<T>(value: T): Record<MakerId, T> {
  return {
    kiln: value,
    saw: value,
    glassworks: value,
    partsPress: value,
    precisionAssembly: value,
  };
}

const MAKER_BY_ID = Object.fromEntries(
  MAKERS.map((maker) => [maker.id, maker]),
) as Record<MakerId, Maker>;

function makerById(id: MakerId): Maker {
  return MAKER_BY_ID[id];
}

/** Whether the kilns are open: part 2 plays, and the Light Tower is operational (rule 1). */
export function makersOpen(mountain: Pick<Mountain, "operational">): boolean {
  return partTwoOn() && mountain.operational.includes("lightTower");
}

/** Whether a maker or Factory line is open (gating Part 2 lines behind `slice2Part2On()`). */
export function makerOpen(
  mountain: Pick<Mountain, "operational" | "mineLevels">,
  id: MakerId,
): boolean {
  switch (id) {
    case "kiln":
      return makersOpen(mountain);
    case "saw":
      return graniteOpen(mountain);
    case "glassworks":
    case "precisionAssembly":
      return slice2Part2On() && crystalOpen(mountain);
    case "partsPress":
      return slice2Part2On() && mountain.operational.includes("foundry");
  }
}

/**
 * The makers the refinery shows (#754, #771): kilns whenever open, saws once
 * Granite is open, and Glassworks once Crystal Caves is open under Part 2.
 */
export function refineryMakers(
  mountain: Pick<Mountain, "operational" | "mineLevels">,
): readonly MakerId[] {
  return REFINERY_MAKER_IDS.filter(
    (id) => id === "kiln" || makerOpen(mountain, id),
  );
}

/** Which site owns a maker: `"refinery"` or `"factory"`. */
export function makerSite(id: MakerId): MakerSite {
  return makerById(id).site;
}

/** Workers needed to run one unit of `id` (spec rule 3.2). */
export function makerWorkersPerUnit(id: MakerId): number {
  return makerById(id).workersPerUnit;
}

/** Price of the `ownedCount`-th (0-indexed) unit of `id` across its 1- or 2-good curve. */
export function makerPriceAt(ownedCount: number, id: MakerId): Price {
  const maker = makerById(id);
  const growth = maker.growth * factor("growth.machine");
  const priceScale = factor(`price.${id}`);
  return maker.price.map((line) => ({
    good: line.good,
    amount: Math.ceil(
      Number(
        (line.firstCost * priceScale * growth ** ownedCount).toPrecision(12),
      ),
    ),
  }));
}

/**
 * The next one's price, on a machine's curve: a lab sweep of `growth.machine`
 * or `price.<id>` moves it as it moves a machine's (#667, #771).
 */
export function makerPrice(
  mountain: Pick<Mountain, "makers">,
  id: MakerId,
): Price {
  return makerPriceAt(mountain.makers[id], id);
}

/** Multi-good amount-key quote (`×1` / `×10` / `Max`) for a maker or Factory line. */
export function makerQuote(
  mountain: Pick<Mountain, "makers" | "stock">,
  id: MakerId,
  amount: BuyAmount,
): PriceQuote {
  const ownedCount = mountain.makers[id];
  return quotePriceRun(
    (nth) => makerPriceAt(ownedCount + nth, id),
    amount,
    mountain.stock,
  );
}

/** Buys one more, at once (rule 7.14); a closed maker or a short stock buys none. */
export function buyMaker(mountain: Mountain, id: MakerId): Mountain {
  if (!makerOpen(mountain, id)) {
    return mountain;
  }
  const paid = pay(mountain, makerPrice(mountain, id));
  return paid === mountain
    ? mountain
    : { ...paid, makers: { ...paid.makers, [id]: paid.makers[id] + 1 } };
}

/** The job whose workers run a maker (rule 2.7). */
export function makerJob(id: MakerId): MakerJob {
  return makerById(id).job;
}

/**
 * The primary input required for one cycle of `id` (#723). For single-input
 * makers (`kiln`, `saw`) a lab sweep of `recipe.<id>` scales it cleanly.
 */
export function makerTakes(id: MakerId): number {
  const first = makerById(id).inputs[0];
  return Math.max(1, Math.round((first?.amount ?? 1) * factor(`recipe.${id}`)));
}

/** All recipe inputs required per whole cycle of `id`. */
export function makerInputs(id: MakerId): readonly MakerInputSpec[] {
  const inputs = makerById(id).inputs;
  const scale = factor(`recipe.${id}`);
  if (scale === 1) {
    return inputs;
  }
  return inputs.map((input, idx) =>
    idx === 0
      ? { id: input.id, amount: Math.max(1, Math.round(input.amount * scale)) }
      : input,
  );
}

/** The good a maker makes. */
export function makerOutput(id: MakerId): MakerOutput {
  return makerById(id).output.good;
}

/** Whole units of its output good produced by one cycle of `id`. */
export function makerOutputAmount(id: MakerId): number {
  return makerById(id).output.amount;
}

const SLICE_2_MAKER_MAKES: Readonly<Partial<Record<MakerId, number>>> = {
  saw: 50,
};

/** What one running maker makes a second, at full output before Research bonuses (#671). */
export function makerMakes(id: MakerId): number {
  const base = slice2Part1On()
    ? (SLICE_2_MAKER_MAKES[id] ?? makerById(id).outputPerSecond)
    : makerById(id).outputPerSecond;
  return slice2Part1On() ? base * factor(`maker.${id}.makes`) : base;
}

/** Units running with multi-worker staffing (spec rule 3.2): `min(owned, floor(workers / workersPerUnit))`. */
export function runningMakers(
  mountain: Pick<Mountain, "makers" | "jobs">,
  id: MakerId,
): number {
  const maker = makerById(id);
  return Math.min(
    mountain.makers[id],
    Math.floor(mountain.jobs[maker.job] / maker.workersPerUnit),
  );
}

/** Output goods a second the running makers of `id` make, including Research bonuses. */
export function makerRate(
  mountain: Pick<Mountain, "makers" | "jobs"> &
    Partial<Pick<Mountain, "research" | "upgrades">>,
  id: MakerId,
): number {
  return (
    runningMakers(mountain, id) *
    makerMakes(id) *
    makerResearchMultiplier(mountain, id)
  );
}

/** The kilns that run: each with one worker on the kilns' job (rule 2.7). */
export function runningKilns(
  mountain: Pick<Mountain, "makers" | "jobs">,
): number {
  return runningMakers(mountain, "kiln");
}

/** Brick a second the running kilns make, at full output. */
export function kilnRate(
  mountain: Pick<Mountain, "makers" | "jobs"> &
    Partial<Pick<Mountain, "research" | "upgrades">>,
): number {
  return makerRate(mountain, "kiln");
}

// ---------------------------------------------------------------------------
// Slice 2: separate multi-input buffers & persisted micro-cycles (#766, #771)

/** Each maker's recipe input ids, in order (persisted in `SaveGame.makerBuffers`). */
export const MAKER_INPUT_IDS = {
  kiln: ["topsoilRock"],
  saw: ["graniteRock"],
  glassworks: ["crystalRock", "stones"],
  partsPress: ["brick", "cutStone"],
  precisionAssembly: ["brick", "cutStone", "glass"],
} as const satisfies Readonly<Record<MakerId, readonly MakerInputId[]>>;

export type MakerBuffers = Readonly<
  Record<MakerId, Readonly<Partial<Record<MakerInputId, number>>>>
>;

export const EMPTY_MAKER_BUFFERS: MakerBuffers = {
  kiln: {},
  saw: {},
  glassworks: {},
  partsPress: {},
  precisionAssembly: {},
};

/** Sub-cycle progress is persisted in whole micro-cycles (0..999_999). */
const MICROS_PER_CYCLE = 1_000_000;
export const MAX_CYCLE_MICROS = MICROS_PER_CYCLE - 1;

export type CycleMicros = Readonly<Partial<Record<MakerId, number>>>;

export const EMPTY_CYCLE_MICROS: CycleMicros = {};

/** Minimum input buffer capacity once at least one maker is owned (spec rule 3.2). */
export const BASE_INPUT_BUF = 300;

/** Primary (first) input id for a maker. */
function makerPrimaryInput(id: MakerId): MakerInputId {
  return MAKER_INPUT_IDS[id][0];
}

/** Current amount held in a maker's input buffer. */
export function makerBuffer(
  mountain: Pick<Mountain, "makerBuffers">,
  id: MakerId,
  input: MakerInputId,
): number {
  return mountain.makerBuffers[id][input] ?? 0;
}

/**
 * Input buffer capacity for one input of a maker (spec rule 3.2): 0 while none
 * are owned (closing its transport run), else at least `BASE_INPUT_BUF` and at
 * least 60 s of full-speed consumption so high counts never starve between ticks.
 */
export function makerInputRoom(
  mountain: Pick<Mountain, "makers"> &
    Partial<Pick<Mountain, "research" | "upgrades">>,
  id: MakerId,
  inputId: MakerInputId = makerPrimaryInput(id),
): number {
  const owned = mountain.makers[id];
  if (owned <= 0) {
    return 0;
  }
  const spec = makerInputs(id).find((entry) => entry.id === inputId);
  if (spec === undefined) {
    return 0;
  }
  const cyclesPerSec =
    (makerMakes(id) * makerResearchMultiplier(mountain, id)) /
    makerOutputAmount(id);
  const inputPerSecond = cyclesPerSec * spec.amount;
  return Math.max(BASE_INPUT_BUF, Math.ceil(owned * inputPerSecond * 60));
}

export type CycleInput = {
  readonly id: MakerInputId;
  readonly amount: number;
  readonly held: number;
};

export type MakerCycleStep = {
  readonly cycles: number;
  readonly consumed: Readonly<Partial<Record<MakerInputId, number>>>;
  readonly produced: number;
  readonly nextMicros: number;
  readonly standing: boolean;
};

/**
 * Exact whole-cycle execution with persisted integer `cycleMicros` (spec rule 3.2).
 * Supports arbitrary multi-input recipes so Refinery makers and Factory lines
 * share one engine.
 */
function addedMicros(
  staffedOutputRate: number,
  dt: number,
  outputAmount: number,
): number {
  if (dt <= 0 || staffedOutputRate <= 0) {
    return 0;
  }
  return Math.floor(
    (staffedOutputRate * dt * MICROS_PER_CYCLE) / outputAmount + 1e-6,
  );
}

/** Whole cycles a maker's rate and `cycleMicros` can execute over `dt` seconds. */
export function makerCycleLimit(
  staffedOutputRate: number,
  dt: number,
  cycleMicros: number,
  outputAmount = 1,
): number {
  return Math.floor(
    (cycleMicros + addedMicros(staffedOutputRate, dt, outputAmount)) /
      MICROS_PER_CYCLE,
  );
}

export function stepMakerCycle({
  inputs,
  outputAmount,
  outputRoom,
  staffedOutputRate,
  dt,
  cycleMicros,
}: {
  readonly inputs: readonly CycleInput[];
  readonly outputAmount: number;
  readonly outputRoom: number;
  readonly staffedOutputRate: number;
  readonly dt: number;
  readonly cycleMicros: number;
}): MakerCycleStep {
  let maxCycles = Math.floor(Math.max(0, outputRoom) / outputAmount);
  for (const input of inputs) {
    maxCycles = Math.min(maxCycles, Math.floor(input.held / input.amount));
  }
  const wantMicros =
    cycleMicros + addedMicros(staffedOutputRate, dt, outputAmount);
  const cycles = Math.min(Math.floor(wantMicros / MICROS_PER_CYCLE), maxCycles);
  const nextMicros =
    maxCycles >= 1
      ? Math.min(MAX_CYCLE_MICROS, wantMicros - cycles * MICROS_PER_CYCLE)
      : 0;
  const consumed: Partial<Record<MakerInputId, number>> = {};
  if (cycles > 0) {
    for (const input of inputs) {
      consumed[input.id] = cycles * input.amount;
    }
  }
  return {
    cycles,
    consumed,
    produced: cycles * outputAmount,
    nextMicros,
    standing: staffedOutputRate > 0 && maxCycles === 0,
  };
}
