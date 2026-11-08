/** The board stage, in CSS px (212 x 462 art pixels at 2x). */
export const BOARD_WIDTH = 424;
export const BOARD_HEIGHT = 924;
/** Wider than any supported phone (412-440): only a PC or tablet is a desk. */
const DESK_MIN_WIDTH = 600;
/** The empty margin kept round the board on a desk. */
const DESK_LIP = 8;

export interface BoardFit {
  readonly scale: number;
  readonly desk: boolean;
}

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
 * (the gate, a PC) the 424x924 phone keeps exact 2x.
 */
export function boardFit(
  width: number,
  height: number,
  insets: SafeInsets = NO_INSETS,
): BoardFit {
  const desk = width >= DESK_MIN_WIDTH;
  const lip = desk ? DESK_LIP : 0;
  const raw = Math.min(
    1,
    (width - insets.left - insets.right - 2 * lip) / BOARD_WIDTH,
    (height - insets.top - insets.bottom - 2 * lip) / BOARD_HEIGHT,
  );
  return { scale: Math.floor(raw * 1000) / 1000, desk };
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

/** Keeps --board-scale on the root and body.desk in step with the window size and its safe area. */
export function trackBoardFit(
  win: Window = window,
  insets: () => SafeInsets = () => readSafeInsets(win.document),
): void {
  const apply = () => {
    const { scale, desk } = boardFit(win.innerWidth, win.innerHeight, insets());
    win.document.documentElement.style.setProperty(
      "--board-scale",
      String(scale),
    );
    win.document.body.classList.toggle("desk", desk);
  };
  apply();
  win.addEventListener("resize", apply);
}
