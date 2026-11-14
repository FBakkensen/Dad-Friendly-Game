// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountMountainScreen } from "./mountain-screen";

const tile = "tile.png";

afterEach(() => {
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * main.ts mounts the screen with no signal and no store: the screen makes its
 * own store and lives as long as the page. Every other test passes a signal so
 * its timers stop at teardown; this one runs on fake timers instead.
 */
describe("the screen as main.ts mounts it", () => {
  it("makes its own store and keeps ticking with no signal", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    const root = document.createElement("div");
    mountMountainScreen({
      root,
      veinUrl: tile,
      tierArt: {
        helper: tile,
        cart: tile,
        drill: tile,
        borer: tile,
        machine: tile,
        kid: tile,
      },
      relicArt: {
        lantern: tile,
        shield: tile,
        hammer: tile,
        heart: tile,
        crown: tile,
        mantle: tile,
      },
    });
    expect(root.querySelector(".save-status")?.textContent).toBe(
      "Sign in to save",
    );
    vi.advanceTimersByTime(3_000);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });
});
