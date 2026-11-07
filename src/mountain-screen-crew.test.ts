// @vitest-environment happy-dom
import { send } from "./expeditions";
import { kidStretch, shownStones, stonesLeft } from "./scale";
import { formatCount } from "./format";
import { RELICS } from "./relics";
import { readSessionSave, writeSessionSave } from "./session-save";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import { SESSION_SAVE_KEY } from "./session-save";
import { FIX_HOLD_MS } from "./hazards";
import {
  ENGINEER_WELCOME,
  NEEDS_MORE_WORKERS,
  troubleAria,
} from "./screen-words";
import { minedMountain, unstaffedSave } from "./test-fixtures";
import { tierById } from "./tiers";
import {
  createMemoryStorage,
  mountScreen,
  setReducedMotion,
  stopScreens,
  tileUrl,
} from "./mountain-screen.harness";

// Animations are opted into per test; most tests want instant numbers.
beforeEach(() => {
  setReducedMotion(true);
});
afterEach(stopScreens);

// One depth short of the bottom: the Heart band's stones, so one strong tap digs the rest.
const LAST_STONE = MOUNTAIN_STONES - 1;

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
      "+6 each · 18/s · Needs 1 worker",
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
    expect(big.text('[data-tier="cart"] .tier-rate')).toBe(
      "+6 each · 900/s · Needs 1 worker",
    );
  });

  it("floats +6/s from a bought cart and counts the crew line up", async () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      const screen = mountScreen({ storage: seededCrew() });
      const cart =
        screen.root.querySelector<HTMLButtonElement>('[data-tier="cart"]');
      cart?.click();
      expect(cart?.querySelector(".float-gain")?.textContent).toBe("+6/s");
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 22 stones a second",
      );
      await vi.advanceTimersByTimeAsync(240);
      const midway = screen.text(".crew-status");
      expect(midway).not.toBe("Your crew mines 22 stones a second");
      expect(midway).not.toBe("Your crew mines 28 stones a second");
      await vi.advanceTimersByTimeAsync(400);
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 28 stones a second",
      );
      expect(screen.text('[data-tier="cart"] .tier-rate')).toBe(
        "+6 each · 24/s · Needs 1 worker",
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
      expect(floats[0]?.textContent).toBe("+22 crew");
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
        "Your crew mines 28 stones a second",
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
    // A pinned clock (#348): on a busy machine a real one let a crew tick
    // land inside the tap, and the float read the crew's 527 instead of 9.
    const clock = Date.now();
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(30_000),
        helpers: 500,
        // Three carts open Strong arms (#250).
        carts: 3,
        pocket: 500_000,
      },
      lastSeen: clock,
    });
    const screen = mountScreen({ storage, now: () => clock });
    document.body.append(screen.root);
    const button =
      screen.root.querySelector<HTMLButtonElement>(".upgrades-button");
    const sheet = screen.root.querySelector<HTMLElement>(".upgrades-dialog");
    expect(button?.classList.contains("afford-glow")).toBe(true);
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
      "Strong arms",
    );
    expect(screen.text('[data-upgrade="tap"] .sheet-level')).toBe("Lv 0/10");
    expect(screen.text('[data-upgrade="tap"] .upgrade-effect')).toBe(
      "Taps 1 to 9.",
    );
    const buy = screen.root.querySelector<HTMLButtonElement>(
      '[data-upgrade="tap"] .upgrade-buy',
    );
    expect(buy?.textContent).toBe("Buy · 46K");
    buy?.click();
    expect(screen.text('[data-upgrade="tap"] .upgrade-name')).toBe(
      "Strong arms",
    );
    expect(screen.text('[data-upgrade="tap"] .sheet-level')).toBe("Lv 1/10");
    expect(screen.text('[data-upgrade="tap"] .upgrade-effect')).toBe(
      "Taps 9 to 18.",
    );
    expect(buy?.textContent).toBe("Buy · 368K");
    expect(buy?.disabled).toBe(false);

    screen.root.querySelector<HTMLButtonElement>(".upgrades-close")?.click();
    expect(sheet?.hidden).toBe(true);
    expect(document.activeElement).toBe(button);

    screen.mountain.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    expect(screen.root.querySelector(".tap-float")?.textContent).toBe("+9");
    expect(screen.mountain.getAttribute("aria-label")).toBe(
      "Mountain, tap to mine 9 stones",
    );
    screen.root.remove();
    setReducedMotion(true);
  });

  it("dims the button and the buy line when nothing is affordable", () => {
    const screen = mountScreen({ storage: seededWith(minedMountain(10)) });
    expect(
      screen.root
        .querySelector(".upgrades-button")
        ?.classList.contains("afford-glow"),
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
        '.effect-row .boost-chip[data-boost="sharper"]',
      );
      expect(chip?.hidden).toBe(true);
      screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
      const buy = screen.root.querySelector<HTMLButtonElement>(
        '[data-boost="sharper"] .upgrade-buy',
      );
      expect(screen.text('[data-boost="sharper"] .upgrade-name')).toBe(
        "Sharper picks",
      );
      // 120 taps, whatever the crew (#333).
      expect(buy?.textContent).toBe("Buy · 120");
      buy?.click();
      expect(buy?.disabled).toBe(true);
      expect(buy?.textContent).toBe("Running · 10:00");
      expect(chip?.hidden).toBe(false);
      expect(chip?.textContent).toBe("Picks×2 10:00");
      expect(chip?.getAttribute("aria-label")).toContain("Sharper picks");
      screen.root.querySelector<HTMLButtonElement>(".upgrades-close")?.click();

      screen.mountain.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
      expect(screen.root.querySelector(".tap-float")?.textContent).toBe("+2");

      clock += 4 * 60_000 + 30_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(chip?.textContent).toBe("Picks×2 5:30");

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
      "Overtime×2 20:00",
    );
  });

  it("sizes the countdown rows to the running clocks, not to what could run", () => {
    const now = 5_000_000;
    const open: Mountain = {
      ...minedMountain(12_000_000),
      pocket: 5_000_000,
      helpers: 20,
      carts: 2,
      borers: 1,
      staffed: 2,
      engineers: [
        { name: "Ada", rank: 0 as const, trips: 0, post: "camp" as const },
      ],
    };
    const row = (
      boosts: NonNullable<Mountain["boosts"]>,
    ): HTMLElement | null => {
      const storage = createMemoryStorage();
      writeSessionSave({
        storage,
        mountain: { ...open, boosts },
        lastSeen: now,
      });
      const screen = mountScreen({ storage, now: () => now });
      const found = screen.root.querySelector<HTMLElement>(".effect-row");
      screen.progress.dispose();
      return found;
    };
    // The workshop and an engineer could run eight clocks; two are running.
    const two = row({
      sharper: now + 10 * 60_000,
      overtime: now + 20 * 60_000,
    });
    expect(two?.dataset["rows"]).toBe("1");
    expect(two?.hidden).toBe(false);
    // Nothing running leaves no empty band under the crew.
    const none = row({});
    expect(none?.dataset["rows"]).toBe("0");
    expect(none?.hidden).toBe(true);
  });

  it("keeps every countdown on screen", () => {
    const now = 5_000_000;
    const names = ["Ada", "Nils", "Ruth", "Otto", "Mae"] as const;
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(12_000_000),
        pocket: 5_000_000,
        helpers: 20,
        carts: 2,
        borers: 1,
        staffed: 2,
        boosts: { sharper: now + 10 * 60_000, overtime: now + 20 * 60_000 },
        chargeUntil: now + 8 * 60_000,
        axleUntil: now + 12 * 60_000,
        flareUntil: now + 30 * 60_000,
        emberUntil: now + 15 * 60_000,
        engineers: names.map((name) => ({
          name,
          rank: 0 as const,
          trips: 0,
          post: "tunnel" as const,
        })),
        expeditions: names.map((name, index) => ({
          engineer: name,
          tunnel: "side-seam" as const,
          sentAt: now - 60_000,
          returnsAt: now + (40 + index) * 60_000,
          home: "camp" as const,
          find: { kind: "quiet" as const },
        })),
        bench: {
          recipe: "iron-rails",
          startedAt: now - 1_000,
          endsAt: now + 9 * 60_000,
        },
      },
      lastSeen: now,
    });
    const screen = mountScreen({ storage, now: () => now });
    const shown = [
      ...screen.root.querySelectorAll<HTMLElement>(".effect-chip"),
    ].filter((chip) => !chip.hidden);
    expect(shown).toHaveLength(12);
    expect(
      screen.root.querySelector<HTMLElement>(".effect-row")?.dataset["rows"],
    ).toBe("4");
    const picks = screen.root.querySelector<HTMLElement>(
      ".boost-chip[data-boost='sharper']",
    );
    picks?.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    expect(picks?.classList.contains("is-named")).toBe(true);
    expect(picks?.querySelector(".effect-name")?.textContent).toBe("Picks");
    expect(screen.root.querySelector(".effect-more")).toBeNull();
    expect(screen.root.querySelector(".effect-row")?.textContent).not.toMatch(
      /\+\d/,
    );
    expect(screen.root.querySelector(".crew-pool")).toBeNull();
    for (const chip of shown) {
      expect(chip.querySelector(".effect-name")?.textContent).not.toBe("");
      expect(chip.querySelector(".effect-time")?.textContent).toMatch(/\d/);
    }
    expect(
      screen.root.querySelector(".boost-chip[data-boost='sharper']")
        ?.textContent,
    ).toMatch(/Picks×2/);
    screen.progress.dispose();
  });

  it("keeps the crew at ×2 when grease, a charge, and the overtime line overlap", () => {
    const clock = 5_000_000;
    const until = clock + 20 * 60_000;
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(0),
        helpers: 10,
        chargeUntil: until,
        axleUntil: until,
      },
      lastSeen: clock,
    });
    const screen = mountScreen({ storage, now: () => clock });
    expect(screen.text(".crew-status")).toBe(
      "Your crew mines 20 stones a second",
    );
    screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
    expect(screen.text('[data-boost="overtime"] .upgrade-effect')).toBe(
      "Crew ×2 for 30 min. 20/s.",
    );
  });
});

describe("lasting upgrades on screen", () => {
  it("hides locked upgrades until open, and boosts helper cards once bought", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(30_000), pocket: 1_700_000, helpers: 9 },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
    const boots = screen.root.querySelector<HTMLButtonElement>(
      '[data-upgrade="boots"] .upgrade-buy',
    );
    // Locked rows stay hidden until their owned count opens them (#250).
    expect(
      screen.root.querySelector<HTMLElement>('[data-upgrade="boots"]')?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>('[data-upgrade="steady"]')?.hidden,
    ).toBe(true);

    screen.root
      .querySelector<HTMLButtonElement>('[data-tier="helper"]')
      ?.click();
    expect(boots?.textContent).toBe("Buy · 1.6M");
    expect(screen.text('[data-upgrade="boots"] .upgrade-effect')).toBe(
      "Workers 1/s to 2.4/s.",
    );
    boots?.click();
    expect(boots?.textContent).toBe("Owned");
    expect(boots?.disabled).toBe(true);
    expect(screen.text('[data-upgrade="boots"] .upgrade-effect')).toBe(
      "Workers 1/s to 2.4/s.",
    );
    expect(screen.text('[data-tier="helper"] .tier-rate')).toBe(
      "+2.4 each · 23/s",
    );
    expect(screen.text(".crew-status")).toBe(
      "Your crew mines 23 stones a second",
    );
  });

  it("pays more on the welcome-back card with Steady hands", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(0), helpers: 4, upgrades: { steady: 1 } },
      lastSeen: Date.now() - (2 * 60 + 5) * 60_000,
    });
    const screen = mountScreen({ storage });
    expect(screen.text(".welcome-mined")).toBe("+11.2 thousand stones");
    expect(screen.text(".welcome-detail")).toBe(
      "You were gone 2 hours 5 minutes. Your crew kept digging the whole time.",
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
    expect(screen.text('[data-upgrade="cartSyn"] .upgrade-effect')).toBe(
      "Carts 6/s to 6.7/s.",
    );
    expect(
      screen.root.querySelector<HTMLElement>('[data-upgrade="drillSyn"]')
        ?.hidden,
    ).toBe(true);
    screen.root
      .querySelector<HTMLButtonElement>('[data-upgrade="cartSyn"] .upgrade-buy')
      ?.click();
    expect(screen.text('[data-upgrade="cartSyn"] .upgrade-effect')).toBe(
      "Carts 6/s to 6.7/s.",
    );
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe(
      "+6.7 \u219112% · 33/s · Needs 1 worker",
    );
    expect(
      screen.root
        .querySelector('[data-tier="cart"]')
        ?.getAttribute("aria-label"),
    ).toContain("12% faster from crew synergy");
  });
});

describe("a synergy row before the tier exists", () => {
  it("stays hidden while the crew has none of its tier", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: { ...minedMountain(0), helpers: 3 },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    expect(
      screen.root.querySelector<HTMLElement>('[data-upgrade="machineSyn"]')
        ?.hidden,
    ).toBe(true);
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
        helpers: 3,
        carts: 3,
        drills: 2,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    // 3 workers: both drills (1 each), then one cart; two carts idle.
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe(
      "+6\u2009·\u20096/s · Needs 1 worker",
    );
    expect(
      screen.root
        .querySelector('[data-tier="cart"]')
        ?.classList.contains("tier-idle"),
    ).toBe(true);
    expect(
      screen.root
        .querySelector('[data-tier="cart"]')
        ?.getAttribute("aria-label"),
    ).toContain("2 idle: each needs 1 worker to run");
    // The idle carts teach hiring; the drill card says it needs more hands.
    expect(
      screen.root
        .querySelector('[data-tier="drill"]')
        ?.getAttribute("aria-label"),
    ).toContain(NEEDS_MORE_WORKERS);
    expect(screen.text('[data-tier="drill"] .tier-rate')).toBe(
      "+36\u2009·\u200972/s · Needs 1 worker",
    );
    expect(screen.text(".crew-status")).toBe("81/s · 2 idle, need 2 workers");

    // Hiring one worker starts another cart; one still waits.
    screen.root
      .querySelector<HTMLButtonElement>('[data-tier="helper"]')
      ?.click();
    expect(screen.text(".crew-status")).toBe("88/s · 1 idle, need 1 worker");
  });

  it("says a machine would need more workers before you buy it, with no new numbers", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        // The borer opens at 10M stones (#250).
        ...minedMountain(10_000_000),
        pocket: 20_000_000,
        helpers: 9,
        carts: 1,
        drills: 1,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const borer = screen.root.querySelector('[data-tier="borer"]');
    // The Granite suits borers (×1.1, D3).
    expect(screen.text('[data-tier="borer"] .tier-rate')).toBe(
      "+392/s · Needs 8 workers",
    );
    expect(borer?.getAttribute("aria-label")).toContain(NEEDS_MORE_WORKERS);
    // The Granite is tough on drills (×0.8, D3).
    expect(screen.text('[data-tier="drill"] .tier-rate')).toBe(
      "+28\u2009·\u200928/s · Needs 1 worker",
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
        "+6/s · Needs 1 worker",
      );
      expect(screen.text(".crew-status")).toBe("7/s · 1 idle, need 1 worker");
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });
});

describe("Flemming's cart (#216)", () => {
  it("shows what one more cart adds, and where the borer opens", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(4_500_000),
        pocket: 255_200,
        helpers: 18,
        carts: 13,
        drills: 5,
        upgrades: { boots: 1, cartSyn: 1 },
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    expect(screen.text('[data-tier="helper"] .tier-rate')).toBe(
      "+2.4\u2009·\u200942/s",
    );
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe(
      "+7.1\u2009·\u200992/s · Needs 1 worker",
    );
    expect(screen.text('[data-tier="drill"] .tier-rate')).toBe(
      "+36\u2009·\u2009180/s · Needs 1 worker",
    );
    // Above 7M the borer is a locked preview that says where it opens (#250).
    expect(screen.text('[data-tier="borer"] .tier-rate')).toBe("Borer · 7M");
    expect(
      screen.root.querySelector(".crew-posts")?.getAttribute("aria-label"),
    ).toBe("18 workers: 13 on carts, 5 on drills, 0 free");
    expect(screen.text(".crew-posts")).toContain("18 workers");
    expect(screen.text(".crew-posts")).toContain("13 on carts");
    expect(screen.text(".crew-posts")).toContain("5 on drills");
    expect(screen.text(".crew-posts")).toContain("0 free");
    expect(
      screen.root.querySelector<HTMLElement>(".crew-breakdown")?.hidden,
    ).toBe(true);

    document.body.append(screen.root);
    const posts = screen.root.querySelector<HTMLButtonElement>(".crew-posts");
    if (posts === null) {
      throw new Error("crew posts did not render");
    }
    posts.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(posts.classList.contains("is-pressed")).toBe(true);
    posts.dispatchEvent(new PointerEvent("pointerup", { bubbles: true }));
    posts.dispatchEvent(new PointerEvent("pointercancel", { bubbles: true }));
    posts.dispatchEvent(new PointerEvent("pointerleave", { bubbles: true }));
    expect(posts.classList.contains("is-pressed")).toBe(false);
    posts.click();
    expect(
      screen.root.querySelector<HTMLElement>(".crew-breakdown")?.hidden,
    ).toBe(true);

    Object.defineProperty(posts, "isConnected", {
      configurable: true,
      get: () => true,
    });
    Object.defineProperty(posts, "clientWidth", {
      configurable: true,
      get: () => 40,
    });
    Object.defineProperty(posts, "scrollWidth", {
      configurable: true,
      get: () => 280,
    });
    screen.progress.applyMutation((mountain) => ({ ...mountain }));
    expect(posts.dataset["tight"]).toBe("false");
    expect(posts.textContent).toContain("13 on carts");
    expect(posts.textContent).toContain("5 on drills");
    const rows = [...posts.querySelectorAll(".crew-row")];
    expect(rows.length).toBe(2);
    const sizes = rows.map((row) => row.querySelectorAll(".crew-bit").length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(posts.querySelector(".crew-bit")?.textContent).toMatch(
      /workers · \d+ free$/,
    );
    posts.click();
    expect(
      screen.root.querySelector<HTMLElement>(".crew-breakdown")?.hidden,
    ).toBe(true);
    screen.root.remove();
  });

  it("hides the worker line before anyone is hired", () => {
    const screen = mountScreen();
    expect(screen.root.querySelector<HTMLElement>(".crew-posts")?.hidden).toBe(
      true,
    );
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
      mountain: oldSave({ helpers: 4, carts: 6, drills: 6 }),
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
        drills: 6,
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
      "+435\u2009·\u2009435/s · Needs 8 workers",
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
        ...minedMountain(10_000_000),
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
    // Bought in the Granite, which suits borers (×1.1, D3).
    expect(screen.text('[data-tier="borer"] .tier-rate')).toBe(
      "+478\u2009·\u2009478/s · Needs 8 workers",
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
      "You were gone 1 day 6 hours. Your crew saved a full day's haul for you. Good to have you back.",
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
      storage: seeded({
        ...minedMountain(LAST_STONE),
        helpers: 1_000,
        upgrades: { tap: 3 },
      }),
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
      `${formatCount(shownStones(createMountain(), MOUNTAIN_STONES))} stones moved. Six relics found. A crew of 1,000 beside you.`,
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
      ...minedMountain(LAST_STONE),
      helpers: 1_000,
      upgrades: { tap: 3 },
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
    expect(screen.text("#legacy-title")).toBe("Pass the mine to your kid.");
    expect(screen.text(".legacy-lead")).toBe("Legacy ×1.5, for good");
    expect(
      [...(dialog(screen)?.querySelectorAll(".legacy-rates li") ?? [])].map(
        (item) => item.textContent,
      ),
    ).toEqual(["Workers 1/s to 1.5/s", "Carts 6/s to 9/s"]);
    expect(screen.text(".legacy-keeps")).toMatch(
      /^A bigger mountain for your kid, with the Legacy and \d+ recipes\.$/,
    );
    expect(screen.text(".legacy-detail")).not.toMatch(/\?/);
    expect(document.activeElement).toBe(
      dialog(screen)?.querySelector(".legacy-cancel"),
    );

    dialog(screen)
      ?.querySelector<HTMLButtonElement>(".legacy-confirm")
      ?.click();

    expect(dialog(screen)?.hidden).toBe(true);
    expect(screen.text(".stones-left")).toBe(
      `${formatCount(stonesLeft(createMountain()) * kidStretch(1))} stones left`,
    );
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
        // One stone short of the Crown. A crew of this size, on 23.5h of
        // Shield away pay (under the 24h cap), reaches the bottom through the
        // banded stones, so the welcome card, the Crown, and the Legend
        // finale all render.
        ...minedMountain(69_999_999),
        pocket: 80_000_000,
        helpers: 200,
        carts: 50,
        borers: 10,
        machines: 20,
        kids: 10,
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
      expect(screen.text(".welcome-detail")).toMatch(
        /kept digging the whole time/,
      );
      expect(screen.text(".crew-status")).toMatch(/need \d+ workers/);
      expect(screen.text('[data-tier="helper"] .tier-name')).toBe("Worker");
      expect(screen.text('[data-tier="kid"] .tier-name')).toBe("Kid worker");

      screen.root.querySelector<HTMLButtonElement>(".upgrades-button")?.click();
      expect(
        screen.root.querySelector<HTMLElement>(".upgrades-dialog")?.hidden,
      ).toBe(false);
      expect(screen.text('[data-upgrade="boots"] .upgrade-effect')).toBe(
        "Workers 1.2/s to 2.8/s.",
      );
      expect(screen.text('[data-upgrade="cartSyn"] .upgrade-name')).toBe(
        "Helping hands",
      );
      expect(screen.text('[data-upgrade="cartSyn"] .upgrade-effect')).toMatch(
        /^Carts \S+\/s to \S+\/s\.$/,
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
      "Your crew mines 339 stones a second",
    );
    screen.progress.previewTrouble("cart");
    expect(cart.dataset["trouble"]).toBe("cave-in");
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe("Cave-in!");
    expect(screen.text(".crew-status")).toBe(
      "Your crew mines 338 stones a second",
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
      "Your crew mines 339 stones a second",
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
    carts: 2,
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

  it("keeps Engineers on the bar, and opens the sheet once a borer arrives", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(10_000_000),
        pocket: 10_000_000,
        helpers: 4,
        drills: 1,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const button =
      screen.root.querySelector<HTMLButtonElement>(".engineers-button");
    expect(button?.hidden).toBe(false);
    expect(button?.textContent).toContain("Engineers");
    button?.click();
    expect(
      screen.root.querySelector(".engineers-dialog")?.hasAttribute("hidden"),
    ).toBe(true);
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
      "+435\u2009·\u2009435/s · Needs 8 workers",
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
      "Ada is tending the borers: +78 stones/sec.",
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
      "+357\u2009·\u2009357/s · Needs 8 workers",
    );
    expect(screen.text('[data-tier="cart"] .tier-rate')).toBe(
      "+6.8\u2009·\u200913/s · Needs 1 worker",
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
      "+6\u2009·\u200912/s · Needs 1 worker",
    );

    ada?.querySelector<HTMLButtonElement>('[data-post="cart"]')?.click();
    (cart as HTMLButtonElement | null)?.click();
    expect(screen.text('[data-tier="cart"] .tier-count')).toBe("×3");
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
    expect(screen.text(".engineer-promote")).toBe("Promote: 2M stones");
    expect(screen.text(".engineer-promote-why")).toBe(
      "A new engineer can tend another machine or explore while the others work.",
    );
    expect(screen.text(".engineer-promote-why")).not.toMatch(/\d|\?/);
    const promoteWhy = sheet.querySelector(".engineer-promote-why");
    promoteWhy?.dispatchEvent(
      new PointerEvent("pointerdown", {
        bubbles: true,
        clientX: 2,
        clientY: 2,
        button: 0,
      }),
    );
    promoteWhy?.dispatchEvent(
      new PointerEvent("pointerup", {
        bubbles: true,
        clientX: 2,
        clientY: 2,
        button: 0,
      }),
    );
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
    expect(screen.text(".pocket")).toBe("5M stones");

    sheet.querySelector<HTMLButtonElement>(".engineer-promote")?.click();
    sheet.querySelector<HTMLButtonElement>(".engineer-confirm-no")?.click();
    expect(sheet.querySelector<HTMLElement>(".engineer-confirm")?.hidden).toBe(
      true,
    );
    expect(screen.text('[data-tier="helper"] .tier-count')).toBe("×20");

    sheet.querySelector<HTMLButtonElement>(".engineer-promote")?.click();
    sheet.querySelector<HTMLButtonElement>(".engineer-confirm-yes")?.click();
    expect(screen.text(".pocket")).toBe("3M stones");
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
    const back = sheet.querySelector<HTMLButtonElement>(".engineers-close");
    expect(back?.textContent).toBe("Back to the mountain");
    expect(back?.parentElement?.lastElementChild).toBe(back);
    back?.click();
    expect(sheet.hidden).toBe(true);
  });

  it("does not cheer when Step up is no longer affordable", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda(),
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    sheet.querySelector<HTMLButtonElement>(".engineer-promote")?.click();
    expect(sheet.querySelector<HTMLElement>(".engineer-confirm")?.hidden).toBe(
      false,
    );
    screen.progress.applyMutation((current) => ({ ...current, pocket: 0 }));
    sheet.querySelector<HTMLButtonElement>(".engineer-confirm-yes")?.click();
    expect(screen.text(".engineer-toast")).toBe("");
    expect(sheet.querySelector<HTMLElement>(".engineer-toast")?.hidden).toBe(
      true,
    );
    expect(screen.progress.getSnapshot().mountain.engineers).toEqual([
      { name: "Ada", rank: 0, trips: 0, post: "borer" },
    ]);
    expect(screen.progress.getSnapshot().mountain.pocket).toBe(0);
    expect(screen.progress.getSnapshot().mountain.helpers).toBe(20);
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
    expect(promote?.textContent).toBe("Promote: 2M stones");
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
    expect(screen.text(".engineer-promote")).toBe("Promote: 2M stones");
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
