/**
 * Shortest layout height the busiest screen (all twelve timers) still fits
 * without scrolling. A PC column is zoomed until its layout is this tall, so
 * laptops (768–900 tall) get about 1.3–1.5.
 */
const DESIGN_HEIGHT = 600;
/** Wider than any supported phone (412–440): only a PC or tablet gets zoomed. */
const PC_MIN_WIDTH = 600;

/** How much to enlarge the phone column so it fills a PC screen's height. Phones get 1. */
export function pcZoom(width: number, height: number): number {
  if (width < PC_MIN_WIDTH) return 1;
  return Math.max(1, Math.floor((height / DESIGN_HEIGHT) * 100) / 100);
}

/** Keeps --pc-zoom on the root in step with the window size. */
export function trackPcZoom(win: Window = window): void {
  const apply = () => {
    win.document.documentElement.style.setProperty(
      "--pc-zoom",
      String(pcZoom(win.innerWidth, win.innerHeight)),
    );
  };
  apply();
  win.addEventListener("resize", apply);
}
