// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { el, fitFirst, frameX, refitAll, setAttr, write } from "./board-dom";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

/** Fits up to `n` characters. */
const upTo =
  (n: number) =>
  (box: HTMLElement): boolean =>
    box.textContent.length <= n;

/** A box on the page with a width, so a fit measured in it is kept. */
const laidOut = (): HTMLElement => {
  const box = el("span", "box");
  document.body.append(box);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(120);
  return box;
};

const OPTIONS = ["Long words that do not fit", "Shorter words", "Short"];

describe("board-dom", () => {
  it("builds an element with its class and words", () => {
    const made = el("span", "a b", "Hi");
    expect(made.tagName).toBe("SPAN");
    expect(made.className).toBe("a b");
    expect(made.textContent).toBe("Hi");
    expect(el("i", "c").textContent).toBe("");
  });

  it("writes text, attributes and frames only when they change", () => {
    const box = el("i", "box");
    write(box, "one");
    const node = box.firstChild;
    write(box, "one");
    expect(box.firstChild).toBe(node);
    setAttr(box, "aria-label", "x");
    expect(box.getAttribute("aria-label")).toBe("x");
    setAttr(box, "aria-label", undefined);
    expect(box.hasAttribute("aria-label")).toBe(false);
    frameX(box, 3, 40);
    expect(box.style.backgroundPositionX).toBe("-120px");
  });

  it("writes the first option that fits", () => {
    const box = el("span", "box");
    fitFirst(box, OPTIONS, upTo(14));
    expect(box.textContent).toBe("Shorter words");
  });

  it("writes the last option when none fits, and nothing for no options", () => {
    const box = el("span", "box");
    fitFirst(box, OPTIONS, upTo(2));
    expect(box.textContent).toBe("Short");
    fitFirst(box, [], upTo(2));
    expect(box.textContent).toBe("");
  });

  it("measures nothing when the same options come again on a laid-out box", () => {
    const box = laidOut();
    const fits = vi.fn(upTo(14));
    fitFirst(box, OPTIONS, fits);
    expect(fits).toHaveBeenCalledTimes(2);
    fits.mockClear();
    fitFirst(box, OPTIONS, fits);
    expect(fits).not.toHaveBeenCalled();
    expect(box.textContent).toBe("Shorter words");
  });

  it("fits again when the options change", () => {
    const box = laidOut();
    const fits = vi.fn(upTo(14));
    fitFirst(box, OPTIONS, fits);
    fits.mockClear();
    fitFirst(box, ["Tiny", "T"], fits);
    expect(fits).toHaveBeenCalledTimes(1);
    expect(box.textContent).toBe("Tiny");
  });

  it("fits an unmeasured box again next time", () => {
    const box = el("span", "box");
    const fits = vi.fn(upTo(14));
    fitFirst(box, OPTIONS, fits);
    fits.mockClear();
    fitFirst(box, OPTIONS, fits);
    expect(fits).toHaveBeenCalledTimes(2);
  });

  it("refitAll drops every kept fit under the root", () => {
    const root = laidOut();
    const a = el("span", "a");
    const b = el("span", "b");
    const deep = el("span", "deep");
    b.append(deep);
    root.append(a, b);
    const outside = laidOut();
    const fits = vi.fn(upTo(14));
    for (const box of [a, deep, outside]) {
      fitFirst(box, OPTIONS, fits);
    }
    fits.mockClear();
    refitAll(root);
    for (const box of [a, deep, outside]) {
      fitFirst(box, OPTIONS, fits);
    }
    // a and deep measure again (2 each); the box outside the root keeps its fit.
    expect(fits).toHaveBeenCalledTimes(4);
  });
});
