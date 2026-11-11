// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { READY_HOLD_MS } from "./board-interaction";
import {
  DRAWER_SETTLE_MS,
  createBoardSheet,
  type BoardSheet,
} from "./board-drawer";
import { createBoardHost, type BoardHost } from "./board-host";
import {
  createFieldLogPage,
  createLedgerDoors,
  createStartOverPage,
  createTonightBox,
  writeClipboard,
} from "./ledger-parts";

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

/** The open Ledger, past its settle. */
const openPast = (): void => {
  sheet.open();
  advance(DRAWER_SETTLE_MS + 50);
};

/** The one element `selector` names under `root`, of the kind asked for. */
function find(root: HTMLElement, selector: string): HTMLElement;
function find<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
  kind: abstract new () => T,
): T;
function find(
  root: HTMLElement,
  selector: string,
  kind: abstract new () => HTMLElement = HTMLElement,
): HTMLElement {
  const found = root.querySelector(selector);
  if (!(found instanceof kind)) {
    throw new Error(`missing ${selector}`);
  }
  return found;
}

const words = (button: HTMLElement): string =>
  button.querySelector(".board-platebtn-text")?.textContent ?? "";

beforeEach(() => {
  vi.useFakeTimers();
  time = 1000;
  board = createBoardHost({
    clock: () => time,
    pressAge: () => 0,
    reduced: () => false,
  });
  sheet = createBoardSheet({
    name: "ledger",
    title: "Ledger",
    infoLabel: "Tonight and the mine",
    how: { systems: [], backLabel: "Back to the Ledger" },
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

describe("the Tonight box (#375)", () => {
  const lines = [
    { time: "22:13", text: "Overtime started for 30:00." },
    { time: "22:10", text: "Bought mine cart 3." },
    { time: "07:05", text: "Hired worker 56." },
  ];

  it("shows the lines in order, each with its time", () => {
    const box = createTonightBox();
    sheet.place([box.root]);
    box.paint(lines);
    expect(box.root.classList.contains("ledger-log")).toBe(true);
    expect(box.root.querySelector("canvas.board-skin")).not.toBeNull();
    const shown = [
      ...box.root.querySelectorAll<HTMLElement>("p.ledger-log-line"),
    ].filter((line) => !line.hidden);
    expect(
      shown.map((line) => [
        line.querySelector("time.ledger-log-time.board-num")?.textContent,
        line.querySelector("span.ledger-log-text")?.textContent,
      ]),
    ).toEqual(lines.map((line) => [line.time, line.text]));
  });

  it("writes nothing for the same lines again", async () => {
    const box = createTonightBox();
    sheet.place([box.root]);
    box.paint(lines);
    const seen: MutationRecord[] = [];
    const watch = new MutationObserver((records) => {
      seen.push(...records);
    });
    watch.observe(box.root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
    });
    box.paint(lines.map((line) => ({ ...line })));
    await Promise.resolve();
    seen.push(...watch.takeRecords());
    watch.disconnect();
    expect(seen).toEqual([]);
  });

  it("an empty list leaves the box empty, and fewer lines hide the rest", () => {
    const box = createTonightBox();
    sheet.place([box.root]);
    box.paint(lines);
    box.paint(lines.slice(0, 1));
    const shown = [
      ...box.root.querySelectorAll<HTMLElement>("p.ledger-log-line"),
    ].filter((line) => !line.hidden);
    expect(shown).toHaveLength(1);
    box.paint([]);
    expect(box.root.textContent).toBe("");
    expect(
      [...box.root.querySelectorAll<HTMLElement>("p.ledger-log-line")].every(
        (line) => line.hidden,
      ),
    ).toBe(true);
  });
});

describe("the Ledger's four plates (#375)", () => {
  const mount = () => {
    const on = {
      savedCopies: vi.fn(),
      fieldLog: vi.fn(),
      startOver: vi.fn(),
      pass: vi.fn(),
    };
    const doors = createLedgerDoors({ board, on });
    sheet.place([doors.root]);
    doors.paint({ ready: true, passOffered: true });
    const plate = (name: string): HTMLButtonElement =>
      find(doors.root, `.ledger-${name}`, HTMLButtonElement);
    return { doors, on, plate };
  };

  it("four plates, two by two, with today's words", () => {
    const { doors, plate } = mount();
    expect(doors.root.classList.contains("ledger-doors")).toBe(true);
    const plates = [...doors.root.querySelectorAll("button.board-platebtn")];
    expect(
      plates.map(
        (each) =>
          [...each.classList].find((name) => name.startsWith("ledger-")) ?? "",
      ),
    ).toEqual([
      "ledger-saved-copies",
      "ledger-field-log",
      "ledger-start-over",
      "ledger-pass",
    ]);
    expect(words(plate("saved-copies"))).toBe("Saved copies");
    expect(words(plate("field-log"))).toBe("Copy field log");
    expect(words(plate("start-over"))).toBe("Start over");
    expect(words(plate("pass"))).toBe("Pass the mine");
    expect(plate("pass").getAttribute("aria-label")).toBe(
      "Pass the mine to your kid",
    );
  });

  it("a press past the settle calls its door with the plate", () => {
    const { on, plate } = mount();
    openPast();
    press(plate("saved-copies"));
    press(plate("field-log"));
    press(plate("start-over"));
    press(plate("pass"));
    expect(on.savedCopies).toHaveBeenCalledWith(plate("saved-copies"));
    expect(on.fieldLog).toHaveBeenCalledWith(plate("field-log"));
    expect(on.startOver).toHaveBeenCalledWith(plate("start-over"));
    expect(on.pass).toHaveBeenCalledWith(plate("pass"));
  });

  it("a press inside the settle opens nothing", () => {
    const { on, plate } = mount();
    sheet.open();
    advance(100);
    press(plate("start-over"));
    press(plate("field-log"));
    expect(on.startOver).not.toHaveBeenCalled();
    expect(on.fieldLog).not.toHaveBeenCalled();
  });

  it("until the save is ready, Copy field log and Start over are disabled, Saved copies is not", () => {
    const { doors, plate } = mount();
    doors.paint({ ready: false, passOffered: true });
    expect(plate("field-log").disabled).toBe(true);
    expect(plate("start-over").disabled).toBe(true);
    expect(plate("saved-copies").disabled).toBe(false);
    doors.paint({ ready: true, passOffered: true });
    expect(plate("field-log").disabled).toBe(false);
    expect(plate("start-over").disabled).toBe(false);
  });

  it("Pass hides unless it is offered, and Start over keeps its column", () => {
    const { doors, plate } = mount();
    doors.paint({ ready: true, passOffered: false });
    expect(plate("pass").hidden).toBe(true);
    // The CSS pins each plate to its own grid cell, so a hidden Pass moves nothing.
    expect(plate("start-over").classList.contains("ledger-start-over")).toBe(
      true,
    );
    doors.paint({ ready: true, passOffered: true });
    expect(plate("pass").hidden).toBe(false);
  });

  it("Copied holds the plate: a second press does nothing, and the words come back", () => {
    const { doors, on, plate } = mount();
    openPast();
    press(plate("field-log"));
    expect(on.fieldLog).toHaveBeenCalledTimes(1);
    doors.copied();
    expect(words(plate("field-log"))).toBe("Copied");
    advance(500);
    press(plate("field-log"));
    expect(on.fieldLog).toHaveBeenCalledTimes(1);
    advance(READY_HOLD_MS - 500);
    expect(words(plate("field-log"))).toBe("Copy field log");
    press(plate("field-log"));
    expect(on.fieldLog).toHaveBeenCalledTimes(2);
  });
});

describe("the Start over page (#375)", () => {
  const mount = () => {
    const onKeep = vi.fn();
    const onYes = vi.fn();
    const page = createStartOverPage({ board, onKeep, onYes });
    return { page, onKeep, onYes };
  };

  it("asks with today's words, Keep first", () => {
    const { page } = mount();
    const root = page.root;
    expect(root.classList.contains("ledger-page")).toBe(true);
    expect(root.classList.contains("ledger-start-over-page")).toBe(true);
    expect(find(root, "h3.ledger-page-title").textContent).toBe("Start over?");
    expect(find(root, "p.ledger-page-line").textContent).toMatch(
      /^You will lose all your progress/,
    );
    const plates = [...root.querySelectorAll<HTMLElement>(".board-platebtn")];
    expect(plates.map(words)).toEqual(["Keep my mountain", "Yes, start over"]);
    expect(plates[0]?.classList.contains("ledger-keep")).toBe(true);
    expect(plates[1]?.classList.contains("ledger-yes")).toBe(true);
  });

  it("Keep and Yes act only past the page's settle", () => {
    const { page, onKeep, onYes } = mount();
    openPast();
    sheet.showPage(page.root);
    advance(100);
    press(find(page.root, ".ledger-yes"));
    press(find(page.root, ".ledger-keep"));
    expect(onYes).not.toHaveBeenCalled();
    expect(onKeep).not.toHaveBeenCalled();
    advance(DRAWER_SETTLE_MS);
    press(find(page.root, ".ledger-keep"));
    expect(onKeep).toHaveBeenCalledTimes(1);
    press(find(page.root, ".ledger-yes"));
    expect(onYes).toHaveBeenCalledTimes(1);
  });

  it("paint(false) disables Yes and leaves Keep", () => {
    const { page } = mount();
    page.paint(false);
    expect(find(page.root, ".ledger-yes", HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(find(page.root, ".ledger-keep", HTMLButtonElement).disabled).toBe(
      false,
    );
    page.paint(true);
    expect(find(page.root, ".ledger-yes", HTMLButtonElement).disabled).toBe(
      false,
    );
  });
});

describe("the field log page (#375)", () => {
  it("shows the log in a read-only box, selected", () => {
    const page = createFieldLogPage();
    sheet.place([]);
    openPast();
    sheet.showPage(page.root);
    const text = '{\n  "snapshot": {}\n}';
    page.show(text);
    const root = page.root;
    expect(root.classList.contains("ledger-field-log-page")).toBe(true);
    expect(find(root, "h3.ledger-page-title").textContent).toBe("Field log");
    expect(find(root, "p.ledger-page-line").textContent).toBe(
      "Select the log and copy it from here.",
    );
    const box = find(
      root,
      "textarea.ledger-field-log-text",
      HTMLTextAreaElement,
    );
    expect(box.value).toBe(text);
    expect(box.readOnly).toBe(true);
    expect(box.spellcheck).toBe(false);
    expect(box.getAttribute("aria-label")).toBe("Field log");
    expect(box.selectionStart).toBe(0);
    expect(box.selectionEnd).toBe(text.length);
  });
});

describe("writeClipboard (#375)", () => {
  const withClipboard = (clipboard: unknown): void => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
  };

  afterEach(() => {
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("is true when the browser takes the text", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    withClipboard({ writeText });
    await expect(writeClipboard("log")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("log");
  });

  it("is false with no clipboard, or one that refuses", async () => {
    withClipboard(undefined);
    await expect(writeClipboard("log")).resolves.toBe(false);
    withClipboard({});
    await expect(writeClipboard("log")).resolves.toBe(false);
    withClipboard({ writeText: () => Promise.reject(new Error("denied")) });
    await expect(writeClipboard("log")).resolves.toBe(false);
  });
});
