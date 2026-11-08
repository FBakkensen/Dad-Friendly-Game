// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIX_HOLD_MS, type TroubleTier } from "./hazards";
import { watchFixHold } from "./trouble-tap";

function press(el: HTMLElement, type: string, button = 0): void {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, button }));
}

function setup(tier: TroubleTier | undefined) {
  const el = document.createElement("button");
  document.body.append(el);
  const fix = vi.fn<(tier: TroubleTier) => void>();
  const hold = watchFixHold(el, { tier: () => tier, fix });
  return { el, fix, hold };
}

describe("watchFixHold", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("a 600ms hold fixes once, and swallows only the click that follows", () => {
    const { el, fix, hold } = setup("drill");
    expect(FIX_HOLD_MS).toBe(600);
    press(el, "pointerdown");
    vi.advanceTimersByTime(FIX_HOLD_MS);
    expect(fix).toHaveBeenCalledTimes(1);
    expect(fix).toHaveBeenCalledWith("drill");
    expect(hold.heldFix()).toBe(true);
    expect(hold.heldFix()).toBe(false);
    vi.advanceTimersByTime(FIX_HOLD_MS * 3);
    expect(fix).toHaveBeenCalledTimes(1);
  });

  it("a release at 599ms fixes nothing", () => {
    const { el, fix, hold } = setup("drill");
    press(el, "pointerdown");
    vi.advanceTimersByTime(FIX_HOLD_MS - 1);
    press(el, "pointerup");
    vi.advanceTimersByTime(FIX_HOLD_MS);
    expect(fix).not.toHaveBeenCalled();
    expect(hold.heldFix()).toBe(false);
  });

  it("a right button, or no trouble here, starts nothing", () => {
    const right = setup("cart");
    press(right.el, "pointerdown", 2);
    vi.advanceTimersByTime(FIX_HOLD_MS * 2);
    expect(right.fix).not.toHaveBeenCalled();
    expect(right.hold.heldFix()).toBe(false);

    const calm = setup(undefined);
    press(calm.el, "pointerdown");
    vi.advanceTimersByTime(FIX_HOLD_MS * 2);
    expect(calm.fix).not.toHaveBeenCalled();
    expect(calm.hold.heldFix()).toBe(false);
  });

  it.each(["pointerleave", "pointercancel"])("%s clears the hold", (type) => {
    const { el, fix, hold } = setup("borer");
    press(el, "pointerdown");
    vi.advanceTimersByTime(FIX_HOLD_MS / 2);
    press(el, type);
    vi.advanceTimersByTime(FIX_HOLD_MS);
    expect(fix).not.toHaveBeenCalled();
    expect(hold.heldFix()).toBe(false);
  });

  it("a hold that fixed with no click after it does not swallow the next tap", () => {
    const { el, fix, hold } = setup("cart");
    press(el, "pointerdown");
    vi.advanceTimersByTime(FIX_HOLD_MS);
    expect(fix).toHaveBeenCalledTimes(1);
    // The finger slid off: no click ends this hold.
    press(el, "pointercancel");
    press(el, "pointerdown");
    press(el, "pointerup");
    expect(hold.heldFix()).toBe(false);
  });

  it("a second press restarts the hold rather than fixing twice", () => {
    const { el, fix } = setup("machine");
    press(el, "pointerdown");
    vi.advanceTimersByTime(FIX_HOLD_MS / 2);
    press(el, "pointerdown");
    vi.advanceTimersByTime(FIX_HOLD_MS - 1);
    expect(fix).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fix).toHaveBeenCalledTimes(1);
  });
});
