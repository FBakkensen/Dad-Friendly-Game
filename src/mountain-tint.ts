import type { LayerId } from "./layers";

/**
 * The mountain's tint for each band (#325): a CSS filter over the one
 * mountain picture, so the player sees the rock change as he digs. The
 * Topsoil is the art as painted. No save field: the band comes from
 * `layerOf`.
 */
const TINT: Readonly<Record<LayerId, string>> = {
  topsoil: "none",
  granite: "grayscale(0.85) brightness(1.1)",
  crystal: "hue-rotate(200deg) saturate(1.2) brightness(1.15)",
  heart: "hue-rotate(-18deg) saturate(1.6) brightness(1.05)",
};

/** The `filter` for the mountain picture in this band. */
export function mountainTint(id: LayerId): string {
  return TINT[id];
}
