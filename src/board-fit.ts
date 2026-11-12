/** The board stage, in CSS px (212 x 462 art pixels at 2x). */
export const BOARD_WIDTH = 424;
export const BOARD_HEIGHT = 924;
/** env(safe-area-inset-*) in CSS px: where a status bar, notch or gesture bar covers the page. */
export interface SafeInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const NO_INSETS: SafeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * How much to scale the whole board so it fits the window inside its safe
 * area. Never above 1; rounded down so it never overflows. With no insets
 * (the gate) the 424x924 phone keeps exact 2x. The game is phone-only: a wider
 * window, such as a PC's, gets the same board, scaled to its height and centred.
 */
export function boardFit(
  width: number,
  height: number,
  insets: SafeInsets = NO_INSETS,
): number {
  const raw = Math.min(
    1,
    (width - insets.left - insets.right) / BOARD_WIDTH,
    (height - insets.top - insets.bottom) / BOARD_HEIGHT,
  );
  return Math.floor(raw * 1000) / 1000;
}

/**
 * Script cannot read env() directly, so a hidden probe takes the insets as
 * padding (board.css) and its computed style reads them back. The probe is
 * removed again.
 */
export function readSafeInsets(doc: Document = document): SafeInsets {
  const view = doc.defaultView;
  if (view === null) return NO_INSETS;
  const probe = doc.createElement("div");
  // board.css pads .board-safe-probe by env(safe-area-inset-*).
  probe.className = "board-safe-probe";
  probe.setAttribute("aria-hidden", "true");
  doc.body.append(probe);
  const style = view.getComputedStyle(probe);
  const px = (value: string): number => {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const insets = {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
  probe.remove();
  return insets;
}

/** Keeps --board-scale on the root in step with the window size and its safe area. */
export function trackBoardFit(
  win: Window = window,
  insets: () => SafeInsets = () => readSafeInsets(win.document),
): void {
  const doc = win.document;
  const apply = () => {
    const scale = boardFit(win.innerWidth, win.innerHeight, insets());
    doc.documentElement.style.setProperty("--board-scale", String(scale));
  };
  apply();
  win.addEventListener("resize", apply);
}
