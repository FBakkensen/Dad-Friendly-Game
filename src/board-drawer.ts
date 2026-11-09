import makersPlateUrl from "./assets/board/makers-plate-l.png";
import makersStripUrl from "./assets/board/makers-strip.png";
import { el, hide, mark, refitAll, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import { boardHowCard, type BoardHowSystem } from "./board-how-art";
import {
  type CloseBy,
  type ControlRef,
  type DrawerId,
  type Pointer,
  type PressDecision,
} from "./board-interaction";
import { plateButton } from "./board-save";
import { trackPress, type PressTracker } from "./card-tap";
import { skin } from "./board-skin";
import { TROUBLE_FIXED } from "./screen-words";

/*
 * The drawer shell (#373): a riveted sheet that slides up from under the board's middle to the
 * save line, with its title, kick and "i" on top, a list that scrolls inside itself, the spare
 * plate under a short list, and Back at its foot. Buys and Upgrades build their rows inside it.
 *
 * It paints and reports; the board's model decides. Opening, the "i" cards and closing go to
 * the model, and Back, the "i" and the cards' Backs press through it, so a finger that lands
 * while the drawer settles is the second tap of the double tap that opened it. A press is
 * judged by when its finger came down, so a touch's click that lands on whatever slid under
 * the finger as the drawer rose is judged by its own age. A keyboard press (a click with no
 * pointer, detail 0) is never early. The scrim above the drawers closes them.
 */

// The settle lives with the board's tap rules.
export { DRAWER_SETTLE_MS } from "./board-interaction";

/** What the spare plate under a short list shows, by its height. */
export type SpareTier = "tall" | "mid" | "short" | "off";

/** Tall from 144px, mid from 84, short from 48, else off. */
export function spareTier(heightPx: number): SpareTier {
  if (heightPx >= 144) {
    return "tall";
  }
  if (heightPx >= 84) {
    return "mid";
  }
  if (heightPx >= 48) {
    return "short";
  }
  return "off";
}

const TIER_CLASS: Readonly<Record<SpareTier, string>> = {
  tall: "is-tall",
  mid: "is-mid",
  short: "is-short",
  off: "is-off",
};

export interface BoardSheet {
  readonly root: HTMLElement;
  readonly list: HTMLElement;
  readonly how: HTMLElement;
  readonly info: HTMLButtonElement;
  /** Under the list: Back, and a line a panel may set over it. */
  readonly footer: HTMLElement;
  readonly back: HTMLButtonElement;
  /** Open in the board's model. */
  isOpen(): boolean;
  open(from?: HTMLElement): void;
  /**
   * Shuts the drawer and focuses the key it opened from. `restoreFocus: false` leaves focus
   * where it is: a card that covered the drawer has already taken it. `by` tells the model
   * what closed it.
   */
  close(options: {
    readonly restoreFocus?: boolean;
    readonly by: CloseBy;
  }): void;
  /** The resting kick under the title. */
  kick(text: string): void;
  showHow(on: boolean): void;
  /** Inserts the parts into the list, before the spare plate. */
  place(parts: readonly HTMLElement[]): void;
  fitSpare(): void;
}

/** Focus without scrolling: the drawer's clip is overflow hidden and must never scroll. */
function focusQuietly(target: HTMLElement): void {
  target.focus({ preventScroll: true });
}

/** The cards the "i" opens in a drawer's place. */
export interface BoardHow {
  readonly systems: readonly BoardHowSystem[];
  readonly backLabel: string;
}

/** The spare plate under a short list: the makers' plate with its strip. */
function spareCard(): HTMLElement {
  const spare = el("div", "board-spare");
  spare.setAttribute("aria-hidden", "true");
  const plate = el("img", "board-spare-plate");
  plate.src = makersPlateUrl;
  plate.width = 192;
  plate.height = 96;
  plate.alt = "";
  plate.draggable = false;
  const strip = el("img", "board-spare-strip");
  strip.src = makersStripUrl;
  strip.width = 192;
  strip.height = 40;
  strip.alt = "";
  strip.draggable = false;
  spare.append(plate, strip);
  skin(spare, "inset");
  return spare;
}

/** The "i" cards, one Back under the last: the first card's Back stays hidden. */
function howCards(
  { systems, backLabel }: BoardHow,
  back: () => void,
): HTMLElement[] {
  const cards = systems.map((system) => boardHowCard(system, backLabel, back));
  const first = cards[0]?.querySelector<HTMLElement>(".teach-how-back");
  if (first) {
    first.hidden = true;
  }
  return cards;
}

/** The shell's parts, built once. */
interface SheetParts {
  readonly root: HTMLElement;
  readonly head: HTMLElement;
  readonly heading: HTMLElement;
  readonly kickLine: HTMLElement;
  readonly info: HTMLButtonElement;
  readonly how: HTMLElement;
  readonly list: HTMLElement;
  readonly spare: HTMLElement;
  readonly footer: HTMLElement;
  readonly back: HTMLButtonElement;
}

/**
 * The root is `section.board-drawer.board-sheet[data-sheet=name]`, a dialog labelled by its
 * title.
 */
function buildSheet(
  name: DrawerId,
  title: string,
  infoLabel: string,
): SheetParts {
  const root = el("section", "board-drawer board-sheet");
  root.dataset.sheet = name;
  root.setAttribute("role", "dialog");

  const head = el("header", "board-sheet-head");
  const heading = el("h2", "board-sheet-title", title);
  heading.id = `board-sheet-${name}-title`;
  heading.tabIndex = -1;
  root.setAttribute("aria-labelledby", heading.id);
  const kickLine = el("p", "board-sheet-kick");
  kickLine.setAttribute("aria-live", "polite");
  const info = plateButton("i");
  info.classList.add("board-sheet-info", "teach-info");
  info.setAttribute("aria-label", `How it works: ${infoLabel}`);
  head.append(heading, kickLine, info);

  const how = el("div", "board-sheet-how");
  how.tabIndex = -1;
  how.hidden = true;
  const list = el("div", "board-sheet-list");
  const spare = spareCard();
  list.append(spare);

  const footer = el("footer", "board-sheet-footer");
  const back = plateButton("Back to the board");
  back.classList.add("board-sheet-back");
  footer.append(back);

  root.append(head, how, list, footer);
  skin(root, "frame");
  return {
    root,
    head,
    heading,
    kickLine,
    info,
    how,
    list,
    spare,
    footer,
    back,
  };
}

/** The kick line: the thanks for a fix while it lasts, as done, else the resting kick. */
function paintKick(
  kickLine: HTMLElement,
  resting: string,
  thanked: boolean,
): void {
  write(kickLine, thanked ? TROUBLE_FIXED : resting);
  mark(kickLine, "is-done", thanked);
}

/** The spare plate's tier now: written to its class only when it changes. */
function fitSpareTier(
  { spare, list }: SheetParts,
  tier: SpareTier | undefined,
): SpareTier {
  // Off, the plate gives its gap in the list back (board.css): measure it without that room,
  // or it would flip between off and short at the edge.
  const freed =
    tier === "off" ? Number.parseFloat(getComputedStyle(list).rowGap) || 0 : 0;
  const next = spareTier(spare.offsetHeight - freed);
  if (next !== tier) {
    for (const [each, cls] of Object.entries(TIER_CLASS)) {
      mark(spare, cls, each === next);
    }
  }
  return next;
}

/** The "i" cards in the drawer's place, or the drawer back. */
function setHow({ how, head, list, footer }: SheetParts, on: boolean): void {
  hide(how, !on);
  hide(head, on);
  hide(list, on);
  hide(footer, on);
}

/**
 * One of the shell's own controls, pressed through the board. Its press is tracked on the
 * control itself, so it is judged by its own finger-down time, and that time is dropped at a
 * cancel or when the drawer moves on.
 */
function pressOnBoard(
  target: HTMLElement,
  board: BoardHost,
  control: ControlRef,
  judged: (decision: PressDecision, by: Pointer, event: MouseEvent) => void,
  options: AddEventListenerOptions = {},
): PressTracker {
  const tracker = trackPress(target, board, options);
  target.addEventListener(
    "click",
    (event) => {
      const { by, downAt } = tracker.press(event);
      const decision = board.press({
        control,
        by,
        intent: "act",
        downAt,
        event,
      });
      judged(decision, by, event);
    },
    options,
  );
  return tracker;
}

/** Back, the "i" and the cards' Backs: each acts only when the board says it may. */
function wireSheetControls(
  parts: SheetParts,
  board: BoardHost,
  layer: DrawerId,
  act: Pick<BoardSheet, "close" | "showHow">,
): readonly PressTracker[] {
  return [
    pressOnBoard(parts.back, board, { layer, id: "back" }, (decision, by) => {
      if (decision === "act") {
        act.close({ by });
      }
    }),
    pressOnBoard(parts.info, board, { layer, id: "info" }, (decision) => {
      if (decision === "act") {
        act.showHow(true);
      }
    }),
    // The cards' own Backs: an early click stops on the cards' host, before it reaches them.
    pressOnBoard(
      parts.how,
      board,
      { layer, id: "how-back" },
      (decision, _by, event) => {
        if (decision !== "act") {
          event.stopPropagation();
        }
      },
      { capture: true },
    ),
  ];
}

/**
 * Escape closes the drawer, unless the save drawer is open over it. Heard on the way down,
 * before the save line's own Escape can shut the save drawer and let this one through.
 * Drawers are built once; `signal` lets a test or a remount take this away.
 */
function closeOnEscape(
  close: () => void,
  overSave: () => boolean,
  signal: AbortSignal | undefined,
): void {
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && !overSave()) {
        close();
      }
    },
    signal === undefined ? { capture: true } : { capture: true, signal },
  );
}

/** A drawer, built once and reused, open and shut through the board's model. */
export function createBoardSheet({
  name,
  title,
  infoLabel,
  how: howOf,
  board,
  overSave,
  onOpen,
  onClose,
  onForget,
  door,
  signal,
}: {
  name: DrawerId;
  title: string;
  infoLabel: string;
  /** The cards the "i" opens in the drawer's place, one Back under the last. */
  how: BoardHow;
  board: BoardHost;
  /** The save drawer is open over this one: Escape is its alone. */
  overSave: () => boolean;
  /**
   * The drawer is open on the page, and the board's model has not heard it yet: a panel
   * measures here, and sends the layout the open then freezes.
   */
  onOpen?: () => void;
  onClose?: () => void;
  /** The drawer moved on (opened, paged or closed): the panel forgets its rows' presses. */
  onForget?: () => void;
  /**
   * The drawer's key on the rail (#373): the shell writes only its aria-expanded, whichever
   * door (the key, a bay, Saving for) opened the drawer.
   */
  door?: HTMLElement;
  /** Aborting it removes the sheet's document listeners. */
  signal?: AbortSignal;
}): BoardSheet {
  const parts = buildSheet(name, title, infoLabel);
  const { root, heading, kickLine, info, how, list, spare, footer, back } =
    parts;
  /** What the page shows; the model says whether the drawer is open. */
  let shown = false;
  door?.setAttribute("aria-expanded", "false");
  let from: HTMLElement | undefined;
  let resting = "";
  let tier: SpareTier | undefined;
  let trackers: readonly PressTracker[] = [];

  const forget = (): void => {
    for (const tracker of trackers) {
      tracker.forget();
    }
    onForget?.();
  };
  const fitSpare = (): void => {
    tier = fitSpareTier(parts, tier);
  };
  const paintThanks = (): void => {
    paintKick(kickLine, resting, board.view().thanks.has(name));
  };

  const showHow = (on: boolean): void => {
    setHow(parts, on);
    // Each way is a new screen under the finger: the second tap of a double tap on the "i"
    // must not take the cards' Back, nor one on the cards' Back buy the row under it, so the
    // settle starts again (#373).
    if (shown) {
      forget();
      board.send({ kind: "page", overlay: name, at: board.clock() });
    }
    // The "i" hides under the cards, so focus moves with them, and back to it.
    focusQuietly(on ? how : info);
  };

  const openSheet = (opener?: HTMLElement): void => {
    if (shown) {
      return;
    }
    shown = true;
    forget();
    from = opener;
    root.classList.add("is-open");
    door?.setAttribute("aria-expanded", "true");
    list.scrollTop = 0;
    focusQuietly(heading);
    // Lines fitted while shut are measured again on the open drawer.
    refitAll(root);
    fitSpare();
    requestAnimationFrame(fitSpare);
    onOpen?.();
    board.send({ kind: "open", overlay: name, at: board.clock() });
  };

  const close: BoardSheet["close"] = ({ restoreFocus = true, by }) => {
    if (!shown) {
      return;
    }
    shown = false;
    forget();
    board.send({ kind: "close", overlay: name, at: board.clock(), by });
    root.classList.remove("is-open");
    door?.setAttribute("aria-expanded", "false");
    setHow(parts, false);
    onClose?.();
    if (restoreFocus && from?.isConnected === true) {
      focusQuietly(from);
    }
  };

  how.append(
    ...howCards(howOf, () => {
      showHow(false);
    }),
  );
  trackers = wireSheetControls(parts, board, name, { close, showHow });
  board.subscribe(paintThanks);

  closeOnEscape(
    () => {
      close({ by: "keyboard" });
    },
    overSave,
    signal,
  );

  return {
    root,
    list,
    how,
    info,
    footer,
    back,
    isOpen: () => board.view().stack.includes(name),
    open: openSheet,
    close,
    kick: (text) => {
      resting = text;
      paintThanks();
    },
    showHow,
    place: (parts) => {
      spare.before(...parts);
    },
    fitSpare,
  };
}

/** True when the point lies inside the rect, its far edges excluded. */
function inside(rect: DOMRect, x: number, y: number): boolean {
  return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

/**
 * The board above the drawers (0..--sheet-top). On while any sheet is open; a tap on it closes
 * them all, and a tap over a relic socket then shows that relic's note.
 */
export function createSheetScrim({
  board,
  sheets,
  sockets,
}: {
  board: BoardHost;
  sheets: readonly BoardSheet[];
  sockets: () => readonly HTMLElement[];
}): HTMLElement {
  const scrim = el("div", "board-scrim");
  scrim.setAttribute("aria-hidden", "true");

  // The panels never need to know the scrim: it follows the board's model.
  const paint = (): void => {
    mark(
      scrim,
      "is-on",
      sheets.some((sheet) => sheet.isOpen()),
    );
  };
  board.subscribe(paint);
  paint();

  scrim.addEventListener("click", (event) => {
    const under = sockets().find((socket) =>
      inside(socket.getBoundingClientRect(), event.clientX, event.clientY),
    );
    // A tap-through: the tap goes on to what lay under the drawers, which does not settle.
    for (const sheet of sheets) {
      sheet.close({ by: "tap-through" });
    }
    // The pointer's own click (its detail), so the relic plate sees a finger, not a key,
    // and its note does not take focus.
    under?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail: event.detail,
      }),
    );
  });

  return scrim;
}
