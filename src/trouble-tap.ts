import { FIX_HOLD_MS, type TroubleTier } from "./hazards";

/**
 * A short hold on a troubled target fixes it without the five taps. The
 * Buys cards, the bays and the Ready now plate share it. A primary press
 * while `tier()` names trouble here starts a `FIX_HOLD_MS` timer that calls
 * `fix` with that tier; releasing, cancelling or leaving clears it.
 * `heldFix()` is true once, for the click that ends a hold that fixed, so
 * the caller can ignore that click; the next press clears it.
 */
export function watchFixHold(
  el: HTMLElement,
  {
    tier,
    fix,
  }: {
    readonly tier: () => TroubleTier | undefined;
    readonly fix: (tier: TroubleTier) => void;
  },
): { readonly heldFix: () => boolean } {
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  let suppressClick = false;
  const clearHold = (): void => {
    if (holdTimer !== undefined) {
      clearTimeout(holdTimer);
      holdTimer = undefined;
    }
  };
  el.addEventListener("pointerdown", (event) => {
    // A new press starts fresh: a hold that fixed but ended with no click
    // (the finger slid off) must not swallow this tap's click.
    suppressClick = false;
    const troubled = tier();
    if (event.button !== 0 || troubled === undefined) {
      return;
    }
    clearHold();
    holdTimer = setTimeout(() => {
      holdTimer = undefined;
      suppressClick = true;
      fix(troubled);
    }, FIX_HOLD_MS);
  });
  el.addEventListener("pointerup", clearHold);
  el.addEventListener("pointercancel", clearHold);
  el.addEventListener("pointerleave", clearHold);
  return {
    heldFix: () => {
      const held = suppressClick;
      suppressClick = false;
      return held;
    },
  };
}
