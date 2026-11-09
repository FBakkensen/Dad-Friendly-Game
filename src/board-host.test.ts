// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createBoardHost, eventAge } from "./board-host";
import type { BoardInput, ControlRef } from "./board-interaction";

const row: ControlRef = { layer: "buys", id: "drill" };
const applied = (at: number): BoardInput => ({
  kind: "result",
  control: row,
  at,
  outcome: "applied",
});

let now = 0;
const clock = () => now;

beforeEach(() => {
  vi.useFakeTimers();
  now = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

function advance(to: number): void {
  const by = to - now;
  now = to;
  vi.advanceTimersByTime(by);
}

describe("the board host", () => {
  it("wakes once at the next change and repaints", () => {
    const host = createBoardHost({ clock, reduced: () => false });
    const paint = vi.fn();
    host.subscribe(paint);
    host.send(applied(0));
    expect(paint).toHaveBeenCalledTimes(1);
    expect(host.view().held.has("buys/drill")).toBe(true);
    advance(1899);
    expect(paint).toHaveBeenCalledTimes(1);
    advance(1900);
    expect(paint).toHaveBeenCalledTimes(2);
    expect(host.view().held.has("buys/drill")).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("re-arms before painting, so a painter that throws strands nothing", () => {
    const host = createBoardHost({ clock, reduced: () => false });
    let armedWhenPainted = -1;
    host.subscribe(() => {
      armedWhenPainted = vi.getTimerCount();
      throw new Error("paint failed");
    });
    expect(() => {
      host.send(applied(0));
    }).toThrow("paint failed");
    expect(armedWhenPainted).toBe(1);
    expect(vi.getTimerCount()).toBe(1);
  });

  it("judges a press by its finger-down time, else by the event's age", () => {
    const host = createBoardHost({
      clock,
      reduced: () => false,
      pressAge: () => 300,
    });
    host.send({ kind: "open", overlay: "buys", at: 1000 });
    now = 1500;
    const event = new Event("click");
    const by = "finger";
    const intent = "act";
    // Down at 1300: inside the 400ms settle that began at 1000.
    expect(host.press({ control: row, by, intent, downAt: 1300, event })).toBe(
      "ignore-early",
    );
    expect(host.press({ control: row, by, intent, downAt: 1400, event })).toBe(
      "act",
    );
    // no stamp: 1500 - 300 = 1200, inside the settle.
    expect(
      host.press({ control: row, by, intent, downAt: undefined, event }),
    ).toBe("ignore-early");
    now = 1800;
    expect(
      host.press({ control: row, by, intent, downAt: undefined, event }),
    ).toBe("act");
  });

  it("sends the motion setting before each press", () => {
    let reduced = true;
    const host = createBoardHost({
      clock,
      reduced: () => reduced,
      pressAge: () => 0,
    });
    const event = new Event("click");
    const refuse = (): void => {
      host.send({ kind: "result", control: row, at: now, outcome: "refused" });
    };
    host.press({
      control: row,
      by: "finger",
      intent: "act",
      downAt: undefined,
      event,
    });
    refuse();
    expect(host.view().blinking.size).toBe(0);
    reduced = false;
    now = 5000;
    host.press({
      control: row,
      by: "finger",
      intent: "act",
      downAt: undefined,
      event,
    });
    refuse();
    expect(host.view().blinking.get("buys/drill")).toBe("red");
  });

  it("a send that changes nothing repaints nothing", () => {
    const host = createBoardHost({ clock, reduced: () => false });
    const paint = vi.fn();
    const stop = host.subscribe(paint);
    host.send({ kind: "close", overlay: "buys", at: 0, by: "finger" });
    expect(paint).not.toHaveBeenCalled();
    stop();
    host.send(applied(0));
    expect(paint).not.toHaveBeenCalled();
  });

  it("aborting the signal clears the timer", () => {
    const abort = new AbortController();
    const host = createBoardHost({
      clock,
      reduced: () => false,
      signal: abort.signal,
    });
    host.send(applied(0));
    expect(vi.getTimerCount()).toBe(1);
    abort.abort();
    expect(vi.getTimerCount()).toBe(0);
    host.send(applied(10));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to the real motion setting and event age", () => {
    const host = createBoardHost({ clock });
    expect(
      host.press({
        control: row,
        by: "keyboard",
        intent: "act",
        downAt: undefined,
        event: new Event("click"),
      }),
    ).toBe("act");
  });

  it("lends its clock and press age to the parts that stamp their own inputs", () => {
    const pressAge = (): number => 40;
    const host = createBoardHost({ clock, pressAge });
    now = 123;
    expect(host.clock()).toBe(123);
    expect(host.pressAge(new Event("click"))).toBe(40);
  });
});

describe("eventAge", () => {
  const at = (timeStamp: number): Event => {
    const event = new Event("pointerdown");
    Object.defineProperty(event, "timeStamp", { value: timeStamp });
    return event;
  };

  it("is how long the event waited before the page got to it", () => {
    expect(eventAge(at(900), 1000)).toBe(100);
  });

  it("is the raw age, even from the future or too old to trust: the board judges those", () => {
    expect(eventAge(at(1100), 1000)).toBe(-100);
    expect(eventAge(at(40_000), 100_000)).toBe(60_000);
  });

  it("is 0 for an event with no stamp", () => {
    expect(eventAge(at(0), 1000)).toBe(0);
  });
});
