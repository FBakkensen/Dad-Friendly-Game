import { minedOut } from "./scale";
import type { TierId } from "./tiers";

/**
 * Rock bands (M9). The layer is stones mined, the same way a relic is, so
 * the save has no layer field. A band starts at `from` (inclusive). The next
 * band's `from` is this one's end, so 10M is the Granite, beside the Shield.
 * The Deep Heart runs through the bottom of the mountain.
 *
 * Hardness is `layer.<index>.<tier>.hardness` in `effectiveRates`. It is 1
 * until a later sitting tunes the rock.
 */

export type LayerId = "topsoil" | "granite" | "crystal" | "heart";

/** One material per band. Accrual is a later sitting. */
export type MaterialId = "clay" | "iron" | "crystal" | "heartstone";

/** 1 is the Topsoil. The sweep knob is `layer.<index>.<tier>.hardness`. */
export type LayerIndex = 1 | 2 | 3 | 4;

export type Layer = {
  readonly id: LayerId;
  readonly index: LayerIndex;
  /** Player name. The card that shows it is a later sitting. */
  readonly name: string;
  /** Stones mined when this band begins, inclusive. */
  readonly from: number;
  readonly material: MaterialId;
};

export const LAYERS = [
  {
    id: "topsoil",
    index: 1,
    name: "The Topsoil",
    from: 0,
    material: "clay",
  },
  {
    id: "granite",
    index: 2,
    name: "The Granite",
    from: 10_000_000,
    material: "iron",
  },
  {
    id: "crystal",
    index: 3,
    name: "The Crystal Caves",
    from: 45_000_000,
    material: "crystal",
  },
  {
    id: "heart",
    index: 4,
    name: "The Deep Heart",
    from: 120_000_000,
    material: "heartstone",
  },
] as const satisfies readonly Layer[];

const TOPSOIL = LAYERS[0];

/** The band these stones sit in. Below the surface stays the Topsoil. */
export function layerOf(mountain: { readonly remaining: number }): Layer {
  const mined = minedOut(mountain);
  let band: Layer = TOPSOIL;
  for (const layer of LAYERS) {
    if (mined >= layer.from) {
      band = layer;
    }
  }
  return band;
}

/**
 * Sweep id for this band and tier. `factor` reads it. 1 in play, so today's
 * pace stays put.
 */
export function hardnessFactorId(index: LayerIndex, tierId: TierId): string {
  return `layer.${String(index)}.${tierId}.hardness`;
}
