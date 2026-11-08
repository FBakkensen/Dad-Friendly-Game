// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { boardFit, trackBoardFit } from "./board-fit";

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
});

describe("trackBoardFit", () => {
  it("sets the scale and the desk class", () => {
    const fake = Object.assign(new EventTarget(), {
      innerWidth: 1280,
      innerHeight: 800,
      document,
    }) as unknown as Window;
    trackBoardFit(fake);
    expect(document.documentElement.style.getPropertyValue("--board-scale")).toBe("0.848");
    expect(document.body.classList.contains("desk")).toBe(true);
    Object.assign(fake, { innerWidth: 424, innerHeight: 924 });
    fake.dispatchEvent(new Event("resize"));
    expect(document.documentElement.style.getPropertyValue("--board-scale")).toBe("1");
    expect(document.body.classList.contains("desk")).toBe(false);
  });
});
