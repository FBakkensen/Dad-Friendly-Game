import { BAND_STARTS, MOUNTAIN_STONES, minedOut } from "./scale";
import type { TierId } from "./tiers";

/**
 * Rock bands (M9). The layer is stones mined, the same way a relic is, so
 * the save has no layer field. A band starts at `from` (inclusive). The next
 * band's `from` is this one's end, so 10M is the Granite, beside the Shield.
 * The Deep Heart runs through the bottom of the mountain.
 *
 * Hardness is a speed multiplier in `effectiveRates`. Hands and kids stay
 * at 1. The sweep's `layer.<index>.<tier>.hardness` factor multiplies this.
 */

export type LayerId = "topsoil" | "granite" | "crystal" | "heart";

/** One material per band. Counts are whole units in the save. */
export type MaterialId = "clay" | "iron" | "crystal" | "heartstone";

/**
 * Stones mined in a band for one unit of its material. Clay, crystal, and
 * heartstone stay sparse enough that the fixed recipes can absorb a whole
 * band. Iron is the common one: rails, props, reinforce, and axle grease
 * spend it, and one iron has to stay cheap enough that grease beats the
 * next machine. Live digs and time away both use it, so they cannot drift.
 */
export const MATERIAL_EVERY: Readonly<Record<MaterialId, number>> = {
  clay: 1_000_000,
  iron: 1_000_000,
  crystal: 5_000_000,
  heartstone: 10_000_000,
};

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
    from: BAND_STARTS[0],
    material: "clay",
  },
  {
    id: "granite",
    index: 2,
    name: "The Granite",
    from: BAND_STARTS[1],
    material: "iron",
  },
  {
    id: "crystal",
    index: 3,
    name: "The Crystal Caves",
    from: BAND_STARTS[2],
    material: "crystal",
  },
  {
    id: "heart",
    index: 4,
    name: "The Deep Heart",
    from: BAND_STARTS[3],
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

/** The next band, or none at the Deep Heart. */
export function nextLayer(mountain: {
  readonly remaining: number;
}): Layer | undefined {
  const mined = minedOut(mountain);
  return LAYERS.find((layer) => mined < layer.from);
}

/**
 * Bands broken into while stones mined go from `before` to `after`.
 * The Topsoil is where a run starts, so it is not a break-in. A clock
 * that goes backwards breaks into nothing.
 */
export function layersEntered(before: number, after: number): readonly Layer[] {
  if (after <= before) {
    return [];
  }
  return LAYERS.filter(
    (layer) => layer.from > 0 && before < layer.from && after >= layer.from,
  );
}

/**
 * Decision D3 (#246): each deeper band suits one machine and is tough on
 * one other. A band only favours a machine that unlocks in it or earlier,
 * and the bonus stays small, so a newly unlocked machine is still clearly
 * the strongest. The Topsoil is plain rock.
 */
export const FAVOURED_SPEED = 1.1;
export const SLOWED_SPEED = 0.8;

export const LAYER_FAVOURS: Readonly<
  Record<
    LayerIndex,
    { readonly suits: TierId; readonly tough: TierId } | undefined
  >
> = {
  1: undefined,
  2: { suits: "borer", tough: "drill" },
  3: { suits: "drill", tough: "borer" },
  4: { suits: "machine", tough: "borer" },
};

/** This band's rock on this tier. Missing entries, workers, and kids are 1. */
export function hardnessOf(index: LayerIndex, tierId: TierId): number {
  const favours = LAYER_FAVOURS[index];
  if (favours?.suits === tierId) {
    return FAVOURED_SPEED;
  }
  return favours?.tough === tierId ? SLOWED_SPEED : 1;
}

/**
 * Sweep id for this band and tier. `factor` multiplies `hardnessOf`.
 * 1 in play.
 */
export function hardnessFactorId(index: LayerIndex, tierId: TierId): string {
  return `layer.${String(index)}.${tierId}.hardness`;
}

/** Whole units of each material. Missing from a save means none yet. */
export type Materials = Readonly<Record<MaterialId, number>>;

export const EMPTY_MATERIALS: Materials = {
  clay: 0,
  iron: 0,
  crystal: 0,
  heartstone: 0,
};

/** The next band's start, or no end for the Deep Heart. */
function bandEnd(layer: Layer): number {
  for (const candidate of LAYERS) {
    if (candidate.from > layer.from) {
      return candidate.from;
    }
  }
  return Number.POSITIVE_INFINITY;
}

/** Stones mined that sit in this band. A total above the band counts as full. */
function stonesInBand(mined: number, layer: Layer): number {
  const capped = mined < bandEnd(layer) ? mined : bandEnd(layer);
  const span = capped - layer.from;
  return span > 0 ? span : 0;
}

/** Units this many stones in the band are worth. The remainder waits. */
function unitsInBand(stones: number, material: MaterialId): number {
  return Math.floor(stones / MATERIAL_EVERY[material]);
}

/**
 * Materials those stones would have dug, from an empty mountain.
 * A v1–v5 save is granted exactly this.
 */
export function materialsFromMined(mined: number): Materials {
  return materialsGained(0, mined);
}

/**
 * Units earned while stones mined go from `beforeMined` to `afterMined`.
 * The remainder lives in the stone total, so small digs add up to the same
 * units as one long one. A clock that goes backwards earns nothing.
 */
export function materialsGained(
  beforeMined: number,
  afterMined: number,
): Materials {
  const from = Math.max(0, beforeMined);
  const to = Math.max(from, afterMined);
  const gained: Record<MaterialId, number> = { ...EMPTY_MATERIALS };
  for (const layer of LAYERS) {
    gained[layer.material] =
      unitsInBand(stonesInBand(to, layer), layer.material) -
      unitsInBand(stonesInBand(from, layer), layer.material);
  }
  return gained;
}

/**
 * Units of `material` the rest of this run's mountain still holds, past `mined` stones (#492).
 * Each material lives in one band, so clay is gone for the run once the Granite starts.
 */
export function materialLeftToDig(material: MaterialId, mined: number): number {
  const left =
    materialsFromMined(MOUNTAIN_STONES)[material] -
    materialsFromMined(mined)[material];
  return left > 0 ? left : 0;
}

/** Adds a dig's units onto the pocket. A missing pocket counts as empty. */
export function addMaterials(
  current: Materials | undefined,
  gained: Materials,
): Materials {
  const base = current ?? EMPTY_MATERIALS;
  return {
    clay: base.clay + gained.clay,
    iron: base.iron + gained.iron,
    crystal: base.crystal + gained.crystal,
    heartstone: base.heartstone + gained.heartstone,
  };
}
