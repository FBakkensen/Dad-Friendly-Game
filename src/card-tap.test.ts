// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createBoardHost } from "./board-host";
import {
  buyOnTap,
  forgetAll,
  pressLook,
  pressOnBoard,
  trackPress,
} from "./card-tap";

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

describe("forgetAll", () => {
  it("drops every tracker's finger-down time, so no later click carries it", () => {
    const made = [0, 1].map(() => {
      const target = document.createElement("button");
      document.body.append(target);
      const tracker = trackPress(target, {
        clock: () => 1_000,
        pressAge: () => 0,
      });
      const seen: unknown[] = [];
      target.addEventListener("click", (event) => {
        seen.push(tracker.press(event));
      });
      return { target, tracker, seen };
    });
    const forget = forgetAll(made.map((each) => each.tracker));
    for (const each of made) {
      pointer(each.target, "pointerdown");
    }
    forget();
    for (const each of made) {
      fingerClick(each.target);
    }
    expect(made.map((each) => each.seen)).toEqual([
      [{ by: "finger", downAt: undefined }],
      [{ by: "finger", downAt: undefined }],
    ]);
  });
});

describe("pressOnBoard", () => {
  const control = { layer: "board", id: "key:upgrades" } as const;
  /** A host whose drawer a finger closed at 1,000, so the board settles up to 1,400. */
  const settled = (): {
    now: { value: number };
    host: ReturnType<typeof createBoardHost>;
    target: HTMLButtonElement;
  } => {
    const now = { value: 1_000 };
    const host = createBoardHost({
      clock: () => now.value,
      pressAge: () => 0,
      reduced: () => false,
    });
    host.send({ kind: "open", overlay: "buys", at: 0 });
    host.send({ kind: "close", overlay: "buys", at: 1_000, by: "finger" });
    const target = document.createElement("button");
    document.body.append(target);
    return { now, host, target };
  };

  it("judges a finger's press by when its finger came down", () => {
    const { now, host, target } = settled();
    const seen: string[] = [];
    pressOnBoard(target, host, control, (decision) => seen.push(decision));
    now.value = 1_100;
    pointer(target, "pointerdown");
    now.value = 1_900;
    fingerClick(target);
    now.value = 2_000;
    fingerClick(target);
    expect(seen).toEqual(["ignore-early", "act"]);
  });

  it("never judges a key press early, and reports how it came", () => {
    const { now, host, target } = settled();
    const seen: unknown[] = [];
    pressOnBoard(target, host, control, (decision, by) =>
      seen.push([decision, by]),
    );
    now.value = 1_100;
    target.click();
    expect(seen).toEqual([["act", "keyboard"]]);
  });

  it("lets a capture listener stop the click an early press would have sent on", () => {
    const { now, host, target } = settled();
    const inner = document.createElement("span");
    target.append(inner);
    const reached = vi.fn();
    inner.addEventListener("click", reached);
    pressOnBoard(
      target,
      host,
      control,
      (decision, _by, event) => {
        if (decision !== "act") {
          event.stopPropagation();
        }
      },
      { capture: true },
    );
    now.value = 1_100;
    fingerClick(inner);
    expect(reached).not.toHaveBeenCalled();
    now.value = 1_500;
    fingerClick(inner);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it("forget drops the finger-down time, so the click is judged by its own age", () => {
    const { now, host, target } = settled();
    const seen: string[] = [];
    const press = pressOnBoard(target, host, control, (decision) =>
      seen.push(decision),
    );
    now.value = 1_100;
    pointer(target, "pointerdown");
    press.forget();
    now.value = 1_900;
    fingerClick(target);
    expect(seen).toEqual(["act"]);
  });

  it("reads the control from the click, and presses nothing for a click on none", () => {
    const { now, host, target } = settled();
    const inner = document.createElement("span");
    target.append(inner);
    const seen: string[] = [];
    pressOnBoard(
      target,
      host,
      (click) => (click.target === inner ? control : undefined),
      (decision) => seen.push(decision),
    );
    now.value = 1_100;
    fingerClick(target);
    expect(seen).toEqual([]);
    fingerClick(inner);
    expect(seen).toEqual(["ignore-early"]);
  });

  it("reads a trouble press from the click, which the settle never stops", () => {
    const { now, host, target } = settled();
    let troubled = true;
    const seen: string[] = [];
    pressOnBoard(target, host, control, (decision) => seen.push(decision), {
      intent: () => (troubled ? "trouble" : "act"),
    });
    now.value = 1_100;
    fingerClick(target);
    troubled = false;
    fingerClick(target);
    expect(seen).toEqual(["act", "ignore-early"]);
  });
});

describe("pressLook", () => {
  const look = (
    options: {
      enabled?: (event: PointerEvent) => boolean;
      lifts?: Parameters<typeof pressLook>[1]["lifts"];
    } = {},
  ) => {
    const target = document.createElement("button");
    document.body.append(target);
    const paint = vi.fn<(down: boolean) => void>();
    const handle = pressLook(target, {
      enabled: options.enabled ?? (() => true),
      lifts: options.lifts ?? ["pointerup", "pointerleave", "pointercancel"],
      paint,
    });
    return { target, paint, handle };
  };

  it("an enabled press paints down, and each lift event paints up once", () => {
    for (const type of ["pointerup", "pointerleave", "pointercancel"]) {
      const { target, paint, handle } = look();
      pointer(target, "pointerdown");
      expect(paint.mock.calls).toEqual([[true]]);
      expect(handle.isDown()).toBe(true);
      pointer(target, type);
      pointer(target, type);
      expect(paint.mock.calls).toEqual([[true], [false]]);
      expect(handle.isDown()).toBe(false);
    }
  });

  it("a press that is not enabled paints nothing", () => {
    const { target, paint, handle } = look({ enabled: () => false });
    pointer(target, "pointerdown");
    expect(paint).not.toHaveBeenCalled();
    expect(handle.isDown()).toBe(false);
  });

  it("a lift when not down paints nothing", () => {
    const { target, paint, handle } = look();
    pointer(target, "pointerup");
    handle.lift();
    expect(paint).not.toHaveBeenCalled();
  });

  it("a second press while down paints down again", () => {
    const { target, paint } = look();
    pointer(target, "pointerdown");
    pointer(target, "pointerdown");
    expect(paint.mock.calls).toEqual([[true], [true]]);
  });

  it("lift() lifts from code, as the rows' slop does", () => {
    const { target, paint, handle } = look();
    pointer(target, "pointerdown");
    handle.lift();
    expect(paint.mock.calls).toEqual([[true], [false]]);
    expect(handle.isDown()).toBe(false);
  });

  it("only the listed events lift", () => {
    const { target, paint, handle } = look({ lifts: ["pointercancel"] });
    pointer(target, "pointerdown");
    pointer(target, "pointerup");
    pointer(target, "pointerleave");
    target.click();
    expect(handle.isDown()).toBe(true);
    expect(paint.mock.calls).toEqual([[true]]);
    pointer(target, "pointercancel");
    expect(paint.mock.calls).toEqual([[true], [false]]);
  });

  it("passes the pointerdown to enabled", () => {
    const { target, paint } = look({ enabled: (event) => event.button === 0 });
    target.dispatchEvent(new PointerEvent("pointerdown", { button: 2 }));
    expect(paint).not.toHaveBeenCalled();
  });
});
