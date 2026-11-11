import borerUrl from "./assets/board/mach-borer.png";
import cartUrl from "./assets/board/mach-cart.png";
import drillUrl from "./assets/board/mach-drill.png";
import machineUrl from "./assets/board/mach-machine.png";
import workerUrl from "./assets/board/mach-worker.png";
import minerUrl from "./assets/board/miner-18f.png";
import { el, fitFirst, hide, mark, setAttr, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import type { Pointer } from "./board-interaction";
import type { PlateAct } from "./board-page";
import { createBoardRow, type BoardRow, type RowsOnBoard } from "./board-row";
import { drawerPlate } from "./board-save";
import { skin } from "./board-skin";
import { forgetAll, type PressTracker } from "./card-tap";
import { createEffectChip, writeChip } from "./effect-row";
import type { EngineerRowView, HerPlates } from "./engineer-rows";
import { ENGINEER_NAMES, MAX_ENGINEERS } from "./engineers";
import { KEEPSAKES, TUNNELS, type TunnelId } from "./expeditions";
import type { Mountain } from "./mountain";
import type { RowView } from "./row-view";
import {
  BROUGHT_HOME,
  CALL_BACK,
  ENGINEERS_BACK,
  SEND_EXPLORING,
  TEND_MACHINE,
  TEND_POSTS,
  expeditionChip,
  type TendPost,
} from "./screen-words";

/*
 * The Engineers drawer's own parts (#455): a row per engineer with the walk home in its icon
 * cell while she is out, her page of posts, the tunnels page, the Brought home page, and the
 * expedition chips in the Running now note. Built on the shared row, plate, skin and board
 * presses; no other drawer has engineer rows, post pages or a walker. engineer-rows.ts says
 * what each shows; every press goes through the board's model, so a finger that lands while a
 * page settles is the second tap of the one that opened it.
 */

/** Each post's machine on her page: the board's own art, the worker at camp. */
export const POST_ART: Readonly<Record<TendPost, string>> = {
  cart: cartUrl,
  drill: drillUrl,
  borer: borerUrl,
  machine: machineUrl,
  camp: workerUrl,
};

/** Her page's plates and the tunnels page's, by what they lead to. */
type PlateId = "explore" | "recall" | "back" | "tend";

/** A plate's press: which plate, and how the press came. */
type OnPlate = (id: PlateId, by: Pointer) => void;

/** The control id of a page's way back: apart from the shell's own Back. */
const LIST_BACK = "list-back";

/** The walk home: the board's miner, walking east in hard steps across an inset tunnel mouth. */
export function createWalk(): {
  readonly root: HTMLElement;
  /** Off pauses him, for a drawer that is shut. */
  paint(on: boolean): void;
} {
  const root = el("span", "engineer-walk");
  setAttr(root, "aria-hidden", "true");
  const walker = el("i", "engineer-walker");
  walker.style.backgroundImage = `url(${minerUrl})`;
  root.append(walker);
  skin(root, "inset");
  return {
    root,
    paint(on) {
      mark(root, "is-paused", !on);
    },
  };
}

/** One engineer's row and her walk, built once for her name. */
interface EngineerRow {
  readonly row: BoardRow;
  readonly walk: ReturnType<typeof createWalk>;
}

/** Before or after, in the page's order. */
function byPlace(a: Node, b: Node): number {
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING
    ? -1
    : 1;
}

/**
 * Puts the shown rows in the crew's order, where the rows stand together in the list, the
 * hidden ones after them. Writes nothing while they are in order already.
 */
function orderRows(
  all: readonly HTMLElement[],
  shown: readonly HTMLElement[],
): void {
  const placed = all.filter((root) => root.parentNode !== null).sort(byPlace);
  const last = placed.at(-1);
  const now = placed.filter((root) => shown.includes(root));
  if (last === undefined || now.every((root, i) => root === shown[i])) {
    return;
  }
  // Each goes in before what follows the rows, so they end in this order.
  const parent = last.parentNode;
  const after = last.nextSibling;
  for (const root of [...shown, ...all.filter((one) => !shown.includes(one))]) {
    parent?.insertBefore(root, after);
  }
}

/** A row per named engineer, shown in the crew's order; a tap opens her page. */
export function createEngineerRows({
  onBoard,
  onOpen,
}: {
  onBoard: RowsOnBoard;
  onOpen: (name: string) => void;
}): {
  readonly roots: readonly HTMLElement[];
  /** The crew's views in its order; before the save is in, the rows are dark. */
  paint(views: readonly EngineerRowView[], ready: boolean): void;
  /** The walks go only while the drawer is open. */
  walk(on: boolean): void;
} {
  const rows = new Map<string, EngineerRow>(
    ENGINEER_NAMES.slice(0, MAX_ENGINEERS).map((name) => {
      const row = createBoardRow({
        tag: "button",
        className: "engineer-row",
        data: { engineer: name },
        name,
        icon: true,
      });
      row.setIcon(workerUrl);
      row.root.hidden = true;
      onBoard.tap(row.root as HTMLButtonElement, (press, event) => {
        if (onBoard.press(`engineer:${name}`, press, event, "act") === "act") {
          onOpen(name);
        }
      });
      return [name, { row, walk: createWalk() }];
    }),
  );
  const roots = [...rows.values()].map(({ row }) => row.root);
  return {
    roots,
    paint(views, ready) {
      for (const [name, { row, walk }] of rows) {
        const view = views.find((each) => each.name === name);
        hide(row.root, view === undefined);
        if (view === undefined) {
          continue;
        }
        row.setIconArt(view.out ? walk.root : undefined);
        onBoard.paint(`engineer:${name}`, row, ready ? view : undefined);
        mark(row.root, "teach-new", ready && view.flag.length > 0);
      }
      const shown = views.flatMap((view) => {
        const made = rows.get(view.name);
        return made === undefined ? [] : [made.row.root];
      });
      orderRows(roots, shown);
    },
    walk(on) {
      for (const { walk } of rows.values()) {
        walk.paint(on);
      }
    },
  };
}

/** A plate on an Engineers page, its press past the settle naming it. */
function pagePlate(
  board: BoardHost,
  trackers: PressTracker[],
  [label, className, control]: readonly [string, string, string],
  act: PlateAct,
): HTMLButtonElement {
  return drawerPlate(
    board,
    trackers,
    { label, className, control: { layer: "engineers", id: control } },
    act,
  );
}

/** The two plates under a page's rows, side by side. */
function platesRow(...plates: readonly HTMLElement[]): HTMLElement {
  const row = el("div", "engineer-page-plates");
  row.append(...plates);
  return row;
}

/** A row on a page: painted on the model, its press past the settle refused or acted on. */
function pageRow(
  onBoard: RowsOnBoard,
  options: {
    className: string;
    data: Readonly<Record<string, string>>;
    icon: boolean;
    id: string;
  },
  onAct: () => void,
): { readonly row: BoardRow; paint(view: RowView | undefined): void } {
  const row = createBoardRow({ tag: "button", name: "", ...options });
  let painted: RowView | undefined;
  onBoard.tap(row.root as HTMLButtonElement, (press, event) => {
    if (onBoard.press(options.id, press, event, "act") !== "act") {
      return;
    }
    if (painted?.can === false) {
      onBoard.result(options.id, "refused");
      return;
    }
    onAct();
  });
  return {
    row,
    paint(view) {
      painted = view;
      onBoard.paint(options.id, row, view);
    },
  };
}

/** The left plate's words: the first option that fits, and the full words for a reader. */
function paintLeft(plate: HTMLButtonElement, label: readonly string[]): void {
  const text =
    plate.querySelector<HTMLElement>(".board-platebtn-text") ?? plate;
  fitFirst(text, label);
  setAttr(plate, "aria-label", label[0] ?? "");
}

/** Her plates now: Send exploring or Call her back on the left, the way back on the right. */
function paintPlates(
  plates: {
    readonly explore: HTMLButtonElement;
    readonly recall: HTMLButtonElement;
    readonly back: HTMLButtonElement;
  },
  view: HerPlates | undefined,
): void {
  const out = view?.left.id === "recall";
  hide(plates.explore, out);
  hide(plates.recall, !out);
  const left = out ? plates.recall : plates.explore;
  if (view !== undefined) {
    paintLeft(left, view.left.label);
  }
  mark(plates.explore, "teach-new", view?.left.newCard ?? false);
  for (const plate of Object.values(plates)) {
    plate.disabled = view === undefined;
  }
}

/** Her page: the five posts with their machines, then Send exploring or Call her back, and the way back. */
export function createPostsPage({
  board,
  onBoard,
  onPost,
  onPlate,
}: {
  board: BoardHost;
  onBoard: RowsOnBoard;
  onPost: (post: TendPost) => void;
  onPlate: OnPlate;
}): {
  readonly root: HTMLElement;
  /** The posts in TEND_POSTS' order and her plates; undefined until the save is in. */
  paint(
    views: readonly RowView[] | undefined,
    plates: HerPlates | undefined,
  ): void;
  /** The page moved on: no plate's finger-down time carries over. */
  forget(): void;
} {
  const root = el("div", "board-page engineer-page");
  const posts = TEND_POSTS.map((post) => {
    const made = pageRow(
      onBoard,
      {
        className: "engineer-post",
        data: { post },
        icon: true,
        id: `post:${post}`,
      },
      () => {
        onPost(post);
      },
    );
    made.row.setIcon(POST_ART[post]);
    root.append(made.row.root);
    return made;
  });
  const trackers: PressTracker[] = [];
  const plate = (label: string, className: string, id: PlateId) =>
    pagePlate(
      board,
      trackers,
      [label, className, id === "back" ? LIST_BACK : id],
      (_plate, by) => {
        onPlate(id, by);
      },
    );
  const plates = {
    explore: plate(SEND_EXPLORING, "engineer-explore", "explore"),
    recall: plate(CALL_BACK, "engineer-recall", "recall"),
    back: plate(ENGINEERS_BACK, "engineer-list-back", "back"),
  };
  root.append(platesRow(plates.explore, plates.recall, plates.back));
  return {
    root,
    paint(views, herPlates) {
      for (const [index, made] of posts.entries()) {
        const view = views?.[index];
        made.paint(view);
        setAttr(
          made.row.root,
          "aria-pressed",
          view?.state === "owned" ? "true" : "false",
        );
      }
      paintPlates(plates, herPlates);
    },
    forget: forgetAll(trackers),
  };
}

/** The tunnels page: three tunnels, then Tend a machine and the way back. */
export function createTunnelsPage({
  board,
  onBoard,
  onTunnel,
  onPlate,
}: {
  board: BoardHost;
  onBoard: RowsOnBoard;
  onTunnel: (tunnel: TunnelId) => void;
  onPlate: OnPlate;
}): {
  readonly root: HTMLElement;
  /** The tunnels in TUNNELS' order; undefined until the save is in. */
  paint(views: readonly RowView[] | undefined): void;
  forget(): void;
} {
  const root = el("div", "board-page engineer-tunnels-page");
  const tunnels = TUNNELS.map(({ id }) => {
    const made = pageRow(
      onBoard,
      {
        className: "engineer-tunnel-row",
        data: { tunnel: id },
        icon: false,
        id: `tunnel:${id}`,
      },
      () => {
        onTunnel(id);
      },
    );
    root.append(made.row.root);
    return made;
  });
  const trackers: PressTracker[] = [];
  const tend = pagePlate(
    board,
    trackers,
    [TEND_MACHINE, "engineer-tend", "tend"],
    (_plate, by) => {
      onPlate("tend", by);
    },
  );
  const back = pagePlate(
    board,
    trackers,
    [ENGINEERS_BACK, "engineer-list-back", LIST_BACK],
    (_plate, by) => {
      onPlate("back", by);
    },
  );
  root.append(platesRow(tend, back));
  return {
    root,
    paint(views) {
      for (const [index, made] of tunnels.entries()) {
        made.paint(views?.[index]);
      }
      tend.disabled = views === undefined;
      back.disabled = views === undefined;
    },
    forget: forgetAll(trackers),
  };
}

/** Brought home: each keepsake's story at reading size, and the way back. */
export function createBroughtPage({
  board,
  onBack,
}: {
  board: BoardHost;
  onBack: (by: Pointer) => void;
}): {
  readonly root: HTMLElement;
  paint(stories: readonly string[]): void;
  forget(): void;
} {
  const root = el("div", "board-page engineer-brought-page");
  const title = el("h3", "board-page-title", BROUGHT_HOME);
  title.id = "engineer-brought-page-title";
  setAttr(root, "role", "group");
  setAttr(root, "aria-labelledby", title.id);
  const lines = KEEPSAKES.map(() => {
    const line = el("p", "engineer-brought-story");
    line.hidden = true;
    return line;
  });
  const trackers: PressTracker[] = [];
  const back = pagePlate(
    board,
    trackers,
    [ENGINEERS_BACK, "engineer-list-back", LIST_BACK],
    (_plate, by) => {
      onBack(by);
    },
  );
  root.append(title, ...lines, back);
  skin(root, "frame");
  return {
    root,
    paint(stories) {
      for (const [index, line] of lines.entries()) {
        const story = stories[index] ?? "";
        write(line, story);
        hide(line, story === "");
      }
    },
    forget: forgetAll(trackers),
  };
}

/** The expedition chips in the Running now note: one per trip, its engineer and its clock. */
export function createExpeditionChips(
  host: HTMLElement,
  iconUrl: string,
): { paint(mountain: Mountain, now: number): void } {
  const chips = Array.from({ length: MAX_ENGINEERS }, () => {
    const chip = createEffectChip("expedition-chip", iconUrl);
    host.append(chip);
    return chip;
  });
  return {
    paint(mountain, now) {
      const trips = mountain.expeditions ?? [];
      for (const [index, chip] of chips.entries()) {
        const trip = trips[index];
        if (trip === undefined) {
          writeChip(chip, { short: "", full: "", leftMs: 0, active: false });
          continue;
        }
        const left = trip.returnsAt - now;
        writeChip(chip, {
          short: trip.engineer,
          full: expeditionChip(trip.engineer, left),
          leftMs: left,
          active: true,
        });
      }
    },
  };
}
