// @vitest-environment happy-dom
import { etaShort, formatCompact, formatCount } from "./format";
import { shownStones, stonesLeft } from "./scale";
import { RELICS } from "./relics";
import { savedMountain } from "./save-format";
import { RELIC_DARK, RELIC_LIT } from "./board-relics";
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
  BARE_MOUNTAIN,
} from "./mountain";
import { BUYS_SETTLE_MS, showAppUpdate } from "./mountain-screen";
import { effectiveRates } from "./rates";
import { veinReward } from "./veins";
import { SESSION_SAVE_KEY } from "./session-save";
import {
  OTHER_TAB_BODY,
  OTHER_TAB_PLAY,
  OTHER_TAB_TITLE,
  TROUBLE_FIXED,
  engineersNote,
  formatSpeed,
  tapWords,
} from "./screen-words";
import { FIX_HOLD_MS } from "./hazards";
import { lockBodyLine } from "./tier-lock-words";
import { minedMountain } from "./test-fixtures";
import {
  bindWriterPageHide,
  createMemoryBus,
  createTabWriter,
} from "./tab-writer";
import { tierById, tierCost } from "./tiers";
import {
  ACCOUNT_INFO,
  LEDGER_SHEET,
  RELICS_BAR,
  RELICS_GOAL,
  RELICS_SHEET,
  REVEAL_PAGE,
  SHELF_ROWS,
  relicPage,
  shelfShown,
  STONES_NAME,
  STONES_ROW,
  createMemoryStorage,
  mountScreen,
  setReducedMotion,
  signedIn,
  stopScreens,
} from "./mountain-screen.harness";
import { NO_BOOSTS } from "./boosts";
import { NO_UPGRADES } from "./upgrades";
import { firstNotice } from "./session";

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
      const storage = createMemoryStorage();
      writeSessionSave({
        storage,
        mountain: {
          ...createMountain(),
          remaining: MOUNTAIN_STONES - 500_000,
          pocket: 6_854,
          helpers: 18,
          carts: 6,
        },
        lastSeen: Date.now(),
      });
      const screen = mountScreen({
        signal: stop.signal,
        storage,
        deviceStorage: {
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

      // The plate's Done hold and the red button's press and tally start.
      screen.root.querySelector<HTMLButtonElement>(".board-ready")?.click();
      screen.root
        .querySelector<HTMLButtonElement>(".board-dig-button")
        ?.click();
      expect(screen.progress.getSnapshot().mountain.carts).toBe(7);
      expect(vi.getTimerCount()).toBeGreaterThan(1);

      stop.abort();
      vi.advanceTimersByTime(3_000);
      window.dispatchEvent(new Event("pagehide"));
      expect(tick).toHaveBeenCalledTimes(3);
      // The abort does not clear the plate's Done hold or the button's press
      // and tally timers. They are one-shot: within 3s they have run out, and
      // nothing (the 1s tick included) has set a new one.
      expect(vi.getTimerCount()).toBe(0);
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

    expect(screen.text(STONES_NAME)).toBe(
      `${formatCompact(stonesLeft(createMountain()))} stones left`,
    );
    expect(screen.pocket()).toBe("Stones 0");
    expect(screen.text(RELICS_GOAL)).toContain(
      "Legendary Relics of Fatherhood",
    );
    expect(screen.text(".save-status")).toBe("Sign in to save");

    const whole = stonesLeft(createMountain());
    screen.dig.click();
    expect(screen.root.querySelector(STONES_ROW)?.getAttribute("title")).toBe(
      `${(whole - 1).toLocaleString("en-US")} of ${whole.toLocaleString("en-US")}`,
    );
    expect(screen.pocket()).toBe("Stones 1");
    expect(screen.text(".save-status")).toBe("Saved on this device");
    expect(
      screen.root.querySelector<HTMLElement>(".update-prompt")?.hidden,
    ).toBe(true);

    screen.dig.click();
    expect(screen.pocket()).toBe("Stones 2");
    expect(screen.root.querySelector(STONES_ROW)?.getAttribute("title")).toBe(
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

  it("an update on a page with no prompt shows nothing and throws nothing", () => {
    // A newer service worker can call it before the screen is mounted.
    const page = document.createElement("div");
    expect(() => {
      showAppUpdate(page);
    }).not.toThrow();
    expect(page.childElementCount).toBe(0);
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
    expect(card?.matches(".board-card[data-card=other-tab]")).toBe(true);
    expect(card?.querySelector(".board-card-face")).not.toBeNull();
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

  it("the other-tab card takes focus once, not each second", async () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage();
    const bus = createMemoryBus();
    const tab = (tabId: string) =>
      createTabWriter({ tabId, storage, bus, handoffMs: 0, yieldWaitMs: 30 });
    const first = mountScreen({ storage, tabWriter: tab("tab-writer") });
    const second = mountScreen({ storage, tabWriter: tab("tab-other1") });
    // Focus moves only in the page: the first tab's card opens once it is in.
    document.body.append(first.root);
    try {
      second.root.querySelector<HTMLButtonElement>(".other-tab-play")?.click();
      await vi.advanceTimersByTimeAsync(100);
      const card = first.root.querySelector<HTMLElement>(".other-tab");
      const play =
        first.root.querySelector<HTMLButtonElement>(".other-tab-play");
      expect(card?.hidden).toBe(false);
      expect(document.activeElement).toBe(play);
      play?.blur();
      vi.advanceTimersByTime(3_000);
      expect(card?.hidden).toBe(false);
      expect(document.activeElement).not.toBe(play);
    } finally {
      first.root.remove();
      first.progress.dispose();
      second.progress.dispose();
      vi.useRealTimers();
    }
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
    expect(screen.root.querySelector(STONES_ROW)?.getAttribute("title")).toBe(
      `${(allStones - 3).toLocaleString("en-US")} of ${allStones.toLocaleString("en-US")}`,
    );
  });

  it("disables the mountain once it is mined out", () => {
    const storage = createMemoryStorage();
    const done: Mountain = {
      ...BARE_MOUNTAIN,
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
      JSON.stringify({
        version: 5,
        mountain: savedMountain(done),
        lastSeen: 1,
      }),
    );

    const screen = mountScreen({ storage });
    expect(screen.text(STONES_NAME)).toBe("0 stones left");
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
    expect(screen.account.getAttribute("aria-label")).toBe(
      "Sign in with Google",
    );

    screen.openLedger();
    screen.account.click();

    await vi.waitFor(() => {
      expect(screen.text(".save-status")).toBe("Saved to your account");
    });
    expect(screen.pocket()).toBe("Stones 12,345");
    expect(screen.text(ACCOUNT_INFO)).toBe("Signed in as Test Dad");
    expect(
      screen.root.querySelector(".save-status")?.getAttribute("data-log"),
    ).toContain("save.remote found");

    screen.account.click();
    expect(screen.account.getAttribute("aria-label")).toBe(
      "Sign in with Google",
    );
  });

  it("shows sign-in in progress on the account row, which a tap leaves alone", () => {
    const auth = createMemoryAuth({ state: { kind: "signing-in" } });
    const signIn = vi.spyOn(auth, "signIn");
    const screen = mountScreen({ auth });
    expect(screen.text(ACCOUNT_INFO)).toBe("Signing in...");
    expect(screen.account.getAttribute("aria-label")).toBe("Signing in...");
    screen.openLedger();
    screen.account.click();
    expect(signIn).not.toHaveBeenCalled();
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

  it("settles a return to the tab once the server has been read", async () => {
    const docs = new Map<string, Mountain>();
    const screen = mountScreen({
      auth: signedIn(),
      cloudSave: createMemoryCloudSave({ docs }),
    });
    await vi.waitFor(() => {
      expect(docs.has("test-dad")).toBe(true);
    });
    const resume = vi.spyOn(screen.progress, "resume");
    const tick = vi.spyOn(screen.progress, "tick");

    document.dispatchEvent(new Event("visibilitychange"));

    const read = resume.mock.results[0]?.value as
      ReturnType<typeof screen.progress.resume> | undefined;
    if (read?.kind !== "reading") {
      throw new Error("expected the return to read the server");
    }
    // No tap lands on top of another device's save: nothing settles before the read.
    expect(tick).not.toHaveBeenCalled();
    await read.done;
    await Promise.resolve();
    expect(tick).toHaveBeenCalled();
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

  it("names the borer row, its gain and its bill once borers show", () => {
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
    const borer = tierCard(screen.root, "borer");
    expect(borer.querySelector(".board-row-name")?.textContent).toBe(
      "Tunnel borer",
    );
    // The first borer's engineer tends them: 357 becomes 435, shown floored.
    expect(borer.querySelector(".board-row-gain")?.textContent).toBe("+435/s");
    // Too dear for now: the verb says the bill.
    expect(borer.classList.contains("is-dear")).toBe(true);
    expect(borer.querySelector(".board-row-verb")?.textContent).toBe(
      "8 workers",
    );
    expect(borer.querySelector(".board-row-flag")?.textContent).toMatch(
      /^Ada tends · \+156\/s$/,
    );
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
    expect(machine.classList.contains("is-locked")).toBe(true);
    expect(machine.querySelector(".board-row-price")?.textContent).toBe(
      "Locked",
    );
    expect(machine.querySelector(".board-row-info")?.textContent).toBe(
      lockBodyLine(tierById("machine"), {
        kind: "depth",
        depth: 120_000_000,
        at: shownStones(createMountain(), 120_000_000),
      }),
    );
    expect(machine.getAttribute("aria-label")).toContain(
      `Joins your crew at ${formatCount(shownStones(createMountain(), 120_000_000))} stones down`,
    );
    machine.click();
    expect(screen.progress.getSnapshot().mountain.machines).toBe(0);
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
    expect(machine.classList.contains("is-locked")).toBe(false);
    expect(machine.disabled).toBe(false);
    expect(machine.querySelector(".board-row-price")?.textContent).toBe(
      formatCompact(tierCost(tierById("machine"), 0)),
    );
    machine.click();
    expect(screen.progress.getSnapshot().mountain.machines).toBe(1);
    expect(screen.pocket()).toBe("Stones 800.0K");
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
      expect(screen.text('.tier[data-tier="helper"] .board-row-name')).toBe(
        "Worker",
      );
      expect(screen.text('.tier[data-tier="helper"] .board-row-price')).toBe(
        formatCompact(first),
      );
      expect(hire.classList.contains("is-dear")).toBe(true);
      expect(cart.hidden).toBe(true);

      screen.dig.click();
      expect(hire.classList.contains("is-dear")).toBe(false);

      hire.click();
      expect(screen.pocket()).toBe("Stones 0");
      expect(screen.progress.getSnapshot().mountain.helpers).toBe(1);
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 1 stone a second",
      );
      // Done holds the row; the new price shows once it lets go.
      expect(screen.text('.tier[data-tier="helper"] .board-row-verb')).toBe(
        "Done",
      );

      await vi.advanceTimersByTimeAsync(3_000);
      expect(screen.pocket()).toBe("Stones 3");
      expect(screen.text('.tier[data-tier="helper"] .board-row-name')).toBe(
        "Worker",
      );
      expect(screen.text('.tier[data-tier="helper"] .board-row-price')).toBe(
        formatCompact(second),
      );
      expect(hire.classList.contains("is-dear")).toBe(true);
      expect(cart.hidden).toBe(false);
      expect(hire.getAttribute("aria-label")).toBe(
        `Buy a worker for ${formatCount(second)} stones, mines 1 stone a second. You have 1.`,
      );
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
      expect(screen.text('.tier[data-tier="cart"] .board-row-price')).toBe(
        formatCompact(tierCost(tierById("cart"), 0)),
      );
      expect(cart.classList.contains("is-can")).toBe(true);

      cart.click();
      expect(screen.pocket()).toBe("Stones 0");
      expect(screen.progress.getSnapshot().mountain.carts).toBe(1);
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 7 stones a second",
      );
      expect(
        [...screen.root.querySelectorAll<HTMLElement>(".board-row.tier")]
          .filter((row) => !row.hidden)
          .map((row) => row.dataset["tier"]),
      ).toEqual(["helper", "cart", "drill"]);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(screen.pocket()).toBe("Stones 14");
      expect(screen.text('.tier[data-tier="cart"] .board-row-name')).toBe(
        "Mine cart",
      );
      expect(screen.text('.tier[data-tier="cart"] .board-row-price')).toBe(
        formatCompact(tierCost(tierById("cart"), 1)),
      );
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
    // The number stays whole; its unit is set smaller beside it.
    expect(screen.text(".welcome-mined-count")).toBe("+9,000");
    expect(screen.text(".welcome-mined-unit")).toBe("stones");
    expect(screen.text(".welcome-detail")).toBe(
      "You were gone 2 hours 5 minutes. Your crew kept digging the whole time.",
    );

    // 9 × 4 workers × 90 s of it waits for the Gold rush (#468)
    expect(screen.text(".welcome-rush")).toBe(
      "3,240 of them wait for your Gold rush: watch for the golden vein.",
    );

    close.click();
    expect(card.hidden).toBe(true);
    expect(screen.pocket()).toBe("Stones 5,760");
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

  // Each case plays a minute or more of one-second screen ticks: about 3 s
  // under coverage, so the default 5 s runs out when the full gate is busy.
  describe(
    "the quick vein after an hour away (#468)",
    { timeout: 20_000 },
    () => {
      const HOUR = 60 * 60_000;
      const crew = { ...minedMountain(0), helpers: 4, kids: 0 };
      const opened = (awayMs: number) => {
        const storage = createMemoryStorage();
        const start = 10 * HOUR;
        writeSessionSave({ storage, mountain: crew, lastSeen: start - awayMs });
        const clock = { at: start };
        const screen = mountScreen({
          storage,
          now: () => clock.at,
          random: () => 0,
        });
        const vein = screen.root.querySelector(".golden-vein") as HTMLElement;
        // The board ticks once a second, so the clock moves a second a tick.
        const tick = async (ms: number) => {
          for (let left = ms; left > 0; left -= 1_000) {
            clock.at += 1_000;
            await vi.advanceTimersByTimeAsync(1_000);
          }
        };
        return { screen, vein, tick };
      };
      const closeWelcome = (screen: ReturnType<typeof mountScreen>) => {
        screen.root
          .querySelector<HTMLButtonElement>(".welcome-continue")
          ?.click();
      };

      it("glints 20 seconds after the welcome card, and a tap starts the Gold rush", async () => {
        vi.useFakeTimers();
        try {
          const { screen, vein, tick } = opened(2 * HOUR);
          // The welcome card covers the board: the quick vein waits.
          await tick(60_000);
          expect(vein.hidden).toBe(true);
          closeWelcome(screen);
          await tick(19_000);
          expect(vein.hidden).toBe(true);
          await tick(1_000);
          expect(vein.hidden).toBe(false);
          vein.click();
          const reward = veinReward(crew);
          expect(screen.text(".vein-note")).toBe(
            `Golden vein! +${formatCount(reward)} stones.\nGold rush: the crew digs ×10 for 90 seconds.`,
          );
          const now = screen.progress.getSnapshot().mountain;
          expect(now.rushUntil).toBeGreaterThan(0);
          // 9 × 4 workers × 90 s held from the haul come in as the crew digs
          expect(now.rushBank).toBe(3_240);
          await tick(90_000);
          const after = screen.progress.getSnapshot().mountain;
          expect(after.rushBank).toBe(0);
          expect(after.pocket - now.pocket).toBe(3_240 + 90 * 4);
        } finally {
          vi.useRealTimers();
        }
      });

      it("holds while the tab is hidden", async () => {
        vi.useFakeTimers();
        const setVisibility = (state: DocumentVisibilityState) => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            get: () => state,
          });
          document.dispatchEvent(new Event("visibilitychange"));
        };
        try {
          const { screen, vein, tick } = opened(2 * HOUR);
          await tick(1_000);
          closeWelcome(screen);
          await tick(10_000);
          setVisibility("hidden");
          // a desktop tab keeps ticking for a while, unseen
          await tick(40_000);
          setVisibility("visible");
          await tick(9_000);
          expect(vein.hidden).toBe(true);
          await tick(1_000);
          expect(vein.hidden).toBe(false);
          expect(screen.progress.getSnapshot().mountain.rushBank).toBe(3_240);
        } finally {
          setVisibility("visible");
          vi.useRealTimers();
        }
      });

      it("holds while a drawer covers the mine window", async () => {
        vi.useFakeTimers();
        try {
          const { screen, vein, tick } = opened(2 * HOUR);
          await tick(1_000);
          closeWelcome(screen);
          await tick(10_000);
          screen.root
            .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
            ?.click();
          await tick(30_000);
          screen.root
            .querySelector<HTMLButtonElement>(
              '.board-sheet[data-sheet="buys"] .board-sheet-back',
            )
            ?.click();
          await tick(9_000);
          expect(vein.hidden).toBe(true);
          await tick(1_000);
          expect(vein.hidden).toBe(false);
        } finally {
          vi.useRealTimers();
        }
      });

      it("lets the quick vein go when the held stones went another way", async () => {
        vi.useFakeTimers();
        try {
          const { screen, vein, tick } = opened(2 * HOUR);
          await tick(1_000);
          // another device's save landed the held stones
          screen.progress.applyMutation((mountain) => {
            return { ...mountain, rushBank: 0 };
          });
          // no rush to keep for him: the vein stops waiting behind the card
          await tick(20_000);
          expect(vein.hidden).toBe(false);
          vein.click();
          expect(screen.text(".vein-note")).not.toContain("Gold rush");
          expect(screen.progress.getSnapshot().mountain.rushUntil).toBe(0);
        } finally {
          vi.useRealTimers();
        }
      });

      it("does not come after less than an hour away, or twice", async () => {
        vi.useFakeTimers();
        try {
          const { screen, vein, tick } = opened(30 * 60_000);
          closeWelcome(screen);
          await tick(60_000);
          expect(vein.hidden).toBe(true);
        } finally {
          vi.useRealTimers();
        }
        vi.useFakeTimers();
        try {
          const { screen, vein, tick } = opened(2 * HOUR);
          await tick(1_000);
          closeWelcome(screen);
          await tick(20_000);
          expect(vein.hidden).toBe(false);
          // Missed: it glints out, and the next one is an ordinary wait.
          await tick(12_000);
          expect(vein.hidden).toBe(true);
          await tick(2 * 60_000);
          expect(vein.hidden).toBe(true);
          const missed = screen.progress.getSnapshot().mountain;
          expect(missed.rushUntil).toBe(0);
          // nothing held is lost: the stones landed when the glint went by
          expect(missed.rushBank).toBe(0);
        } finally {
          vi.useRealTimers();
        }
      });
    },
  );

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
        deviceStorage: {
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
    expect(screen.text(RELICS_GOAL)).toContain(
      "Six Legendary Relics of Fatherhood",
    );
    expect(screen.root.querySelector<HTMLElement>(RELICS_BAR)?.hidden).toBe(
      true,
    );
  });

  it("reveals the Lantern on the tap that uncovers it, then guides to the Shield", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(999_999)) });
    document.body.append(screen.root);
    expect(relicPage(screen.root, REVEAL_PAGE)).toBeNull();

    screen.dig.click();

    // The relics drawer opens itself on the reveal (#465).
    const reveal = relicPage(screen.root, REVEAL_PAGE);
    expect(reveal).not.toBeNull();
    expect(screen.text("#relic-reveal-title")).toBe(
      "You found the Lantern of Guidance",
    );
    expect(reveal?.querySelector(".relic-page-line")?.textContent).toBe(
      "The virtue of Guidance.",
    );
    expect(
      reveal
        ?.querySelector<HTMLImageElement>(".relic-page-art")
        ?.getAttribute("src"),
    ).toBe(RELIC_LIT.lantern);
    expect(document.activeElement).toBe(
      reveal?.querySelector(".relic-page-carry"),
    );

    reveal?.querySelector<HTMLButtonElement>(".relic-page-carry")?.click();
    expect(relicPage(screen.root, REVEAL_PAGE)).toBeNull();
    expect(
      screen.root.querySelector(RELICS_SHEET)?.classList.contains("is-open"),
    ).toBe(false);
    expect(screen.text(RELICS_GOAL)).toBe(
      "Next: Shield of Protection · Far below",
    );
    const bar = screen.root.querySelector<HTMLElement>(RELICS_BAR);
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
      `Next · ${String(after.text(RELICS_GOAL)).split(" · ")[1] ?? ""}`,
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
    expect(firstNotice(screen.progress.getSnapshot(), "quiet")).toBeUndefined();
  });

  it("fills the guide bar between relics", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(5_500_000)) });
    expect(
      screen.root.querySelector(RELICS_BAR)?.getAttribute("aria-valuenow"),
    ).toBe("50");
  });

  it("shows the welcome-back card before a relic found while away", () => {
    const storage = seeded(
      { ...minedMountain(999_000), helpers: 10 },
      Date.now() - 400_000,
    );
    const screen = mountScreen({ storage });
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(false);
    expect(relicPage(screen.root, REVEAL_PAGE)).toBeNull();

    screen.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
    expect(relicPage(screen.root, REVEAL_PAGE)).not.toBeNull();
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

    expect(shelfShown(screen.root)).toBe(false);
    // The tag is a label; the shelf opens from a socket note's key (#370).
    tag?.click();
    expect(shelfShown(screen.root)).toBe(false);
    openShelfFromSocket(screen.root, sockets[0]);
    // The relics drawer, on its shelf (#465).
    expect(shelfShown(screen.root)).toBe(true);
    expect(screen.text(`${RELICS_SHEET} .board-sheet-title`)).toBe(
      "Relics of Fatherhood",
    );
    expect(screen.text(`${RELICS_SHEET} .board-sheet-kick`)).toBe(
      "0 of 6 found",
    );
    const names = [
      ...screen.root.querySelectorAll(`${SHELF_ROWS} .board-row-name`),
    ].map((el) => el.textContent);
    expect(names).toEqual(RELICS.map((relic) => relic.name));
    expect(screen.text(`${SHELF_ROWS} .board-row-info`)).toBe(
      "A warm light waits in the dark below.",
    );
    expect(screen.root.textContent).not.toContain("???");
    expect(
      [
        ...screen.root.querySelectorAll<HTMLElement>(
          `${SHELF_ROWS} .board-row-why`,
        ),
      ].every((hint) => hint.hidden),
    ).toBe(true);

    screen.root
      .querySelector<HTMLButtonElement>(`${RELICS_SHEET} .board-sheet-back`)
      ?.click();
    expect(shelfShown(screen.root)).toBe(false);
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
    const rows = [...screen.root.querySelectorAll(SHELF_ROWS)];
    expect(rows).toHaveLength(6);
    expect(rows[0]?.querySelector(".board-row-name")?.textContent).toBe(
      "Lantern of Guidance",
    );
    expect(
      rows.every(
        (row) => row.querySelector<HTMLImageElement>(".board-row-icon")?.src,
      ),
    ).toBeTruthy();
    expect(rows[0]?.classList.contains("is-found")).toBe(true);
    expect(rows[2]?.classList.contains("is-locked")).toBe(true);
    expect(
      rows[0]
        ?.querySelector<HTMLImageElement>(".board-row-icon")
        ?.getAttribute("src"),
    ).toBe(RELIC_LIT.lantern);
    expect(
      rows[2]
        ?.querySelector<HTMLImageElement>(".board-row-icon")
        ?.getAttribute("src"),
    ).toBe(RELIC_DARK.hammer);
    expect(rows[1]?.getAttribute("aria-label")).toBe(
      "Shield of Protection: see your power",
    );
    expect(rows[2]?.querySelector(".board-row-name")?.textContent).toBe(
      "Hammer of the Builder",
    );
    expect(rows[2]?.querySelector(".board-row-info")?.textContent).toBe(
      "Somewhere down there lies the hammer that built great things.",
    );
    // 12M is 2M into the 15M stretch to the Hammer: still far below.
    expect(rows[2]?.querySelector(".board-row-why")?.textContent).toBe(
      "Next · Far below",
    );
    expect(rows[3]?.querySelector<HTMLElement>(".board-row-why")?.hidden).toBe(
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

  it("asks first, on the Ledger's own page, which defaults to keeping the mountain", () => {
    const storage = seededDad();
    const screen = mountScreen({ storage });
    document.body.append(screen.root);
    try {
      const sheet = screen.root.querySelector<HTMLElement>(LEDGER_SHEET);
      const pageHost = sheet?.querySelector<HTMLElement>(".board-sheet-page");
      const list = sheet?.querySelector<HTMLElement>(".board-sheet-list");
      const click = (selector: string): void => {
        screen.root.querySelector<HTMLButtonElement>(selector)?.click();
      };
      screen.openLedger();
      expect(pageHost?.hidden).toBe(true);

      click(".ledger-start-over");
      expect(pageHost?.hidden).toBe(false);
      expect(list?.hidden).toBe(true);
      expect(screen.text(".ledger-start-over-page .ledger-page-title")).toBe(
        "Start over?",
      );
      expect(
        screen.text(".ledger-start-over-page .ledger-page-line"),
      ).toContain("every relic you found");
      expect(document.activeElement).toBe(
        screen.root.querySelector(".ledger-keep"),
      );

      click(".ledger-keep");
      expect(pageHost?.hidden).toBe(true);
      expect(list?.hidden).toBe(false);
      expect(sheet?.classList.contains("is-open")).toBe(true);

      click(".ledger-start-over");
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(sheet?.classList.contains("is-open")).toBe(false);
      expect(document.activeElement).toBe(
        screen.root.querySelector(".board-key[data-key=ledger]"),
      );

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

    screen.startOver();

    expect(
      screen.root.querySelector(LEDGER_SHEET)?.classList.contains("is-open"),
    ).toBe(false);
    expect(screen.text(STONES_NAME)).toBe(
      `${formatCompact(stonesLeft(createMountain()))} stones left`,
    );
    expect(screen.pocket()).toBe("Stones 0");
    expect(screen.text(".crew-status")).toBe(
      "No crew yet. Hire a worker to mine for you.",
    );
    expect(screen.text(".board-tag")).toBe("Relics of Fatherhood · 0 of 6");
    expect(relicPage(screen.root, REVEAL_PAGE)).toBeNull();
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

describe("the Ledger key (#375)", () => {
  it("focuses the drawer's title, and Back returns focus to the key", () => {
    const screen = mountScreen();
    document.body.append(screen.root);
    try {
      const sheet = screen.root.querySelector<HTMLElement>(LEDGER_SHEET);
      const key = screen.root.querySelector<HTMLButtonElement>(
        ".board-rail > .board-key[data-key=ledger]",
      );
      expect(sheet?.classList.contains("is-open")).toBe(false);
      expect(screen.root.querySelector(".game-menu")).toBeNull();
      expect(key?.getAttribute("aria-expanded")).toBe("false");

      screen.openLedger();
      expect(sheet?.classList.contains("is-open")).toBe(true);
      expect(key?.getAttribute("aria-expanded")).toBe("true");
      expect(document.activeElement).toBe(
        sheet?.querySelector(".board-sheet-title"),
      );
      sheet?.querySelector<HTMLButtonElement>(".board-sheet-back")?.click();
      expect(sheet?.classList.contains("is-open")).toBe(false);
      expect(document.activeElement).toBe(key);
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

  it("copies the field log for a guest, and its plate reads Copied", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() =>
      Promise.resolve(),
    );
    const restore = clipboard({ writeText });
    const screen = mountScreen();
    document.body.append(screen.root);
    try {
      screen.progress.applyMutation((mountain) => ({
        ...mountain,
        pocket: tierCost(tierById("helper"), 0),
      }));
      screen.progress.dispatch({ kind: "buyTier", id: "helper" });
      screen.openLedger();
      const copy =
        screen.root.querySelector<HTMLButtonElement>(".ledger-field-log");
      expect(copy?.textContent).toBe("Copy field log");
      expect(copy?.disabled).toBe(false);
      copy?.click();
      await vi.waitFor(() => {
        expect(copy?.textContent).toBe("Copied");
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
      expect(screen.root.querySelector(".copied-float")).toBeNull();
    } finally {
      restore();
      screen.root.remove();
    }
  });

  it("shows a selectable log on its own page when the clipboard is missing or refuses", async () => {
    const restore = clipboard(undefined);
    const screen = mountScreen();
    document.body.append(screen.root);
    try {
      const sheet = screen.root.querySelector<HTMLElement>(LEDGER_SHEET);
      const page = (): HTMLElement | null | undefined =>
        sheet?.querySelector<HTMLElement>(
          ".board-sheet-page:not([hidden]) .ledger-field-log-page",
        );
      const openCopy = (): void => {
        screen.openLedger();
        screen.root
          .querySelector<HTMLButtonElement>(".ledger-field-log")
          ?.click();
      };
      openCopy();
      await vi.waitFor(() => {
        expect(page()).toBeTruthy();
      });
      const box = page()?.querySelector("textarea");
      expect(box?.readOnly).toBe(true);
      expect(box?.disabled).toBe(false);
      expect(box?.value).toContain(`"version": "${APP_VERSION}"`);
      expect(document.activeElement).toBe(box);
      sheet?.querySelector<HTMLButtonElement>(".board-sheet-back")?.click();
      expect(sheet?.classList.contains("is-open")).toBe(false);
      expect(page()).toBeFalsy();
      expect(document.activeElement).toBe(
        screen.root.querySelector(".board-key[data-key=ledger]"),
      );

      restore();
      const bare = clipboard({});
      try {
        openCopy();
        await vi.waitFor(() => {
          expect(page()).toBeTruthy();
        });
        sheet?.querySelector<HTMLButtonElement>(".board-sheet-back")?.click();
      } finally {
        bare();
      }

      const refuse = clipboard({
        writeText: () => Promise.reject(new Error("denied")),
      });
      try {
        openCopy();
        await vi.waitFor(() => {
          expect(page()).toBeTruthy();
        });
        document.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
        expect(sheet?.classList.contains("is-open")).toBe(false);
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
      expect(screen.text(ACCOUNT_INFO)).toContain("dad@example.com");
      screen.openLedger();
      screen.root
        .querySelector<HTMLButtonElement>(".ledger-field-log")
        ?.click();
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

  it("the crew line lives in the Buys drawer", () => {
    const screen = mountScreen({
      storage: seeded({ ...minedMountain(400), helpers: 3, carts: 1 }),
    });
    const drawer = screen.root.querySelector('.board-sheet[data-sheet="buys"]');
    const line = drawer?.querySelector(
      ".board-sheet-list > .crew .crew-status",
    );
    expect(line?.textContent).toMatch(/^Your crew mines \d+ stones a second$/);
    const crew = drawer?.querySelector<HTMLElement>(".crew");
    const legend = drawer?.querySelector('.board-sec[data-sec="crew"]');
    expect(legend?.firstElementChild?.textContent).toBe("Crew");
    expect(legend?.lastElementChild?.textContent).toBe("per sec");
    // The legend stands right above the crew section.
    expect(legend?.nextElementSibling).toBe(crew);
    // How it works covers the list, and Back brings it back.
    const list = drawer?.querySelector<HTMLElement>(".board-sheet-list");
    drawer?.querySelector<HTMLButtonElement>(".teach-info")?.click();
    expect(list?.hidden).toBe(true);
    [...(drawer?.querySelectorAll<HTMLButtonElement>(".teach-how-back") ?? [])]
      .find((back) => !back.hidden)
      ?.click();
    expect(list?.hidden).toBe(false);
  });

  it("the crew plate counts the crew and the free hands", () => {
    const screen = mountScreen({
      storage: seeded({ ...minedMountain(400), helpers: 18, carts: 6 }),
    });
    const plate = screen.root.querySelector(".board-gauge-row .board-crew");
    expect(plate?.getAttribute("aria-label")).toBe("Crew: 18 workers, 12 free");
    expect(screen.text(".board-crew .board-crew-free")).toBe("12 free");
    expect(screen.root.querySelector("#app > .crew")).toBeNull();
    expect(screen.root.querySelector(":scope > .crew")).toBeNull();
  });

  it("the crew plate follows a hire", () => {
    const price = tierCost(tierById("helper"), 2);
    const screen = mountScreen({
      storage: seeded({
        ...minedMountain(400),
        pocket: price,
        helpers: 2,
        carts: 1,
      }),
    });
    expect(screen.text(".board-crew-free")).toBe("1 free");
    screen.root
      .querySelector<HTMLButtonElement>('.tier[data-tier="helper"]')
      ?.click();
    expect(screen.text(".board-crew-free")).toBe("2 free");
    expect(
      screen.root.querySelector(".board-crew")?.getAttribute("aria-label"),
    ).toBe("Crew: 3 workers, 2 free");
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
      expect(screen.progress.getSnapshot().mountain.helpers).toBe(21);
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

  it("a buy the store refuses shows no Done and no spend (#409)", () => {
    const price = tierCost(tierById("helper"), 0);
    const screen = mountScreen({ storage: seeded(minedMountain(price)) });
    vi.spyOn(screen.progress, "dispatch").mockReturnValue({
      kind: "refused",
      reason: "not-playing",
    });
    const row = screen.root.querySelector<HTMLButtonElement>(
      '.tier[data-tier="helper"]',
    );
    row?.click();
    expect(row?.textContent).not.toContain("Done");
    expect(screen.text(".board-spend")).toBe("");
  });

  it("a dig kicks the output needle (#409)", () => {
    const frames = fakeFrames();
    setReducedMotion(false);
    try {
      const screen = mountScreen();
      const face = (): string | undefined =>
        screen.root.querySelector<HTMLElement>(".board-gauge-face")?.style
          .backgroundPosition;
      let at = 0;
      const frame = (): void => {
        at += 1000 / 60;
        frames.next(at);
      };
      for (let i = 0; i < 120; i += 1) frame();
      const rest = face();
      frame();
      expect(face()).toBe(rest);
      tap(screen.dig);
      frame();
      frame();
      frame();
      expect(face()).not.toBe(rest);
    } finally {
      setReducedMotion(true);
    }
  });

  it("starting over is not a spend", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(5_000)) });
    screen.startOver();
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
          boosts: { ...NO_BOOSTS, overtime: clock + 20 * 60_000 },
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

  it("a running boost's chip counts down each second on a save with no crew mining", () => {
    vi.useFakeTimers();
    try {
      const at = Date.now();
      const screen = mountScreen({
        storage: seeded(
          {
            ...minedMountain(0),
            helpers: 0,
            carts: 0,
            drills: 0,
            boosts: { ...NO_BOOSTS, overtime: at + 90_000 },
          },
          at,
        ),
        now: () => Date.now(),
      });
      const chip = screen.root.querySelector<HTMLElement>(
        '.effect-row .boost-chip[data-boost="overtime"]',
      );
      const time = (): string | null | undefined =>
        chip?.querySelector(".effect-time")?.textContent;
      expect(chip?.hidden).toBe(false);
      const before = time();
      expect(before).toMatch(/\d/);
      vi.advanceTimersByTime(1_000);
      expect(time()).not.toBe(before);
    } finally {
      vi.useRealTimers();
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
    expect(shelfShown(screen.root)).toBe(false);
    document.body.append(screen.root);
    try {
      const socket =
        screen.root.querySelectorAll<HTMLButtonElement>(".board-socket")[2];
      openShelfFromSocket(screen.root, socket);
      expect(shelfShown(screen.root)).toBe(true);
      screen.root
        .querySelector<HTMLButtonElement>(`${RELICS_SHEET} .board-sheet-back`)
        ?.click();
      expect(shelfShown(screen.root)).toBe(false);
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

  it("the band tag replaces the layer line", () => {
    const screen = mountScreen({
      storage: seeded(minedMountain(25_000_000)),
    });
    expect(screen.root.querySelector(".layer-line")).toBeNull();
    expect(screen.root.querySelector(".top-bar")).toBeNull();
    expect(screen.text(".board-band")).toBe("The Granite · Suits borers");
    // Under the gauge row, ahead of the key rail.
    expect(
      screen.root.querySelector(":scope > .board-gauge-row + .board-bays"),
    ).not.toBeNull();
    expect(
      screen.root.querySelector(":scope > .board-bays + .board-ready-row"),
    ).not.toBeNull();
  });

  const bayTiersOf = (screen: ReturnType<typeof mountScreen>) =>
    [...screen.root.querySelectorAll<HTMLElement>(".board-bay")].map(
      (bay) => bay.dataset["tier"],
    );

  it("the bays show cart, drill and borer, then the Great Machine's", () => {
    const early = mountScreen({
      storage: seeded({ ...minedMountain(400), helpers: 3, carts: 1 }),
    });
    expect(bayTiersOf(early)).toEqual(["cart", "drill", "borer"]);
    const heart = mountScreen({
      storage: seeded({
        ...minedMountain(125_000_000),
        helpers: 40,
        carts: 10,
        drills: 6,
        borers: 2,
      }),
    });
    expect(bayTiersOf(heart)).toEqual(["drill", "borer", "machine"]);
  });

  it("a tap on a bay opens Buys", () => {
    const screen = mountScreen({
      storage: seeded({ ...minedMountain(400), helpers: 3, carts: 1 }),
    });
    const dialog = screen.root.querySelector<HTMLElement>(
      '.board-sheet[data-sheet="buys"]',
    );
    expect(dialog?.classList.contains("is-open")).toBe(false);
    const held = screen.pocket();
    screen.root.querySelector<HTMLButtonElement>(".board-bay")?.click();
    expect(dialog?.classList.contains("is-open")).toBe(true);
    expect(screen.pocket()).toBe(held);
  });

  it("a troubled bay fixes as today", () => {
    const screen = mountScreen({
      storage: seeded({
        ...minedMountain(12_000_000),
        helpers: 20,
        carts: 6,
        borers: 1,
      }),
    });
    const dialog = screen.root.querySelector<HTMLElement>(
      '.board-sheet[data-sheet="buys"]',
    );
    const note = screen.root.querySelector<HTMLElement>(".board-note");
    const bay = () => {
      const found = screen.root.querySelector<HTMLButtonElement>(
        '.board-bay[data-tier="cart"]',
      );
      if (found === null) throw new Error("no cart bay");
      return found;
    };
    screen.progress.layoutPreview.trouble("cart");
    expect(bay().dataset["trouble"]).toBe("cave-in");
    expect(bay().querySelector(".board-bay-sub")?.textContent).toBe(
      "Cave-in! · Hold to fix",
    );
    for (let tap = 0; tap < 4; tap += 1) {
      bay().click();
    }
    expect(screen.progress.getSnapshot().trouble?.kind).toBe("cave-in");
    expect(screen.text(".board-note.on")).not.toBe(TROUBLE_FIXED);
    bay().click();
    expect(screen.progress.getSnapshot().trouble).toBeUndefined();
    expect(screen.progress.getSnapshot().mountain.carts).toBe(6);
    expect(dialog?.classList.contains("is-open")).toBe(false);
    expect(screen.text(".board-note.on")).toBe(TROUBLE_FIXED);
    expect(bay().hasAttribute("data-trouble")).toBe(false);

    // A hold fixes it too, and the click that ends the hold opens nothing.
    vi.useFakeTimers();
    try {
      screen.progress.layoutPreview.trouble("cart");
      note?.classList.remove("on");
      bay().dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      vi.advanceTimersByTime(FIX_HOLD_MS);
      expect(screen.progress.getSnapshot().trouble).toBeUndefined();
      expect(screen.text(".board-note.on")).toBe(TROUBLE_FIXED);
      bay().click();
      expect(dialog?.classList.contains("is-open")).toBe(false);
      expect(screen.progress.getSnapshot().mountain.carts).toBe(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it("trouble on a tier with no bay is fixed in Buys", () => {
    const screen = mountScreen({
      storage: seeded({
        ...minedMountain(125_000_000),
        helpers: 40,
        carts: 10,
        drills: 2,
        borers: 1,
        machines: 1,
      }),
    });
    screen.progress.layoutPreview.trouble("cart");
    expect(bayTiersOf(screen)).toEqual(["drill", "borer", "machine"]);
    expect(screen.root.querySelector(".board-bay[data-trouble]")).toBeNull();
    const card = screen.root.querySelector<HTMLButtonElement>(
      '.tier[data-tier="cart"]',
    );
    expect(card?.classList.contains("is-trouble")).toBe(true);
    for (let tap = 0; tap < 5; tap += 1) {
      card?.click();
    }
    expect(screen.progress.getSnapshot().trouble).toBeUndefined();
    expect(screen.progress.getSnapshot().mountain.carts).toBe(10);
  });

  const firstEngineer = (): Mountain => ({
    ...minedMountain(12_000_000),
    pocket: 2_000_000,
    helpers: 30,
    carts: 10,
    drills: 6,
    borers: 1,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
    seen: ["workshop"],
    taught: ["workshop"],
  });

  /** The New sign's words while it stands over a key, else undefined. */
  const signOf = (screen: ReturnType<typeof mountScreen>) =>
    screen.root.querySelector(".board-sign-slot:not([hidden])")?.textContent ??
    undefined;

  it("the New sign shows once over its key, and any tap puts it away", () => {
    vi.useFakeTimers();
    try {
      const screen = mountScreen({ storage: seeded(firstEngineer()) });
      // A tap is heard on the document.
      document.body.append(screen.root);
      expect(signOf(screen)).toBe(engineersNote("Ada"));
      expect(
        screen.root.querySelector(".board-sign-slot")?.getAttribute("data-key"),
      ).toBe("engineers");
      // A sign, not the board note, and not a button.
      expect(screen.root.querySelector(".board-note.on")).toBeNull();
      expect(screen.root.querySelector(".board-sign-slot button")).toBeNull();
      // Any tap puts it away, even on its own key; the dot stays, and a tick never brings it back.
      screen.dig.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      expect(signOf(screen)).toBeUndefined();
      vi.advanceTimersByTime(1_000);
      expect(signOf(screen)).toBeUndefined();
      expect(
        screen.root.querySelector(
          ".board-key[data-key=engineers] .board-key-dot:not([hidden])",
        ),
      ).not.toBeNull();
      screen.root.remove();
    } finally {
      vi.useRealTimers();
    }

    // Escape puts it away too.
    const quiet = mountScreen({ storage: seeded(firstEngineer()) });
    document.body.append(quiet.root);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(signOf(quiet)).toBeUndefined();
    quiet.root.remove();

    // Its key opens the drawer, and that counts as seen.
    const again = mountScreen({ storage: seeded(firstEngineer()) });
    again.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=engineers]")
      ?.click();
    expect(
      again.root
        .querySelector(".board-sheet[data-sheet=engineers]")
        ?.classList.contains("is-open"),
    ).toBe(true);
    expect(again.progress.getSnapshot().mountain.seen).toContain("engineers");
    expect(signOf(again)).toBeUndefined();
  });

  it("the New sign takes no tap: a tap on it opens nothing, and its words join the key's label", () => {
    const screen = mountScreen({ storage: seeded(firstEngineer()) });
    const key = screen.root.querySelector<HTMLButtonElement>(
      ".board-key[data-key=engineers]",
    );
    const label = key?.getAttribute("aria-label") ?? "";
    expect(label.endsWith(`. ${engineersNote("Ada")}`)).toBe(true);
    const plate = screen.root.querySelector<HTMLElement>(".board-ready");
    const plateWords = plate?.textContent;
    const plateLabel = plate?.getAttribute("aria-label");
    screen.root.querySelector<HTMLElement>(".board-sign")?.click();
    expect(
      screen.root
        .querySelector(".board-sheet[data-sheet=engineers]")
        ?.classList.contains("is-open"),
    ).toBe(false);
    expect(screen.progress.getSnapshot().mountain.seen).not.toContain(
      "engineers",
    );
    // The plate under the band reads the same with the sign up.
    expect(plate?.textContent).toBe(plateWords);
    expect(plate?.getAttribute("aria-label")).toBe(plateLabel);
    // Put away, the key's label is its own again.
    document.body.append(screen.root);
    screen.dig.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    expect(key?.getAttribute("aria-label")).toBe(
      label.slice(0, -`. ${engineersNote("Ada")}`.length),
    );
    screen.root.remove();
  });

  it("the update prompt puts the board note and the New sign away at once", () => {
    const screen = mountScreen({ storage: seeded(firstEngineer()) });
    document.body.append(screen.root);
    expect(signOf(screen)).toBe(engineersNote("Ada"));
    screen.dig.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    screen.root.querySelector<HTMLButtonElement>(".board-dial")?.click();
    expect(screen.root.querySelector(".board-note.on")).not.toBeNull();
    showAppUpdate(screen.root);
    expect(screen.root.querySelector(".board-note.on")).toBeNull();
    expect(signOf(screen)).toBeUndefined();
    screen.root.remove();
  });

  it("a card that opens by itself puts any board note and the New sign away; the sign comes back once", () => {
    vi.useFakeTimers();
    try {
      const screen = mountScreen({ storage: seeded(firstEngineer()) });
      expect(signOf(screen)).toBe(engineersNote("Ada"));
      // Into the Crystal Caves: the relic and layer cards open from render,
      // under the sign.
      screen.progress.applyMutation((m) => ({
        ...m,
        remaining: MOUNTAIN_STONES - 46_000_000,
      }));
      // The reveal opens the relics drawer itself (#465); the layer card waits for it.
      expect(relicPage(screen.root, REVEAL_PAGE)).not.toBeNull();
      expect(signOf(screen)).toBeUndefined();
      vi.advanceTimersByTime(1_000);
      expect(signOf(screen)).toBeUndefined();
      // Once the cards and the reveal are shut, the sign it never got to show comes back once.
      for (let i = 0; i < 20; i += 1) {
        const go =
          relicPage(screen.root, REVEAL_PAGE)?.querySelector<HTMLButtonElement>(
            ".relic-page-carry",
          ) ??
          screen.root.querySelector<HTMLButtonElement>(
            ".layer-arrival:not([hidden]) .layer-dig",
          );
        if (go === null) break;
        go.click();
        vi.advanceTimersByTime(0);
      }
      vi.advanceTimersByTime(1_000);
      expect(signOf(screen)).toBe(engineersNote("Ada"));

      // Any other note goes too: the Running now list under the save conflict.
      document.body.append(screen.root);
      screen.dig.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      screen.root.querySelector<HTMLButtonElement>(".board-dial")?.click();
      expect(
        screen.root.querySelector(".board-note.on .board-running"),
      ).not.toBeNull();
      screen.progress.layoutPreview.conflict();
      expect(
        screen.root.querySelector<HTMLElement>(".save-conflict")?.hidden,
      ).toBe(false);
      expect(screen.root.querySelector(".board-note.on")).toBeNull();
      screen.root.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the New sign waits while a sheet is open, then shows on the next tick", () => {
    vi.useFakeTimers();
    try {
      const screen = mountScreen({
        storage: seeded({ ...firstEngineer(), engineers: [], borers: 0 }),
      });
      screen.root
        .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
        ?.click();
      // The first borer brings the first engineer while Buys is open.
      screen.progress.applyMutation((m) => ({
        ...m,
        borers: 1,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
      }));
      vi.advanceTimersByTime(1_000);
      expect(signOf(screen)).toBeUndefined();
      screen.root
        .querySelector<HTMLButtonElement>(
          '.board-sheet[data-sheet="buys"] .board-sheet-back',
        )
        ?.click();
      vi.advanceTimersByTime(1_000);
      expect(signOf(screen)).toBe(engineersNote("Ada"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("until the save is in, the bays are disabled with no flap digits", async () => {
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
    const bays = [
      ...screen.root.querySelectorAll<HTMLButtonElement>(".board-bay"),
    ];
    expect(bays).toHaveLength(3);
    expect(bays.every((bay) => bay.disabled)).toBe(true);
    const digits = () =>
      [
        ...screen.root.querySelectorAll(
          '.board-bay[data-tier="cart"] .board-flap-d',
        ),
      ]
        .map((d) => d.textContent)
        .join("");
    expect(digits()).toBe("");
    expect(screen.text(".board-band")).toBe("");
    finishLoad({
      kind: "found",
      mountain: { ...minedMountain(400), helpers: 3, carts: 6 },
    });
    await Promise.resolve();
    expect(bays.every((bay) => !bay.disabled)).toBe(true);
    expect(digits()).toBe("6");
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
        screen.root.querySelector<HTMLButtonElement>(
          ".board-key[data-key=workshop]",
        )?.disabled,
      ).toBe(false);
      const doors = [
        ".board-key[data-key=buys]",
        ".board-key[data-key=workshop]",
        ".board-key[data-key=upgrades]",
        ".board-key[data-key=engineers]",
        ".board-key[data-key=ledger]",
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
      expect(shelfShown(screen.root)).toBe(true);
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
      upgrades: { ...NO_UPGRADES, tap: 1 },
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

  it("the gauge reads 0 once the mountain is mined out", async () => {
    vi.useFakeTimers();
    try {
      let clock = 5_000_000;
      const m: Mountain = {
        ...minedMountain(MOUNTAIN_STONES),
        helpers: 3,
        carts: 1,
      };
      const screen = mountScreen({
        storage: seeded(m, clock),
        now: () => clock,
      });
      const gauge = screen.root.querySelector(".board-gauge-row .board-gauge");
      expect(stonesPerSecond(m, clock)).toBeGreaterThan(0);
      expect(gauge?.getAttribute("aria-label")).toBe(
        "Output: 0 stones a second",
      );
      clock += 1_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(gauge?.getAttribute("aria-label")).toBe(
        "Output: 0 stones a second",
      );
    } finally {
      vi.useRealTimers();
    }
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
      // Announced once: by the board note's status, not again by the words inside it.
      const words = screen.root.querySelector(".vein-note");
      const live: string[] = [];
      for (let at = words; at !== null; at = at.parentElement) {
        if (
          at.hasAttribute("aria-live") ||
          at.getAttribute("role") === "status"
        ) {
          live.push(at.classList[0] ?? "");
        }
      }
      expect(live).toEqual(["board-note"]);
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
    screen.startOver();
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
    screen.startOver();
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
    screen.openLedger();
    screen.root.querySelector<HTMLButtonElement>(".ledger-pass")?.click();
    screen.root.querySelector<HTMLButtonElement>(".legacy-confirm")?.click();
    expect(screen.progress.getSnapshot().mountain.legacy).toBe(1);
    expect(beats).not.toHaveBeenCalled();
  });

  // ---------- the Ready row (#372) ----------

  const CLOCK = 5_000_000;
  /** play's early save: a crewed Topsoil, 18 workers and 6 carts. */
  const early = (over: Partial<Mountain> = {}): Mountain => ({
    ...minedMountain(500_000),
    pocket: 6_854,
    helpers: 18,
    carts: 6,
    ...over,
  });
  const readyAt = (mountain: Mountain) =>
    mountScreen({ storage: seeded(mountain, CLOCK), now: () => CLOCK });
  const plateOf = (screen: ReturnType<typeof mountScreen>) => {
    const button = screen.root.querySelector(".board-ready");
    if (!(button instanceof HTMLButtonElement)) throw new Error("no plate");
    return button;
  };
  const digButtonOf = (screen: ReturnType<typeof mountScreen>) => {
    const button = screen.root.querySelector(".board-dig-button");
    if (!(button instanceof HTMLButtonElement)) throw new Error("no button");
    return button;
  };
  const cartsOf = (screen: ReturnType<typeof mountScreen>) =>
    screen.progress.getSnapshot().mountain.carts;
  const pocketOf = (screen: ReturnType<typeof mountScreen>) =>
    screen.progress.getSnapshot().mountain.pocket;
  const buysOpen = (screen: ReturnType<typeof mountScreen>) =>
    screen.root
      .querySelector('.board-sheet[data-sheet="buys"]')
      ?.classList.contains("is-open") === true;
  const pressed = (button: HTMLElement): void => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 }));
  };

  it("the Ready row stands under the bays, ahead of the key rail", () => {
    const screen = readyAt(early());
    expect(
      screen.root.querySelector(
        ":scope > .board-bays + .board-ready-row + .board-rail",
      ),
    ).not.toBeNull();
    expect(
      screen.root.querySelector(
        ":scope > .board-ready-row > .board-ready + .board-dig > .board-dig-button",
      ),
    ).not.toBeNull();
  });

  it("Ready now buys exactly one on a double tap", () => {
    vi.useFakeTimers();
    try {
      const m = early();
      const screen = readyAt(m);
      const plate = plateOf(screen);
      const price = tierCost(tierById("cart"), 6);
      const gain = effectiveRates(m, CLOCK).tierSpeed.cart;
      expect(plate.disabled).toBe(false);
      expect(screen.text(".board-ready-kick")).toBe("Ready now");
      expect(screen.text(".board-ready-main")).toBe(
        `Buy a cart · ${formatCompact(price)}`,
      );
      plate.click();
      plate.click();
      expect(cartsOf(screen)).toBe(7);
      expect(pocketOf(screen)).toBe(m.pocket - price);
      expect(screen.text(".board-ready-main")).toBe(
        `Done · +${formatSpeed(gain)}/s`,
      );
      expect(screen.text(".board-ready-why")).toBe("Cart 7 is rolling");
      expect(screen.text(".board-spend")).toBe(
        `−${price.toLocaleString("en-US")}`,
      );
      vi.advanceTimersByTime(1_800);
      plate.click();
      expect(cartsOf(screen)).toBe(7);
      vi.advanceTimersByTime(100);
      const second = tierCost(tierById("cart"), 7);
      expect(screen.text(".board-ready-main")).toBe(
        `Buy a cart · ${formatCompact(second)}`,
      );
      plate.click();
      expect(cartsOf(screen)).toBe(8);
      expect(pocketOf(screen)).toBe(m.pocket - price - second);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a held Enter buys one", () => {
    vi.useFakeTimers();
    try {
      const screen = readyAt(early());
      const plate = plateOf(screen);
      pressed(plate);
      vi.advanceTimersByTime(500);
      pressed(plate);
      vi.advanceTimersByTime(500);
      pressed(plate);
      expect(cartsOf(screen)).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Saving for shows the time and opens Buys", () => {
    const m = early({ pocket: 100 });
    const screen = readyAt(m);
    const price = tierCost(tierById("cart"), 6);
    const etaMs = ((price - 100) / stonesPerSecond(m, CLOCK)) * 1000;
    expect(screen.text(".board-ready-kick")).toBe("Saving for");
    expect(screen.text(".board-ready-main")).toBe(
      `Saving for a cart · in ${etaShort(etaMs)}`,
    );
    expect(buysOpen(screen)).toBe(false);
    plateOf(screen).click();
    expect(buysOpen(screen)).toBe(true);
    expect(pocketOf(screen)).toBe(100);
    expect(cartsOf(screen)).toBe(6);
  });

  it("a drawer opened from Saving for gives focus back to the plate's button", () => {
    const screen = readyAt(early({ pocket: 100 }));
    document.body.append(screen.root);
    try {
      plateOf(screen).click();
      expect(buysOpen(screen)).toBe(true);
      screen.root
        .querySelector<HTMLButtonElement>(
          '.board-sheet[data-sheet="buys"] .board-sheet-back',
        )
        ?.click();
      expect(buysOpen(screen)).toBe(false);
      expect(document.activeElement).toBe(plateOf(screen));
    } finally {
      screen.root.remove();
    }
  });

  it("Saving for a worker when no hand is free", () => {
    const price = tierCost(tierById("helper"), 6);
    const screen = readyAt(early({ helpers: 6, pocket: price - 1 }));
    expect(screen.text(".board-ready-main")).toMatch(
      /^Saving for a worker · in \d+m$/,
    );
    plateOf(screen).click();
    expect(buysOpen(screen)).toBe(true);
    expect(screen.progress.getSnapshot().mountain.helpers).toBe(6);
  });

  it("a new mountain saves with no time", () => {
    const screen = mountScreen();
    expect(screen.text(".board-ready-main")).toBe("Saving for a worker");
    expect(screen.text(".board-ready-why")).toBe("20 · +1/s");
  });

  it("Ready now never buys by itself", () => {
    vi.useFakeTimers();
    try {
      const screen = readyAt(early());
      expect(screen.text(".board-ready-kick")).toBe("Ready now");
      vi.advanceTimersByTime(10_000);
      expect(cartsOf(screen)).toBe(6);
      expect(pocketOf(screen)).toBe(6_854);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a tap after a spend elsewhere buys nothing and opens Buys again", () => {
    vi.useFakeTimers();
    try {
      const screen = readyAt(early());
      screen.root
        .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
        ?.click();
      const card = screen.root.querySelector<HTMLButtonElement>(
        '.tier[data-tier="cart"]',
      );
      for (let i = 0; i < 20; i += 1) {
        const m = screen.progress.getSnapshot().mountain;
        if (m.pocket < tierCost(tierById("cart"), m.carts)) break;
        card?.click();
        // Each buy holds Done on its row; the next tap waits it out.
        vi.advanceTimersByTime(2_000);
      }
      const carts = cartsOf(screen);
      const pocket = pocketOf(screen);
      expect(carts).toBeGreaterThan(6);
      expect(pocket).toBeLessThan(tierCost(tierById("cart"), carts));
      screen.root
        .querySelector<HTMLButtonElement>(
          '.board-sheet[data-sheet="buys"] .board-sheet-back',
        )
        ?.click();
      expect(buysOpen(screen)).toBe(false);
      plateOf(screen).click();
      expect(cartsOf(screen)).toBe(carts);
      expect(pocketOf(screen)).toBe(pocket);
      expect(buysOpen(screen)).toBe(true);
      expect(screen.text(".board-ready-kick")).toBe("Saving for");
    } finally {
      vi.useRealTimers();
    }
  });

  // A sleepy double tap: the first tap opens Buys over the plate or the bay,
  // and the second lands on the Buys card under the finger. It must not buy.
  // A finger's click has a detail of 1; a key press clicks with 0 (#373).
  const fingerClick = (el: HTMLElement): void => {
    el.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    );
  };
  const fingerTap = (el: HTMLElement): void => {
    el.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    el.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, button: 0 }),
    );
    fingerClick(el);
  };
  const cardOf = (screen: ReturnType<typeof mountScreen>, tier: string) => {
    const card = screen.root.querySelector(`.tier[data-tier="${tier}"]`);
    if (!(card instanceof HTMLButtonElement)) throw new Error("no card");
    return card;
  };

  it("a double tap on Saving for opens Buys and spends nothing", () => {
    // Saving for a cart with a hand free, while a worker is affordable: the
    // worker card is what the second tap of a double tap meets.
    const workerPrice = tierCost(tierById("helper"), 18);
    const m = early({ pocket: workerPrice });
    expect(workerPrice).toBeLessThan(tierCost(tierById("cart"), 6));
    let clock = 10_000;
    const screen = mountScreen({
      storage: seeded(m, CLOCK),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    expect(screen.text(".board-ready-kick")).toBe("Saving for");
    fingerTap(plateOf(screen));
    expect(buysOpen(screen)).toBe(true);
    clock += 120;
    fingerTap(cardOf(screen, "helper"));
    expect(pocketOf(screen)).toBe(workerPrice);
    expect(screen.progress.getSnapshot().mountain.helpers).toBe(18);
    // A deliberate tap once the sheet has settled still hires.
    clock += BUYS_SETTLE_MS;
    fingerTap(cardOf(screen, "helper"));
    expect(screen.progress.getSnapshot().mountain.helpers).toBe(19);
    expect(pocketOf(screen)).toBe(0);
  });

  it("a double tap on a bay opens Buys and spends nothing", () => {
    let clock = 10_000;
    const screen = mountScreen({
      storage: seeded(early(), CLOCK),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    const bay = screen.root.querySelector<HTMLButtonElement>(
      '.board-bay[data-tier="cart"]',
    );
    if (bay === null) throw new Error("no bay");
    fingerTap(bay);
    expect(buysOpen(screen)).toBe(true);
    clock += BUYS_SETTLE_MS - 1;
    fingerTap(cardOf(screen, "cart"));
    expect(cartsOf(screen)).toBe(6);
    expect(pocketOf(screen)).toBe(6_854);
    clock += 1;
    fingerTap(cardOf(screen, "cart"));
    expect(cartsOf(screen)).toBe(7);
    expect(pocketOf(screen)).toBe(6_854 - tierCost(tierById("cart"), 6));
    // The row holds Done, in the drawer the bay opened.
    expect(
      cardOf(screen, "cart").closest('.board-sheet[data-sheet="buys"]'),
    ).not.toBeNull();
    expect(
      cardOf(screen, "cart").querySelector(".board-row-verb")?.textContent,
    ).toBe("Done");
  });

  it("a finger's click on a row that slid under it while Buys settled buys nothing (#373)", () => {
    // The second tap of a double tap on a bay comes down on one row while the drawer still
    // rises; a touch's click lands where the finger lifts, on the row now under it.
    let clock = 10_000;
    const screen = mountScreen({
      storage: seeded(early(), CLOCK),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    const bay = screen.root.querySelector<HTMLButtonElement>(
      '.board-bay[data-tier="cart"]',
    );
    if (bay === null) throw new Error("no bay");
    fingerTap(bay);
    clock += 270;
    cardOf(screen, "helper").dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    fingerClick(cardOf(screen, "cart"));
    expect(cartsOf(screen)).toBe(6);
    expect(screen.progress.getSnapshot().mountain.helpers).toBe(18);
    expect(pocketOf(screen)).toBe(6_854);
    // A key press is never early, settle or not.
    cardOf(screen, "cart").click();
    expect(cartsOf(screen)).toBe(7);
  });

  it("the settle is judged by the press, not the click", () => {
    let clock = 10_000;
    const screen = mountScreen({
      storage: seeded(early(), CLOCK),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
      ?.click();
    const card = cardOf(screen, "cart");
    // Pressed early, released late: still the double tap's press.
    card.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    clock += BUYS_SETTLE_MS * 2;
    card.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, button: 0 }),
    );
    fingerClick(card);
    expect(cartsOf(screen)).toBe(6);
    // The next press is its own, and buys. Reopening an open sheet (the
    // Buys key tapped again) does not restart the settle.
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
      ?.click();
    fingerTap(card);
    expect(cartsOf(screen)).toBe(7);
    // Back to the mountain works at once.
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
      ?.click();
    screen.root
      .querySelector<HTMLButtonElement>(
        '.board-sheet[data-sheet="buys"] .board-sheet-back',
      )
      ?.click();
    expect(buysOpen(screen)).toBe(false);
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
      ?.click();
    fingerTap(card);
    expect(cartsOf(screen)).toBe(7);
  });

  it("the tap re-reads the store, never the painted plate", () => {
    const screen = readyAt(early());
    expect(screen.text(".board-ready-kick")).toBe("Ready now");
    // The pocket falls under the plate's feet with no render (a cloud copy
    // landing mid-frame): the tap must not buy what it can no longer afford.
    const real = screen.progress.getSnapshot.bind(screen.progress);
    vi.spyOn(screen.progress, "getSnapshot").mockImplementation(() => {
      const snap = real();
      return { ...snap, mountain: { ...snap.mountain, pocket: 100 } };
    });
    plateOf(screen).click();
    vi.restoreAllMocks();
    expect(cartsOf(screen)).toBe(6);
    expect(buysOpen(screen)).toBe(true);
  });

  it("the bay lamp follows the pick", () => {
    const screen = readyAt(early());
    const lamp = screen.root.querySelector<HTMLElement>(
      '.board-bay[data-tier="cart"] .board-lamp',
    );
    // lamp.png's frames: off, amber, green, red, 40 CSS px each.
    expect(lamp?.style.backgroundPositionX).toBe("-40px");
  });

  it("mined out: the plate and the red button say so and are disabled", () => {
    const screen = readyAt(minedMountain(MOUNTAIN_STONES));
    expect(plateOf(screen).disabled).toBe(true);
    expect(screen.text(".board-ready-main")).toBe("The mountain is mined out");
    const button = digButtonOf(screen);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("The mountain is mined out");
    expect(screen.text(".board-dig-lg")).toBe("");
    const held = pocketOf(screen);
    pressed(button);
    expect(pocketOf(screen)).toBe(held);
  });

  it("while the save loads, the plate and the red button are disabled and show nothing of it", async () => {
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
    const plate = plateOf(screen);
    const button = digButtonOf(screen);
    expect(plate.disabled).toBe(true);
    expect(button.disabled).toBe(true);
    expect(screen.text(".board-ready-kick")).toBe("");
    expect(screen.text(".board-ready-main")).toBe("");
    expect(screen.text(".board-dig-lg")).toBe("");
    plate.click();
    pressed(button);
    expect(screen.pocket()).toBe("Stones 0");
    expect(buysOpen(screen)).toBe(false);
    finishLoad({ kind: "found", mountain: early() });
    await Promise.resolve();
    expect(plate.disabled).toBe(false);
    expect(button.disabled).toBe(false);
    expect(screen.text(".board-ready-kick")).toBe("Ready now");
  });

  it("a save that loads again takes the window, the bays, the plate and the red button back to loading", async () => {
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
    const auth = createMemoryAuth();
    const screen = mountScreen({
      auth,
      cloudSave,
      storage: seeded(early({ drills: 1, kids: 1, legacy: 1 }), CLOCK),
      now: () => CLOCK,
    });
    const plate = plateOf(screen);
    const button = digButtonOf(screen);
    const shown = (selector: string): boolean => {
      for (
        let node = screen.root.querySelector<HTMLElement>(selector);
        node !== null && node !== screen.root;
        node = node.parentElement
      ) {
        if (node.hidden) return false;
      }
      return true;
    };
    const bays = () => [
      ...screen.root.querySelectorAll<HTMLButtonElement>(".board-bay"),
    ];
    const digits = () =>
      [...screen.root.querySelectorAll(".board-bay .board-flap-d")]
        .map((d) => d.textContent)
        .join("");
    // Playing on the phone: everything is up, and a dig runs its tally.
    tap(button);
    expect(screen.text(".board-dig-lg")).toMatch(/^By hand · \+/);
    expect(plate.disabled).toBe(false);
    expect(shown(".board-window-art")).toBe(true);
    expect(shown(".board-window-drill")).toBe(true);
    expect(digits()).not.toBe("");

    await auth.signIn();
    await Promise.resolve();
    expect(screen.progress.getSnapshot().ready).toBe(false);
    // The red button.
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-label")).toBe("Loading your save...");
    expect(screen.text(".board-dig-lg")).toBe("");
    // The plate.
    expect(plate.disabled).toBe(true);
    expect(screen.text(".board-ready-kick")).toBe("");
    expect(screen.text(".board-ready-main")).toBe("");
    // The bays.
    expect(bays().every((bay) => bay.disabled)).toBe(true);
    expect(digits()).toBe("");
    expect(screen.text(".board-band")).toBe("");
    // The window: its frame and glass, nothing of the phone's save.
    for (const part of [
      ".board-window-art",
      ".board-window-run",
      ".board-window-drill",
      ".board-window-kid",
      ".board-legacy",
      ".board-dig-plus",
    ]) {
      expect({ part, shown: shown(part) }).toEqual({ part, shown: false });
    }
    expect(shown(".board-window-frame")).toBe(true);
    const held = pocketOf(screen);
    tap(button);
    tap(screen.dig);
    expect(pocketOf(screen)).toBe(held);
    expect(screen.text(".board-dig-lg")).toBe("");

    // The account's save comes in, ahead of the phone's: a first render of it.
    finishLoad({
      kind: "found",
      mountain: { ...minedMountain(600_000), pocket: 0, legacy: 1 },
    });
    await Promise.resolve();
    expect(button.disabled).toBe(false);
    expect(screen.text(".board-dig-lg")).toBe("Dig · +1");
    expect(plate.disabled).toBe(false);
    expect(screen.text(".board-ready-main")).toBe("Saving for a worker");
    expect(shown(".board-window-art")).toBe(true);
    expect(shown(".board-window-drill")).toBe(false);
    expect(shown(".board-window-kid")).toBe(false);
    expect(bays().every((bay) => !bay.disabled)).toBe(true);
  });

  it("the red button digs exactly tap power", () => {
    vi.useFakeTimers();
    try {
      const m: Mountain = {
        ...minedMountain(30_000),
        helpers: 500,
        carts: 3,
        upgrades: { ...NO_UPGRADES, tap: 1 },
      };
      const screen = readyAt(m);
      const tapYield = effectiveRates(m, CLOCK).tapYield;
      expect(tapYield).toBeGreaterThan(1);
      const button = digButtonOf(screen);
      expect(button.getAttribute("aria-label")).toBe(
        `Dig: tap to mine ${tapWords(tapYield)}`,
      );
      expect(screen.text(".board-dig-lg")).toBe(
        `Dig · +${formatCompact(tapYield)}`,
      );
      const before = pocketOf(screen);
      tap(button);
      tap(button);
      tap(button);
      expect(pocketOf(screen)).toBe(before + 3 * tapYield);
      expect(screen.text(".board-dig-lg")).toBe(
        `By hand · +${formatCompact(3 * tapYield)}`,
      );
      expect(plus(screen)?.hidden).toBe(false);
      expect(plus(screen)?.textContent).toBe(`+${formatCount(tapYield)}`);
      vi.advanceTimersByTime(1_500);
      expect(screen.text(".board-dig-lg")).toBe(
        `Dig · +${formatCompact(tapYield)}`,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("a window tap counts by hand and presses the button", () => {
    vi.useFakeTimers();
    try {
      setReducedMotion(false);
      const m: Mountain = {
        ...minedMountain(30_000),
        upgrades: { ...NO_UPGRADES, tap: 1 },
      };
      const screen = readyAt(m);
      const tapYield = effectiveRates(m, CLOCK).tapYield;
      const sprite =
        screen.root.querySelector<HTMLElement>(".board-dig-sprite");
      expect(sprite?.style.backgroundPositionX).toBe("0px");
      tap(screen.dig);
      expect(screen.text(".board-dig-lg")).toBe(
        `By hand · +${formatCompact(tapYield)}`,
      );
      // The echo: down, then up after 80ms, then rest after 60ms more.
      expect(sprite?.style.backgroundPositionX).toBe("-112px");
      vi.advanceTimersByTime(80);
      expect(sprite?.style.backgroundPositionX).toBe("-224px");
      vi.advanceTimersByTime(60);
      expect(sprite?.style.backgroundPositionX).toBe("0px");
    } finally {
      vi.useRealTimers();
    }
  });

  it("under reduced motion a window tap still counts by hand, with no echo", () => {
    const m: Mountain = {
      ...minedMountain(30_000),
      upgrades: { ...NO_UPGRADES, tap: 1 },
    };
    const screen = readyAt(m);
    const tapYield = effectiveRates(m, CLOCK).tapYield;
    tap(screen.dig);
    expect(screen.text(".board-dig-lg")).toBe(
      `By hand · +${formatCompact(tapYield)}`,
    );
    expect(
      screen.root.querySelector<HTMLElement>(".board-dig-sprite")?.style
        .backgroundPositionX,
    ).toBe("0px");
  });
});
