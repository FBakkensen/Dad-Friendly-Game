// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAWER_SETTLE_MS,
  createBoardSheet,
  createSheetScrim,
  spareTier,
  type BoardSheet,
} from "./board-drawer";

let time = 0;
const clock = (): number => time;

beforeEach(() => {
  vi.useFakeTimers();
  time = 1000;
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
    clock,
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
    sheet.close();
    expect(door.getAttribute("aria-expanded")).toBe("false");
    sheet.open(door);
    sheet.close({ restoreFocus: false });
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
        "footer",
      ]);
      expect(kids[0]?.classList.contains("board-sheet-head")).toBe(true);
      expect(kids[1]).toBe(sheet.how);
      expect(sheet.how.classList.contains("board-sheet-how")).toBe(true);
      expect(sheet.how.hidden).toBe(true);
      expect(kids[2]).toBe(sheet.list);
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

      sheet.close();
      expect(sheet.isOpen()).toBe(false);
      expect(sheet.root.classList.contains("is-open")).toBe(false);
      expect(document.activeElement).toBe(key);
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("a second open keeps the first one's settle and calls nothing", () => {
      const onOpen = vi.fn();
      const sheet = make({ onOpen });
      sheet.open();
      time += 300;
      sheet.open();
      expect(onOpen).toHaveBeenCalledTimes(1);
      time += 100;
      expect(sheet.settling()).toBe(false);
    });

    it("a close while shut calls nothing", () => {
      const onClose = vi.fn();
      const sheet = make({ onClose });
      sheet.close();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("a close that keeps focus leaves it where it is, on a card that covered the drawer", () => {
      const onClose = vi.fn();
      const sheet = make({ onClose });
      const key = keyButton();
      sheet.open(key);
      const card = document.createElement("button");
      document.body.append(card);
      card.focus();
      sheet.close({ restoreFocus: false });
      expect(sheet.isOpen()).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(card);
    });

    it("does not focus a key that left the page", () => {
      const sheet = make();
      const key = keyButton();
      sheet.open(key);
      key.remove();
      const focus = vi.spyOn(key, "focus");
      sheet.close();
      expect(focus).not.toHaveBeenCalled();
    });
  });

  describe("the settle", () => {
    it("is on until 400ms after opening, and off while shut", () => {
      const sheet = make();
      expect(sheet.settling()).toBe(false);
      sheet.open();
      time += 399;
      expect(sheet.settling()).toBe(true);
      time += 1;
      expect(sheet.settling()).toBe(false);
      sheet.close();
      time = 0;
      expect(sheet.settling()).toBe(false);
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
      const opened = vi.fn();
      sheet.info.addEventListener("click", opened);
      sheet.open();
      time += 100;
      fingerClick(sheet.info);
      expect(opened).not.toHaveBeenCalled();
      sheet.info.click();
      expect(opened).toHaveBeenCalledTimes(1);
      time += 400;
      fingerClick(sheet.info);
      expect(opened).toHaveBeenCalledTimes(2);
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

    it("back from the how cards settles again: the list is new under the finger", () => {
      const sheet = make();
      sheet.open();
      time += 2000;
      sheet.showHow(true);
      time += 2000;
      expect(sheet.settling()).toBe(false);
      sheet.showHow(false);
      time += 100;
      expect(sheet.settling()).toBe(true);
      press(sheet.back);
      expect(sheet.isOpen()).toBe(true);
      time += DRAWER_SETTLE_MS;
      expect(sheet.settling()).toBe(false);
    });

    it("a close while the how cards show restores the drawer for next time", () => {
      const sheet = make();
      const key = keyButton();
      const head = part(sheet, ".board-sheet-head");
      const footer = sheet.back.parentElement as HTMLElement;
      sheet.open(key);
      sheet.showHow(true);
      sheet.close();
      expect(sheet.how.hidden).toBe(true);
      expect(head.hidden).toBe(false);
      expect(sheet.list.hidden).toBe(false);
      expect(footer.hidden).toBe(false);
      expect(document.activeElement).toBe(key);
    });
  });

  describe("the kick", () => {
    it("flash shows its words as done, then the resting kick", () => {
      const sheet = make();
      const kick = part(sheet, ".board-sheet-kick");
      sheet.kick("Crew and machines that mine while you rest");
      expect(kick.textContent).toBe(
        "Crew and machines that mine while you rest",
      );
      sheet.flash("Fixed! The crew cheers.", 1600);
      expect(kick.textContent).toBe("Fixed! The crew cheers.");
      expect(kick.classList.contains("is-done")).toBe(true);
      vi.advanceTimersByTime(1599);
      expect(kick.textContent).toBe("Fixed! The crew cheers.");
      vi.advanceTimersByTime(1);
      expect(kick.textContent).toBe(
        "Crew and machines that mine while you rest",
      );
      expect(kick.classList.contains("is-done")).toBe(false);
    });

    it("a kick set during a flash waits for it; a second flash restarts it", () => {
      const sheet = make();
      const kick = part(sheet, ".board-sheet-kick");
      sheet.kick("Old");
      sheet.flash("One", 1000);
      sheet.kick("New");
      expect(kick.textContent).toBe("One");
      vi.advanceTimersByTime(800);
      sheet.flash("Two", 1000);
      vi.advanceTimersByTime(800);
      expect(kick.textContent).toBe("Two");
      vi.advanceTimersByTime(200);
      expect(kick.textContent).toBe("New");
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

  it("is a board-scrim, hidden from readers, on while any sheet is open", async () => {
    const { buys, upgrades, scrim } = setup();
    expect(scrim.classList.contains("board-scrim")).toBe(true);
    expect(scrim.getAttribute("aria-hidden")).toBe("true");
    expect(scrim.classList.contains("is-on")).toBe(false);
    buys.open();
    await Promise.resolve();
    expect(scrim.classList.contains("is-on")).toBe(true);
    upgrades.open();
    buys.close();
    await Promise.resolve();
    expect(scrim.classList.contains("is-on")).toBe(true);
    upgrades.close();
    await Promise.resolve();
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
