// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  el,
  fitFirst,
  fitsWidth,
  frameX,
  hide,
  legend,
  mark,
  refitAll,
  scrollIntoList,
  setAttr,
  write,
} from "./board-dom";

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

  it("fitsWidth: the text is no wider than its box, with a pixel of slack", () => {
    const box = el("span", "box");
    vi.spyOn(box, "clientWidth", "get").mockReturnValue(100);
    const wide = vi.spyOn(box, "scrollWidth", "get");
    wide.mockReturnValue(101);
    expect(fitsWidth(box)).toBe(true);
    wide.mockReturnValue(102);
    expect(fitsWidth(box)).toBe(false);
  });

  it("fits by width when no check is given", () => {
    const box = el("span", "box");
    vi.spyOn(box, "clientWidth", "get").mockReturnValue(100);
    vi.spyOn(box, "scrollWidth", "get").mockImplementation(() =>
      box.textContent.length > 10 ? 200 : 50,
    );
    fitFirst(box, OPTIONS);
    expect(box.textContent).toBe("Short");
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

describe("scrollIntoList (#373)", () => {
  const rect = (top: number, bottom: number): DOMRect => ({
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height: bottom - top,
    x: 0,
    y: top,
    toJSON: () => ({}),
  });
  const setup = (rowTop: number, rowBottom: number) => {
    const clip = el("div", "board-sheet-clip");
    const list = el("div", "board-sheet-list");
    const row = el("button", "board-row");
    list.append(row);
    clip.append(list);
    document.body.append(clip);
    vi.spyOn(list, "getBoundingClientRect").mockReturnValue(rect(250, 788));
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue(
      rect(rowTop, rowBottom),
    );
    const native = vi.fn();
    row.scrollIntoView = native;
    list.scrollTop = 40;
    return { clip, list, row, native };
  };

  it("scrolls the list alone to bring a row below its view up to its foot", () => {
    const { clip, list, row, native } = setup(800, 876);
    scrollIntoList(list, row);
    expect(list.scrollTop).toBe(40 + 88);
    expect(clip.scrollTop).toBe(0);
    expect(native).not.toHaveBeenCalled();
  });

  it("scrolls a row above its view down to its top", () => {
    const { list, row } = setup(230, 306);
    scrollIntoList(list, row);
    expect(list.scrollTop).toBe(20);
  });

  it("leaves a row already in view where it is", () => {
    const { list, row } = setup(400, 476);
    scrollIntoList(list, row);
    expect(list.scrollTop).toBe(40);
  });

  it("hide and mark write only on change", () => {
    const box = el("div", "box");
    const toggle = vi.spyOn(box.classList, "toggle");
    mark(box, "is-on", true);
    mark(box, "is-on", true);
    expect(toggle).toHaveBeenCalledTimes(1);
    mark(box, "is-on", false);
    mark(box, "is-on", false);
    expect(toggle).toHaveBeenCalledTimes(2);
    expect(box.classList.contains("is-on")).toBe(false);

    const writes = vi.fn();
    let state = false;
    Object.defineProperty(box, "hidden", {
      get: () => state,
      set: (value: boolean) => {
        writes(value);
        state = value;
      },
    });
    hide(box, true);
    hide(box, true);
    expect(writes).toHaveBeenCalledTimes(1);
    hide(box, false);
    hide(box, false);
    expect(writes).toHaveBeenCalledTimes(2);
  });

  it("legend builds the section legend", () => {
    const plain = legend("Machines", "machines");
    expect(plain.className).toBe("board-sec");
    expect(plain.dataset["sec"]).toBe("machines");
    expect([...plain.children].map((c) => c.textContent)).toEqual(["Machines"]);
    const column = legend("Crew", "crew", "per second");
    expect([...column.children].map((c) => c.className)).toEqual([
      "board-lg",
      "board-lg",
    ]);
    expect([...column.children].map((c) => c.textContent)).toEqual([
      "Crew",
      "per second",
    ]);
  });
});
