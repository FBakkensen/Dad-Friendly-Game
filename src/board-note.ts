import { skin } from "./board-skin";
import { BOARD_HEIGHT, BOARD_WIDTH } from "./board-fit";

/** Gap kept between the note and the board edge, in board px. */
const EDGE = 8;
/** Gap between the anchor and the note. */
const GAP = 6;
/** A note that would reach this close to the bottom (the save line) goes above its anchor. */
const SAVE_LINE = 60;
const STEP = 2;
const DEFAULT_MS = 3400;

interface NoteOptions {
  /** How long a plain note stays up. */
  readonly ms?: number;
  /**
   * The note's key, a button in `body`. A note with a key stays up until an
   * outside pointerdown, Escape, or the key itself puts it away (#370).
   */
  readonly key?: HTMLElement;
  /** Move focus to the key: the note was opened from the keyboard. */
  readonly focus?: boolean;
}

export interface BoardNote {
  readonly note: HTMLElement;
  readonly show: (
    anchor: HTMLElement,
    body: Node,
    options?: NoteOptions,
  ) => void;
  readonly hide: () => void;
}

const snap = (v: number): number => Math.round(v / STEP) * STEP;

/** The floating framed card that explains a tap. Placed in board coordinates inside the stage. */
export function createBoardNote(stage: HTMLElement): BoardNote {
  const note = document.createElement("div");
  note.className = "board-note";
  note.setAttribute("role", "status");
  const content = document.createElement("div");
  content.className = "board-note-body";
  note.append(content);
  skin(note, "frame");
  stage.append(note);

  let timer: ReturnType<typeof setTimeout> | undefined;
  let anchorEl: HTMLElement | null = null;

  const hide = (): void => {
    clearTimeout(timer);
    note.classList.remove("on");
  };

  document.addEventListener("pointerdown", (e) => {
    const target = e.target;
    if (!(target instanceof Node)) return;
    if (note.contains(target) || anchorEl?.contains(target)) return;
    hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !note.classList.contains("on")) return;
    const hadFocus = note.contains(document.activeElement);
    hide();
    if (hadFocus) anchorEl?.focus();
  });

  const show = (
    anchor: HTMLElement,
    body: Node,
    { ms = DEFAULT_MS, key, focus = false }: NoteOptions = {},
  ): void => {
    anchorEl = anchor;
    content.replaceChildren(body);
    // Using the key puts the note away; the key's own handler runs first.
    key?.addEventListener("click", hide);
    note.style.left = "0px";
    note.style.top = "0px";
    note.classList.add("on");
    const sr = stage.getBoundingClientRect();
    const r = anchor.getBoundingClientRect();
    const k = sr.width > 0 ? sr.width / BOARD_WIDTH : 1;
    const nw = note.offsetWidth;
    const nh = note.offsetHeight;
    const stageH = stage.offsetHeight || BOARD_HEIGHT;
    const ax = (r.left - sr.left) / k;
    const aw = r.width / k;
    const at = (r.top - sr.top) / k;
    const ab = (r.bottom - sr.top) / k;
    const x = Math.max(
      EDGE,
      Math.min(BOARD_WIDTH - nw - EDGE, ax + aw / 2 - nw / 2),
    );
    let y = ab + GAP;
    if (y + nh > stageH - SAVE_LINE) y = at - nh - GAP;
    note.style.left = `${String(snap(x))}px`;
    note.style.top = `${String(snap(Math.max(GAP, y)))}px`;
    clearTimeout(timer);
    if (key === undefined) timer = setTimeout(hide, ms);
    else if (focus) key.focus();
  };

  return { note, show, hide };
}
