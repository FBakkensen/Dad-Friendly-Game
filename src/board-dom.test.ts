// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  el,
  figureRuns,
  fitFirst,
  fitsBox,
  fitsWidth,
  frameX,
  hide,
  legend,
  mark,
  refitAll,
  scrollIntoList,
  setAttr,
  write,
  writeFigures,
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

/** A line's runs as text, each figure in brackets. */
const marked = (text: string): string =>
  figureRuns(text)
    .map((run) => (run.figure ? `[${run.text}]` : run.text))
    .join("");

describe("figures in a line (#506)", () => {
  it.each([
    ["+28/s · 1 worker", "[+28/s] · [1] worker"],
    ["+3,898/s · 5 workers", "[+3,898/s] · [5] workers"],
    [
      "5 of 10 · Every cart hauls twice as fast.",
      "[5] of [10] · Every cart hauls twice as fast.",
    ],
    ["Away pay 30% to 37.5%.", "Away pay [30%] to [37.5%]."],
    ["Taps 1 to 10.", "Taps [1] to [10]."],
    ["Crew ×2 for 30 min. 1,172/s.", "Crew [×2] for [30] min. [1,172/s]."],
    [
      "Crew 17.2K/s to 34.5K/s for 20 min.",
      "Crew [17.2K/s] to [34.5K/s] for [20] min.",
    ],
    ["Opens at 574.3M stones", "Opens at [574.3M] stones"],
    ["Needs 1 worker each · 9 idle", "Needs [1] worker each · [9] idle"],
    ["8:58", "[8:58]"],
    ["Cave-in! · Hold to fix", "Cave-in! · Hold to fix"],
    ["", ""],
  ])("finds the figures of %j", (text, want) => {
    expect(marked(text)).toBe(want);
    expect(
      figureRuns(text)
        .map((run) => run.text)
        .join(""),
    ).toBe(text);
  });

  it("writes each figure in a b.board-fig and keeps the line's text", () => {
    const box = el("span", "box");
    writeFigures(box, "+28/s · 1 worker");
    expect(box.textContent).toBe("+28/s · 1 worker");
    expect(
      [...box.querySelectorAll("b.board-fig")].map((b) => b.textContent),
    ).toEqual(["+28/s", "1"]);
    writeFigures(box, "Hold to fix");
    expect(box.textContent).toBe("Hold to fix");
    expect(box.querySelector("b")).toBeNull();
  });

  it("writes nothing for the same words, and marks a line written plain", () => {
    const box = el("span", "box");
    writeFigures(box, "+28/s · 1 worker");
    const seen: MutationRecord[] = [];
    const watch = new MutationObserver((records) => {
      seen.push(...records);
    });
    watch.observe(box, { subtree: true, childList: true, characterData: true });
    writeFigures(box, "+28/s · 1 worker");
    seen.push(...watch.takeRecords());
    watch.disconnect();
    expect(seen).toEqual([]);
    // Words written plain (a fit that measured) get their figures back.
    box.textContent = "+28/s · 1 worker";
    writeFigures(box, "+28/s · 1 worker");
    expect(box.querySelectorAll("b.board-fig").length).toBe(2);
  });

  it("fitFirst measures each option as its writer draws it", () => {
    const box = laidOut();
    fitFirst(
      box,
      ["+28/s · 1 worker", "+28/s"],
      (el) => el.querySelectorAll("b").length < 2,
      writeFigures,
    );
    expect(box.textContent).toBe("+28/s");
    expect(box.querySelector("b.board-fig")?.textContent).toBe("+28/s");
  });

  it("fitsBox is fitsWidth and no taller than the box", () => {
    const box = el("span", "box");
    const size = { sw: 100, cw: 100, sh: 34, ch: 34 };
    vi.spyOn(box, "scrollWidth", "get").mockImplementation(() => size.sw);
    vi.spyOn(box, "clientWidth", "get").mockImplementation(() => size.cw);
    vi.spyOn(box, "scrollHeight", "get").mockImplementation(() => size.sh);
    vi.spyOn(box, "clientHeight", "get").mockImplementation(() => size.ch);
    expect(fitsBox(box)).toBe(true);
    size.sh = 51;
    expect(fitsBox(box)).toBe(false);
    size.sh = 35;
    expect(fitsBox(box)).toBe(true);
    size.sw = 120;
    expect(fitsBox(box)).toBe(false);
  });
});
