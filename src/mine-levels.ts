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

/** The Granite once the shaft is sunk. */
export type SunkGranite = Extract<Granite, { readonly kind: "sunk" }>;

/**
 * The Granite while it is open (the shaft sunk, part 3), else undefined: the
 * mine is the Topsoil alone. The save is read before the switch, so a mine
 * without the shaft asks no factor.
 */
export function openGranite(
  mountain: Pick<Mountain, "granite">,
): SunkGranite | undefined {
  const { granite } = mountain;
  return granite.kind === "sunk" && partThreeOn() ? granite : undefined;
}

/** Whether the Granite is open: the shaft sunk, and part 3. */
export function graniteOpen(mountain: Pick<Mountain, "granite">): boolean {
  return openGranite(mountain) !== undefined;
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
 * the Topsoil's are what he owns less the Granite's. With the Granite shut
 * the Topsoil's are what he owns, read without a copy.
 */
export function levelMachines(
  mountain: Pick<Mountain, "owned" | "granite">,
  level: MineLevelId,
): LevelMachines {
  const granite = openGranite(mountain);
  if (granite === undefined) {
    return level === "granite" ? NO_LEVEL_MACHINES : mountain.owned;
  }
  const own = granite.machines;
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

/**
 * One more machine of this kind on the Granite while it is sunk, the same
 * object otherwise. It pays nothing: the move buys first (call 55: no move
 * takes a machine off a level).
 */
export function withGraniteMachine(
  mountain: Mountain,
  id: LevelMachineId,
): Mountain {
  const { granite } = mountain;
  if (granite.kind !== "sunk") {
    return mountain;
  }
  return {
    ...mountain,
    granite: {
      ...granite,
      machines: { ...granite.machines, [id]: granite.machines[id] + 1 },
    },
  };
}
