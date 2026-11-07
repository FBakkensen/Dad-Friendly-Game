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
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import { showAppUpdate } from "./mountain-screen";
import { SESSION_SAVE_KEY } from "./session-save";
import {
  OTHER_TAB_BODY,
  OTHER_TAB_PLAY,
  OTHER_TAB_TITLE,
} from "./screen-words";
import { minedMountain } from "./test-fixtures";
import {
  bindWriterPageHide,
  createMemoryBus,
  createTabWriter,
} from "./tab-writer";
import { buyTier } from "./tiers";
import {
  createMemoryStorage,
  mountScreen,
  setReducedMotion,
  signedIn,
  stopScreens,
} from "./mountain-screen.harness";

// Animations are opted into per test; most tests want instant numbers.
beforeEach(() => {
  setReducedMotion(true);
});
afterEach(stopScreens);

describe("mountMountainScreen", () => {
  it("stops its tick and its page listeners once its signal aborts", () => {
    vi.useFakeTimers();
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

      stop.abort();
      vi.advanceTimersByTime(3_000);
      window.dispatchEvent(new Event("pagehide"));
      expect(tick).toHaveBeenCalledTimes(3);
      expect(writes).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a hundred million stones and mines one per tap", () => {
    const screen = mountScreen();

    expect(screen.text(".stones-left")).toBe(
      `${formatCount(stonesLeft(createMountain()))} stones left`,
    );
    expect(screen.text(".pocket")).toBe("0 stones");
    expect(screen.text(".goal")).toContain("Legendary Relics of Fatherhood");
    expect(screen.text(".save-status")).toBe("Sign in to save");

    const whole = stonesLeft(createMountain());
    screen.mountain.click();
    expect(
      screen.root.querySelector(".stones-left")?.getAttribute("title"),
    ).toBe(
      `${(whole - 1).toLocaleString("en-US")} of ${whole.toLocaleString("en-US")}`,
    );
    expect(screen.text(".pocket")).toBe("1 stone");
    expect(screen.text(".save-status")).toBe("Saved on this device");
    expect(
      screen.root.querySelector<HTMLElement>(".update-prompt")?.hidden,
    ).toBe(true);

    screen.mountain.click();
    expect(screen.text(".pocket")).toBe("2 stones");
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

    first.mountain.click();
    expect(first.text(".pocket")).toBe("1 stone");
    second.mountain.click();
    expect(second.text(".pocket")).toBe("0 stones");

    second.root.querySelector<HTMLButtonElement>(".other-tab-play")?.click();
    await vi.waitFor(() => {
      expect(second.root.querySelector<HTMLElement>(".other-tab")?.hidden).toBe(
        true,
      );
    });
    expect(second.text(".pocket")).toBe("1 stone");
    expect(first.root.querySelector<HTMLElement>(".other-tab")?.hidden).toBe(
      false,
    );
    second.mountain.click();
    expect(second.text(".pocket")).toBe("2 stones");
    first.progress.dispose();
    second.progress.dispose();
  });

  it("keeps guest progress after the page is opened again", () => {
    const storage = createMemoryStorage();
    const first = mountScreen({ storage });
    first.mountain.click();
    first.mountain.click();
    first.mountain.click();
    first.progress.dispose();

    const again = mountScreen({ storage });
    expect(again.text(".pocket")).toBe("3 stones");
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
    expect(screen.text(".pocket")).toBe("3 stones");
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
    expect(screen.mountain.disabled).toBe(true);
    expect(screen.mountain.getAttribute("aria-label")).toBe(
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

    expect(screen.mountain.disabled).toBe(true);
    expect(screen.text(".save-status")).toBe("Loading your save...");
    screen.mountain.click();
    expect(screen.text(".pocket")).toBe("0 stones");

    finishLoad({ kind: "found", mountain: minedMountain(40) });
    await Promise.resolve();

    expect(screen.mountain.disabled).toBe(false);
    screen.mountain.click();
    expect(screen.text(".pocket")).toBe("41 stones");
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
    expect(screen.text(".pocket")).toBe("12.3K stones");
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
    screen.mountain.click();
    await vi.waitFor(() => {
      expect(screen.text(".save-status")).toBe("Couldn't reach your save");
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

    screen.mountain.click();

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
    screen.mountain.click();
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
      `Joins your crew at ${String(shownStones(createMountain(), 120_000_000) / 1_000_000)} million stones down`,
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
        pocket: 41_000_000,
        drills: 1,
        borers: 1,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const machine = tierCard(screen.root, "machine");
    expect(machine.classList.contains("tier-locked")).toBe(false);
    expect(machine.disabled).toBe(false);
    expect(machine.querySelector(".tier-cost")?.textContent).toBe("40.2M");
    machine.click();
    expect(machine.querySelector(".tier-count")?.textContent).toBe("×1");
    expect(screen.text(".pocket")).toBe("800K stones");
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
      const storage = createMemoryStorage();
      storage.setItem(
        SESSION_SAVE_KEY,
        JSON.stringify({
          version: 5,
          mountain: minedMountain(19),
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
      expect(screen.text('[data-tier="helper"] .tier-cost')).toBe("20");
      expect(hire.disabled).toBe(true);
      expect(cart.hidden).toBe(true);

      screen.mountain.click();
      expect(hire.disabled).toBe(false);

      hire.click();
      expect(screen.text(".pocket")).toBe("0 stones");
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 1 stone a second",
      );
      expect(screen.text('[data-tier="helper"] .tier-name')).toBe("Worker");
      expect(screen.text('[data-tier="helper"] .tier-count')).toBe("×1");
      expect(screen.text('[data-tier="helper"] .tier-cost')).toBe("24");
      expect(hire.disabled).toBe(true);
      expect(cart.hidden).toBe(false);
      expect(hire.getAttribute("aria-label")).toBe(
        "Buy a worker for 24 stones, mines 1 stone a second. You have 1.",
      );

      await vi.advanceTimersByTimeAsync(3_000);
      expect(screen.text(".pocket")).toBe("3 stones");
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
          mountain: { ...minedMountain(100), helpers: 1 },
          lastSeen: Date.now(),
        }),
      );
      const screen = mountScreen({ storage });
      const cart = tierCard(screen.root, "cart");
      expect(screen.text('[data-tier="cart"] .tier-cost')).toBe("100");
      expect(cart.disabled).toBe(false);

      cart.click();
      expect(screen.text(".pocket")).toBe("0 stones");
      expect(screen.text('[data-tier="cart"] .tier-name')).toBe("Mine cart");
      expect(screen.text('[data-tier="cart"] .tier-count')).toBe("×1");
      expect(screen.text('[data-tier="cart"] .tier-cost')).toBe("200");
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 7 stones a second",
      );
      expect(
        screen.root.querySelector(".tier-grid")?.getAttribute("data-shown"),
      ).toBe("3");

      await vi.advanceTimersByTimeAsync(2_000);
      expect(screen.text(".pocket")).toBe("14 stones");
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
    expect(screen.text(".pocket")).toBe("9,000 stones");
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
      expect(vein.style.left).toBe("35%");
      expect(vein.style.top).toBe("40%");

      vein.click();
      expect(vein.hidden).toBe(true);
      expect(screen.text(".pocket")).toBe("50 stones");
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
      expect(screen.text(".pocket")).toBe("0 stones");

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

    screen.mountain.click();

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

  it("shows the next relic on the mountain too, only after the Lantern (#336)", () => {
    const before = mountScreen({ storage: seeded(minedMountain(100)) });
    expect(before.root.querySelector<HTMLElement>(".relic-goal")?.hidden).toBe(
      true,
    );
    const after = mountScreen({ storage: seeded(minedMountain(5_500_000)) });
    const line = after.root.querySelector<HTMLElement>(".relic-goal");
    expect(line?.hidden).toBe(false);
    expect(after.text(".relic-goal-text")).toBe(after.text(".goal"));
    expect(after.text(".relic-goal-text")).not.toMatch(/\d/);
    expect(
      after.root
        .querySelector(".relic-goal-bar")
        ?.getAttribute("aria-valuenow"),
    ).toBe(
      after.root.querySelector(".guide-bar")?.getAttribute("aria-valuenow"),
    );
    const done = mountScreen({
      storage: seeded(minedMountain(MOUNTAIN_STONES)),
    });
    expect(done.root.querySelector<HTMLElement>(".relic-goal")?.hidden).toBe(
      true,
    );
  });

  it("notes a short absence on the mountain, with no welcome card (#334)", async () => {
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
    expect(screen.text(".vein-note")).toMatch(
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
    const button = screen.root.querySelector<HTMLButtonElement>(".relic-shelf");
    const slots = [...screen.root.querySelectorAll<HTMLElement>(".shelf-slot")];
    expect(button?.getAttribute("aria-label")).toBe(
      "Relic shelf, 0 of 6 found",
    );
    expect(slots.map((slot) => slot.dataset["found"])).toEqual(
      Array.from({ length: 6 }, () => "false"),
    );

    const dialog = screen.root.querySelector<HTMLElement>(".shelf-dialog");
    expect(dialog?.hidden).toBe(true);
    button?.click();
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
    expect(
      screen.root.querySelector(".relic-shelf")?.getAttribute("aria-label"),
    ).toBe("Relic shelf, 2 of 6 found");
    const slots = [...screen.root.querySelectorAll<HTMLElement>(".shelf-slot")];
    expect(slots.map((slot) => slot.dataset["found"])).toEqual([
      "true",
      "true",
      "false",
      "false",
      "false",
      "false",
    ]);

    screen.root.querySelector<HTMLButtonElement>(".relic-shelf")?.click();
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

      expect(
        screen.root.querySelector(".relic-shelf")?.getAttribute("aria-label"),
      ).toBe("Relic shelf, 2 of 6 found");
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
    expect(screen.text(".pocket")).toBe("0 stones");
    expect(screen.text(".crew-status")).toBe(
      "No crew yet. Hire a worker to mine for you.",
    );
    expect(
      screen.root.querySelector(".relic-shelf")?.getAttribute("aria-label"),
    ).toBe("Relic shelf, 0 of 6 found");
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
        buyTier({ ...mountain, pocket: 20 }, "helper"),
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
