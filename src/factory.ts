import { shareOutKeys } from "./building-site";
import {
  BASE_INPUT_BUF,
  makerBuffer,
  makerInputRoom,
  makerMakes,
  makerOpen,
  type MakerId,
} from "./makers";
import type { Mountain } from "./mountain";
import { slice2Part2On } from "./part-switch";
import { makerResearchMultiplier } from "./research";

/**
 * Steady-flow multi-input Factory helpers (Slice 2 Part 2, spec rules 2.2.4,
 * 2.2.5, 3.4, #771). Factory lines (`partsPress`, `precisionAssembly`) share
 * the uniform multi-input engine in `src/makers.ts`, produce into
 * `factoryOutput.parts`, and receive shared inputs (`brick`, `cutStone`)
 * lowest-fill-fraction first with ties split evenly via `shareOutKeys`.
 */

export const FACTORY_MAKER_IDS = [
  "partsPress",
  "precisionAssembly",
] as const satisfies readonly MakerId[];

export type FactoryMakerId = (typeof FACTORY_MAKER_IDS)[number];

/** Shared input goods carried by `stockToFactory*` transport runs. */
export type FactoryInputGood = "brick" | "cutStone" | "glass";

/** Which Factory lines consume each `stockToFactory*` input good, in order. */
export const FACTORY_LINES_FOR_GOOD: Readonly<
  Record<FactoryInputGood, readonly FactoryMakerId[]>
> = {
  brick: ["partsPress", "precisionAssembly"],
  cutStone: ["partsPress", "precisionAssembly"],
  glass: ["precisionAssembly"],
};

/** Output buffer held at the Factory awaiting `factoryToStockyardParts` transport. */
export type FactoryOutput = {
  readonly parts: number;
};

export const EMPTY_FACTORY_OUTPUT: FactoryOutput = { parts: 0 };

/** Whether the steady-flow Factory is open: Part 2 plays and the Foundry is operational. */
export function factoryOpen(mountain: Pick<Mountain, "operational">): boolean {
  return slice2Part2On() && mountain.operational.includes("foundry");
}

/** The Factory lines currently open in play. */
export function factoryMakers(
  mountain: Pick<Mountain, "operational" | "mineLevels">,
): readonly FactoryMakerId[] {
  return FACTORY_MAKER_IDS.filter((id) => makerOpen(mountain, id));
}

/** Whether at least one open Factory line is owned (opens `factoryToStockyardParts`). */
export function hasOwnedFactoryLine(
  mountain: Pick<Mountain, "makers" | "operational" | "mineLevels">,
): boolean {
  return FACTORY_MAKER_IDS.some(
    (id) => mountain.makers[id] > 0 && makerOpen(mountain, id),
  );
}

/** Whether any Factory line consuming `good` is owned (opens `stockToFactory*`). */
export function factoryInputOpen(
  mountain: Pick<Mountain, "makers" | "operational" | "mineLevels">,
  good: FactoryInputGood,
): boolean {
  return FACTORY_LINES_FOR_GOOD[good].some(
    (id) => mountain.makers[id] > 0 && makerOpen(mountain, id),
  );
}

/**
 * Capacity of `factoryOutput.parts` (spec rule 2.2.5): 0 while no Factory line
 * is owned, else at least `BASE_INPUT_BUF` and at least 60 s of combined
 * owned Factory output so lines never choke between ticks.
 */
export function factoryOutputRoom(
  mountain: Pick<Mountain, "makers"> &
    Partial<Pick<Mountain, "research" | "upgrades">>,
): number {
  let combinedRate = 0;
  let anyOwned = false;
  for (const id of FACTORY_MAKER_IDS) {
    const owned = mountain.makers[id];
    if (owned > 0) {
      anyOwned = true;
      combinedRate +=
        owned * makerMakes(id) * makerResearchMultiplier(mountain, id);
    }
  }
  if (!anyOwned) {
    return 0;
  }
  return Math.max(BASE_INPUT_BUF, Math.ceil(combinedRate * 60));
}

/** Total remaining input buffer room across owned Factory lines taking `good`. */
export function factoryInputRoomTotal(
  mountain: Pick<
    Mountain,
    "makers" | "makerBuffers" | "operational" | "mineLevels"
  > &
    Partial<Pick<Mountain, "research" | "upgrades">>,
  good: FactoryInputGood,
): number {
  let total = 0;
  for (const id of FACTORY_LINES_FOR_GOOD[good]) {
    if (mountain.makers[id] > 0 && makerOpen(mountain, id)) {
      const room = makerInputRoom(mountain, id, good);
      const held = makerBuffer(mountain, id, good);
      total += Math.max(0, room - held);
    }
  }
  return total;
}

type EligibleLine = {
  readonly id: FactoryMakerId;
  readonly room: number;
  readonly held: number;
};

function catchUpLowerFill(
  first: EligibleLine,
  second: EligibleLine,
  left: number,
  added: Record<FactoryMakerId, number>,
): number {
  const cross0 = first.held * second.room;
  const cross1 = second.held * first.room;
  if (cross0 === cross1) {
    return left;
  }
  const low = cross0 < cross1 ? first : second;
  const high = cross0 < cross1 ? second : first;
  const target = Math.min(
    low.room,
    Math.floor((high.held * low.room) / high.room),
  );
  const catchUp = Math.min(left, Math.max(0, target - low.held));
  added[low.id] += catchUp;
  return left - catchUp;
}

function splitRemainingFactoryInput(
  eligible: readonly EligibleLine[],
  left: number,
  added: Record<FactoryMakerId, number>,
  tieOffset: number,
): void {
  if (left <= 0) {
    return;
  }
  const wants: Partial<Record<FactoryMakerId, number>> = {};
  for (const entry of eligible) {
    const rem = entry.room - entry.held - added[entry.id];
    if (rem > 0) {
      wants[entry.id] = rem;
    }
  }
  const split = shareOutKeys(
    left,
    eligible.map((entry) => entry.id),
    wants,
    tieOffset,
  );
  for (const entry of eligible) {
    added[entry.id] += split[entry.id] ?? 0;
  }
}

/**
 * Distributes `amount` integer units of a shared Factory input (`brick`,
 * `cutStone`, or `glass`) across owned open Factory lines by lowest fill
 * fraction first, splitting ties evenly via `shareOutKeys` (spec rule 2.2.4).
 */
export function distributeFactoryInput(
  mountain: Pick<
    Mountain,
    "makers" | "makerBuffers" | "operational" | "mineLevels"
  > &
    Partial<Pick<Mountain, "research" | "upgrades">>,
  good: FactoryInputGood,
  amount: number,
  tieOffset = 0,
): Partial<Record<FactoryMakerId, number>> {
  const start = Math.max(0, Math.floor(amount));
  if (start <= 0) {
    return {};
  }
  const eligible: EligibleLine[] = FACTORY_LINES_FOR_GOOD[good]
    .filter((id) => mountain.makers[id] > 0 && makerOpen(mountain, id))
    .map((id) => ({
      id,
      room: makerInputRoom(mountain, id, good),
      held: makerBuffer(mountain, id, good),
    }))
    .filter((entry) => entry.room > entry.held);
  const [first, second] = eligible;
  if (first === undefined) {
    return {};
  }
  if (second === undefined) {
    return { [first.id]: Math.min(start, first.room - first.held) };
  }
  const added: Record<FactoryMakerId, number> = {
    partsPress: 0,
    precisionAssembly: 0,
  };
  const left = catchUpLowerFill(first, second, start, added);
  splitRemainingFactoryInput(eligible, left, added, tieOffset);
  const out: Partial<Record<FactoryMakerId, number>> = {};
  for (const entry of eligible) {
    if (added[entry.id] > 0) {
      out[entry.id] = added[entry.id];
    }
  }
  return out;
}
