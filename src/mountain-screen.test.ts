import { writeSessionSave } from "./session-save";
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
import { MOUNTAIN_STONES, type Mountain } from "./mountain";
import { mountMountainScreen } from "./mountain-screen";
import { createProgressStore } from "./progress-store";
import { SESSION_SAVE_KEY } from "./session-save";
import { minedMountain } from "./test-fixtures";

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
}: {
  auth?: AuthController;
  cloudSave?: CloudSave;
  storage?: Storage;
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
    veinStorage: storage,
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

    expect(screen.text(".stones-left")).toBe("100 million stones left");
    expect(screen.text(".pocket")).toBe("0 stones");
    expect(screen.text(".goal")).toContain("Legendary Relics of Fatherhood");
    expect(screen.text(".save-status")).toBe("Sign in to save");

    screen.mountain.click();
    expect(
      screen.root.querySelector(".stones-left")?.getAttribute("title"),
    ).toBe("99,999,999 of 100,000,000");
    expect(screen.text(".pocket")).toBe("1 stone");
    expect(screen.text(".save-status")).toBe("Saved on this device");

    screen.mountain.click();
    expect(screen.text(".pocket")).toBe("2 stones");
    expect(
      screen.root.querySelector(".stones-left")?.getAttribute("title"),
    ).toBe("99,999,998 of 100,000,000");
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
    ).toBe("99,999,997 of 100,000,000");
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
    };
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({ version: 4, mountain: done, lastSeen: 1 }),
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
        helpers: 3,
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
    expect(borer.querySelector(".tier-rate")?.textContent).toBe(
      "+350\u2009·\u2009700/s",
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
        pocket: 81_000_000,
        drills: 1,
        borers: 1,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const machine = tierCard(screen.root, "machine");
    expect(machine.classList.contains("tier-locked")).toBe(false);
    expect(machine.disabled).toBe(false);
    expect(machine.querySelector(".tier-cost")?.textContent).toBe("80M");
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
          version: 4,
          mountain: minedMountain(19),
          lastSeen: Date.now(),
        }),
      );
      const screen = mountScreen({ storage });
      const hire = tierCard(screen.root, "helper");
      const cart = tierCard(screen.root, "cart");

      expect(screen.text(".crew-status")).toBe(
        "No crew yet. Hire a helper to mine while you rest.",
      );
      expect(screen.text('[data-tier="helper"] .tier-name')).toBe("Helper");
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
      expect(screen.text('[data-tier="helper"] .tier-name')).toBe("Helper");
      expect(screen.text('[data-tier="helper"] .tier-count')).toBe("×1");
      expect(screen.text('[data-tier="helper"] .tier-cost')).toBe("40");
      expect(hire.disabled).toBe(true);
      expect(cart.hidden).toBe(false);
      expect(hire.getAttribute("aria-label")).toBe(
        "Buy a helper for 40 stones, mines 1 stone a second. You have 1.",
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
          version: 4,
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
        version: 4,
        mountain: {
          remaining: 100_000_000,
          pocket: 0,
          helpers: 4,
          carts: 0,
          drills: 0,
          borers: 0,
          machines: 0,
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
      "You were gone 2 hours 5 minutes. Your 4 helpers mined the whole time, at a resting pace (30% of their speed).",
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
        version: 4,
        mountain: {
          remaining: 100_000_000,
          pocket: 0,
          helpers: 1,
          carts: 0,
          drills: 0,
          borers: 0,
          machines: 0,
        },
        lastSeen: Date.now() - 26 * 3_600_000,
      }),
    );
    const screen = mountScreen({ storage });
    expect(screen.text(".welcome-mined")).toBe("+8,640 stones");
    expect(screen.text(".welcome-detail")).toBe(
      "You were gone 1 day 2 hours. Your helper mined for the first 8 hours, at a resting pace (30% of their speed).",
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
      JSON.stringify({ version: 4, mountain, lastSeen }),
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
    expect(screen.text(".goal")).toBe(
      "Next: Shield of Protection, 9 million stones deeper",
    );
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
      JSON.stringify({ version: 4, mountain, lastSeen: Date.now() }),
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
    expect(names).toEqual(Array.from({ length: 6 }, () => "???"));
    expect(screen.text(".shelf-detail")).toBe(
      "Still buried deep in the mountain.",
    );

    screen.root.querySelector<HTMLButtonElement>(".shelf-close")?.click();
    expect(dialog?.hidden).toBe(true);
  });

  it("lights up found relics and, with the Lantern, shows where the rest lie", () => {
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
    expect(rows[2]?.querySelector(".shelf-name")?.textContent).toBe("???");
    expect(rows[2]?.querySelector(".shelf-detail")?.textContent).toBe(
      "Lies 25 million stones deep.",
    );
  });
});

describe("start over", () => {
  const seededDad = () => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({
        version: 4,
        mountain: {
          ...minedMountain(12_000_000),
          helpers: 4,
          carts: 1,
          drills: 0,
          borers: 0,
          machines: 0,
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
    expect(screen.text(".stones-left")).toBe("100 million stones left");
    expect(screen.text(".pocket")).toBe("0 stones");
    expect(screen.text(".crew-status")).toBe(
      "No crew yet. Hire a helper to mine while you rest.",
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
      version: 4,
      mountain: {
        remaining: 100_000_000,
        pocket: 0,
        helpers: 0,
        carts: 0,
        drills: 0,
        borers: 0,
        machines: 0,
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
});

describe("what the crew gives", () => {
  const seededCrew = () => {
    const storage = createMemoryStorage();
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({
        version: 4,
        mountain: {
          ...minedMountain(2_500),
          helpers: 2,
          carts: 3,
          drills: 0,
          borers: 0,
          machines: 0,
        },
        lastSeen: Date.now(),
      }),
    );
    return storage;
  };

  it("shows each tier's output per unit and its current total", () => {
    const screen = mountScreen({ storage: seededCrew() });
    expect(screen.text('[data-tier="helper"] .tier-rate')).toBe(
      "+1 each · 2/s",
    );
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe(
      "+10 each · 30/s",
    );
    const big = mountScreen({
      storage: (() => {
        const storage = createMemoryStorage();
        writeSessionSave({
          storage,
          mountain: { ...minedMountain(0), helpers: 1, carts: 150 },
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
        "Your crew mines 32 stones a second",
      );
      await vi.advanceTimersByTimeAsync(240);
      const midway = screen.text(".crew-status");
      expect(midway).not.toBe("Your crew mines 32 stones a second");
      expect(midway).not.toBe("Your crew mines 42 stones a second");
      await vi.advanceTimersByTimeAsync(400);
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 42 stones a second",
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
      expect(floats[0]?.textContent).toBe("+32 crew");
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
        "Your crew mines 42 stones a second",
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
      storage: seededWith({ ...minedMountain(30_000), carts: 50 }),
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
    expect(buy?.textContent).toBe("Buy for 5,000 stones");
    buy?.click();
    expect(screen.text('[data-upgrade="tap"] .upgrade-name')).toBe(
      "Strong arms · level 1 of 10",
    );
    expect(screen.text('[data-upgrade="tap"] .upgrade-now')).toBe(
      "Each tap now mines 6.",
    );
    expect(buy?.textContent).toBe("Buy for 25 thousand stones");
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
        mountain: { ...minedMountain(40_000), carts: 50 },
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
      mountain: { ...minedMountain(30_000), helpers: 9 },
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
    expect(boots?.textContent).toBe("Unlocks at 10 helpers");
    expect(boots?.disabled).toBe(true);
    expect(screen.text('[data-upgrade="steady"] .upgrade-buy')).toBe(
      "Unlocks with your first mine cart",
    );

    screen.root
      .querySelector<HTMLButtonElement>('[data-tier="helper"]')
      ?.click();
    expect(boots?.textContent).toBe("Buy for 15 thousand stones");
    expect(screen.text('[data-upgrade="boots"] .upgrade-now')).toBe(
      "Each helper now mines 1/s.",
    );
    boots?.click();
    expect(boots?.textContent).toBe("Owned");
    expect(boots?.disabled).toBe(true);
    expect(screen.text('[data-upgrade="boots"] .upgrade-now')).toBe(
      "Each helper now mines 1.1/s.",
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
      "You were gone 2 hours 5 minutes. Your 4 helpers mined the whole time, at a resting pace (37.5% of their speed).",
    );
  });
});

describe("crew synergies on screen", () => {
  it("previews the bonus, then shows it in the cart card's rate line once bought", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(1_000_000), helpers: 12, carts: 5 },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
    expect(screen.text('[data-upgrade="cartSyn"] .upgrade-name')).toBe(
      "Helping hands",
    );
    expect(screen.text('[data-upgrade="cartSyn"] .upgrade-now')).toBe(
      "Your 12 helpers would make carts 12% faster.",
    );
    expect(screen.text('[data-upgrade="drillSyn"] .upgrade-buy')).toBe(
      "Unlocks at 5 steam drills",
    );
    screen.root
      .querySelector<HTMLButtonElement>('[data-upgrade="cartSyn"] .upgrade-buy')
      ?.click();
    expect(screen.text('[data-upgrade="cartSyn"] .upgrade-now')).toBe(
      "Your 12 helpers make carts 12% faster.",
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
