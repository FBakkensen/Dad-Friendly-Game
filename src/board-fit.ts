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

/** How much to scale the whole board so it fits the window. Never above 1; rounded down so it never overflows. */
export function boardFit(width: number, height: number): BoardFit {
  const desk = width >= DESK_MIN_WIDTH;
  const lip = desk ? DESK_LIP : 0;
  const raw = Math.min(
    1,
    (width - 2 * lip) / BOARD_WIDTH,
    (height - 2 * lip) / BOARD_HEIGHT,
  );
  return { scale: Math.floor(raw * 1000) / 1000, desk };
}

/** Keeps --board-scale on the root and body.desk in step with the window size. */
export function trackBoardFit(win: Window = window): void {
  const apply = () => {
    const { scale, desk } = boardFit(win.innerWidth, win.innerHeight);
    win.document.documentElement.style.setProperty("--board-scale", String(scale));
    win.document.body.classList.toggle("desk", desk);
  };
  apply();
  win.addEventListener("resize", apply);
}
