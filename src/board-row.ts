import { el, fitFirst, frameX, refitAll, setAttr, write } from "./board-dom";
import { BLINK_STEP_MS, READY_HOLD_MS } from "./board-interaction";
import { skin } from "./board-skin";
import { onFontsSettled } from "./fit-cache";
import { reducedMotion } from "./float-text";
import type { RowLamp, RowState, RowView } from "./row-view";

/*
 * One drawer row (#373): lamp, icon, name with its badge and flag, info, needs and why, then
 * the gain, the price tag and the verb. buys-rows.ts and upgrade-rows.ts decide what a row says;
 * this draws it, writing only what changed. The drawers own the taps: after a buy they call
 * done(), which holds Done for 1.9s, and a tap that cannot act calls blink().
 */

/** How long Done holds after a buy: a second sleepy tap in it buys nothing. */
export const ROW_HOLD_MS = READY_HOLD_MS;
export { BLINK_STEP_MS } from "./board-interaction";

export interface BoardRow {
  readonly root: HTMLElement;
  setIcon(url: string | undefined): void;
  /** Undefined until the save is in: the name and icon only, dark and disabled. */
  render(view: RowView | undefined): void;
  done(): void;
  /** Done, or a running Done hold started again: a later act that needs its own 1.9s. */
  hold(): void;
  holding(): boolean;
  blink(): void;
}

/** One lamp frame in CSS px: 20 art px at 2 px each. */
const LAMP_PX = 40;
const LAMP_FRAME: Readonly<Record<RowLamp, number>> = {
  off: 0,
  amber: 1,
  green: 2,
  red: 3,
};
const BLINK: readonly RowLamp[] = ["red", "off", "red", "off"];
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
/** One art px is 2 CSS px: the icon is 32 art px square. */
const ICON_PX = "64";

function toggle(target: HTMLElement, name: string, on: boolean): void {
  if (target.classList.contains(name) !== on) {
    target.classList.toggle(name, on);
  }
}

function hide(target: HTMLElement, hidden: boolean): void {
  if (target.hidden !== hidden) {
    target.hidden = hidden;
  }
}

/** Text that hides its box when empty. */
function line(target: HTMLElement, text: string): void {
  write(target, text);
  hide(target, text === "");
}

/**
 * A drawer row, built once and reused. The root is `${tag}.board-row.${className}` with the
 * `data-*` set and a frame skin. Before the first render it shows the name and icon only.
 */
export function createBoardRow({
  tag,
  className,
  data,
  name,
  icon,
  fits,
}: {
  tag: "button" | "div";
  className: string;
  data: Readonly<Record<string, string>>;
  name: string;
  icon: boolean;
  /** How a line is measured; undefined is board-dom's `fitsWidth`. */
  fits?: (box: HTMLElement) => boolean;
}): BoardRow {
  const root = el(tag, `board-row ${className}`);
  if (root instanceof HTMLButtonElement) {
    root.type = "button";
  }
  if (!icon) {
    root.classList.add("no-icon");
  }
  for (const [key, value] of Object.entries(data)) {
    root.dataset[key] = value;
  }
  const button = root instanceof HTMLButtonElement ? root : undefined;

  const lamp = el("i", "board-lamp");
  lamp.setAttribute("aria-hidden", "true");
  const img = icon ? el("img", "board-row-icon") : undefined;
  if (img !== undefined) {
    img.alt = "";
    img.width = Number(ICON_PX);
    img.height = Number(ICON_PX);
    img.draggable = false;
    img.hidden = true;
  }

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

  /** The view last given; undefined until the save is in. */
  let last: RowView | undefined;
  let held = false;
  let holdTimer: ReturnType<typeof setTimeout> | undefined;
  /** The blink's frame while one runs. */
  let blinkFrame: RowLamp | undefined;
  let blinkTimer: ReturnType<typeof setTimeout> | undefined;

  const writeName = (text: string): void => {
    if (nameText.data !== text) {
      nameText.data = text;
    }
  };

  const fitLine = (target: HTMLElement, options: readonly string[]): void => {
    const empty = options.every((option) => option === "");
    // Shown before fitting, so a kept fit is measured on a laid-out box.
    hide(target, empty);
    fitFirst(target, empty ? [] : options, fits);
  };

  const paintLamp = (): void => {
    const shown: RowLamp =
      blinkFrame ?? (held ? "green" : (last?.lamp ?? "off"));
    frameX(lamp, LAMP_FRAME[shown], LAMP_PX);
  };

  const setLabel = (label: string): void => {
    if (button !== undefined) {
      setAttr(button, "aria-label", label);
    }
  };

  const setDisabled = (disabled: boolean): void => {
    if (button !== undefined && button.disabled !== disabled) {
      button.disabled = disabled;
    }
  };

  /** The parts a render updates during a Done hold: info and gain. */
  const paintLive = (view: RowView | undefined): void => {
    fitLine(info, view?.info ?? []);
    line(gain, view?.gain ?? "");
  };

  const paintHeld = (): void => {
    toggle(root, "is-held", true);
    fitLine(flag, [DONE]);
    line(verb, DONE);
    paintLamp();
    setLabel(`${nameText.data}. ${DONE}`);
  };

  const paint = (): void => {
    toggle(root, "is-held", false);
    const view = last;
    setDisabled(view === undefined);
    writeName(view?.name ?? name);
    line(badge, view?.badge ?? "");
    paintLive(view);
    line(need, view?.need ?? "");
    line(why, view?.why ?? "");
    fitLine(flag, view?.flag ?? []);
    const priced = view?.price ?? "";
    write(price, priced);
    hide(tagBox, priced === "");
    line(verb, view?.verb ?? "");
    for (const [state, cls] of Object.entries(STATE_CLASS)) {
      toggle(root, cls, view?.state === state);
    }
    // A guided row can be the pick while it lights green under its New flag: the lamp leads.
    toggle(
      root,
      "is-pick",
      view !== undefined && view.pick && view.lamp === "amber",
    );
    toggle(root, "is-can", view?.can ?? false);
    toggle(root, "is-dim-tag", view?.dimTag ?? false);
    paintLamp();
    setLabel(view?.aria ?? name);
  };

  const letGo = (): void => {
    held = false;
    if (holdTimer !== undefined) {
      clearTimeout(holdTimer);
      holdTimer = undefined;
    }
  };

  const stopBlink = (): void => {
    blinkFrame = undefined;
    if (blinkTimer !== undefined) {
      clearTimeout(blinkTimer);
      blinkTimer = undefined;
    }
  };

  const render = (view: RowView | undefined): void => {
    last = view;
    // A save loading again ends a Done hold and a blink: they speak of a save that may not land.
    if (view === undefined) {
      letGo();
      stopBlink();
    }
    if (held) {
      paintLive(view);
      return;
    }
    paint();
  };

  const armHold = (): void => {
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => {
      holdTimer = undefined;
      held = false;
      paint();
    }, ROW_HOLD_MS);
  };

  const done = (): void => {
    // A second sleepy tap inside the hold must not stretch it.
    if (held) {
      return;
    }
    stopBlink();
    held = true;
    // Armed before painting: a paint that throws never leaves the row held.
    armHold();
    paintHeld();
  };

  const hold = (): void => {
    if (!held) {
      done();
      return;
    }
    armHold();
  };

  const blink = (): void => {
    if (blinkTimer !== undefined || reducedMotion()) {
      return;
    }
    const step = (i: number): void => {
      blinkFrame = BLINK[i];
      // Armed before painting: a paint that throws never strands a blink frame.
      blinkTimer = setTimeout(() => {
        if (i + 1 < BLINK.length) {
          step(i + 1);
          return;
        }
        stopBlink();
        paintLamp();
      }, BLINK_STEP_MS);
      paintLamp();
    };
    step(0);
  };

  const setIcon = (url: string | undefined): void => {
    if (img === undefined) {
      return;
    }
    if (url !== undefined) {
      setAttr(img, "src", url);
    }
    hide(img, url === undefined);
  };

  // Lines fitted with fallback metrics may not fit in the board's own fonts. A Done hold keeps
  // its flag; the paint after it fits again.
  onFontsSettled(() => {
    refitAll(root);
    if (held) {
      paintLive(last);
      fitLine(flag, [DONE]);
      return;
    }
    paint();
  });

  paint();
  return {
    root,
    setIcon,
    render,
    done,
    hold,
    holding: () => held,
    blink,
  };
}
