import {
  el,
  fitFirst,
  fitsBox,
  frameX,
  hide,
  mark,
  refitAll,
  setAttr,
  write,
  writeFigures,
} from "./board-dom";
import type { BoardHost } from "./board-host";
import {
  controlKey,
  type DrawerId,
  type PressDecision,
} from "./board-interaction";
import { skin } from "./board-skin";
import { buyOnTap, type CardPress } from "./card-tap";
import { onFontsSettled } from "./fit-cache";
import type { RowLamp, RowState, RowView } from "./row-view";

/*
 * One drawer row (#373): lamp, icon, name with its badge and flag, info, needs and why, then
 * the gain, the price tag and the verb. buys-rows.ts and upgrade-rows.ts decide what a row says;
 * the board's model decides when it holds Done and blinks. This draws both, writing only what
 * changed.
 */

/** What the board's model shows on a row now: Done while it holds, and the blink's frame. */
export interface RowLive {
  readonly held: boolean;
  readonly blink: "red" | "off" | undefined;
}

export interface BoardRow {
  readonly root: HTMLElement;
  setIcon(url: string | undefined): void;
  /**
   * A part in the icon cell in the img's place (#455: the walk home), or the img back for
   * undefined. Only on a row built with an icon.
   */
  setIconArt(part: HTMLElement | undefined): void;
  /**
   * An undefined view, until the save is in, shows the name and icon only, dark and disabled,
   * whatever the model holds. Done keeps the row's words as they were but for info and gain.
   */
  render(view: RowView | undefined, live: RowLive): void;
}

/** One lamp frame in CSS px: 20 art px at 2 px each. */
export const LAMP_PX = 40;
export const LAMP_FRAME: Readonly<Record<RowLamp, number>> = {
  off: 0,
  amber: 1,
  green: 2,
  red: 3,
};
const STATE_CLASS: Readonly<Record<RowState, string>> = {
  ready: "is-ready",
  short: "is-short",
  dear: "is-dear",
  locked: "is-locked",
  trouble: "is-trouble",
  running: "is-running",
  owned: "is-owned",
  found: "is-found",
};
const DONE = "Done";
/** An icon's CSS px: 32 art px (a machine), 24 (a relic) or 16 (a small icon), at 2 px each. */
type IconPx = 32 | 48 | 64;
/** The row bar's length in art px: the row's middle and right columns (board.css). */
const BAR_ART = 156;

/** Text that hides its box when empty. */
function line(target: HTMLElement, text: string): void {
  write(target, text);
  hide(target, text === "");
}

/** A row's parts, built once. */
interface RowParts {
  readonly root: HTMLElement;
  readonly button: HTMLButtonElement | undefined;
  readonly lamp: HTMLElement;
  readonly img: HTMLImageElement | undefined;
  readonly nameText: Text;
  readonly badge: HTMLElement;
  readonly info: HTMLElement;
  readonly need: HTMLElement;
  readonly why: HTMLElement;
  readonly flag: HTMLElement;
  readonly gain: HTMLElement;
  readonly tagBox: HTMLElement;
  readonly price: HTMLElement;
  readonly verb: HTMLElement;
}

interface RowOptions {
  tag: "button" | "div";
  className: string;
  data: Readonly<Record<string, string>>;
  name: string;
  icon: boolean;
  /** The icon's CSS px, centred in the 64 column; 64 when left out. */
  iconPx?: IconPx;
  /** How a line is measured; undefined is board-dom's `fitsWidth`. */
  fits?: (box: HTMLElement) => boolean;
}

/** The icon, hidden until its art is set. */
function rowIcon(px: IconPx): HTMLImageElement {
  const img = el("img", "board-row-icon");
  img.alt = "";
  img.width = px;
  img.height = px;
  img.draggable = false;
  img.hidden = true;
  return img;
}

/**
 * The root is `${tag}.board-row.${className}` with the `data-*` set and a frame skin.
 */
function buildRowParts({
  tag,
  className,
  data,
  name,
  icon,
  iconPx = 64,
}: RowOptions): RowParts {
  const root = el(tag, `board-row ${className}`);
  if (root instanceof HTMLButtonElement) {
    root.type = "button";
  }
  mark(root, "no-icon", !icon);
  mark(root, `is-icon-${String(iconPx)}`, icon);
  for (const [key, value] of Object.entries(data)) {
    root.dataset[key] = value;
  }

  const lamp = el("i", "board-lamp");
  lamp.setAttribute("aria-hidden", "true");
  const img = icon ? rowIcon(iconPx) : undefined;

  const mid = el("span", "board-row-mid");
  const nameBox = el("span", "board-row-name");
  const nameText = document.createTextNode(name);
  const badge = el("span", "board-row-badge board-lg");
  nameBox.append(nameText, badge);
  const info = el("span", "board-row-info");
  const need = el("span", "board-row-need");
  const why = el("span", "board-row-why");
  const flag = el("span", "board-row-flag board-lg");
  // The flag shares the name's line: four lines (name, info, need or why, flag) would run onto
  // the frame's rails, so a row has three at most (#373).
  const nameLine = el("span", "board-row-line");
  nameLine.append(nameBox, flag);
  mid.append(nameLine, info, need, why);

  const rt = el("span", "board-row-rt");
  const gain = el("span", "board-row-gain board-num");
  const tagBox = el("span", "board-row-tag board-num");
  skin(tagBox, "tag");
  const price = el("span", "board-row-price board-num");
  tagBox.append(price);
  const verb = el("span", "board-row-verb");
  rt.append(gain, tagBox, verb);

  root.append(lamp, ...(img === undefined ? [] : [img]), mid, rt);
  skin(root, "frame");
  return {
    root,
    button: root instanceof HTMLButtonElement ? root : undefined,
    lamp,
    img,
    nameText,
    badge,
    info,
    need,
    why,
    flag,
    gain,
    tagBox,
    price,
    verb,
  };
}

type Fits = ((box: HTMLElement) => boolean) | undefined;

/**
 * A line fitted to the first option that fits; hidden when every option is empty. `put` writes
 * an option (the info line's figures, #506).
 */
function fitLine(
  target: HTMLElement,
  options: readonly string[],
  fits: Fits,
  put?: (target: HTMLElement, text: string) => void,
): void {
  const empty = options.every((option) => option === "");
  // Shown before fitting, so a kept fit is measured on a laid-out box.
  hide(target, empty);
  fitFirst(target, empty ? [] : options, fits, put);
}

/**
 * The info line, with its figures (#506). A row has three lines at most, so the info takes two
 * when no need and no why is shown under it. A change of room fits the same words again.
 */
function fitInfo(
  parts: RowParts,
  options: readonly string[],
  fits: Fits,
): void {
  const { info, need, why } = parts;
  const roomy = need.hidden !== false && why.hidden !== false;
  if (info.classList.contains("is-roomy") !== roomy) {
    info.classList.toggle("is-roomy", roomy);
    refitAll(info);
  }
  fitLine(info, options, fits ?? fitsBox, writeFigures);
}

function setLabel(parts: RowParts, label: string): void {
  if (parts.button !== undefined) {
    setAttr(parts.button, "aria-label", label);
  }
}

/** Done: the flag, the verb and the label; the lamp is painted apart. */
function paintDone(parts: RowParts, fits: Fits): void {
  mark(parts.root, "is-held", true);
  fitLine(parts.flag, [DONE], fits);
  line(parts.verb, DONE);
  setLabel(parts, `${parts.nameText.data}. ${DONE}`);
}

/** Everything the view says but info and gain. */
function paintWords(
  parts: RowParts,
  view: RowView | undefined,
  name: string,
  fits: Fits,
): void {
  const { root, button, nameText, badge, need, why, flag, price, tagBox } =
    parts;
  mark(root, "is-held", false);
  if (button !== undefined && button.disabled !== (view === undefined)) {
    button.disabled = view === undefined;
  }
  const shownName = view?.name ?? name;
  if (nameText.data !== shownName) {
    nameText.data = shownName;
  }
  line(badge, view?.badge ?? "");
  line(need, view?.need ?? "");
  line(why, view?.why ?? "");
  fitLine(flag, view?.flag ?? [], fits);
  const priced = view?.price ?? "";
  write(price, priced);
  hide(tagBox, priced === "");
  line(parts.verb, view?.verb ?? "");
  for (const [state, cls] of Object.entries(STATE_CLASS)) {
    mark(root, cls, view?.state === state);
  }
  // The lamp leads: only an amber row is the pick (#509).
  mark(
    root,
    "is-pick",
    view !== undefined && view.pick && view.lamp === "amber",
  );
  mark(root, "is-can", view?.can ?? false);
  mark(root, "is-dim-tag", view?.dimTag ?? false);
  setLabel(parts, view?.aria ?? name);
}

/**
 * Paints the row from its view and the model. Until the save is in, the model shows nothing:
 * its holds and blinks speak of a save that may not land. A Done hold updates info and gain
 * alone, so a second sleepy tap meets the row it bought.
 */
function paintRow(
  parts: RowParts,
  view: RowView | undefined,
  live: RowLive,
  name: string,
  fits: Fits,
): void {
  const held = view !== undefined && live.held;
  const blink = view === undefined ? undefined : live.blink;
  if (held) {
    paintDone(parts, fits);
  } else {
    paintWords(parts, view, name, fits);
  }
  // After the words: the info line's room is what the row shows under it.
  fitInfo(parts, view?.info ?? [], fits);
  line(parts.gain, view?.gain ?? "");
  const lamp: RowLamp = blink ?? (held ? "green" : (view?.lamp ?? "off"));
  frameX(parts.lamp, LAMP_FRAME[lamp], LAMP_PX);
}

const STILL: RowLive = { held: false, blink: undefined };

/** The icon cell's part: `part` in the img's place, or the img back for none. */
function iconArt(
  img: HTMLImageElement | undefined,
  shown: HTMLElement | undefined,
  part: HTMLElement | undefined,
): HTMLElement | undefined {
  if (img === undefined || part === shown) {
    return shown;
  }
  (shown ?? img).replaceWith(part ?? img);
  return part;
}

/** A drawer row, built once and reused. Before the first render it shows the name and icon only. */
export function createBoardRow(options: RowOptions): BoardRow {
  const parts = buildRowParts(options);
  let art: HTMLElement | undefined;
  let last: RowView | undefined;
  let lastLive = STILL;

  const render = (view: RowView | undefined, live: RowLive): void => {
    last = view;
    lastLive = live;
    paintRow(parts, view, live, options.name, options.fits);
  };

  // Lines fitted with fallback metrics may not fit in the board's own fonts.
  onFontsSettled(() => {
    refitAll(parts.root);
    render(last, lastLive);
  });

  render(undefined, STILL);
  return {
    root: parts.root,
    setIcon: (url) => {
      const { img } = parts;
      if (img === undefined) {
        return;
      }
      if (url !== undefined) {
        setAttr(img, "src", url);
      }
      hide(img, url === undefined);
    },
    setIconArt: (part) => {
      art = iconArt(parts.img, art, part);
    },
    render,
  };
}

/** The bar at a row's foot, under its middle and right columns: hidden until it has progress. */
export function rowBar(): {
  readonly bar: HTMLElement;
  readonly fill: HTMLElement;
} {
  const bar = el("i", "board-row-bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", "100");
  bar.hidden = true;
  const fill = el("span", "board-row-bar-fill");
  bar.append(fill);
  return { bar, fill };
}

/**
 * Paints the bar at `progress` (0..1) in whole art px, with no transition, or hides it for
 * none. Writes only what changed.
 */
export function paintRowBar(
  bar: HTMLElement,
  fill: HTMLElement,
  progress: number | undefined,
  label: string,
): void {
  hide(bar, progress === undefined);
  if (progress === undefined) {
    return;
  }
  setAttr(bar, "aria-valuenow", String(Math.round(progress * 100)));
  setAttr(bar, "aria-label", label);
  const art = String(Math.round(progress * BAR_ART));
  if (fill.style.getPropertyValue("--fill") !== art) {
    fill.style.setProperty("--fill", art);
  }
}

/** A drawer's rows on the board's model: their taps, what those led to, and their Done and blink. */
export interface RowsOnBoard {
  /** Paints the row from this view now, and again from it whenever the model's Done or blink changes. */
  paint(id: string, row: BoardRow, view: RowView | undefined): void;
  /**
   * Wires the row's taps: `act` hears each one with how it came and its click. The tracker is
   * kept, so `forget` reaches it.
   */
  tap(
    button: HTMLButtonElement,
    act: (press: CardPress, event: MouseEvent) => void,
  ): void;
  /** Takes a tap through the model; the row acts only on "act". */
  press(
    id: string,
    press: CardPress,
    event: Event,
    intent: "act" | "trouble",
  ): PressDecision;
  /** What an act led to: a buy landed, a dear tap was refused, or a trouble fixed. */
  result(id: string, outcome: "applied" | "refused" | "fixed"): void;
  /** The drawer moved on: no row's finger-down time carries over. */
  forget(): void;
}

/** The rows of one drawer, on one host. It subscribes once, for every row it paints. */
export function rowsOnBoard(board: BoardHost, layer: DrawerId): RowsOnBoard {
  const painted = new Map<
    string,
    { row: BoardRow; view: RowView | undefined; live: RowLive }
  >();
  const trackers: { forget(): void }[] = [];
  const liveOf = (id: string, view = board.view()): RowLive => {
    const key = controlKey({ layer, id });
    return { held: view.held.has(key), blink: view.blinking.get(key) };
  };
  // Only a row whose Done or blink changed is painted again.
  board.subscribe(() => {
    const view = board.view();
    for (const [id, each] of painted) {
      const live = liveOf(id, view);
      if (live.held !== each.live.held || live.blink !== each.live.blink) {
        each.live = live;
        each.row.render(each.view, live);
      }
    }
  });
  return {
    paint(id, row, view) {
      const live = liveOf(id);
      painted.set(id, { row, view, live });
      row.render(view, live);
    },
    tap(button, act) {
      trackers.push(
        buyOnTap(button, button, act, {
          clock: board.clock,
          pressAge: board.pressAge,
        }),
      );
    },
    press: (id, { by, downAt }, event, intent) =>
      board.press({ control: { layer, id }, by, intent, downAt, event }),
    result(id, outcome) {
      board.send({
        kind: "result",
        control: { layer, id },
        at: board.clock(),
        outcome,
      });
    },
    forget() {
      for (const tracker of trackers) {
        tracker.forget();
      }
    },
  };
}
