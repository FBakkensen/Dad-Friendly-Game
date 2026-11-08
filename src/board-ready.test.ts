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

  const plate = (onTap: () => ReadyTap) => {
    const made = createReadyPlate({ onTap, fits });
    document.body.append(made.root);
    // Bound, so a test can take render out of the plate.
    return {
      root: made.root,
      button: made.button,
      render: (pick: ReadyPick | undefined, enabled: boolean): void => {
        made.render(pick, enabled);
      },
    };
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
    const { root, button, render } = plate(onTap);
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

    vi.advanceTimersByTime(1800);
    button.click();
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(text(root, ".board-ready-main")).toBe("Done · +12/s");

    vi.advanceTimersByTime(READY_HOLD_MS - 1800);
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
    const { button, render } = plate(onTap);
    render(readyCart, true);
    for (let i = 0; i < 10; i += 1) {
      button.click();
      vi.advanceTimersByTime(100);
    }
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it.each([{ kind: "opened" } as const, { kind: "nothing" } as const])(
    "releases the hold at once when the tap $kind",
    (result) => {
      const onTap = vi.fn((): ReadyTap => result);
      const { root, button, render } = plate(onTap);
      render(savingCart, true);
      button.click();
      button.click();
      expect(onTap).toHaveBeenCalledTimes(2);
      expect(text(root, ".board-ready-kick")).toBe("Saving for");
    },
  );

  it("lets go when the tap throws, so the plate never sticks", () => {
    const onTap = vi.fn((): ReadyTap => {
      throw new Error("store gone");
    });
    const { button, render } = plate(onTap);
    render(readyCart, true);
    expect(() => {
      button.click();
    }).toThrow("store gone");
    onTap.mockImplementation(() => ({ kind: "nothing" }));
    button.click();
    expect(onTap).toHaveBeenCalledTimes(2);
  });

  it("paints a render that came during the tap once the hold lets go", () => {
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
    const measured = vi.fn(fits);
    const made = createReadyPlate({ onTap: () => bought, fits: measured });
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

  it("falls back to the default fit: the first option that does not overflow", () => {
    const made = createReadyPlate({ onTap: () => bought });
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
      set: (tapYield: number, enabled: boolean, label: string): void => {
        made.set(tapYield, enabled, label);
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

  it("is disabled with the mined-out label", () => {
    const { button, set } = make();
    set(20, true, "Dig");
    set(20, false, "The mountain is mined out");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("The mountain is mined out");
  });
});
