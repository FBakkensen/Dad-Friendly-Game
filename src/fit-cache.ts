/*
 * The board fits a line by trying its options, longest first, and keeps the result so a frame
 * with the same words measures nothing. A measurement only counts when the box is laid out on
 * the page, and the board's fonts arriving makes every kept fit stale (#372).
 */

/** True when `el` is on the page with a width, so a fit measured in it may be kept. */
export function measurable(el: HTMLElement): boolean {
  return el.isConnected && el.clientWidth > 0;
}

/**
 * Calls `stale` once the page's fonts are ready and after each font load, since a line fitted
 * with fallback metrics may no longer fit. Does nothing where the browser has no font set.
 */
export function onFontsSettled(stale: () => void): void {
  const fonts: unknown = Reflect.get(document, "fonts");
  if (!(fonts instanceof EventTarget)) {
    return;
  }
  fonts.addEventListener("loadingdone", stale);
  const ready: unknown = Reflect.get(fonts, "ready");
  if (ready instanceof Promise) {
    void ready.then(stale, () => undefined);
  }
}
