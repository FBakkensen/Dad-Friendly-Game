import { factor } from "./economy/factors";
import type { Mountain } from "./mountain";
import { partThreeOn } from "./part-switch";
import { pay, type Price } from "./stock";
import type { MachineId } from "./tiers";

/** The mine's levels, in depth order (slice 1, part 3, #673). */
export const MINE_LEVEL_IDS = ["topsoil", "granite"] as const;
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

export const NO_LEVEL_MACHINES: LevelMachines = {
  cart: 0,
  drill: 0,
  borer: 0,
  train: 0,
};

/** The Granite's piles: drilled rock, rock at the shaft, rock at the saws. */
export const GRANITE_PILE_IDS = ["face", "shaft", "saw"] as const;
export type GranitePileId = (typeof GRANITE_PILE_IDS)[number];
export type GranitePiles = Readonly<Record<GranitePileId, number>>;

export const NO_GRANITE_PILES: GranitePiles = { face: 0, shaft: 0, saw: 0 };

/**
 * The Granite on a mountain: unsunk, or sunk with its own machines and
 * piles, so machines and piles on a level that is not open cannot be written.
 */
export type Granite =
  | { readonly kind: "unsunk" }
  | {
      readonly kind: "sunk";
      readonly machines: LevelMachines;
      readonly piles: GranitePiles;
    };

export const UNSUNK: Granite = { kind: "unsunk" };

/** The shaft's price: 10M stone and 1.5M brick at once (rule 7.14), scaled by `price.shaft`. */
export function shaftPrice(): Price {
  const scale = factor("price.shaft");
  return [
    { good: "stones", amount: Math.ceil(10_000_000 * scale) },
    { good: "brick", amount: Math.ceil(1_500_000 * scale) },
  ];
}

/** Whether the shaft can be sunk now: part 3, the Light Tower up, not yet sunk. */
export function shaftOpen(
  mountain: Pick<Mountain, "operational" | "granite">,
): boolean {
  return (
    partThreeOn() &&
    mountain.operational.includes("lightTower") &&
    mountain.granite.kind === "unsunk"
  );
}

/** Whether the Granite is open: part 3, and the shaft sunk. */
export function graniteOpen(mountain: Pick<Mountain, "granite">): boolean {
  return partThreeOn() && mountain.granite.kind === "sunk";
}

/**
 * The mountain with the shaft sunk and paid for, or the same object when it
 * cannot be sunk or the stock does not cover the price.
 */
export function sinkShaft(mountain: Mountain): Mountain {
  if (!shaftOpen(mountain)) {
    return mountain;
  }
  const paid = pay(mountain, shaftPrice());
  if (paid === mountain) {
    return mountain;
  }
  return {
    ...paid,
    granite: {
      kind: "sunk",
      machines: NO_LEVEL_MACHINES,
      piles: NO_GRANITE_PILES,
    },
  };
}

/**
 * One level's machines: the Granite's own counts while it is open, else none;
 * the Topsoil's are what he owns less the Granite's.
 */
export function levelMachines(
  mountain: Pick<Mountain, "owned" | "granite">,
  level: MineLevelId,
): LevelMachines {
  const { granite } = mountain;
  const own =
    graniteOpen(mountain) && granite.kind === "sunk"
      ? granite.machines
      : NO_LEVEL_MACHINES;
  if (level === "granite") {
    return own;
  }
  return {
    cart: mountain.owned.cart - own.cart,
    drill: mountain.owned.drill - own.drill,
    borer: mountain.owned.borer - own.borer,
    train: mountain.owned.train - own.train,
  };
}
