import { glintScale } from "./lost-tools";
import { digStones, stonesPerSecond, type Mountain } from "./mountain";
import { veinOftenScale } from "./workshop";

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

/** The Lantern of Guidance makes veins glint 40% sooner. */
export const LANTERN_VEIN_GAP_SCALE = 0.6;

/**
 * Wait before the next glint, as a share of the usual 3–6 minutes.
 * The lantern shortens it. A lamp or a crystal flare makes veins more often,
 * which shortens it again. 1 is an ordinary mountain.
 */
export function veinGapScale(
  mountain: Parameters<typeof veinOftenScale>[0],
  lantern: boolean,
): number {
  const base = lantern ? LANTERN_VEIN_GAP_SCALE : 1;
  return base / veinOftenScale(mountain);
}

/** How long the next glint lasts. The old miner's lamp lets it linger. */
export function veinGlintMs(mountain: {
  readonly finds?: readonly string[];
}): number {
  return VEIN_GLINT_MS * glintScale(mountain);
}

export function waitForVein({
  now,
  random,
  gapScale = 1,
}: {
  now: number;
  random: () => number;
  gapScale?: number;
}): VeinState {
  const gap = VEIN_MIN_GAP_MS + random() * (VEIN_MAX_GAP_MS - VEIN_MIN_GAP_MS);
  return { kind: "waiting", appearsAt: now + gap * gapScale };
}

/** Moves the vein along in time: waiting → glinting → (missed) waiting again. */
export function advanceVein({
  vein,
  now,
  random,
  gapScale = 1,
  glintMs = VEIN_GLINT_MS,
}: {
  vein: VeinState;
  now: number;
  random: () => number;
  gapScale?: number;
  /** How long this glint stays. The screen passes `veinGlintMs`. */
  glintMs?: number;
}): VeinState {
  switch (vein.kind) {
    case "waiting":
      return now < vein.appearsAt
        ? vein
        : {
            kind: "glinting",
            until: now + glintMs,
            x: 0.35 + random() * 0.3,
            y: 0.4 + random() * 0.4,
          };
    case "glinting":
      return now < vein.until ? vein : waitForVein({ now, random, gapScale });
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
  return digStones(mountain, reward);
}

/**
 * Time away doesn't count toward the next vein, but time already played does:
 * shifts the wait (or the glint) later by how long the game was hidden.
 */
export function pauseVein(vein: VeinState, hiddenMs: number): VeinState {
  const away = Math.max(0, hiddenMs);
  return vein.kind === "waiting"
    ? { ...vein, appearsAt: vein.appearsAt + away }
    : { ...vein, until: vein.until + away };
}

/** Play time left before the next vein, to carry over when the app is closed. */
export function veinWaitLeft(vein: VeinState, now: number): number {
  return vein.kind === "waiting" ? Math.max(0, vein.appearsAt - now) : 0;
}

/** A carried-over wait, if it is a sane one; otherwise a fresh wait. */
export function resumeVein({
  waitLeft,
  now,
  random,
  gapScale = 1,
}: {
  waitLeft: unknown;
  now: number;
  random: () => number;
  gapScale?: number;
}): VeinState {
  return typeof waitLeft === "number" &&
    Number.isFinite(waitLeft) &&
    waitLeft >= 0 &&
    waitLeft <= VEIN_MAX_GAP_MS
    ? { kind: "waiting", appearsAt: now + waitLeft }
    : waitForVein({ now, random, gapScale });
}
