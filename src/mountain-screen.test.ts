// @vitest-environment happy-dom
import { formatCompact, formatCount } from "./format";
import { shownStones, stonesLeft } from "./scale";
import { RELICS } from "./relics";
import { writeSessionSave } from "./session-save";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import {
  createMemoryCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import { APP_VERSION } from "./field-log";
import { machinesBeat } from "./mine-window";
import {
  MOUNTAIN_STONES,
  createMountain,
  stonesPerSecond,
  type Mountain,
} from "./mountain";
import { showAppUpdate } from "./mountain-screen";
import { effectiveRates } from "./rates";
import { veinReward } from "./veins";
import { SESSION_SAVE_KEY } from "./session-save";
import {
  OTHER_TAB_BODY,
  OTHER_TAB_PLAY,
  OTHER_TAB_TITLE,
  tapWords,
} from "./screen-words";
import { minedMountain } from "./test-fixtures";
import {
  bindWriterPageHide,
  createMemoryBus,
  createTabWriter,
} from "./tab-writer";
import { buyTier, tierById, tierCost } from "./tiers";
import {
  createMemoryStorage,
  mountScreen,
  setReducedMotion,
  signedIn,
  stopScreens,
} from "./mountain-screen.harness";

// The window's beats are counted where the window takes them (#371).
vi.mock("./mine-window", async (importOriginal) => {
  const real = await importOriginal<typeof import("./mine-window")>();
  return { ...real, machinesBeat: vi.fn(real.machinesBeat) };
});

// Animations are opted into per test; most tests want instant numbers.
beforeEach(() => {
  setReducedMotion(true);
});
afterEach(stopScreens);

/**
 * A fake frame clock for the board loop: frames asked for wait until `next`
 * runs the oldest, and cancelAnimationFrame drops one.
 */
function fakeFrames() {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    id += 1;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (handle: number) => {
    frames.delete(handle);
  });
  return {
    next: (at: number): void => {
      const first = frames.entries().next();
      if (first.done) throw new Error("no frame asked for");
      const [handle, cb] = first.value;
      frames.delete(handle);
      cb(at);
    },
    pending: (): number => frames.size,
    asked: (): number => id,
  };
}

/** A socket's note carries the "Relic shelf" key that opens the shelf (#370). */
function openShelfFromSocket(
  root: HTMLElement,
  socket: HTMLButtonElement | null | undefined,
): void {
  socket?.click();
  root.querySelector<HTMLButtonElement>(".board-note .board-platebtn")?.click();
}

describe("mountMountainScreen", () => {
  it("stops its tick, its animation frames and its page listeners once its signal aborts", () => {
    vi.useFakeTimers();
    const frames = fakeFrames();
    try {
      const stop = new AbortController();
      const writes: string[] = [];
      const screen = mountScreen({
        signal: stop.signal,
        veinStorage: {
          getItem: () => null,
          setItem: (key) => writes.push(key),
        },
      });
      const tick = vi.spyOn(screen.progress, "tick");
      vi.advanceTimersByTime(3_000);
      expect(tick).toHaveBeenCalledTimes(3);
      window.dispatchEvent(new Event("pagehide"));
      expect(writes).toHaveLength(1);

      // The board loop asks for one frame at a time.
      frames.next(1_000);
      frames.next(1_016);
      expect(frames.pending()).toBe(1);
      const asked = frames.asked();

      stop.abort();
      vi.advanceTimersByTime(3_000);
      window.dispatchEvent(new Event("pagehide"));
      expect(tick).toHaveBeenCalledTimes(3);
      expect(writes).toHaveLength(1);
      expect(frames.pending()).toBe(0);
      expect(frames.asked()).toBe(asked);
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("shows a hundred million stones and mines one per tap", () => {
    const screen = mountScreen();

    expect(screen.text(".stones-left")).toBe(
      `${formatCount(stonesLeft(createMountain()))} stones left`,
    );
    expect(screen.pocket()).toBe("Stones 0");
    expect(screen.text(".goal")).toContain("Legendary Relics of Fatherhood");
    expect(screen.text(".save-status")).toBe("Sign in to save");

    const whole = stonesLeft(createMountain());
    screen.dig.click();
    expect(
      screen.root.querySelector(".stones-left")?.getAttribute("title"),
    ).toBe(
      `${(whole - 1).toLocaleString("en-US")} of ${whole.toLocaleString("en-US")}`,
    );
    expect(screen.pocket()).toBe("Stones 1");
    expect(screen.text(".save-status")).toBe("Saved on this device");
    expect(
      screen.root.querySelector<HTMLElement>(".update-prompt")?.hidden,
    ).toBe(true);

    screen.dig.click();
    expect(screen.pocket()).toBe("Stones 2");
    expect(
      screen.root.querySelector(".stones-left")?.getAttribute("title"),
    ).toBe(
      `${(whole - 2).toLocaleString("en-US")} of ${whole.toLocaleString("en-US")}`,
    );
  });

  it("shows an update prompt and reloads", () => {
    const screen = mountScreen();
    const reload = vi
      .spyOn(globalThis.location, "reload")
      .mockImplementation(() => undefined);
    showAppUpdate(screen.root);
    const prompt = screen.root.querySelector<HTMLElement>(".update-prompt");
    expect(prompt?.hidden).toBe(false);
    expect(screen.text("#update-prompt-title")).toBe("Update available");
    const button =
      screen.root.querySelector<HTMLButtonElement>(".update-reload");
    expect(button?.textContent).toBe("Reload");
    button?.click();
    expect(reload).toHaveBeenCalled();
    reload.mockRestore();
  });

  it("Reload releases the writer seat so the next open is the writer", () => {
    const storage = createMemoryStorage();
    const writer = createTabWriter({
      tabId: "tab-writer",
      storage,
      leaseMs: 60_000,
    });
    const unbind = bindWriterPageHide(writer);
    const screen = mountScreen({ storage, tabWriter: writer });
    expect(writer.seat()).toBe("writer");
    const reload = vi
      .spyOn(globalThis.location, "reload")
      .mockImplementation(() => {
        window.dispatchEvent(new Event("pagehide"));
      });
    showAppUpdate(screen.root);
    screen.root.querySelector<HTMLButtonElement>(".update-reload")?.click();
    expect(reload).toHaveBeenCalled();
    expect(writer.seat()).toBe("other");
    const next = createTabWriter({
      tabId: "tab-reloaded",
      storage,
      leaseMs: 60_000,
    });
    expect(next.seat()).toBe("writer");
    reload.mockRestore();
    unbind();
    next.dispose();
    screen.progress.dispose();
  });

  it("shows the other tab card, and Play here keeps the stones", async () => {
    const storage = createMemoryStorage();
    const bus = createMemoryBus();
    const writer = createTabWriter({
      tabId: "tab-writer",
      storage,
      bus,
      handoffMs: 0,
      yieldWaitMs: 30,
    });
    const other = createTabWriter({
      tabId: "tab-other1",
      storage,
      bus,
      handoffMs: 0,
      yieldWaitMs: 30,
    });
    const first = mountScreen({ storage, tabWriter: writer });
    const second = mountScreen({ storage, tabWriter: other });
    const card = second.root.querySelector<HTMLElement>(".other-tab");
    expect(card?.hidden).toBe(false);
    expect(second.text("#other-tab-title")).toBe(OTHER_TAB_TITLE);
    expect(second.text(".other-tab-body")).toBe(OTHER_TAB_BODY);
    expect(second.text(".other-tab-play")).toBe(OTHER_TAB_PLAY);
    expect(first.root.querySelector<HTMLElement>(".other-tab")?.hidden).toBe(
      true,
    );

    first.dig.click();
    expect(first.pocket()).toBe("Stones 1");
    second.dig.click();
    expect(second.pocket()).toBe("Stones 0");

    second.root.querySelector<HTMLButtonElement>(".other-tab-play")?.click();
    await vi.waitFor(() => {
      expect(second.root.querySelector<HTMLElement>(".other-tab")?.hidden).toBe(
        true,
      );
    });
    expect(second.pocket()).toBe("Stones 1");
    expect(first.root.querySelector<HTMLElement>(".other-tab")?.hidden).toBe(
      false,
    );
    second.dig.click();
    expect(second.pocket()).toBe("Stones 2");
    first.progress.dispose();
    second.progress.dispose();
  });

  it("keeps guest progress after the page is opened again", () => {
    const storage = createMemoryStorage();
    const first = mountScreen({ storage });
    first.dig.click();
    first.dig.click();
    first.dig.click();
    first.progress.dispose();

    const again = mountScreen({ storage });
    expect(again.pocket()).toBe("Stones 3");
    expect(again.text(".save-status")).toBe("Saved on this device");
  });

  it("turns an old grid save into a head start", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({
        version: 2,
        lastSeen: 1,
        grid: {
          width: 3,
          height: 3,
          cells: [
            { kind: "chunk" },
            { kind: "stone" },
            { kind: "dug" },
            ...Array.from({ length: 6 }, () => ({ kind: "covered" })),
          ],
        },
      }),
    );

    const allStones = stonesLeft(createMountain());
    const screen = mountScreen({ storage });
    expect(screen.pocket()).toBe("Stones 3");
    expect(
      screen.root.querySelector(".stones-left")?.getAttribute("title"),
    ).toBe(
      `${(allStones - 3).toLocaleString("en-US")} of ${allStones.toLocaleString("en-US")}`,
    );
  });

  it("disables the mountain once it is mined out", () => {
    const storage = createMemoryStorage();
    const done: Mountain = {
      remaining: 0,
      pocket: MOUNTAIN_STONES,
      helpers: 0,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
    };
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({ version: 5, mountain: done, lastSeen: 1 }),
    );

    const screen = mountScreen({ storage });
    expect(screen.text(".stones-left")).toBe("0 stones left");
    expect(screen.dig.disabled).toBe(true);
    expect(screen.dig.getAttribute("aria-label")).toBe(
      "The mountain is mined out",
    );
  });

  it("does not mine until the cloud save has loaded", async () => {
    let finishLoad: (result: CloudLoadResult) => void = () => {
      throw new Error("load was not pending");
    };
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        finishLoad = onChange;
        return () => undefined;
      },
    };
    const screen = mountScreen({ auth: signedIn(), cloudSave });

    expect(screen.dig.disabled).toBe(true);
    expect(screen.text(".save-status")).toBe("Loading your save...");
    screen.dig.click();
    expect(screen.pocket()).toBe("Stones 0");

    finishLoad({ kind: "found", mountain: minedMountain(40) });
    await Promise.resolve();

    expect(screen.dig.disabled).toBe(false);
    screen.dig.click();
    expect(screen.pocket()).toBe("Stones 41");
  });

  it("signs in, loads the cloud mountain, and signs out", async () => {
    const docs = new Map([["test-dad", minedMountain(12_345)]]);
    const screen = mountScreen({
      auth: createMemoryAuth(),
      cloudSave: createMemoryCloudSave({ docs }),
    });
    expect(screen.authButton.textContent).toBe("Sign in with Google");

    screen.authButton.click();

    await vi.waitFor(() => {
      expect(screen.text(".save-status")).toBe("Saved to your account");
    });
    expect(screen.pocket()).toBe("Stones 12,345");
    expect(screen.text(".auth-status")).toBe("Signed in as Test Dad");
    expect(
      screen.root.querySelector(".save-status")?.getAttribute("data-log"),
    ).toContain("save.remote found");

    screen.authButton.click();
    expect(screen.authButton.textContent).toBe("Sign in with Google");
  });

  it("shows sign-in in progress with a disabled button", () => {
    const screen = mountScreen({
      auth: createMemoryAuth({ state: { kind: "signing-in" } }),
    });
    expect(screen.authButton.textContent).toBe("Signing in...");
    expect(screen.authButton.disabled).toBe(true);
    expect(screen.text(".auth-status")).toBe("");
  });

  it("says it couldn't reach the save when cloud writes fail", async () => {
    const memory = createMemoryCloudSave({
      docs: new Map([["test-dad", minedMountain(5)]]),
    });
    const screen = mountScreen({
      auth: signedIn(),
      cloudSave: {
        ...memory,
        write: () => Promise.resolve({ kind: "failed", message: "denied" }),
      },
    });
    await vi.waitFor(() => {
      expect(screen.text(".save-status")).toBe("Saved to your account");
    });
    screen.dig.click();
    await vi.waitFor(() => {
      expect(screen.text(".save-status")).toBe(
        "Couldn't reach your save · Kept on this phone · Details",
      );
    });
  });

  it("writes every tap to the cloud while signed in", async () => {
    const docs = new Map<string, Mountain>();
    const screen = mountScreen({
      auth: signedIn(),
      cloudSave: createMemoryCloudSave({ docs }),
    });
    await vi.waitFor(() => {
      expect(docs.has("test-dad")).toBe(true);
    });

    screen.dig.click();

    expect(docs.get("test-dad")).toEqual(minedMountain(1));
  });

  it("writes the cloud save when the tab hides", async () => {
    const docs = new Map<string, Mountain>();
    const screen = mountScreen({
      auth: signedIn(),
      cloudSave: createMemoryCloudSave({ docs }),
    });
    await vi.waitFor(() => {
      expect(docs.has("test-dad")).toBe(true);
    });
    screen.dig.click();
    docs.delete("test-dad");

    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    await Promise.resolve();

    expect(docs.get("test-dad")).toEqual(minedMountain(1));
  });
});

describe("crew tiers on screen", () => {
  const tierCard = (root: HTMLElement, id: string): HTMLButtonElement => {
    const card = root.querySelector(`.tier[data-tier="${id}"]`);
    if (!(card instanceof HTMLButtonElement)) {
      throw new Error(`${id} card did not render`);
    }
    return card;
  };

  it("goes three to a row with short names once borers show", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(400),
        helpers: 21,
        carts: 2,
        drills: 1,
        borers: 2,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const grid = screen.root.querySelector(".tier-grid");
    expect(grid?.getAttribute("data-shown")).toBe("5");
    expect(grid?.classList.contains("tier-grid-compact")).toBe(true);
    const borer = tierCard(screen.root, "borer");
    expect(borer.querySelector(".tier-name")?.textContent).toBe("Tunnel borer");
    // The first borer's engineer tends them: 357 becomes 435, shown floored.
    expect(borer.querySelector(".tier-rate")?.textContent).toBe(
      "+435\u2009·\u2009870/s · Needs 8 workers",
    );
    expect(borer.querySelector(".tier-count")?.textContent).toBe("×2");
    expect(borer.getAttribute("aria-label")).toContain("tunnel borer");
  });

  it("shows the Great Machine dark and locked until the Hammer", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(24_999_999),
        pocket: 10_000_000,
        drills: 1,
        borers: 1,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const machine = tierCard(screen.root, "machine");
    expect(machine.hidden).toBe(false);
    expect(machine.disabled).toBe(true);
    expect(machine.classList.contains("tier-locked")).toBe(true);
    expect(machine.querySelector(".tier-cost")?.textContent).toBe("Locked");
    expect(machine.querySelector(".tier-rate")?.textContent).toBe(
      `Machine · ${formatCompact(shownStones(createMountain(), 120_000_000))}`,
    );
    expect(machine.getAttribute("aria-label")).toContain(
      `Joins your crew at ${formatCount(shownStones(createMountain(), 120_000_000))} stones down`,
    );
    machine.click();
    expect(
      screen.root
        .querySelector('.tier[data-tier="machine"] .tier-count')
        ?.hasAttribute("hidden"),
    ).toBe(true);
  });

  it("sells the Great Machine at the Deep Heart, after the Hammer (#252)", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(120_000_000),
        pocket: tierCost(tierById("machine"), 0) + 800_000,
        drills: 1,
        borers: 1,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const machine = tierCard(screen.root, "machine");
    expect(machine.classList.contains("tier-locked")).toBe(false);
    expect(machine.disabled).toBe(false);
    expect(machine.querySelector(".tier-cost")?.textContent).toBe(
      formatCompact(tierCost(tierById("machine"), 0)),
    );
    machine.click();
    expect(machine.querySelector(".tier-count")?.textContent).toBe("×1");
    expect(screen.pocket()).toBe("Stones 800.0K");
  });

  it("keeps the roomy two-column cards while three or fewer show", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(400), helpers: 3, carts: 2 },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const grid = screen.root.querySelector(".tier-grid");
    expect(grid?.classList.contains("tier-grid-compact")).toBe(false);
    expect(
      tierCard(screen.root, "cart").querySelector(".tier-name")?.textContent,
    ).toBe("Mine cart");
  });

  it("hires a helper when affordable, raises the price, and mines every second", async () => {
    vi.useFakeTimers();
    try {
      const first = tierCost(tierById("helper"), 0);
      const second = tierCost(tierById("helper"), 1);
      const storage = createMemoryStorage();
      storage.setItem(
        SESSION_SAVE_KEY,
        JSON.stringify({
          version: 5,
          // One tap short of the first worker.
          mountain: minedMountain(first - 1),
          lastSeen: Date.now(),
        }),
      );
      const screen = mountScreen({ storage });
      const hire = tierCard(screen.root, "helper");
      const cart = tierCard(screen.root, "cart");

      expect(screen.text(".crew-status")).toBe(
        "No crew yet. Hire a worker to mine for you.",
      );
      expect(screen.text('[data-tier="helper"] .tier-name')).toBe("Worker");
      expect(
        screen.root.querySelector<HTMLElement>(
          '[data-tier="helper"] .tier-count',
        )?.hidden,
      ).toBe(true);
      expect(screen.text('[data-tier="helper"] .tier-cost')).toBe(
        formatCompact(first),
      );
      expect(hire.disabled).toBe(true);
      expect(cart.hidden).toBe(true);

      screen.dig.click();
      expect(hire.disabled).toBe(false);

      hire.click();
      expect(screen.pocket()).toBe("Stones 0");
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 1 stone a second",
      );
      expect(screen.text('[data-tier="helper"] .tier-name')).toBe("Worker");
      expect(screen.text('[data-tier="helper"] .tier-count')).toBe("×1");
      expect(screen.text('[data-tier="helper"] .tier-cost')).toBe(
        formatCompact(second),
      );
      expect(hire.disabled).toBe(true);
      expect(cart.hidden).toBe(false);
      expect(hire.getAttribute("aria-label")).toBe(
        `Buy a worker for ${formatCount(second)} stones, mines 1 stone a second. You have 1.`,
      );

      await vi.advanceTimersByTimeAsync(3_000);
      expect(screen.pocket()).toBe("Stones 3");
    } finally {
      vi.useRealTimers();
    }
  });

  it("buys a mine cart that mines 10 stones a second", async () => {
    vi.useFakeTimers();
    try {
      const storage = createMemoryStorage();
      storage.setItem(
        SESSION_SAVE_KEY,
        JSON.stringify({
          version: 5,
          mountain: {
            ...minedMountain(tierCost(tierById("cart"), 0)),
            helpers: 1,
          },
          lastSeen: Date.now(),
        }),
      );
      const screen = mountScreen({ storage });
      const cart = tierCard(screen.root, "cart");
      expect(screen.text('[data-tier="cart"] .tier-cost')).toBe(
        formatCompact(tierCost(tierById("cart"), 0)),
      );
      expect(cart.disabled).toBe(false);

      cart.click();
      expect(screen.pocket()).toBe("Stones 0");
      expect(screen.text('[data-tier="cart"] .tier-name')).toBe("Mine cart");
      expect(screen.text('[data-tier="cart"] .tier-count')).toBe("×1");
      expect(screen.text('[data-tier="cart"] .tier-cost')).toBe(
        formatCompact(tierCost(tierById("cart"), 1)),
      );
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 7 stones a second",
      );
      expect(
        screen.root.querySelector(".tier-grid")?.getAttribute("data-shown"),
      ).toBe("3");

      await vi.advanceTimersByTimeAsync(2_000);
      expect(screen.pocket()).toBe("Stones 14");
    } finally {
      vi.useRealTimers();
    }
  });

  it("celebrates what the crew mined and closes with one tap", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({
        version: 5,
        mountain: {
          remaining: 240_000_000,
          pocket: 0,
          helpers: 4,
          carts: 0,
          drills: 0,
          borers: 0,
          machines: 0,
          kids: 0,
        },
        lastSeen: Date.now() - (2 * 60 + 5) * 60_000,
      }),
    );
    const screen = mountScreen({ storage });
    const card = screen.root.querySelector(".welcome-back");
    const close = screen.root.querySelector(".welcome-continue");
    if (
      !(card instanceof HTMLElement) ||
      !(close instanceof HTMLButtonElement)
    ) {
      throw new Error("welcome-back card did not render");
    }

    expect(card.hidden).toBe(false);
    expect(card.getAttribute("role")).toBe("dialog");
    expect(screen.text(".welcome-mined")).toBe("+9,000 stones");
    expect(screen.text(".welcome-detail")).toBe(
      "You were gone 2 hours 5 minutes. Your crew kept digging the whole time.",
    );

    close.click();
    expect(card.hidden).toBe(true);
    expect(screen.pocket()).toBe("Stones 9,000");
  });

  it("says the crew eased off on a long day away (#278)", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(0), pocket: 0, helpers: 1 },
      lastSeen: Date.now() - 10 * 3_600_000,
    });
    const screen = mountScreen({ storage });
    expect(screen.text(".welcome-detail")).toBe(
      "You were gone 10 hours. Your crew dug hard, then took it easy. Rested and ready for you.",
    );
  });

  it("says a full day's haul after more than a day away (#278)", () => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({
        version: 5,
        mountain: {
          remaining: 240_000_000,
          pocket: 0,
          helpers: 1,
          carts: 0,
          drills: 0,
          borers: 0,
          machines: 0,
          kids: 0,
        },
        lastSeen: Date.now() - 26 * 3_600_000,
      }),
    );
    const screen = mountScreen({ storage });
    expect(screen.text(".welcome-mined")).toBe("+14.2 thousand stones");
    expect(screen.text(".welcome-detail")).toBe(
      "You were gone 1 day 2 hours. Your crew saved a full day's haul for you. Good to have you back.",
    );
  });

  it("stays hidden for a fresh game", () => {
    const screen = mountScreen();
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(true);
  });
});

describe("golden vein on screen", () => {
  it("glints after a few minutes of play and pays a burst when tapped", async () => {
    vi.useFakeTimers();
    try {
      let clock = 0;
      const screen = mountScreen({ now: () => clock, random: () => 0 });
      const vein = screen.root.querySelector(".golden-vein");
      if (!(vein instanceof HTMLButtonElement)) {
        throw new Error("vein did not render");
      }
      expect(vein.hidden).toBe(true);

      clock = 3 * 60_000 - 1_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(vein.hidden).toBe(true);

      clock = 3 * 60_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(vein.hidden).toBe(false);
      // Today's place (x 0.35, y 0.4) on the window's view: veinSpot's (8, 26)
      // plus the view's 7 art px inset, at 2 CSS px an art px.
      expect(vein.style.left).toBe("30px");
      expect(vein.style.top).toBe("66px");

      vein.click();
      expect(vein.hidden).toBe(true);
      expect(screen.pocket()).toBe("Stones 50");
      expect(screen.text(".vein-note")).toBe("Golden vein! +50 stones");

      clock += 5_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(screen.text(".vein-note")).toBe("");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps play time across the phone locking: time away is skipped, not a reset", async () => {
    vi.useFakeTimers();
    const setVisibility = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => state,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    try {
      let clock = 0;
      const screen = mountScreen({ now: () => clock, random: () => 0 });
      const vein = screen.root.querySelector(".golden-vein") as HTMLElement;
      // Two minutes of play, then the screen locks for ten.
      clock = 2 * 60_000;
      await vi.advanceTimersByTimeAsync(1_000);
      setVisibility("hidden");
      clock += 10 * 60_000;
      setVisibility("visible");
      // A spurious "visible" with no hide before it changes nothing.
      setVisibility("visible");
      clock += 60_000 - 1_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(vein.hidden).toBe(true);
      clock += 1_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(vein.hidden).toBe(false);
    } finally {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "visible",
      });
      vi.useRealTimers();
    }
  });

  it("carries the wait over when the app is closed and reopened", async () => {
    vi.useFakeTimers();
    try {
      const storage = createMemoryStorage();
      let clock = 0;
      mountScreen({ storage, now: () => clock, random: () => 0 });
      clock = 2 * 60_000;
      window.dispatchEvent(new Event("pagehide"));
      expect(storage.getItem("dad-friendly-vein-wait")).toBe("60000");

      clock = 50 * 60_000;
      const again = mountScreen({ storage, now: () => clock, random: () => 0 });
      const vein = again.root.querySelector(".golden-vein") as HTMLElement;
      clock += 60_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(vein.hidden).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts a fresh wait when the saved wait can't be read", async () => {
    vi.useFakeTimers();
    try {
      let clock = 0;
      const screen = mountScreen({
        now: () => clock,
        random: () => 0,
        veinStorage: {
          getItem: () => {
            throw new Error("blocked");
          },
          setItem: () => undefined,
        },
      });
      const vein = screen.root.querySelector(".golden-vein") as HTMLElement;
      clock = 3 * 60_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(vein.hidden).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("doesn't glint while the save is still loading", async () => {
    vi.useFakeTimers();
    try {
      let clock = 0;
      const screen = mountScreen({
        auth: signedIn(),
        cloudSave: {
          ...createMemoryCloudSave(),
          watch: () => () => undefined,
        },
        now: () => clock,
        random: () => 0,
      });
      const vein = screen.root.querySelector(".golden-vein") as HTMLElement;
      clock = 10 * 60_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(screen.text(".save-status")).toBe("Loading your save...");
      expect(vein.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fades if missed, costs nothing, and starts a fresh wait", async () => {
    vi.useFakeTimers();
    try {
      let clock = 0;
      const screen = mountScreen({ now: () => clock, random: () => 0 });
      const vein = screen.root.querySelector(".golden-vein");
      if (!(vein instanceof HTMLButtonElement)) {
        throw new Error("vein did not render");
      }
      clock = 3 * 60_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(vein.hidden).toBe(false);

      clock += 12_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(vein.hidden).toBe(true);
      expect(screen.pocket()).toBe("Stones 0");

      clock += 3 * 60_000 - 2_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(vein.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Lantern of Guidance on screen", () => {
  const seeded = (mountain: Mountain, lastSeen = Date.now()) => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({ version: 5, mountain, lastSeen }),
    );
    return storage;
  };

  it("shows the goal and no guide bar before the Lantern", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(100)) });
    expect(screen.text(".goal")).toContain(
      "Six Legendary Relics of Fatherhood",
    );
    expect(screen.root.querySelector<HTMLElement>(".guide-bar")?.hidden).toBe(
      true,
    );
  });

  it("reveals the Lantern on the tap that uncovers it, then guides to the Shield", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(999_999)) });
    document.body.append(screen.root);
    const reveal = screen.root.querySelector<HTMLElement>(".relic-reveal");
    expect(reveal?.hidden).toBe(true);

    screen.dig.click();

    expect(reveal?.hidden).toBe(false);
    expect(screen.text("#relic-reveal-title")).toBe(
      "You found the Lantern of Guidance",
    );
    expect(screen.text(".reveal-virtue")).toBe("The virtue of Guidance.");
    expect(
      screen.root
        .querySelector<HTMLImageElement>(".reveal-art")
        ?.getAttribute("src"),
    ).toBe("lantern.png");
    expect(document.activeElement).toBe(
      screen.root.querySelector(".reveal-continue"),
    );

    screen.root.querySelector<HTMLButtonElement>(".reveal-continue")?.click();
    expect(reveal?.hidden).toBe(true);
    expect(screen.text(".goal")).toBe("Next: Shield of Protection · Far below");
    const bar = screen.root.querySelector<HTMLElement>(".guide-bar");
    expect(bar?.hidden).toBe(false);
    expect(bar?.getAttribute("aria-valuenow")).toBe("0");
    screen.root.remove();
  });

  it("hints the next relic on the board's plate, only after the Lantern (#336, #370)", () => {
    const socketNote = (
      screen: ReturnType<typeof mountScreen>,
      index: number,
    ): HTMLElement | null => {
      screen.root
        .querySelectorAll<HTMLButtonElement>(".board-socket")
        [index]?.click();
      return screen.root.querySelector<HTMLElement>(".board-note");
    };
    const before = mountScreen({ storage: seeded(minedMountain(100)) });
    expect(socketNote(before, 0)?.querySelector(".board-note-q")).toBeNull();
    const after = mountScreen({ storage: seeded(minedMountain(5_500_000)) });
    expect(
      after.root
        .querySelectorAll(".board-socket")[1]
        ?.getAttribute("aria-label"),
    ).toBe("Shield of Protection, next relic. 1 of 6 found");
    const hint = socketNote(after, 1)?.querySelector(".board-note-q");
    expect(hint?.textContent).toBe(
      `Next · ${String(after.text(".goal")).split(" · ")[1] ?? ""}`,
    );
    expect(hint?.textContent).not.toMatch(/\d/);
    const done = mountScreen({
      storage: seeded(minedMountain(MOUNTAIN_STONES)),
    });
    expect(
      [...done.root.querySelectorAll(".board-socket")].map((socket) =>
        socket.getAttribute("aria-label"),
      ),
    ).not.toContainEqual(expect.stringContaining("next relic"));
  });

  it("a short absence leaves its note under the window, with no welcome card (#334)", async () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(2_000_000), helpers: 10 },
      lastSeen: 0,
    });
    const screen = mountScreen({ storage, now: () => 2 * 60_000 });
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(true);
    expect(screen.text(".board-note.on .vein-note")).toMatch(
      /^\+[\d,]+ stones while you were away$/,
    );
    await Promise.resolve();
    expect(screen.progress.getSnapshot().quietAway).toBeUndefined();
  });

  it("fills the guide bar between relics", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(5_500_000)) });
    expect(
      screen.root.querySelector(".guide-bar")?.getAttribute("aria-valuenow"),
    ).toBe("50");
  });

  it("shows the welcome-back card before a relic found while away", () => {
    const storage = seeded(
      { ...minedMountain(999_000), helpers: 10 },
      Date.now() - 400_000,
    );
    const screen = mountScreen({ storage });
    const reveal = screen.root.querySelector<HTMLElement>(".relic-reveal");
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(false);
    expect(reveal?.hidden).toBe(true);

    screen.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
    expect(reveal?.hidden).toBe(false);
  });
});

describe("relic shelf", () => {
  const seeded = (mountain: Mountain) => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({ version: 5, mountain, lastSeen: Date.now() }),
    );
    return storage;
  };

  it("shows six silhouettes for a new dad and opens a list of buried relics", () => {
    const screen = mountScreen();
    const tag = screen.root.querySelector<HTMLElement>(".board-tag");
    const sockets = [
      ...screen.root.querySelectorAll<HTMLButtonElement>(".board-socket"),
    ];
    expect(tag?.textContent).toBe("Relics of Fatherhood · 0 of 6");
    expect(sockets.map((socket) => socket.getAttribute("aria-label"))).toEqual(
      RELICS.map(
        (relic, index) =>
          `${relic.name}, ${index === 0 ? "next relic" : "not found yet"}. 0 of 6 found`,
      ),
    );

    const dialog = screen.root.querySelector<HTMLElement>(".shelf-dialog");
    expect(dialog?.hidden).toBe(true);
    // The tag is a label; the shelf opens from a socket note's key (#370).
    tag?.click();
    expect(dialog?.hidden).toBe(true);
    openShelfFromSocket(screen.root, sockets[0]);
    expect(dialog?.hidden).toBe(false);
    const names = [...screen.root.querySelectorAll(".shelf-name")].map(
      (el) => el.textContent,
    );
    expect(names).toEqual(RELICS.map((relic) => relic.name));
    expect(screen.text(".shelf-detail")).toBe(
      "A warm light waits in the dark below.",
    );
    expect(screen.root.textContent).not.toContain("???");
    expect(
      [...screen.root.querySelectorAll<HTMLElement>(".shelf-hint")].every(
        (hint) => hint.hidden,
      ),
    ).toBe(true);

    screen.root.querySelector<HTMLButtonElement>(".shelf-close")?.click();
    expect(dialog?.hidden).toBe(true);
  });

  it("lights up found relics, teases the rest, and hints only how near the next one is", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(12_000_000)) });
    expect(screen.text(".board-tag")).toBe("Relics of Fatherhood · 2 of 6");
    const sockets = [...screen.root.querySelectorAll(".board-socket")];
    expect(
      sockets.map((socket) =>
        socket.getAttribute("aria-label")?.includes(", found."),
      ),
    ).toEqual([true, true, false, false, false, false]);

    openShelfFromSocket(
      screen.root,
      screen.root.querySelector<HTMLButtonElement>(".board-socket"),
    );
    const rows = [...screen.root.querySelectorAll(".shelf-list li")];
    expect(rows[0]?.querySelector(".shelf-name")?.textContent).toBe(
      "Lantern of Guidance",
    );
    expect(rows.every((row) => row.classList.contains("sheet-card"))).toBe(
      true,
    );
    expect(rows.every((row) => row.querySelector(".sheet-card-icon"))).toBe(
      true,
    );
    expect(rows[0]?.classList.contains("sheet-ready")).toBe(true);
    expect(rows[2]?.classList.contains("sheet-locked")).toBe(true);
    expect(rows[1]?.querySelector(".shelf-detail")?.textContent).toContain(
      "The virtue of Protection.",
    );
    expect(rows[2]?.querySelector(".shelf-name")?.textContent).toBe(
      "Hammer of the Builder",
    );
    expect(rows[2]?.querySelector(".shelf-detail")?.textContent).toBe(
      "Somewhere down there lies the hammer that built great things.",
    );
    // 12M is 2M into the 15M stretch to the Hammer: still far below.
    expect(rows[2]?.querySelector(".shelf-hint")?.textContent).toBe(
      "Next · Far below",
    );
    expect(rows[3]?.querySelector<HTMLElement>(".shelf-hint")?.hidden).toBe(
      true,
    );
    for (const row of rows.slice(2)) {
      expect(row.textContent).not.toMatch(/\d|\?/);
    }
  });
});

describe("start over", () => {
  const seededDad = () => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({
        version: 5,
        mountain: {
          ...minedMountain(12_000_000),
          helpers: 4,
          carts: 1,
          drills: 0,
          borers: 0,
          machines: 0,
          kids: 0,
        },
        lastSeen: Date.now(),
      }),
    );
    return storage;
  };

  it("asks first, in a danger dialog that defaults to keeping the mountain", () => {
    const storage = seededDad();
    const screen = mountScreen({ storage });
    document.body.append(screen.root);
    try {
      const dialog = screen.root.querySelector<HTMLElement>(".start-over");
      expect(dialog?.hidden).toBe(true);
      expect(dialog?.getAttribute("role")).toBe("alertdialog");

      screen.root.querySelector<HTMLButtonElement>(".start-over-link")?.click();
      expect(dialog?.hidden).toBe(false);
      expect(screen.text("#start-over-detail")).toContain(
        "every relic you found",
      );
      expect(document.activeElement).toBe(
        screen.root.querySelector(".start-over-cancel"),
      );

      screen.root
        .querySelector<HTMLButtonElement>(".start-over-cancel")
        ?.click();
      expect(dialog?.hidden).toBe(true);
      expect(document.activeElement).toBe(
        screen.root.querySelector(".menu-button"),
      );

      screen.root.querySelector<HTMLButtonElement>(".start-over-link")?.click();
      dialog?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(dialog?.hidden).toBe(true);

      expect(screen.text(".board-tag")).toBe("Relics of Fatherhood · 2 of 6");
      expect(
        JSON.parse(storage.getItem(SESSION_SAVE_KEY) ?? "{}"),
      ).toMatchObject({ mountain: { helpers: 4 } });
    } finally {
      screen.root.remove();
    }
  });

  it("wipes stones, crew and relics on confirm, on screen and on the device", () => {
    const storage = seededDad();
    const screen = mountScreen({ storage });

    screen.root.querySelector<HTMLButtonElement>(".start-over-link")?.click();
    screen.root
      .querySelector<HTMLButtonElement>(".start-over-confirm")
      ?.click();

    expect(screen.root.querySelector<HTMLElement>(".start-over")?.hidden).toBe(
      true,
    );
    expect(screen.text(".stones-left")).toBe(
      `${formatCount(stonesLeft(createMountain()))} stones left`,
    );
    expect(screen.pocket()).toBe("Stones 0");
    expect(screen.text(".crew-status")).toBe(
      "No crew yet. Hire a worker to mine for you.",
    );
    expect(screen.text(".board-tag")).toBe("Relics of Fatherhood · 0 of 6");
    expect(
      screen.root.querySelector<HTMLElement>(".relic-reveal")?.hidden,
    ).toBe(true);
    const saved = JSON.parse(storage.getItem(SESSION_SAVE_KEY) ?? "{}") as {
      mountain: { startedAt?: unknown };
    };
    expect(saved).toMatchObject({
      version: 6,
      mountain: {
        remaining: 240_000_000,
        pocket: 0,
        helpers: 0,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
        kids: 0,
      },
    });
    expect(typeof saved.mountain.startedAt).toBe("number");
  });
});

describe("menu", () => {
  it("tucks account and Start over away behind the menu button", () => {
    const screen = mountScreen();
    document.body.append(screen.root);
    try {
      const menu = screen.root.querySelector<HTMLElement>(".game-menu");
      const button =
        screen.root.querySelector<HTMLButtonElement>(".menu-button");
      expect(screen.root.querySelector(".top-bar .menu-button")).toBe(button);
      expect(menu?.hidden).toBe(true);
      expect(menu?.querySelector(".auth-action")).not.toBeNull();
      expect(menu?.querySelector(".auth-status")).not.toBeNull();
      expect(menu?.querySelector(".start-over-link")).not.toBeNull();

      button?.click();
      expect(menu?.hidden).toBe(false);
      expect(document.activeElement).toBe(menu?.querySelector(".menu-close"));
      menu?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(menu?.hidden).toBe(true);
      expect(document.activeElement).toBe(button);

      button?.click();
      menu?.querySelector<HTMLButtonElement>(".start-over-link")?.click();
      expect(menu?.hidden).toBe(true);
      expect(
        screen.root.querySelector<HTMLElement>(".start-over")?.hidden,
      ).toBe(false);
    } finally {
      screen.root.remove();
    }
  });

  const clipboard = (value: unknown): (() => void) => {
    const previous = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value,
    });
    return () => {
      if (previous === undefined) {
        Reflect.deleteProperty(navigator, "clipboard");
        return;
      }
      Object.defineProperty(navigator, "clipboard", previous);
    };
  };

  it("copies the field log for a guest and floats Copied", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const restore = clipboard({ writeText });
    const screen = mountScreen();
    document.body.append(screen.root);
    try {
      screen.progress.applyMutation((mountain) =>
        buyTier(
          { ...mountain, pocket: tierCost(tierById("helper"), 0) },
          "helper",
        ),
      );
      screen.root.querySelector<HTMLButtonElement>(".menu-button")?.click();
      const copy =
        screen.root.querySelector<HTMLButtonElement>(".field-log-copy");
      expect(copy?.textContent).toBe("Copy field log");
      expect(copy?.disabled).toBe(false);
      copy?.click();
      await vi.waitFor(() => {
        expect(screen.root.querySelector(".copied-float")?.textContent).toBe(
          "Copied",
        );
      });
      const text = String(writeText.mock.calls[0]?.[0]);
      expect(text).toContain('\n  "snapshot"');
      const parsed = JSON.parse(text) as {
        snapshot: { version: string; crew: { helper: number } };
        events: { code: string; data: { id?: string; count?: number } }[];
      };
      expect(parsed.snapshot.version).toBe(APP_VERSION);
      expect(parsed.snapshot.crew.helper).toBe(1);
      expect(parsed.events).toEqual([
        expect.objectContaining({
          code: "tier.buy",
          data: { id: "helper", count: 1 },
        }),
      ]);
      copy?.click();
      await vi.waitFor(() => {
        expect(writeText).toHaveBeenCalledTimes(2);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(screen.root.querySelectorAll(".copied-float")).toHaveLength(1);
      screen.root
        .querySelector(".game-menu")
        ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      expect(screen.root.querySelector(".copied-float")).toBeNull();

      screen.root.querySelector<HTMLButtonElement>(".menu-button")?.click();
      copy?.click();
      await vi.waitFor(() => {
        expect(screen.root.querySelector(".copied-float")?.textContent).toBe(
          "Copied",
        );
      });
      screen.root
        .querySelector(".copied-float")
        ?.dispatchEvent(new Event("animationend"));
      expect(screen.root.querySelector(".copied-float")).toBeNull();
    } finally {
      restore();
      screen.root.remove();
    }
  });

  it("shows a selectable log when the clipboard is missing or refuses", async () => {
    const restore = clipboard(undefined);
    const screen = mountScreen();
    document.body.append(screen.root);
    try {
      const openCopy = (): void => {
        screen.root.querySelector<HTMLButtonElement>(".menu-button")?.click();
        screen.root
          .querySelector<HTMLButtonElement>(".field-log-copy")
          ?.click();
      };
      openCopy();
      const sheet = (): HTMLElement => {
        const element = screen.root.querySelector(".field-log-sheet");
        if (!(element instanceof HTMLElement)) {
          throw new Error("field log sheet did not render");
        }
        return element;
      };
      await vi.waitFor(() => {
        expect(sheet().hidden).toBe(false);
      });
      const box = sheet().querySelector("textarea");
      expect(box?.readOnly).toBe(true);
      expect(box?.disabled).toBe(false);
      expect(box?.value).toContain(`"version": "${APP_VERSION}"`);
      expect(document.activeElement).toBe(box);
      sheet().querySelector<HTMLButtonElement>(".field-log-close")?.click();
      expect(sheet().hidden).toBe(true);
      expect(document.activeElement).toBe(
        screen.root.querySelector(".menu-button"),
      );

      restore();
      const bare = clipboard({});
      try {
        openCopy();
        await vi.waitFor(() => {
          expect(sheet().hidden).toBe(false);
        });
        sheet().querySelector<HTMLButtonElement>(".field-log-close")?.click();
      } finally {
        bare();
      }

      const refuse = clipboard({
        writeText: () => Promise.reject(new Error("denied")),
      });
      try {
        openCopy();
        await vi.waitFor(() => {
          expect(sheet().hidden).toBe(false);
        });
        sheet().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(sheet().hidden).toBe(true);
        expect(screen.root.querySelector(".copied-float")).toBeNull();
      } finally {
        refuse();
      }
    } finally {
      restore();
      screen.root.remove();
    }
  });

  it("leaves the signed-in name out of the copied log", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const restore = clipboard({ writeText });
    const user = { uid: "dad-1", label: "dad@example.com" };
    const screen = mountScreen({
      auth: createMemoryAuth({ state: { kind: "signed-in", user }, user }),
      cloudSave: createMemoryCloudSave({
        docs: new Map([[user.uid, createMountain()]]),
      }),
    });
    document.body.append(screen.root);
    try {
      await vi.waitFor(() => {
        expect(screen.progress.getSnapshot().ready).toBe(true);
      });
      expect(screen.text(".auth-status")).toContain("dad@example.com");
      screen.root.querySelector<HTMLButtonElement>(".menu-button")?.click();
      screen.root.querySelector<HTMLButtonElement>(".field-log-copy")?.click();
      await vi.waitFor(() => {
        expect(writeText).toHaveBeenCalled();
      });
      const text = String(writeText.mock.calls[0]?.[0]);
      expect(text).not.toContain("dad@example.com");
      expect(text).not.toContain("dad-1");
      expect(text).not.toContain("displayName");
    } finally {
      restore();
      screen.root.remove();
    }
  });
});

describe("the control board (#370)", () => {
  const seeded = (mountain: Mountain, lastSeen = Date.now()) => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain, lastSeen });
    return storage;
  };

  it("the board shows the pocket on the odometer", () => {
    const screen = mountScreen({
      storage: seeded({ ...minedMountain(100_000), pocket: 41_380 }),
    });
    expect(
      screen.root.querySelector(".board-top .board-stock .board-odo"),
    ).not.toBeNull();
    expect(screen.pocket()).toBe("Stones 41,380");
    expect(screen.root.querySelector(".pocket")).toBeNull();
    expect(screen.root.querySelector(".pocket-rate")).toBeNull();
  });

  it("reads the crew's rate on the main screen, with the pocket gone", () => {
    const screen = mountScreen({
      storage: seeded({ ...minedMountain(400), helpers: 3, carts: 1 }),
    });
    const line = screen.root.querySelector(":scope > .crew > .crew-status");
    expect(line?.textContent).toMatch(/^Your crew mines \d+ stones a second$/);
  });

  it("a buy shows the spend on the odometer", () => {
    const price = tierCost(tierById("helper"), 0);
    const screen = mountScreen({ storage: seeded(minedMountain(price)) });
    expect(screen.text(".board-spend")).toBe("");
    screen.root
      .querySelector<HTMLButtonElement>('.tier[data-tier="helper"]')
      ?.click();
    expect(screen.pocket()).toBe("Stones 0");
    expect(screen.text(".board-spend")).toBe(
      `−${price.toLocaleString("en-US")}`,
    );
  });

  it("a buy shows its spend even when the crew earned more since the last tick", async () => {
    vi.useFakeTimers();
    try {
      let clock = 5_000_000;
      const price = tierCost(tierById("helper"), 20);
      const screen = mountScreen({
        storage: seeded(
          { ...minedMountain(25_000_000), helpers: 20, carts: 5, drills: 2 },
          clock,
        ),
        now: () => clock,
      });
      // The crew mines for a few seconds: no spend shows.
      for (let i = 0; i < 3; i += 1) {
        clock += 1_000;
        await vi.advanceTimersByTimeAsync(1_000);
      }
      expect(screen.text(".board-spend")).toBe("");
      // Over a second of crew income, more than the price, lands with the buy.
      clock += 1_500;
      screen.root
        .querySelector<HTMLButtonElement>('.tier[data-tier="helper"]')
        ?.click();
      expect(screen.text('[data-tier="helper"] .tier-count')).toBe("×21");
      expect(screen.text(".board-spend")).toBe(
        `−${price.toLocaleString("en-US")}`,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("a cloud copy ahead with a smaller pocket shows no spend", async () => {
    let push: (result: CloudLoadResult) => void = () => undefined;
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        push = onChange;
        return () => undefined;
      },
    };
    const screen = mountScreen({ auth: signedIn(), cloudSave });
    push({ kind: "found", mountain: minedMountain(40_000), rev: 1 });
    await Promise.resolve();
    expect(screen.pocket()).toBe("Stones 40,000");
    // The PC dug 20,000 more and spent 59,000 of it.
    push({
      kind: "found",
      mountain: { ...minedMountain(60_000), pocket: 1_000 },
      rev: 2,
    });
    await Promise.resolve();
    expect(screen.pocket()).toBe("Stones 1,000");
    expect(screen.text(".board-spend")).toBe("");
  });

  it("starting over is not a spend", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(5_000)) });
    screen.root.querySelector<HTMLButtonElement>(".start-over-link")?.click();
    screen.root
      .querySelector<HTMLButtonElement>(".start-over-confirm")
      ?.click();
    expect(screen.pocket()).toBe("Stones 0");
    expect(screen.text(".board-spend")).toBe("");
  });

  it("the dial opens Running now", () => {
    const clock = 5_000_000;
    const screen = mountScreen({
      storage: seeded(
        {
          ...minedMountain(0),
          helpers: 3,
          boosts: { overtime: clock + 20 * 60_000 },
        },
        clock,
      ),
      now: () => clock,
    });
    document.body.append(screen.root);
    try {
      const dial = screen.root.querySelector<HTMLButtonElement>(
        ".board-stock .board-dial",
      );
      expect(dial?.getAttribute("aria-label")).toBe(
        "Overtime, crew ×2, 20:00 left",
      );
      const note = screen.root.querySelector<HTMLElement>(".board-note");
      expect(note?.classList.contains("on")).toBe(false);
      dial?.click();
      expect(note?.classList.contains("on")).toBe(true);
      expect(note?.querySelector(".board-note-h")?.textContent).toBe(
        "Running now",
      );
      const chip = note?.querySelector<HTMLElement>(
        '.effect-row .boost-chip[data-boost="overtime"]',
      );
      expect(chip?.hidden).toBe(false);
      expect(chip?.textContent).toBe("Overtime×2 20:00");
      expect(note?.textContent).not.toContain("Nothing running");
    } finally {
      screen.root.remove();
    }
  });

  it("the dial reads Nothing running when no clock runs", () => {
    const screen = mountScreen();
    document.body.append(screen.root);
    try {
      screen.root.querySelector<HTMLButtonElement>(".board-dial")?.click();
      const note = screen.root.querySelector<HTMLElement>(".board-note");
      expect(note?.classList.contains("on")).toBe(true);
      expect(note?.querySelector(".board-note-h")?.textContent).toBe(
        "Running now",
      );
      expect(note?.textContent).toContain("Nothing running");
      expect(note?.querySelector<HTMLElement>(".effect-row")?.hidden).toBe(
        true,
      );
    } finally {
      screen.root.remove();
    }
  });

  it("keeps the running list in the page after a relic's note replaced it", () => {
    const screen = mountScreen();
    document.body.append(screen.root);
    try {
      screen.root.querySelector<HTMLButtonElement>(".board-dial")?.click();
      screen.root.querySelector<HTMLButtonElement>(".board-socket")?.click();
      expect(screen.root.querySelector(".board-note .effect-row")).toBeNull();
      screen.dig.click();
      expect(
        screen.root.querySelector(".board-running-park .effect-row"),
      ).not.toBeNull();
    } finally {
      screen.root.remove();
    }
  });

  it("fits the save line again once the board's fonts have loaded", async () => {
    let loaded: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
      loaded = resolve;
    });
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready },
    });
    try {
      const screen = mountScreen();
      const words = screen.root.querySelector(".board-save-words");
      if (words !== null) {
        words.textContent = "stale";
      }
      loaded();
      await ready;
      await Promise.resolve();
      expect(screen.text(".save-status")).toBe("Sign in to save");
    } finally {
      Reflect.deleteProperty(document, "fonts");
    }
  });

  it("the relic plate replaces the goal line and the shelf button", () => {
    const screen = mountScreen({
      storage: seeded(minedMountain(12_000_000)),
    });
    expect(screen.root.querySelector(".relic-goal")).toBeNull();
    expect(screen.root.querySelector(".relic-shelf")).toBeNull();
    expect(
      screen.root.querySelectorAll(".board-top .board-relics .board-socket"),
    ).toHaveLength(6);
    expect(screen.text(".board-tag")).toBe("Relics of Fatherhood · 2 of 6");
    const shelf = screen.root.querySelector<HTMLElement>(".shelf-dialog");
    expect(shelf?.hidden).toBe(true);
    document.body.append(screen.root);
    try {
      const socket =
        screen.root.querySelectorAll<HTMLButtonElement>(".board-socket")[2];
      openShelfFromSocket(screen.root, socket);
      expect(shelf?.hidden).toBe(false);
      screen.root.querySelector<HTMLButtonElement>(".shelf-close")?.click();
      expect(shelf?.hidden).toBe(true);
      // Focus goes back to the socket whose note opened the shelf.
      expect(document.activeElement).toBe(socket);
    } finally {
      screen.root.remove();
    }
  });

  it("the save line is the board's", () => {
    const screen = mountScreen();
    const status = screen.root.querySelector(".board-saveline .save-status");
    expect(status).not.toBeNull();
    expect(screen.root.querySelectorAll(".save-status")).toHaveLength(1);
    expect(status?.textContent).toBe("Sign in to save");
    expect(status?.getAttribute("data-kind")).toBe("unsigned");
    expect(
      screen.root.querySelector(":scope > .board-saveline"),
    ).not.toBeNull();
    expect(
      screen.root.querySelector(
        ":scope > .board-drawer-clip > .board-save-drawer",
      ),
    ).not.toBeNull();
  });

  it("keeps the menu button on the screen, and it opens the menu", () => {
    const screen = mountScreen();
    const button = screen.root.querySelector<HTMLButtonElement>(
      ".top-bar .menu-button",
    );
    expect(button).not.toBeNull();
    const menu = screen.root.querySelector<HTMLElement>(".game-menu");
    expect(menu?.hidden).toBe(true);
    button?.click();
    expect(menu?.hidden).toBe(false);
  });

  it("opening a sheet, the shelf or the menu closes the save drawer and the note", () => {
    const screen = mountScreen({
      storage: seeded({
        ...minedMountain(12_000_000),
        helpers: 20,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "camp" }],
      }),
    });
    document.body.append(screen.root);
    try {
      const drawer = screen.root.querySelector(".board-save-drawer");
      const note = screen.root.querySelector(".board-note");
      const status =
        screen.root.querySelector<HTMLButtonElement>(".save-status");
      expect(
        screen.root.querySelector<HTMLButtonElement>(".thumb-workshop")
          ?.disabled,
      ).toBe(false);
      const doors = [
        ".buys-button",
        ".thumb-workshop",
        ".upgrades-button",
        ".engineers-button",
        ".menu-button",
      ];
      for (const door of doors) {
        status?.click();
        expect(drawer?.classList.contains("is-open")).toBe(true);
        screen.root.querySelector<HTMLButtonElement>(".board-dial")?.click();
        expect(note?.classList.contains("on")).toBe(true);
        screen.root.querySelector<HTMLButtonElement>(door)?.click();
        expect(drawer?.classList.contains("is-open"), door).toBe(false);
        expect(note?.classList.contains("on"), door).toBe(false);
      }
      // The shelf's door is the Relic shelf key in a socket's note.
      status?.click();
      expect(drawer?.classList.contains("is-open")).toBe(true);
      openShelfFromSocket(
        screen.root,
        screen.root.querySelector<HTMLButtonElement>(".board-socket"),
      );
      expect(drawer?.classList.contains("is-open")).toBe(false);
      expect(note?.classList.contains("on")).toBe(false);
      expect(
        screen.root.querySelector<HTMLElement>(".shelf-dialog")?.hidden,
      ).toBe(false);
    } finally {
      screen.root.remove();
    }
  });

  // ---------- the gauge row (#371) ----------

  /** A pointer click (detail 1); a keyboard click has detail 0. */
  const tap = (button: HTMLElement): void => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  };
  const plus = (screen: ReturnType<typeof mountScreen>) =>
    screen.root.querySelector<HTMLElement>(".board-mine .board-dig-plus");

  it("the window digs exactly tap power", () => {
    const clock = 5_000_000;
    const m: Mountain = {
      ...minedMountain(30_000),
      helpers: 500,
      carts: 3,
      upgrades: { tap: 1 },
    };
    const screen = mountScreen({ storage: seeded(m, clock), now: () => clock });
    const tapYield = effectiveRates(m, clock).tapYield;
    expect(tapYield).toBeGreaterThan(1);
    const pocket = () => screen.progress.getSnapshot().mountain.pocket;
    const before = pocket();
    tap(screen.dig);
    tap(screen.dig);
    tap(screen.dig);
    expect(pocket()).toBe(before + 3 * tapYield);
    expect(plus(screen)?.hidden).toBe(false);
    expect(plus(screen)?.textContent).toBe(`+${formatCount(tapYield)}`);
    expect(screen.dig.getAttribute("aria-label")).toBe(
      `Mine window: tap to mine ${tapWords(tapYield)}`,
    );
    for (const gone of [".mountain", ".mountain-stage", ".tap-float"]) {
      expect(screen.root.querySelector(gone), gone).toBeNull();
    }
  });

  it("a dig's +N is the tap's own stones, not the crew's since the last tick", () => {
    let clock = 5_000_000;
    const m: Mountain = { ...minedMountain(400), helpers: 3, carts: 1 };
    const screen = mountScreen({
      storage: seeded(m, clock),
      now: () => clock,
    });
    const pocket = () => screen.progress.getSnapshot().mountain.pocket;
    const before = pocket();
    // A second of crew work waits to be settled by the tap.
    clock += 1_000;
    tap(screen.dig);
    expect(pocket() - before).toBeGreaterThan(1);
    expect(plus(screen)?.textContent).toBe("+1");
  });

  it("a keyboard click on the window digs once and puffs at the upper face", () => {
    const screen = mountScreen();
    screen.dig.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 0 }),
    );
    expect(screen.pocket()).toBe("Stones 1");
    const dust = screen.root.querySelector<HTMLElement>(".board-dig-dust");
    expect(dust?.hidden).toBe(false);
    // puffSpot's default (67, 30) in view art px, 2 CSS px each.
    expect(dust?.style.left).toBe("134px");
    expect(dust?.style.top).toBe("60px");
    expect(plus(screen)?.textContent).toBe("+1");
  });

  it("no dig while loading or mined out", async () => {
    let finishLoad: (result: CloudLoadResult) => void = () => {
      throw new Error("load was not pending");
    };
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        finishLoad = onChange;
        return () => undefined;
      },
    };
    const loading = mountScreen({ auth: signedIn(), cloudSave });
    expect(loading.dig.disabled).toBe(true);
    expect(loading.dig.getAttribute("aria-label")).toBe(
      "Mine window: tap to mine one stone",
    );
    tap(loading.dig);
    expect(loading.pocket()).toBe("Stones 0");
    expect(plus(loading)?.hidden).toBe(true);
    finishLoad({ kind: "found", mountain: minedMountain(40) });
    await Promise.resolve();
    expect(loading.dig.disabled).toBe(false);
    tap(loading.dig);
    expect(loading.pocket()).toBe("Stones 41");
    expect(plus(loading)?.textContent).toBe("+1");

    const done = mountScreen({
      storage: seeded(minedMountain(MOUNTAIN_STONES)),
    });
    expect(done.dig.disabled).toBe(true);
    expect(done.dig.getAttribute("aria-label")).toBe(
      "The mountain is mined out",
    );
    const held = done.pocket();
    tap(done.dig);
    expect(done.pocket()).toBe(held);
    expect(plus(done)?.hidden).toBe(true);
  });

  it("the window shows the band's view", () => {
    const deep = mountScreen({ storage: seeded(minedMountain(60_000_000)) });
    expect(
      deep.root.querySelector(
        '.board-gauge-row .board-mine[data-band="crystal"]',
      ),
    ).not.toBeNull();
    const shallow = mountScreen({ storage: seeded(minedMountain(500_000)) });
    expect(
      shallow.root.querySelector<HTMLElement>(".board-mine")?.dataset["band"],
    ).toBe("topsoil");
  });

  it("the gauge reads the crew's rate", async () => {
    vi.useFakeTimers();
    try {
      let clock = 5_000_000;
      const m: Mountain = { ...minedMountain(400), helpers: 3, carts: 1 };
      const screen = mountScreen({
        storage: seeded(m, clock),
        now: () => clock,
      });
      const gauge = screen.root.querySelector(".board-gauge-row .board-gauge");
      const rate = stonesPerSecond(m, clock);
      expect(rate).toBeGreaterThan(0);
      expect(gauge?.getAttribute("aria-label")).toBe(
        `Output: ${formatCount(rate)} stones a second`,
      );
      // The crew's number lives on the gauge now: no float over the window.
      clock += 1_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(screen.root.querySelector(".crew-float")).toBeNull();
      expect(gauge?.getAttribute("aria-label")).toBe(
        `Output: ${formatCount(rate)} stones a second`,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("the vein glints in the window and pays today's vein", async () => {
    vi.useFakeTimers();
    try {
      let clock = 0;
      const screen = mountScreen({ now: () => clock, random: () => 0 });
      document.body.append(screen.root);
      const vein = screen.root.querySelector<HTMLButtonElement>(
        ".board-mine > .golden-vein",
      );
      clock = 3 * 60_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(vein?.hidden).toBe(false);
      expect(screen.dig.contains(vein ?? null)).toBe(false);
      const reward = veinReward(screen.progress.getSnapshot().mountain);
      expect(reward).toBe(50);
      vein?.click();
      // The vein pays, and the window under it does not dig.
      expect(screen.pocket()).toBe("Stones 50");
      expect(plus(screen)?.hidden).toBe(true);
      expect(screen.text(".board-note.on .vein-note")).toBe(
        "Golden vein! +50 stones",
      );
      expect(
        screen.root.querySelector(".vein-note")?.getAttribute("aria-live"),
      ).toBe("polite");
      screen.root.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the Legacy plate sits on the window", () => {
    const heir = mountScreen({
      storage: seeded({ ...minedMountain(1_000), legacy: 1 }),
    });
    const plate = heir.root.querySelector<HTMLElement>(
      ".board-mine .board-legacy",
    );
    expect(plate?.hidden).toBe(false);
    expect(plate?.querySelector(".legacy-badge")?.textContent).toBe(
      "Legacy ×1.5",
    );
    const first = mountScreen({
      storage: seeded({ ...minedMountain(1_000), legacy: 0 }),
    });
    expect(
      first.root.querySelector<HTMLElement>(".board-mine .board-legacy")
        ?.hidden,
    ).toBe(true);
  });

  it("Start over brings the tarp back", () => {
    const screen = mountScreen({
      storage: seeded({ ...minedMountain(12_000_000), helpers: 4, borers: 1 }),
    });
    const part = (name: string) =>
      screen.root.querySelector<HTMLElement>(`.board-window-${name}`);
    expect(part("borer")?.hidden).toBe(false);
    expect(part("tarp")?.hidden).toBe(true);
    screen.root.querySelector<HTMLButtonElement>(".start-over-link")?.click();
    screen.root
      .querySelector<HTMLButtonElement>(".start-over-confirm")
      ?.click();
    expect(part("borer")?.hidden).toBe(true);
    expect(part("tarp")?.hidden).toBe(false);
  });

  it("beats once for a cloud copy with 25 more carts, never on the first render, a fall or Start over", async () => {
    setReducedMotion(false);
    const beats = vi.mocked(machinesBeat);
    let push: (result: CloudLoadResult) => void = () => undefined;
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        push = onChange;
        return () => undefined;
      },
    };
    const screen = mountScreen({ auth: signedIn(), cloudSave });
    beats.mockClear();
    push({
      kind: "found",
      mountain: { ...minedMountain(40_000), helpers: 2, carts: 1 },
      rev: 1,
    });
    await Promise.resolve();
    expect(screen.text(".save-status")).toBe("Saved to your account");
    expect(beats).not.toHaveBeenCalled();

    push({
      kind: "found",
      mountain: { ...minedMountain(60_000), helpers: 2, carts: 26 },
      rev: 2,
    });
    await Promise.resolve();
    expect(screen.progress.getSnapshot().mountain.carts).toBe(26);
    expect(beats.mock.calls.map(([, beat]) => beat)).toEqual(["cart"]);

    beats.mockClear();
    push({
      kind: "found",
      mountain: { ...minedMountain(80_000), helpers: 2, carts: 3 },
      rev: 3,
    });
    await Promise.resolve();
    expect(screen.progress.getSnapshot().mountain.carts).toBe(3);
    screen.root.querySelector<HTMLButtonElement>(".start-over-link")?.click();
    screen.root
      .querySelector<HTMLButtonElement>(".start-over-confirm")
      ?.click();
    expect(screen.progress.getSnapshot().mountain.carts).toBe(0);
    expect(beats).not.toHaveBeenCalled();
  });

  it("no beat when the mine is passed down, or on a guest's first render", () => {
    setReducedMotion(false);
    const beats = vi.mocked(machinesBeat);
    beats.mockClear();
    const screen = mountScreen({
      storage: seeded({
        ...minedMountain(MOUNTAIN_STONES),
        helpers: 40,
        carts: 12,
        drills: 3,
        borers: 1,
      }),
    });
    expect(beats).not.toHaveBeenCalled();
    screen.root.querySelector<HTMLButtonElement>(".menu-pass")?.click();
    screen.root.querySelector<HTMLButtonElement>(".legacy-confirm")?.click();
    expect(screen.progress.getSnapshot().mountain.legacy).toBe(1);
    expect(beats).not.toHaveBeenCalled();
  });
});
