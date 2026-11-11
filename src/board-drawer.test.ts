// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAWER_SETTLE_MS,
  createBoardSheet,
  createSheetScrim,
  spareTier,
  type BoardSheet,
} from "./board-drawer";
import { createBoardHost, type BoardHost } from "./board-host";
import type { ControlRef } from "./board-interaction";
import { rowsOnBoard } from "./board-row";
import { TROUBLE_FIXED } from "./screen-words";

let time = 0;
const clock = (): number => time;
/** The board every sheet in a test shares, on the test's clock. */
let board: BoardHost;
const boardOn = (pressAge: (event: Event) => number): BoardHost =>
  createBoardHost({ clock, pressAge, reduced: () => false });

beforeEach(() => {
  vi.useFakeTimers();
  time = 1000;
  board = boardOn(() => 0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

const make = (
  over: Partial<Parameters<typeof createBoardSheet>[0]> = {},
): BoardSheet => {
  const sheet = createBoardSheet({
    name: "buys",
    title: "Buys",
    infoLabel: "Buys",
    how: { systems: [], backLabel: "Back to Buys" },
    board,
    overSave: () => false,
    ...over,
  });
  document.body.append(sheet.root);
  return sheet;
};

/** The key the drawer opens from, on the page. */
const keyButton = (): HTMLButtonElement => {
  const key = document.createElement("button");
  key.type = "button";
  key.textContent = "Buys";
  document.body.append(key);
  return key;
};

const part = (sheet: BoardSheet, selector: string): HTMLElement => {
  const found = sheet.root.querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new Error(`no ${selector}`);
  }
  return found;
};

/** The click a finger's tap ends in: a pointer click counts its taps (detail 1). */
const fingerClick = (target: HTMLElement): void => {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

const press = (target: HTMLElement): void => {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, button: 0 }),
  );
  fingerClick(target);
};

const escape = (): void => {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
};

/** Moves the test's clock and the fake timers together, as a real evening does. */
const advance = (ms: number): void => {
  time += ms;
  vi.advanceTimersByTime(ms);
};

/** What a finger's tap on the board under the drawers would be judged as now. */
const boardTap = (): string =>
  board.press({
    control: { layer: "board", id: "socket" },
    by: "finger",
    intent: "act",
    downAt: undefined,
    event: new Event("click"),
  });

describe("spareTier", () => {
  it.each([
    [0, "off"],
    [47, "off"],
    [48, "short"],
    [83, "short"],
    [84, "mid"],
    [143, "mid"],
    [144, "tall"],
  ] as const)("%d px is %s", (px, tier) => {
    expect(spareTier(px)).toBe(tier);
  });
});

describe("the drawer shell", () => {
  it("writes only aria-expanded on its door, whichever opener it opened from (#373)", () => {
    const door = keyButton();
    const sheet = make({ door });
    expect(door.getAttribute("aria-expanded")).toBe("false");
    const bay = keyButton();
    sheet.open(bay);
    expect(door.getAttribute("aria-expanded")).toBe("true");
    expect(bay.hasAttribute("aria-expanded")).toBe(false);
    sheet.close({ by: "program" });
    expect(door.getAttribute("aria-expanded")).toBe("false");
    sheet.open(door);
    sheet.close({ restoreFocus: false, by: "program" });
    expect(door.getAttribute("aria-expanded")).toBe("false");
  });

  it("settles for 400ms", () => {
    expect(DRAWER_SETTLE_MS).toBe(400);
  });

  describe("structure", () => {
    it("has its head, how host, list with the spare plate, and Back, in order", () => {
      const sheet = make();
      const root = sheet.root;
      expect(root.tagName).toBe("SECTION");
      expect(root.classList.contains("board-drawer")).toBe(true);
      expect(root.classList.contains("board-sheet")).toBe(true);
      expect(root.dataset.sheet).toBe("buys");
      expect(root.getAttribute("role")).toBe("dialog");
      expect(root.querySelector(":scope > canvas.board-skin")).not.toBeNull();

      const kids = [...root.children].filter(
        (kid) => !kid.classList.contains("board-skin"),
      );
      expect(kids.map((kid) => kid.tagName.toLowerCase())).toEqual([
        "header",
        "div",
        "div",
        "div",
        "footer",
      ]);
      expect(kids[0]?.classList.contains("board-sheet-head")).toBe(true);
      expect(kids[1]).toBe(sheet.how);
      expect(sheet.how.classList.contains("board-sheet-how")).toBe(true);
      expect(sheet.how.hidden).toBe(true);
      const pageHost = kids[2] as HTMLElement;
      expect(pageHost.classList.contains("board-sheet-page")).toBe(true);
      expect(pageHost.hidden).toBe(true);
      expect(pageHost.getAttribute("tabindex")).toBe("-1");
      expect(kids[3]).toBe(sheet.list);
      expect(sheet.list.classList.contains("board-sheet-list")).toBe(true);

      const title = part(sheet, ".board-sheet-head > h2.board-sheet-title");
      expect(title.textContent).toBe("Buys");
      expect(title.getAttribute("tabindex")).toBe("-1");
      expect(root.getAttribute("aria-labelledby")).toBe(title.id);
      expect(title.id).not.toBe("");
      const head = [...part(sheet, ".board-sheet-head").children];
      expect(head.map((kid) => kid.className.split(" ")[0])).toEqual([
        "board-sheet-title",
        "board-sheet-kick",
        "board-platebtn",
      ]);
      const kick = part(sheet, "p.board-sheet-kick");
      expect(kick.getAttribute("aria-live")).toBe("polite");

      const info = sheet.info;
      expect(info.classList.contains("board-sheet-info")).toBe(true);
      expect(info.classList.contains("teach-info")).toBe(true);
      expect(info.textContent).toBe("i");
      expect(info.getAttribute("aria-label")).toBe("How it works: Buys");
      expect(info.type).toBe("button");

      const spare = sheet.list.lastElementChild as HTMLElement;
      expect(spare.classList.contains("board-spare")).toBe(true);
      expect(spare.getAttribute("aria-hidden")).toBe("true");
      expect(spare.querySelector(":scope > canvas.board-skin")).not.toBeNull();
      const plate = part(sheet, ".board-spare > img.board-spare-plate");
      expect(plate.getAttribute("width")).toBe("192");
      expect(plate.getAttribute("height")).toBe("96");
      expect(plate.getAttribute("alt")).toBe("");
      const strip = part(sheet, ".board-spare > img.board-spare-strip");
      expect(strip.getAttribute("width")).toBe("192");
      expect(strip.getAttribute("height")).toBe("40");

      expect(sheet.back.classList.contains("board-sheet-back")).toBe(true);
      expect(sheet.back.textContent).toBe("Back to the board");
      expect(sheet.back.parentElement?.tagName).toBe("FOOTER");
    });

    it("a head key gets board-sheet-key, before the i (#374)", () => {
      const key = document.createElement("button");
      const sheet = make({ headKey: key });
      expect(
        sheet.root.querySelector(
          ".board-sheet-head.has-key > .board-sheet-key",
        ),
      ).toBe(key);
      expect(key.nextElementSibling).toBe(sheet.info);
    });

    it("names its title after the sheet, so two drawers never share an id", () => {
      const buys = make();
      const upgrades = make({ name: "upgrades", title: "Upgrades" });
      expect(buys.root.getAttribute("aria-labelledby")).not.toBe(
        upgrades.root.getAttribute("aria-labelledby"),
      );
      expect(upgrades.root.dataset.sheet).toBe("upgrades");
    });
  });

  describe("open and close", () => {
    it("opens shut, focuses the title, and closes back to its key", () => {
      const onOpen = vi.fn();
      const onClose = vi.fn();
      const sheet = make({ onOpen, onClose });
      const key = keyButton();
      key.focus();
      expect(sheet.isOpen()).toBe(false);
      sheet.list.scrollTop = 120;

      sheet.open(key);
      expect(sheet.isOpen()).toBe(true);
      expect(sheet.root.classList.contains("is-open")).toBe(true);
      expect(document.activeElement).toBe(part(sheet, ".board-sheet-title"));
      expect(sheet.list.scrollTop).toBe(0);

      sheet.close({ by: "program" });
      expect(sheet.isOpen()).toBe(false);
      expect(sheet.root.classList.contains("is-open")).toBe(false);
      expect(document.activeElement).toBe(key);
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls onOpen on the open drawer, before the board's model hears the open", () => {
      const seen: { onPage: boolean; inModel: boolean }[] = [];
      const sheet = make({
        onOpen: () => {
          seen.push({
            onPage: sheet.root.classList.contains("is-open"),
            inModel: sheet.isOpen(),
          });
        },
      });
      sheet.open();
      expect(seen).toEqual([{ onPage: true, inModel: false }]);
      expect(sheet.isOpen()).toBe(true);
    });

    it("a second open keeps the first one's settle and calls nothing", () => {
      const onOpen = vi.fn();
      const sheet = make({ onOpen });
      sheet.open();
      time += 300;
      sheet.open();
      expect(onOpen).toHaveBeenCalledTimes(1);
      time += 100;
      press(sheet.back);
      expect(sheet.isOpen()).toBe(false);
    });

    it("a close while shut calls nothing", () => {
      const onClose = vi.fn();
      const sheet = make({ onClose });
      sheet.close({ by: "program" });
      expect(onClose).not.toHaveBeenCalled();
    });

    it("is open while the board's model has it open", () => {
      const buys = make();
      const upgrades = make({ name: "upgrades", title: "Upgrades" });
      buys.open();
      expect(board.view().stack).toEqual(["buys"]);
      upgrades.open();
      expect(buys.isOpen()).toBe(false);
      expect(upgrades.isOpen()).toBe(true);
      upgrades.close({ by: "program" });
      expect(board.view().stack).toEqual([]);
    });

    it("forgets its own presses, and asks the panel to, on every open, page and close", () => {
      const onForget = vi.fn();
      const sheet = make({ onForget });
      sheet.open();
      sheet.showHow(true);
      sheet.showHow(false);
      sheet.close({ by: "program" });
      expect(onForget).toHaveBeenCalledTimes(4);
    });

    it("a close that keeps focus leaves it where it is, on a card that covered the drawer", () => {
      const onClose = vi.fn();
      const sheet = make({ onClose });
      const key = keyButton();
      sheet.open(key);
      const card = document.createElement("button");
      document.body.append(card);
      card.focus();
      sheet.close({ restoreFocus: false, by: "program" });
      expect(sheet.isOpen()).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(card);
    });

    it("Back focuses the fallback while the key it opened from is disabled, and a program close does not", () => {
      const fallback = keyButton();
      const sheet = make({ fallbackFocus: fallback });
      const key = keyButton();
      sheet.open(key);
      key.disabled = true;
      sheet.close({ by: "keyboard" });
      expect(document.activeElement).toBe(fallback);

      sheet.open(key);
      const card = document.createElement("button");
      document.body.append(card);
      card.focus();
      sheet.close({ restoreFocus: false, by: "program" });
      expect(document.activeElement).toBe(card);

      key.disabled = false;
      sheet.open(key);
      sheet.close({ by: "keyboard" });
      expect(document.activeElement).toBe(key);
    });

    it("does not focus a key that left the page", () => {
      const sheet = make();
      const key = keyButton();
      sheet.open(key);
      key.remove();
      const focus = vi.spyOn(key, "focus");
      sheet.close({ by: "program" });
      expect(focus).not.toHaveBeenCalled();
    });
  });

  describe("the settle", () => {
    it("is on until 400ms after opening", () => {
      const sheet = make();
      sheet.open();
      time += 399;
      press(sheet.back);
      expect(sheet.isOpen()).toBe(true);
      time += 1;
      press(sheet.back);
      expect(sheet.isOpen()).toBe(false);
    });

    it("a finger that landed in the settle but reached the page after it closes nothing (#373)", () => {
      // A busy phone hands the press over late: the settle is about when the finger came
      // down, not when the page got to it.
      board = boardOn(() => 100);
      const sheet = make();
      sheet.open();
      time += 450;
      press(sheet.back);
      expect(sheet.isOpen()).toBe(true);
      time += 100;
      press(sheet.back);
      expect(sheet.isOpen()).toBe(false);
    });

    it("a finger on Back at 100ms closes nothing", () => {
      const sheet = make();
      sheet.open();
      time += 100;
      press(sheet.back);
      expect(sheet.isOpen()).toBe(true);
    });

    it("a press that started early stays early when let go late", () => {
      const sheet = make();
      sheet.open();
      time += 100;
      sheet.back.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      time += 600;
      fingerClick(sheet.back);
      expect(sheet.isOpen()).toBe(true);
      // The next tap is a fresh press, long past the settle.
      press(sheet.back);
      expect(sheet.isOpen()).toBe(false);
    });

    it("a finger's click on Back with no press of its own at 100ms closes nothing (#373)", () => {
      // A touch's click lands where the finger lifts: on Back as it slides up under a finger
      // that pressed somewhere else.
      const sheet = make();
      sheet.open();
      time += 100;
      fingerClick(sheet.back);
      expect(sheet.isOpen()).toBe(true);
      time += 400;
      fingerClick(sheet.back);
      expect(sheet.isOpen()).toBe(false);
    });

    it("a finger's click on the i while it settles opens nothing; a key press does (#373)", () => {
      const sheet = make();
      sheet.open();
      time += 100;
      fingerClick(sheet.info);
      expect(sheet.how.hidden).toBe(true);
      sheet.info.click();
      expect(sheet.how.hidden).toBe(false);
    });

    it("a finger on the i after the settle opens the cards", () => {
      const sheet = make();
      sheet.open();
      time += DRAWER_SETTLE_MS;
      press(sheet.info);
      expect(sheet.how.hidden).toBe(false);
    });

    it("a finger on Back at 500ms closes it", () => {
      const sheet = make();
      sheet.open();
      time += 500;
      press(sheet.back);
      expect(sheet.isOpen()).toBe(false);
    });

    it("a key press on Back at 100ms closes it: a keyboard is never early", () => {
      const sheet = make();
      sheet.open();
      time += 100;
      sheet.back.click();
      expect(sheet.isOpen()).toBe(false);
    });

    it("a press dragged off Back never swallows a later key press", () => {
      const sheet = make();
      sheet.open();
      time += 100;
      // Pressed in the settle, dragged off, let go elsewhere: no click.
      sheet.back.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      sheet.back.dispatchEvent(
        new PointerEvent("pointerleave", { bubbles: true }),
      );
      time += 2000;
      // Enter on Back: a click with no pointer (detail 0).
      sheet.back.click();
      expect(sheet.isOpen()).toBe(false);
    });

    it("an early mark left by a lost press does not carry into the next opening", () => {
      const sheet = make();
      sheet.open();
      time += 100;
      sheet.back.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      // Closed another way before the press ended.
      escape();
      sheet.open();
      time += 2000;
      fingerClick(sheet.back);
      expect(sheet.isOpen()).toBe(false);
    });

    it("a lost press on Back doesn't make the next opening's Back early", () => {
      const sheet = make();
      sheet.open();
      time += 100;
      // Pressed in the settle, then a card covered the drawer before the press ended.
      sheet.back.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      sheet.close({ restoreFocus: false, by: "program" });
      time += 5000;
      sheet.open();
      time += DRAWER_SETTLE_MS + 100;
      // A touch's click with no press of its own on Back: judged now, not by the lost press.
      fingerClick(sheet.back);
      expect(sheet.isOpen()).toBe(false);
    });

    it("Back and a row each keep their own finger-down time: a drag on the row leaves Back's early press early", () => {
      const sheet = make();
      const rows = rowsOnBoard(board, "buys");
      const row = document.createElement("button");
      part(sheet, ".board-sheet-list").prepend(row);
      const decisions: string[] = [];
      rows.tap(row, (tap, event) => {
        decisions.push(rows.press("cart", tap, event, "act"));
      });
      sheet.open();
      time += 100;
      sheet.back.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      // Another finger drags on a row: the row drops its press, Back keeps its own.
      const drag = (type: string, clientX: number): void => {
        row.dispatchEvent(
          new PointerEvent(type, { bubbles: true, button: 0, clientX }),
        );
      };
      drag("pointerdown", 0);
      drag("pointermove", 50);
      drag("pointerup", 50);
      fingerClick(row);
      time += 600;
      fingerClick(sheet.back);
      expect(sheet.isOpen()).toBe(true);
      // The row's next press is its own, long past the settle: it acts.
      press(row);
      expect(decisions).toEqual(["act"]);
    });

    it("a press that was cancelled leaves no early mark for a finger's click", () => {
      const sheet = make();
      sheet.open();
      time += 100;
      sheet.back.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      sheet.back.dispatchEvent(
        new PointerEvent("pointercancel", { bubbles: true }),
      );
      time += DRAWER_SETTLE_MS;
      fingerClick(sheet.back);
      expect(sheet.isOpen()).toBe(false);
    });

    it("a finger's Back settles the board under it; a key's Back and Escape do not", () => {
      const sheet = make();
      sheet.open();
      time += 500;
      sheet.back.click();
      expect(boardTap()).toBe("act");
      sheet.open();
      time += 500;
      escape();
      expect(boardTap()).toBe("act");
      sheet.open();
      time += 500;
      press(sheet.back);
      expect(sheet.isOpen()).toBe(false);
      expect(boardTap()).toBe("ignore-early");
    });

    it("a press that was cancelled leaves no early mark for the keyboard", () => {
      const sheet = make();
      sheet.open();
      time += 100;
      sheet.back.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      sheet.back.dispatchEvent(
        new PointerEvent("pointercancel", { bubbles: true }),
      );
      sheet.back.click();
      expect(sheet.isOpen()).toBe(false);
    });
  });

  describe("Escape", () => {
    it("stops listening once its signal aborts", () => {
      const stop = new AbortController();
      const sheet = make({ signal: stop.signal });
      sheet.open();
      stop.abort();
      escape();
      expect(sheet.isOpen()).toBe(true);
    });

    it("closes an open sheet and leaves a shut one shut", () => {
      const onClose = vi.fn();
      const open = make({ onClose });
      const shutClose = vi.fn();
      const shut = make({
        name: "upgrades",
        title: "Upgrades",
        onClose: shutClose,
      });
      open.open();
      escape();
      expect(open.isOpen()).toBe(false);
      expect(shut.isOpen()).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(shutClose).not.toHaveBeenCalled();
    });

    it("Escape over the save drawer leaves the board drawer open", () => {
      let overSave = true;
      const sheet = make({ overSave: () => overSave });
      sheet.open();
      escape();
      expect(sheet.isOpen()).toBe(true);
      overSave = false;
      escape();
      expect(sheet.isOpen()).toBe(false);
    });

    it("is read before any later listener on the page, so one that closes the save drawer can't let it through", () => {
      let overSave = true;
      const page = new AbortController();
      // The save line's own Escape, set up before the drawer, closes the save drawer.
      document.addEventListener(
        "keydown",
        () => {
          overSave = false;
        },
        { signal: page.signal },
      );
      const sheet = make({ overSave: () => overSave });
      sheet.open();
      escape();
      page.abort();
      expect(sheet.isOpen()).toBe(true);
    });

    it("ignores other keys", () => {
      const sheet = make();
      sheet.open();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      expect(sheet.isOpen()).toBe(true);
    });
  });

  describe("the how cards", () => {
    it("builds the cards, hides the first Back, and opens them from the i", () => {
      const sheet = make({
        how: { systems: ["staffing", "layers"], backLabel: "Back to Buys" },
      });
      const cards = [...sheet.how.querySelectorAll<HTMLElement>("[data-how]")];
      expect(cards.map((card) => card.dataset["how"])).toEqual([
        "staffing",
        "layers",
      ]);
      const backs = sheet.how.querySelectorAll<HTMLElement>(".teach-how-back");
      expect(backs[0]?.hidden).toBe(true);
      expect(backs[1]?.hidden).toBe(false);
      sheet.open();
      sheet.info.click();
      expect(sheet.how.hidden).toBe(false);
      backs[1]?.click();
      expect(sheet.how.hidden).toBe(true);
    });

    it("place inserts the parts before the spare plate", () => {
      const sheet = make();
      const a = document.createElement("div");
      const b = document.createElement("div");
      sheet.place([a, b]);
      const kids = [...sheet.list.children];
      expect(kids.slice(0, 2)).toEqual([a, b]);
      expect(kids[2]?.classList.contains("board-spare")).toBe(true);
    });

    it("showHow swaps the head, list and footer for the how host, and back", () => {
      const sheet = make();
      const head = part(sheet, ".board-sheet-head");
      const footer = sheet.back.parentElement as HTMLElement;
      sheet.open();
      sheet.showHow(true);
      expect(sheet.how.hidden).toBe(false);
      expect(head.hidden).toBe(true);
      expect(sheet.list.hidden).toBe(true);
      expect(footer.hidden).toBe(true);
      expect(document.activeElement).toBe(sheet.how);

      sheet.showHow(false);
      expect(sheet.how.hidden).toBe(true);
      expect(head.hidden).toBe(false);
      expect(sheet.list.hidden).toBe(false);
      expect(footer.hidden).toBe(false);
      expect(document.activeElement).toBe(sheet.info);
    });

    it("the how cards settle as they open: their Back is new under the finger (#373)", () => {
      const sheet = make();
      const back = document.createElement("button");
      back.className = "teach-how-back";
      const went = vi.fn();
      back.addEventListener("click", went);
      sheet.how.append(back);
      sheet.open();
      time += 2000;
      sheet.showHow(true);
      time += 100;
      // The second tap of a double tap on the "i" lands on the cards' Back: nothing.
      fingerClick(back);
      expect(went).not.toHaveBeenCalled();
      // A key press is never early.
      back.click();
      expect(went).toHaveBeenCalledTimes(1);
      time += 400;
      fingerClick(back);
      expect(went).toHaveBeenCalledTimes(2);
    });

    it("back from the how cards settles again: the list is new under the finger", () => {
      const sheet = make();
      sheet.open();
      time += 2000;
      sheet.showHow(true);
      time += 2000;
      sheet.showHow(false);
      time += 100;
      press(sheet.back);
      expect(sheet.isOpen()).toBe(true);
      time += DRAWER_SETTLE_MS;
      press(sheet.back);
      expect(sheet.isOpen()).toBe(false);
    });

    it("page() starts the settle again and forgets the presses (#374)", () => {
      const onForget = vi.fn();
      const sheet = make({ onForget });
      sheet.open();
      time += DRAWER_SETTLE_MS + 100;
      onForget.mockClear();
      sheet.page();
      expect(onForget).toHaveBeenCalledTimes(1);
      time += 100;
      expect(
        board.press({
          control: { layer: "buys", id: "back" },
          by: "finger",
          intent: "act",
          downAt: undefined,
          event: new Event("click"),
        }),
      ).toBe("ignore-early");
      press(sheet.back);
      expect(sheet.isOpen()).toBe(true);
      time += 350;
      press(sheet.back);
      expect(sheet.isOpen()).toBe(false);
    });

    it("showHow pages through page(): a page while shut sends nothing", () => {
      const onForget = vi.fn();
      const sheet = make({ onForget });
      sheet.page();
      expect(onForget).not.toHaveBeenCalled();
      expect(board.view().stack).toEqual([]);
    });

    it("a close while the how cards show restores the drawer for next time", () => {
      const sheet = make();
      const key = keyButton();
      const head = part(sheet, ".board-sheet-head");
      const footer = sheet.back.parentElement as HTMLElement;
      sheet.open(key);
      sheet.showHow(true);
      sheet.close({ by: "program" });
      expect(sheet.how.hidden).toBe(true);
      expect(head.hidden).toBe(false);
      expect(sheet.list.hidden).toBe(false);
      expect(footer.hidden).toBe(false);
      expect(document.activeElement).toBe(key);
    });
  });

  describe("a panel's own page (#375)", () => {
    /** A page with a title and two plates, as the Ledger's Start over page is. */
    const panelPage = (): {
      page: HTMLElement;
      first: HTMLButtonElement;
      second: HTMLButtonElement;
    } => {
      const page = document.createElement("div");
      page.className = "test-page";
      const title = document.createElement("h3");
      title.textContent = "Start over?";
      const first = document.createElement("button");
      first.type = "button";
      first.textContent = "Keep";
      const second = document.createElement("button");
      second.type = "button";
      second.textContent = "Yes";
      page.append(title, first, second);
      return { page, first, second };
    };
    const host = (sheet: BoardSheet): HTMLElement =>
      part(sheet, ":scope > .board-sheet-page");

    it("showPage shows a panel page under the head, over Back", () => {
      const sheet = make();
      const head = part(sheet, ".board-sheet-head");
      const { page, first } = panelPage();
      sheet.open();
      sheet.showPage(page);
      expect(sheet.list.hidden).toBe(true);
      expect(host(sheet).hidden).toBe(false);
      expect([...host(sheet).children]).toEqual([page]);
      expect(head.hidden).toBe(false);
      expect(sheet.footer.hidden).toBe(false);
      expect(sheet.back.hidden).toBe(false);
      expect(sheet.how.hidden).toBe(true);
      expect(document.activeElement).toBe(first);
    });

    it("showPage focuses the host when the page has no control", () => {
      const sheet = make();
      const page = document.createElement("div");
      page.textContent = "Just words";
      sheet.open();
      sheet.showPage(page);
      expect(document.activeElement).toBe(host(sheet));
    });

    it("showPage starts the settle again", () => {
      const onForget = vi.fn();
      const sheet = make({ onForget });
      const { page, second } = panelPage();
      const went = vi.fn();
      const ref: ControlRef = { layer: "buys", id: "yes" };
      sheet.open();
      time += DRAWER_SETTLE_MS + 100;
      onForget.mockClear();
      sheet.showPage(page);
      expect(onForget).toHaveBeenCalledTimes(1);
      const pressYes = (): string =>
        board.press({
          control: ref,
          by: "finger",
          intent: "act",
          downAt: undefined,
          event: new Event("click"),
        });
      const decisions: string[] = [];
      second.addEventListener("click", () => {
        const decision = pressYes();
        decisions.push(decision);
        if (decision === "act") {
          went();
        }
      });
      time += 100;
      fingerClick(second);
      expect(went).not.toHaveBeenCalled();
      time += 350;
      fingerClick(second);
      expect(went).toHaveBeenCalledTimes(1);
      expect(decisions).toEqual(["ignore-early", "act"]);
    });

    it("showPage(undefined) and close bring the list back", () => {
      const sheet = make();
      const key = keyButton();
      const heading = part(sheet, ".board-sheet-title");
      sheet.open(key);
      sheet.showPage(panelPage().page);
      sheet.showPage(undefined);
      expect(host(sheet).hidden).toBe(true);
      expect(host(sheet).childElementCount).toBe(0);
      expect(sheet.list.hidden).toBe(false);
      expect(document.activeElement).toBe(heading);

      sheet.showPage(panelPage().page);
      sheet.close({ by: "program" });
      expect(host(sheet).hidden).toBe(true);
      expect(host(sheet).childElementCount).toBe(0);
      expect(sheet.list.hidden).toBe(false);
      expect(document.activeElement).toBe(key);
    });

    it("a second page takes the first one's place", () => {
      const sheet = make();
      const one = panelPage().page;
      const two = panelPage().page;
      sheet.open();
      sheet.showPage(one);
      sheet.showPage(two);
      expect([...host(sheet).children]).toEqual([two]);
    });

    it("the i over a page hides the page too, and its Back returns to the list", () => {
      const sheet = make();
      sheet.open();
      sheet.showPage(panelPage().page);
      sheet.showHow(true);
      expect(host(sheet).hidden).toBe(true);
      expect(sheet.list.hidden).toBe(true);
      expect(sheet.how.hidden).toBe(false);
      sheet.showHow(false);
      expect(host(sheet).hidden).toBe(true);
      expect(host(sheet).childElementCount).toBe(0);
      expect(sheet.list.hidden).toBe(false);
    });
  });

  describe("the kick", () => {
    const cart: ControlRef = { layer: "buys", id: "cart" };
    const fixed = (control: ControlRef = cart): void => {
      board.send({ kind: "result", control, at: time, outcome: "fixed" });
    };

    it("a fix in the drawer shows the thanks as done, then the resting kick", () => {
      const sheet = make();
      const kick = part(sheet, ".board-sheet-kick");
      sheet.kick("Crew and machines that mine while you rest");
      expect(kick.textContent).toBe(
        "Crew and machines that mine while you rest",
      );
      fixed();
      expect(kick.textContent).toBe(TROUBLE_FIXED);
      expect(kick.classList.contains("is-done")).toBe(true);
      advance(1599);
      expect(kick.textContent).toBe(TROUBLE_FIXED);
      advance(1);
      expect(kick.textContent).toBe(
        "Crew and machines that mine while you rest",
      );
      expect(kick.classList.contains("is-done")).toBe(false);
    });

    it("a kick set during the thanks waits for it; a second fix restarts it", () => {
      const sheet = make();
      const kick = part(sheet, ".board-sheet-kick");
      sheet.kick("Old");
      fixed();
      sheet.kick("New");
      expect(kick.textContent).toBe(TROUBLE_FIXED);
      advance(800);
      fixed();
      advance(1500);
      expect(kick.textContent).toBe(TROUBLE_FIXED);
      advance(100);
      expect(kick.textContent).toBe("New");
    });

    it("thanks only the drawer the fix was in", () => {
      const sheet = make({ name: "upgrades", title: "Upgrades" });
      const kick = part(sheet, ".board-sheet-kick");
      sheet.kick("Upgrades");
      fixed();
      fixed({ layer: "board", id: "bay:cart" });
      expect(kick.textContent).toBe("Upgrades");
      expect(kick.classList.contains("is-done")).toBe(false);
    });
  });

  describe("the spare plate", () => {
    it("takes its tier from its height and writes only on change", () => {
      const sheet = make();
      const spare = part(sheet, ".board-spare");
      const height = vi.spyOn(spare, "offsetHeight", "get");
      const tiers = (): string[] =>
        ["is-tall", "is-mid", "is-short", "is-off"].filter((name) =>
          spare.classList.contains(name),
        );
      for (const [px, tier] of [
        [150, "is-tall"],
        [90, "is-mid"],
        [50, "is-short"],
        [20, "is-off"],
      ] as const) {
        height.mockReturnValue(px);
        sheet.fitSpare();
        expect(tiers()).toEqual([tier]);
      }
      const seen: MutationRecord[] = [];
      const watch = new MutationObserver((records) => {
        seen.push(...records);
      });
      watch.observe(spare, { attributes: true });
      sheet.fitSpare();
      seen.push(...watch.takeRecords());
      watch.disconnect();
      expect(seen).toEqual([]);
    });

    it("off, it takes no gap, and is measured without the gap it gave back (#373)", () => {
      const sheet = make();
      const spare = part(sheet, ".board-spare");
      part(sheet, ".board-sheet-list").style.rowGap = "10px";
      const height = vi.spyOn(spare, "offsetHeight", "get");
      height.mockReturnValue(20);
      sheet.fitSpare();
      expect(spare.classList.contains("is-off")).toBe(true);
      // The gap it gave back is room it only has while off: 55px is 45 with it.
      height.mockReturnValue(55);
      sheet.fitSpare();
      expect(spare.classList.contains("is-off")).toBe(true);
      height.mockReturnValue(60);
      sheet.fitSpare();
      expect(spare.classList.contains("is-short")).toBe(true);
      // Short, it takes its gap again and is measured as it stands.
      height.mockReturnValue(50);
      sheet.fitSpare();
      expect(spare.classList.contains("is-short")).toBe(true);
    });

    it("fits on open and again on the next frame", () => {
      const sheet = make();
      const spare = part(sheet, ".board-spare");
      const height = vi.spyOn(spare, "offsetHeight", "get");
      height.mockReturnValue(90);
      sheet.open();
      expect(spare.classList.contains("is-mid")).toBe(true);
      height.mockReturnValue(150);
      vi.advanceTimersToNextFrame();
      expect(spare.classList.contains("is-tall")).toBe(true);
    });
  });
});

describe("the scrim", () => {
  const rect = (left: number, top: number, size: number): DOMRect =>
    ({
      left,
      top,
      right: left + size,
      bottom: top + size,
      width: size,
      height: size,
      x: left,
      y: top,
    }) as DOMRect;

  const setup = () => {
    const buys = make();
    const upgrades = make({ name: "upgrades", title: "Upgrades" });
    const socket = document.createElement("button");
    socket.getBoundingClientRect = () => rect(100, 20, 56);
    const onSocket = vi.fn();
    socket.addEventListener("click", onSocket);
    document.body.append(socket);
    const scrim = createSheetScrim({
      board,
      sheets: [buys, upgrades],
      sockets: () => [socket],
    });
    document.body.append(scrim);
    return { buys, upgrades, scrim, onSocket };
  };

  const tap = (scrim: HTMLElement, x: number, y: number): void => {
    scrim.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        clientX: x,
        clientY: y,
        detail: 1,
      }),
    );
  };

  it("is a board-scrim, hidden from readers, on while any sheet is open", () => {
    const { buys, upgrades, scrim } = setup();
    expect(scrim.classList.contains("board-scrim")).toBe(true);
    expect(scrim.getAttribute("aria-hidden")).toBe("true");
    expect(scrim.classList.contains("is-on")).toBe(false);
    buys.open();
    expect(scrim.classList.contains("is-on")).toBe(true);
    upgrades.open();
    buys.close({ by: "program" });
    expect(scrim.classList.contains("is-on")).toBe(true);
    upgrades.close({ by: "program" });
    expect(scrim.classList.contains("is-on")).toBe(false);
  });

  it("follows the board's model, not the sheets' classes", () => {
    const { scrim } = setup();
    board.send({ kind: "open", overlay: "upgrades", at: time });
    expect(scrim.classList.contains("is-on")).toBe(true);
    board.send({ kind: "close", overlay: "upgrades", at: time, by: "program" });
    expect(scrim.classList.contains("is-on")).toBe(false);
  });

  it("a tap over a relic socket closes the sheet and shows that relic's note", () => {
    const { buys, scrim, onSocket } = setup();
    buys.open();
    tap(scrim, 120, 40);
    expect(buys.isOpen()).toBe(false);
    expect(onSocket).toHaveBeenCalledTimes(1);
  });

  it("hands the socket a finger's click, so its note does not take focus", () => {
    const { buys, scrim, onSocket } = setup();
    buys.open();
    tap(scrim, 120, 40);
    const click = onSocket.mock.calls[0]?.[0] as MouseEvent | undefined;
    expect(click?.detail).toBe(1);
    expect(click?.bubbles).toBe(true);
  });

  it("a scrim close is a tap-through: the socket's click still acts", () => {
    const { buys, scrim, onSocket } = setup();
    buys.open();
    time += 500;
    tap(scrim, 120, 40);
    expect(onSocket).toHaveBeenCalledTimes(1);
    // The tap went on to what lay under the drawer: nothing there settles.
    expect(boardTap()).toBe("act");
  });

  it("a tap elsewhere only closes", () => {
    const { buys, upgrades, scrim, onSocket } = setup();
    buys.open();
    upgrades.open();
    tap(scrim, 300, 40);
    expect(buys.isOpen()).toBe(false);
    expect(upgrades.isOpen()).toBe(false);
    expect(onSocket).not.toHaveBeenCalled();
  });

  it("a socket's far edge is outside it", () => {
    const { buys, scrim, onSocket } = setup();
    buys.open();
    tap(scrim, 156, 40);
    expect(onSocket).not.toHaveBeenCalled();
  });
});
