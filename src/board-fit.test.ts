// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { boardFit, readSafeInsets, trackBoardFit } from "./board-fit";

describe("boardFit", () => {
  it("the OnePlus 15 gets the board at 1", () => {
    expect(boardFit(424, 924)).toEqual({ scale: 1, desk: false });
  });
  it("a shorter phone scales the whole board", () => {
    expect(boardFit(424, 830)).toEqual({ scale: 0.898, desk: false });
  });
  it("a narrow phone scales by width", () => {
    expect(boardFit(375, 1000).scale).toBe(0.884);
  });
  it("PC sizes keep an 8px lip", () => {
    expect(boardFit(1280, 800)).toEqual({ scale: 0.848, desk: true });
    expect(boardFit(1366, 768).scale).toBe(0.813);
    expect(boardFit(1440, 900).scale).toBe(0.956);
  });
  it("never above 1", () => {
    expect(boardFit(2560, 1440).scale).toBe(1);
  });
  it("zero insets change nothing: the 424x924 phone keeps exact 2x", () => {
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    expect(boardFit(424, 924, none)).toEqual({ scale: 1, desk: false });
    expect(boardFit(1280, 800, none)).toEqual(boardFit(1280, 800));
  });
  it("fits the board inside the safe area of an edge-to-edge phone", () => {
    // A status bar of 40 and a gesture bar of 24: (924 - 64) / 924.
    expect(
      boardFit(424, 924, { top: 40, right: 0, bottom: 24, left: 0 }),
    ).toEqual({ scale: 0.93, desk: false });
    // A notch on the side in landscape-ish widths narrows it: (424 - 48) / 424.
    expect(
      boardFit(424, 1200, { top: 0, right: 0, bottom: 0, left: 48 }).scale,
    ).toBe(0.886);
  });
  it("a desk keeps its lip inside the insets", () => {
    // (800 - 16 - 20) / 924.
    expect(
      boardFit(1280, 800, { top: 20, right: 0, bottom: 0, left: 0 }),
    ).toEqual({ scale: 0.826, desk: true });
  });
});

describe("readSafeInsets", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it("reads env(safe-area-inset-*) through a probe it then removes", () => {
    const spy = vi.spyOn(window, "getComputedStyle").mockImplementation(
      (el) =>
        ({
          paddingTop: el.classList.contains("board-safe-probe")
            ? "40px"
            : "0px",
          paddingRight: "0px",
          paddingBottom: "24.5px",
          paddingLeft: "",
        }) as CSSStyleDeclaration,
    );
    const before = document.body.childElementCount;
    expect(readSafeInsets(document)).toEqual({
      top: 40,
      right: 0,
      bottom: 24.5,
      left: 0,
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(document.body.childElementCount).toBe(before);
  });
  it("is all zero where the browser has no insets", () => {
    expect(readSafeInsets(document)).toEqual({
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
    });
  });
});

describe("trackBoardFit", () => {
  it("sets the scale and the desk class", () => {
    const fake = Object.assign(new EventTarget(), {
      innerWidth: 1280,
      innerHeight: 800,
      document,
    }) as unknown as Window;
    trackBoardFit(fake, () => ({ top: 0, right: 0, bottom: 0, left: 0 }));
    expect(
      document.documentElement.style.getPropertyValue("--board-scale"),
    ).toBe("0.848");
    expect(document.body.classList.contains("desk")).toBe(true);
    Object.assign(fake, { innerWidth: 424, innerHeight: 924 });
    fake.dispatchEvent(new Event("resize"));
    expect(
      document.documentElement.style.getPropertyValue("--board-scale"),
    ).toBe("1");
    expect(document.body.classList.contains("desk")).toBe(false);
  });
});

describe("trackBoardFit with insets", () => {
  it("re-reads the insets on every resize", () => {
    const fake = Object.assign(new EventTarget(), {
      innerWidth: 424,
      innerHeight: 924,
      document,
    }) as unknown as Window;
    let insets = { top: 0, right: 0, bottom: 0, left: 0 };
    trackBoardFit(fake, () => insets);
    expect(
      document.documentElement.style.getPropertyValue("--board-scale"),
    ).toBe("1");
    insets = { top: 40, right: 0, bottom: 24, left: 0 };
    fake.dispatchEvent(new Event("resize"));
    expect(
      document.documentElement.style.getPropertyValue("--board-scale"),
    ).toBe("0.93");
  });
});
