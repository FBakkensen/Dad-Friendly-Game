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

/** The options last fitted into each box, kept only when measured on the page with a width. */
const fitted = new WeakMap<HTMLElement, string>();

/**
 * Writes the first option that fits, else the last ("" for none). The same options again on a
 * box measured while laid out measure nothing.
 */
export function fitFirst(
  target: HTMLElement,
  options: readonly string[],
  fits: (box: HTMLElement) => boolean = fitsWidth,
): void {
  const key = options.join("\n");
  if (fitted.get(target) === key) {
    return;
  }
  fitted.delete(target);
  let chosen = options[options.length - 1] ?? "";
  for (const option of options) {
    write(target, option);
    if (fits(target)) {
      chosen = option;
      break;
    }
  }
  write(target, chosen);
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
