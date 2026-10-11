const FLOAT_MS = 1200;

/** No matchMedia (very old browsers, tests) counts as reduced motion. */
export const reducedMotion = (): boolean =>
  typeof window.matchMedia !== "function" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A short-lived number that drifts up and fades; skipped for reduced motion. */
export const floatText = (
  parent: HTMLElement,
  text: string,
  className: string,
  leftPercent?: number,
  topPercent?: number,
): void => {
  if (reducedMotion()) {
    return;
  }
  const float = document.createElement("span");
  float.className = className;
  float.textContent = text;
  float.setAttribute("aria-hidden", "true");
  if (leftPercent !== undefined) {
    float.style.left = `${String(leftPercent)}%`;
  }
  if (topPercent !== undefined) {
    float.style.top = `${String(topPercent)}%`;
  }
  parent.append(float);
  setTimeout(() => {
    float.remove();
  }, FLOAT_MS);
};
