import clayUrl from "./assets/board/res-clay.png";
import crystalUrl from "./assets/board/res-crystal.png";
import heartUrl from "./assets/board/res-heart.png";
import ironUrl from "./assets/board/res-iron.png";
import { el, hide, mark, setAttr, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import {
  createBoardRow,
  paintRowBar,
  rowBar,
  type RowsOnBoard,
} from "./board-row";
import { plateButton } from "./board-save";
import { skin } from "./board-skin";
import { forgetAll, pressOnBoard, type PressTracker } from "./card-tap";
import type { MaterialId } from "./layers";
import { BENCH_FREE, WORKSHOP_EARLIER, WORKSHOP_MORE } from "./screen-words";
import type { BenchRowView, MaterialPlate } from "./workshop-rows";

/*
 * The Workshop drawer's own controls (#374): the material plates, the bench row with its bar
 * and its cancel confirm, and the pager (the sound key and the knock are in sound.ts, #491).
 * Built on the shared row, plate button, skin and board presses; only the Workshop has plates, a bench or a pager, so the shared row
 * and shell stay generic. Every press goes through the board's model, so a finger that lands
 * while the drawer settles is the second tap of the one that opened or paged it.
 */

/** Each material's 16 art px icon, shown at 32. */
export const MATERIAL_ART: Readonly<Record<MaterialId, string>> = {
  clay: clayUrl,
  iron: ironUrl,
  crystal: crystalUrl,
  heartstone: heartUrl,
};

const MATERIALS = Object.keys(MATERIAL_ART) as readonly MaterialId[];

/** From three plates on, the word goes and the count shrinks, to fit 89px plates. */
const PACKED_FROM = 3;

/** An armed cancel that gets no second tap disarms after this long. */
const DISARM_MS = 4_000;

/** A part whose presses go through the board: `forget` drops a finger-down time left over. */
interface Pressed {
  forget(): void;
}

interface PlateParts {
  readonly button: HTMLButtonElement;
  readonly count: HTMLElement;
  readonly word: HTMLElement;
}

function plateParts(id: MaterialId): PlateParts {
  const button = el("button", "workshop-mat");
  button.type = "button";
  button.dataset["material"] = id;
  button.hidden = true;
  const icon = el("img", "workshop-mat-icon");
  icon.src = MATERIAL_ART[id];
  icon.width = 32;
  icon.height = 32;
  icon.alt = "";
  icon.draggable = false;
  const count = el("span", "workshop-mat-count board-num");
  const word = el("span", "workshop-mat-word", id);
  button.append(icon, count, word);
  skin(button, "frame");
  return { button, count, word };
}

/**
 * A plate for each material met, in the layers' order. A tap opens the "i" cards. Until the
 * save is in, the plates shown are dark and blank.
 */
export function createMaterialPlates({
  board,
  onShow,
}: {
  board: BoardHost;
  onShow: () => void;
}): Pressed & {
  readonly root: HTMLElement;
  paint(plates: readonly MaterialPlate[] | undefined): void;
} {
  const root = el("div", "workshop-mats");
  const parts = new Map<MaterialId, PlateParts>();
  const trackers = MATERIALS.map((id) => {
    const each = plateParts(id);
    parts.set(id, each);
    root.append(each.button);
    return pressOnBoard(
      each.button,
      board,
      { layer: "workshop", id: `mat:${id}` },
      (decision) => {
        if (decision === "act") {
          onShow();
        }
      },
    );
  });
  let met: readonly MaterialId[] = [];

  const paint = (plates: readonly MaterialPlate[] | undefined): void => {
    if (plates !== undefined) {
      met = plates.map((plate) => plate.id);
    }
    const packed = met.length >= PACKED_FROM;
    mark(root, "is-packed", packed);
    for (const [id, { button, count, word }] of parts) {
      const plate = plates?.find((each) => each.id === id);
      hide(button, !met.includes(id));
      button.disabled = plates === undefined;
      write(count, plate?.count ?? "");
      hide(word, packed);
      setAttr(button, "aria-label", plate?.aria ?? id);
    }
  };

  return { root, paint, forget: forgetAll(trackers) };
}

export interface BenchRow {
  readonly root: HTMLElement;
  paint(view: BenchRowView | undefined): void;
  armed(): boolean;
  disarm(): void;
  /** Disarms unless the cancel was armed on this craft ("" is none it can cancel). */
  keep(craft: string): void;
}

/**
 * The bench as a drawer row, which is also the cancel plate. A tap on a busy bench arms the
 * cancel and pages the drawer, so the second tap of a double tap lands on nothing; a tap past
 * the settle cancels. Left alone, it disarms after 4s, and at once when the craft it was armed
 * on goes. A free or unknown bench takes no tap.
 */
export function createBenchRow({
  onBoard,
  page,
  onCancel,
  repaint,
  craft,
  signal,
}: {
  onBoard: RowsOnBoard;
  /** The drawer's `page()`: the confirm is a new screen under the finger. */
  page: () => void;
  onCancel: () => void;
  /** Paint the bench again: the panel builds its view with `armed()`. */
  repaint: () => void;
  /** The craft on the bench now, read as the cancel arms: its recipe and start. */
  craft: () => string;
  /** The screen's: its abort clears the disarm timer. */
  signal?: AbortSignal;
}): BenchRow {
  const row = createBoardRow({
    tag: "button",
    className: "workshop-bench",
    data: { bench: "" },
    name: BENCH_FREE,
    icon: false,
  });
  const root = row.root as HTMLButtonElement;
  const { bar, fill } = rowBar();
  // The Workshop's checks find the bench's bar by its old name.
  bar.classList.add("workshop-bar");
  root.append(bar);
  let view: BenchRowView | undefined;
  let timer: number | undefined;
  let armedOn = "";

  const disarm = (): void => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };
  signal?.addEventListener("abort", disarm, { once: true });

  onBoard.tap(root, (press, event) => {
    const decision = onBoard.press("bench", press, event, "act");
    if (decision !== "act" || view?.canCancel !== true) {
      return;
    }
    if (timer !== undefined) {
      disarm();
      onCancel();
      return;
    }
    armedOn = craft();
    timer = window.setTimeout(() => {
      timer = undefined;
      repaint();
    }, DISARM_MS);
    page();
    repaint();
  });

  return {
    root,
    paint: (next) => {
      view = next;
      onBoard.paint("bench", row, next);
      paintRowBar(bar, fill, next?.progress, next?.aria ?? "");
    },
    armed: () => timer !== undefined,
    disarm,
    keep: (now) => {
      if (now === "" || now !== armedOn) {
        disarm();
      }
    },
  };
}

/** Earlier and More to make. Each keeps its column, so the other never moves. */
export function createPager({
  board,
  onPage,
}: {
  board: BoardHost;
  onPage: (step: -1 | 1) => void;
}): Pressed & {
  readonly root: HTMLElement;
  paint(page: number, pages: number): void;
} {
  const root = el("div", "workshop-pager");
  const earlier = plateButton(WORKSHOP_EARLIER);
  earlier.classList.add("workshop-earlier");
  const more = plateButton(WORKSHOP_MORE);
  more.classList.add("workshop-more");
  root.append(earlier, more);
  const wire = (button: HTMLElement, step: -1 | 1): PressTracker =>
    pressOnBoard(
      button,
      board,
      { layer: "workshop", id: step < 0 ? "earlier" : "more" },
      (decision) => {
        if (decision === "act") {
          onPage(step);
        }
      },
    );
  const trackers = [wire(earlier, -1), wire(more, 1)];
  return {
    root,
    paint: (page, pages) => {
      hide(root, pages <= 1);
      hide(earlier, page <= 0);
      hide(more, page >= pages - 1);
    },
    forget: forgetAll(trackers),
  };
}
