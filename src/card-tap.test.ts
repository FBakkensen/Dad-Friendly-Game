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
