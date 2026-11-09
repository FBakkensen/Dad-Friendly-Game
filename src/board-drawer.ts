import makersPlateUrl from "./assets/board/makers-plate-l.png";
import makersStripUrl from "./assets/board/makers-strip.png";
import { el, refitAll, write } from "./board-dom";
import { plateButton } from "./board-save";
import { skin } from "./board-skin";

/*
 * The drawer shell (#373): a riveted sheet that slides up from under the board's middle to the
 * save line, with its title, kick and "i" on top, a list that scrolls inside itself, the spare
 * plate under a short list, and Back at its foot. Buys and Upgrades build their rows inside it.
 *
 * One settle for every drawer: for 400ms after it opens, a finger that lands on it is the
 * second tap of the double tap that opened it. Rows ask `settling` through buyOnTap; Back and
 * the "i" ask it here. It is judged at a finger's press and again at its click, since a touch's
 * click lands where the finger lifts, on whatever slid under it as the drawer rose (#373). A
 * keyboard press (a click with no pointer, detail 0) is never early. The scrim above the
 * drawers closes them.
 */

/** How long a drawer settles after opening: B4's double-tap guard, for every drawer. */
export const DRAWER_SETTLE_MS = 400;

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
  isOpen(): boolean;
  /** Open, and opened less than DRAWER_SETTLE_MS ago on the clock. */
  settling(): boolean;
  open(from?: HTMLElement): void;
  /**
   * Shuts the drawer and focuses the key it opened from. `restoreFocus: false` leaves focus
   * where it is: a card that covered the drawer has already taken it.
   */
  close(options?: { readonly restoreFocus?: boolean }): void;
  /** The resting kick under the title. */
  kick(text: string): void;
  /** Shows `text` as done for `ms`, then the resting kick. */
  flash(text: string, ms: number): void;
  showHow(on: boolean): void;
  fitSpare(): void;
}

/** Focus without scrolling: the drawer's clip is overflow hidden and must never scroll. */
function focusQuietly(target: HTMLElement): void {
  target.focus({ preventScroll: true });
}

function hide(target: HTMLElement, hidden: boolean): void {
  if (target.hidden !== hidden) {
    target.hidden = hidden;
  }
}

/**
 * A drawer, built once and reused. The root is
 * `section.board-drawer.board-sheet[data-sheet=name]`, a dialog labelled by its title.
 */
export function createBoardSheet({
  name,
  title,
  infoLabel,
  clock,
  onOpen,
  onClose,
  door,
  signal,
}: {
  name: "buys" | "upgrades";
  title: string;
  infoLabel: string;
  clock: () => number;
  onOpen?: () => void;
  onClose?: () => void;
  /**
   * The drawer's key on the rail (#373): the shell writes only its aria-expanded, whichever
   * door (the key, a bay, Saving for) opened the drawer.
   */
  door?: HTMLElement;
  /** Aborting it removes the sheet's document listeners. */
  signal?: AbortSignal;
}): BoardSheet {
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
  list.append(spare);

  const footer = el("footer", "board-sheet-footer");
  const back = plateButton("Back to the board");
  back.classList.add("board-sheet-back");
  footer.append(back);

  root.append(head, how, list, footer);
  skin(root, "frame");

  let open = false;
  door?.setAttribute("aria-expanded", "false");
  let openedAt = Number.NEGATIVE_INFINITY;
  let from: HTMLElement | undefined;
  let resting = "";
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  let tier: SpareTier | undefined;
  /** Back was pressed by a finger while settling; the click that ends that press is ignored. */
  let early = false;

  const settling = (): boolean => open && clock() - openedAt < DRAWER_SETTLE_MS;

  const fitSpare = (): void => {
    // Off, the plate gives its gap in the list back (board.css): measure it without that room,
    // or it would flip between off and short at the edge.
    const freed =
      tier === "off"
        ? Number.parseFloat(getComputedStyle(list).rowGap) || 0
        : 0;
    const next = spareTier(spare.offsetHeight - freed);
    if (next === tier) {
      return;
    }
    tier = next;
    for (const [each, cls] of Object.entries(TIER_CLASS)) {
      if (spare.classList.contains(cls) !== (each === next)) {
        spare.classList.toggle(cls, each === next);
      }
    }
  };

  const setHow = (on: boolean): void => {
    hide(how, !on);
    hide(head, on);
    hide(list, on);
    hide(footer, on);
  };

  const showHow = (on: boolean): void => {
    setHow(on);
    // Back to the list is a new screen under the finger: the second tap of a double tap on
    // the cards' Back must not buy the row under it, so the settle starts again.
    if (!on && open) {
      openedAt = clock();
    }
    // The "i" hides under the cards, so focus moves with them, and back to it.
    focusQuietly(on ? how : info);
  };

  const openSheet = (opener?: HTMLElement): void => {
    if (open) {
      return;
    }
    open = true;
    openedAt = clock();
    // A press on Back lost before its click (dragged off) belongs to the last opening.
    early = false;
    from = opener;
    root.classList.add("is-open");
    door?.setAttribute("aria-expanded", "true");
    list.scrollTop = 0;
    focusQuietly(heading);
    onOpen?.();
    // Lines fitted while shut are measured again on the open drawer.
    refitAll(root);
    fitSpare();
    requestAnimationFrame(fitSpare);
  };

  const close = ({
    restoreFocus = true,
  }: { readonly restoreFocus?: boolean } = {}): void => {
    if (!open) {
      return;
    }
    open = false;
    root.classList.remove("is-open");
    door?.setAttribute("aria-expanded", "false");
    setHow(false);
    onClose?.();
    if (restoreFocus && from?.isConnected === true) {
      focusQuietly(from);
    }
  };

  const kick = (text: string): void => {
    resting = text;
    if (flashTimer === undefined) {
      write(kickLine, text);
    }
  };

  const flash = (text: string, ms: number): void => {
    clearTimeout(flashTimer);
    write(kickLine, text);
    kickLine.classList.add("is-done");
    flashTimer = setTimeout(() => {
      flashTimer = undefined;
      kickLine.classList.remove("is-done");
      write(kickLine, resting);
    }, ms);
  };

  // Back shares the settle: a finger that lands on it while the drawer settles is the second
  // tap of the one that opened it. Judged at pointerdown, so a held press stays early. A
  // keyboard press is a click with no pointer (detail 0), so is never early.
  back.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    early = settling();
  });
  back.addEventListener("pointercancel", () => {
    early = false;
  });
  back.addEventListener("click", (event) => {
    const wasEarly = (early || settling()) && event.detail !== 0;
    early = false;
    if (!wasEarly) {
      close();
    }
  });

  // The "i" shares the settle too. Its listener comes first, so a finger's early click stops
  // here, before the panel's own listener opens the cards.
  info.addEventListener("click", (event) => {
    if (event.detail !== 0 && settling()) {
      event.stopImmediatePropagation();
    }
  });

  // Drawers are built once; `signal` lets a test or a remount take this away.
  document.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape" && open) {
        close();
      }
    },
    signal === undefined ? {} : { signal },
  );

  return {
    root,
    list,
    how,
    info,
    footer,
    back,
    isOpen: () => open,
    settling,
    open: openSheet,
    close,
    kick,
    flash,
    showHow,
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
  sheets,
  sockets,
}: {
  sheets: readonly BoardSheet[];
  sockets: () => readonly HTMLElement[];
}): HTMLElement {
  const scrim = el("div", "board-scrim");
  scrim.setAttribute("aria-hidden", "true");

  const sync = (): void => {
    const on = sheets.some((sheet) => sheet.root.classList.contains("is-open"));
    if (scrim.classList.contains("is-on") !== on) {
      scrim.classList.toggle("is-on", on);
    }
  };
  // The panels never need to know the scrim: it follows their class.
  const watch = new MutationObserver(sync);
  for (const sheet of sheets) {
    watch.observe(sheet.root, { attributes: true, attributeFilter: ["class"] });
  }
  sync();

  scrim.addEventListener("click", (event) => {
    const under = sockets().find((socket) =>
      inside(socket.getBoundingClientRect(), event.clientX, event.clientY),
    );
    for (const sheet of sheets) {
      if (sheet.isOpen()) {
        sheet.close();
      }
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
