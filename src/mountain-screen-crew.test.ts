// @vitest-environment happy-dom
import { BOOSTS, boostById, boostCost } from "./boosts";
import { promoteCost } from "./engineers";
import { send } from "./expeditions";
import {
  BAND_STARTS,
  kidStretch,
  shownStones,
  stonesLeft,
  stretch,
} from "./scale";
import { formatCompact, formatCount } from "./format";
import { effectiveRates } from "./rates";
import { odometerFace } from "./odometer";
import { RELICS } from "./relics";
import { readSessionSave, writeSessionSave } from "./session-save";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import { SESSION_SAVE_KEY } from "./session-save";
import { FIX_HOLD_MS } from "./hazards";
import {
  ENGINEER_WELCOME,
  NEEDS_MORE_WORKERS,
  promoteNeeds,
  promoteOffer,
  troubleAria,
  upgradeEffectLine,
  upgradeWhyLine,
} from "./screen-words";
import { createMemoryAuth } from "./auth";
import { type CloudLoadResult, type CloudSave } from "./cloud-save";
import { BUYS_SETTLE_MS, showAppUpdate } from "./mountain-screen";
import { shownRows, upgradeRowId } from "./upgrade-reveal";
import { minedMountain, unstaffedSave } from "./test-fixtures";
import { tierById, tierCost, tierQuote } from "./tiers";
import { UPGRADES, upgradeById, upgradeCost, type UpgradeId } from "./upgrades";
import { upgradesOrder } from "./upgrades-panel";
import { LOST_TOOLS } from "./lost-tools";
import {
  DETAIL_PAGE,
  LEDGER_SHEET,
  LEGEND_PAGE,
  RELICS_GOAL,
  RELICS_SHEET,
  REVEAL_PAGE,
  SHELF_ROWS,
  STONES_NAME,
  createMemoryStorage,
  mountScreen,
  relicPage,
  setReducedMotion,
  shelfShown,
  signedIn,
  stopScreens,
} from "./mountain-screen.harness";
import { RELIC_LIT } from "./board-relics";
import { KEEPSAKE_ART } from "./relic-pages";

/** An upgrade level's stone price on a Topsoil first run (k = 1). */
function upgradePrice(id: UpgradeId, level = 0): number {
  const price = upgradeCost(upgradeById(id), level);
  if (price === undefined) {
    throw new Error(`${id} has no level ${String(level)}`);
  }
  return price;
}

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

  it("shows each tier's output per unit", () => {
    const screen = mountScreen({ storage: seededCrew() });
    expect(screen.text('.tier[data-tier="helper"] .board-row-gain')).toBe(
      "+1/s",
    );
    expect(screen.text('.tier[data-tier="cart"] .board-row-gain')).toBe("+6/s");
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
    // 150 carts hold five marks: 6 × 32 each.
    expect(big.text('.tier[data-tier="cart"] .board-row-gain')).toBe("+192/s");
  });

  it("counts the crew line up after a bought cart", async () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      const screen = mountScreen({ storage: seededCrew() });
      const cart = screen.root.querySelector<HTMLButtonElement>(
        '.tier[data-tier="cart"]',
      );
      cart?.click();
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
      expect(screen.text('.tier[data-tier="cart"] .board-row-gain')).toBe(
        "+6/s",
      );
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });

  it("reads the crew's stones on the gauge every second, with no float over the window (#371)", async () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      const screen = mountScreen({ storage: seededCrew() });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(screen.root.querySelector(".crew-float")).toBeNull();
      expect(
        screen.root.querySelector(".board-gauge")?.getAttribute("aria-label"),
      ).toBe("Output: 22 stones a second");
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });

  it("shows a tap's own yield where it landed, apart from the crew's", () => {
    setReducedMotion(false);
    const screen = mountScreen({ storage: seededCrew() });
    screen.dig.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    const tap = screen.root.querySelector<HTMLElement>(
      ".board-mine .board-dig-plus",
    );
    expect(tap?.textContent).toBe("+1");
    expect(tap?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.root.querySelector(".crew-float")).toBeNull();
    setReducedMotion(true);
  });

  it("floats the stones a tap added to the pocket in a deep band (#356)", () => {
    setReducedMotion(false);
    const storage = createMemoryStorage();
    const deep = {
      ...minedMountain(BAND_STARTS[2] + 1_000),
      helpers: 400,
      carts: 300,
      upgrades: { tap: 1 },
    };
    storage.setItem(
      SESSION_SAVE_KEY,
      JSON.stringify({ version: 5, mountain: deep, lastSeen: Date.now() }),
    );
    const screen = mountScreen({ storage });
    const yieldStones = effectiveRates(deep).tapYield;
    expect(yieldStones).toBeGreaterThan(1);
    screen.dig.dispatchEvent(
      new MouseEvent("click", { bubbles: true, detail: 1 }),
    );
    expect(screen.root.querySelector(".board-dig-plus")?.textContent).toBe(
      `+${formatCount(yieldStones)}`,
    );
    setReducedMotion(true);
  });

  it("skips counting with reduced motion", async () => {
    vi.useFakeTimers();
    setReducedMotion(true);
    try {
      const screen = mountScreen({ storage: seededCrew() });
      const cart = screen.root.querySelector<HTMLButtonElement>(
        '.tier[data-tier="cart"]',
      );
      cart?.click();
      expect(screen.text(".crew-status")).toBe(
        "Your crew mines 28 stones a second",
      );
      await vi.advanceTimersByTimeAsync(1_000);
      expect(screen.root.querySelector(".crew-float")).toBeNull();
      screen.dig.click();
      // A dig still shows its "+N" under reduced motion; it just does not rise.
      const plus = screen.root.querySelector<HTMLElement>(".board-dig-plus");
      expect(plus?.hidden).toBe(false);
      expect(plus?.textContent).toBe("+1");
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });
});

describe("the Buys drawer (#373)", () => {
  const CLOCK = 1_700_000_000_000;
  const seededWith = (mountain: Mountain, at = CLOCK) => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain, lastSeen: at });
    return storage;
  };
  /** play's early save: a crewed Topsoil, 18 workers and 6 carts. */
  const early = (over: Partial<Mountain> = {}): Mountain => ({
    ...minedMountain(500_000),
    pocket: 6_854,
    helpers: 18,
    carts: 6,
    ...over,
  });
  /** Granite with no borer yet: the borer opens but the crew is short of hands. */
  const shortMountain = (): Mountain => ({
    ...minedMountain(12_000_000),
    pocket: 50_000_000,
    helpers: 12,
    carts: 6,
    drills: 4,
  });
  const drawerOf = (screen: ReturnType<typeof mountScreen>) => {
    const drawer = screen.root.querySelector<HTMLElement>(
      '.board-sheet[data-sheet="buys"]',
    );
    if (drawer === null) throw new Error("no Buys drawer");
    return drawer;
  };
  const isOpen = (screen: ReturnType<typeof mountScreen>) =>
    drawerOf(screen).classList.contains("is-open");
  const rowOf = (screen: ReturnType<typeof mountScreen>, tier: string) => {
    const row = drawerOf(screen).querySelector(
      `button.board-row.tier[data-tier="${tier}"]`,
    );
    if (!(row instanceof HTMLButtonElement)) throw new Error(`no ${tier} row`);
    return row;
  };
  const partOf = (row: HTMLElement, part: string) =>
    row.querySelector<HTMLElement>(`.board-row-${part}`)?.textContent;
  const lampOf = (row: HTMLElement) =>
    row.querySelector<HTMLElement>(".board-lamp")?.style.backgroundPositionX;
  const openBuys = (screen: ReturnType<typeof mountScreen>): void => {
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
      ?.click();
  };
  // A finger: the press, the lift, then the click it makes.
  const fingerTap = (target: HTMLElement): void => {
    target.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    target.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, button: 0 }),
    );
    target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  };
  const kick = (screen: ReturnType<typeof mountScreen>) =>
    drawerOf(screen).querySelector(".board-sheet-kick")?.textContent;

  it("Buys opens as a drawer", () => {
    const screen = mountScreen({
      storage: seededWith(early()),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    expect(isOpen(screen)).toBe(false);
    screen.root
      .querySelector<HTMLButtonElement>('.board-bay[data-tier="cart"]')
      ?.click();
    expect(isOpen(screen)).toBe(true);
    const drawer = drawerOf(screen);
    expect(drawer.querySelector(".board-sheet-title")?.textContent).toBe(
      "Buys",
    );
    expect(kick(screen)).toBe("Crew and machines that mine while you rest");
    // The list in order: Crew, the crew line, the worker, Machines, the machines.
    const list = drawer.querySelector(".board-sheet-list");
    const order = [...(list?.children ?? [])]
      .filter((part) => !(part as HTMLElement).hidden)
      .map((part) =>
        part.classList.contains("board-sec")
          ? `sec:${part.textContent}`
          : part.classList.contains("crew")
            ? "crew"
            : part.classList.contains("board-row")
              ? `row:${(part as HTMLElement).dataset["tier"] ?? ""}`
              : (part.className.split(" ")[0] ?? ""),
      );
    expect(order).toEqual([
      "sec:Crewper sec",
      "crew",
      "row:helper",
      "sec:Machines",
      "row:cart",
      "row:drill",
      "board-spare",
    ]);
    // The footnote stands under the list, over Back, out of the list's scroll (#373).
    const footer = drawer.querySelector(".board-sheet-footer");
    expect(
      [...(footer?.children ?? [])].map(
        (part) => part.className.split(" ")[0] ?? "",
      ),
    ).toEqual(["board-sheet-foot", "board-platebtn"]);
    expect(
      drawer.querySelector("section.crew")?.getAttribute("aria-label"),
    ).toBe("Your crew");
    expect(drawer.querySelector(".board-sheet-foot")?.textContent).toBe(
      "Ready now offers the biggest machine your free workers can run and you can afford. It saves for the next one when nothing is affordable, offers a worker only when no hand is free, and never buys for you.",
    );
    // Every row is a board row with its board art, never today's card.
    expect(
      rowOf(screen, "helper").querySelector("img")?.getAttribute("src"),
    ).toMatch(/mach-worker/);
    expect(
      rowOf(screen, "cart").querySelector("img")?.getAttribute("src"),
    ).toMatch(/mach-cart/);
    expect(
      drawer.querySelector(".sheet-card, .tier-count, .float-gain"),
    ).toBeNull();
    expect(screen.root.querySelector(".buys-dialog")).toBeNull();
    screen.root.remove();
  });

  it("the footnote steps aside on an open drawer whose list it would push into a scroll (#373)", () => {
    const screen = mountScreen({
      storage: seededWith(early()),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    const drawer = drawerOf(screen);
    const list = drawer.querySelector<HTMLElement>(".board-sheet-list");
    const foot = drawer.querySelector<HTMLElement>(".board-sheet-foot");
    if (list === null || foot === null) throw new Error("no list or footnote");
    const scroll = vi.spyOn(list, "scrollHeight", "get").mockReturnValue(400);
    vi.spyOn(list, "clientHeight", "get").mockReturnValue(480);
    openBuys(screen);
    // The list fits with it: it stays.
    expect(foot.hidden).toBe(false);
    drawer.querySelector<HTMLButtonElement>(".board-sheet-back")?.click();
    // A mid-game list that would scroll with the footnote under it: it gives the room back.
    scroll.mockReturnValue(531);
    openBuys(screen);
    expect(foot.hidden).toBe(true);
    // A render while open keeps it aside; shut, it comes back for the next open to measure.
    screen.progress.applyMutation((m) => ({ ...m, pocket: m.pocket + 1 }));
    expect(foot.hidden).toBe(true);
    drawer.querySelector<HTMLButtonElement>(".board-sheet-back")?.click();
    expect(foot.hidden).toBe(false);
    screen.root.remove();
  });

  it("the four row states at once", () => {
    const screen = mountScreen({
      storage: seededWith(early()),
      now: () => CLOCK,
    });
    const cart = rowOf(screen, "cart");
    expect(cart.classList.contains("is-ready")).toBe(true);
    expect(cart.classList.contains("is-pick")).toBe(true);
    expect(lampOf(cart)).toBe("-40px");
    expect(partOf(cart, "flag")).toBe("Ready now");
    expect(rowOf(screen, "drill").classList.contains("is-dear")).toBe(true);
    const borer = rowOf(screen, "borer");
    expect(borer.classList.contains("is-locked")).toBe(true);
    expect(partOf(borer, "price")).toBe("Locked");
    const short = mountScreen({
      storage: seededWith(shortMountain()),
      now: () => CLOCK,
    });
    const shortBorer = rowOf(short, "borer");
    expect(shortBorer.hidden).toBe(false);
    expect(shortBorer.classList.contains("is-short")).toBe(true);
    expect(partOf(shortBorer, "need")).toBe("Needs 8 workers");
    expect(shortBorer.querySelector("img")?.getAttribute("src")).toMatch(
      /mach-borer-tarp/,
    );
  });

  it("a finger that landed in the settle buys nothing, even when a busy page hands it over after (#373)", () => {
    let clock = 10_000;
    const screen = mountScreen({
      storage: seededWith(early({ pocket: 1_000_000 })),
      now: () => CLOCK,
      tapClock: () => clock,
      // Every press waited 100ms in the queue before its handler ran.
      pressAge: () => 100,
    });
    openBuys(screen);
    clock += BUYS_SETTLE_MS + 50;
    const carts = () => screen.progress.getSnapshot().mountain.carts;
    const before = carts();
    fingerTap(rowOf(screen, "cart"));
    expect(carts()).toBe(before);
    clock += 100;
    fingerTap(rowOf(screen, "cart"));
    expect(carts()).toBe(before + 1);
  });

  describe("×10 and Max (#358)", () => {
    const amountKey = (screen: ReturnType<typeof mountScreen>) => {
      const key = drawerOf(screen).querySelector(
        ".board-sheet-head .buy-amount",
      );
      if (!(key instanceof HTMLButtonElement)) throw new Error("no amount key");
      return key;
    };
    const carts = (screen: ReturnType<typeof mountScreen>) =>
      screen.progress.getSnapshot().mountain.carts;

    it("one key in the Buys header cycles ×1, ×10 and Max, and each row buys that many", () => {
      let clock = 10_000;
      const storage = seededWith(early({ pocket: 10_000_000 }));
      const screen = mountScreen({
        storage,
        now: () => CLOCK,
        tapClock: () => clock,
      });
      openBuys(screen);
      const key = amountKey(screen);
      expect(key.textContent).toBe("×1");
      // The second tap of the double tap that opened Buys changes nothing.
      fingerTap(key);
      expect(key.textContent).toBe("×1");
      clock += BUYS_SETTLE_MS + 100;

      fingerTap(key);
      expect(key.textContent).toBe("×10");
      expect(key.getAttribute("aria-label")).toBe(
        "Buys ten a tap. Tap for as many as you can afford.",
      );
      const cart = rowOf(screen, "cart");
      const mountain = screen.progress.getSnapshot().mountain;
      const ten = tierQuote(mountain, tierById("cart"), "ten");
      expect(partOf(cart, "verb")).toBe("Buy 10");
      expect(partOf(cart, "price")).toBe(formatCompact(ten.cost));
      fingerTap(cart);
      expect(carts(screen)).toBe(16);
      expect(screen.progress.getSnapshot().mountain.pocket).toBe(
        mountain.pocket - ten.cost,
      );

      clock += 2_000;
      fingerTap(key);
      expect(key.textContent).toBe("Max");
      const worker = rowOf(screen, "helper");
      const max = tierQuote(
        screen.progress.getSnapshot().mountain,
        tierById("helper"),
        "max",
      );
      expect(max.count).toBeGreaterThan(1);
      expect(partOf(worker, "verb")).toBe(`Hire ${String(max.count)}`);
      fingerTap(worker);
      expect(screen.progress.getSnapshot().mountain.helpers).toBe(
        18 + max.count,
      );

      clock += 2_000;
      fingerTap(key);
      expect(key.textContent).toBe("×1");
      expect(partOf(rowOf(screen, "cart"), "verb")).toBe("Buy");
    });

    it("a press on the key that never clicked is dropped when the drawer moves on", () => {
      let clock = 10_000;
      const screen = mountScreen({
        storage: seededWith(early()),
        now: () => CLOCK,
        tapClock: () => clock,
      });
      openBuys(screen);
      clock += BUYS_SETTLE_MS + 100;
      // A finger lands on the key and slides off: no click. Escape shuts the drawer.
      amountKey(screen).dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      clock += 1_000;
      openBuys(screen);
      clock += BUYS_SETTLE_MS + 100;
      // A finger's click whose pointerdown landed elsewhere is judged by its own age, never by
      // the old finger-down from before this open.
      amountKey(screen).dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
      expect(amountKey(screen).textContent).toBe("×10");
    });

    it("the amount is remembered on this device", () => {
      let clock = 10_000;
      const storage = seededWith(early({ pocket: 10_000_000 }));
      const first = mountScreen({
        storage,
        now: () => CLOCK,
        tapClock: () => clock,
      });
      openBuys(first);
      clock += BUYS_SETTLE_MS + 100;
      fingerTap(amountKey(first));
      expect(amountKey(first).textContent).toBe("×10");
      const again = mountScreen({ storage, now: () => CLOCK });
      expect(amountKey(again).textContent).toBe("×10");
      expect(partOf(rowOf(again, "cart"), "verb")).toBe("Buy 10");
    });

    it("a store that throws starts at ×1 and still plays", () => {
      const storage = seededWith(early());
      const screen = mountScreen({
        storage,
        now: () => CLOCK,
        deviceStorage: {
          getItem: () => {
            throw new Error("private mode");
          },
          setItem: () => {
            throw new Error("private mode");
          },
        },
      });
      expect(amountKey(screen).textContent).toBe("×1");
    });
  });

  it("Done holds the row", () => {
    vi.useFakeTimers();
    try {
      let clock = 10_000;
      const screen = mountScreen({
        storage: seededWith(early({ pocket: 1_000_000 })),
        now: () => CLOCK,
        tapClock: () => clock,
      });
      openBuys(screen);
      clock += BUYS_SETTLE_MS + 100;
      const cart = rowOf(screen, "cart");
      const carts = () => screen.progress.getSnapshot().mountain.carts;
      cart.click();
      cart.click();
      expect(carts()).toBe(7);
      expect(partOf(cart, "verb")).toBe("Done");
      expect(cart.getAttribute("aria-label")).toBe("Mine cart. Done");
      // The hold ends on the board's own clock: move it with the timers.
      clock += 1_800;
      vi.advanceTimersByTime(1_800);
      cart.click();
      expect(carts()).toBe(7);
      clock += 150;
      vi.advanceTimersByTime(150);
      expect(partOf(cart, "verb")).toBe("Buy");
      cart.click();
      expect(carts()).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a row's Done hold holds a press whose finger came down inside it, handled after it ended", () => {
    vi.useFakeTimers();
    try {
      let clock = 10_000;
      let age = 0;
      const screen = mountScreen({
        storage: seededWith(early({ pocket: 1_000_000 })),
        now: () => CLOCK,
        tapClock: () => clock,
        pressAge: () => age,
      });
      openBuys(screen);
      clock += BUYS_SETTLE_MS + 100;
      const cart = rowOf(screen, "cart");
      const carts = () => screen.progress.getSnapshot().mountain.carts;
      cart.click();
      expect(carts()).toBe(7);
      // A busy phone: the finger came down 1.8s into the hold, and the page got to the press
      // 0.1s after the hold ended.
      clock += 2_000;
      vi.advanceTimersByTime(2_000);
      expect(partOf(cart, "verb")).toBe("Buy");
      age = 200;
      fingerTap(cart);
      expect(carts()).toBe(7);
      // A press of its own after the hold buys.
      age = 0;
      fingerTap(cart);
      expect(carts()).toBe(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a dear tap blinks", () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      let clock = 10_000;
      const screen = mountScreen({
        storage: seededWith(early()),
        now: () => CLOCK,
        tapClock: () => clock,
      });
      openBuys(screen);
      clock += BUYS_SETTLE_MS + 100;
      const drill = rowOf(screen, "drill");
      const pocket = screen.progress.getSnapshot().mountain.pocket;
      fingerTap(drill);
      expect(lampOf(drill)).toBe("-120px");
      // The blink runs on the board's own clock: move it with the timers.
      clock += 140;
      vi.advanceTimersByTime(140);
      expect(lampOf(drill)).toBe("0px");
      expect(screen.progress.getSnapshot().mountain.pocket).toBe(pocket);
      expect(screen.progress.getSnapshot().mountain.drills).toBe(0);
      // A locked row blinks too, and buys nothing.
      clock += 1_000;
      vi.advanceTimersByTime(1_000);
      const borer = rowOf(screen, "borer");
      borer.click();
      expect(lampOf(borer)).toBe("-120px");
      expect(screen.progress.getSnapshot().mountain.borers).toBe(0);
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });

  it("under reduced motion a dear tap in a drawer spends nothing and never paints its lamp red", () => {
    vi.useFakeTimers();
    try {
      let clock = 10_000;
      const screen = mountScreen({
        storage: seededWith(early()),
        now: () => CLOCK,
        tapClock: () => clock,
      });
      const buysKey = screen.root.querySelector<HTMLButtonElement>(
        ".board-key[data-key=buys]",
      );
      if (buysKey === null) throw new Error("no Buys key");
      fingerTap(buysKey);
      clock += BUYS_SETTLE_MS + 100;
      const drill = rowOf(screen, "drill");
      expect(drill.classList.contains("is-dear")).toBe(true);
      const lamp = () => lampOf(drill);
      const rest = lamp();
      expect(rest).not.toBe("-120px");
      const before = screen.progress.getSnapshot().mountain;
      drill.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      drill.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
      const lamps = [lamp()];
      for (let frame = 0; frame < 10; frame += 1) {
        clock += 70;
        vi.advanceTimersByTime(70);
        lamps.push(lamp());
      }
      expect(lamps.every((each) => each === rest)).toBe(true);
      expect(screen.progress.getSnapshot().mountain.pocket).toBe(before.pocket);
      expect(screen.progress.getSnapshot().mountain.drills).toBe(before.drills);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a short row still buys, and a machine stands idle", () => {
    const screen = mountScreen({
      storage: seededWith(shortMountain()),
      now: () => CLOCK,
    });
    const borer = rowOf(screen, "borer");
    expect(borer.classList.contains("is-short")).toBe(true);
    borer.click();
    const after = screen.progress.getSnapshot().mountain;
    expect(after.borers).toBe(1);
    expect(effectiveRates(after, CLOCK).helpersShort).toBeGreaterThan(0);
    expect(screen.text(".crew-status")).toMatch(
      /^[\d.,K]+\/s · \d+ idle, need \d+ workers?$/,
    );
  });

  it("trouble on a row", async () => {
    vi.useFakeTimers();
    try {
      let clock = 10_000;
      const era: Mountain = {
        ...minedMountain(130_000_000),
        pocket: 50_000_000,
        helpers: 60,
        carts: 4,
        drills: 2,
        borers: 1,
        machines: 1,
      };
      const screen = mountScreen({
        storage: seededWith(era),
        now: () => CLOCK,
        tapClock: () => clock,
      });
      screen.progress.previewTrouble("cart");
      const cart = rowOf(screen, "cart");
      expect(cart.dataset["trouble"]).toBe("cave-in");
      expect(cart.classList.contains("is-trouble")).toBe(true);
      expect(partOf(cart, "info")).toBe("Cave-in! · Hold to fix");
      expect(cart.getAttribute("aria-label")).toBe(
        troubleAria("cave-in", tierById("cart")),
      );
      // Opened by a bay, the early press on the troubled row still counts.
      openBuys(screen);
      fingerTap(cart);
      for (let tap = 0; tap < 3; tap += 1) cart.click();
      expect(screen.progress.getSnapshot().trouble?.kind).toBe("cave-in");
      cart.click();
      expect(screen.progress.getSnapshot().trouble).toBeUndefined();
      expect(screen.progress.getSnapshot().mountain.carts).toBe(4);
      expect(kick(screen)).toBe("Fixed! The crew cheers.");
      expect(
        drawerOf(screen)
          .querySelector(".board-sheet-kick")
          ?.classList.contains("is-done"),
      ).toBe(true);
      // The thanks ends on the board's own clock: move it with the timers.
      clock += 1_600;
      await vi.advanceTimersByTimeAsync(1_600);
      expect(kick(screen)).toBe("Crew and machines that mine while you rest");
      expect(cart.dataset["trouble"]).toBeUndefined();
      // A hold fixes it, and the click that ends the hold does nothing.
      clock += 1_000;
      screen.progress.previewTrouble("cart");
      cart.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      await vi.advanceTimersByTimeAsync(FIX_HOLD_MS);
      expect(screen.progress.getSnapshot().trouble).toBeUndefined();
      expect(kick(screen)).toBe("Fixed! The crew cheers.");
      cart.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, button: 0 }),
      );
      cart.click();
      expect(screen.progress.getSnapshot().mountain.carts).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the Crew section", () => {
    const screen = mountScreen({
      storage: seededWith({
        ...minedMountain(500_000),
        helpers: 18,
        carts: 6,
        staffed: 2,
        legacy: 1,
      }),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    const section = drawerOf(screen).querySelector("section.crew");
    const posts = section?.querySelector<HTMLElement>(".crew-posts");
    if (!(posts instanceof HTMLElement)) throw new Error("no crew posts");
    // Text, not a door.
    expect(posts.tagName).toBe("P");
    expect(section?.querySelector("button")).toBeNull();
    expect(section?.querySelector(".crew-status")?.textContent).toMatch(
      /^Your crew mines \d+ stones a second$/,
    );
    // Grandpa's chip on the heir's run, and the chips have no faces.
    const chips = [...posts.querySelectorAll(".crew-bit")].map(
      (chip) => chip.textContent,
    );
    expect(chips).toContain("Grandpa on carts");
    expect(posts.querySelector("img")).toBeNull();
    // A paragraph takes no name: the full sentence is spoken from hidden text, and the chips,
    // which say it again in short, are not.
    expect(posts.hasAttribute("aria-label")).toBe(false);
    expect(posts.querySelector(".crew-posts-words")?.textContent).toContain(
      "Grandpa tends the carts",
    );
    for (const line of posts.querySelectorAll(".crew-row")) {
      expect(line.getAttribute("aria-hidden")).toBe("true");
    }
    // The chips lay out on open, on the drawer's real width.
    expect(posts.querySelectorAll(".crew-row").length).toBe(1);
    Object.defineProperty(posts, "clientWidth", {
      configurable: true,
      get: () => 40,
    });
    Object.defineProperty(posts, "scrollWidth", {
      configurable: true,
      get: () => 280,
    });
    openBuys(screen);
    expect(posts.querySelectorAll(".crew-row").length).toBeGreaterThan(1);
    screen.root.remove();
  });

  it("kids", () => {
    const withCrown = mountScreen({
      storage: seededWith({
        ...minedMountain(130_000_000),
        pocket: 1e12,
        helpers: 200,
        carts: 20,
        drills: 10,
        borers: 5,
        machines: 1,
      }),
      now: () => CLOCK,
    });
    const kid = rowOf(withCrown, "kid");
    expect(kid.hidden).toBe(false);
    expect(partOf(kid, "name")).toBe("Kid worker");
    expect(kid.querySelector("img")?.getAttribute("src")).toMatch(
      /mach-kid\.png|mach-kid(?!-dim)/,
    );
    expect(kid.querySelector("img")?.getAttribute("src")).not.toMatch(/dim/);
    kid.click();
    expect(withCrown.progress.getSnapshot().mountain.kids).toBe(1);
    const noCrown = mountScreen({
      storage: seededWith({
        ...minedMountain(50_000_000),
        pocket: 1e12,
        helpers: 200,
        carts: 20,
        drills: 10,
        borers: 5,
        machines: 1,
      }),
      now: () => CLOCK,
    });
    const dim = rowOf(noCrown, "kid");
    expect(dim.hidden).toBe(false);
    expect(dim.querySelector("img")?.getAttribute("src")).toMatch(
      /mach-kid-dim/,
    );
    expect(partOf(dim, "price")).toBe("Locked");
    expect(dim.classList.contains("is-locked")).toBe(true);
  });

  it("the i card", () => {
    const screen = mountScreen({
      storage: seededWith(early()),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    openBuys(screen);
    const drawer = drawerOf(screen);
    const list = drawer.querySelector<HTMLElement>(".board-sheet-list");
    drawer.querySelector<HTMLButtonElement>(".board-sheet-info")?.click();
    expect(list?.hidden).toBe(true);
    const how = drawer.querySelector<HTMLElement>(".board-sheet-how");
    expect(how?.hidden).toBe(false);
    const cards = [...(how?.querySelectorAll<HTMLElement>(".teach-how") ?? [])];
    expect(cards.map((card) => card.dataset["how"])).toEqual([
      "staffing",
      "layers",
    ]);
    expect(
      cards.map((card) => card.querySelector(".teach-how-title")?.textContent),
    ).toEqual([
      "How it works · Staffing",
      "How it works · Layers and hardness",
    ]);
    // Board art at 2x: the machines and the worker are 64px.
    expect(
      cards[0]?.querySelectorAll('img[width="64"]').length,
    ).toBeGreaterThan(0);
    expect(how?.scrollHeight ?? 0).toBeLessThanOrEqual(how?.clientHeight ?? 0);
    const backs = [
      ...(how?.querySelectorAll<HTMLButtonElement>(".teach-how-back") ?? []),
    ].filter((back) => !back.hidden);
    expect(backs.map((back) => back.textContent)).toEqual(["Back to Buys"]);
    backs[0]?.click();
    expect(how?.hidden).toBe(true);
    expect(list?.hidden).toBe(false);
    expect(isOpen(screen)).toBe(true);
    screen.root.remove();
  });

  it("a pocket that fell buys nothing and blinks", () => {
    setReducedMotion(false);
    try {
      const screen = mountScreen({
        storage: seededWith(early()),
        now: () => CLOCK,
      });
      const cart = rowOf(screen, "cart");
      expect(cart.classList.contains("is-can")).toBe(true);
      const real = screen.progress.getSnapshot();
      const read = vi.spyOn(screen.progress, "getSnapshot").mockReturnValue({
        ...real,
        mountain: { ...real.mountain, pocket: 0 },
      });
      const apply = vi.spyOn(screen.progress, "applyMutation");
      cart.click();
      expect(apply).not.toHaveBeenCalled();
      read.mockRestore();
      expect(lampOf(cart)).toBe("-120px");
      expect(screen.progress.getSnapshot().mountain.carts).toBe(6);
    } finally {
      setReducedMotion(true);
    }
  });

  it("while the save loads again, the open drawer stays open with its rows dark", async () => {
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
      storage: seededWith(early()),
      now: () => CLOCK,
    });
    openBuys(screen);
    expect(partOf(rowOf(screen, "cart"), "price")).not.toBe("");
    const openParts = listParts(screen);
    await auth.signIn();
    await Promise.resolve();
    expect(screen.progress.getSnapshot().ready).toBe(false);
    expect(isOpen(screen)).toBe(true);
    const rows = [
      ...drawerOf(screen).querySelectorAll<HTMLButtonElement>(
        "button.board-row",
      ),
    ];
    expect(rows.length).toBe(6);
    // The Crew section and its legend keep their boxes, blank: nothing moves, nothing of the
    // old save shows.
    const crewBox = drawerOf(screen).querySelector<HTMLElement>("section.crew");
    const crewLegend = drawerOf(screen).querySelector<HTMLElement>(
      '.board-sec[data-sec="crew"]',
    );
    expect(crewBox?.hidden).toBe(false);
    expect(crewLegend?.hidden).toBe(false);
    expect(crewBox?.classList.contains("is-blank")).toBe(true);
    expect(crewLegend?.classList.contains("is-blank")).toBe(true);
    expect(listParts(screen)).toEqual(openParts);
    for (const row of rows) {
      expect(row.disabled).toBe(true);
      expect(partOf(row, "price")).toBe("");
      expect(row.dataset["trouble"]).toBeUndefined();
    }
    finishLoad({ kind: "found", mountain: early() });
    await Promise.resolve();
    expect(isOpen(screen)).toBe(true);
    expect(rowOf(screen, "cart").disabled).toBe(false);
    expect(partOf(rowOf(screen, "cart"), "price")).not.toBe("");
    expect(
      drawerOf(screen)
        .querySelector<HTMLElement>("section.crew")
        ?.classList.contains("is-blank"),
    ).toBe(false);
  });

  it("a tap on the mine window or a still vein while the save loads again digs nothing", async () => {
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: () => () => undefined,
    };
    const auth = createMemoryAuth();
    const screen = mountScreen({
      auth,
      cloudSave,
      storage: seededWith(early()),
      now: () => CLOCK,
    });
    await auth.signIn();
    await Promise.resolve();
    expect(screen.progress.getSnapshot().ready).toBe(false);
    const apply = vi.spyOn(screen.progress, "applyMutation");
    screen.root.querySelector<HTMLButtonElement>(".board-window")?.click();
    // A vein that is not glinting pays nothing either, even to a click that reaches it.
    screen.root.querySelector<HTMLElement>(".golden-vein")?.click();
    // Nothing is dug from a save not yet read, and the window shows no "+N".
    expect(apply).not.toHaveBeenCalled();
    expect(
      screen.root.querySelector(".board-dig-plus:not([hidden])")?.textContent ??
        "",
    ).toBe("");
  });

  /** The Deep Heart after the Hammer, one Great Machine short: the kid row waits for it. */
  const machineShort = (): Mountain => ({
    ...minedMountain(130_000_000),
    pocket: tierCost(tierById("machine"), 0) + 1_000,
    helpers: 60,
    carts: 10,
    drills: 6,
    borers: 2,
    staffed: 2,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
  });
  const listParts = (screen: ReturnType<typeof mountScreen>) =>
    [
      ...(drawerOf(screen).querySelector(".board-sheet-list")?.children ?? []),
    ].map(
      (part) =>
        `${part.className.split(" ")[0] ?? ""}:${String((part as HTMLElement).hidden)}`,
    );
  const chipsOf = (screen: ReturnType<typeof mountScreen>) => {
    const posts = drawerOf(screen).querySelector<HTMLElement>(".crew-posts");
    if (posts === null) throw new Error("no crew posts");
    return posts;
  };

  it("rows hold their places while the drawer is open: a first Great Machine waits to show the kid", () => {
    vi.useFakeTimers();
    try {
      let clock = 10_000;
      const screen = mountScreen({
        storage: seededWith(machineShort()),
        now: () => CLOCK,
        tapClock: () => clock,
      });
      document.body.append(screen.root);
      const posts = chipsOf(screen);
      Object.defineProperty(posts, "clientWidth", {
        configurable: true,
        get: () => 400,
      });
      let wide = 300;
      Object.defineProperty(posts, "scrollWidth", {
        configurable: true,
        get: () => wide,
      });
      openBuys(screen);
      clock += BUYS_SETTLE_MS + 100;
      const before = listParts(screen);
      const chipRows = posts.querySelectorAll(".crew-row").length;
      const chips = posts.querySelectorAll(".crew-bit").length;
      expect(rowOf(screen, "kid").hidden).toBe(true);
      // The machine's own chip would wrap the line: it waits for the next open.
      wide = 500;
      fingerTap(rowOf(screen, "machine"));
      expect(screen.progress.getSnapshot().mountain.machines).toBe(1);
      vi.advanceTimersByTime(3_000);
      expect(rowOf(screen, "kid").hidden).toBe(true);
      expect(listParts(screen)).toEqual(before);
      expect(posts.querySelectorAll(".crew-row").length).toBe(chipRows);
      expect(posts.querySelectorAll(".crew-bit").length).toBe(chips);
      // The words still change in place.
      expect(posts.querySelector(".crew-posts-words")?.textContent).toContain(
        "on the machine",
      );
      // The next open shows the kid and the machine's chip.
      drawerOf(screen)
        .querySelector<HTMLButtonElement>(".board-sheet-back")
        ?.click();
      openBuys(screen);
      expect(rowOf(screen, "kid").hidden).toBe(false);
      expect(posts.textContent).toContain("on the machine");
      screen.root.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a new chip that fits joins the open drawer's rows, never a new row", () => {
    vi.useFakeTimers();
    try {
      let clock = 10_000;
      const screen = mountScreen({
        storage: seededWith(machineShort()),
        now: () => CLOCK,
        tapClock: () => clock,
      });
      document.body.append(screen.root);
      openBuys(screen);
      clock += BUYS_SETTLE_MS + 100;
      const posts = chipsOf(screen);
      const chipRows = posts.querySelectorAll(".crew-row").length;
      fingerTap(rowOf(screen, "machine"));
      vi.advanceTimersByTime(1_000);
      expect(posts.querySelectorAll(".crew-row").length).toBe(chipRows);
      expect(
        [...posts.querySelectorAll(".crew-bit")].map(
          (chip) => chip.textContent,
        ),
      ).toContain("10 on the machine");
      screen.root.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a post the crew empties while the drawer is open reads zero in its place", () => {
    let clock = 10_000;
    // The first borer takes the hands off the cart: the borer runs first.
    const screen = mountScreen({
      storage: seededWith({
        ...minedMountain(10_000_000),
        pocket: 20_000_000,
        helpers: 9,
        carts: 1,
        drills: 1,
        staffed: 2,
      }),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    openBuys(screen);
    clock += BUYS_SETTLE_MS + 100;
    const chipWords = () =>
      [...chipsOf(screen).querySelectorAll(".crew-bit")].map(
        (chip) => chip.textContent,
      );
    expect(chipWords()).toContain("1 on carts");
    fingerTap(rowOf(screen, "borer"));
    expect(screen.progress.getSnapshot().mountain.borers).toBe(1);
    expect(chipWords()).toContain("0 on carts");
    drawerOf(screen)
      .querySelector<HTMLButtonElement>(".board-sheet-back")
      ?.click();
    expect(chipWords()).not.toContain("0 on carts");
    expect(chipWords().some((words) => /on borers$/.test(words))).toBe(true);
  });

  it("chip words that grow while the drawer is open never add a chip row", () => {
    let clock = 10_000;
    const screen = mountScreen({
      storage: seededWith(early({ pocket: 1_000_000 })),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    document.body.append(screen.root);
    const posts = chipsOf(screen);
    Object.defineProperty(posts, "clientWidth", {
      configurable: true,
      get: () => 400,
    });
    let wide = 300;
    Object.defineProperty(posts, "scrollWidth", {
      configurable: true,
      get: () => wide,
    });
    openBuys(screen);
    clock += BUYS_SETTLE_MS + 100;
    const before = listParts(screen);
    const chipRows = posts.querySelectorAll(".crew-row").length;
    // Frozen, the chip rows do not wrap (board.css).
    expect(posts.classList.contains("is-frozen")).toBe(true);
    // A hire changes only words; they now run past the line.
    wide = 500;
    fingerTap(rowOf(screen, "helper"));
    expect(screen.progress.getSnapshot().mountain.helpers).toBe(19);
    expect(posts.textContent).toContain("19 workers");
    expect(posts.querySelectorAll(".crew-row").length).toBe(chipRows);
    expect(listParts(screen)).toEqual(before);
    // Shut, the line is laid out again as usual.
    drawerOf(screen)
      .querySelector<HTMLButtonElement>(".board-sheet-back")
      ?.click();
    expect(posts.classList.contains("is-frozen")).toBe(false);
    expect(posts.querySelectorAll(".crew-row").length).toBeGreaterThan(
      chipRows,
    );
    screen.root.remove();
  });

  it("a fix inside an earlier Done hold holds the row again", () => {
    vi.useFakeTimers();
    try {
      const screen = mountScreen({
        storage: seededWith(early({ pocket: 1_000_000 })),
        now: () => CLOCK,
      });
      const cart = rowOf(screen, "cart");
      cart.click();
      expect(screen.progress.getSnapshot().mountain.carts).toBe(7);
      vi.advanceTimersByTime(1_500);
      screen.progress.previewTrouble("cart");
      for (let tap = 0; tap < 5; tap += 1) cart.click();
      expect(screen.progress.getSnapshot().trouble).toBeUndefined();
      // The first hold would have ended here; the fix's hold has not.
      vi.advanceTimersByTime(1_000);
      cart.click();
      expect(screen.progress.getSnapshot().mountain.carts).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a row held in place but no longer shown buys nothing", () => {
    const screen = mountScreen({
      storage: seededWith(early({ pocket: 1_000_000 })),
      now: () => CLOCK,
    });
    openBuys(screen);
    const drill = rowOf(screen, "drill");
    expect(drill.hidden).toBe(false);
    // Another copy of the save lands: no carts, so the drill is not shown, but the open drawer
    // keeps its row in place.
    screen.progress.applyMutation((m) => ({ ...m, carts: 0 }));
    expect(drill.hidden).toBe(false);
    drill.click();
    expect(screen.progress.getSnapshot().mountain.drills).toBe(0);
  });

  it("a first hire while the drawer is open keeps the empty crew line closed until the next open", () => {
    const screen = mountScreen({
      storage: seededWith(minedMountain(tierCost(tierById("helper"), 0))),
      now: () => CLOCK,
    });
    openBuys(screen);
    const before = listParts(screen);
    expect(chipsOf(screen).hidden).toBe(true);
    rowOf(screen, "helper").click();
    expect(screen.progress.getSnapshot().mountain.helpers).toBe(1);
    expect(chipsOf(screen).hidden).toBe(true);
    // The cart row waits too.
    expect(listParts(screen)).toEqual(before);
    drawerOf(screen)
      .querySelector<HTMLButtonElement>(".board-sheet-back")
      ?.click();
    expect(chipsOf(screen).hidden).toBe(false);
    expect(rowOf(screen, "cart").hidden).toBe(false);
  });

  /** A signed-in screen whose save loads again on `reload`, and lands on `land`. */
  const reloadable = (mountain: Mountain, tapClock?: () => number) => {
    let landWith: (result: CloudLoadResult) => void = () => {
      throw new Error("load was not pending");
    };
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        landWith = onChange;
        return () => undefined;
      },
    };
    const auth = createMemoryAuth();
    const screen = mountScreen({
      auth,
      cloudSave,
      storage: seededWith(mountain),
      now: () => CLOCK,
      ...(tapClock === undefined ? {} : { tapClock }),
    });
    const reload = async (): Promise<void> => {
      await auth.signIn();
      await Promise.resolve();
      expect(screen.progress.getSnapshot().ready).toBe(false);
    };
    // One more stone mined: the copy that lands is ahead of the phone's, so it is the one kept.
    const land = async (landed: Mountain): Promise<void> => {
      landWith({
        kind: "found",
        mountain: { ...landed, remaining: landed.remaining - 1 },
      });
      await Promise.resolve();
      expect(screen.progress.getSnapshot().ready).toBe(true);
    };
    return { screen, reload, land };
  };

  it("a drawer opened while the save loads lays out once as it lands", async () => {
    const { screen, reload, land } = reloadable(early());
    expect(rowOf(screen, "drill").hidden).toBe(false);
    await reload();
    openBuys(screen);
    // The save that lands has no carts: no drill to show.
    await land(early({ carts: 0 }));
    expect(rowOf(screen, "drill").hidden).toBe(true);
    expect(chipsOf(screen).classList.contains("is-frozen")).toBe(true);
    // From here the open drawer holds what it laid out.
    screen.progress.applyMutation((m) => ({ ...m, carts: 6 }));
    expect(rowOf(screen, "drill").hidden).toBe(true);
    drawerOf(screen)
      .querySelector<HTMLButtonElement>(".board-sheet-back")
      ?.click();
    expect(rowOf(screen, "drill").hidden).toBe(false);
  });

  it("a reload while open keeps the rows in place and blinks nothing while loading", async () => {
    setReducedMotion(false);
    try {
      let clock = 10_000;
      const { screen, reload, land } = reloadable(early(), () => clock);
      openBuys(screen);
      clock += BUYS_SETTLE_MS + 100;
      const before = listParts(screen);
      const drill = rowOf(screen, "drill");
      fingerTap(drill);
      expect(lampOf(drill)).toBe("-120px");
      await reload();
      expect(lampOf(drill)).toBe("0px");
      fingerTap(drill);
      expect(lampOf(drill)).toBe("0px");
      expect(listParts(screen)).toEqual(before);
      // The save that lands has no carts. The drill keeps its place, and the blink from before
      // the reload is over.
      await land(early({ carts: 0 }));
      expect(listParts(screen)).toEqual(before);
      expect(lampOf(drill)).toBe("0px");
      // A row held in place for a tier no longer shown blinks, and buys nothing.
      fingerTap(drill);
      expect(lampOf(drill)).toBe("-120px");
      expect(screen.progress.getSnapshot().mountain.drills).toBe(0);
    } finally {
      setReducedMotion(true);
    }
  });

  it("after a buy, a reload within the Done hold ends it, and the next press acts", async () => {
    let clock = 10_000;
    const { screen, reload, land } = reloadable(
      early({ pocket: 1_000_000 }),
      () => clock,
    );
    openBuys(screen);
    clock += BUYS_SETTLE_MS + 100;
    const carts = () => screen.progress.getSnapshot().mountain.carts;
    rowOf(screen, "cart").click();
    expect(carts()).toBe(7);
    expect(partOf(rowOf(screen, "cart"), "verb")).toBe("Done");
    clock += 500;
    await reload();
    await land(early({ pocket: 1_000_000 }));
    expect(partOf(rowOf(screen, "cart"), "verb")).toBe("Buy");
    rowOf(screen, "cart").click();
    expect(carts()).toBe(7);
    expect(partOf(rowOf(screen, "cart"), "verb")).toBe("Done");
  });

  it("trouble presses count during a Done hold", () => {
    const screen = mountScreen({
      storage: seededWith(early({ pocket: 1_000_000 })),
      now: () => CLOCK,
    });
    const cart = rowOf(screen, "cart");
    cart.click();
    expect(screen.progress.getSnapshot().mountain.carts).toBe(7);
    screen.progress.previewTrouble("cart");
    for (let tap = 0; tap < 5; tap += 1) cart.click();
    expect(screen.progress.getSnapshot().trouble).toBeUndefined();
    expect(screen.progress.getSnapshot().mountain.carts).toBe(7);
  });

  it("a sixth quick tap after the fix buys nothing", () => {
    vi.useFakeTimers();
    try {
      const screen = mountScreen({
        storage: seededWith(early({ pocket: 1_000_000 })),
        now: () => CLOCK,
      });
      screen.progress.previewTrouble("cart");
      const cart = rowOf(screen, "cart");
      for (let tap = 0; tap < 5; tap += 1) cart.click();
      expect(screen.progress.getSnapshot().trouble).toBeUndefined();
      cart.click();
      expect(screen.progress.getSnapshot().mountain.carts).toBe(6);
      vi.advanceTimersByTime(1_900);
      cart.click();
      expect(screen.progress.getSnapshot().mountain.carts).toBe(7);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a fix by hold also holds the row", async () => {
    vi.useFakeTimers();
    try {
      const screen = mountScreen({
        storage: seededWith(early({ pocket: 1_000_000 })),
        now: () => CLOCK,
      });
      screen.progress.previewTrouble("cart");
      const cart = rowOf(screen, "cart");
      cart.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      await vi.advanceTimersByTimeAsync(FIX_HOLD_MS);
      expect(screen.progress.getSnapshot().trouble).toBeUndefined();
      cart.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, button: 0 }),
      );
      cart.click();
      // A quick tap after the hold's own click.
      fingerTap(cart);
      expect(screen.progress.getSnapshot().mountain.carts).toBe(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a tap the store says came before the save is in buys nothing", () => {
    const screen = mountScreen({
      storage: seededWith(early()),
      now: () => CLOCK,
    });
    const real = screen.progress.getSnapshot();
    const read = vi
      .spyOn(screen.progress, "getSnapshot")
      .mockReturnValue({ ...real, ready: false });
    const apply = vi.spyOn(screen.progress, "applyMutation");
    rowOf(screen, "cart").click();
    expect(apply).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it("a second buy while the crew line counts up starts the count again", async () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      const screen = mountScreen({
        storage: seededWith(early({ pocket: 1_000_000 })),
        now: () => CLOCK,
      });
      rowOf(screen, "helper").click();
      vi.advanceTimersByTime(60);
      rowOf(screen, "cart").click();
      await vi.advanceTimersByTimeAsync(1_000);
      const after = screen.progress.getSnapshot().mountain;
      expect(after.helpers).toBe(19);
      expect(after.carts).toBe(7);
      expect(screen.text(".crew-status")).toBe(
        `Your crew mines ${String(effectiveRates(after, CLOCK).crewPerSecond)} stones a second`,
      );
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });

  it("opening Buys closes Upgrades, and Upgrades closes Buys", () => {
    const screen = mountScreen({
      storage: seededWith(early()),
      now: () => CLOCK,
    });
    const upgrades = () =>
      screen.root
        .querySelector('.board-sheet[data-sheet="upgrades"]')
        ?.classList.contains("is-open");
    openBuys(screen);
    expect(isOpen(screen)).toBe(true);
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
      ?.click();
    expect(upgrades()).toBe(true);
    expect(isOpen(screen)).toBe(false);
    openBuys(screen);
    expect(isOpen(screen)).toBe(true);
    expect(upgrades()).toBe(false);
  });

  it("a card that opens by itself closes Buys", () => {
    const screen = mountScreen({
      storage: seededWith(early()),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    openBuys(screen);
    showAppUpdate(screen.root);
    expect(isOpen(screen)).toBe(false);
    screen.root.remove();
  });
});

describe("upgrades on screen", () => {
  const seededWith = (mountain: Mountain, at = Date.now()) => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain, lastSeen: at });
    return storage;
  };
  const drawerOf = (screen: ReturnType<typeof mountScreen>) =>
    screen.root.querySelector<HTMLElement>(
      '.board-sheet[data-sheet="upgrades"]',
    );
  const openUpgrades = (screen: ReturnType<typeof mountScreen>): void => {
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
      ?.click();
  };
  const rowOf = (screen: ReturnType<typeof mountScreen>, selector: string) => {
    const row = drawerOf(screen)?.querySelector(selector);
    if (!(row instanceof HTMLElement)) throw new Error(`no ${selector}`);
    return row;
  };
  const partOf = (row: HTMLElement, part: string) =>
    row.querySelector<HTMLElement>(`.board-row-${part}`);
  // A finger: the press, the lift, then the click it makes.
  const fingerTap = (el: HTMLElement): void => {
    el.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    el.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, button: 0 }),
    );
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
  };
  const CLOCK = 1_700_000_000_000;
  /** Both boosts and Strong arms show: a cart, a drill and three carts. */
  const boostsOpen = (pocket: number): Mountain => ({
    ...minedMountain(30_000),
    helpers: 20,
    carts: 3,
    drills: 1,
    staffed: 2,
    pocket,
  });
  const sharperPrice = (mountain: Mountain): number =>
    boostCost(
      boostById("sharper"),
      effectiveRates(mountain),
      stretch(mountain),
    );

  it("the drawer opens with its rows", () => {
    const m = boostsOpen(50_000);
    const screen = mountScreen({
      storage: seededWith(m, CLOCK),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    const drawer = drawerOf(screen);
    expect(drawer?.classList.contains("is-open")).toBe(false);
    openUpgrades(screen);
    expect(drawer?.classList.contains("is-open")).toBe(true);
    expect(drawer?.querySelector(".board-sheet-title")?.textContent).toBe(
      "Upgrades",
    );
    const sharper = rowOf(
      screen,
      '.board-row.upgrade.boost[data-boost="sharper"]',
    );
    const overtime = rowOf(
      screen,
      '.board-row.upgrade.boost[data-boost="overtime"]',
    );
    expect(sharper.hidden).toBe(false);
    expect(overtime.hidden).toBe(false);
    expect(partOf(sharper, "name")?.textContent).toBe("Sharper picks");
    expect(partOf(overtime, "name")?.textContent).toBe("Overtime");
    expect(partOf(sharper, "price")?.textContent).toBe(
      formatCompact(sharperPrice(m)),
    );
    const overtimePrice = boostCost(
      boostById("overtime"),
      effectiveRates(m),
      stretch(m),
    );
    expect(partOf(overtime, "price")?.textContent).toBe(
      formatCompact(overtimePrice),
    );
    // Sections in today's order, and the rows carry no icon.
    expect(
      [...(drawer?.querySelectorAll(".board-sec") ?? [])]
        .filter((sec) => !(sec as HTMLElement).hidden)
        .map((sec) => sec.textContent),
    ).toEqual(["Quick boosts", "Lasting upgrades"]);
    expect(drawer?.querySelector(".board-row-icon")).toBeNull();
    expect(
      [...(drawer?.querySelectorAll(".board-row") ?? [])].every((row) =>
        row.classList.contains("no-icon"),
      ),
    ).toBe(true);
    // The pocket shows on the odometer above the drawer, not in it.
    expect(drawer?.textContent).not.toContain("You have");
    screen.root.remove();
  });

  it("a tap buys one and holds Done", async () => {
    vi.useFakeTimers();
    try {
      const m = boostsOpen(50_000);
      let clock = 10_000;
      const screen = mountScreen({
        storage: seededWith(m, CLOCK),
        now: () => CLOCK,
        tapClock: () => clock,
      });
      document.body.append(screen.root);
      const pocket = screen.progress.getSnapshot().mountain.pocket;
      const price = sharperPrice(screen.progress.getSnapshot().mountain);
      openUpgrades(screen);
      clock += BUYS_SETTLE_MS + 100;
      const sharper = rowOf(screen, '[data-boost="sharper"]');
      fingerTap(sharper);
      clock += 100;
      fingerTap(sharper);
      const after = screen.progress.getSnapshot().mountain;
      expect(after.boosts?.sharper).toBe(
        CLOCK + boostById("sharper").durationMs,
      );
      expect(after.pocket).toBe(pocket - price);
      expect(partOf(sharper, "verb")?.textContent).toBe("Done");
      expect(partOf(sharper, "flag")?.textContent).toBe("Done");
      expect(sharper.getAttribute("aria-label")).toBe("Sharper picks. Done");
      // The hold ends on the board's own clock: move it with the timers.
      clock += 1_900;
      await vi.advanceTimersByTimeAsync(1_900);
      expect(partOf(sharper, "verb")?.textContent).toBe("Running");
      expect(partOf(sharper, "price")?.textContent).toBe("10:00");
      expect(sharper.getAttribute("aria-label")).toContain(
        "Running, 10:00 left",
      );
      screen.root.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a boost buy shows its spend, and marks seen the rows shown at the tap (#409)", () => {
    let clock = 10_000;
    const screen = mountScreen({
      storage: seededWith(boostsOpen(50_000), CLOCK),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    document.body.append(screen.root);
    openUpgrades(screen);
    // A row comes in while the drawer is open: the fifth cart shows Helping hands, unseen.
    screen.progress.applyMutation((mountain) => ({ ...mountain, carts: 5 }));
    const atTap = shownRows(screen.progress.getSnapshot().mountain);
    expect(atTap).toContain("upgrade:cartSyn");
    expect(screen.progress.getSnapshot().mountain.seen).not.toContain(
      "upgrade:cartSyn",
    );
    const price = sharperPrice(screen.progress.getSnapshot().mountain);
    clock += BUYS_SETTLE_MS + 100;
    fingerTap(rowOf(screen, '[data-boost="sharper"]'));
    const after = screen.progress.getSnapshot().mountain;
    expect(after.boosts?.sharper).toBeDefined();
    expect(screen.text(".board-spend")).toBe(
      `−${price.toLocaleString("en-US")}`,
    );
    // The buy marks every row he had in front of him, the new one too.
    expect([...(after.seen ?? [])].sort()).toEqual([...atTap].sort());
    screen.root.remove();
  });

  it("a dear tap blinks and spends nothing", () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      const m = boostsOpen(10);
      let clock = 10_000;
      const screen = mountScreen({
        storage: seededWith(m, CLOCK),
        now: () => CLOCK,
        tapClock: () => clock,
      });
      document.body.append(screen.root);
      const pocket = screen.progress.getSnapshot().mountain.pocket;
      openUpgrades(screen);
      clock += BUYS_SETTLE_MS + 100;
      const sharper = rowOf(screen, '[data-boost="sharper"]');
      expect(sharper.classList.contains("is-dear")).toBe(true);
      const lamp = sharper.querySelector<HTMLElement>(".board-lamp");
      const frames: string[] = [];
      fingerTap(sharper);
      frames.push(lamp?.style.backgroundPositionX ?? "");
      clock += 140;
      vi.advanceTimersByTime(140);
      frames.push(lamp?.style.backgroundPositionX ?? "");
      expect(frames).toEqual(["-120px", "0px"]);
      expect(screen.progress.getSnapshot().mountain.pocket).toBe(pocket);
      expect(screen.progress.getSnapshot().mountain.boosts?.sharper).toBe(
        undefined,
      );
      screen.root.remove();
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });

  it("a tap re-reads the store: a pocket that fell under the price buys nothing", () => {
    const m = boostsOpen(50_000);
    let clock = 10_000;
    const screen = mountScreen({
      storage: seededWith(m, CLOCK),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    openUpgrades(screen);
    clock += BUYS_SETTLE_MS + 100;
    const sharper = rowOf(screen, '[data-boost="sharper"]');
    expect(sharper.classList.contains("is-can")).toBe(true);
    const real = screen.progress.getSnapshot();
    const read = vi
      .spyOn(screen.progress, "getSnapshot")
      .mockReturnValue({ ...real, mountain: { ...real.mountain, pocket: 0 } });
    const apply = vi.spyOn(screen.progress, "applyMutation");
    fingerTap(sharper);
    expect(apply).not.toHaveBeenCalled();
    read.mockRestore();
    expect(screen.progress.getSnapshot().mountain.boosts?.sharper).toBe(
      undefined,
    );
  });

  it("the settle", () => {
    const m = boostsOpen(50_000);
    let clock = 10_000;
    const screen = mountScreen({
      storage: seededWith(m, CLOCK),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    const pocket = screen.progress.getSnapshot().mountain.pocket;
    openUpgrades(screen);
    clock += 100;
    const sharper = rowOf(screen, '[data-boost="sharper"]');
    fingerTap(sharper);
    expect(screen.progress.getSnapshot().mountain.pocket).toBe(pocket);
    expect(screen.progress.getSnapshot().mountain.boosts?.sharper).toBe(
      undefined,
    );
    // Back shares the settle: the double tap does not close it either.
    const back =
      drawerOf(screen)?.querySelector<HTMLElement>(".board-sheet-back");
    if (back) fingerTap(back);
    expect(drawerOf(screen)?.classList.contains("is-open")).toBe(true);
    // A deliberate tap once it has settled buys.
    clock += BUYS_SETTLE_MS;
    fingerTap(sharper);
    expect(screen.progress.getSnapshot().mountain.boosts?.sharper).toBe(
      CLOCK + boostById("sharper").durationMs,
    );
  });

  it("lasting rows", () => {
    const m: Mountain = {
      ...boostsOpen(0),
      helpers: 20,
      upgrades: { tap: 2, boots: 1 },
    };
    const screen = mountScreen({
      storage: seededWith(m, CLOCK),
      now: () => CLOCK,
    });
    openUpgrades(screen);
    const arms = rowOf(screen, '.board-row.upgrade[data-upgrade="tap"]');
    const saved = screen.progress.getSnapshot().mountain;
    expect(arms.classList.contains("no-icon")).toBe(true);
    expect(partOf(arms, "name")?.firstChild?.textContent).toBe("Strong arms");
    expect(partOf(arms, "badge")?.textContent).toBe("Lv 2/10");
    expect(partOf(arms, "info")?.textContent).toBe(
      upgradeEffectLine(upgradeById("tap"), saved, CLOCK),
    );
    expect(partOf(arms, "why")?.textContent).toBe(
      upgradeWhyLine(upgradeById("tap"), saved, CLOCK),
    );
    expect(partOf(arms, "price")?.textContent).toBe(
      formatCompact(upgradePrice("tap", 2)),
    );
    const boots = rowOf(screen, '[data-upgrade="boots"]');
    expect(partOf(boots, "price")?.textContent).toBe("Owned");
    expect(partOf(boots, "badge")?.hidden).toBe(true);
    expect(boots.getAttribute("aria-label")).toMatch(/Owned$/);
  });

  it("buys Strong arms, and taps harder", async () => {
    vi.useFakeTimers();
    setReducedMotion(false);
    try {
      const clock = Date.now();
      const screen = mountScreen({
        storage: seededWith(
          {
            ...minedMountain(30_000),
            helpers: 500,
            // Three carts open Strong arms (#250). The pocket covers two
            // levels with stones to spare.
            carts: 3,
            pocket: upgradePrice("tap", 0) + upgradePrice("tap", 1) + 86_000,
          },
          clock,
        ),
        now: () => clock,
      });
      document.body.append(screen.root);
      const button = screen.root.querySelector<HTMLButtonElement>(
        ".board-key[data-key=upgrades]",
      );
      expect(button?.classList.contains("is-lit")).toBe(true);
      expect(button?.getAttribute("aria-label")).toBe(
        "Upgrades, one is affordable",
      );
      button?.click();
      const drawer = drawerOf(screen);
      expect(document.activeElement).toBe(
        drawer?.querySelector(".board-sheet-title"),
      );
      const arms = rowOf(screen, '[data-upgrade="tap"]');
      expect(partOf(arms, "badge")?.textContent).toBe("Lv 0/10");
      expect(partOf(arms, "info")?.textContent).toBe("Taps 1 to 67.");
      expect(partOf(arms, "price")?.textContent).toBe(
        formatCompact(upgradePrice("tap", 0)),
      );
      arms.click();
      expect(screen.progress.getSnapshot().mountain.upgrades?.tap).toBe(1);
      expect(partOf(arms, "info")?.textContent).toBe("Taps 67 to 133.");
      await vi.advanceTimersByTimeAsync(1_900);
      expect(partOf(arms, "badge")?.textContent).toBe("Lv 1/10");
      expect(partOf(arms, "price")?.textContent).toBe(
        formatCompact(upgradePrice("tap", 1)),
      );
      expect(arms.classList.contains("is-can")).toBe(true);

      drawer?.querySelector<HTMLButtonElement>(".board-sheet-back")?.click();
      expect(drawer?.classList.contains("is-open")).toBe(false);
      expect(document.activeElement).toBe(button);

      screen.dig.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
      expect(screen.root.querySelector(".board-dig-plus")?.textContent).toBe(
        "+67",
      );
      screen.root.remove();
    } finally {
      vi.useRealTimers();
      setReducedMotion(true);
    }
  });

  it("dims the button and the rows when nothing is affordable, and Escape closes", () => {
    const screen = mountScreen({ storage: seededWith(minedMountain(10)) });
    document.body.append(screen.root);
    expect(
      screen.root
        .querySelector(".board-key[data-key=upgrades]")
        ?.classList.contains("is-lit"),
    ).toBe(false);
    openUpgrades(screen);
    const drawer = drawerOf(screen);
    expect(drawer?.classList.contains("is-open")).toBe(true);
    expect(drawer?.querySelector(".board-row.is-can")).toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(drawer?.classList.contains("is-open")).toBe(false);
    screen.root.remove();
  });

  it("opening marks every shown row seen", () => {
    const m = boostsOpen(0);
    const screen = mountScreen({
      storage: seededWith(m, CLOCK),
      now: () => CLOCK,
    });
    expect(screen.progress.getSnapshot().mountain.seen ?? []).toEqual([]);
    openUpgrades(screen);
    const after = screen.progress.getSnapshot().mountain;
    expect([...(after.seen ?? [])].sort()).toEqual(
      [...shownRows(after)].sort(),
    );
    expect(after.seen).toEqual(
      expect.arrayContaining([
        "boost:sharper",
        "boost:overtime",
        "upgrade:tap",
      ]),
    );
  });

  it("the i card", () => {
    const screen = mountScreen({
      storage: seededWith(boostsOpen(30_000), CLOCK),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    openUpgrades(screen);
    const drawer = drawerOf(screen);
    const head = drawer?.querySelector<HTMLElement>(".board-sheet-head");
    const list = drawer?.querySelector<HTMLElement>(".board-sheet-list");
    const footer = drawer?.querySelector<HTMLElement>(".board-sheet-footer");
    drawer?.querySelector<HTMLButtonElement>(".board-sheet-info")?.click();
    expect(head?.hidden).toBe(true);
    expect(list?.hidden).toBe(true);
    expect(footer?.hidden).toBe(true);
    const how = drawer?.querySelector<HTMLElement>(".board-sheet-how");
    expect(how?.hidden).toBe(false);
    const cards = [...(how?.querySelectorAll<HTMLElement>(".teach-how") ?? [])];
    expect(cards.map((card) => card.dataset["how"])).toEqual([
      "upgrades",
      "boosts",
    ]);
    // Board art: the upgrades icon, the worker and the pick at 2x.
    expect(
      cards.flatMap((card) =>
        [...card.querySelectorAll("img")].map((img) =>
          img.getAttribute("width"),
        ),
      ),
    ).toEqual(["32", "64", "32", "32", "64", "32"]);
    const backs = cards
      .flatMap((card) => [
        ...card.querySelectorAll<HTMLButtonElement>(".teach-how-back"),
      ])
      .filter((back) => !back.hidden);
    expect(backs.map((back) => back.textContent)).toEqual(["Back to Upgrades"]);
    expect(backs[0]?.closest(".teach-how")).toBe(cards[1]);
    backs[0]?.click();
    expect(how?.hidden).toBe(true);
    expect(head?.hidden).toBe(false);
    expect(list?.hidden).toBe(false);
    expect(footer?.hidden).toBe(false);
    expect(drawer?.classList.contains("is-open")).toBe(true);
    screen.root.remove();
  });

  it("until the save is in", async () => {
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
    openUpgrades(screen);
    const drawer = drawerOf(screen);
    expect(drawer?.classList.contains("is-open")).toBe(true);
    const rows = [
      ...(drawer?.querySelectorAll<HTMLElement>(".board-row") ?? []),
    ];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      if (row instanceof HTMLButtonElement) {
        expect(row.disabled).toBe(true);
      }
      expect(partOf(row, "price")?.textContent).toBe("");
      expect(row.querySelector<HTMLElement>(".board-row-tag")?.hidden).toBe(
        true,
      );
    }
    finishLoad({ kind: "found", mountain: boostsOpen(50_000) });
    await Promise.resolve();
    // The open drawer stays open and its rows fill in.
    expect(drawer?.classList.contains("is-open")).toBe(true);
    const sharper = rowOf(screen, '[data-boost="sharper"]');
    expect(sharper.hidden).toBe(false);
    expect((sharper as HTMLButtonElement).disabled).toBe(false);
    expect(partOf(sharper, "price")?.textContent).not.toBe("");
  });

  it("a save that loads again under the open drawer darkens its rows, and a tap then buys nothing", async () => {
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: () => () => undefined,
    };
    const auth = createMemoryAuth();
    const screen = mountScreen({
      auth,
      cloudSave,
      storage: seededWith(boostsOpen(50_000), CLOCK),
      now: () => CLOCK,
    });
    openUpgrades(screen);
    const sharper = rowOf(screen, '[data-boost="sharper"]');
    expect(partOf(sharper, "price")?.textContent).not.toBe("");
    await auth.signIn();
    await Promise.resolve();
    expect(screen.progress.getSnapshot().ready).toBe(false);
    expect(drawerOf(screen)?.classList.contains("is-open")).toBe(true);
    expect((sharper as HTMLButtonElement).disabled).toBe(true);
    expect(partOf(sharper, "price")?.textContent).toBe("");
    // A key press that reaches the row while the store is not ready spends nothing.
    const real = screen.progress.getSnapshot();
    const read = vi
      .spyOn(screen.progress, "getSnapshot")
      .mockReturnValue({ ...real, ready: false });
    const apply = vi.spyOn(screen.progress, "applyMutation");
    (sharper as HTMLButtonElement).disabled = false;
    sharper.click();
    expect(apply).not.toHaveBeenCalled();
    read.mockRestore();
  });

  it("a teach note waits while the drawer is open, then shows after it", () => {
    vi.useFakeTimers();
    try {
      const screen = mountScreen({
        storage: seededWith(
          {
            ...minedMountain(12_000_000),
            helpers: 20,
            carts: 2,
            staffed: 2,
            seen: ["workshop"],
            taught: ["workshop"],
          },
          CLOCK,
        ),
        now: () => CLOCK,
      });
      document.body.append(screen.root);
      openUpgrades(screen);
      // The first borer brings the first engineer while Upgrades is open.
      screen.progress.applyMutation((m) => ({
        ...m,
        borers: 1,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
      }));
      vi.advanceTimersByTime(2_000);
      expect(drawerOf(screen)?.classList.contains("is-open")).toBe(true);
      expect(screen.root.querySelector(".board-note.on")).toBeNull();
      expect(
        screen.root.querySelector(".board-sign-slot:not([hidden])"),
      ).toBeNull();
      drawerOf(screen)
        ?.querySelector<HTMLButtonElement>(".board-sheet-back")
        ?.click();
      vi.advanceTimersByTime(1_000);
      expect(
        screen.root.querySelector(".board-sign-slot:not([hidden])"),
      ).not.toBeNull();
      screen.root.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the scrim over the board's top closes the drawer", async () => {
    const screen = mountScreen({
      storage: seededWith(boostsOpen(0), CLOCK),
      now: () => CLOCK,
    });
    const scrim = screen.root.querySelector<HTMLElement>(
      ".board-sheet-clip > .board-scrim",
    );
    expect(scrim?.classList.contains("is-on")).toBe(false);
    openUpgrades(screen);
    // The scrim follows the drawer's class through a MutationObserver.
    await Promise.resolve();
    expect(scrim?.classList.contains("is-on")).toBe(true);
    scrim?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(drawerOf(screen)?.classList.contains("is-open")).toBe(false);
  });

  it("a card that opens by itself closes the drawer, so it is never covered", () => {
    const screen = mountScreen({
      storage: seededWith(boostsOpen(0), CLOCK),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    openUpgrades(screen);
    expect(drawerOf(screen)?.classList.contains("is-open")).toBe(true);
    screen.progress.previewConflict();
    expect(
      screen.root.querySelector<HTMLElement>(".save-conflict")?.hidden,
    ).toBe(false);
    expect(drawerOf(screen)?.classList.contains("is-open")).toBe(false);
    // The card keeps its own focus: not the key now under it.
    expect(document.activeElement).toBe(
      screen.root.querySelector(".save-conflict-play"),
    );
    screen.root.remove();
  });

  it("a relic found while the drawer is open opens the relics drawer in its place, Carry focused (#465)", () => {
    const screen = mountScreen({
      storage: seededWith(minedMountain(999_999), CLOCK),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    openUpgrades(screen);
    screen.dig.click();
    expect(relicPage(screen.root, REVEAL_PAGE)).not.toBeNull();
    expect(drawerOf(screen)?.classList.contains("is-open")).toBe(false);
    expect(document.activeElement).toBe(
      screen.root.querySelector(".relic-page-carry"),
    );
    screen.root.remove();
  });

  it("showAppUpdate opens the update card on top, and closes an open drawer", () => {
    const screen = mountScreen({
      storage: seededWith(boostsOpen(0), CLOCK),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    openUpgrades(screen);
    showAppUpdate(screen.root);
    expect(
      screen.root.querySelector<HTMLElement>(
        ".board-card.update-prompt[data-card=update]",
      )?.hidden,
    ).toBe(false);
    expect(drawerOf(screen)?.classList.contains("is-open")).toBe(false);
    expect(document.activeElement).toBe(
      screen.root.querySelector(".update-reload"),
    );
    screen.root.remove();
  });

  /** The first row showing in the list, top to bottom. */
  const topRow = (screen: ReturnType<typeof mountScreen>): HTMLElement => {
    const row = [
      ...(drawerOf(screen)?.querySelectorAll<HTMLElement>(
        ".board-sheet-list > .board-row",
      ) ?? []),
    ].find((each) => !each.hidden);
    if (row === undefined) throw new Error("no row showing");
    return row;
  };
  const rowOrder = (screen: ReturnType<typeof mountScreen>): string[] =>
    [
      ...(drawerOf(screen)?.querySelector(".board-sheet-list")?.children ?? []),
    ].map((kid) => {
      const el = kid as HTMLElement;
      return (
        el.dataset["boost"] ??
        el.dataset["upgrade"] ??
        el.dataset["tool"] ??
        el.dataset["sec"] ??
        el.className
      );
    });

  it("a sleepy second tap after a buy never lands on another row", () => {
    // Sharper picks is the New row; Strong arms waits, dotted and affordable.
    const base: Mountain = {
      ...minedMountain(30_000),
      helpers: 20,
      carts: 3,
      staffed: 2,
    };
    const m: Mountain = {
      ...base,
      pocket: sharperPrice(base) + upgradePrice("tap", 0) + 1_000,
    };
    let clock = 10_000;
    const screen = mountScreen({
      storage: seededWith(m, CLOCK),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    openUpgrades(screen);
    clock += BUYS_SETTLE_MS + 100;
    const first = topRow(screen);
    expect(first.dataset["boost"]).toBe("sharper");
    const order = rowOrder(screen);
    fingerTap(first);
    expect(screen.progress.getSnapshot().mountain.boosts?.sharper).toBe(
      CLOCK + boostById("sharper").durationMs,
    );
    // The New flag moves to Strong arms in place; no row moves.
    expect(
      rowOf(screen, '[data-upgrade="tap"]').classList.contains("teach-new"),
    ).toBe(true);
    expect(rowOrder(screen)).toEqual(order);
    clock += 150;
    fingerTap(topRow(screen));
    expect(screen.progress.getSnapshot().mountain.upgrades?.tap).toBe(
      undefined,
    );
    // The next opening leads with the New row's section.
    drawerOf(screen)
      ?.querySelector<HTMLButtonElement>(".board-sheet-back")
      ?.click();
    openUpgrades(screen);
    expect(topRow(screen).dataset["upgrade"]).toBe("tap");
  });

  it("the tick never moves a row while the drawer is open", async () => {
    vi.useFakeTimers();
    try {
      const base: Mountain = {
        ...minedMountain(30_000),
        helpers: 500,
        carts: 3,
        drills: 1,
        staffed: 2,
        // Sharper picks was used: Overtime and the upgrades carry the dots.
        boosts: { sharper: CLOCK - 1 },
        pocket: 0,
      };
      const overtimePrice = boostCost(
        boostById("overtime"),
        effectiveRates(base),
        stretch(base),
      );
      expect(upgradePrice("tap", 0)).toBeLessThan(overtimePrice);
      const screen = mountScreen({
        storage: seededWith(base, CLOCK),
        now: () => CLOCK,
      });
      openUpgrades(screen);
      expect(
        rowOf(screen, '[data-boost="overtime"]').classList.contains(
          "teach-new",
        ),
      ).toBe(true);
      const order = rowOrder(screen);
      expect(order.indexOf("boosts")).toBeLessThan(order.indexOf("lasting"));
      // The pocket covers Strong arms, not Overtime: Strong arms becomes New.
      screen.progress.applyMutation((current) => ({
        ...current,
        pocket: upgradePrice("tap", 0),
      }));
      await vi.advanceTimersByTimeAsync(1_000);
      expect(
        rowOf(screen, '[data-upgrade="tap"]').classList.contains("teach-new"),
      ).toBe(true);
      expect(rowOrder(screen)).toEqual(order);
    } finally {
      vi.useRealTimers();
    }
  });

  it("Upgrades opened while the save reloads keeps its order", async () => {
    // Sharper picks was used. With the pocket on Strong arms it is New, and Lasting leads.
    const base: Mountain = {
      ...minedMountain(30_000),
      helpers: 500,
      carts: 3,
      drills: 1,
      staffed: 2,
      boosts: { sharper: CLOCK - 1 },
      pocket: 0,
    };
    let landWith: (result: CloudLoadResult) => void = () => {
      throw new Error("load was not pending");
    };
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: ({ onChange }) => {
        landWith = onChange;
        return () => undefined;
      },
    };
    const auth = createMemoryAuth();
    const screen = mountScreen({
      auth,
      cloudSave,
      storage: seededWith({ ...base, pocket: upgradePrice("tap", 0) }, CLOCK),
      now: () => CLOCK,
    });
    // The parts, without the spare plate under them, whose fit changes as the drawer opens.
    const partsOrder = (): string[] =>
      rowOrder(screen).filter((part) => !part.startsWith("board-spare"));
    const order = partsOrder();
    expect(order.indexOf("lasting")).toBeLessThan(order.indexOf("boosts"));
    await auth.signIn();
    await Promise.resolve();
    expect(screen.progress.getSnapshot().ready).toBe(false);
    openUpgrades(screen);
    // The save that lands has an empty pocket: Overtime is New, and would lead.
    landWith({
      kind: "found",
      mountain: { ...base, remaining: base.remaining - 1 },
    });
    await Promise.resolve();
    expect(screen.progress.getSnapshot().ready).toBe(true);
    expect(
      rowOf(screen, '[data-boost="overtime"]').classList.contains("teach-new"),
    ).toBe(true);
    expect(partsOrder()).toEqual(order);
    // Overtime does not lead the list it was not ordered for.
    expect(
      drawerOf(screen)?.querySelector(".board-sheet-kick")?.textContent,
    ).toBe("Boosts for tonight, gear for good");
    // The next opening leads with the New row's section.
    drawerOf(screen)
      ?.querySelector<HTMLButtonElement>(".board-sheet-back")
      ?.click();
    openUpgrades(screen);
    const next = partsOrder();
    expect(next.indexOf("boosts")).toBeLessThan(next.indexOf("lasting"));
    expect(topRow(screen).dataset["boost"]).toBe("overtime");
  });

  it("a double tap on Back to Upgrades never buys the row under it", () => {
    const m = boostsOpen(50_000);
    let clock = 10_000;
    const screen = mountScreen({
      storage: seededWith(m, CLOCK),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    openUpgrades(screen);
    clock += 5_000;
    drawerOf(screen)
      ?.querySelector<HTMLButtonElement>(".board-sheet-info")
      ?.click();
    clock += 5_000;
    const back = [
      ...(drawerOf(screen)?.querySelectorAll<HTMLElement>(".teach-how-back") ??
        []),
    ].find((each) => !each.hidden);
    if (back === undefined) throw new Error("no Back to Upgrades");
    fingerTap(back);
    expect(
      drawerOf(screen)?.querySelector<HTMLElement>(".board-sheet-list")?.hidden,
    ).toBe(false);
    clock += 100;
    const pocket = screen.progress.getSnapshot().mountain.pocket;
    fingerTap(rowOf(screen, '[data-boost="sharper"]'));
    expect(screen.progress.getSnapshot().mountain.pocket).toBe(pocket);
    expect(screen.progress.getSnapshot().mountain.boosts?.sharper).toBe(
      undefined,
    );
  });
});

describe("the Upgrades order", () => {
  const boosts = BOOSTS.map((boost) => `boost:${boost.id}`);
  const lasting = UPGRADES.map((upgrade) => `upgrade:${upgrade.id}`);
  const found = [
    "sec:found",
    ...LOST_TOOLS.map((tool) => `tool:${tool}`),
    "foot",
  ];

  it("with no New row, Quick boosts lead, each in its own order", () => {
    expect(upgradesOrder(undefined)).toEqual([
      "sec:boosts",
      ...boosts,
      "sec:lasting",
      ...lasting,
      ...found,
    ]);
  });

  it("a New boost leads Quick boosts", () => {
    expect(upgradesOrder("boost:overtime")).toEqual([
      "sec:boosts",
      "boost:overtime",
      ...boosts.filter((id) => id !== "boost:overtime"),
      "sec:lasting",
      ...lasting,
      ...found,
    ]);
  });

  it("a New upgrade leads its section, and its section leads", () => {
    const second = UPGRADES[1];
    if (second === undefined) throw new Error("only one upgrade");
    const fresh = upgradeRowId(second);
    expect(upgradesOrder(fresh)).toEqual([
      "sec:lasting",
      fresh,
      ...lasting.filter((id) => id !== fresh),
      "sec:boosts",
      ...boosts,
      ...found,
    ]);
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
        mountain: { ...minedMountain(40_000), helpers: 500, carts: 1 },
        lastSeen: clock,
      });
      const screen = mountScreen({ storage, now: () => clock });
      const chip = screen.root.querySelector<HTMLElement>(
        '.effect-row .boost-chip[data-boost="sharper"]',
      );
      expect(chip?.hidden).toBe(true);
      screen.root
        .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
        ?.click();
      const buy = screen.root.querySelector<HTMLButtonElement>(
        '.board-row[data-boost="sharper"]',
      );
      expect(screen.text('[data-boost="sharper"] .board-row-name')).toBe(
        "Sharper picks",
      );
      // Its taps' worth at one stone a tap, whatever the crew (#333).
      expect(screen.text('[data-boost="sharper"] .board-row-price')).toBe(
        formatCompact(boostById("sharper").priceUnits),
      );
      buy?.click();
      expect(screen.text('[data-boost="sharper"] .board-row-verb')).toBe(
        "Done",
      );
      await vi.advanceTimersByTimeAsync(1_900);
      expect(buy?.classList.contains("is-running")).toBe(true);
      expect(screen.text('[data-boost="sharper"] .board-row-verb')).toBe(
        "Running",
      );
      expect(screen.text('[data-boost="sharper"] .board-row-price')).toBe(
        "10:00",
      );
      expect(chip?.hidden).toBe(false);
      expect(chip?.textContent).toBe("Picks×2 10:00");
      expect(chip?.getAttribute("aria-label")).toContain("Sharper picks");
      screen.root
        .querySelector<HTMLButtonElement>(
          '[data-sheet="upgrades"] .board-sheet-back',
        )
        ?.click();

      screen.dig.dispatchEvent(
        new MouseEvent("click", { bubbles: true, detail: 1 }),
      );
      expect(screen.root.querySelector(".board-dig-plus")?.textContent).toBe(
        "+2",
      );

      clock += 4 * 60_000 + 30_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(chip?.textContent).toBe("Picks×2 5:30");

      clock += 6 * 60_000;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(chip?.hidden).toBe(true);
      expect(screen.dig.getAttribute("aria-label")).toBe(
        "Mine window: tap to mine one stone",
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

  it("lists the running clocks in Running now, not what could run", () => {
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
      const found = screen.root.querySelector<HTMLElement>(".board-running");
      screen.progress.dispose();
      return found;
    };
    const shown = (list: HTMLElement | null): number =>
      list?.querySelectorAll(".effect-chip:not([hidden])").length ?? -1;
    // The workshop and an engineer could run eight clocks; two are running.
    const two = row({
      sharper: now + 10 * 60_000,
      overtime: now + 20 * 60_000,
    });
    expect(shown(two)).toBe(2);
    expect(two?.querySelector<HTMLElement>(".effect-row")?.hidden).toBe(false);
    expect(two?.textContent).not.toContain("Nothing running");
    // Nothing running says so, with no empty list.
    const none = row({});
    expect(shown(none)).toBe(0);
    expect(none?.querySelector<HTMLElement>(".effect-row")?.hidden).toBe(true);
    expect(none?.textContent).toBe("Running nowNothing running");
  });

  it("keeps every countdown in Running now", () => {
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
      shown.every((chip) => chip.closest(".board-running .effect-row")),
    ).toBe(true);
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
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
      ?.click();
    expect(screen.text('[data-boost="overtime"] .board-row-info')).toBe(
      "Crew ×2 for 30 min. 20/s.",
    );
  });
});

describe("lasting upgrades on screen", () => {
  it("hides locked upgrades until open, and boosts helper cards once bought", () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      // Enough for the tenth worker and Better boots, with a little spare.
      mountain: {
        ...minedMountain(30_000),
        pocket:
          tierCost(tierById("helper"), 9) + upgradePrice("boots") + 50_000,
        helpers: 9,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
      ?.click();
    const boots = screen.root.querySelector<HTMLButtonElement>(
      '.board-row[data-upgrade="boots"]',
    );
    const price = () => screen.text('[data-upgrade="boots"] .board-row-price');
    // Locked rows stay hidden until their owned count opens them (#250).
    expect(
      screen.root.querySelector<HTMLElement>('[data-upgrade="boots"]')?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>('[data-upgrade="steady"]')?.hidden,
    ).toBe(true);

    screen.root
      .querySelector<HTMLButtonElement>('.tier[data-tier="helper"]')
      ?.click();
    expect(price()).toBe(formatCompact(upgradePrice("boots")));
    expect(screen.text('[data-upgrade="boots"] .board-row-info')).toBe(
      "Workers 1/s to 2.4/s.",
    );
    boots?.click();
    vi.advanceTimersByTime(1_900);
    vi.useRealTimers();
    expect(price()).toBe("Owned");
    expect(boots?.classList.contains("is-owned")).toBe(true);
    expect(boots?.classList.contains("is-can")).toBe(false);
    expect(screen.text('[data-upgrade="boots"] .board-row-info')).toBe(
      "Workers 1/s to 2.4/s.",
    );
    expect(screen.text('.tier[data-tier="helper"] .board-row-gain')).toBe(
      "+2.4/s",
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
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
      ?.click();
    const visible = [
      ...screen.root.querySelectorAll<HTMLElement>(".found-tool"),
    ].filter((row) => !row.hidden);
    expect(visible.map((row) => row.dataset["tool"])).toEqual([
      "pick",
      "boots",
    ]);
    expect(
      screen.root.querySelector('[data-tool="pick"]')?.tagName.toLowerCase(),
    ).toBe("div");
    expect(screen.text('[data-tool="pick"] .board-row-name')).toBe(
      "Grandfather's pick",
    );
    expect(screen.text('[data-tool="pick"] .board-row-info')).toBe(
      "Your taps bite a little deeper.",
    );
    expect(screen.text('[data-tool="pick"] .board-row-price')).toBe("Found");
    // Under its legend: Brought home, then the found rows.
    const legend = screen.root.querySelector<HTMLElement>(
      '[data-sheet="upgrades"] .board-sec[data-sec="found"]',
    );
    expect(legend?.textContent).toBe("Brought home");
    expect(legend?.hidden).toBe(false);
    expect(legend?.nextElementSibling).toBe(
      screen.root.querySelector('[data-tool="pick"]'),
    );
    expect(
      screen.root.querySelector<HTMLElement>('[data-tool="lamp"]')?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>('[data-tool="map"]')?.hidden,
    ).toBe(true);
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
    bare.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
      ?.click();
    expect(
      bare.root.querySelector<HTMLElement>(
        '[data-sheet="upgrades"] .board-sec[data-sec="found"]',
      )?.hidden,
    ).toBe(true);
    expect(
      [...bare.root.querySelectorAll<HTMLElement>(".found-tool")].every(
        (row) => row.hidden,
      ),
    ).toBe(true);
    screen.root.remove();
  });
});

describe("crew synergies on screen", () => {
  it("previews the bonus, then shows it in the cart row's gain once bought", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(1_000_000),
        pocket: upgradePrice("cartSyn"),
        helpers: 12,
        carts: 5,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
      ?.click();
    expect(screen.text('[data-upgrade="cartSyn"] .board-row-name')).toBe(
      "Helping hands",
    );
    expect(screen.text('[data-upgrade="cartSyn"] .board-row-info')).toBe(
      "Carts 6/s to 6.7/s.",
    );
    expect(
      screen.root.querySelector<HTMLElement>('[data-upgrade="drillSyn"]')
        ?.hidden,
    ).toBe(true);
    screen.root
      .querySelector<HTMLButtonElement>('.board-row[data-upgrade="cartSyn"]')
      ?.click();
    expect(screen.text('[data-upgrade="cartSyn"] .board-row-info')).toBe(
      "Carts 6/s to 6.7/s.",
    );
    expect(screen.text('.tier[data-tier="cart"] .board-row-gain')).toBe(
      "+6.7/s",
    );
    expect(
      screen.root
        .querySelector('.tier[data-tier="cart"]')
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
  it("shows idle machines on their rows and how many helpers the crew line needs", () => {
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
    expect(screen.text('.tier[data-tier="cart"] .board-row-gain')).toBe("+6/s");
    expect(
      screen.root
        .querySelector('.tier[data-tier="cart"]')
        ?.getAttribute("aria-label"),
    ).toContain("2 idle: each needs 1 worker to run");
    // The idle carts teach hiring; the drill row says it needs more hands.
    expect(
      screen.root
        .querySelector('.tier[data-tier="drill"]')
        ?.getAttribute("aria-label"),
    ).toContain(NEEDS_MORE_WORKERS);
    expect(screen.text('.tier[data-tier="drill"] .board-row-gain')).toBe(
      "+36/s",
    );
    expect(screen.text('.tier[data-tier="drill"] .board-row-verb')).toBe(
      "1 worker",
    );
    expect(screen.text(".crew-status")).toBe("81/s · 2 idle, need 2 workers");

    // Hiring one worker starts another cart; one still waits.
    screen.root
      .querySelector<HTMLButtonElement>('.tier[data-tier="helper"]')
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
    const borer = screen.root.querySelector('.tier[data-tier="borer"]');
    // The Granite suits borers (×1.1, D3).
    expect(screen.text('.tier[data-tier="borer"] .board-row-gain')).toBe(
      "+392/s",
    );
    expect(screen.text('.tier[data-tier="borer"] .board-row-need')).toBe(
      "Needs 8 workers",
    );
    expect(borer?.getAttribute("aria-label")).toContain(NEEDS_MORE_WORKERS);
    // The Granite is tough on drills (×0.8, D3).
    expect(screen.text('.tier[data-tier="drill"] .board-row-gain')).toBe(
      "+28/s",
    );
  });

  it("says on the crew line when a new machine has nobody to run it", () => {
    setReducedMotion(false);
    try {
      const storage = createMemoryStorage();
      writeSessionSave({
        storage,
        mountain: { ...minedMountain(0), pocket: 1_000, helpers: 1, carts: 1 },
        lastSeen: Date.now(),
      });
      const screen = mountScreen({ storage });
      const cart = screen.root.querySelector<HTMLButtonElement>(
        '.tier[data-tier="cart"]',
      );
      cart?.click();
      expect(screen.progress.getSnapshot().mountain.carts).toBe(2);
      expect(screen.text(".crew-status")).toBe("7/s · 1 idle, need 1 worker");
    } finally {
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
    expect(screen.text('.tier[data-tier="helper"] .board-row-gain')).toBe(
      "+2.4/s",
    );
    expect(screen.text('.tier[data-tier="cart"] .board-row-gain')).toBe(
      "+14/s",
    );
    expect(screen.text('.tier[data-tier="drill"] .board-row-gain')).toBe(
      "+36/s",
    );
    // Above the Granite the borer is a locked preview that says where it opens (#250, #356).
    expect(screen.text('.tier[data-tier="borer"] .board-row-info')).toBe(
      "The Tunnel borer joins your crew at 10M stones. Keep digging, Dad!",
    );
    expect(screen.root.querySelector(".crew-posts-words")?.textContent).toBe(
      "18 workers: 13 on carts, 5 on drills, 0 free",
    );
    const chipWords = [...screen.root.querySelectorAll(".crew-bit")]
      .map((chip) => chip.textContent)
      .join(" ");
    expect(chipWords).toContain("18 workers");
    expect(chipWords).toContain("13 on carts");
    expect(chipWords).toContain("5 on drills");
    // The free count is the crew plate's alone on the board (#371); only the spoken sentence
    // keeps it.
    expect(chipWords).not.toContain("free");

    document.body.append(screen.root);
    const posts = screen.root.querySelector<HTMLElement>(".crew-posts");
    if (posts === null) {
      throw new Error("crew posts did not render");
    }
    // Text, not a door: a press does nothing to it.
    expect(posts).not.toBeInstanceOf(HTMLButtonElement);

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
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
      ?.click();
    expect(posts.textContent).toContain("13 on carts");
    expect(posts.textContent).toContain("5 on drills");
    const rows = [...posts.querySelectorAll(".crew-row")];
    expect(rows.length).toBe(2);
    const sizes = rows.map((row) => row.querySelectorAll(".crew-bit").length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1);
    expect(posts.querySelector(".crew-bit")?.textContent).toMatch(
      /^\d+ workers$/,
    );
    screen.root.remove();
  });

  it("lays the chips out again when Buys opens, now the line lives there (#371)", () => {
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: {
        ...minedMountain(4_500_000),
        helpers: 18,
        carts: 13,
        drills: 5,
      },
      lastSeen: Date.now(),
    });
    const screen = mountScreen({ storage });
    document.body.append(screen.root);
    const posts = screen.root.querySelector<HTMLElement>(".crew-posts");
    if (posts === null) {
      throw new Error("crew posts did not render");
    }
    // Measured while the sheet was shut: no width, so one row.
    expect(posts.querySelectorAll(".crew-row").length).toBe(1);
    // The sheet opens and the line has its real width: too narrow for one row.
    Object.defineProperty(posts, "clientWidth", {
      configurable: true,
      get: () => 40,
    });
    Object.defineProperty(posts, "scrollWidth", {
      configurable: true,
      get: () => 280,
    });
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
      ?.click();
    expect(posts.querySelectorAll(".crew-row").length).toBe(2);
    expect(posts.textContent).toContain("5 on drills");
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
    expect(screen.text('.tier[data-tier="helper"] .board-row-info')).toMatch(
      /^12 of 25 /,
    );
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
    expect(screen.text('.tier[data-tier="helper"] .board-row-info')).toMatch(
      /^12 of 25 /,
    );
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
    expect(screen.text('.tier[data-tier="helper"] .board-row-info')).toMatch(
      /^10 of 25 /,
    );
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
    expect(screen.text('.tier[data-tier="borer"] .board-row-gain')).toBe(
      "+435/s",
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
      .querySelector<HTMLButtonElement>('.tier[data-tier="borer"]')
      ?.click();
    expect(
      screen.root.querySelector<HTMLElement>(".welcome-back")?.hidden,
    ).toBe(true);
    expect(screen.progress.getSnapshot().mountain.borers).toBe(1);
    // Bought in the Granite, which suits borers (×1.1, D3).
    expect(screen.text('.tier[data-tier="borer"] .board-row-gain')).toBe(
      "+478/s",
    );
    expect(screen.text('.tier[data-tier="helper"] .board-row-info')).toMatch(
      /^11 of 25 /,
    );
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
    expect(relicPage(screen.root, LEGEND_PAGE)).toBeNull();

    screen.dig.click();
    expect(screen.text("#relic-reveal-title")).toBe(
      "You found the Mantle of the Hero",
    );
    expect(relicPage(screen.root, LEGEND_PAGE)).toBeNull();
    screen.root.querySelector<HTMLButtonElement>(".relic-page-carry")?.click();

    // The drawer stays open, on its Legend page (#465).
    const legend = relicPage(screen.root, LEGEND_PAGE);
    expect(legend).not.toBeNull();
    expect(screen.text("#relic-legend-title")).toBe("You became a Legend");
    expect(screen.text(".relic-legend-stats")).toBe(
      `${formatCount(shownStones(createMountain(), MOUNTAIN_STONES))} stones moved. Six relics found. A crew of 1,000 beside you.`,
    );
    expect(legend?.querySelectorAll(".relic-legend-shelf img")).toHaveLength(6);
    expect(document.activeElement).toBe(
      legend?.querySelector(".relic-page-stand"),
    );
    legend?.querySelector<HTMLButtonElement>(".relic-page-stand")?.click();
    expect(relicPage(screen.root, LEGEND_PAGE)).toBeNull();
    expect(
      screen.root.querySelector(RELICS_SHEET)?.classList.contains("is-open"),
    ).toBe(false);
    screen.root.remove();
  });

  it("does not open for other relics", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(999_999)) });
    screen.dig.click();
    screen.root.querySelector<HTMLButtonElement>(".relic-page-carry")?.click();
    expect(relicPage(screen.root, LEGEND_PAGE)).toBeNull();
    expect(
      screen.root.querySelector(RELICS_SHEET)?.classList.contains("is-open"),
    ).toBe(false);
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
    screen.dig.click();
    expect(screen.text(`${REVEAL_PAGE} .relic-page-boost`)).toBe(
      "Your power: Your crew keeps mining up to 24 hours while you're away.",
    );
  });

  it("opens a found relic from the shelf with its art, virtue and power; hidden ones stay shut", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(26_000_000)) });
    document.body.append(screen.root);
    // The shelf opens from the Relic shelf key in a socket's note (#370).
    screen.root.querySelector<HTMLButtonElement>(".board-socket")?.click();
    screen.root
      .querySelector<HTMLButtonElement>(".board-note .board-platebtn")
      ?.click();
    const rows = [...screen.root.querySelectorAll<HTMLElement>(SHELF_ROWS)];
    expect(rows[2]?.getAttribute("aria-label")).toBe(
      "Hammer of the Builder: see your power",
    );
    expect(rows[3]?.classList.contains("is-locked")).toBe(true);

    // A relic not found yet opens nothing (#465: its row blinks, as a row that cannot act).
    rows[3]?.click();
    expect(relicPage(screen.root, DETAIL_PAGE)).toBeNull();
    expect(shelfShown(screen.root)).toBe(true);

    rows[2]?.click();
    const detail = relicPage(screen.root, DETAIL_PAGE);
    expect(detail).not.toBeNull();
    expect(screen.text("#relic-detail-title")).toBe("Hammer of the Builder");
    expect(detail?.querySelector(".relic-page-line")?.textContent).toBe(
      "The virtue of Building.",
    );
    expect(detail?.querySelector(".relic-page-boost")?.textContent).toBe(
      "Your power: Unlocks the Great Machine.",
    );
    expect(detail?.querySelector<HTMLElement>(".relic-keepsakes")?.hidden).toBe(
      true,
    );
    expect(
      detail
        ?.querySelector<HTMLImageElement>(".relic-page-art")
        ?.getAttribute("src"),
    ).toBe(RELIC_LIT.hammer);
    expect(document.activeElement).toBe(
      detail?.querySelector(".relic-page-shelf"),
    );
    detail?.querySelector<HTMLButtonElement>(".relic-page-shelf")?.click();
    expect(relicPage(screen.root, DETAIL_PAGE)).toBeNull();
    expect(shelfShown(screen.root)).toBe(true);

    rows[0]?.click();
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
    // The shelf opens from the Relic shelf key in a socket's note (#370).
    screen.root.querySelector<HTMLButtonElement>(".board-socket")?.click();
    screen.root
      .querySelector<HTMLButtonElement>(".board-note .board-platebtn")
      ?.click();
    screen.root.querySelectorAll<HTMLButtonElement>(SHELF_ROWS)[2]?.click();
    const detail = relicPage(screen.root, DETAIL_PAGE);
    expect(detail?.querySelector<HTMLElement>(".relic-keepsakes")?.hidden).toBe(
      false,
    );
    expect(screen.text(".relic-keepsakes-title")).toBe("Keepsakes");
    const shown = [
      ...screen.root.querySelectorAll<HTMLElement>("[data-keepsake]"),
    ].filter((row) => !row.hidden);
    expect(shown.map((row) => row.dataset["keepsake"])).toEqual([
      "drawing",
      "whistle",
    ]);
    expect(screen.text('[data-keepsake="drawing"] .relic-keepsake-name')).toBe(
      "A child's drawing",
    );
    expect(screen.text('[data-keepsake="drawing"] .relic-keepsake-story')).toBe(
      "A little figure with a lamp, folded for a pocket.",
    );
    // Each keepsake has its own PixelLab icon now, not the old nugget (#465).
    expect(shown[0]?.querySelector("img")?.getAttribute("src")).toBe(
      KEEPSAKE_ART.drawing,
    );
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
  const passPlate = (screen: ReturnType<typeof mountScreen>) =>
    screen.root.querySelector<HTMLButtonElement>(".ledger-pass");

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
    screen.dig.click();
    screen.root.querySelector<HTMLButtonElement>(".relic-page-carry")?.click();
    relicPage(screen.root, LEGEND_PAGE)
      ?.querySelector<HTMLButtonElement>(".relic-page-pass")
      ?.click();

    expect(relicPage(screen.root, LEGEND_PAGE)).toBeNull();
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
    expect(screen.text(STONES_NAME)).toBe(
      `${formatCompact(stonesLeft(createMountain()) * kidStretch(1))} stones left`,
    );
    expect(screen.pocket()).toBe("Stones 0");
    // A new mountain is not a spend.
    expect(screen.text(".board-spend")).toBe("");
    const badge = screen.root.querySelector<HTMLElement>(".legacy-badge");
    expect(badge?.hidden).toBe(false);
    expect(badge?.textContent).toBe("Legacy ×1.5");
    expect(badge?.getAttribute("aria-label")).toBe(
      "Legacy 1: your crew and taps are ×1.5",
    );
    expect(screen.text(RELICS_GOAL)).toContain("Your kid's mine");
    expect(readSessionSave({ storage })?.mountain.legacy).toBe(1);
    screen.root.remove();
  });

  it("waits behind the Ledger's Pass plate at the bottom; 'Not yet' changes nothing", () => {
    const screen = mountScreen({
      storage: seeded(minedMountain(MOUNTAIN_STONES)),
    });
    document.body.append(screen.root);
    const ledger = screen.root.querySelector<HTMLElement>(LEDGER_SHEET);
    const key = screen.root.querySelector(".board-key[data-key=ledger]");
    expect(passPlate(screen)?.hidden).toBe(false);
    screen.openLedger();
    passPlate(screen)?.click();
    expect(ledger?.classList.contains("is-open")).toBe(false);
    expect(dialog(screen)?.hidden).toBe(false);
    dialog(screen)?.querySelector<HTMLButtonElement>(".legacy-cancel")?.click();
    expect(dialog(screen)?.hidden).toBe(true);
    expect(document.activeElement).toBe(key);
    expect(screen.text(STONES_NAME)).toBe("0 stones left");
    screen.openLedger();
    passPlate(screen)?.click();
    dialog(screen)?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(dialog(screen)?.hidden).toBe(true);
    screen.root.remove();
  });

  it("is never offered before the bottom", () => {
    const screen = mountScreen({ storage: seeded(minedMountain(99_000_000)) });
    expect(passPlate(screen)?.hidden).toBe(true);
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
      expect(screen.text('.tier[data-tier="helper"] .board-row-name')).toBe(
        "Worker",
      );
      expect(screen.text('.tier[data-tier="kid"] .board-row-name')).toBe(
        "Kid worker",
      );

      screen.root
        .querySelector<HTMLButtonElement>(".board-key[data-key=upgrades]")
        ?.click();
      expect(
        screen.root
          .querySelector('.board-sheet[data-sheet="upgrades"]')
          ?.classList.contains("is-open"),
      ).toBe(true);
      expect(screen.text('[data-upgrade="boots"] .board-row-info')).toMatch(
        /^Workers \d+(\.\d)?\/s to \d+(\.\d)?\/s\.$/,
      );
      expect(screen.text('[data-upgrade="cartSyn"] .board-row-name')).toBe(
        "Helping hands",
      );
      expect(screen.text('[data-upgrade="cartSyn"] .board-row-info')).toMatch(
        /^Carts \S+\/s to \S+\/s\.$/,
      );
      screen.root
        .querySelector<HTMLButtonElement>(
          '[data-sheet="upgrades"] .board-sheet-back',
        )
        ?.click();

      screen.root
        .querySelector<HTMLButtonElement>(".board-key[data-key=ledger]")
        ?.click();
      expect(
        screen.root.querySelector(LEDGER_SHEET)?.classList.contains("is-open"),
      ).toBe(true);
      screen.root
        .querySelector<HTMLButtonElement>(`${LEDGER_SHEET} .board-sheet-back`)
        ?.click();

      // The shelf opens from the Relic shelf key in a socket's note (#370).
      screen.root.querySelector<HTMLButtonElement>(".board-socket")?.click();
      screen.root
        .querySelector<HTMLButtonElement>(".board-note .board-platebtn")
        ?.click();
      const crown = [...screen.root.querySelectorAll(SHELF_ROWS)][4];
      if (!(crown instanceof HTMLElement)) {
        throw new Error("crown row did not render");
      }
      crown.click();
      expect(relicPage(screen.root, DETAIL_PAGE)).not.toBeNull();
      expect(screen.text(`${DETAIL_PAGE} .relic-page-boost`)).toMatch(
        /count as workers/,
      );
      screen.root
        .querySelector<HTMLButtonElement>(`${DETAIL_PAGE} .relic-page-shelf`)
        ?.click();
      screen.root
        .querySelector<HTMLButtonElement>(`${RELICS_SHEET} .board-sheet-back`)
        ?.click();

      const revealPage = (): HTMLElement => {
        const reveal = relicPage(screen.root, REVEAL_PAGE);
        if (reveal === null) {
          throw new Error("relic reveal did not render");
        }
        return reveal;
      };
      screen.root
        .querySelector<HTMLButtonElement>(".welcome-continue")
        ?.click();
      const crownReveal = revealPage();
      expect(
        crownReveal.querySelector("#relic-reveal-title")?.textContent,
      ).toBe("You found the Crown of Wisdom");
      expect(
        crownReveal.querySelector(".relic-page-power")?.textContent,
      ).toMatch(/count as workers/);
      expect(mentionsHelper(screen.root)).toEqual([]);
      crownReveal
        .querySelector<HTMLButtonElement>(".relic-page-carry")
        ?.click();
      const mantleReveal = revealPage();
      expect(
        mantleReveal.querySelector("#relic-reveal-title")?.textContent,
      ).toBe("You found the Mantle of the Hero");
      mantleReveal
        .querySelector<HTMLButtonElement>(".relic-page-carry")
        ?.click();
      expect(relicPage(screen.root, LEGEND_PAGE)).not.toBeNull();
      expect(screen.text(".relic-legend-stats")).toMatch(/Six relics found/);

      expect(mentionsHelper(screen.root)).toEqual([]);
    } finally {
      screen.root.remove();
    }
  });
});

describe("trouble on a tier row (#149)", () => {
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
      `.tier[data-tier="${id}"]`,
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
    expect(screen.text('.tier[data-tier="cart"] .board-row-info')).toBe(
      "Cave-in! · Hold to fix",
    );
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
    expect(screen.text('.tier[data-tier="cart"] .board-row-info')).toBe(
      "Cave-in! · Hold to fix",
    );
    expect(screen.progress.getSnapshot().mountain.carts).toBe(1);
    cart.click();
    expect(
      screen.text('.board-sheet[data-sheet="buys"] .board-sheet-kick'),
    ).toBe("Fixed! The crew cheers.");
    expect(screen.progress.getSnapshot().mountain.carts).toBe(1);
    expect(screen.progress.getSnapshot().trouble).toBeUndefined();
    expect(screen.text(".crew-status")).toBe(
      "Your crew mines 339 stones a second",
    );
  });

  it("names a flood, a jam, and the Great Machine without numbers", () => {
    const screen = mountScreen();
    screen.progress.applyMutation(() => crew());
    screen.progress.previewTrouble("drill");
    const drill = card(screen, "drill");
    expect(screen.text('.tier[data-tier="drill"] .board-row-info')).toBe(
      "Flood! · Hold to fix",
    );
    expect(drill.getAttribute("aria-label")).not.toMatch(/\d|\?/);
    screen.progress.previewTrouble("borer");
    expect(screen.text('.tier[data-tier="borer"] .board-row-info')).toBe(
      "Jam! · Hold to fix",
    );
    screen.progress.previewTrouble("machine");
    const machine = card(screen, "machine");
    expect(screen.text('.tier[data-tier="machine"] .board-row-info')).toBe(
      "Jam! · Hold to fix",
    );
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
      expect(
        screen.text('.board-sheet[data-sheet="buys"] .board-sheet-kick'),
      ).toBe("Fixed! The crew cheers.");
      expect(screen.progress.getSnapshot().mountain.carts).toBe(1);
      cart.click();
      expect(screen.progress.getSnapshot().mountain.carts).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("engineers sheet (#145)", () => {
  const adaCrew: Mountain = {
    ...minedMountain(0),
    helpers: 20,
    carts: 2,
    drills: 1,
    borers: 1,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
  };
  // Nils's price, and a pocket that covers it with 3M to spare.
  const nilsPrice = promoteCost(adaCrew);
  const withAda = (patch: Partial<Mountain> = {}): Mountain => ({
    ...adaCrew,
    pocket: nilsPrice + 3_000_000,
    ...patch,
  });

  const openSheet = (root: HTMLElement): HTMLElement => {
    const button = root.querySelector<HTMLButtonElement>(
      ".board-key[data-key=engineers]",
    );
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
    const button = screen.root.querySelector<HTMLButtonElement>(
      ".board-key[data-key=engineers]",
    );
    expect(button?.hidden).toBe(false);
    expect(button?.textContent).toContain("Engineers");
    button?.click();
    expect(
      screen.root.querySelector(".engineers-dialog")?.hasAttribute("hidden"),
    ).toBe(true);
    screen.root
      .querySelector<HTMLButtonElement>('.tier[data-tier="borer"]')
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
    const borer = screen.root.querySelector('.tier[data-tier="borer"]');
    const cart = screen.root.querySelector('.tier[data-tier="cart"]');
    expect(borer?.querySelector(".board-row-flag")?.textContent).toMatch(
      /Ada tends · \+78\/s/,
    );
    expect(
      cart?.querySelector(".board-row-flag")?.textContent ?? "",
    ).not.toMatch(/tends/);
    expect(borer?.getAttribute("aria-label")).toContain("Ada tends them.");
    expect(screen.text('.tier[data-tier="borer"] .board-row-gain')).toBe(
      "+435/s",
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
    expect(cart?.querySelector(".board-row-flag")?.textContent).toMatch(
      /Ada tends · \+1\/s/,
    );
    expect(
      borer?.querySelector(".board-row-flag")?.textContent ?? "",
    ).not.toMatch(/tends/);
    expect(screen.text('.tier[data-tier="borer"] .board-row-gain')).toBe(
      "+357/s",
    );
    expect(screen.text('.tier[data-tier="cart"] .board-row-gain')).toBe(
      "+6.8/s",
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
    expect(
      cart?.querySelector(".board-row-flag")?.textContent ?? "",
    ).not.toMatch(/tends/);
    expect(screen.text('.tier[data-tier="cart"] .board-row-gain')).toBe("+6/s");

    ada?.querySelector<HTMLButtonElement>('[data-post="cart"]')?.click();
    (cart as HTMLButtonElement | null)?.click();
    expect(screen.progress.getSnapshot().mountain.carts).toBe(3);
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
    // A fixed clock: on the real one, a slow run lets the crew mine into the pocket.
    const clock = Date.now();
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda(),
      lastSeen: clock,
    });
    const screen = mountScreen({ storage, now: () => clock });
    const sheet = openSheet(screen.root);
    expect(screen.text(".engineer-promote")).toBe(promoteOffer(nilsPrice));
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
    expect(screen.pocket()).toBe(
      `Stones ${odometerFace(nilsPrice + 3_000_000).words}`,
    );

    sheet.querySelector<HTMLButtonElement>(".engineer-promote")?.click();
    sheet.querySelector<HTMLButtonElement>(".engineer-confirm-no")?.click();
    expect(sheet.querySelector<HTMLElement>(".engineer-confirm")?.hidden).toBe(
      true,
    );
    expect(screen.progress.getSnapshot().mountain.helpers).toBe(20);

    sheet.querySelector<HTMLButtonElement>(".engineer-promote")?.click();
    sheet.querySelector<HTMLButtonElement>(".engineer-confirm-yes")?.click();
    expect(screen.pocket()).toBe("Stones 3.000M");
    expect(screen.progress.getSnapshot().mountain.helpers).toBe(19);
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

  it("a promotion shows its spend on the odometer (#409)", () => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: withAda(), lastSeen: Date.now() });
    const screen = mountScreen({ storage });
    const sheet = openSheet(screen.root);
    expect(screen.text(".board-spend")).toBe("");
    sheet.querySelector<HTMLButtonElement>(".engineer-promote")?.click();
    sheet.querySelector<HTMLButtonElement>(".engineer-confirm-yes")?.click();
    expect(screen.progress.getSnapshot().mountain.engineers).toHaveLength(2);
    expect(screen.text(".board-spend")).toBe(`−${formatCompact(nilsPrice)}`);
  });

  it("does not cheer when Step up is no longer affordable", () => {
    // A fixed clock: on the real one, a slow run lets the crew mine into the pocket.
    const clock = Date.now();
    const storage = createMemoryStorage();
    writeSessionSave({
      storage,
      mountain: withAda(),
      lastSeen: clock,
    });
    const screen = mountScreen({ storage, now: () => clock });
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
    expect(promote?.textContent).toBe(promoteOffer(nilsPrice));
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
    expect(screen.text(".engineer-promote")).toBe(promoteOffer(nilsPrice));
    expect(screen.text(".engineer-promote-why")).toBe(promoteNeeds(nilsPrice));
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
