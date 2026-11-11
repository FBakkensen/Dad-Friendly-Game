/**
 * The conflict sheet's preview for the layout check (`?saves=two`): a long
 * night on this phone, a short one on another, without a second device.
 */
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import type { SaveConflictView } from "./store-context";

const DAY_MS = 86_400_000;

export function previewConflictView(
  now: number,
  deviceId: string,
): SaveConflictView {
  const local: Mountain = {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - 12_400_000,
    pocket: 1_200_000,
    carts: 6,
    drills: 4,
    borers: 1,
    helpers: 28,
    engineers: [
      { name: "Ada", rank: 1, trips: 2, post: "drill" },
      { name: "Nils", rank: 0, trips: 1, post: "cart" },
      { name: "Ruth", rank: 0, trips: 0, post: "camp" },
      { name: "Otto", rank: 0, trips: 0, post: "borer" },
    ],
  };
  const remote: Mountain = {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - 800_000,
    pocket: 40_000,
    carts: 2,
    drills: 1,
    helpers: 8,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "cart" }],
  };
  return {
    local: {
      mountain: local,
      lastSeen: now,
      rev: 4,
      deviceId,
      deviceLabel: "Chrome on Android",
    },
    remote: {
      mountain: remote,
      lastSeen: now - DAY_MS,
      rev: 5,
      deviceId: "other-device",
      deviceLabel: "Safari on iPhone",
    },
  };
}
