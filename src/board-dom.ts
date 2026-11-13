import { measurable } from "./fit-cache";

/*
 * The board's small DOM helpers (#372, #373): build an element once, write text, attributes and
 * sprite frames only when they change, and fit a line from its options, longest first, keeping
 * the fit so the same words measure nothing next frame.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  if (text !== undefined) {
    made.textContent = text;
  }
  return made;
}

/** Text that is written only when it changes. */
export function write(target: HTMLElement, text: string): void {
  if (target.textContent !== text) {
    target.textContent = text;
  }
}

/**
 * A figure in a line: a count, a rate, a pace, a percent or a time, such as `+28/s`, `1,207`,
 * `×2`, `1.5×`, `574.3M`, `12.3 thousand`, `37.5%`, `8:58` and `1h`. A full stop after it is
 * the sentence's, not the figure's.
 */
const FIGURE =
  /[+×>]?\d+(?:[.,:]\d+)*(?:[KMBT]\b|[hmds]\b|\+? (?:thousand|million|billion|trillion)\b)?[%×]?(?:\/s)?/g;
const LETTER = /[A-Za-z]/;

/** Digits inside a word (an account's name, `x2`) are not a figure. */
function inWord(text: string, from: number, to: number): boolean {
  return LETTER.test(text[from - 1] ?? "") || LETTER.test(text[to] ?? "");
}

/** A line cut into its figures and the words between them, in order. */
export function figureRuns(
  text: string,
): readonly { readonly text: string; readonly figure: boolean }[] {
  const runs: { text: string; figure: boolean }[] = [];
  let at = 0;
  for (const found of text.matchAll(FIGURE)) {
    const end = found.index + found[0].length;
    if (inWord(text, found.index, end)) {
      continue;
    }
    if (found.index > at) {
      runs.push({ text: text.slice(at, found.index), figure: false });
    }
    runs.push({ text: found[0], figure: true });
    at = end;
  }
  if (at < text.length) {
    runs.push({ text: text.slice(at), figure: false });
  }
  return runs;
}

/**
 * `write` for a line whose numbers lead (#506): each figure goes in a `b.board-fig`, bright and
 * bold, and the words between stay quiet. The line's text is the same. Written only when the
 * words change, or when they were last written plain.
 */
export function writeFigures(target: HTMLElement, text: string): void {
  const runs = figureRuns(text);
  const figures = runs.filter((run) => run.figure).length;
  if (
    target.textContent === text &&
    target.querySelectorAll("b.board-fig").length === figures
  ) {
    return;
  }
  target.replaceChildren(
    ...runs.map((run) =>
      run.figure ? el("b", "board-fig", run.text) : run.text,
    ),
  );
}

/** A box hidden or shown, written only when it changes. */
export function hide(target: HTMLElement, hidden: boolean): void {
  if (target.hidden !== hidden) {
    target.hidden = hidden;
  }
}

/** A class switched on or off, written only when it changes. */
export function mark(target: HTMLElement, name: string, on: boolean): void {
  if (target.classList.contains(name) !== on) {
    target.classList.toggle(name, on);
  }
}

/**
 * Plays a class's CSS animation from its start, on an element that may still be mid-way
 * through it: off, a reflow, and on again.
 */
export function replay(target: HTMLElement, name: string): void {
  target.classList.remove(name);
  void target.offsetWidth;
  target.classList.add(name);
}

/** A section's legend: its name, engraved, and the column's name at the right. */
export function legend(
  name: string,
  key: string,
  column?: string,
): HTMLElement {
  const sec = el("div", "board-sec");
  sec.dataset["sec"] = key;
  sec.append(el("span", "board-lg", name));
  if (column !== undefined) {
    sec.append(el("span", "board-lg", column));
  }
  return sec;
}

/** An attribute written only when it changes; undefined removes it. */
export function setAttr(
  target: HTMLElement,
  name: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    if (target.hasAttribute(name)) {
      target.removeAttribute(name);
    }
  } else if (target.getAttribute(name) !== value) {
    target.setAttribute(name, value);
  }
}

/** A sprite strip's frame `n`, written only when it changes. */
export function frameX(target: HTMLElement, n: number, framePx: number): void {
  const next = `${String(-n * framePx)}px`;
  if (target.style.backgroundPositionX !== next) {
    target.style.backgroundPositionX = next;
  }
}

/** The default fit check: the line's text is no wider than its box. */
export const fitsWidth = (box: HTMLElement): boolean =>
  box.scrollWidth <= box.clientWidth + 1;

/** A line that may wrap: no wider than its box, and no taller. */
export const fitsBox = (box: HTMLElement): boolean =>
  fitsWidth(box) && box.scrollHeight <= box.clientHeight + 1;

/** The options last fitted into each box, kept only when measured on the page with a width. */
const fitted = new WeakMap<HTMLElement, string>();

/**
 * Writes the first option that fits, else the last ("" for none). The same options again on a
 * box measured while laid out measure nothing. `put` writes an option, so a line is measured
 * as it is drawn (`writeFigures`).
 */
export function fitFirst(
  target: HTMLElement,
  options: readonly string[],
  fits: (box: HTMLElement) => boolean = fitsWidth,
  put: (target: HTMLElement, text: string) => void = write,
): void {
  fitKept(target, options.join("\n"), () => {
    let chosen = options[options.length - 1] ?? "";
    for (const option of options) {
      put(target, option);
      if (fits(target)) {
        chosen = option;
        break;
      }
    }
    put(target, chosen);
  });
}

/**
 * Runs `fit` on `target` unless it last ran for the same `key` measured while laid out; a
 * refit (refitAll) measures again. fitFirst's cache, for a fit that is not a choice of words.
 */
export function fitKept(
  target: HTMLElement,
  key: string,
  fit: () => void,
): void {
  if (fitted.get(target) === key) {
    return;
  }
  fitted.delete(target);
  fit();
  if (measurable(target)) {
    fitted.set(target, key);
  }
}

/** Drops every kept fit on `root` and under it, so the next fit measures again. */
export function refitAll(root: HTMLElement): void {
  fitted.delete(root);
  for (const box of root.querySelectorAll<HTMLElement>("*")) {
    fitted.delete(box);
  }
}

/**
 * Brings `item` into `list`'s view by scrolling the list alone, as `block: "nearest"` would.
 * A drawer's list sits in the board's clip, which must never scroll: the browser's own
 * scrollIntoView scrolls every ancestor, the clip included, while the drawer still slides (#373).
 */
export function scrollIntoList(list: HTMLElement, item: HTMLElement): void {
  const port = list.getBoundingClientRect();
  const box = item.getBoundingClientRect();
  if (box.bottom > port.bottom) {
    list.scrollTop += box.bottom - port.bottom;
  } else if (box.top < port.top) {
    list.scrollTop -= port.top - box.top;
  }
}
