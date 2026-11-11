// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAWER_SETTLE_MS,
  createBoardSheet,
  type BoardSheet,
} from "./board-drawer";
import { createBoardHost, type BoardHost } from "./board-host";
import { createAskPage, pageFrame } from "./board-page";

let time = 0;
let board: BoardHost;
let sheet: BoardSheet;

/** Moves the test's clock and the fake timers together. */
const advance = (ms: number): void => {
  time += ms;
  vi.advanceTimersByTime(ms);
};

/** A finger's tap: down, up, then its click. */
const press = (target: HTMLElement): void => {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

function find(root: HTMLElement, selector: string): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof HTMLElement)) {
    throw new Error(`missing ${selector}`);
  }
  return found;
}

const button = (root: HTMLElement, selector: string): HTMLButtonElement => {
  const found = find(root, selector);
  if (!(found instanceof HTMLButtonElement)) {
    throw new Error(`${selector} is no button`);
  }
  return found;
};

const words = (plate: HTMLElement): string =>
  plate.querySelector(".board-platebtn-text")?.textContent ?? "";

beforeEach(() => {
  vi.useFakeTimers();
  time = 1000;
  board = createBoardHost({
    clock: () => time,
    pressAge: () => 0,
    reduced: () => false,
  });
  sheet = createBoardSheet({
    name: "engineers",
    title: "Your engineers",
    infoLabel: "Engineers",
    how: { systems: [], backLabel: "Back to your engineers" },
    board,
    overSave: () => false,
  });
  document.body.append(sheet.root);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const ask = () => {
  const onNo = vi.fn();
  const onYes = vi.fn();
  const page = createAskPage({
    board,
    layer: "engineers",
    className: "engineer-recall-page",
    title: "Call her back",
    line: "Ada comes home empty-handed.",
    answers: [
      {
        label: "Keep exploring",
        id: "recall-no",
        className: "recall-no",
        act: onNo,
      },
      {
        label: "Call back",
        id: "recall-yes",
        className: "recall-yes",
        act: onYes,
        holdsReady: true,
      },
    ],
  });
  return { page, onNo, onYes };
};

describe("a drawer's page that asks (#455)", () => {
  it("an ask page names itself and puts its first answer first", () => {
    const { page } = ask();
    const { root } = page;
    expect(root.classList.contains("board-page")).toBe(true);
    expect(root.classList.contains("engineer-recall-page")).toBe(true);
    const title = find(root, "h3.board-page-title");
    const line = find(root, "p.board-page-line");
    expect(title.textContent).toBe("Call her back");
    expect(line.textContent).toBe("Ada comes home empty-handed.");
    expect(root.getAttribute("role")).toBe("group");
    expect(root.getAttribute("aria-labelledby")).toBe(title.id);
    expect(root.getAttribute("aria-describedby")).toBe(line.id);
    expect(title.id).toBe("engineer-recall-page-title");
    expect(line.id).toBe("engineer-recall-page-line");
    const answers = find(root, ".board-page-answers");
    const plates = [
      ...answers.querySelectorAll<HTMLElement>(".board-platebtn"),
    ];
    expect(plates.map(words)).toEqual(["Keep exploring", "Call back"]);
    expect(plates[0]?.classList.contains("recall-no")).toBe(true);
    expect(plates[1]?.classList.contains("recall-yes")).toBe(true);
    expect(root.querySelector(":scope > canvas.board-skin")).not.toBeNull();
  });

  it("its first answer takes the focus when the drawer shows it", () => {
    const { page } = ask();
    sheet.open();
    sheet.showPage(page.root);
    expect(document.activeElement).toBe(find(page.root, ".recall-no"));
  });

  it("an answer acts only past the settle", () => {
    const { page, onNo, onYes } = ask();
    sheet.open();
    advance(DRAWER_SETTLE_MS + 50);
    sheet.showPage(page.root);
    advance(100);
    press(find(page.root, ".recall-yes"));
    press(find(page.root, ".recall-no"));
    expect(onYes).not.toHaveBeenCalled();
    expect(onNo).not.toHaveBeenCalled();
    advance(350);
    press(find(page.root, ".recall-yes"));
    expect(onYes).toHaveBeenCalledTimes(1);
    expect(onYes).toHaveBeenCalledWith(
      find(page.root, ".recall-yes"),
      "finger",
    );
  });

  it("forget drops a finger-down time the drawer moved on from", () => {
    const { page, onYes } = ask();
    const yes = find(page.root, ".recall-yes");
    const down = (): void => {
      yes.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    };
    const click = (): void => {
      yes.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      );
    };
    sheet.open();
    sheet.showPage(page.root);
    advance(100);
    down();
    advance(DRAWER_SETTLE_MS);
    click();
    // Judged by when its finger came down: inside the settle.
    expect(onYes).not.toHaveBeenCalled();
    sheet.showPage(page.root);
    advance(100);
    down();
    page.forget();
    advance(DRAWER_SETTLE_MS);
    click();
    // No finger-down time left: judged by the click itself, past the settle.
    expect(onYes).toHaveBeenCalledTimes(1);
  });

  it("paint(false) disables the answers that wait for the save", () => {
    const { page } = ask();
    page.paint(false);
    expect(button(page.root, ".recall-yes").disabled).toBe(true);
    expect(button(page.root, ".recall-no").disabled).toBe(false);
    page.paint(true);
    expect(button(page.root, ".recall-yes").disabled).toBe(false);
  });

  it("write() changes the title and line", () => {
    const { page } = ask();
    page.write("Call Otto back", "Otto comes home empty-handed.");
    expect(find(page.root, ".board-page-title").textContent).toBe(
      "Call Otto back",
    );
    expect(find(page.root, ".board-page-line").textContent).toBe(
      "Otto comes home empty-handed.",
    );
  });
});

describe("a drawer page's frame (#455)", () => {
  it("takes its ids from its last class, and its hooks from the caller", () => {
    const { root, heading, said } = pageFrame({
      className: "ledger-page ledger-field-log-page",
      title: "Field log",
      line: "Select the log and copy it from here.",
    });
    expect([...root.classList]).toEqual([
      "board-page",
      "ledger-page",
      "ledger-field-log-page",
    ]);
    expect(heading.id).toBe("ledger-field-log-page-title");
    expect(said.id).toBe("ledger-field-log-page-line");
    expect(heading.className).toBe("board-page-title");
    expect(said.className).toBe("board-page-line");
  });
});
