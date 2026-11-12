// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BY_HAND_MS,
  READY_HOLD_MS,
  createDigButton,
  createReadyPlate,
  doneWords,
  readyWords,
  type ReadyTap,
} from "./board-ready";
import { createBoardHost, type BoardHost } from "./board-host";
import type { ReadyPick } from "./ready-now";

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
});

const fits = (el: HTMLElement): boolean => el.textContent.length <= 26;

const readyCart: ReadyPick = {
  kind: "ready",
  tier: "cart",
  price: 5868,
  gain: 12,
  free: 1,
};

const savingCart: ReadyPick = {
  kind: "saving",
  tier: "cart",
  price: 5868,
  gain: 12,
  free: 1,
  etaMs: 4 * 60_000,
};

const text = (root: HTMLElement, selector: string): string | null | undefined =>
  root.querySelector(selector)?.textContent;

const guardAt = (root: HTMLElement): string | undefined =>
  root.querySelector<HTMLElement>(".board-ready-guard")?.style
    .backgroundPositionX;

const spriteAt = (root: HTMLElement): string | undefined =>
  root.querySelector<HTMLElement>(".board-dig-sprite")?.style
    .backgroundPositionX;

describe("readyWords", () => {
  it("offers a ready cart with its price, its gain and the one free worker", () => {
    const words = readyWords(readyCart);
    expect(words.kick).toBe("Ready now");
    expect(words.main).toEqual(["Buy a cart · 5,868", "Buy a cart"]);
    expect(words.why).toEqual(["+12/s · your free worker can run it", "+12/s"]);
    expect(words.aria).toBe(
      "Ready now: Buy a cart · 5,868, +12/s · your free worker can run it",
    );
    expect(words.guard).toBe("lit");
  });

  it("counts several free workers", () => {
    expect(readyWords({ ...readyCart, free: 3 }).why[0]).toBe(
      "+12/s · 3 free workers can run it",
    );
  });

  it("hires a worker when every hand is busy", () => {
    const words = readyWords({
      kind: "ready",
      tier: "helper",
      price: 20,
      gain: 1,
      free: 0,
    });
    expect(words.main).toEqual(["Hire a worker · 20", "Hire a worker"]);
    expect(words.why[0]).toBe("+1/s · every hand is busy");
  });

  it("calls the first worker the first, not a busy hand (#517)", () => {
    const words = readyWords({
      kind: "ready",
      tier: "helper",
      price: 20,
      gain: 1,
      free: 0,
      firstWorker: true,
    });
    expect(words.why[0]).toBe("+1/s · your first worker");
    expect(words.aria).toBe(
      "Ready now: Hire a worker · 20, +1/s · your first worker",
    );
  });

  it("counts seconds in the last minute of saving (#517)", () => {
    expect(readyWords({ ...savingCart, etaMs: 2_400 }).main[0]).toBe(
      "Saving for a cart · in 3s",
    );
  });

  it("says which idle machine the worker starts (#490)", () => {
    const hire = {
      kind: "ready",
      tier: "helper",
      price: 660,
      gain: 24.4,
      free: 0,
    } as const;
    expect(readyWords({ ...hire, starts: "cart" }).why[0]).toBe(
      "+24/s · starts an idle cart",
    );
    expect(readyWords({ ...hire, starts: "drill" }).why[0]).toBe(
      "+24/s · starts an idle drill",
    );
    expect(readyWords({ ...hire, starts: "borer" }).why[0]).toBe(
      "+24/s · starts an idle borer",
    );
    expect(readyWords({ ...hire, starts: "machine" }).why[0]).toBe(
      "+24/s · starts an idle Great Machine",
    );
    expect(readyWords({ ...hire, starts: "cart" }).aria).toBe(
      "Ready now: Hire a worker · 660, +24/s · starts an idle cart",
    );
  });

  it("names the Great Machine and prices it compactly", () => {
    const words = readyWords({
      kind: "ready",
      tier: "machine",
      price: 120_600_000,
      gain: 50_000,
      free: 4,
    });
    expect(words.main[0]).toBe("Buy a Great Machine · 120.6M");
  });

  it("names the drill and the borer", () => {
    expect(readyWords({ ...readyCart, tier: "drill" }).main[1]).toBe(
      "Buy a drill",
    );
    expect(readyWords({ ...readyCart, tier: "borer" }).main[1]).toBe(
      "Buy a borer",
    );
  });

  it("saves for a cart with the time, and opens Buys", () => {
    const words = readyWords(savingCart);
    expect(words.kick).toBe("Saving for");
    expect(words.main).toEqual([
      "Saving for a cart · in 4m",
      "For a cart · in 4m",
      "Saving for a cart",
    ]);
    expect(words.why).toEqual(["5,868 · +12/s"]);
    expect(words.aria).toBe(
      "Saving for a cart · in 4m. 5,868 · +12/s. Opens Buys",
    );
    expect(words.aria.endsWith("Opens Buys")).toBe(true);
    expect(words.guard).toBe("dim");
  });

  it("saves with no time when the speed gives none", () => {
    const words = readyWords({
      kind: "saving",
      tier: "helper",
      price: 20,
      gain: 1,
      free: 0,
      etaMs: undefined,
    });
    expect(words.main).toEqual(["Saving for a worker", "For a worker"]);
    expect(words.main.join(" ")).not.toContain("NaN");
  });

  it("never prints a time it cannot know", () => {
    const words = readyWords({ ...savingCart, etaMs: Number.NaN });
    expect(words.main).toEqual(["Saving for a cart", "For a cart"]);
  });

  it("says the mountain is mined out, with its guard dark", () => {
    const words = readyWords({ kind: "mined-out" });
    expect(words.kick).toBe("");
    expect(words.main).toEqual(["The mountain is mined out"]);
    expect(words.why).toEqual([""]);
    expect(words.aria).toBe("The mountain is mined out");
    expect(words.guard).toBe("off");
  });
});

describe("doneWords", () => {
  it("says the cart is rolling, with its gain", () => {
    const words = doneWords("cart", 31, 12);
    expect(words.kick).toBe("Done");
    expect(words.main).toEqual(["Done · +12/s", "Done"]);
    expect(words.why).toEqual(["Cart 31 is rolling"]);
    expect(words.aria).toBe("Done. Cart 31 is rolling, +12/s");
    expect(words.guard).toBe("done");
  });

  it("has a line for every other tier", () => {
    expect(doneWords("drill", 4, 90).why[0]).toBe("Drill 4 is drilling");
    expect(doneWords("borer", 2, 700).why[0]).toBe("Borer 2 is boring in");
    expect(doneWords("machine", 1, 50_000).why[0]).toBe(
      "Great Machine 1 is running",
    );
    expect(doneWords("helper", 12, 1).why[0]).toBe("Worker 12 is on the crew");
  });
});

describe("createReadyPlate", () => {
  const bought: ReadyTap = { kind: "bought", tier: "cart", count: 7, gain: 12 };

  /** A board on a clock the test moves, with no press waiting in the queue. */
  const host = (now: { value: number }): BoardHost =>
    createBoardHost({
      clock: () => now.value,
      pressAge: () => 0,
      reduced: () => false,
    });

  const plate = (onTap: () => ReadyTap) => {
    const now = { value: 0 };
    const board = host(now);
    const made = createReadyPlate({ board, onTap, fits });
    document.body.append(made.root);
    return {
      root: made.root,
      button: made.button,
      board,
      now,
      // Bound, so a test can take render out of the plate.
      render: (pick: ReadyPick | undefined, enabled: boolean): void => {
        made.render(pick, enabled);
      },
      /** The board's clock and the timers move on together: a hold ends only when both have. */
      advance: (ms: number): void => {
        now.value += ms;
        vi.advanceTimersByTime(ms);
      },
    };
  };

  /** A finger's tap: down, up and the click, which has a pointer (detail 1). */
  const fingerTap = (button: HTMLElement): void => {
    button.dispatchEvent(new PointerEvent("pointerdown", { button: 0 }));
    button.dispatchEvent(new PointerEvent("pointerup", { button: 0 }));
    button.dispatchEvent(new MouseEvent("click", { detail: 1 }));
  };

  it("builds the row: the guard, the plate and its lines in one live button", () => {
    const { root, button } = plate(() => bought);
    expect(root.classList.contains("board-ready-row")).toBe(true);
    expect(button.classList.contains("board-ready")).toBe(true);
    expect(button.getAttribute("aria-live")).toBe("polite");
    expect(button.type).toBe("button");
    expect(root.querySelector(".board-ready-kick.board-lg")).not.toBeNull();
    expect(root.querySelector("i.board-ready-guard")).not.toBeNull();
    expect(root.querySelector("img.board-ready-plate")).not.toBeNull();
    expect(root.querySelector(".board-ready-main")).not.toBeNull();
    expect(root.querySelector(".board-ready-why")).not.toBeNull();
  });

  it("shows only its frames and art until the save is in", () => {
    const { root, button } = plate(() => bought);
    expect(button.disabled).toBe(true);
    expect(guardAt(root)).toBe("-320px");
    expect(text(root, ".board-ready-kick")).toBe("");
    expect(text(root, ".board-ready-main")).toBe("");
    expect(text(root, ".board-ready-why")).toBe("");
  });

  it("shows a ready pick: the kick, the lines that fit, and a lit guard", () => {
    const { root, button, render } = plate(() => bought);
    render(readyCart, true);
    expect(text(root, ".board-ready-kick")).toBe("Ready now");
    expect(text(root, ".board-ready-main")).toBe("Buy a cart · 5,868");
    expect(text(root, ".board-ready-why")).toBe("+12/s");
    expect(guardAt(root)).toBe("0px");
    expect(button.disabled).toBe(false);
    expect(button.classList.contains("is-saving")).toBe(false);
    expect(button.getAttribute("aria-label")).toBe(
      "Ready now: Buy a cart · 5,868, +12/s · your free worker can run it",
    );
  });

  it("buys exactly one on a double tap, holds Done for 1.9s, then shows the last pick", () => {
    const onTap = vi.fn(() => bought);
    const { root, button, render, advance } = plate(onTap);
    render(readyCart, true);
    button.click();
    button.click();
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(text(root, ".board-ready-kick")).toBe("Done");
    expect(text(root, ".board-ready-main")).toBe("Done · +12/s");
    expect(text(root, ".board-ready-why")).toBe("Cart 7 is rolling");
    expect(guardAt(root)).toBe("-240px");
    expect(button.classList.contains("is-done")).toBe(true);
    expect(button.getAttribute("aria-label")).toBe(
      "Done. Cart 7 is rolling, +12/s",
    );

    render(savingCart, true);
    expect(text(root, ".board-ready-main")).toBe("Done · +12/s");

    advance(1800);
    button.click();
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(text(root, ".board-ready-main")).toBe("Done · +12/s");

    advance(READY_HOLD_MS - 1800);
    expect(text(root, ".board-ready-kick")).toBe("Saving for");
    expect(text(root, ".board-ready-main")).toBe("Saving for a cart · in 4m");
    expect(button.classList.contains("is-done")).toBe(false);
    expect(button.classList.contains("is-saving")).toBe(true);
    expect(guardAt(root)).toBe("-80px");
    button.click();
    expect(onTap).toHaveBeenCalledTimes(2);
  });

  it("a held key's repeats inside the hold buy nothing more", () => {
    const onTap = vi.fn(() => bought);
    const { button, render, advance } = plate(onTap);
    render(readyCart, true);
    for (let i = 0; i < 10; i += 1) {
      button.click();
      advance(100);
    }
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("a press whose finger came down inside the Done hold is held, even if handled after it", () => {
    const onTap = vi.fn(() => bought);
    const { root, button, render, advance } = plate(onTap);
    render(readyCart, true);
    fingerTap(button);
    expect(onTap).toHaveBeenCalledTimes(1);
    advance(READY_HOLD_MS - 100);
    // The second tap's finger comes down inside the hold; a busy phone hands its click over
    // only after the hold has ended.
    button.dispatchEvent(new PointerEvent("pointerdown", { button: 0 }));
    advance(300);
    expect(text(root, ".board-ready-kick")).toBe("Ready now");
    button.dispatchEvent(new MouseEvent("click", { detail: 1 }));
    expect(onTap).toHaveBeenCalledTimes(1);
    // A new tap after the hold buys.
    fingerTap(button);
    expect(onTap).toHaveBeenCalledTimes(2);
  });

  it("a finger press on the plate right after a finger closed a drawer is ignored", () => {
    const onTap = vi.fn(() => bought);
    const { board, now, button, render, advance } = plate(onTap);
    render(readyCart, true);
    board.send({ kind: "open", overlay: "buys", at: now.value });
    advance(500);
    // The double tap on Back: its second tap lands on the plate under it.
    board.send({ kind: "close", overlay: "buys", at: now.value, by: "finger" });
    advance(150);
    fingerTap(button);
    expect(onTap).not.toHaveBeenCalled();
    advance(400);
    fingerTap(button);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it.each([{ kind: "opened" } as const, { kind: "nothing" } as const])(
    "holds nothing when the tap $kind",
    (result) => {
      const onTap = vi.fn((): ReadyTap => result);
      const { root, button, board, render } = plate(onTap);
      render(savingCart, true);
      button.click();
      button.click();
      expect(onTap).toHaveBeenCalledTimes(2);
      expect(board.view().held.size).toBe(0);
      expect(text(root, ".board-ready-kick")).toBe("Saving for");
    },
  );

  it("holds nothing when the tap throws, so the plate never sticks", () => {
    const onTap = vi.fn((): ReadyTap => {
      throw new Error("store gone");
    });
    const { button, board, render } = plate(onTap);
    render(readyCart, true);
    expect(() => {
      button.click();
    }).toThrow("store gone");
    expect(board.view().held.size).toBe(0);
    onTap.mockImplementation(() => ({ kind: "nothing" }));
    button.click();
    expect(onTap).toHaveBeenCalledTimes(2);
  });

  it("paints a render that came during the tap", () => {
    const late: { render?: (pick: ReadyPick, enabled: boolean) => void } = {};
    const { root, button, render } = plate((): ReadyTap => {
      late.render?.(savingCart, true);
      return { kind: "nothing" };
    });
    late.render = render;
    render(readyCart, true);
    button.click();
    expect(text(root, ".board-ready-kick")).toBe("Saving for");
  });

  it("while Done holds, the button keeps its disabled; the latest pick paints when it ends", () => {
    const { root, button, render, advance } = plate(() => bought);
    render(readyCart, true);
    button.click();
    render(readyCart, false);
    expect(button.disabled).toBe(false);
    expect(text(root, ".board-ready-kick")).toBe("Done");
    advance(READY_HOLD_MS);
    expect(button.disabled).toBe(true);
    expect(text(root, ".board-ready-kick")).toBe("Ready now");
  });

  it("a save that loads again during the Done hold ends the hold at once", () => {
    const onTap = vi.fn(() => bought);
    const { root, button, board, render, advance } = plate(onTap);
    render(readyCart, true);
    button.click();
    expect(text(root, ".board-ready-kick")).toBe("Done");
    // The screen tells the board first, then renders the loading plate.
    board.send({ kind: "unloaded" });
    render(undefined, false);
    expect(text(root, ".board-ready-kick")).toBe("");
    expect(text(root, ".board-ready-main")).toBe("");
    expect(text(root, ".board-ready-why")).toBe("");
    expect(button.classList.contains("is-done")).toBe(false);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Loading your save...");
    // The save is in again: a tap buys, and the old hold does not cut the new Done short.
    render(readyCart, true);
    expect(text(root, ".board-ready-kick")).toBe("Ready now");
    advance(1000);
    button.click();
    expect(onTap).toHaveBeenCalledTimes(2);
    advance(READY_HOLD_MS - 1000);
    expect(text(root, ".board-ready-kick")).toBe("Done");
    advance(1000);
    expect(text(root, ".board-ready-kick")).toBe("Ready now");
  });

  it("goes dark and disabled for no save, and when mined out", () => {
    const { root, button, render } = plate(() => bought);
    render(readyCart, true);
    render(undefined, false);
    expect(button.disabled).toBe(true);
    expect(guardAt(root)).toBe("-320px");
    expect(text(root, ".board-ready-main")).toBe("");

    render({ kind: "mined-out" }, true);
    expect(button.disabled).toBe(true);
    expect(text(root, ".board-ready-main")).toBe("The mountain is mined out");
    expect(text(root, ".board-ready-kick")).toBe("");
    expect(guardAt(root)).toBe("-320px");
    expect(button.getAttribute("aria-label")).toBe("The mountain is mined out");
  });

  it("is disabled when the board says so", () => {
    const { button, render } = plate(() => bought);
    render(readyCart, false);
    expect(button.disabled).toBe(true);
  });

  it("presses the guard on a ready pick, and not while saving or holding", () => {
    const { root, button, render } = plate(() => bought);
    render(savingCart, true);
    button.dispatchEvent(new Event("pointerdown"));
    expect(guardAt(root)).toBe("-80px");

    render(readyCart, true);
    button.dispatchEvent(new Event("pointerdown"));
    expect(guardAt(root)).toBe("-160px");
    button.dispatchEvent(new Event("pointerleave"));
    expect(guardAt(root)).toBe("0px");

    button.click();
    button.dispatchEvent(new Event("pointerdown"));
    expect(guardAt(root)).toBe("-240px");
  });

  it("fits the longest line that fits, and measures again only when the words change", () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(176);
    const measured = vi.fn(fits);
    const made = createReadyPlate({
      board: host({ value: 0 }),
      onTap: () => bought,
      fits: measured,
    });
    document.body.append(made.root);
    const machine: ReadyPick = {
      kind: "saving",
      tier: "machine",
      price: 120_600_000,
      gain: 50_000,
      free: 4,
      etaMs: 65 * 60_000,
    };
    made.render(machine, true);
    expect(text(made.root, ".board-ready-main")).toBe(
      "Saving for a Great Machine",
    );
    const calls = measured.mock.calls.length;
    made.render(machine, true);
    expect(measured.mock.calls.length).toBe(calls);
  });

  describe("fitting while the page settles", () => {
    /** A font set the test loads by hand: happy-dom has none. */
    const fontSet = (): { load: () => void; ready: () => void } => {
      let settle = (): void => undefined;
      const ready = new Promise<void>((resolve) => {
        settle = resolve;
      });
      const fonts = Object.assign(new EventTarget(), { ready });
      Object.defineProperty(document, "fonts", {
        value: fonts,
        configurable: true,
      });
      return {
        load: () => fonts.dispatchEvent(new Event("loadingdone")),
        ready: settle,
      };
    };

    afterEach(() => {
      Reflect.deleteProperty(document, "fonts");
      vi.restoreAllMocks();
      document.body.replaceChildren();
    });

    const sized = (): void => {
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
        176,
      );
    };

    /** A plate whose fit takes 10 characters until `widen`, then 40. */
    const limited = (): {
      root: HTMLElement;
      button: HTMLButtonElement;
      render(): void;
      widen(): void;
    } => {
      let limit = 10;
      const made = createReadyPlate({
        board: host({ value: 0 }),
        onTap: () => bought,
        fits: (el) => el.textContent.length <= limit,
      });
      document.body.append(made.root);
      return {
        root: made.root,
        button: made.button,
        render: () => {
          made.render(readyCart, true);
        },
        widen: () => {
          limit = 40;
        },
      };
    };

    it("keeps no fit measured in a box with no width yet", () => {
      const plate = limited();
      plate.render();
      expect(text(plate.root, ".board-ready-main")).toBe("Buy a cart");
      plate.widen();
      plate.render();
      expect(text(plate.root, ".board-ready-main")).toBe("Buy a cart · 5,868");
    });

    it("keeps a fit measured on the page until a font loads", () => {
      sized();
      const fonts = fontSet();
      const plate = limited();
      plate.render();
      plate.widen();
      plate.render();
      expect(text(plate.root, ".board-ready-main")).toBe("Buy a cart");
      fonts.load();
      expect(text(plate.root, ".board-ready-main")).toBe("Buy a cart · 5,868");
    });

    it("a font that loads during the Done hold keeps the Done words, fitted again", () => {
      sized();
      const fonts = fontSet();
      const plate = limited();
      plate.render();
      plate.button.click();
      expect(text(plate.root, ".board-ready-main")).toBe("Done");
      plate.widen();
      fonts.load();
      expect(text(plate.root, ".board-ready-kick")).toBe("Done");
      expect(text(plate.root, ".board-ready-main")).toBe("Done · +12/s");
    });

    it("fits again once the fonts are ready", async () => {
      sized();
      const fonts = fontSet();
      const plate = limited();
      plate.render();
      plate.widen();
      fonts.ready();
      await Promise.resolve();
      await Promise.resolve();
      expect(text(plate.root, ".board-ready-main")).toBe("Buy a cart · 5,868");
    });
  });

  it("falls back to the default fit: the first option that does not overflow", () => {
    const made = createReadyPlate({
      board: host({ value: 0 }),
      onTap: () => bought,
    });
    made.render(readyCart, true);
    // happy-dom lays nothing out, so every option fits and the longest shows.
    expect(text(made.root, ".board-ready-why")).toBe(
      "+12/s · your free worker can run it",
    );
  });
});

describe("createDigButton", () => {
  const make = (onPress: () => void = () => undefined) => {
    const made = createDigButton({ onPress });
    document.body.append(made.root);
    // Bound, so a test can take the calls out of the button.
    return {
      root: made.root,
      button: made.button,
      set: (
        tapYield: number | undefined,
        enabled: boolean,
        label: string,
      ): void => {
        made.set(tapYield, enabled, label);
      },
      loading: (): void => {
        made.loading();
      },
      dug: (mined: number): void => {
        made.dug(mined);
      },
      echo: (): void => {
        made.echo();
      },
    };
  };

  it("builds the red button, its sprite and its legend", () => {
    const { root, button } = make();
    expect(root.classList.contains("board-dig")).toBe(true);
    expect(button.classList.contains("board-dig-button")).toBe(true);
    expect(button.type).toBe("button");
    expect(root.querySelector("i.board-dig-sprite")).not.toBeNull();
    expect(root.querySelector(".board-dig-lg.board-lg b")).not.toBeNull();
  });

  it("shows no words or numbers until the save is in", () => {
    const { root, button } = make();
    expect(button.disabled).toBe(true);
    expect(text(root, ".board-dig-lg")).toBe("");
    expect(spriteAt(root)).toBe("0px");
  });

  it("reads Dig and the tap yield, and digs on a click", () => {
    const onPress = vi.fn();
    const { root, button, set } = make(onPress);
    set(20, true, "Dig: tap to mine 20 stones");
    expect(text(root, ".board-dig-lg")).toBe("Dig · +20");
    expect(text(root, ".board-dig-lg b")).toBe("+20");
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-label")).toBe(
      "Dig: tap to mine 20 stones",
    );
    button.click();
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("tallies digs by hand, then settles back to Dig after 1.5s", () => {
    const { root, set, dug } = make();
    set(20, true, "Dig");
    dug(20);
    vi.advanceTimersByTime(1000);
    dug(20);
    vi.advanceTimersByTime(1000);
    dug(20);
    expect(text(root, ".board-dig-lg")).toBe("By hand · +60");
    expect(root.classList.contains("is-hit")).toBe(true);

    set(25, true, "Dig");
    expect(text(root, ".board-dig-lg")).toBe("By hand · +60");

    vi.advanceTimersByTime(BY_HAND_MS - 1);
    expect(text(root, ".board-dig-lg")).toBe("By hand · +60");
    vi.advanceTimersByTime(1);
    expect(text(root, ".board-dig-lg")).toBe("Dig · +25");
    expect(root.classList.contains("is-hit")).toBe(false);

    dug(25);
    expect(text(root, ".board-dig-lg")).toBe("By hand · +25");
  });

  it("presses down, pops up on the click, and rests after 70ms", () => {
    const { root, button, set } = make();
    set(20, true, "Dig");
    button.dispatchEvent(new Event("pointerdown"));
    expect(spriteAt(root)).toBe("-112px");
    button.click();
    expect(spriteAt(root)).toBe("-224px");
    button.dispatchEvent(new Event("pointerup"));
    expect(spriteAt(root)).toBe("-224px");
    vi.advanceTimersByTime(69);
    expect(spriteAt(root)).toBe("-224px");
    vi.advanceTimersByTime(1);
    expect(spriteAt(root)).toBe("0px");
  });

  it("shows no down frame for a press while disabled", () => {
    const { root, button } = make();
    expect(button.disabled).toBe(true);
    button.dispatchEvent(new Event("pointerdown"));
    expect(spriteAt(root)).toBe("0px");
  });

  it("lets go of a press that leaves or is cancelled", () => {
    const { root, button, set } = make();
    set(20, true, "Dig");
    button.dispatchEvent(new Event("pointerdown"));
    button.dispatchEvent(new Event("pointerleave"));
    expect(spriteAt(root)).toBe("0px");
    button.dispatchEvent(new Event("pointerdown"));
    button.dispatchEvent(new Event("pointercancel"));
    expect(spriteAt(root)).toBe("0px");
  });

  it("echoes a window tap: down, up, rest over 140ms", () => {
    const { root, echo } = make();
    echo();
    expect(spriteAt(root)).toBe("-112px");
    vi.advanceTimersByTime(80);
    expect(spriteAt(root)).toBe("-224px");
    vi.advanceTimersByTime(59);
    expect(spriteAt(root)).toBe("-224px");
    vi.advanceTimersByTime(1);
    expect(spriteAt(root)).toBe("0px");
  });

  it("skips the echo under reduced motion", () => {
    motion(true);
    const { root, echo } = make();
    echo();
    expect(spriteAt(root)).toBe("0px");
    vi.advanceTimersByTime(200);
    expect(spriteAt(root)).toBe("0px");
  });

  it("is disabled with the mined-out label and no legend", () => {
    const { root, button, set } = make();
    set(20, true, "Dig");
    set(undefined, false, "The mountain is mined out");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("The mountain is mined out");
    expect(text(root, ".board-dig-lg")).toBe("");
  });

  it("goes back to loading when the save loads again: disabled, no words, no tally", () => {
    const { root, button, set, dug, loading } = make();
    set(20, true, "Dig: tap to mine 20 stones");
    dug(20);
    expect(text(root, ".board-dig-lg")).toBe("By hand · +20");
    loading();
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Loading your save...");
    expect(text(root, ".board-dig-lg")).toBe("");
    expect(root.classList.contains("is-hit")).toBe(false);
    vi.advanceTimersByTime(BY_HAND_MS);
    expect(text(root, ".board-dig-lg")).toBe("");
    // The next save starts its own tally.
    set(5, true, "Dig");
    dug(5);
    expect(text(root, ".board-dig-lg")).toBe("By hand · +5");
  });
});
