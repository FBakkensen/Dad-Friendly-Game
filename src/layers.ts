/**
 * The mountain's layers, by name (#740, #769: depth, bands, hardness, and
 * raw band materials are gone). Mine levels live in `mine-levels`.
 */

export type LayerId = "topsoil" | "granite" | "crystal" | "heart";

/** Every layer, top first: the ids a saved line or the field log may name. */
export const LAYER_IDS: readonly LayerId[] = [
  "topsoil",
  "granite",
  "crystal",
  "heart",
];
