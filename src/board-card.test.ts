// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cardArt,
  cardLine,
  createBoardCard,
  type BoardCard,
} from "./board-card";
import { createBoardHost, type BoardHost } from "./board-host";
import { write } from "./board-dom";
import { cardUp } from "./card-state";

let time = 0;
const clock = (): number => time;
let board: BoardHost;

beforeEach(() => {
  time = 1000;
  board = createBoardHost({ clock, pressAge: () => 0, reduced: () => false });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const make = (): BoardCard => {
  const card = createBoardCard({
    name: "welcome",
    hook: "welcome-back",
    titleId: "welcome-back-title",
    board,
  });
  document.body.append(card.root);
  return card;
};

/** A finger's tap: pointerdown, then a click that counts its taps (detail 1). */
const fingerTap = (target: HTMLElement): void => {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

describe("the board card", () => {
  it("builds a shaded dialog with a framed face", () => {
    const card = make();
    expect(card.root.matches("div.board-card.welcome-back")).toBe(true);
    expect(card.root.dataset["card"]).toBe("welcome");
    expect(card.root.getAttribute("role")).toBe("dialog");
    expect(card.root.getAttribute("aria-modal")).toBe("true");
    expect(card.root.getAttribute("aria-labelledby")).toBe(
      "welcome-back-title",
    );
    expect(card.root.hidden).toBe(true);
    expect(card.face.matches("section.board-card-face.board-skinned")).toBe(
      true,
    );
    expect(card.title.matches("h2.board-card-title#welcome-back-title")).toBe(
      true,
    );
    expect(
      [...card.face.children].filter((child) => child.tagName !== "CANVAS"),
    ).toEqual([card.title, card.body, card.foot]);
    expect(card.body.className).toBe("board-card-body");
    expect(card.foot.className).toBe("board-card-foot");
  });

  it("show tells the model and focuses once", () => {
    const card = make();
    const plate = card.plate("Go", "go", "welcome-continue", () => undefined);
    const send = vi.spyOn(board, "send");
    card.show(true, plate);
    expect(board.view().stack).toEqual(["welcome"]);
    expect(document.activeElement).toBe(plate);
    expect(card.isUp()).toBe(true);
    expect(cardUp(card.root)).toBe(true);
    expect(card.root.hidden).toBe(false);
    plate.blur();
    card.show(true, plate);
    expect(send).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(plate);
    card.show(false);
    expect(board.view().stack).toEqual([]);
    expect(card.root.hidden).toBe(true);
    expect(cardUp(card.root)).toBe(false);
    expect(card.isUp()).toBe(false);
    card.show(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("a plate acts only past the settle", () => {
    const card = make();
    const act = vi.fn();
    const plate = card.plate("Go", "go", "welcome-continue", act);
    expect(plate.classList.contains("board-platebtn")).toBe(true);
    expect(plate.classList.contains("board-card-plate")).toBe(true);
    expect(plate.classList.contains("welcome-continue")).toBe(true);
    expect(card.foot.contains(plate)).toBe(true);
    card.show(true, plate);
    time += 100;
    fingerTap(plate);
    expect(act).not.toHaveBeenCalled();
    // Enter or Space: a click with no pointer (detail 0) is never early.
    plate.click();
    expect(act).toHaveBeenCalledTimes(1);
    time += 350;
    fingerTap(plate);
    expect(act).toHaveBeenCalledTimes(2);
  });

  it("puts a plate where it is asked", () => {
    const card = make();
    const box = document.createElement("div");
    card.body.append(box);
    const plate = card.plate("Go", "go", "go", () => undefined, box);
    expect(box.contains(plate)).toBe(true);
  });

  it("another control presses through the board on the card's layer", () => {
    const card = make();
    const act = vi.fn();
    const side = document.createElement("button");
    card.body.append(side);
    card.press(side, "phone", act);
    card.show(true);
    time += 100;
    fingerTap(side);
    expect(act).not.toHaveBeenCalled();
    time += 350;
    fingerTap(side);
    expect(act).toHaveBeenCalledTimes(1);
  });

  it("page starts the settle again", () => {
    const card = make();
    const act = vi.fn();
    const plate = card.plate("Go", "go", "welcome-continue", act);
    card.show(true);
    time += 1000;
    card.page();
    time += 100;
    fingerTap(plate);
    expect(act).not.toHaveBeenCalled();
    time += 350;
    fingerTap(plate);
    expect(act).toHaveBeenCalledTimes(1);
  });

  it("forgets a finger that came down before the card moved on", () => {
    const card = make();
    const act = vi.fn();
    const plate = card.plate("Go", "go", "welcome-continue", act);
    card.show(true);
    time += 1000;
    // The finger came down, then the card paged: its click is judged by its own age.
    plate.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    card.page();
    time += 500;
    plate.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
    expect(act).toHaveBeenCalledTimes(1);
  });

  it("cardLine writes only when the words change", async () => {
    const line = cardLine("welcome-detail is-quiet");
    expect(line.matches("p.board-card-line.welcome-detail.is-quiet")).toBe(
      true,
    );
    const changes: MutationRecord[] = [];
    const observer = new MutationObserver((records) => {
      changes.push(...records);
    });
    observer.observe(line, { childList: true, subtree: true });
    write(line, "You were gone 9h.");
    write(line, "You were gone 9h.");
    await new Promise((resolve) => setTimeout(resolve, 0));
    observer.disconnect();
    expect(changes).toHaveLength(1);
  });

  it("cardArt draws at the asked size", () => {
    const art = cardArt(184, 152);
    expect(art.matches("img.board-card-art")).toBe(true);
    expect(art.width).toBe(184);
    expect(art.height).toBe(152);
    expect(cardArt(64).height).toBe(64);
    expect(art.alt).toBe("");
    expect(art.draggable).toBe(false);
  });
});
