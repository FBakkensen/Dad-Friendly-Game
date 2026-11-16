import { factor } from "./economy/factors";
import { graniteOpen } from "./mine-levels";
import type { Mountain } from "./mountain";
import { partTwoOn } from "./part-switch";
import { pay, type GoodId, type Price } from "./stock";
import type { JobId } from "./workforce";
import { LINE_MACHINE_COST_GROWTH } from "./tiers";

/**
 * Makers (slice 1, rule 3, #666): a maker takes one level's rock and makes a
 * good of it, as fast as it can, by its recipe (#723): the rock it takes for
 * one of its good, two rock for one brick at the kilns. What it cannot take
 * bypasses to stone (src/mine-piles.ts). A maker is bought like a machine and
 * runs with one worker on its job (rule 2.7); one with nobody on it is idle,
 * not lost. It takes no engineer, no gear and no trouble. Part 2's switch
 * (`partTwoOn`, on in play since #672) opens the kilns with the Light Tower.
 */

type MakerRow = {
  readonly id: string;
  readonly name: string;
  /** The good its price is in. */
  readonly good: GoodId;
  /** What the first one costs. */
  readonly firstCost: number;
  readonly growth: number;
  /** Goods a second one running maker makes, at full output. */
  readonly makes: number;
  /** The good it makes. */
  readonly output: GoodId;
  /** Its recipe (#723): the rock it takes for one of its good. A whole number. */
  readonly takes: number;
  /** The job whose workers run it (rule 2.7). */
  readonly job: JobId;
};

/** Part 2 has the kiln; the saw comes with part 3. The spec's starting numbers, for the lab (#667). */
const MAKER_ROWS = [
  {
    id: "kiln",
    name: "Kiln",
    good: "stones",
    firstCost: 15_000,
    // Machines' growth: a maker is bought like a machine (rule 3).
    growth: LINE_MACHINE_COST_GROWTH,
    makes: 12,
    output: "brick",
    // Made up, for the balancing he asked for (spec, rule 3).
    takes: 2,
    job: "kilns",
  },
  {
    id: "saw",
    name: "Saw",
    good: "brick",
    firstCost: 25_000,
    growth: LINE_MACHINE_COST_GROWTH,
    makes: 30,
    output: "cutStone",
    takes: 3,
    job: "saws",
  },
] as const satisfies readonly MakerRow[];

export type MakerId = (typeof MAKER_ROWS)[number]["id"];

/** The jobs whose workers run the makers: the kilns, and the saws. */
export type MakerJob = (typeof MAKER_ROWS)[number]["job"];

type Maker = Omit<MakerRow, "id" | "job"> & {
  readonly id: MakerId;
  readonly job: MakerJob;
};

const MAKERS: readonly Maker[] = MAKER_ROWS;

export const MAKER_IDS: readonly MakerId[] = MAKERS.map((maker) => maker.id);

/** A complete record over the maker ids, every entry `value`. */
export function makerRecord<T>(value: T): Record<MakerId, T> {
  return Object.fromEntries(MAKER_IDS.map((id) => [id, value])) as Record<
    MakerId,
    T
  >;
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

/** Whether a maker is open: the kiln with the kilns, the saw once the shaft is sunk (part 3). */
export function makerOpen(
  mountain: Pick<Mountain, "operational" | "granite">,
  id: MakerId,
): boolean {
  return id === "saw" ? graniteOpen(mountain) : makersOpen(mountain);
}

/**
 * The makers the refinery shows (#754): the kilns whenever it is open, and
 * the saws once the Granite is.
 */
export function refineryMakers(
  mountain: Pick<Mountain, "operational" | "granite">,
): readonly MakerId[] {
  return MAKER_IDS.filter((id) => id === "kiln" || makerOpen(mountain, id));
}

/**
 * The next one's price, on a machine's curve: a lab sweep of `growth.machine`
 * or `price.kiln` moves it as it moves a machine's (#667).
 */
export function makerPrice(
  mountain: Pick<Mountain, "makers">,
  id: MakerId,
): Price {
  const maker = makerById(id);
  const growth = maker.growth * factor("growth.machine");
  const first = maker.firstCost * factor(`price.${id}`);
  const cost = Math.ceil(
    Number((first * growth ** mountain.makers[id]).toPrecision(12)),
  );
  return [{ good: maker.good, amount: cost }];
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
 * The rock a maker takes for one of its good (#723). A lab sweep of
 * `recipe.<id>` scales it, rounded to whole rock and never under one, so
 * whole goods stay whole.
 */
export function makerTakes(id: MakerId): number {
  return Math.max(1, Math.round(makerById(id).takes * factor(`recipe.${id}`)));
}

/** The good a maker makes. */
export function makerOutput(id: MakerId): GoodId {
  return makerById(id).output;
}

/** What one running maker makes a second, at full output (#671). */
export function makerMakes(id: MakerId): number {
  return makerById(id).makes;
}

/** The makers of a kind that run: each with one worker on its job (rule 2.7). */
export function runningMakers(
  mountain: Pick<Mountain, "makers" | "jobs">,
  id: MakerId,
): number {
  return Math.min(mountain.makers[id], mountain.jobs[makerById(id).job]);
}

/** The good a second the running makers of a kind make, at full output. */
export function makerRate(
  mountain: Pick<Mountain, "makers" | "jobs">,
  id: MakerId,
): number {
  return runningMakers(mountain, id) * makerMakes(id);
}

/** The kilns that run: each with one worker on the kilns' job (rule 2.7). */
export function runningKilns(
  mountain: Pick<Mountain, "makers" | "jobs">,
): number {
  return runningMakers(mountain, "kiln");
}

/** Brick a second the running kilns make, at full output. */
export function kilnRate(mountain: Pick<Mountain, "makers" | "jobs">): number {
  return makerRate(mountain, "kiln");
}
