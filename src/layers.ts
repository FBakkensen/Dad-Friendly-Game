/**
 * The mountain's layers and their materials, by name (#740: their depth,
 * bands, hardness and materials-from-depth are gone). A fresh mine's levels
 * live in `mine-levels`, and the clay and iron its rock drilled gives come
 * from `withMaterials` in `factory`.
 */

export type LayerId = "topsoil" | "granite" | "crystal" | "heart";

/** Every layer, top first: the ids a saved line or the field log may name. */
export const LAYER_IDS: readonly LayerId[] = [
  "topsoil",
  "granite",
  "crystal",
  "heart",
];

/** One material per layer. Counts are whole units in the save. */
export type MaterialId = "clay" | "iron" | "crystal" | "heartstone";

/** Every material, in its layer's order. */
export const MATERIAL_IDS: readonly MaterialId[] = [
  "clay",
  "iron",
  "crystal",
  "heartstone",
];

/** Whole units of each material. Missing from a save means none yet. */
export type Materials = Readonly<Record<MaterialId, number>>;

export const EMPTY_MATERIALS: Materials = {
  clay: 0,
  iron: 0,
  crystal: 0,
  heartstone: 0,
};
