// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryCloudSave, type CloudSave } from "./cloud-save";
import { createMountain, type Mountain } from "./mountain";
import {
  createMemoryStorage,
  mountScreen,
  setReducedMotion,
  signedIn,
  stopScreens,
} from "./mountain-screen.harness";
import { SESSION_SAVE_KEY } from "./session-save";

/**
 * The taps that buy or dig nothing (#431): a plate or window tap before the save is in, on a
 * mined-out mountain, and on a buy the store refuses. Kept in a file of its own so the root's
 * floor holds as the screen's parts move out of it.
 */
beforeEach(() => {
  setReducedMotion(true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await stopScreens();
});

/** A tap that lands before the next paint disables the button again: the handler must still hold. */
const tapAnyway = (button: HTMLButtonElement | null): void => {
  if (button === null) {
    throw new Error("button did not render");
  }
  button.disabled = false;
  button.click();
};

const seeded = (mountain: Mountain) => {
  const storage = createMemoryStorage();
  storage.setItem(
    SESSION_SAVE_KEY,
    JSON.stringify({ version: 5, mountain, lastSeen: Date.now() }),
  );
  return storage;
};

describe("taps that do nothing", () => {
  it("a tap on the plate or the window before the save is in buys and digs nothing", () => {
    const cloudSave: CloudSave = {
      ...createMemoryCloudSave(),
      watch: () => () => undefined,
    };
    const screen = mountScreen({ auth: signedIn(), cloudSave });
    const dispatch = vi.spyOn(screen.progress, "dispatch");
    tapAnyway(screen.root.querySelector<HTMLButtonElement>(".board-ready"));
    tapAnyway(
      screen.root.querySelector<HTMLButtonElement>(".board-dig-button"),
    );
    tapAnyway(screen.dig);
    expect(dispatch).not.toHaveBeenCalled();
    expect(
      screen.root
        .querySelector<HTMLButtonElement>(".board-dig-button")
        ?.getAttribute("aria-label"),
    ).toBe("Loading your save...");
  });

  it("a tap on the plate of a mined-out mountain buys nothing", () => {
    const done: Mountain = { ...createMountain(), remaining: 0, pocket: 1e9 };
    const screen = mountScreen({ storage: seeded(done) });
    const dispatch = vi.spyOn(screen.progress, "dispatch");
    tapAnyway(screen.root.querySelector<HTMLButtonElement>(".board-ready"));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("a buy the store refuses leaves the plate as it was", () => {
    const rich: Mountain = { ...createMountain(), pocket: 1e9 };
    const screen = mountScreen({ storage: seeded(rich) });
    const dispatch = vi
      .spyOn(screen.progress, "dispatch")
      .mockReturnValue({ kind: "refused", reason: "no-change" });
    screen.root.querySelector<HTMLButtonElement>(".board-ready")?.click();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0].kind).toBe("buyTier");
    expect(screen.progress.getSnapshot().mountain.carts).toBe(0);
  });
});
