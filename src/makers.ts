import type { Mountain } from "./mountain";
import { partTwoOn } from "./part-switch";
import { pay, type GoodId, type Price } from "./stock";

/**
 * Makers (slice 1, rule 3, #666): a maker takes one level's rock and makes a
 * good of it, one rock for one good, as fast as it can. What it cannot take
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
};

/** Part 2 has the kiln; the saw comes with part 3. The spec's starting numbers, for the lab (#667). */
const MAKER_ROWS = [
  {
    id: "kiln",
    name: "Kiln",
    good: "stones",
    firstCost: 15_000,
    growth: 1.219,
    makes: 12,
    output: "brick",
  },
] as const satisfies readonly MakerRow[];

export type MakerId = (typeof MAKER_ROWS)[number]["id"];

export type Maker = Omit<MakerRow, "id"> & { readonly id: MakerId };

export const MAKERS: readonly Maker[] = MAKER_ROWS;

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

export function makerById(id: MakerId): Maker {
  return MAKER_BY_ID[id];
}

/** Whether the kilns are open: part 2 plays, and the Light Tower is operational (rule 1). */
export function makersOpen(mountain: Pick<Mountain, "operational">): boolean {
  return partTwoOn() && mountain.operational.includes("lightTower");
}

/** The next one's price. */
export function makerPrice(
  mountain: Pick<Mountain, "makers">,
  id: MakerId,
): Price {
  const maker = makerById(id);
  const cost = Math.ceil(
    Number(
      (maker.firstCost * maker.growth ** mountain.makers[id]).toPrecision(12),
    ),
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

/** The kilns that run: each with one worker on the kilns' job (rule 2.7). */
export function runningKilns(
  mountain: Pick<Mountain, "makers" | "jobs">,
): number {
  return Math.min(mountain.makers.kiln, mountain.jobs.kilns);
}

/** Rock a second the running kilns take, and brick a second they make, at full output. */
export function kilnRate(mountain: Pick<Mountain, "makers" | "jobs">): number {
  return runningKilns(mountain) * makerById("kiln").makes;
}
