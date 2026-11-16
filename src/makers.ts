import { factor } from "./economy/factors";
import type { Mountain } from "./mountain";
import { partTwoOn } from "./part-switch";
import { pay, type GoodId, type Price } from "./stock";
import { LINE_MACHINE_COST_GROWTH } from "./tiers";

/**
 * Makers (slice 1, rule 3, #666): a maker takes one level's rock and makes a
 * good of it, as fast as it can, by its recipe (#723): the rock it takes for
 * one of its good, two rock for one brick at the kilns. What it cannot take
 * bypasses to stone (src/mine-piles.ts). A maker is bought like a machine and
 * runs with one worker on its job (rule 2.7); one with nobody on it is idle,
 * not lost. It takes no engineer, no gear and no trouble. Off in play: part
 * 2's switch (`partTwoOn`) opens the kilns with the Light Tower.
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
  },
] as const satisfies readonly MakerRow[];

export type MakerId = (typeof MAKER_ROWS)[number]["id"];

type Maker = Omit<MakerRow, "id"> & { readonly id: MakerId };

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
  if (!makersOpen(mountain)) {
    return mountain;
  }
  const paid = pay(mountain, makerPrice(mountain, id));
  return paid === mountain
    ? mountain
    : { ...paid, makers: { ...paid.makers, [id]: paid.makers[id] + 1 } };
}

/**
 * The rock a maker takes for one of its good (#723). A lab sweep of
 * `recipe.<id>` scales it, rounded to whole rock and never under one, so
 * whole goods stay whole.
 */
export function makerTakes(id: MakerId): number {
  return Math.max(1, Math.round(makerById(id).takes * factor(`recipe.${id}`)));
}

/** What one running maker makes a second, at full output (#671). */
export function makerMakes(id: MakerId): number {
  return makerById(id).makes;
}

/** The kilns that run: each with one worker on the kilns' job (rule 2.7). */
export function runningKilns(
  mountain: Pick<Mountain, "makers" | "jobs">,
): number {
  return Math.min(mountain.makers.kiln, mountain.jobs.kilns);
}

/** Brick a second the running kilns make, at full output. */
export function kilnRate(mountain: Pick<Mountain, "makers" | "jobs">): number {
  return runningKilns(mountain) * makerMakes("kiln");
}
