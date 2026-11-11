// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoardHost } from "./board-host";
import {
  createBoardRow,
  paintRowBar,
  rowBar,
  rowsOnBoard,
  type BoardRow,
  type RowLive,
} from "./board-row";
import type { RowView } from "./row-view";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

let limit = 16;
const fits = (box: HTMLElement): boolean => box.textContent.length <= limit;

beforeEach(() => {
  limit = 16;
});

/** Nothing from the board's model: no Done hold, no blink. */
const still: RowLive = { held: false, blink: undefined };
/** The board's model holds Done on the row. */
const held: RowLive = { held: true, blink: undefined };

const ready = (over: Partial<RowView> = {}): RowView => ({
  name: "Cart",
  badge: "",
  info: ["12 owned · 13 more for x2", "12 owned"],
  need: "",
  why: "",
  flag: [],
  gain: "+12/s",
  price: "5.9K",
  dimTag: false,
  verb: "Buy",
  lamp: "green",
  state: "ready",
  pick: false,
  can: true,
  aria: "Buy a cart for 5,868 stones, mines 12 stones a second. You have 12.",
  ...over,
});

const make = (
  over: Partial<Parameters<typeof createBoardRow>[0]> = {},
): BoardRow =>
  createBoardRow({
    tag: "button",
    className: "board-buy-row",
    data: { tier: "cart" },
    name: "Cart",
    icon: true,
    fits,
    ...over,
  });

const part = (row: BoardRow, selector: string): HTMLElement => {
  const found = row.root.querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new Error(`no ${selector}`);
  }
  return found;
};

const lampX = (row: BoardRow): string =>
  part(row, ".board-lamp").style.backgroundPositionX;

const text = (row: BoardRow, selector: string): string =>
  part(row, selector).textContent;

const nameText = (row: BoardRow): string =>
  part(row, ".board-row-name").firstChild?.textContent ?? "";

/** Lays the row out on the page with a width, so its fits are kept. */
const laidOut = (row: BoardRow): void => {
  document.body.append(row.root);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(120);
};

describe("the drawer row", () => {
  describe("structure", () => {
    it("a button row has every part, its data and a frame skin", () => {
      const row = make();
      const root = row.root;
      expect(root.tagName).toBe("BUTTON");
      expect((root as HTMLButtonElement).type).toBe("button");
      expect(root.classList.contains("board-row")).toBe(true);
      expect(root.classList.contains("board-buy-row")).toBe(true);
      expect(root.classList.contains("no-icon")).toBe(false);
      expect(root.dataset.tier).toBe("cart");
      expect(root.querySelector(":scope > canvas.board-skin")).not.toBeNull();
      expect(root.querySelector(":scope > i.board-lamp")).not.toBeNull();
      const icon = part(row, ":scope > img.board-row-icon");
      expect(icon.getAttribute("width")).toBe("64");
      expect(icon.getAttribute("height")).toBe("64");
      const mid = part(row, ":scope > .board-row-mid");
      for (const selector of [
        // The flag shares the name's line, so the row has three lines at most (#373).
        ":scope > .board-row-line > .board-row-name > .board-row-badge",
        ":scope > .board-row-line > .board-row-name + .board-row-flag.board-lg",
        ":scope > .board-row-info",
        ":scope > .board-row-need",
        ":scope > .board-row-why",
      ]) {
        expect(mid.querySelector(selector), selector).not.toBeNull();
      }
      const rt = part(row, ":scope > .board-row-rt");
      for (const selector of [
        ".board-row-gain.board-num",
        ".board-row-tag > canvas.board-skin",
        ".board-row-tag > .board-row-price.board-num",
        ".board-row-verb",
      ]) {
        expect(rt.querySelector(selector), selector).not.toBeNull();
      }
    });

    it("a div row with no icon is not focusable and drops the icon", () => {
      const row = make({ tag: "div", icon: false });
      expect(row.root.tagName).toBe("DIV");
      expect(row.root.hasAttribute("tabindex")).toBe(false);
      expect(row.root.querySelector("img")).toBeNull();
      expect(row.root.classList.contains("no-icon")).toBe(true);
      row.setIcon("x.png");
      expect(row.root.querySelector("img")).toBeNull();
    });

    it("with no fits given, measures lines by width", () => {
      const row = createBoardRow({
        tag: "button",
        className: "board-buy-row",
        data: {},
        name: "Cart",
        icon: true,
      });
      const info = part(row, ".board-row-info");
      vi.spyOn(info, "clientWidth", "get").mockReturnValue(100);
      vi.spyOn(info, "scrollWidth", "get").mockImplementation(() =>
        info.textContent.length > 10 ? 200 : 50,
      );
      row.render(ready(), still);
      expect(text(row, ".board-row-info")).toBe("12 owned");
    });

    it("an icon is 64 by default; iconPx 48 or 32 sizes it and marks the row (#375)", () => {
      const big = make();
      expect(part(big, "img.board-row-icon").getAttribute("width")).toBe("64");
      expect(part(big, "img.board-row-icon").getAttribute("height")).toBe("64");
      expect(big.root.classList.contains("is-icon-64")).toBe(true);
      const relic = make({ iconPx: 48 });
      expect(part(relic, "img.board-row-icon").getAttribute("width")).toBe(
        "48",
      );
      expect(part(relic, "img.board-row-icon").getAttribute("height")).toBe(
        "48",
      );
      expect(relic.root.classList.contains("is-icon-48")).toBe(true);
      expect(relic.root.classList.contains("is-icon-64")).toBe(false);
      const stone = make({ iconPx: 32 });
      expect(part(stone, "img.board-row-icon").getAttribute("width")).toBe(
        "32",
      );
      expect(stone.root.classList.contains("is-icon-32")).toBe(true);
    });

    it("a row with no icon takes no icon size", () => {
      const row = make({ icon: false, iconPx: 48 });
      expect(row.root.className).not.toMatch(/is-icon-/);
    });

    it("setIcon writes the icon and hides it for none", () => {
      const row = make();
      const icon = part(row, ".board-row-icon") as HTMLImageElement;
      row.setIcon("cart.png");
      expect(icon.getAttribute("src")).toBe("cart.png");
      expect(icon.hidden).toBe(false);
      row.setIcon(undefined);
      expect(icon.hidden).toBe(true);
    });

    it("setIconArt puts a part in the icon cell, and undefined brings the icon back (#455)", () => {
      const row = make();
      const icon = part(row, ".board-row-icon") as HTMLImageElement;
      row.setIcon("worker.png");
      const lamp = part(row, ".board-lamp");
      /** The cell after the lamp: the icon's. */
      const cell = (): Element | null => lamp.nextElementSibling;
      const walk = document.createElement("span");
      walk.className = "engineer-walk";
      row.setIconArt(walk);
      expect(row.root.querySelector("img.board-row-icon")).toBeNull();
      // The part takes the img's place: after the lamp, before the middle.
      expect(cell()).toBe(walk);
      row.setIconArt(walk);
      expect(row.root.querySelectorAll(".engineer-walk")).toHaveLength(1);
      const other = document.createElement("span");
      row.setIconArt(other);
      expect(walk.isConnected).toBe(false);
      expect(cell()).toBe(other);
      row.setIconArt(undefined);
      expect(other.isConnected).toBe(false);
      expect(cell()).toBe(icon);
      expect(icon.getAttribute("src")).toBe("worker.png");
      row.setIconArt(undefined);
      expect(cell()).toBe(icon);
    });

    it("setIconArt does nothing on a row with no icon (#455)", () => {
      const row = make({ icon: false });
      const walk = document.createElement("span");
      row.setIconArt(walk);
      expect(walk.isConnected).toBe(false);
    });
  });

  describe("render", () => {
    it("shows a ready view: name, fitting info, gain, price, verb and a green lamp", () => {
      const row = make();
      const view = ready();
      row.render(view, still);
      expect(nameText(row)).toBe("Cart");
      expect(text(row, ".board-row-info")).toBe("12 owned");
      expect(text(row, ".board-row-gain")).toBe("+12/s");
      expect(text(row, ".board-row-price")).toBe("5.9K");
      expect(text(row, ".board-row-verb")).toBe("Buy");
      expect(lampX(row)).toBe("-80px");
      const classes = row.root.classList;
      expect(classes.contains("is-ready")).toBe(true);
      expect(classes.contains("is-can")).toBe(true);
      expect(classes.contains("is-pick")).toBe(false);
      expect(classes.contains("is-dim-tag")).toBe(false);
      expect(row.root.getAttribute("aria-label")).toBe(view.aria);
      expect((row.root as HTMLButtonElement).disabled).toBe(false);
    });

    it("an amber pick lights amber and reads as the pick", () => {
      const row = make();
      row.render(
        ready({ lamp: "amber", pick: true, flag: ["Ready now"] }),
        still,
      );
      expect(lampX(row)).toBe("-40px");
      expect(row.root.classList.contains("is-pick")).toBe(true);
      expect(text(row, ".board-row-flag")).toBe("Ready now");
      expect(part(row, ".board-row-flag").hidden).toBe(false);
    });

    it("a guided row follows its green lamp and New flag, not its pick", () => {
      const row = make();
      row.render(ready({ lamp: "green", pick: true, flag: ["New"] }), still);
      expect(lampX(row)).toBe("-80px");
      expect(row.root.classList.contains("is-pick")).toBe(false);
      expect(text(row, ".board-row-flag")).toBe("New");
    });

    it("trouble lights red and swaps the state class", () => {
      const row = make();
      row.render(ready(), still);
      row.render(
        ready({
          state: "trouble",
          lamp: "red",
          info: ["Cave-in! · Hold to fix"],
          gain: "",
          price: "",
          verb: "",
        }),
        still,
      );
      expect(lampX(row)).toBe("-120px");
      expect(row.root.classList.contains("is-trouble")).toBe(true);
      expect(row.root.classList.contains("is-ready")).toBe(false);
      expect(part(row, ".board-row-tag").hidden).toBe(true);
      expect(part(row, ".board-row-gain").hidden).toBe(true);
      expect(part(row, ".board-row-verb").hidden).toBe(true);
    });

    it("hides empty parts and shows filled ones", () => {
      const row = make();
      row.render(ready(), still);
      for (const selector of [
        ".board-row-need",
        ".board-row-why",
        ".board-row-badge",
        ".board-row-flag",
      ]) {
        expect(part(row, selector).hidden, selector).toBe(true);
      }
      row.render(
        ready({
          need: "Needs 8 workers",
          why: "Borers dig twice as deep",
          badge: "Lv 2/5",
          price: "",
          dimTag: true,
          can: false,
          state: "dear",
        }),
        still,
      );
      expect(text(row, ".board-row-need")).toBe("Needs 8 workers");
      expect(part(row, ".board-row-need").hidden).toBe(false);
      expect(text(row, ".board-row-why")).toBe("Borers dig twice as deep");
      expect(text(row, ".board-row-badge")).toBe("Lv 2/5");
      expect(part(row, ".board-row-badge").hidden).toBe(false);
      expect(part(row, ".board-row-tag").hidden).toBe(true);
      expect(row.root.classList.contains("is-dim-tag")).toBe(true);
      expect(row.root.classList.contains("is-can")).toBe(false);
      expect(row.root.classList.contains("is-dear")).toBe(true);
    });

    it("a second identical render writes nothing", () => {
      const row = make();
      laidOut(row);
      row.render(ready({ badge: "Lv 1/5", flag: ["Ready now"] }), still);
      const nodes = (): Node[] => {
        const walker = document.createTreeWalker(
          row.root,
          NodeFilter.SHOW_TEXT,
        );
        const out: Node[] = [];
        for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
          out.push(n);
        }
        return out;
      };
      const before = nodes();
      const seen: MutationRecord[] = [];
      const watch = new MutationObserver((records) => {
        seen.push(...records);
      });
      watch.observe(row.root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
      });
      row.render(ready({ badge: "Lv 1/5", flag: ["Ready now"] }), still);
      seen.push(...watch.takeRecords());
      watch.disconnect();
      expect(seen).toEqual([]);
      const after = nodes();
      expect(after.length).toBe(before.length);
      after.forEach((node, i) => {
        expect(node).toBe(before[i]);
      });
    });

    it("refits its lines when the fonts settle", async () => {
      let settle = (): void => undefined;
      const fonts = Object.assign(new EventTarget(), {
        ready: new Promise<void>((resolve) => {
          settle = resolve;
        }),
      });
      Object.defineProperty(document, "fonts", {
        value: fonts,
        configurable: true,
      });
      try {
        limit = 10;
        const row = make();
        laidOut(row);
        row.render(ready(), still);
        expect(text(row, ".board-row-info")).toBe("12 owned");
        limit = 40;
        settle();
        await Promise.resolve();
        await Promise.resolve();
        expect(text(row, ".board-row-info")).toBe("12 owned · 13 more for x2");
      } finally {
        Reflect.deleteProperty(document, "fonts");
      }
    });
  });

  describe("until the save is in", () => {
    it("shows the name and icon only, dark and disabled, from the start", () => {
      const row = make();
      const button = row.root as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(nameText(row)).toBe("Cart");
      expect(lampX(row)).toBe("0px");
      expect(button.getAttribute("aria-label")).toBe("Cart");
    });

    it("render(undefined) empties every number and word but the name", () => {
      const row = make();
      row.render(
        ready({ need: "Needs 8 workers", flag: ["Ready now"] }),
        still,
      );
      row.render(undefined, still);
      const button = row.root as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      expect(nameText(row)).toBe("Cart");
      for (const selector of [
        ".board-row-gain",
        ".board-row-price",
        ".board-row-verb",
        ".board-row-info",
        ".board-row-need",
        ".board-row-flag",
      ]) {
        expect(text(row, selector), selector).toBe("");
      }
      expect(part(row, ".board-row-tag").hidden).toBe(true);
      expect(lampX(row)).toBe("0px");
      expect(row.root.classList.contains("is-ready")).toBe(false);
      expect(row.root.classList.contains("is-can")).toBe(false);
      expect(button.getAttribute("aria-label")).toBe("Cart");
    });
  });

  describe("Done and the blink, as the board's model says", () => {
    it("holds Done, updating only info and gain, then paints the last view", () => {
      const row = make();
      row.render(
        ready({ lamp: "amber", pick: true, flag: ["Ready now"] }),
        still,
      );
      row.render(
        ready({ lamp: "amber", pick: true, flag: ["Ready now"] }),
        held,
      );
      expect(text(row, ".board-row-flag")).toBe("Done");
      expect(part(row, ".board-row-flag").hidden).toBe(false);
      expect(text(row, ".board-row-verb")).toBe("Done");
      expect(lampX(row)).toBe("-80px");
      expect(row.root.classList.contains("is-held")).toBe(true);
      expect(row.root.getAttribute("aria-label")).toBe("Cart. Done");

      const after = ready({
        gain: "+13/s",
        info: ["13 owned"],
        price: "6.4K",
        lamp: "off",
        verb: "Buy",
      });
      row.render(after, held);
      expect(text(row, ".board-row-gain")).toBe("+13/s");
      expect(text(row, ".board-row-info")).toBe("13 owned");
      expect(text(row, ".board-row-price")).toBe("5.9K");
      expect(text(row, ".board-row-flag")).toBe("Done");
      expect(text(row, ".board-row-verb")).toBe("Done");
      expect(lampX(row)).toBe("-80px");

      row.render(after, still);
      expect(row.root.classList.contains("is-held")).toBe(false);
      expect(text(row, ".board-row-price")).toBe("6.4K");
      expect(text(row, ".board-row-verb")).toBe("Buy");
      expect(part(row, ".board-row-flag").hidden).toBe(true);
      expect(lampX(row)).toBe("0px");
      expect(row.root.getAttribute("aria-label")).toBe(ready().aria);
    });

    it("a save loading again paints no Done, whatever the model still holds", () => {
      const row = make();
      row.render(ready(), held);
      row.render(undefined, held);
      expect(row.root.classList.contains("is-held")).toBe(false);
      expect(text(row, ".board-row-verb")).toBe("");
      expect((row.root as HTMLButtonElement).disabled).toBe(true);
      expect(lampX(row)).toBe("0px");
    });

    it("paints the blink's frame over the lamp, and the view's lamp after it", () => {
      const row = make();
      row.render(ready(), { held: false, blink: "red" });
      expect(lampX(row)).toBe("-120px");
      row.render(ready(), { held: false, blink: "off" });
      expect(lampX(row)).toBe("0px");
      // A render that lands mid-blink keeps the frame, and ends on the newest view's lamp.
      row.render(ready({ lamp: "amber", pick: true }), {
        held: false,
        blink: "red",
      });
      expect(lampX(row)).toBe("-120px");
      row.render(ready({ lamp: "amber", pick: true }), still);
      expect(lampX(row)).toBe("-40px");
    });

    it("a blink over a held row ends on Done's green", () => {
      const row = make();
      row.render(ready({ lamp: "amber" }), { held: true, blink: "red" });
      expect(lampX(row)).toBe("-120px");
      row.render(ready({ lamp: "amber" }), held);
      expect(lampX(row)).toBe("-80px");
    });

    it("a save loading again paints no blink", () => {
      const row = make();
      row.render(undefined, { held: false, blink: "red" });
      expect(lampX(row)).toBe("0px");
    });

    it("keeps Done's flag when the fonts settle during a hold", () => {
      const fonts = Object.assign(new EventTarget(), {
        ready: Promise.resolve(),
      });
      Object.defineProperty(document, "fonts", {
        value: fonts,
        configurable: true,
      });
      try {
        const row = make();
        row.render(ready(), held);
        fonts.dispatchEvent(new Event("loadingdone"));
        expect(text(row, ".board-row-flag")).toBe("Done");
        expect(text(row, ".board-row-verb")).toBe("Done");
        expect(row.root.classList.contains("is-held")).toBe(true);
      } finally {
        Reflect.deleteProperty(document, "fonts");
      }
    });
  });
});

describe("the row bar (#375)", () => {
  it("is a hidden progressbar from 0 to 100 with a fill", () => {
    const { bar, fill } = rowBar();
    expect(bar.tagName).toBe("I");
    expect(bar.classList.contains("board-row-bar")).toBe(true);
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
    expect(bar.hidden).toBe(true);
    expect(fill.parentElement).toBe(bar);
    expect(fill.classList.contains("board-row-bar-fill")).toBe(true);
  });

  it("paints 0.4 as 40, labelled, in whole art px", () => {
    const { bar, fill } = rowBar();
    paintRowBar(bar, fill, 0.4, "Progress to the Lantern");
    expect(bar.hidden).toBe(false);
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-label")).toBe("Progress to the Lantern");
    expect(fill.style.getPropertyValue("--fill")).toBe(
      String(Math.round(0.4 * 156)),
    );
  });

  it("hides for no progress, and keeps what it last said", () => {
    const { bar, fill } = rowBar();
    paintRowBar(bar, fill, 0.4, "Forty");
    paintRowBar(bar, fill, undefined, "Gone");
    expect(bar.hidden).toBe(true);
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-label")).toBe("Forty");
  });

  it("writes the fill only when it changes", () => {
    const { bar, fill } = rowBar();
    paintRowBar(bar, fill, 0.5, "Half");
    const set = vi.spyOn(fill.style, "setProperty");
    paintRowBar(bar, fill, 0.5, "Half");
    expect(set).not.toHaveBeenCalled();
    paintRowBar(bar, fill, 1, "Full");
    expect(set).toHaveBeenCalledWith("--fill", "156");
  });
});

describe("a drawer's rows on the board's model", () => {
  let time = 0;
  beforeEach(() => {
    vi.useFakeTimers();
    time = 0;
  });
  afterEach(() => {
    vi.useRealTimers();
  });
  const host = () =>
    createBoardHost({
      clock: () => time,
      pressAge: () => 0,
      reduced: () => false,
    });

  it("paints Done and the blink as the model changes, from the row's latest view", () => {
    const board = host();
    const rows = rowsOnBoard(board, "buys");
    const row = make();
    rows.paint("cart", row, ready());
    rows.result("cart", "applied");
    expect(text(row, ".board-row-verb")).toBe("Done");
    rows.paint("cart", row, ready({ verb: "Hire", price: "6.4K" }));
    expect(text(row, ".board-row-price")).toBe("5.9K");
    // The hold ends on the board's clock and its one timer.
    time += 1_900;
    vi.advanceTimersByTime(1_900);
    expect(text(row, ".board-row-verb")).toBe("Hire");
    expect(text(row, ".board-row-price")).toBe("6.4K");
    rows.result("cart", "refused");
    expect(lampX(row)).toBe("-120px");
    time += 140;
    vi.advanceTimersByTime(140);
    expect(lampX(row)).toBe("0px");
  });

  it("presses a row on its own drawer's layer, and forgets every row's finger-down time", () => {
    const board = host();
    const rows = rowsOnBoard(board, "upgrades");
    const row = make({ data: { boost: "sharper" } });
    const button = row.root as HTMLButtonElement;
    rows.paint("boost:sharper", row, ready());
    const decisions: string[] = [];
    rows.tap(button, (press, event) => {
      decisions.push(rows.press("boost:sharper", press, event, "act"));
      rows.result("boost:sharper", "applied");
    });
    board.send({ kind: "open", overlay: "upgrades", at: 0 });
    // A finger that came down in the settle, forgotten as the drawer moved on.
    button.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    rows.forget();
    time += 500;
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(decisions).toEqual(["act"]);
    expect(board.view().held.has("upgrades/boost:sharper")).toBe(true);
  });
});
