const FLOAT_MS = 1200;

/** No matchMedia (very old browsers, tests) counts as reduced motion. */
export const reducedMotion = (): boolean =>
  typeof window.matchMedia !== "function" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
