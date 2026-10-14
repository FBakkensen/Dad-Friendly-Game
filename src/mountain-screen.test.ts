import { send } from "./expeditions";
import { RELICS } from "./relics";
import { readSessionSave, writeSessionSave } from "./session-save";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMemoryAuth,
  createUnconfiguredAuth,
  type AuthController,
} from "./auth";
import {
  createMemoryCloudSave,
  type CloudLoadResult,
  type CloudSave,
} from "./cloud-save";
import { APP_VERSION } from "./field-log";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import { mountMountainScreen } from "./mountain-screen";
import { createProgressStore } from "./progress-store";
import { SESSION_SAVE_KEY } from "./session-save";
import { FIX_HOLD_MS } from "./hazards";
import {
  ENGINEER_WELCOME,
  NEEDS_MORE_WORKERS,
  troubleAria,
} from "./screen-words";
import { minedMountain, unstaffedSave } from "./test-fixtures";
import { buyTier, tierById } from "./tiers";

function setReducedMotion(reduce: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes("reduce"),
  })) as unknown as typeof window.matchMedia;
}

// Animations are opted into per test; most tests want instant numbers.
beforeEach(() => {
  setReducedMotion(true);
});

const tileUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function createMemoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => [...data.keys()][index] ?? null,
    removeItem: (key: string) => {
      data.delete(key);
    },
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

const signedIn = (): AuthController => {
  const user = { uid: "test-dad", label: "Test Dad" };
  return createMemoryAuth({ state: { kind: "signed-in", user }, user });
};

function mountScreen({
  auth = createUnconfiguredAuth(),
  cloudSave,
  storage = createMemoryStorage(),
  now,
  random,
  veinStorage = storage,
}: {
  auth?: AuthController;
  cloudSave?: CloudSave;
  storage?: Storage;
  veinStorage?: Pick<Storage, "getItem" | "setItem">;
  now?: () => number;
  random?: () => number;
} = {}) {
  const root = document.createElement("div");
  const progress = createProgressStore({
    auth,
    sessionStorage: storage,
    cloudWriteGapMs: 0,
    ...(cloudSave === undefined ? {} : { cloudSave }),
  });
  mountMountainScreen({
    root,
    veinStorage,
    lanternUrl: tileUrl,
    mountainUrl: tileUrl,
    stoneUrl: tileUrl,
    veinUrl: tileUrl,
    upgradesUrl: tileUrl,
    tierArt: {
      helper: "helper.png",
      cart: "cart.png",
      drill: "drill.png",
      borer: "borer.png",
      machine: "machine.png",
      kid: "kid.png",
    },
    relicArt: {
      lantern: "lantern.png",
      shield: "shield.png",
      hammer: "hammer.png",
      heart: "heart.png",
      crown: "crown.png",
      mantle: "mantle.png",
    },
    auth,
    progress,
    ...(now === undefined ? {} : { now }),
    ...(random === undefined ? {} : { random }),
  });
  const find = <T extends Element>(selector: string, type: new () => T): T => {
    const el = root.querySelector(selector);
    if (!(el instanceof type)) {
      throw new Error(`${selector} did not render`);
    }
    return el;
  };
  return {
    root,
    progress,
    mountain: find(".mountain", HTMLButtonElement),
    authButton: find(".auth-action", HTMLButtonElement),
    text: (selector: string) => root.querySelector(selector)?.textContent,
  };
}

describe("mountMountainScreen", () => {
  it("shows a hundred million stones and mines one per tap", () => {
    const screen = mountScreen();

    expect(screen.text(".stones-left")).toBe("240 million stones left");
    expect(screen.text(".pocket")).toBe("0 stones");
    expect(screen.text(".goal")).toContain("Legendary Relics of Fatherhood");
    expect(screen.text(".save-status")).toBe("Sign in to save");

    screen.mountain.click();
    expect(
      screen.root.querySelector(".stones-left")?.getAttribute("title"),
    ).toBe("239,999,999 of 240,000,000");
    expect(screen.text(".pocket")).toBe("1 stone");
    expect(screen.text(".save-status")).toBe("Saved on this device");

    screen.mountain.click();
    expect(screen.text(".pocket")).toBe("2 stones");
    expect(
      screen.root.querySelector(".stones-left")?.getAttribute("title"),
    ).toBe("239,999,998 of 240,000,000");
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

    const screen = mountScreen({ storage });
    expect(screen.text(".pocket")).toBe("3 stones");
    expect(
      screen.root.querySelector(".stones-left")?.getAttribute("title"),
    ).toBe("239,999,997 of 240,000,000");
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
    expect(screen.text(".pocket")).toBe("12.3 thousand stones");
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
    expect(borer.querySelector(".tier-name")?.textContent).toBe("Borer");
    // The first borer's engineer tends them: 595 becomes 714, shown floored.
    expect(borer.querySelector(".tier-rate")?.textContent).toBe(
      "+691\u2009·\u20091,382/s",
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
      "Hammer · 25M",
    );
    expect(machine.getAttribute("aria-label")).toContain(
      "Needs the Hammer of the Builder",
    );
    machine.click();
    expect(
      screen.root
        .querySelector('.tier[data-tier="machine"] .tier-count')
        ?.hasAttribute("hidden"),
    ).toBe(true);
  });

  it("sells the Great Machine once the Hammer is found", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(25_000_000),
        pocket: 68_000_000,
        drills: 1,
        borers: 1,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const machine = tierCard(screen.root, "machine");
    expect(machine.classList.contains("tier-locked")).toBe(false);
    expect(machine.disabled).toBe(false);
    expect(machine.querySelector(".tier-cost")?.textContent).toBe("67M");
    machine.click();
    expect(machine.querySelector(".tier-count")?.textContent).toBe("×1");
    expect(screen.text(".pocket")).toBe("1 million stones");
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
      expect(screen.text('[data-tier="helper"] .tier-cost')).toBe("25");
      expect(hire.disabled).toBe(true);
      expect(cart.hidden).toBe(false);
      expect(hire.getAttribute("aria-label")).toBe(
        "Buy a worker for 25 stones, mines 1 stone a second. You have 1.",
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
        "Your crew mines 11 stones a second",
      );
      expect(
        screen.root.querySelector(".tier-grid")?.getAttribute("data-shown"),
      ).toBe("3");

      await vi.advanceTimersByTimeAsync(2_000);
      expect(screen.text(".pocket")).toBe("22 stones");
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
      "You were gone 2 hours 5 minutes. Your 4 workers mined the whole time, at a resting pace (30% of their speed).",
    );

    close.click();
    expect(card.hidden).toBe(true);
    expect(screen.text(".pocket")).toBe("9,000 stones");
  });

  it("says when the 8-hour cap was reached", () => {
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
    expect(screen.text(".welcome-mined")).toBe("+8,640 stones");
    expect(screen.text(".welcome-detail")).toBe(
      "You were gone 1 day 2 hours. Your worker mined for the first 8 hours, at a resting pace (30% of their speed).",
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
    expect(screen.text(".stones-left")).toBe("240 million stones left");
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
      version: 5,
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

describe("what the crew gives", () => {
  const seededCrew = () => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({
        version: 5,
        mountain: {
          ...minedMountain(2_500),
          helpers: 4,
          carts: 3,
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

  it("shows each tier's output per unit and its current total", () => {
    const screen = mountScreen({ storage: seededCrew() });
    expect(screen.text('[data-tier="helper"] .tier-rate')).toBe(
      "+1 each · 4/s",
    );
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe(
      "+10 each · 30/s",
    );
    const big = mountScreen({
      storage: (() => {
        const storage = createMemoryStorage();
        writeSessionSave({
          storage,
          mountain: { ...minedMountain(0), helpers: 150, carts: 150 },
          lastSeen: Date.now(),
        });
        return storage;
      })(),
    });
    expect(big.text('[data-tier="cart"] .tier-rate')).toBe("+10 · 1,500/s");
  });

  it("floats +10/s from a bought cart and counts the crew line up", async () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      const screen = mountScreen({ storage: seededCrew() });
      const cart =
        screen.root.querySelector<HTMLButtonElement>('[data-tier="cart"]');
      cart?.click();
      expect(cart?.querySelector(".float-gain")?.textContent).toBe("+10/s");
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 34 stones a second",
      );
      await vi.advanceTimersByTimeAsync(240);
      const midway = screen.text(".crew-status");
      expect(midway).not.toBe("Your crew mines 34 stones a second");
      expect(midway).not.toBe("Your crew mines 44 stones a second");
      await vi.advanceTimersByTimeAsync(400);
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 44 stones a second",
      );
      expect(screen.text('[data-tier="cart"] .tier-rate')).toBe(
        "+10 each · 40/s",
      );
      await vi.advanceTimersByTimeAsync(1_200);
      expect(cart?.querySelector(".float-gain")).toBeNull();
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });

  it("floats the crew's stones over the mountain every second", async () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      const screen = mountScreen({ storage: seededCrew() });
      await vi.advanceTimersByTimeAsync(1_000);
      const floats = screen.root.querySelectorAll(
        ".mountain-stage .crew-float",
      );
      expect(floats).toHaveLength(1);
      expect(floats[0]?.textContent).toBe("+34 crew");
      expect(floats[0]?.getAttribute("aria-hidden")).toBe("true");
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });

  it("shows a tap's own yield where it landed, apart from the crew's", () => {
    setReducedMotion(false);
    const screen = mountScreen({ storage: seededCrew() });
    screen.mountain.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    const tap = screen.root.querySelector<HTMLElement>(
      ".mountain-stage .tap-float",
    );
    expect(tap?.textContent).toBe("+1");
    expect(tap?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.root.querySelector(".crew-float")).toBeNull();
    setReducedMotion(true);
  });

  it("skips floats and counting with reduced motion", async () => {
    vi.useFakeTimers();
    setReducedMotion(true);
    try {
      const screen = mountScreen({ storage: seededCrew() });
      const cart =
        screen.root.querySelector<HTMLButtonElement>('[data-tier="cart"]');
      cart?.click();
      expect(cart?.querySelector(".float-gain")).toBeNull();
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 44 stones a second",
      );
      await vi.advanceTimersByTimeAsync(1_000);
      expect(screen.root.querySelector(".crew-float")).toBeNull();
      screen.mountain.click();
      expect(screen.root.querySelector(".tap-float")).toBeNull();
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });
});

describe("upgrades on screen", () => {
  const seededWith = (mountain: Mountain) => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain, lastSeen: Date.now() });
    return storage;
  };

  it("opens the sheet from beside the pocket, buys Strong arms, and taps harder", () => {
    setReducedMotion(false);
    const screen = mountScreen({
      storage: seededWith({
        ...minedMountain(30_000),
        helpers: 500,
        pocket: 250_000,
      }),
    });
    document.body.append(screen.root);
    const button = screen.root.querySelector<HTMLButtonElement>(
      ".pocket-row .upgrades-button",
    );
    const sheet = screen.root.querySelector<HTMLElement>(".upgrades-dialog");
    expect(button?.classList.contains("upgrades-ready")).toBe(true);
    expect(button?.getAttribute("aria-label")).toBe(
      "Upgrades, one is affordable",
    );
    expect(sheet?.hidden).toBe(true);

    button?.click();
    expect(sheet?.hidden).toBe(false);
    expect(document.activeElement).toBe(
      screen.root.querySelector(".upgrades-close"),
    );
    expect(screen.text('[data-upgrade="tap"] .upgrade-name')).toBe(
      "Strong arms · level 0 of 10",
    );
    expect(screen.text('[data-upgrade="tap"] .upgrade-now')).toBe(
      "Each tap now mines 1.",
    );
    const buy = screen.root.querySelector<HTMLButtonElement>(
      '[data-upgrade="tap"] .upgrade-buy',
    );
    expect(buy?.textContent).toBe("Buy for 40 thousand stones");
    buy?.click();
    expect(screen.text('[data-upgrade="tap"] .upgrade-name')).toBe(
      "Strong arms · level 1 of 10",
    );
    expect(screen.text('[data-upgrade="tap"] .upgrade-now')).toBe(
      "Each tap now mines 6.",
    );
    expect(buy?.textContent).toBe("Buy for 200 thousand stones");
    expect(buy?.disabled).toBe(false);

    screen.root.querySelector<HTMLButtonElement>(".upgrades-close")?.click();
    expect(sheet?.hidden).toBe(true);
    expect(document.activeElement).toBe(button);

    screen.mountain.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    expect(screen.root.querySelector(".tap-float")?.textContent).toBe("+6");
    expect(screen.mountain.getAttribute("aria-label")).toBe(
      "Mountain, tap to mine 6 stones",
    );
    screen.root.remove();
    setReducedMotion(true);
  });

  it("dims the button and the buy line when nothing is affordable", () => {
    const screen = mountScreen({ storage: seededWith(minedMountain(10)) });
    expect(
      screen.root
        .querySelector(".upgrades-button")
        ?.classList.contains("upgrades-ready"),
    ).toBe(false);
    screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
    expect(
      screen.root.querySelector<HTMLButtonElement>(".upgrade-buy")?.disabled,
    ).toBe(true);
    screen.root
      .querySelector(".upgrades-dialog")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(
      screen.root.querySelector<HTMLElement>(".upgrades-dialog")?.hidden,
    ).toBe(true);
  });
});

describe("quick boosts on screen", () => {
  it("buys Sharper picks from the sheet: taps double, a chip counts down, and it ends", async () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      let clock = 1_000_000;
      const storage = createMemoryStorage();
      writeSessionSave({
        storage,
        mountain: { ...minedMountain(40_000), helpers: 500 },
        lastSeen: clock,
      });
      const screen = mountScreen({ storage, now: () => clock });
      const chip = screen.root.querySelector<HTMLElement>(
        '.mountain-wrap .boost-chip[data-boost="sharper"]',
      );
      expect(chip?.hidden).toBe(true);
      screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
      const buy = screen.root.querySelector<HTMLButtonElement>(
        '[data-boost="sharper"] .upgrade-buy',
      );
      expect(screen.text('[data-boost="sharper"] .upgrade-name')).toBe(
        "Sharper picks",
      );
      // 120 taps, or a minute of this 500-worker crew, whichever is more.
      expect(buy?.textContent).toBe("Buy for 30 thousand stones");
      buy?.click();
      expect(buy?.disabled).toBe(true);
      expect(buy?.textContent).toBe("Running · 10:00 left");
      expect(chip?.hidden).toBe(false);
      expect(chip?.textContent).toBe("Sharper picks ×2 · 10:00");
      screen.root.querySelector<HTMLButtonElement>(".upgrades-close")?.click();

      screen.mountain.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
      expect(screen.root.querySelector(".tap-float")?.textContent).toBe("+2");

      clock += 4 * 60_000 + 30_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(chip?.textContent).toBe("Sharper picks ×2 · 5:30");

      clock += 6 * 60_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(chip?.hidden).toBe(true);
      expect(screen.mountain.getAttribute("aria-label")).toBe(
        "Mountain, tap to mine one stone",
      );
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });

  it("shows a doubled crew line under Overtime, and keeps it across a reload", () => {
    const clock = 5_000_000;
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(0),
        helpers: 3,
        boosts: { overtime: clock + 20 * 60_000 },
      },
      lastSeen: clock,
    });
    const screen = mountScreen({ storage, now: () => clock });
    expect(screen.text(".crew-status")).toBe(
      "Your crew mines 6 stones a second",
    );
    expect(screen.text('.boost-chip[data-boost="overtime"]')).toBe(
      "Overtime ×2 · 20:00",
    );
  });
});

describe("lasting upgrades on screen", () => {
  it("shows locked upgrades with their unlock, and boosted helper cards once bought", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(30_000), pocket: 100_000, helpers: 9 },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
    const boots = screen.root.querySelector<HTMLButtonElement>(
      '[data-upgrade="boots"] .upgrade-buy',
    );
    expect(screen.text('[data-upgrade="boots"] .upgrade-name')).toBe(
      "Better boots",
    );
    expect(boots?.textContent).toBe("Unlocks at 10 workers");
    expect(boots?.disabled).toBe(true);
    expect(screen.text('[data-upgrade="steady"] .upgrade-buy')).toBe(
      "Unlocks with your first mine cart",
    );

    screen.root
      .querySelector<HTMLButtonElement>('[data-tier="helper"]')
      ?.click();
    expect(boots?.textContent).toBe("Buy for 90 thousand stones");
    expect(screen.text('[data-upgrade="boots"] .upgrade-now')).toBe(
      "Each worker now mines 1/s.",
    );
    boots?.click();
    expect(boots?.textContent).toBe("Owned");
    expect(boots?.disabled).toBe(true);
    expect(screen.text('[data-upgrade="boots"] .upgrade-now')).toBe(
      "Each worker now mines 1.1/s.",
    );
    expect(screen.text('[data-tier="helper"] .tier-rate')).toBe(
      "+1.1 each · 11/s",
    );
    expect(screen.text(".crew-status")).toBe(
      "Your crew mines 11 stones a second",
    );
  });

  it("says the higher resting pace on the welcome-back card with Steady hands", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(0), helpers: 4, upgrades: { steady: 1 } },
      lastSeen: Date.now() - (2 * 60 + 5) * 60_000,
    });
    const screen = mountScreen({ storage });
    expect(screen.text(".welcome-mined")).toBe("+11.2 thousand stones");
    expect(screen.text(".welcome-detail")).toBe(
      "You were gone 2 hours 5 minutes. Your 4 workers mined the whole time, at a resting pace (37.5% of their speed).",
    );
  });

  it("lists found tools as Found and hides the ones still below (#148)", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(0), finds: ["pick", "boots"] },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    document.body.append(screen.root);
    screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
    const visible = [
      ...screen.root.querySelectorAll<HTMLElement>(".found-tool"),
    ].filter((row) => !row.hidden);
    expect(visible.map((row) => row.dataset["tool"])).toEqual([
      "pick",
      "boots",
    ]);
    expect(screen.text('[data-tool="pick"] .upgrade-name')).toBe(
      "Grandfather's pick",
    );
    expect(screen.text('[data-tool="pick"] .upgrade-effect')).toBe(
      "Your taps bite a little deeper.",
    );
    expect(screen.text('[data-tool="pick"] .upgrade-now')).toBe("Found");
    expect(
      screen.root.querySelector<HTMLElement>('[data-tool="lamp"]')?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>('[data-tool="map"]')?.hidden,
    ).toBe(true);
    expect(screen.text(".found-heading")).toBe("Brought home");
    expect(visible.map((row) => row.textContent).join(" ")).not.toMatch(
      /[0-9?]/,
    );

    const bare = mountScreen({
      storage: (() => {
        const empty = createMemoryStorage();
        writeSessionSave({
          storage: empty,
          mountain: minedMountain(0),
          lastSeen: Date.now(),
        });
        return empty;
      })(),
    });
    bare.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
    expect(bare.root.querySelector<HTMLElement>(".found-heading")?.hidden).toBe(
      true,
    );
    expect(bare.root.querySelector<HTMLElement>(".found-list")?.hidden).toBe(
      true,
    );
    expect(
      [...bare.root.querySelectorAll<HTMLElement>(".found-tool")].every(
        (row) => row.hidden,
      ),
    ).toBe(true);
    screen.root.remove();
  });
});

describe("crew synergies on screen", () => {
  it("previews the bonus, then shows it in the cart card's rate line once bought", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(1_000_000),
        pocket: 2_000_000,
        helpers: 12,
        carts: 5,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
    expect(screen.text('[data-upgrade="cartSyn"] .upgrade-name')).toBe(
      "Helping hands",
    );
    expect(screen.text('[data-upgrade="cartSyn"] .upgrade-now')).toBe(
      "Your 12 workers would make carts 12% faster.",
    );
    expect(screen.text('[data-upgrade="drillSyn"] .upgrade-buy')).toBe(
      "Unlocks at 5 steam drills",
    );
    screen.root
      .querySelector<HTMLButtonElement>('[data-upgrade="cartSyn"] .upgrade-buy')
      ?.click();
    expect(screen.text('[data-upgrade="cartSyn"] .upgrade-now')).toBe(
      "Your 12 workers make carts 12% faster.",
    );
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe(
      "+11 \u219112% · 56/s",
    );
    expect(
      screen.root
        .querySelector('[data-tier="cart"]')
        ?.getAttribute("aria-label"),
    ).toContain("12% faster from crew synergy");
  });
});

describe("crew synergy copy before the tier exists", () => {
  it("skips the preview line with none of the tier below, and names the Great Machine", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(0), helpers: 3 },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    expect(screen.text('[data-upgrade="machineSyn"] .upgrade-now')).toBe("");
    expect(screen.text('[data-upgrade="machineSyn"] .upgrade-buy')).toBe(
      "Unlocks with the Great Machine",
    );
  });
});

describe("crew staffing on screen", () => {
  it("shows idle machines on their cards and how many helpers the crew line needs", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(0),
        pocket: 1_000,
        helpers: 5,
        carts: 3,
        drills: 2,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    // 5 workers: one drill (3), then two carts; one cart and one drill idle.
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe("1 idle");
    expect(
      screen.root
        .querySelector('[data-tier="cart"]')
        ?.classList.contains("tier-idle"),
    ).toBe(true);
    expect(
      screen.root
        .querySelector('[data-tier="cart"]')
        ?.getAttribute("aria-label"),
    ).toContain("1 idle: each needs 1 worker to run");
    expect(
      screen.root
        .querySelector('[data-tier="cart"]')
        ?.getAttribute("aria-label"),
    ).toContain(NEEDS_MORE_WORKERS);
    expect(screen.text('[data-tier="drill"] .tier-rate')).toBe("1 idle");
    expect(screen.text(".crew-status")).toBe("85/s · 2 idle, need 4 workers");

    // Hiring one worker finishes the drills; the carts wait.
    screen.root
      .querySelector<HTMLButtonElement>('[data-tier="helper"]')
      ?.click();
    expect(screen.text(".crew-status")).toBe("126/s · 3 idle, need 3 workers");
  });

  it("says a machine would need more workers before you buy it, with no new numbers", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(0),
        pocket: 20_000_000,
        helpers: 9,
        carts: 1,
        drills: 1,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const borer = screen.root.querySelector('[data-tier="borer"]');
    expect(screen.text('[data-tier="borer"] .tier-rate')).toBe(
      "+595/s · needs workers",
    );
    expect(borer?.getAttribute("aria-label")).toContain(NEEDS_MORE_WORKERS);
    expect(screen.text('[data-tier="drill"] .tier-rate')).toBe(
      "+60\u2009·\u200960/s",
    );
  });

  it("floats the staffing line when a new machine has nobody to run it", () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      const storage = createMemoryStorage();
      writeSessionSave({
        storage,
        mountain: { ...minedMountain(0), pocket: 1_000, helpers: 1, carts: 1 },
        lastSeen: Date.now(),
      });
      const screen = mountScreen({ storage });
      const cart =
        screen.root.querySelector<HTMLButtonElement>('[data-tier="cart"]');
      cart?.click();
      expect(cart?.querySelector(".float-gain")?.textContent).toBe(
        "+10/s · needs workers",
      );
      expect(screen.text(".crew-status")).toBe("11/s · 1 idle, need 1 worker");
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });
});

describe("free helpers note (#89 grant)", () => {
  const oldSave = (fields: Partial<Mountain>): Mountain => {
    return unstaffedSave({
      ...minedMountain(0),
      ...fields,
    });
  };

  it("greets an older save with how many helpers joined, once", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: oldSave({ helpers: 4, carts: 6, drills: 2 }),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(false);
    expect(screen.text("#welcome-back-title")).toBe("Your crew grew");
    expect(screen.text(".welcome-crew")).toBe(
      "8 workers joined to run your machines.",
    );
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-mined")?.hidden,
    ).toBe(true);
    screen.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(true);
    expect(screen.text('[data-tier="helper"] .tier-count')).toBe("×12");
  });

  it("tops up a first-grant save and reuses the crew-grew card", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(0),
        helpers: 10,
        carts: 6,
        drills: 2,
        staffed: true,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    expect(screen.text("#welcome-back-title")).toBe("Your crew grew");
    expect(screen.text(".welcome-crew")).toBe(
      "2 workers joined to run your machines.",
    );
    expect(screen.text('[data-tier="helper"] .tier-count')).toBe("×12");
  });

  it("leaves a save that already has the new grant alone", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(0),
        helpers: 10,
        carts: 6,
        drills: 2,
        staffed: 2,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(true);
    expect(screen.text('[data-tier="helper"] .tier-count')).toBe("×10");
  });
});

describe("first engineer note (#144)", () => {
  it("greets an older save that already owns a borer, once", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(0), borers: 1, helpers: 8 },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(false);
    expect(screen.text("#welcome-back-title")).toBe(ENGINEER_WELCOME);
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-engineer")?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-mined")?.hidden,
    ).toBe(true);
    screen.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(true);
    expect(screen.text('[data-tier="borer"] .tier-rate')).toBe(
      "+691\u2009·\u2009691/s",
    );
  });

  it("adds the line under the crew-grew card when both happen", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: unstaffedSave({
        ...minedMountain(0),
        helpers: 0,
        borers: 1,
      }),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    expect(screen.text("#welcome-back-title")).toBe("Your crew grew");
    expect(screen.text(".welcome-crew")).toBe(
      "8 workers joined to run your machines.",
    );
    expect(screen.text(".welcome-engineer")).toBe(ENGINEER_WELCOME);
  });

  it("steps an engineer up when the first borer is bought, with no card", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(0),
        pocket: 10_000_000,
        helpers: 11,
        drills: 1,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    screen.root
      .querySelector<HTMLButtonElement>('[data-tier="borer"]')
      ?.click();
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(true);
    expect(screen.text('[data-tier="borer"] .tier-count')).toBe("×1");
    expect(screen.text('[data-tier="borer"] .tier-rate')).toBe(
      "+691\u2009·\u2009691/s",
    );
    expect(screen.text('[data-tier="helper"] .tier-count')).toBe("×11");
  });
});

describe("free helpers note with time away (#89 grant)", () => {
  it("adds the note under the away report when both happen", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: unstaffedSave({
        ...minedMountain(0),
        helpers: 0,
        carts: 1,
      }),
      lastSeen: Date.now() - 2 * 3_600_000,
    });
    const screen = mountScreen({ storage });
    expect(screen.text("#welcome-back-title")).toBe("While you were away");
    expect(screen.text(".welcome-crew")).toBe(
      "Your crew grew: 1 worker joined to run your machines.",
    );
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-mined")?.hidden,
    ).toBe(false);
  });
});

describe("Shield of Protection on the welcome card", () => {
  it("says the crew mined for a whole day", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(10_000_000), pocket: 0, helpers: 1 },
      lastSeen: Date.now() - 30 * 3_600_000,
    });
    const screen = mountScreen({ storage });
    expect(screen.text(".welcome-mined")).toBe("+25.9 thousand stones");
    expect(screen.text(".welcome-detail")).toBe(
      "You were gone 1 day 6 hours. Your worker mined for a whole day, at a resting pace (30% of their speed).",
    );
  });
});

describe("Heart of Patience on the welcome card", () => {
  it("names the bonus", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(45_000_000), pocket: 0, helpers: 1 },
      lastSeen: Date.now() - 6 * 3_600_000,
    });
    const screen = mountScreen({ storage });
    expect(screen.text(".welcome-detail")).toContain(
      "The Heart of Patience made it ×1.25.",
    );
  });
});

describe("crew line at a big crew", () => {
  it("goes compact past 1,000 a second so it fits one line", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(30_000_000),
        pocket: 0,
        helpers: 98,
        borers: 6,
        machines: 2,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    expect(screen.text(".crew-status")).toMatch(
      /^Your crew mines [\d,.]+K? stones\/s$/,
    );
  });
});

describe("Mantle of the Hero finale (#103)", () => {
  const seeded = (mountain: Mountain) => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({ version: 5, mountain, lastSeen: Date.now() }),
    );
    return storage;
  };

  it("opens the Legend card after the Mantle's reveal, once, and closes with one tap", () => {
    const screen = mountScreen({
      storage: seeded({ ...minedMountain(MOUNTAIN_STONES - 1), helpers: 40 }),
    });
    document.body.append(screen.root);
    const legend = screen.root.querySelector<HTMLElement>(".legend");
    expect(legend?.hidden).toBe(true);

    screen.mountain.click();
    expect(screen.text("#relic-reveal-title")).toBe(
      "You found the Mantle of the Hero",
    );
    expect(legend?.hidden).toBe(true);
    screen.root.querySelector<HTMLButtonElement>(".reveal-continue")?.click();

    expect(legend?.hidden).toBe(false);
    expect(screen.text("#legend-title")).toBe("You became a Legend");
    expect(screen.text(".legend-stats")).toBe(
      "240 million stones moved. Six relics found. A crew of 40 beside you.",
    );
    expect(legend?.querySelectorAll(".legend-shelf img")).toHaveLength(6);
    expect(document.activeElement).toBe(
      legend?.querySelector(".reveal-continue"),
    );
    legend?.querySelector<HTMLButtonElement>(".reveal-continue")?.click();
    expect(legend?.hidden).toBe(true);
    screen.root.remove();
  });

  it("does not open for other relics", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(999_999)) });
    screen.mountain.click();
    screen.root.querySelector<HTMLButtonElement>(".reveal-continue")?.click();
    expect(screen.root.querySelector<HTMLElement>(".legend")?.hidden).toBe(
      true,
    );
  });
});

describe("relic powers on the cards (shelf detail)", () => {
  const seeded = (mountain: Mountain) => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({ version: 5, mountain, lastSeen: Date.now() }),
    );
    return storage;
  };

  it("says 'Your power' on the relic-found card", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(9_999_999)) });
    screen.mountain.click();
    expect(screen.text(".relic-reveal .relic-boost")).toBe(
      "Your power: Your crew keeps mining up to 24 hours while you're away.",
    );
  });

  it("opens a found relic from the shelf with its art, virtue and power; hidden ones stay shut", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(26_000_000)) });
    document.body.append(screen.root);
    screen.root.querySelector<HTMLButtonElement>(".relic-shelf")?.click();
    const rows = [
      ...screen.root.querySelectorAll<HTMLElement>(".shelf-list li"),
    ];
    const detail = screen.root.querySelector<HTMLElement>(".relic-detail");
    expect(rows[2]?.getAttribute("role")).toBe("button");
    expect(rows[3]?.hasAttribute("role")).toBe(false);

    rows[3]?.click();
    expect(detail?.hidden).toBe(true);

    rows[2]?.click();
    expect(detail?.hidden).toBe(false);
    expect(screen.text("#relic-detail-title")).toBe("Hammer of the Builder");
    expect(screen.text(".relic-detail .reveal-virtue")).toBe(
      "The virtue of Building.",
    );
    expect(screen.text(".relic-detail .relic-boost")).toBe(
      "Your power: Unlocks the Great Machine.",
    );
    expect(detail?.querySelector<HTMLElement>(".keepsakes")?.hidden).toBe(true);
    expect(
      detail
        ?.querySelector<HTMLImageElement>(".reveal-art")
        ?.getAttribute("src"),
    ).toBe("hammer.png");
    expect(document.activeElement).toBe(
      detail?.querySelector(".reveal-continue"),
    );
    detail?.querySelector<HTMLButtonElement>(".reveal-continue")?.click();
    expect(detail?.hidden).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>(".shelf-dialog")?.hidden,
    ).toBe(false);

    rows[0]?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(screen.text("#relic-detail-title")).toBe("Lantern of Guidance");
    screen.root.remove();
  });

  it("shows found keepsakes on the detail, with one story each (#148)", () => {
    const screen = mountScreen({
      storage: seeded({
        ...minedMountain(26_000_000),
        finds: ["drawing", "whistle", "pick"],
      }),
    });
    document.body.append(screen.root);
    screen.root.querySelector<HTMLButtonElement>(".relic-shelf")?.click();
    screen.root
      .querySelectorAll(".shelf-list li")[2]
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const detail = screen.root.querySelector<HTMLElement>(".relic-detail");
    expect(detail?.querySelector<HTMLElement>(".keepsakes")?.hidden).toBe(
      false,
    );
    expect(screen.text(".keepsakes-title")).toBe("Keepsakes");
    const shown = [
      ...screen.root.querySelectorAll<HTMLElement>("[data-keepsake]"),
    ].filter((row) => !row.hidden);
    expect(shown.map((row) => row.dataset["keepsake"])).toEqual([
      "drawing",
      "whistle",
    ]);
    expect(screen.text('[data-keepsake="drawing"] .keepsake-name')).toBe(
      "A child's drawing",
    );
    expect(screen.text('[data-keepsake="drawing"] .keepsake-story')).toBe(
      "A little figure with a lamp, folded for a pocket.",
    );
    expect(shown[0]?.querySelector("img")?.getAttribute("src")).toBe(tileUrl);
    expect(
      screen.root.querySelector<HTMLElement>('[data-keepsake="watch"]')?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>('[data-keepsake="pebble"]')
        ?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>('[data-keepsake="ribbon"]')
        ?.hidden,
    ).toBe(true);
    expect(shown.map((row) => row.textContent).join(" ")).not.toMatch(/[0-9?]/);
    screen.root.remove();
  });

  it("never names a depth in any power line", () => {
    for (const relic of RELICS) {
      expect(relic.boost).not.toMatch(/million|stones? deep|\d{3},\d{3}/);
    }
  });
});

describe("pass the mine to your kid (#131)", () => {
  const seeded = (mountain: Mountain) => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({ version: 5, mountain, lastSeen: Date.now() }),
    );
    return storage;
  };
  const dialog = (screen: ReturnType<typeof mountScreen>) =>
    screen.root.querySelector<HTMLElement>(".legacy-dialog");
  const menuPass = (screen: ReturnType<typeof mountScreen>) =>
    screen.root.querySelector<HTMLButtonElement>(".menu-pass");

  it("is offered on the Legend card, asks first, and hands down a Legacy", () => {
    const storage = seeded({
      ...minedMountain(MOUNTAIN_STONES - 1),
      helpers: 40,
    });
    const screen = mountScreen({ storage });
    document.body.append(screen.root);
    expect(
      screen.root.querySelector<HTMLElement>(".legacy-badge")?.hidden,
    ).toBe(true);
    screen.mountain.click();
    screen.root.querySelector<HTMLButtonElement>(".reveal-continue")?.click();
    const legend = screen.root.querySelector<HTMLElement>(".legend");
    legend?.querySelector<HTMLButtonElement>(".legend-pass")?.click();

    expect(legend?.hidden).toBe(true);
    expect(dialog(screen)?.hidden).toBe(false);
    expect(screen.text("#legacy-title")).toBe("Pass the mine to your kid?");
    expect(screen.text(".legacy-detail")).toContain("×1.5");
    expect(document.activeElement).toBe(
      dialog(screen)?.querySelector(".legacy-cancel"),
    );

    dialog(screen)
      ?.querySelector<HTMLButtonElement>(".legacy-confirm")
      ?.click();

    expect(dialog(screen)?.hidden).toBe(true);
    expect(screen.text(".stones-left")).toBe("240 million stones left");
    expect(screen.text(".pocket")).toBe("0 stones");
    const badge = screen.root.querySelector<HTMLElement>(".legacy-badge");
    expect(badge?.hidden).toBe(false);
    expect(badge?.textContent).toBe("Legacy ×1.5");
    expect(badge?.getAttribute("aria-label")).toBe(
      "Legacy 1: your crew and taps are ×1.5",
    );
    expect(screen.text(".goal")).toContain("Your kid's mine");
    expect(readSessionSave({ storage })?.mountain.legacy).toBe(1);
    screen.root.remove();
  });

  it("waits in the menu at the bottom; 'Not yet' changes nothing", () => {
    const screen = mountScreen({
      storage: seeded(minedMountain(MOUNTAIN_STONES)),
    });
    expect(menuPass(screen)?.hidden).toBe(false);
    menuPass(screen)?.click();
    expect(dialog(screen)?.hidden).toBe(false);
    dialog(screen)?.querySelector<HTMLButtonElement>(".legacy-cancel")?.click();
    expect(dialog(screen)?.hidden).toBe(true);
    expect(screen.text(".stones-left")).toBe("0 stones left");
    menuPass(screen)?.click();
    dialog(screen)?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(dialog(screen)?.hidden).toBe(true);
  });

  it("is never offered before the bottom", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(99_000_000)) });
    expect(menuPass(screen)?.hidden).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>(".legacy-badge")?.hidden,
    ).toBe(true);
  });
});

describe("player-facing workers (#139)", () => {
  /** Text the player can read, including screen-reader labels. */
  const mentionsHelper = (root: ParentNode): string[] => {
    const hits: string[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node !== null) {
      const text = node.textContent ?? "";
      if (/helper/i.test(text)) {
        hits.push(text.trim());
      }
      node = walker.nextNode();
    }
    for (const el of root.querySelectorAll("[aria-label], [title]")) {
      for (const name of ["aria-label", "title"]) {
        const value = el.getAttribute(name) ?? "";
        if (/helper/i.test(value)) {
          hits.push(value);
        }
      }
    }
    return hits;
  };

  it("never says helper on the mountain, the sheets, the welcome card, or the finale", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        // One stone short of the Crown. 23.5h of Shield away pay (under the
        // 24h cap) reaches the 240M bottom, so the welcome card, the Crown,
        // and the Legend finale all render.
        ...minedMountain(69_999_999),
        pocket: 80_000_000,
        helpers: 30,
        carts: 5,
        borers: 1,
        machines: 1,
        kids: 1,
        upgrades: { boots: 1, steady: 1, cartSyn: 1, tap: 2 },
      },
      lastSeen: Date.now() - 23.5 * 3_600_000,
    });
    const screen = mountScreen({ storage });
    document.body.append(screen.root);
    try {
      expect(
        screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
      ).toBe(false);
      expect(screen.text(".welcome-detail")).toMatch(/mined the whole time/);
      expect(screen.text(".crew-status")).toMatch(/need \d+ workers/);
      expect(screen.text('[data-tier="helper"] .tier-name')).toBe("Worker");
      expect(screen.text('[data-tier="kid"] .tier-name')).toBe("Kid");

      screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
      expect(
        screen.root.querySelector<HTMLElement>(".upgrades-dialog")?.hidden,
      ).toBe(false);
      expect(screen.text('[data-upgrade="boots"] .upgrade-effect')).toBe(
        "Workers mine 10% faster.",
      );
      expect(screen.text('[data-upgrade="cartSyn"] .upgrade-name')).toBe(
        "Helping hands",
      );
      expect(screen.text('[data-upgrade="cartSyn"] .upgrade-now')).toMatch(
        /workers make carts/,
      );
      screen.root.querySelector<HTMLButtonElement>(".upgrades-close")?.click();

      screen.root.querySelector<HTMLButtonElement>(".menu-button")?.click();
      expect(screen.root.querySelector<HTMLElement>(".game-menu")?.hidden).toBe(
        false,
      );
      screen.root.querySelector<HTMLButtonElement>(".menu-close")?.click();

      screen.root.querySelector<HTMLButtonElement>(".relic-shelf")?.click();
      const crown = [...screen.root.querySelectorAll(".shelf-list li")][4];
      if (!(crown instanceof HTMLElement)) {
        throw new Error("crown row did not render");
      }
      crown.click();
      expect(
        screen.root.querySelector<HTMLElement>(".relic-detail")?.hidden,
      ).toBe(false);
      expect(screen.text(".relic-detail .relic-boost")).toMatch(
        /count as workers/,
      );
      screen.root
        .querySelector<HTMLButtonElement>(".relic-detail .reveal-continue")
        ?.click();
      screen.root.querySelector<HTMLButtonElement>(".shelf-close")?.click();

      const revealCard = (): HTMLElement => {
        const reveal = screen.root.querySelector<HTMLElement>(
          ".relic-reveal:not(.relic-detail):not(.legend)",
        );
        if (reveal === null) {
          throw new Error("relic reveal did not render");
        }
        return reveal;
      };
      screen.root
        .querySelector<HTMLButtonElement>(".welcome-continue")
        ?.click();
      const crownReveal = revealCard();
      expect(crownReveal.hidden).toBe(false);
      expect(
        crownReveal.querySelector("#relic-reveal-title")?.textContent,
      ).toBe("You found the Crown of Wisdom");
      expect(crownReveal.querySelector(".reveal-power")?.textContent).toMatch(
        /count as workers/,
      );
      expect(mentionsHelper(screen.root)).toEqual([]);
      crownReveal.querySelector<HTMLButtonElement>(".reveal-continue")?.click();
      const mantleReveal = revealCard();
      expect(
        mantleReveal.querySelector("#relic-reveal-title")?.textContent,
      ).toBe("You found the Mantle of the Hero");
      mantleReveal
        .querySelector<HTMLButtonElement>(".reveal-continue")
        ?.click();
      const legend = screen.root.querySelector<HTMLElement>(".legend");
      expect(legend?.hidden).toBe(false);
      expect(screen.text(".legend-stats")).toMatch(/Six relics found/);

      expect(mentionsHelper(screen.root)).toEqual([]);
    } finally {
      screen.root.remove();
    }
  });
});

describe("trouble on a tier card (#149)", () => {
  const crew = (): Mountain => ({
    ...minedMountain(0),
    remaining: 50_000_000,
    pocket: 50_000_000,
    helpers: 12,
    carts: 1,
    drills: 1,
    borers: 1,
    machines: 0,
    kids: 0,
  });

  const card = (screen: ReturnType<typeof mountScreen>, id: string) => {
    const element = screen.root.querySelector<HTMLButtonElement>(
      `[data-tier="${id}"]`,
    );
    if (element === null) {
      throw new Error(`${id} card did not render`);
    }
    return element;
  };

  it("shows a warm label, slows the crew, and five taps fix it without buying", () => {
    const screen = mountScreen();
    screen.progress.applyMutation(() => crew());
    const cart = card(screen, "cart");
    cart.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 2 }),
    );
    expect(screen.text(".crew-status")).toBe(
      "Your crew mines 677 stones a second",
    );
    screen.progress.previewTrouble("cart");
    expect(cart.dataset["trouble"]).toBe("cave-in");
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe("Cave-in!");
    expect(screen.text(".crew-status")).toBe(
      "Your crew mines 674 stones a second",
    );
    expect(cart.getAttribute("aria-label")).toBe(
      troubleAria("cave-in", tierById("cart")),
    );
    expect(cart.getAttribute("aria-label")).not.toMatch(/\d|\?/);
    expect(cart.disabled).toBe(false);
    for (let tap = 0; tap < 4; tap += 1) {
      cart.click();
    }
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe("Cave-in!");
    expect(screen.progress.getSnapshot().mountain.carts).toBe(1);
    cart.click();
    expect(screen.text(".trouble-thanks")).toBe("Fixed! The crew cheers.");
    expect(screen.progress.getSnapshot().mountain.carts).toBe(1);
    expect(screen.progress.getSnapshot().trouble).toBeUndefined();
    expect(screen.text(".crew-status")).toBe(
      "Your crew mines 677 stones a second",
    );
    expect(cart.querySelector(".trouble-burst")).toBeNull();
  });

  it("names a flood, a jam, and the Great Machine without numbers", () => {
    const screen = mountScreen();
    screen.progress.applyMutation(() => crew());
    screen.progress.previewTrouble("drill");
    const drill = card(screen, "drill");
    expect(screen.text('[data-tier="drill"] .tier-rate')).toBe("Flood!");
    expect(drill.getAttribute("aria-label")).not.toMatch(/\d|\?/);
    screen.progress.previewTrouble("borer");
    expect(screen.text('[data-tier="borer"] .tier-rate')).toBe("Jam!");
    screen.progress.previewTrouble("machine");
    const machine = card(screen, "machine");
    expect(screen.text('[data-tier="machine"] .tier-rate')).toBe("Jam!");
    expect(machine.getAttribute("aria-label")).toBe(
      troubleAria("jam", tierById("machine")),
    );
    expect(machine.getAttribute("aria-label")).not.toMatch(/\d|\?/);
    expect(machine.disabled).toBe(false);
  });

  it("fixes on a short hold, and letting go early does not", async () => {
    vi.useFakeTimers();
    try {
      const screen = mountScreen();
      screen.progress.applyMutation(() => crew());
      screen.progress.previewTrouble("cart");
      const cart = card(screen, "cart");
      cart.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      cart.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
      cart.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      cart.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
      cart.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      await vi.advanceTimersByTimeAsync(FIX_HOLD_MS / 2);
      cart.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
      await vi.advanceTimersByTimeAsync(FIX_HOLD_MS);
      expect(screen.progress.getSnapshot().trouble?.kind).toBe("cave-in");
      cart.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      await vi.advanceTimersByTimeAsync(FIX_HOLD_MS);
      expect(screen.text(".trouble-thanks")).toBe("Fixed! The crew cheers.");
      expect(screen.progress.getSnapshot().mountain.carts).toBe(1);
      cart.click();
      expect(screen.progress.getSnapshot().mountain.carts).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bursts a thank-you when motion is allowed", async () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      const screen = mountScreen();
      screen.progress.applyMutation(() => crew());
      screen.progress.previewTrouble("cart");
      const cart = card(screen, "cart");
      for (let tap = 0; tap < 5; tap += 1) {
        cart.click();
      }
      expect(cart.querySelectorAll(".trouble-burst")).toHaveLength(5);
      expect(screen.text(".trouble-thanks")).toBe("Fixed! The crew cheers.");
      await vi.advanceTimersByTimeAsync(1_600);
      expect(cart.querySelector(".trouble-burst")).toBeNull();
      expect(screen.text(".trouble-thanks")).toBe("");
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });
});

describe("engineers sheet (#145)", () => {
  const withAda = (patch: Partial<Mountain> = {}): Mountain => ({
    ...minedMountain(0),
    pocket: 5_000_000,
    helpers: 20,
    carts: 1,
    drills: 1,
    borers: 1,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
    ...patch,
  });

  const openSheet = (root: HTMLElement): HTMLElement => {
    const button = root.querySelector<HTMLButtonElement>(".engineers-button");
    if (button === null) {
      throw new Error("engineers button did not render");
    }
    button.click();
    const sheet = root.querySelector<HTMLElement>(".engineers-dialog");
    if (sheet === null) {
      throw new Error("engineers sheet did not render");
    }
    return sheet;
  };

  it("hides the button until the first engineer arrives with a borer", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(0),
        pocket: 10_000_000,
        helpers: 4,
        drills: 1,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const button =
      screen.root.querySelector<HTMLButtonElement>(".engineers-button");
    expect(button?.hidden).toBe(true);
    screen.root
      .querySelector<HTMLButtonElement>('[data-tier="borer"]')
      ?.click();
    expect(button?.hidden).toBe(false);
    expect(button?.getAttribute("aria-label")).toBe("Engineers");
    const sheet = openSheet(screen.root);
    expect(sheet.hidden).toBe(false);
    expect(sheet.textContent).toContain(
      "Ada is tending the borers: +0 stones/sec.",
    );
  });

  it("calls a party back from the tunnel when a post is chosen", () => {
    const storage = createMemoryStorage();
    const away = send(withAda(), 0, "side-seam", Date.now());
    writeSessionSave({ storage, mountain: away, lastSeen: Date.now() });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    expect(screen.text(".engineer-trip-title")).toBe(
      "Ada is exploring a side seam.",
    );
    sheet
      .querySelector<HTMLButtonElement>('[data-name="Ada"] [data-post="camp"]')
      ?.click();
    expect(screen.text(".engineer-doing")).toBe(
      "Ada is resting at camp. Give her a job below.",
    );
    expect(screen.text(".engineer-toast")).toBe(
      "Ada puts the kettle on at camp.",
    );
    const saved = readSessionSave({ storage })?.mountain;
    expect(saved?.expeditions).toBeUndefined();
    expect(saved?.engineers?.[0]).toEqual({
      name: "Ada",
      rank: 0,
      trips: 0,
      post: "camp",
    });
    screen.root.remove();
  });

  it("stations, calls back to camp, and keeps the post through a hire", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda(),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const borer = screen.root.querySelector('[data-tier="borer"]');
    const cart = screen.root.querySelector('[data-tier="cart"]');
    expect(borer?.querySelector<HTMLElement>(".engineer-mark")?.hidden).toBe(
      false,
    );
    expect(borer?.querySelector(".engineer-mark")?.textContent).toBe("");
    expect(cart?.querySelector<HTMLElement>(".engineer-mark")?.hidden).toBe(
      true,
    );
    expect(borer?.getAttribute("aria-label")).toContain("Ada tends them.");
    expect(screen.text('[data-tier="borer"] .tier-rate')).toBe(
      "+691\u2009·\u2009691/s",
    );

    const sheet = openSheet(screen.root);
    const ada = sheet.querySelector('[data-name="Ada"]');
    expect(ada?.querySelectorAll(".engineer-rank .lamp.on")).toHaveLength(1);
    expect(ada?.querySelectorAll(".engineer-rank .lamp")).toHaveLength(3);
    expect(
      ada?.querySelector(".engineer-lamps")?.getAttribute("aria-label"),
    ).toBe("Apprentice");
    expect(ada?.querySelector(".engineer-rank-word")?.textContent).toBe(
      "Apprentice",
    );
    expect(ada?.textContent).toContain(
      "Ada is tending the borers: +96 stones/sec.",
    );
    expect(ada?.querySelector(".engineer-doing")?.textContent).not.toMatch(
      /\?|%/,
    );
    ada?.querySelector<HTMLButtonElement>(".engineer-tend")?.click();
    expect(ada?.textContent).toContain(
      "+1 stones/sec. They roll faster, and she shores up cave-ins herself.",
    );
    expect(ada?.textContent).toContain(
      "They bite deeper, and she pumps out floods herself.",
    );
    expect(ada?.textContent).toContain(
      "They dig faster, and she clears any jam herself.",
    );
    expect(ada?.textContent).toContain(
      "It runs with far fewer workers, and she clears any jam herself.",
    );
    expect(ada?.textContent).toContain(
      "Rests by the fire, ready for the next job.",
    );
    ada?.querySelector<HTMLButtonElement>('[data-post="cart"]')?.click();

    expect(screen.text(".engineer-doing")).toBe(
      "Ada is tending the carts: +1 stones/sec.",
    );
    expect(screen.text(".engineer-toast")).toBe(
      "Ada heads to the carts! +1 stones/sec",
    );
    expect(
      screen.root
        .querySelector(".engineer-toast")
        ?.classList.contains("is-story"),
    ).toBe(true);
    expect(ada?.classList.contains("is-lit")).toBe(true);
    expect(
      ada?.querySelector(".engineer-face")?.getAttribute("data-badge"),
    ).toBe("cart");
    expect(
      ada?.querySelector('[data-post="cart"]')?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(cart?.querySelector<HTMLElement>(".engineer-mark")?.hidden).toBe(
      false,
    );
    expect(borer?.querySelector<HTMLElement>(".engineer-mark")?.hidden).toBe(
      true,
    );
    expect(screen.text('[data-tier="borer"] .tier-rate')).toBe(
      "+595\u2009·\u2009595/s",
    );
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe(
      "+11\u2009·\u200911/s",
    );
    expect(readSessionSave({ storage })?.mountain.engineers?.[0]?.post).toBe(
      "cart",
    );

    ada?.querySelector<HTMLButtonElement>('[data-post="camp"]')?.click();
    expect(screen.text(".engineer-doing")).toBe(
      "Ada is resting at camp. Give her a job below.",
    );
    expect(
      ada?.querySelector(".engineer-face")?.getAttribute("data-badge"),
    ).toBe("camp");
    expect(cart?.querySelector<HTMLElement>(".engineer-mark")?.hidden).toBe(
      true,
    );
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe(
      "+10\u2009·\u200910/s",
    );

    ada?.querySelector<HTMLButtonElement>('[data-post="cart"]')?.click();
    (cart as HTMLButtonElement | null)?.click();
    expect(screen.text('[data-tier="cart"] .tier-count')).toBe("×2");
    expect(readSessionSave({ storage })?.mountain.engineers?.[0]?.post).toBe(
      "cart",
    );

    sheet.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(sheet.hidden).toBe(true);
  });

  it("calls an engineer home from a tunnel", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda({
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "tunnel" }],
      }),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    expect(screen.text(".engineer-trip-title")).toBe("Ada is out exploring.");
    expect(sheet.querySelector<HTMLElement>(".engineer-recall")?.hidden).toBe(
      false,
    );
    sheet.querySelector<HTMLButtonElement>(".engineer-recall")?.click();
    sheet.querySelector<HTMLButtonElement>(".recall-yes")?.click();
    expect(screen.text(".engineer-doing")).toBe(
      "Ada is resting at camp. Give her a job below.",
    );
    expect(screen.text(".engineer-toast")).toBe("Ada is home, empty-handed.");
    expect(readSessionSave({ storage })?.mountain.engineers?.[0]?.post).toBe(
      "camp",
    );
  });

  it("confirms a promotion, and Not yet spends nothing", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda(),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    expect(screen.text(".engineer-promote")).toBe(
      "Promote a worker: 2M stones",
    );
    expect(screen.text(".engineer-promote-why")).toBe(
      "A new engineer can tend another machine or explore while the others work.",
    );
    expect(screen.text(".engineer-promote-why")).not.toMatch(/\d|\?/);
    sheet.querySelector<HTMLButtonElement>(".engineer-promote")?.click();
    expect(screen.text(".engineer-confirm-line")).toBe(
      "Nils steps up as engineer. One worker fewer at the machines.",
    );
    expect(sheet.querySelector<HTMLElement>(".engineer-promote")?.hidden).toBe(
      true,
    );
    sheet.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(sheet.hidden).toBe(false);
    expect(sheet.querySelector<HTMLElement>(".engineer-confirm")?.hidden).toBe(
      true,
    );
    expect(screen.text(".pocket")).toBe("5 million stones");

    sheet.querySelector<HTMLButtonElement>(".engineer-promote")?.click();
    sheet.querySelector<HTMLButtonElement>(".engineer-confirm-no")?.click();
    expect(sheet.querySelector<HTMLElement>(".engineer-confirm")?.hidden).toBe(
      true,
    );
    expect(screen.text('[data-tier="helper"] .tier-count')).toBe("×20");

    sheet.querySelector<HTMLButtonElement>(".engineer-promote")?.click();
    sheet.querySelector<HTMLButtonElement>(".engineer-confirm-yes")?.click();
    expect(screen.text(".pocket")).toBe("3 million stones");
    expect(screen.text('[data-tier="helper"] .tier-count')).toBe("×19");
    const nils = sheet.querySelector('[data-name="Nils"]');
    expect(nils?.classList.contains("is-open")).toBe(true);
    expect(nils?.querySelector(".engineer-doing")?.textContent).toBe(
      "Nils is resting at camp. Give him a job below.",
    );
    expect(screen.text(".engineer-toast")).toBe(
      "Nils steps up. The crew cheers.",
    );
    expect(nils?.querySelectorAll(".engineer-rank .lamp.on")).toHaveLength(1);
    expect(readSessionSave({ storage })?.mountain.engineers).toEqual([
      { name: "Ada", rank: 0, trips: 0, post: "borer" },
      { name: "Nils", rank: 0, trips: 0, post: "camp" },
    ]);
    sheet.querySelector<HTMLButtonElement>(".engineers-close")?.click();
    expect(sheet.hidden).toBe(true);
  });

  it("shows lamps and a near-rank hint instead of a trip count", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda({
        engineers: [
          { name: "Ada", rank: 0, trips: 2, post: "borer" },
          { name: "Nils", rank: 1, trips: 3, post: "drill" },
          { name: "Ruth", rank: 1, trips: 8, post: "cart" },
          { name: "Otto", rank: 2, trips: 9, post: "camp" },
        ],
      }),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    const lamps = (name: string): number =>
      sheet.querySelectorAll(`[data-name="${name}"] .engineer-rank .lamp.on`)
        .length;
    expect(lamps("Ada")).toBe(1);
    expect(lamps("Nils")).toBe(2);
    expect(lamps("Ruth")).toBe(2);
    expect(lamps("Otto")).toBe(3);
    expect(
      sheet.querySelector('[data-name="Ada"] .engineer-hint')?.textContent,
    ).toBe("nearly a Journeyman");
    expect(
      sheet.querySelector('[data-name="Ruth"] .engineer-hint')?.textContent,
    ).toBe("nearly a Master");
    expect(
      sheet.querySelector<HTMLElement>('[data-name="Nils"] .engineer-hint')
        ?.hidden,
    ).toBe(true);
    expect(
      sheet.querySelector<HTMLElement>('[data-name="Otto"] .engineer-hint')
        ?.hidden,
    ).toBe(true);
    for (const hint of sheet.querySelectorAll(
      ".engineer-hint, .engineer-rank",
    )) {
      expect(hint.textContent).not.toMatch(/\d|\?/);
    }
    expect(
      sheet
        .querySelector('[data-name="Otto"] .engineer-lamps')
        ?.getAttribute("aria-label"),
    ).toBe("Master engineer");
  });

  it("refuses a promotion when no worker is free, or the crew is full", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda({ helpers: 0 }),
      lastSeen: Date.now(),
    });
    const broke = mountScreen({ storage });
    openSheet(broke.root);
    const promote =
      broke.root.querySelector<HTMLButtonElement>(".engineer-promote");
    expect(promote?.disabled).toBe(true);
    expect(promote?.textContent).toBe("Promote a worker: 2M stones");
    expect(broke.text(".engineer-promote-why")).toBe(
      "No worker is free to step up.",
    );
    promote?.click();
    expect(
      broke.root.querySelector<HTMLElement>(".engineer-confirm")?.hidden,
    ).toBe(true);

    const fullStorage = createMemoryStorage();
    writeSessionSave({
      storage: fullStorage,
      mountain: withAda({
        helpers: 5,
        engineers: [
          { name: "Ada", rank: 0, trips: 0, post: "borer" },
          { name: "Nils", rank: 0, trips: 0, post: "camp" },
          { name: "Ruth", rank: 0, trips: 0, post: "camp" },
          { name: "Otto", rank: 0, trips: 0, post: "camp" },
          { name: "Mae", rank: 0, trips: 0, post: "camp" },
        ],
      }),
      lastSeen: Date.now(),
    });
    const full = mountScreen({ storage: fullStorage });
    openSheet(full.root);
    expect(full.text(".engineer-promote")).toBe("Promote");
    expect(full.text(".engineer-promote-why")).toBe(
      "Every named hand is already an engineer.",
    );
    expect(full.root.querySelectorAll(".engineer.is-open")).toHaveLength(1);
    expect(full.root.querySelectorAll(".engineer.is-mini")).toHaveLength(4);
    expect(
      full.root.querySelector<HTMLButtonElement>(".engineer-promote")?.disabled,
    ).toBe(true);
    full.root
      .querySelector<HTMLButtonElement>('[data-name="Mae"] .engineer-mini')
      ?.click();
    expect(
      full.root.querySelector(".engineer.is-open")?.getAttribute("data-name"),
    ).toBe("Mae");
    expect(full.text(".engineer-duty")).toBe("Tending the borers");
  });

  it("greys promotion when the pocket is light, and a press shows", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda({ pocket: 10 }),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    const promote = sheet.querySelector<HTMLButtonElement>(".engineer-promote");
    expect(promote?.disabled).toBe(true);
    expect(screen.text(".engineer-promote")).toBe(
      "Promote a worker: 2M stones",
    );
    expect(screen.text(".engineer-promote-why")).toBe("Needs 2M stones");
    promote?.click();
    expect(sheet.querySelector<HTMLElement>(".engineer-confirm")?.hidden).toBe(
      true,
    );

    const rich = createMemoryStorage();
    writeSessionSave({
      storage: rich,
      mountain: withAda(),
      lastSeen: Date.now(),
    });
    const ready = mountScreen({ storage: rich });
    const open = openSheet(ready.root);
    const tend = open.querySelector<HTMLButtonElement>(".engineer-tend");
    tend?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(tend?.classList.contains("is-pressed")).toBe(true);
    ready.root.remove();
    screen.root.remove();
  });

  it("shows keepsakes an engineer brought home, and toasts the story", () => {
    const tools = createMemoryStorage();
    writeSessionSave({
      storage: tools,
      mountain: withAda({ finds: ["pick"] }),
      lastSeen: Date.now(),
    });
    const quiet = mountScreen({ storage: tools });
    const quietSheet = openSheet(quiet.root);
    expect(
      quietSheet.querySelector<HTMLElement>(".engineer-brought")?.hidden,
    ).toBe(true);
    quiet.root.remove();

    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda({ finds: ["pick", "drawing", "watch"] }),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    const row = sheet.querySelector<HTMLButtonElement>(".engineer-brought");
    expect(row?.hidden).toBe(false);
    expect(row?.textContent).toContain("Brought home");
    expect(row?.textContent).toContain("A child's drawing");
    expect(row?.textContent).toContain(
      "A little figure with a lamp, folded for a pocket.",
    );
    expect(row?.textContent).toContain("A pocket watch");
    expect(row?.textContent).toContain("Quiet in the hand. Someone loved it.");
    expect(row?.textContent).not.toContain("Grandfather's pick");
    expect(row?.textContent).not.toMatch(/\d|\?/);
    row?.click();
    const toast = sheet.querySelector(".engineer-toast");
    expect(toast?.classList.contains("is-story")).toBe(true);
    expect(toast?.textContent).toBe(
      "A child's drawing. A little figure with a lamp, folded for a pocket. A pocket watch. Quiet in the hand. Someone loved it.",
    );
    screen.root.remove();
  });

  it("lets a press and a cheer fade, and ignores a post she already holds", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda(),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    vi.useFakeTimers();
    try {
      const tend = sheet.querySelector<HTMLButtonElement>(".engineer-tend");
      tend?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      tend?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      const deep = sheet.querySelector<HTMLButtonElement>(
        '[data-tunnel="deep-dark"]',
      );
      deep?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      deep?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      vi.advanceTimersByTime(200);
      expect(tend?.classList.contains("is-pressed")).toBe(false);

      sheet.querySelector<HTMLButtonElement>('[data-post="borer"]')?.click();
      expect(sheet.querySelector<HTMLElement>(".engineer-toast")?.hidden).toBe(
        true,
      );
      sheet.querySelector<HTMLButtonElement>('[data-post="drill"]')?.click();
      sheet.querySelector<HTMLButtonElement>('[data-post="cart"]')?.click();
      expect(screen.text(".engineer-toast")).toBe(
        "Ada heads to the carts! +1 stones/sec",
      );
      expect(
        sheet.querySelector(".engineer-toast")?.classList.contains("is-story"),
      ).toBe(true);
      expect(sheet.querySelector(".engineer.is-lit")).not.toBeNull();
      sheet
        .querySelectorAll<HTMLButtonElement>('[data-post="camp"]')[4]
        ?.click();
      sheet.querySelector<HTMLButtonElement>(".engineer-brought")?.click();
      sheet.querySelector<HTMLButtonElement>(".recall-yes")?.click();
      sheet.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
      expect(sheet.hidden).toBe(false);
      vi.advanceTimersByTime(2_300);
      expect(sheet.querySelector<HTMLElement>(".engineer-toast")?.hidden).toBe(
        true,
      );
      expect(sheet.querySelector(".engineer.is-lit")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
    screen.root.remove();
  });
});

describe("side tunnels (#147)", () => {
  const withAda = (patch: Partial<Mountain> = {}): Mountain => ({
    ...minedMountain(0),
    pocket: 5_000_000,
    helpers: 20,
    carts: 1,
    drills: 1,
    borers: 1,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
    ...patch,
  });

  const openSheet = (root: HTMLElement): HTMLElement => {
    const button = root.querySelector<HTMLButtonElement>(".engineers-button");
    button?.click();
    const sheet = root.querySelector<HTMLElement>(".engineers-dialog");
    if (sheet === null) {
      throw new Error("engineers sheet did not render");
    }
    return sheet;
  };

  it("sends Ada down a tunnel, and an Apprentice cannot take the deep dark", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda(),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    const ada = sheet.querySelector('[data-name="Ada"]');
    ada?.querySelector<HTMLButtonElement>(".engineer-explore")?.click();
    expect(ada?.textContent).toContain("Quick look");
    expect(ada?.textContent).toContain(
      "Back in a few minutes with a small find.",
    );
    expect(ada?.textContent).toContain("Old shaft");
    expect(ada?.textContent).toContain(
      "About an hour, often a lost tool or keepsake.",
    );
    expect(ada?.textContent).toContain("The deep dark");
    expect(ada?.textContent).toContain("The deep dark waits for a Journeyman.");
    expect(ada?.textContent).toContain(
      "While she explores, her machine works without her.",
    );
    const deep = ada?.querySelector<HTMLButtonElement>(
      '[data-tunnel="deep-dark"]',
    );
    expect(deep?.disabled).toBe(true);
    deep?.click();
    expect(screen.progress.getSnapshot().mountain.expeditions).toBeUndefined();

    ada?.querySelector<HTMLButtonElement>('[data-tunnel="old-shaft"]')?.click();
    expect(screen.text(".engineer-trip-title")).toBe(
      "Ada is exploring the old shaft.",
    );
    expect(screen.text(".engineer-trip-detail")).toBe(
      "Ada will be gone about an hour. She'll bring home whatever is found.",
    );
    expect(screen.text(".engineer-toast")).toBe(
      "Ada lights a lamp and heads in!",
    );
    expect(ada?.classList.contains("is-lit")).toBe(true);
    expect(ada?.querySelector<HTMLElement>(".engineer-recall")?.hidden).toBe(
      false,
    );
    expect(ada?.querySelector<HTMLElement>(".engineer-explore")?.hidden).toBe(
      true,
    );
    const chip = screen.root.querySelector<HTMLElement>(".expedition-chip");
    expect(chip?.hidden).toBe(false);
    expect(chip?.textContent).toBe("Ada will be gone about an hour.");
    expect(chip?.textContent).not.toMatch(/\d|\?/);
    const saved = readSessionSave({ storage })?.mountain;
    expect(saved?.expeditions?.[0]?.tunnel).toBe("old-shaft");
    expect(saved?.expeditions?.[0]?.engineer).toBe("Ada");
    expect(saved?.engineers?.[0]?.post).toBe("tunnel");
    screen.root.remove();
  });

  it("recalls with a soft confirm, and a post calls her home first", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda(),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    sheet
      .querySelector<HTMLButtonElement>('[data-tunnel="side-seam"]')
      ?.click();
    const recall = sheet.querySelector<HTMLButtonElement>(".engineer-recall");
    expect(recall?.hidden).toBe(false);
    recall?.click();
    expect(screen.text(".recall-line")).toBe("Ada comes home empty-handed.");
    expect(screen.text(".recall-line")).not.toMatch(/\d|\?/);
    expect(screen.text(".recall-no")).toBe("Keep exploring");
    expect(screen.text(".recall-yes")).toBe("Call back");
    sheet.querySelector<HTMLButtonElement>(".recall-no")?.click();
    expect(screen.text(".engineer-trip-title")).toBe(
      "Ada is exploring a side seam.",
    );
    expect(sheet.querySelector<HTMLElement>(".recall-confirm")?.hidden).toBe(
      true,
    );

    recall?.click();
    sheet.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(sheet.hidden).toBe(false);
    expect(screen.text(".engineer-trip-title")).toBe(
      "Ada is exploring a side seam.",
    );

    recall?.click();
    sheet.querySelector<HTMLButtonElement>(".recall-yes")?.click();
    expect(screen.text(".engineer-doing")).toBe(
      "Ada is tending the borers: +96 stones/sec.",
    );
    expect(screen.text(".engineer-toast")).toBe("Ada is home, empty-handed.");
    expect(screen.progress.getSnapshot().mountain.expeditions).toBeUndefined();
    expect(screen.progress.getSnapshot().mountain.engineers?.[0]).toMatchObject(
      { trips: 0, post: "borer" },
    );
    expect(screen.progress.getSnapshot().mountain.finds).toBeUndefined();
    expect(
      screen.root.querySelector<HTMLElement>(".expedition-chip")?.hidden,
    ).toBe(true);

    sheet
      .querySelector<HTMLButtonElement>('[data-tunnel="side-seam"]')
      ?.click();
    sheet.querySelector<HTMLButtonElement>(".engineer-recall")?.click();
    sheet.querySelector<HTMLButtonElement>('[data-post="camp"]')?.click();
    expect(screen.text(".engineer-doing")).toBe(
      "Ada is resting at camp. Give her a job below.",
    );
    expect(sheet.querySelector<HTMLElement>(".recall-confirm")?.hidden).toBe(
      true,
    );
    expect(screen.progress.getSnapshot().mountain.expeditions).toBeUndefined();
    expect(screen.progress.getSnapshot().mountain.engineers?.[0]?.trips).toBe(
      0,
    );
    screen.root.remove();
  });

  it("lets a Journeyman take the deep dark", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda({
        engineers: [{ name: "Ada", rank: 1, trips: 3, post: "camp" }],
      }),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    const ada = sheet.querySelector('[data-name="Ada"]');
    expect(ada?.querySelector(".engineer-doing")?.textContent).toBe(
      "Ada is resting at camp. Give her a job below.",
    );
    ada?.querySelector<HTMLButtonElement>(".engineer-explore")?.click();
    expect(ada?.textContent).not.toContain(
      "The deep dark waits for a Journeyman.",
    );
    expect(ada?.textContent).toContain(
      "All night, the best chance of a relic hint or a new engineer.",
    );
    const deep = ada?.querySelector<HTMLButtonElement>(
      '[data-tunnel="deep-dark"]',
    );
    expect(deep?.disabled).toBe(false);
    deep?.click();
    expect(screen.text(".expedition-chip")).toBe(
      "Ada will be gone a long night.",
    );
    expect(
      screen.progress.getSnapshot().mountain.expeditions?.[0]?.tunnel,
    ).toBe("deep-dark");
    screen.root.remove();
  });

  it("says who came back, on the welcome card and while you stay", () => {
    const sent = send(withAda(), 0, "old-shaft", 0);
    const trip = sent.expeditions?.[0];
    if (trip === undefined) {
      throw new Error("expected a trip");
    }
    const found = {
      ...sent,
      expeditions: [
        {
          ...trip,
          sentAt: 0,
          returnsAt: 60 * 60_000,
          find: { kind: "tool" as const, id: "pick" as const },
        },
      ],
    };
    const awayStorage = createMemoryStorage();
    writeSessionSave({ storage: awayStorage, mountain: found, lastSeen: 0 });
    const away = mountScreen({ storage: awayStorage });
    expect(away.root.querySelector<HTMLElement>(".welcome-back")?.hidden).toBe(
      false,
    );
    expect(away.text("#welcome-back-title")).toBe("While you were away");
    expect(away.text(".welcome-return")).toBe(
      "Ada came back from the old shaft with Grandfather's pick. Taps bite deeper.",
    );
    expect(away.text(".welcome-return")).not.toMatch(/\d|\?/);
    expect(away.root.querySelector<HTMLElement>(".welcome-mined")?.hidden).toBe(
      false,
    );
    away.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
    expect(away.root.querySelector<HTMLElement>(".welcome-back")?.hidden).toBe(
      true,
    );
    expect(away.progress.getSnapshot().homecomings).toEqual([]);
    away.progress.dispose();
    away.root.remove();

    vi.useFakeTimers();
    try {
      const start = 1_000_000_000;
      vi.setSystemTime(start);
      const waiting = {
        ...sent,
        expeditions: [
          {
            ...trip,
            sentAt: start,
            returnsAt: start + 5_000,
            find: { kind: "tool" as const, id: "pick" as const },
          },
        ],
      };
      const liveStorage = createMemoryStorage();
      writeSessionSave({
        storage: liveStorage,
        mountain: waiting,
        lastSeen: start,
      });
      const live = mountScreen({ storage: liveStorage });
      expect(
        live.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
      ).toBe(true);
      expect(live.text(".expedition-chip")).toBe("Ada will be back soon.");
      vi.setSystemTime(start + 5_000);
      live.progress.tick();
      expect(live.text("#welcome-back-title")).toBe("Welcome home");
      expect(live.text(".welcome-return")).toBe(
        "Ada came back from the old shaft with Grandfather's pick. Taps bite deeper.",
      );
      expect(
        live.root.querySelector<HTMLElement>(".welcome-mined")?.hidden,
      ).toBe(true);
      expect(
        live.root.querySelector<HTMLElement>(".expedition-chip")?.hidden,
      ).toBe(true);
      expect(live.progress.getSnapshot().mountain.finds).toEqual(["pick"]);
      expect(live.progress.getSnapshot().mountain.engineers?.[0]?.post).toBe(
        "borer",
      );
      live.progress.dispose();
      live.root.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the tending gain on the card, and it follows a new machine", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda({ helpers: 16, pocket: 30_000_000 }),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    expect(screen.text('[data-tier="borer"] .engineer-gain')).toBe(
      "+96 stones/sec",
    );
    expect(
      screen.root
        .querySelector('[data-tier="borer"]')
        ?.getAttribute("aria-label"),
    ).toContain("+96 stones/sec");
    const sheet = openSheet(screen.root);
    sheet.querySelector<HTMLButtonElement>(".engineer-tend")?.click();
    expect(sheet.textContent).toContain(
      "+96 stones/sec. They dig faster, and she clears any jam herself.",
    );
    expect(sheet.textContent).toContain("None built yet. ");
    expect(sheet.textContent).not.toContain("+0 stones/sec");
    screen.root
      .querySelector<HTMLButtonElement>('[data-tier="borer"]')
      ?.click();
    expect(screen.text('[data-tier="borer"] .engineer-gain')).toBe(
      "+192 stones/sec",
    );
    expect(sheet.textContent).toContain("+192 stones/sec");
    screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
    expect(screen.text('[data-boost="sharper"] .upgrade-effect')).toContain(
      "a tap",
    );
    expect(screen.text('[data-boost="overtime"] .upgrade-effect')).toMatch(
      /\/s\.$/,
    );
    screen.root.remove();
  });

  it("names every return on the away card, and again after a locked phone", () => {
    const sent = send(
      send(
        withAda({
          engineers: [
            { name: "Ada", rank: 0, trips: 0, post: "borer" },
            { name: "Nils", rank: 0, trips: 0, post: "drill" },
          ],
        }),
        0,
        "old-shaft",
        0,
      ),
      1,
      "side-seam",
      0,
    );
    const trips = sent.expeditions ?? [];
    const found = {
      ...sent,
      expeditions: trips.map((trip) => ({
        ...trip,
        sentAt: 0,
        returnsAt: 60_000,
        find:
          trip.engineer === "Ada"
            ? ({ kind: "tool", id: "pick" } as const)
            : ({ kind: "quiet" } as const),
      })),
    };
    const awayStorage = createMemoryStorage();
    writeSessionSave({ storage: awayStorage, mountain: found, lastSeen: 0 });
    const away = mountScreen({ storage: awayStorage });
    const lines = [...away.root.querySelectorAll(".welcome-return")].map(
      (line) => line.textContent,
    );
    expect(lines).toEqual([
      "Ada came back from the old shaft with Grandfather's pick. Taps bite deeper.",
      "Nils came back from a side seam. The tunnel was quiet, and they came home safe.",
    ]);
    expect(lines.join(" ")).not.toMatch(/\d|\?/);
    away.progress.dispose();
    away.root.remove();

    vi.useFakeTimers();
    const setVisibility = (state: DocumentVisibilityState) => {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => state,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    try {
      const start = 1_000_000_000;
      vi.setSystemTime(start);
      const one = send(withAda(), 0, "old-shaft", start);
      const trip = one.expeditions?.[0];
      if (trip === undefined) {
        throw new Error("expected a trip");
      }
      const waiting = {
        ...one,
        expeditions: [
          {
            ...trip,
            returnsAt: start + 5_000,
            find: { kind: "tool" as const, id: "pick" as const },
          },
        ],
      };
      const storage = createMemoryStorage();
      writeSessionSave({ storage, mountain: waiting, lastSeen: start });
      const live = mountScreen({ storage });
      openSheet(live.root);
      expect(
        live.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
      ).toBe(true);
      setVisibility("hidden");
      vi.setSystemTime(start + 5_000);
      setVisibility("visible");
      const notice = live.root.querySelector<HTMLElement>(".welcome-back");
      expect(notice?.hidden).toBe(false);
      expect(notice?.classList.contains("is-homecoming")).toBe(true);
      expect(live.text("#welcome-back-title")).toBe("Welcome home");
      expect(live.text(".welcome-return")).toBe(
        "Ada came back from the old shaft with Grandfather's pick. Taps bite deeper.",
      );
      expect(
        live.root.querySelector<HTMLElement>(".engineers-dialog")?.hidden,
      ).toBe(false);
      live.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
      expect(notice?.hidden).toBe(true);
      live.progress.dispose();
      live.root.remove();

      const againStorage = createMemoryStorage();
      writeSessionSave({
        storage: againStorage,
        mountain: waiting,
        lastSeen: start,
      });
      vi.setSystemTime(start);
      const first = mountScreen({ storage: againStorage });
      vi.setSystemTime(start + 5_000);
      setVisibility("hidden");
      first.progress.dispose();
      first.root.remove();
      setVisibility("visible");
      const again = mountScreen({ storage: againStorage });
      expect(
        again.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
      ).toBe(false);
      expect(again.text(".welcome-return")).toContain("Grandfather's pick");
      again.root.querySelector<HTMLButtonElement>(".welcome-continue")?.click();
      again.progress.dispose();
      again.root.remove();
      const quiet = mountScreen({ storage: againStorage });
      expect(
        quiet.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
      ).toBe(true);
      quiet.progress.dispose();
      quiet.root.remove();
    } finally {
      setVisibility("visible");
      vi.useRealTimers();
    }
  });
});
