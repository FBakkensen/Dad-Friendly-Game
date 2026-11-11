// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { READY_HOLD_MS, THANKS_MS } from "./board-interaction";
import { type Mountain } from "./mountain";
import {
  createMemoryStorage,
  mountScreen,
  setReducedMotion,
  stopScreens,
} from "./mountain-screen.harness";
import { TROUBLE_FIXED } from "./screen-words";
import { writeSessionSave } from "./session-save";
import { minedMountain } from "./test-fixtures";

/*
 * The board's controls on the mounted screen, judged by the board's model: when a finger came
 * down, not when its click was handled. Its own file, so the mountain-screen suites stay within
 * one worker's heap.
 */

beforeEach(() => {
  setReducedMotion(true);
});
afterEach(stopScreens);

type Screen = ReturnType<typeof mountScreen>;

/** A finger's tap whose click has its pointer (detail 1), as a phone sends it. */
const touch = (el: HTMLElement): void => {
  el.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0 }));
  el.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

const find = <T extends HTMLElement>(
  screen: Screen,
  selector: string,
  type: new () => T,
): T => {
  const found = screen.root.querySelector(selector);
  if (!(found instanceof type)) throw new Error(`no ${selector}`);
  return found;
};

describe("the Ready plate on the board's model", () => {
  const CLOCK = 5_000_000;
  /** play's early save: a crewed Topsoil, 18 workers and 6 carts. */
  const early: Mountain = {
    ...minedMountain(500_000),
    pocket: 6_854,
    helpers: 18,
    carts: 6,
  };
  /** The early save on a tap clock the test moves. */
  const onClock = () => {
    const clock = { value: 10_000 };
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: early, lastSeen: CLOCK });
    const screen = mountScreen({
      storage,
      now: () => CLOCK,
      tapClock: () => clock.value,
    });
    return { clock, screen };
  };
  const plateOf = (screen: Screen) =>
    find(screen, ".board-ready", HTMLButtonElement);
  const cartsOf = (screen: Screen) =>
    screen.progress.getSnapshot().mountain.carts;

  it("a finger that came down inside Done buys nothing, even when its click comes after", () => {
    vi.useFakeTimers();
    try {
      const { clock, screen } = onClock();
      /** The tap clock and the timers move on together. */
      const advance = (ms: number): void => {
        clock.value += ms;
        vi.advanceTimersByTime(ms);
      };
      const plate = plateOf(screen);
      touch(plate);
      expect(cartsOf(screen)).toBe(7);
      advance(READY_HOLD_MS - 100);
      plate.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      // A busy phone hands the click over after the hold has ended.
      advance(300);
      expect(screen.root.querySelector(".board-ready-kick")?.textContent).toBe(
        "Ready now",
      );
      plate.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      );
      expect(cartsOf(screen)).toBe(7);
      touch(plate);
      expect(cartsOf(screen)).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a double tap on Buys' Back buys nothing on the plate under it", () => {
    const { clock, screen } = onClock();
    const buys = find(screen, '.board-sheet[data-sheet="buys"]', HTMLElement);
    touch(find(screen, '.board-key[data-key="buys"]', HTMLButtonElement));
    expect(buys.classList.contains("is-open")).toBe(true);
    clock.value += 500;
    touch(
      find(
        screen,
        '.board-sheet[data-sheet="buys"] .board-sheet-back',
        HTMLButtonElement,
      ),
    );
    expect(buys.classList.contains("is-open")).toBe(false);
    clock.value += 150;
    touch(plateOf(screen));
    expect(cartsOf(screen)).toBe(6);
    clock.value += 400;
    touch(plateOf(screen));
    expect(cartsOf(screen)).toBe(7);
  });
});

describe("the bays on the board's model", () => {
  const CLOCK = 5_000_000;
  /** play's early save: a crewed cart bay, with no card coming up over the board. */
  const crewed: Mountain = {
    ...minedMountain(500_000),
    pocket: 6_854,
    helpers: 18,
    carts: 6,
  };
  const onClock = () => {
    const clock = { value: 10_000 };
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: crewed, lastSeen: CLOCK });
    const screen = mountScreen({
      storage,
      now: () => CLOCK,
      tapClock: () => clock.value,
    });
    return { clock, screen };
  };
  const cartBay = (screen: Screen) =>
    find(screen, '.board-bay[data-tier="cart"]', HTMLButtonElement);
  const buysOpen = (screen: Screen): boolean =>
    find(
      screen,
      '.board-sheet[data-sheet="buys"]',
      HTMLElement,
    ).classList.contains("is-open");

  it("a double tap on Buys' Back opens nothing on the bay under it", () => {
    const { clock, screen } = onClock();
    touch(find(screen, '.board-key[data-key="buys"]', HTMLButtonElement));
    expect(buysOpen(screen)).toBe(true);
    clock.value += 500;
    touch(
      find(
        screen,
        '.board-sheet[data-sheet="buys"] .board-sheet-back',
        HTMLButtonElement,
      ),
    );
    expect(buysOpen(screen)).toBe(false);
    clock.value += 150;
    touch(cartBay(screen));
    expect(buysOpen(screen)).toBe(false);
    clock.value += 400;
    touch(cartBay(screen));
    expect(buysOpen(screen)).toBe(true);
  });

  it("a bay's fix thanks the crew for the thanks' time, and the next tap opens Buys", () => {
    vi.useFakeTimers();
    try {
      const { clock, screen } = onClock();
      const advance = (ms: number): void => {
        clock.value += ms;
        vi.advanceTimersByTime(ms);
      };
      screen.progress.layoutPreview.trouble("cart");
      expect(cartBay(screen).dataset["trouble"]).toBe("cave-in");
      // Tapped while the trouble lasts: how many taps it takes depends on the layer.
      for (let tap = 0; tap < 10; tap += 1) {
        if (screen.progress.getSnapshot().trouble === undefined) break;
        touch(cartBay(screen));
      }
      expect(screen.progress.getSnapshot().trouble).toBeUndefined();
      expect(screen.text(".board-note.on")).toBe(TROUBLE_FIXED);
      expect(buysOpen(screen)).toBe(false);
      advance(THANKS_MS - 1);
      expect(screen.text(".board-note.on")).toBe(TROUBLE_FIXED);
      advance(1);
      expect(screen.root.querySelector(".board-note.on")).toBeNull();
      touch(cartBay(screen));
      expect(buysOpen(screen)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
