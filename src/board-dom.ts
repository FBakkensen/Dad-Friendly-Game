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

const defaultFits = (box: HTMLElement): boolean =>
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
  fits: (box: HTMLElement) => boolean = defaultFits,
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
