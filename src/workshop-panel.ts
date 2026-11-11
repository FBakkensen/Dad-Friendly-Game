import { el, hide, legend, mark, write } from "./board-dom";
import { createBoardSheet, type BoardSheet } from "./board-drawer";
import type { BoardHost } from "./board-host";
import {
  createBoardRow,
  rowsOnBoard,
  type BoardRow,
  type RowsOnBoard,
} from "./board-row";
import type { Mountain } from "./mountain";
import type { Dispatch, ProgressSnapshot } from "./progress-store";
import {
  RECIPES_LEGEND,
  SKETCH_NAME,
  WORKSHOP_KICK,
  WORKSHOP_LOCKED,
  WORKSHOP_TITLE,
  workshopMenuWords,
} from "./screen-words";
import {
  RECIPE_IDS,
  recipeById,
  workshopUnlocked,
  type RecipeId,
} from "./workshop";
import {
  createBenchRow,
  createMaterialPlates,
  createPager,
  createSoundKey,
  playHammer,
  type BenchRow,
} from "./workshop-parts";
import {
  RECIPES_A_PAGE,
  benchRowView,
  materialPlates,
  partIdOf,
  recipeRowView,
  sketchRowView,
  workshopOrder,
  type WorkshopPartId,
} from "./workshop-rows";
import {
  benchLeftMs,
  benchView,
  timerLines,
  workshopCards,
  workshopPages,
  type WorkshopCard,
} from "./workshop-sheet";
import {
  teachFirst,
  workshopTeach,
  type WorkshopTeach,
} from "./workshop-teach";

/*
 * The Workshop drawer (#374): the material plates, the bench row with its clock, bar and
 * cancel confirm, the live timers, the recipes three a page, and the sound key in the head.
 * Its rows and words come from workshop-rows.ts and its own controls from workshop-parts.ts.
 * The list's order is the board model's layout for "workshop", frozen as the drawer opens, so
 * a craft, a cancel or the tick never moves a row under a finger; pages slice that order.
 * Every craft and cancel is today's move, through the screen's dispatch.
 */

/** The flag on the taught craft's row (workshop-rows.ts). */
const NEW_FLAG = "New";

/** A recipe's row, or the sketch's, by its part id in the board's layout. */
interface RecipeRows {
  readonly byPart: ReadonlyMap<WorkshopPartId, BoardRow>;
}

/** What a recipe row's tap reads and moves. */
interface CraftTaps {
  readonly dispatch: Dispatch;
  readonly getView: () => ProgressSnapshot;
  readonly now: () => number;
  readonly onBoard: RowsOnBoard;
  readonly soundOn: () => boolean;
}

/**
 * A recipe row's tap. The card is read again at the tap: one he cannot craft now blinks red
 * and moves nothing. A craft that lands holds its row ("Done") and knocks the hammer, if the
 * sound is on.
 */
function wireCraft(taps: CraftTaps, id: RecipeId, row: BoardRow): void {
  const { dispatch, getView, now, onBoard } = taps;
  const partId: WorkshopPartId = `recipe:${id}`;
  const root = row.root as HTMLButtonElement;
  onBoard.tap(root, (press, event) => {
    const view = getView();
    if (!view.ready || onBoard.press(partId, press, event, "act") !== "act") {
      return;
    }
    const card = workshopCards(view.mountain, now()).find(
      (each) => each.kind === "recipe" && each.id === id,
    );
    if (card?.kind !== "recipe" || card.action.kind !== "craft") {
      onBoard.result(partId, "refused");
      return;
    }
    const crafted = dispatch({ kind: "craft", recipe: id }).kind === "applied";
    onBoard.result(partId, crafted ? "applied" : "refused");
    if (crafted) {
      playHammer(taps.soundOn());
    }
  });
}

/** A row for every recipe, wired to craft, and the one dark sketch. */
function buildRecipeRows(taps: CraftTaps): RecipeRows {
  const byPart = new Map<WorkshopPartId, BoardRow>();
  for (const id of RECIPE_IDS) {
    const row = createBoardRow({
      tag: "button",
      className: "workshop-recipe",
      data: { recipe: id },
      name: recipeById(id).name,
      icon: false,
    });
    wireCraft(taps, id, row);
    byPart.set(`recipe:${id}`, row);
  }
  byPart.set(
    "sketch",
    createBoardRow({
      tag: "div",
      className: "workshop-sketch",
      data: {},
      name: SKETCH_NAME,
      icon: false,
    }),
  );
  return { byPart };
}

/** The drawer's parts that are not recipe rows, built once. */
interface WorkshopParts {
  readonly plates: ReturnType<typeof createMaterialPlates>;
  readonly bench: BenchRow;
  readonly timers: HTMLElement;
  readonly recipesSec: HTMLElement;
  readonly pager: ReturnType<typeof createPager>;
}

/** Puts every part in the list, in its order: plates, bench, timers, legend, rows, pager. */
function placeParts(
  sheet: BoardSheet,
  parts: WorkshopParts,
  rows: RecipeRows,
): void {
  const recipeRoots = [...rows.byPart.values()].map((row) => row.root);
  for (const root of recipeRoots) {
    root.hidden = true;
  }
  parts.timers.hidden = true;
  sheet.place([
    parts.plates.root,
    parts.bench.root,
    parts.timers,
    parts.recipesSec,
    ...recipeRoots,
    parts.pager.root,
  ]);
}

/** What one ready paint reads. */
interface ReadyPaint {
  readonly mountain: Mountain;
  readonly at: number;
  readonly cards: readonly WorkshopCard[];
  readonly teach: WorkshopTeach;
}

/** The plates, the bench and the timers line, from a ready save. */
function paintReady(parts: WorkshopParts, ready: ReadyPaint): void {
  const { mountain, at } = ready;
  parts.plates.paint(materialPlates(mountain));
  const bench = benchView(mountain, at);
  if (bench.kind !== "busy" || bench.cancel === "") {
    parts.bench.disarm();
  }
  parts.bench.paint(benchRowView(bench, parts.bench.armed()));
  const lines = timerLines(mountain, at);
  write(parts.timers, lines.join(" · "));
  hide(parts.timers, lines.length === 0);
}

/** Until the save is in, the plates and the bench go dark and blank. */
function paintLoading(parts: WorkshopParts): void {
  parts.plates.paint(undefined);
  parts.bench.disarm();
  parts.bench.paint(undefined);
}

/** A part's row view now, or undefined (dark) for a frozen part whose card is gone. */
function partView(
  partId: string,
  ready: ReadyPaint | undefined,
): Parameters<RowsOnBoard["paint"]>[2] {
  const card = ready?.cards.find((each) => partIdOf(each) === partId);
  if (ready === undefined || card === undefined) {
    return undefined;
  }
  return card.kind === "hidden"
    ? sketchRowView(card)
    : recipeRowView(card, ready.teach);
}

/** Lays out one page of the list. */
type ArrangePage = (
  order: readonly string[],
  page: number,
  ready: ReadyPaint | undefined,
) => number;

/**
 * Shows the rows of a page in the order the board's model holds, every other row hidden, and
 * returns the page index, clamped to the pages there are. The rows move in the list only when
 * the page or the order changes.
 */
function createPageArranger(
  rows: RecipeRows,
  onBoard: RowsOnBoard,
  pager: WorkshopParts["pager"],
): ArrangePage {
  let placedKey = "";
  return (order, page, ready) => {
    const pages = workshopPages(order, RECIPES_A_PAGE);
    const at = Math.min(Math.max(0, page), pages.length - 1);
    const shown = pages[at] ?? [];
    for (const [partId, row] of rows.byPart) {
      const onPage = shown.includes(partId);
      hide(row.root, !onPage);
      if (onPage) {
        const view = partView(partId, ready);
        onBoard.paint(partId, row, view);
        mark(row.root, "teach-new", view?.flag[0] === NEW_FLAG);
      }
    }
    const key = shown.join(" ");
    if (key !== placedKey) {
      placedKey = key;
      pager.root.before(
        ...shown.flatMap(
          (id) => rows.byPart.get(id as WorkshopPartId)?.root ?? [],
        ),
      );
    }
    pager.paint(at, pages.length);
    return at;
  };
}

/** The menu's Workshop row, a second door into the drawer until B7, and its locked silhouette. */
function createMenuEntry(
  hammerUrl: string,
  onOpen: () => void,
): {
  readonly root: HTMLElement;
  paint(mountain: Mountain, at: number): void;
} {
  const root = el("div", "workshop-menu");
  const openButton = el("button", "workshop-open", WORKSHOP_TITLE);
  openButton.type = "button";
  openButton.addEventListener("click", onOpen);
  const locked = el("p", "workshop-locked");
  const lockedArt = el("img", "");
  lockedArt.src = hammerUrl;
  lockedArt.alt = "";
  lockedArt.width = 36;
  lockedArt.height = 36;
  lockedArt.draggable = false;
  locked.append(lockedArt, el("span", "", WORKSHOP_LOCKED));
  root.append(openButton, locked);
  return {
    root,
    paint: (mountain, at) => {
      const unlocked = workshopUnlocked(mountain);
      hide(openButton, !unlocked);
      hide(locked, unlocked);
      write(openButton, workshopMenuWords(benchLeftMs(mountain, at)));
    },
  };
}

/** The list's order for these cards, to the board's model: an open drawer keeps the one it froze. */
function sendLayout(board: BoardHost, cards: readonly WorkshopCard[]): void {
  board.send({
    kind: "layout",
    overlay: "workshop",
    layout: { parts: workshopOrder(cards), chipRows: 0 },
  });
}

/**
 * The plates, the bench row, the timers line, the legend and the pager. A plate opens the
 * "i" cards; arming the cancel and turning a page are new screens under the finger.
 */
function buildParts({
  board,
  onBoard,
  sheet,
  onCancel,
  onPage,
  repaint,
}: {
  board: BoardHost;
  onBoard: RowsOnBoard;
  sheet: () => BoardSheet;
  onCancel: () => void;
  onPage: (step: -1 | 1) => void;
  repaint: () => void;
}): WorkshopParts {
  return {
    plates: createMaterialPlates({
      board,
      onShow: () => {
        sheet().showHow(true);
      },
    }),
    bench: createBenchRow({
      onBoard,
      page: () => {
        sheet().page();
      },
      onCancel,
      repaint,
    }),
    timers: el("p", "workshop-timers board-num"),
    recipesSec: legend(RECIPES_LEGEND, "recipes"),
    pager: createPager({
      board,
      onPage: (step) => {
        onPage(step);
        sheet().page();
        repaint();
      },
    }),
  };
}

/** The ready save's cards, ranked as the list shows them, and what it teaches. */
function readyPaint(mountain: Mountain, at: number): ReadyPaint {
  const teach = workshopTeach(mountain, at);
  return {
    mountain,
    at,
    teach,
    cards: teachFirst(workshopCards(mountain, at), teach),
  };
}

/**
 * The Workshop drawer. `open` does nothing until the save is in and the Workshop is unlocked;
 * it marks the Workshop seen, starts on the first page with the cancel disarmed, then opens.
 * Back returns focus to the door it came from, or to `fallbackDoor` (the Ledger key) while a
 * re-load holds the Workshop key.
 */
export function createWorkshopPanel({
  dispatch,
  getView,
  now,
  board,
  overSave,
  door,
  fallbackDoor,
  hammerUrl,
  onMenuOpen,
  signal,
}: {
  dispatch: Dispatch;
  getView: () => ProgressSnapshot;
  /** The game's clock: the bench, the timers and the teach. */
  now: () => number;
  /** The board's tap rules, shared by every drawer and the board. */
  board: BoardHost;
  /** The save drawer is open over the board: its Escape is its own. */
  overSave: () => boolean;
  /** The Workshop key on the rail: the shell writes its aria-expanded. */
  door: HTMLButtonElement;
  /** The Ledger key, which opens the menu: the menu's Workshop row opens from it. */
  fallbackDoor: HTMLButtonElement;
  /** The hammer on the menu's locked silhouette. */
  hammerUrl: string;
  /** The menu's Workshop row was pressed: the menu and the other drawers go. */
  onMenuOpen: () => void;
  /** Aborting it removes the drawer's document listeners. */
  signal?: AbortSignal;
}): {
  sheet: BoardSheet;
  menuEntry: HTMLElement;
  render: () => void;
  open: (from?: HTMLElement) => void;
} {
  let soundOn = false;
  let page = 0;
  const onBoard = rowsOnBoard(board, "workshop");
  const repaint = (): void => {
    render();
  };
  const sound = createSoundKey({
    board,
    onToggle: () => {
      soundOn = !soundOn;
      playHammer(soundOn);
      repaint();
    },
  });
  const sheet = createBoardSheet({
    name: "workshop",
    title: WORKSHOP_TITLE,
    infoLabel: "Workshop and materials",
    how: {
      systems: ["workshop", "materials"],
      backLabel: "Back to the Workshop",
    },
    board,
    overSave,
    headKey: sound.root,
    door,
    // The order the open freezes.
    onOpen: () => {
      const view = getView();
      if (view.ready) {
        sendLayout(board, readyPaint(view.mountain, now()).cards);
      }
    },
    onClose: () => {
      parts.bench.disarm();
      if (door.disabled) {
        fallbackDoor.focus({ preventScroll: true });
      }
    },
    onForget: () => {
      onBoard.forget();
      parts.plates.forget();
      parts.pager.forget();
      sound.forget();
    },
    ...(signal === undefined ? {} : { signal }),
  });
  sheet.kick(WORKSHOP_KICK);

  const parts = buildParts({
    board,
    onBoard,
    sheet: () => sheet,
    onCancel: () => {
      if (dispatch({ kind: "cancelCraft" }).kind === "applied") {
        onBoard.result("bench", "applied");
      }
    },
    onPage: (step) => {
      page += step;
    },
    repaint,
  });
  const rows = buildRecipeRows({
    dispatch,
    getView,
    now,
    onBoard,
    soundOn: () => soundOn,
  });
  placeParts(sheet, parts, rows);
  const arrange = createPageArranger(rows, onBoard, parts.pager);

  const menu = createMenuEntry(hammerUrl, () => {
    onMenuOpen();
    open(fallbackDoor);
  });

  const render = (): void => {
    const view = getView();
    const at = now();
    menu.paint(view.mountain, at);
    sound.paint(soundOn);
    if (view.ready && !workshopUnlocked(view.mountain)) {
      sheet.close({ restoreFocus: false, by: "program" });
    }
    const ready = view.ready ? readyPaint(view.mountain, at) : undefined;
    if (ready === undefined) {
      paintLoading(parts);
    } else {
      paintReady(parts, ready);
      sendLayout(board, ready.cards);
    }
    sheet.kick(ready?.teach.intro ?? WORKSHOP_KICK);
    const order = board.view().layouts.get("workshop")?.parts ?? [];
    page = arrange(order, page, ready);
  };

  const open = (from?: HTMLElement): void => {
    const view = getView();
    if (!view.ready || !workshopUnlocked(view.mountain)) {
      return;
    }
    dispatch({ kind: "markSeen", id: "workshop" });
    if (!sheet.isOpen()) {
      page = 0;
      parts.bench.disarm();
    }
    sheet.open(from);
    render();
  };

  return { sheet, menuEntry: menu.root, render, open };
}
