import { factor } from "./economy/factors";
import type { Mountain } from "./mountain";
import { partThreeOn, slice2Part2On } from "./part-switch";
import { pay, type Price } from "./stock";
import type { MachineId } from "./tiers";

/** The mine's levels, in depth order (slice 1 part 3 #673, slice 2 part 2 #770). */
export const MINE_LEVEL_IDS = ["topsoil", "granite", "crystal"] as const;
export type MineLevelId = (typeof MINE_LEVEL_IDS)[number];

/** The machines a level has of its own: drilling's and haulage's, in tier order. */
export const LEVEL_MACHINE_IDS = [
  "cart",
  "drill",
  "borer",
  "train",
] as const satisfies readonly MachineId[];
export type LevelMachineId = (typeof LEVEL_MACHINE_IDS)[number];
export type LevelMachines = Readonly<Record<LevelMachineId, number>>;

/** Whether a machine is one a level has of its own: a drilling or haulage machine. */
export function isLevelMachine(id: string): id is LevelMachineId {
  return (LEVEL_MACHINE_IDS as readonly string[]).includes(id);
}

export const NO_LEVEL_MACHINES: LevelMachines = {
  cart: 0,
  drill: 0,
  borer: 0,
  train: 0,
};

/** A deeper level's piles: drilled rock, rock at the shaft, rock at its maker (Slice 1). */
export const GRANITE_PILE_IDS = ["face", "shaft", "saw"] as const;
export type GranitePileId = (typeof GRANITE_PILE_IDS)[number];
export type GranitePiles = Readonly<Record<GranitePileId, number>>;

export const NO_GRANITE_PILES: GranitePiles = { face: 0, shaft: 0, saw: 0 };

/** Deeper levels below the Topsoil, in depth order (slice 2, #766, #770). */
export const DEEPER_LEVEL_IDS = [
  "granite",
  "crystal",
] as const satisfies readonly Exclude<MineLevelId, "topsoil">[];
export type DeeperLevelId = (typeof DEEPER_LEVEL_IDS)[number];

/** One sunk deeper level: its own machines and its underground piles. */
export type SunkLevel = {
  readonly machines: LevelMachines;
  readonly piles: GranitePiles;
};

/**
 * Sunk deeper levels on a mountain, keyed by deeper level id (#766, #770).
 * Missing means unsunk, so machines and piles on a level that is not open
 * cannot be represented.
 */
export type MineLevels = Readonly<Partial<Record<DeeperLevelId, SunkLevel>>>;

export const NO_MINE_LEVELS: MineLevels = {};

/** Pithead rock waiting for physical transport, per mine level (whole stones). */
export type Pithead = Readonly<Record<MineLevelId, number>>;

export const EMPTY_PITHEAD: Pithead = { topsoil: 0, granite: 0, crystal: 0 };

/** The Granite shaft's price: 10M stone and 1.5M brick at once (rule 7.14), scaled by `price.shaft`. */
export function shaftPrice(level: DeeperLevelId = "granite"): Price {
  if (level === "crystal") {
    return crystalShaftPrice();
  }
  const scale = factor("price.shaft");
  return [
    { good: "stones", amount: Math.ceil(10_000_000 * scale) },
    { good: "brick", amount: Math.ceil(1_500_000 * scale) },
  ];
}

/**
 * The Crystal Caves shaft's price (#770, spec rule 1.2): Brick + Cut stone,
 * starting value for the Part 2 lab (#772), scaled by `price.crystalShaft`.
 */
export function crystalShaftPrice(): Price {
  const scale = factor("price.crystalShaft");
  return [
    { good: "brick", amount: Math.ceil(1_500_000 * scale) },
    { good: "cutStone", amount: Math.ceil(1_000_000 * scale) },
  ];
}

/** Whether a deeper level has been sunk on this mountain, without checking switches. */
export function levelSunk(
  mountain: Pick<Mountain, "mineLevels">,
  level: DeeperLevelId,
): boolean {
  return mountain.mineLevels[level] !== undefined;
}

/** Whether the Granite shaft can be sunk now: part 3, the Light Tower up, not yet sunk. */
export function shaftOpen(
  mountain: Pick<Mountain, "operational" | "mineLevels">,
  level: DeeperLevelId = "granite",
): boolean {
  if (level === "crystal") {
    return crystalShaftOpen(mountain);
  }
  return (
    partThreeOn() &&
    mountain.operational.includes("lightTower") &&
    !levelSunk(mountain, "granite")
  );
}

/**
 * Whether the Crystal Caves shaft can be sunk now (#770, spec rule 1.2):
 * Slice 2 Part 2 on, the Foundry operational, Granite already sunk, Crystal unsunk.
 */
export function crystalShaftOpen(
  mountain: Pick<Mountain, "operational" | "mineLevels">,
): boolean {
  return (
    slice2Part2On() &&
    mountain.operational.includes("foundry") &&
    levelSunk(mountain, "granite") &&
    !levelSunk(mountain, "crystal")
  );
}

/**
 * A deeper level while it is open (sunk, and its part switch on), else undefined.
 * The save is read before the switch, so an unsunk level asks no factor.
 */
export function openDeeperLevel(
  mountain: Pick<Mountain, "mineLevels">,
  level: DeeperLevelId,
): SunkLevel | undefined {
  const sunk = mountain.mineLevels[level];
  if (sunk === undefined) {
    return undefined;
  }
  if (level === "crystal") {
    return slice2Part2On() ? sunk : undefined;
  }
  return partThreeOn() ? sunk : undefined;
}

/** The Granite while it is open (the shaft sunk, part 3), else undefined. */
export function openGranite(
  mountain: Pick<Mountain, "mineLevels">,
): SunkLevel | undefined {
  return openDeeperLevel(mountain, "granite");
}

/** Whether the Granite is open: the shaft sunk, and part 3. */
export function graniteOpen(mountain: Pick<Mountain, "mineLevels">): boolean {
  return openGranite(mountain) !== undefined;
}

/** Whether the Crystal Caves are open: sunk, and Slice 2 Part 2. */
export function crystalOpen(mountain: Pick<Mountain, "mineLevels">): boolean {
  return openDeeperLevel(mountain, "crystal") !== undefined;
}

/** The open levels, the Topsoil first: the cages' plan and the refinery's hoppers read them (#754, #770). */
export function openLevels(
  mountain: Pick<Mountain, "mineLevels">,
): readonly MineLevelId[] {
  const deeper = DEEPER_LEVEL_IDS.filter(
    (level) => openDeeperLevel(mountain, level) !== undefined,
  );
  return deeper.length === 0 ? ["topsoil"] : ["topsoil", ...deeper];
}

/**
 * The mountain with the shaft sunk to `level` (default `"granite"`) and paid
 * for, or the same object when it cannot be sunk or the stock does not cover
 * the price.
 */
export function sinkShaft(
  mountain: Mountain,
  level: DeeperLevelId = "granite",
): Mountain {
  if (!shaftOpen(mountain, level)) {
    return mountain;
  }
  const paid = pay(mountain, shaftPrice(level));
  if (paid === mountain) {
    return mountain;
  }
  return {
    ...paid,
    mineLevels: {
      ...paid.mineLevels,
      [level]: {
        machines: NO_LEVEL_MACHINES,
        piles: NO_GRANITE_PILES,
      },
    },
  };
}

/**
 * One level's machines: a deeper level's own counts while it is open, else
 * none; the Topsoil's are what he owns less every open deeper level's. With
 * no deeper level open the Topsoil's are what he owns, read without a copy.
 */
export function levelMachines(
  mountain: Pick<Mountain, "owned" | "mineLevels">,
  level: MineLevelId,
): LevelMachines {
  if (level !== "topsoil") {
    return openDeeperLevel(mountain, level)?.machines ?? NO_LEVEL_MACHINES;
  }
  let anyOpen = false;
  let cart = mountain.owned.cart;
  let drill = mountain.owned.drill;
  let borer = mountain.owned.borer;
  let train = mountain.owned.train;
  for (const id of DEEPER_LEVEL_IDS) {
    const own = openDeeperLevel(mountain, id)?.machines;
    if (own !== undefined) {
      anyOpen = true;
      cart -= own.cart;
      drill -= own.drill;
      borer -= own.borer;
      train -= own.train;
    }
  }
  return anyOpen ? { cart, drill, borer, train } : mountain.owned;
}

/**
 * One more machine of this kind on a sunk deeper level, the same object
 * otherwise. It pays nothing: the move buys first (call 55: no move takes a
 * machine off a level).
 */
export function withLevelMachine(
  mountain: Mountain,
  level: DeeperLevelId,
  id: LevelMachineId,
): Mountain {
  const sunk = mountain.mineLevels[level];
  if (sunk === undefined) {
    return mountain;
  }
  return {
    ...mountain,
    mineLevels: {
      ...mountain.mineLevels,
      [level]: {
        ...sunk,
        machines: { ...sunk.machines, [id]: sunk.machines[id] + 1 },
      },
    },
  };
}

/** One more machine of this kind on the Granite while it is sunk. */
export function withGraniteMachine(
  mountain: Mountain,
  id: LevelMachineId,
): Mountain {
  return withLevelMachine(mountain, "granite", id);
}

/** A sunk deeper level with updated underground piles, or the same mountain if unsunk. */
export function withLevelPiles(
  mountain: Mountain,
  level: DeeperLevelId,
  piles: GranitePiles,
): Mountain {
  const sunk = mountain.mineLevels[level];
  if (sunk === undefined) {
    return mountain;
  }
  return {
    ...mountain,
    mineLevels: {
      ...mountain.mineLevels,
      [level]: { ...sunk, piles },
    },
  };
}
