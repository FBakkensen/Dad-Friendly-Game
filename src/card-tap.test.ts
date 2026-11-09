// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buyOnTap } from "./card-tap";

afterEach(() => {
  document.body.replaceChildren();
});

const pointer = (target: HTMLElement, type: string): void => {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, button: 0, clientX: 50 }),
  );
};

/** A drawer row inside the drawer's scrolling list. */
const rowInList = (): { list: HTMLElement; row: HTMLButtonElement } => {
  const list = document.createElement("div");
  list.className = "board-sheet-list";
  const row = document.createElement("button");
  row.type = "button";
  list.append(row);
  document.body.append(list);
  return { list, row };
};

describe("buyOnTap", () => {
  it("a drag on the drawer's list never buys", () => {
    const { list, row } = rowInList();
    const buy = vi.fn();
    buyOnTap(row, row, buy);
    pointer(row, "pointerdown");
    list.scrollTop += 10;
    pointer(row, "pointerup");
    // The click the browser sends after the gesture.
    row.click();
    expect(buy).not.toHaveBeenCalled();
  });

  it("a still tap on the list buys once", () => {
    const { row } = rowInList();
    const buy = vi.fn();
    buyOnTap(row, row, buy);
    pointer(row, "pointerdown");
    pointer(row, "pointerup");
    row.click();
    expect(buy).toHaveBeenCalledTimes(1);
    expect(buy).toHaveBeenCalledWith({ early: false });
  });
});

/** The click a finger's tap ends in: `detail` 1. A key press clicks with detail 0. */
const fingerClick = (target: HTMLElement): void => {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

describe("buyOnTap's settle (#373)", () => {
  it("a finger's click on a row that saw no press of its own is early while the drawer settles", () => {
    // A touch's click lands where the finger is when it lifts: a row that slid under it while
    // the drawer rose, which never saw the pointerdown.
    const { row } = rowInList();
    const buy = vi.fn();
    buyOnTap(row, row, buy, { settling: () => true });
    fingerClick(row);
    expect(buy).toHaveBeenCalledWith({ early: true });
  });

  it("asks the settle about the press itself, so it can judge when the finger came down", () => {
    const { row } = rowInList();
    const settling = vi.fn((event: Event) => event.type === "pointerdown");
    buyOnTap(row, row, vi.fn(), { settling });
    pointer(row, "pointerdown");
    expect(settling).toHaveBeenCalledWith(
      expect.objectContaining({ type: "pointerdown" }),
    );
  });

  it("a finger's click after the settle is not early", () => {
    const { row } = rowInList();
    const buy = vi.fn();
    buyOnTap(row, row, buy, { settling: () => false });
    fingerClick(row);
    expect(buy).toHaveBeenCalledWith({ early: false });
  });

  it("a keyboard press is never early, even while the drawer settles", () => {
    const { row } = rowInList();
    const buy = vi.fn();
    buyOnTap(row, row, buy, { settling: () => true });
    row.click();
    expect(buy).toHaveBeenCalledWith({ early: false });
  });

  it("a press that starts in the settle stays early when its click comes after it", () => {
    const { row } = rowInList();
    const buy = vi.fn();
    let settling = true;
    buyOnTap(row, row, buy, { settling: () => settling });
    pointer(row, "pointerdown");
    settling = false;
    pointer(row, "pointerup");
    fingerClick(row);
    expect(buy).toHaveBeenCalledWith({ early: true });
  });

  it("an early press whose click never came does not make a later key press early", () => {
    const { row } = rowInList();
    const buy = vi.fn();
    let settling = true;
    buyOnTap(row, row, buy, { settling: () => settling });
    // The finger slid off the row and lifted elsewhere: no click for this press.
    pointer(row, "pointerdown");
    pointer(row, "pointerleave");
    settling = false;
    row.click();
    expect(buy).toHaveBeenCalledWith({ early: false });
  });
});
