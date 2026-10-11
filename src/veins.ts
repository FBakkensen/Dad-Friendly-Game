import { stonesPerSecond, type Mountain } from "./mountain";

/** Golden veins appear every 3–6 minutes of active play and glint for 12 seconds. */
const VEIN_MIN_GAP_MS = 3 * 60 * 1000;
const VEIN_MAX_GAP_MS = 6 * 60 * 1000;
export const VEIN_GLINT_MS = 12 * 1000;
const VEIN_HELPER_SECONDS = 60;
const VEIN_MIN_REWARD = 50;

/** A vein exists only while the game is open; it is never saved. */
export type VeinState =
  | { readonly kind: "waiting"; readonly appearsAt: number }
  | {
      readonly kind: "glinting";
      readonly until: number;
      /** Spot on the rock of the peak, 0..1 from the left and top of the art. */
      readonly x: number;
      readonly y: number;
    };

export function waitForVein({
  now,
  random,
}: {
  now: number;
  random: () => number;
}): VeinState {
  return {
    kind: "waiting",
    appearsAt:
      now + VEIN_MIN_GAP_MS + random() * (VEIN_MAX_GAP_MS - VEIN_MIN_GAP_MS),
  };
}

/** Moves the vein along in time: waiting → glinting → (missed) waiting again. */
export function advanceVein({
  vein,
  now,
  random,
}: {
  vein: VeinState;
  now: number;
  random: () => number;
}): VeinState {
  switch (vein.kind) {
    case "waiting":
      return now < vein.appearsAt
        ? vein
        : {
            kind: "glinting",
            until: now + VEIN_GLINT_MS,
            x: 0.35 + random() * 0.3,
            y: 0.4 + random() * 0.4,
          };
    case "glinting":
      return now < vein.until ? vein : waitForVein({ now, random });
    default: {
      const _exhaustive: never = vein;
      return _exhaustive;
    }
  }
}

/** A minute of the crew's output, at least 50, never more than the mountain holds. */
export function veinReward(mountain: Mountain): number {
  return Math.min(
    mountain.remaining,
    Math.max(VEIN_MIN_REWARD, stonesPerSecond(mountain) * VEIN_HELPER_SECONDS),
  );
}

export function mineVein(mountain: Mountain): Mountain {
  const reward = veinReward(mountain);
  if (reward === 0) {
    return mountain;
  }
  return {
    ...mountain,
    remaining: mountain.remaining - reward,
    pocket: mountain.pocket + reward,
  };
}
