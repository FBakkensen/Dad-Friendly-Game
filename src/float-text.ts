const FLOAT_MS = 1200;

const REDUCE = "(prefers-reduced-motion: reduce)";

/** The one list the board reads each frame, and the matchMedia that made it. */
let asked: { readonly by: unknown; readonly list: MediaQueryList } | undefined;

/**
 * No matchMedia (very old browsers, tests) counts as reduced motion. The list is made once and
 * its live `.matches` read after, since the board asks every frame; a new matchMedia (a test's
 * stub) is asked afresh.
 */
export const reducedMotion = (): boolean => {
  if (typeof window.matchMedia !== "function") {
    return true;
  }
  if (asked === undefined || asked.by !== window.matchMedia) {
    asked = {
      by: Reflect.get(window, "matchMedia"),
      list: window.matchMedia(REDUCE),
    };
  }
  return asked.list.matches;
};

/**
 * A short-lived number that drifts up and fades; skipped for reduced motion.
 * Its class places it (the rock's tap and crew floats that passed a spot went
 * with the rock, #371).
 */
export const floatText = (
  parent: HTMLElement,
  text: string,
  className: string,
): void => {
  if (reducedMotion()) {
    return;
  }
  const float = document.createElement("span");
  float.className = className;
  float.textContent = text;
  float.setAttribute("aria-hidden", "true");
  parent.append(float);
  setTimeout(() => {
    float.remove();
  }, FLOAT_MS);
};
