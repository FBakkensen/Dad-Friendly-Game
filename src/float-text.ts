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
