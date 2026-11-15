/**
 * The conflict sheet's preview for the layout check (`?saves=two`): a long
 * night on this phone, a short one on another, without a second device.
 */
import { freshMineOn } from "./line-switch";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import type { SaveConflictView } from "./store-context";
import { tierRecord } from "./tiers";

const DAY_MS = 86_400_000;

export function previewConflictView(
  now: number,
  deviceId: string,
): SaveConflictView {
  const [local, remote] = freshMineOn() ? freshPair() : todaysPair();
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

/**
 * Two fresh mines for the slice preview (#707): no depth and no engineers,
 * so the save's writer can read them back.
 */
function freshPair(): readonly [Mountain, Mountain] {
  const fresh = createMountain();
  const grown = (
    stones: number,
    owned: Partial<Mountain["owned"]>,
    jobs: Mountain["jobs"],
  ): Mountain => ({
    ...fresh,
    stock: { ...fresh.stock, stones },
    owned: { ...fresh.owned, ...owned },
    jobs,
  });
  return [
    grown(
      1_200_000,
      { helper: 28, cart: 6, drill: 4, hoist: 3 },
      { ...fresh.jobs, drilling: 8, haulage: 9, hoisting: 8, driving: 1 },
    ),
    grown(
      40_000,
      { helper: 8, cart: 2, drill: 1, hoist: 1 },
      {
        ...fresh.jobs,
        drilling: 2,
        haulage: 3,
        hoisting: 2,
        driving: 1,
        building: 0,
      },
    ),
  ];
}

function todaysPair(): readonly [Mountain, Mountain] {
  const local: Mountain = {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - 12_400_000,
    stock: { ...createMountain().stock, stones: 1_200_000 },
    owned: { ...tierRecord(0), cart: 6, drill: 4, borer: 1, helper: 28 },
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
    stock: { ...createMountain().stock, stones: 40_000 },
    owned: { ...tierRecord(0), cart: 2, drill: 1, helper: 8 },
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "cart" }],
  };
  return [local, remote];
}
