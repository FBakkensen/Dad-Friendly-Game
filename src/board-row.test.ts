// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { READY_HOLD_MS } from "./board-ready";
import {
  BLINK_STEP_MS,
  ROW_HOLD_MS,
  createBoardRow,
  type BoardRow,
} from "./board-row";
import type { RowView } from "./row-view";

const motion = (reduce: boolean): void => {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: reduce && query === "(prefers-reduced-motion: reduce)",
        media: query,
      }) as MediaQueryList,
  );
};

beforeEach(() => {
  vi.useFakeTimers();
  motion(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

let limit = 16;
const fits = (box: HTMLElement): boolean => box.textContent.length <= limit;

beforeEach(() => {
  limit = 16;
});

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
  it("holds for the Ready plate's 1.9s and blinks in 140ms frames", () => {
    expect(ROW_HOLD_MS).toBe(READY_HOLD_MS);
    expect(BLINK_STEP_MS).toBe(140);
  });

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
      row.render(ready());
      expect(text(row, ".board-row-info")).toBe("12 owned");
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
  });

  describe("render", () => {
    it("shows a ready view: name, fitting info, gain, price, verb and a green lamp", () => {
      const row = make();
      const view = ready();
      row.render(view);
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
      row.render(ready({ lamp: "amber", pick: true, flag: ["Ready now"] }));
      expect(lampX(row)).toBe("-40px");
      expect(row.root.classList.contains("is-pick")).toBe(true);
      expect(text(row, ".board-row-flag")).toBe("Ready now");
      expect(part(row, ".board-row-flag").hidden).toBe(false);
    });

    it("a guided row follows its green lamp and New flag, not its pick", () => {
      const row = make();
      row.render(ready({ lamp: "green", pick: true, flag: ["New"] }));
      expect(lampX(row)).toBe("-80px");
      expect(row.root.classList.contains("is-pick")).toBe(false);
      expect(text(row, ".board-row-flag")).toBe("New");
    });

    it("trouble lights red and swaps the state class", () => {
      const row = make();
      row.render(ready());
      row.render(
        ready({
          state: "trouble",
          lamp: "red",
          info: ["Cave-in! · Hold to fix"],
          gain: "",
          price: "",
          verb: "",
        }),
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
      row.render(ready());
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
      row.render(ready({ badge: "Lv 1/5", flag: ["Ready now"] }));
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
      row.render(ready({ badge: "Lv 1/5", flag: ["Ready now"] }));
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
        row.render(ready());
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
      row.render(ready({ need: "Needs 8 workers", flag: ["Ready now"] }));
      row.render(undefined);
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

  describe("Done", () => {
    it("holds Done for 1.9s, updating only info and gain, then paints the last view", () => {
      const row = make();
      row.render(ready({ lamp: "amber", pick: true, flag: ["Ready now"] }));
      row.done();
      expect(text(row, ".board-row-flag")).toBe("Done");
      expect(part(row, ".board-row-flag").hidden).toBe(false);
      expect(text(row, ".board-row-verb")).toBe("Done");
      expect(lampX(row)).toBe("-80px");
      expect(row.holding()).toBe(true);
      expect(row.root.classList.contains("is-held")).toBe(true);
      expect(row.root.getAttribute("aria-label")).toBe("Cart. Done");

      vi.advanceTimersByTime(1000);
      row.render(
        ready({
          gain: "+13/s",
          info: ["13 owned"],
          price: "6.4K",
          lamp: "off",
          verb: "Buy",
        }),
      );
      expect(text(row, ".board-row-gain")).toBe("+13/s");
      expect(text(row, ".board-row-info")).toBe("13 owned");
      expect(text(row, ".board-row-price")).toBe("5.9K");
      expect(text(row, ".board-row-flag")).toBe("Done");
      expect(text(row, ".board-row-verb")).toBe("Done");
      expect(lampX(row)).toBe("-80px");

      vi.advanceTimersByTime(899);
      expect(row.holding()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(row.holding()).toBe(false);
      expect(row.root.classList.contains("is-held")).toBe(false);
      expect(text(row, ".board-row-price")).toBe("6.4K");
      expect(text(row, ".board-row-verb")).toBe("Buy");
      expect(part(row, ".board-row-flag").hidden).toBe(true);
      expect(lampX(row)).toBe("0px");
      expect(row.root.getAttribute("aria-label")).toBe(ready().aria);
    });

    it("a second done() while held does not extend the 1.9s hold", () => {
      const row = make();
      row.render(ready());
      row.done();
      vi.advanceTimersByTime(1000);
      row.done();
      vi.advanceTimersByTime(ROW_HOLD_MS - 1001);
      expect(row.holding()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(row.holding()).toBe(false);
      expect(text(row, ".board-row-verb")).toBe("Buy");
    });

    it("hold() restarts a running hold, and outside one holds as done() does", () => {
      const row = make();
      row.render(ready());
      row.hold();
      expect(row.holding()).toBe(true);
      expect(text(row, ".board-row-verb")).toBe("Done");
      vi.advanceTimersByTime(1000);
      row.hold();
      vi.advanceTimersByTime(ROW_HOLD_MS - 1);
      expect(row.holding()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(row.holding()).toBe(false);
      expect(text(row, ".board-row-verb")).toBe("Buy");
    });

    it("a paint that throws while holding still lets go at 1.9s", () => {
      let boom = true;
      const row = make({
        fits: (box) => {
          if (boom && box.textContent === "Done") {
            throw new Error("measure failed");
          }
          return fits(box);
        },
      });
      row.render(ready());
      expect(() => {
        row.done();
      }).toThrow("measure failed");
      boom = false;
      vi.advanceTimersByTime(ROW_HOLD_MS);
      expect(row.holding()).toBe(false);
      expect(row.root.classList.contains("is-held")).toBe(false);
      expect(text(row, ".board-row-verb")).toBe("Buy");
    });

    it("a save loading again ends the hold", () => {
      const row = make();
      row.render(ready());
      row.done();
      row.render(undefined);
      expect(row.holding()).toBe(false);
      expect(row.root.classList.contains("is-held")).toBe(false);
      expect(text(row, ".board-row-verb")).toBe("");
      expect((row.root as HTMLButtonElement).disabled).toBe(true);
      vi.advanceTimersByTime(ROW_HOLD_MS);
      expect(text(row, ".board-row-verb")).toBe("");
    });
  });

  describe("blink", () => {
    it("runs red, off, red, off, then shows the view's frame", () => {
      const row = make();
      row.render(ready());
      row.blink();
      expect(lampX(row)).toBe("-120px");
      vi.advanceTimersByTime(BLINK_STEP_MS);
      expect(lampX(row)).toBe("0px");
      vi.advanceTimersByTime(BLINK_STEP_MS);
      expect(lampX(row)).toBe("-120px");
      vi.advanceTimersByTime(BLINK_STEP_MS);
      expect(lampX(row)).toBe("0px");
      vi.advanceTimersByTime(BLINK_STEP_MS);
      expect(lampX(row)).toBe("-80px");
    });

    it("a second blink mid-run does not restart it", () => {
      const row = make();
      row.render(ready());
      row.blink();
      vi.advanceTimersByTime(200);
      row.blink();
      vi.advanceTimersByTime(140); // 340ms: the second red of the first run
      expect(lampX(row)).toBe("-120px");
      vi.advanceTimersByTime(220); // 560ms: done
      expect(lampX(row)).toBe("-80px");
    });

    it("ends on the newest view's frame when a render lands mid-blink", () => {
      const row = make();
      row.render(ready());
      row.blink();
      row.render(ready({ lamp: "amber", pick: true }));
      expect(lampX(row)).toBe("-120px");
      vi.advanceTimersByTime(BLINK_STEP_MS * 4);
      expect(lampX(row)).toBe("-40px");
    });

    it("a lamp paint that throws mid-blink never sticks on a blink frame", () => {
      const row = make();
      row.render(ready());
      const lamp = part(row, ".board-lamp");
      Object.defineProperty(lamp.style, "backgroundPositionX", {
        configurable: true,
        get: () => "",
        set: () => {
          throw new Error("paint failed");
        },
      });
      expect(() => {
        row.blink();
      }).toThrow("paint failed");
      Reflect.deleteProperty(lamp.style, "backgroundPositionX");
      vi.advanceTimersByTime(BLINK_STEP_MS * 4);
      row.render(ready({ lamp: "amber", pick: true }));
      expect(lampX(row)).toBe("-40px");
      // The run ended, so the next blink starts afresh.
      row.blink();
      expect(lampX(row)).toBe("-120px");
    });

    it("does not blink under reduced motion", () => {
      motion(true);
      const row = make();
      row.render(ready());
      row.blink();
      for (let t = 0; t <= 4; t++) {
        expect(lampX(row)).toBe("-80px");
        vi.advanceTimersByTime(BLINK_STEP_MS);
      }
    });
  });
});
