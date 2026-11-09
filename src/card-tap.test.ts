// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buyOnTap, trackPress } from "./card-tap";

afterEach(() => {
  document.body.replaceChildren();
});

const pointer = (target: HTMLElement, type: string): void => {
  target.dispatchEvent(
    new PointerEvent(type, { bubbles: true, button: 0, clientX: 50 }),
  );
};

/** A drawer row inside the drawer's scrolling list. */
const rowInList = (): { list: HTMLElement; row: HTMLButtonElement } => {
  const list = document.createElement("div");
  list.className = "board-sheet-list";
  const row = document.createElement("button");
  row.type = "button";
  list.append(row);
  document.body.append(list);
  return { list, row };
};

/** The click a finger's tap ends in: `detail` 1. A key press clicks with detail 0. */
const fingerClick = (target: HTMLElement): void => {
  target.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

describe("buyOnTap", () => {
  it("a drag on the drawer's list never buys", () => {
    const { list, row } = rowInList();
    const buy = vi.fn();
    buyOnTap(row, row, buy, { clock: () => 0 });
    pointer(row, "pointerdown");
    list.scrollTop += 10;
    pointer(row, "pointerup");
    // The click the browser sends after the gesture.
    row.click();
    expect(buy).not.toHaveBeenCalled();
  });

  it("a still tap on the list buys once", () => {
    const { row } = rowInList();
    const buy = vi.fn();
    buyOnTap(row, row, buy, { clock: () => 500 });
    pointer(row, "pointerdown");
    pointer(row, "pointerup");
    fingerClick(row);
    expect(buy).toHaveBeenCalledTimes(1);
  });
});

describe("how buyOnTap reports a press", () => {
  /** The press `buy` was handed the last time it ran. */
  const lastPress = (buy: ReturnType<typeof vi.fn>): unknown =>
    buy.mock.lastCall?.[0];

  it("reports a finger press with its finger-down time", () => {
    const { row } = rowInList();
    const buy = vi.fn();
    let clock = 1_000;
    buyOnTap(row, row, buy, { clock: () => clock, pressAge: () => 30 });
    pointer(row, "pointerdown");
    // Held long: still judged by when it came down.
    clock += 2_000;
    pointer(row, "pointerup");
    fingerClick(row);
    expect(lastPress(buy)).toEqual({ by: "finger", downAt: 970 });
    expect(buy.mock.lastCall?.[1]).toBeInstanceOf(MouseEvent);
  });

  it("reports a key press as keyboard with no finger-down time", () => {
    const { row } = rowInList();
    const buy = vi.fn();
    buyOnTap(row, row, buy, { clock: () => 1_000 });
    row.click();
    expect(lastPress(buy)).toEqual({ by: "keyboard", downAt: undefined });
  });

  it("a touch click with no pointerdown on this card reports no finger-down time", () => {
    // A touch's click lands where the finger lifts: a row that slid under it while the drawer
    // rose, which never saw the pointerdown. The board judges it by the click's own age.
    const { row } = rowInList();
    const buy = vi.fn();
    buyOnTap(row, row, buy, { clock: () => 1_000 });
    fingerClick(row);
    expect(lastPress(buy)).toEqual({ by: "finger", downAt: undefined });
  });

  it("the click it sends itself at a finger's pointerup is a finger's", () => {
    const card = document.createElement("div");
    const button = document.createElement("button");
    card.append(button);
    document.body.append(card);
    const buy = vi.fn();
    buyOnTap(card, button, buy, { clock: () => 1_000, pressAge: () => 0 });
    pointer(card, "pointerdown");
    pointer(card, "pointerup");
    expect(lastPress(buy)).toEqual({ by: "finger", downAt: 1_000 });
  });

  it("forgets the finger-down time at the click, at pointercancel, at a drag, and on forget()", () => {
    const { list, row } = rowInList();
    const buy = vi.fn();
    let clock = 1_000;
    const tracker = buyOnTap(row, row, buy, {
      clock: () => clock,
      pressAge: () => 0,
    });
    const lateClick = (): unknown => {
      clock += 1_000;
      fingerClick(row);
      return lastPress(buy);
    };
    const untracked = { by: "finger", downAt: undefined };

    // At the click: the next click on its own has no finger-down time.
    pointer(row, "pointerdown");
    pointer(row, "pointerup");
    fingerClick(row);
    expect(lastPress(buy)).toEqual({ by: "finger", downAt: 1_000 });
    expect(lateClick()).toEqual(untracked);

    // At pointercancel and at a drag (the list scrolled under the finger): the gesture's
    // clicks report nothing, so its finger-down time can never reach a later press.
    const calls = buy.mock.calls.length;
    pointer(row, "pointerdown");
    pointer(row, "pointercancel");
    fingerClick(row);
    lateClick();
    pointer(row, "pointerdown");
    list.scrollTop += 10;
    pointer(row, "pointerup");
    fingerClick(row);
    lateClick();
    expect(buy.mock.calls.length).toBe(calls);

    // On forget(): the drawer moved on under a finger that never lifted here.
    pointer(row, "pointerdown");
    tracker.forget();
    expect(lateClick()).toEqual(untracked);
  });
});

describe("trackPress", () => {
  const button = (): HTMLButtonElement => {
    const made = document.createElement("button");
    document.body.append(made);
    return made;
  };
  /** The press each click on `target` reports, in order. */
  const reported = (
    target: HTMLElement,
    tracker: ReturnType<typeof trackPress>,
  ): unknown[] => {
    const seen: unknown[] = [];
    target.addEventListener("click", (event) => {
      seen.push(tracker.press(event));
    });
    return seen;
  };

  it("keeps a main-button finger-down time on the clock, less the press's age, until the click", () => {
    const back = button();
    let clock = 1_000;
    const tracker = trackPress(back, {
      clock: () => clock,
      pressAge: () => 30,
    });
    const seen = reported(back, tracker);
    pointer(back, "pointerdown");
    clock += 2_000;
    fingerClick(back);
    fingerClick(back);
    back.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 2 }),
    );
    fingerClick(back);
    expect(seen).toEqual([
      { by: "finger", downAt: 970 },
      { by: "finger", downAt: undefined },
      { by: "finger", downAt: undefined },
    ]);
  });

  it("a click with no pointer is the keyboard, with no finger-down time, unless it sent that click itself", () => {
    const back = button();
    const tracker = trackPress(back, { clock: () => 1_000, pressAge: () => 0 });
    const seen = reported(back, tracker);
    pointer(back, "pointerdown");
    back.click();
    pointer(back, "pointerdown");
    tracker.clickFor(back);
    back.click();
    expect(seen).toEqual([
      { by: "keyboard", downAt: undefined },
      { by: "finger", downAt: 1_000 },
      { by: "keyboard", downAt: undefined },
    ]);
  });

  it("forgets the finger-down time at pointercancel and on forget()", () => {
    const back = button();
    const tracker = trackPress(back, { clock: () => 1_000, pressAge: () => 0 });
    const seen = reported(back, tracker);
    pointer(back, "pointerdown");
    pointer(back, "pointercancel");
    fingerClick(back);
    pointer(back, "pointerdown");
    tracker.forget();
    fingerClick(back);
    expect(seen).toEqual([
      { by: "finger", downAt: undefined },
      { by: "finger", downAt: undefined },
    ]);
  });

  it("listens in the capture phase when asked, so a host hears its cards' presses first", () => {
    const host = document.createElement("div");
    const inner = button();
    host.append(inner);
    document.body.append(host);
    const tracker = trackPress(
      host,
      { clock: () => 1_000, pressAge: () => 0 },
      { capture: true },
    );
    inner.addEventListener("pointerdown", (event) => {
      event.stopPropagation();
    });
    const seen: unknown[] = [];
    inner.addEventListener("click", (event) => {
      seen.push(tracker.press(event));
    });
    pointer(inner, "pointerdown");
    fingerClick(inner);
    expect(seen).toEqual([{ by: "finger", downAt: 1_000 }]);
  });
});
