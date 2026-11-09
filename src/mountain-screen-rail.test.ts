// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import { BUYS_SETTLE_MS } from "./mountain-screen";
import { type CloudLoadResult, type CloudSave } from "./cloud-save";
import { type Mountain } from "./mountain";
import {
  createMemoryStorage,
  mountScreen,
  setReducedMotion,
  signedIn,
  stopScreens,
} from "./mountain-screen.harness";
import { engineersNote } from "./screen-words";
import { writeSessionSave } from "./session-save";
import { minedMountain } from "./test-fixtures";

/*
 * The key rail on the mounted screen (#373): its doors, locks, lamps, timers and the New sign.
 * Its own file, so the mountain-screen suites stay within one worker's heap.
 */

beforeEach(() => {
  setReducedMotion(true);
});
afterEach(stopScreens);

describe("the key rail (#373)", () => {
  const CLOCK = 5_000_000;
  const seeded = (mountain: Mountain, lastSeen = Date.now()) => {
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain, lastSeen });
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
  /** play's workshop save: a craft on the bench, axle grease running. */
  const benchBusy = (at: number): Mountain => ({
    ...minedMountain(12_000_000),
    pocket: 50_000,
    helpers: 4,
    carts: 1,
    staffed: 2,
    materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
    recipes: [
      "iron-rails",
      "sturdy-props",
      "blasting-charge",
      "reinforce",
      "axle-grease",
    ],
    bench: {
      recipe: "sturdy-props",
      startedAt: at - 60_000,
      endsAt: at + 9 * 60_000,
    },
    axleUntil: at + 12 * 60_000,
    seen: ["workshop"],
    taught: ["workshop"],
  });
  /** A borer and its engineer, with every note already seen. */
  const crewed = (over: Partial<Mountain> = {}): Mountain => ({
    ...minedMountain(12_000_000),
    pocket: 0,
    helpers: 30,
    carts: 10,
    drills: 6,
    borers: 1,
    engineers: [{ name: "Ada", rank: 0, trips: 1, post: "borer" }],
    seen: ["workshop", "engineers"],
    taught: ["workshop", "engineers", "staffing", "tending"],
    ...over,
  });
  const key = (screen: ReturnType<typeof mountScreen>, id: string) => {
    const found = screen.root.querySelector(`.board-key[data-key="${id}"]`);
    if (!(found instanceof HTMLButtonElement)) throw new Error(`no ${id} key`);
    return found;
  };
  const drawer = (screen: ReturnType<typeof mountScreen>, name: string) => {
    const found = screen.root.querySelector<HTMLElement>(
      `.board-sheet[data-sheet="${name}"]`,
    );
    if (found === null) throw new Error(`no ${name} drawer`);
    return found;
  };
  const isOpen = (screen: ReturnType<typeof mountScreen>, name: string) =>
    drawer(screen, name).classList.contains("is-open");
  const dotOn = (screen: ReturnType<typeof mountScreen>, id: string) =>
    key(screen, id).querySelector(".board-key-dot:not([hidden])") !== null;
  const subOf = (screen: ReturnType<typeof mountScreen>, id: string) => {
    const sub = key(screen, id).querySelector<HTMLElement>(".board-key-sub");
    return sub?.hidden === false ? sub.textContent : "";
  };
  const fingerTap = (el: HTMLElement): void => {
    el.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    el.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, button: 0 }),
    );
    el.click();
  };

  it("the key rail replaces the thumb bar", () => {
    const screen = mountScreen({ storage: seeded(early()) });
    expect(screen.root.querySelector(".thumb-bar")).toBeNull();
    expect(screen.root.querySelector(".menu-button")).toBeNull();
    const rail = screen.root.querySelector(":scope > .board-rail");
    expect(rail?.tagName).toBe("NAV");
    expect(rail?.getAttribute("aria-label")).toBe("Actions");
    expect(
      [...(rail?.querySelectorAll<HTMLElement>(".board-key") ?? [])].map(
        (one) => one.dataset["key"],
      ),
    ).toEqual(["buys", "workshop", "engineers", "upgrades", "ledger"]);
    // Where the thumb bar stood: under the Ready row, ahead of the drawers.
    expect(
      screen.root.querySelector(
        ":scope > .board-ready-row + .board-rail + .board-sign-slot + .board-sheet-clip",
      ),
    ).not.toBeNull();
  });

  it("each key opens its door, and closing gives the key its focus back", () => {
    const screen = mountScreen({
      storage: seeded(crewed(benchBusy(CLOCK)), CLOCK),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    try {
      // Buys and Upgrades open their drawers; Back returns to the key.
      for (const name of ["buys", "upgrades"]) {
        key(screen, name).focus();
        key(screen, name).click();
        expect(isOpen(screen, name)).toBe(true);
        drawer(screen, name)
          .querySelector<HTMLButtonElement>(".board-sheet-back")
          ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        expect(isOpen(screen, name)).toBe(false);
        expect(document.activeElement).toBe(key(screen, name));
      }

      // Workshop opens today's sheet; Escape puts focus back on its key.
      const workshop =
        screen.root.querySelector<HTMLElement>(".workshop-dialog");
      key(screen, "workshop").click();
      expect(workshop?.hidden).toBe(false);
      workshop?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(workshop?.hidden).toBe(true);
      expect(document.activeElement).toBe(key(screen, "workshop"));

      // Engineers opens today's sheet, from its own key.
      const engineers =
        screen.root.querySelector<HTMLElement>(".engineers-dialog");
      key(screen, "engineers").click();
      expect(engineers?.hidden).toBe(false);
      expect(key(screen, "engineers").getAttribute("aria-expanded")).toBe(
        "true",
      );
      engineers?.querySelector<HTMLButtonElement>(".engineers-close")?.click();
      expect(engineers?.hidden).toBe(true);
      expect(document.activeElement).toBe(key(screen, "engineers"));
      expect(key(screen, "engineers").getAttribute("aria-expanded")).toBe(
        "false",
      );

      // The Ledger key opens today's menu until B7.
      const menu = screen.root.querySelector<HTMLElement>(".game-menu");
      key(screen, "ledger").click();
      expect(menu?.hidden).toBe(false);
      expect(key(screen, "ledger").getAttribute("aria-expanded")).toBe("true");
      menu?.querySelector<HTMLButtonElement>(".menu-close")?.click();
      expect(menu?.hidden).toBe(true);
      expect(document.activeElement).toBe(key(screen, "ledger"));
      expect(key(screen, "ledger").getAttribute("aria-expanded")).toBe("false");
    } finally {
      screen.root.remove();
    }
  });

  it("a double tap on a key never closes or buys in the drawer it opens", () => {
    let clock = 10_000;
    const rich = early({ pocket: 5_000_000 });
    const screen = mountScreen({
      storage: seeded(rich, CLOCK),
      now: () => CLOCK,
      tapClock: () => clock,
    });
    const before = screen.progress.getSnapshot().mountain;
    // Buys: the second tap lands on Back 150ms later.
    fingerTap(key(screen, "buys"));
    expect(isOpen(screen, "buys")).toBe(true);
    clock += 150;
    const back = drawer(screen, "buys").querySelector<HTMLButtonElement>(
      ".board-sheet-back",
    );
    if (back === null) throw new Error("no Back");
    back.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    back.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(isOpen(screen, "buys")).toBe(true);
    expect(screen.progress.getSnapshot().mountain).toEqual(before);

    // Upgrades: the second tap lands on its first row.
    clock += 5_000;
    fingerTap(key(screen, "upgrades"));
    expect(isOpen(screen, "upgrades")).toBe(true);
    expect(isOpen(screen, "buys")).toBe(false);
    clock += 150;
    const row = drawer(screen, "upgrades").querySelector<HTMLButtonElement>(
      ".board-row:not([hidden])",
    );
    if (row === null) throw new Error("no row");
    expect(row.classList.contains("is-ready")).toBe(true);
    row.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    row.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    expect(isOpen(screen, "upgrades")).toBe(true);
    expect(screen.progress.getSnapshot().mountain.pocket).toBe(before.pocket);
    expect(screen.progress.getSnapshot().mountain.upgrades).toEqual(
      before.upgrades,
    );
    expect(screen.progress.getSnapshot().mountain.boosts).toEqual(
      before.boosts,
    );
  });

  it("under reduced motion a dear tap in a drawer spends nothing and never paints its lamp red", () => {
    vi.useFakeTimers();
    try {
      let clock = 10_000;
      const screen = mountScreen({
        storage: seeded(early(), CLOCK),
        now: () => CLOCK,
        tapClock: () => clock,
      });
      fingerTap(key(screen, "buys"));
      clock += BUYS_SETTLE_MS + 100;
      const drill = drawer(screen, "buys").querySelector<HTMLButtonElement>(
        'button.board-row.tier[data-tier="drill"]',
      );
      if (drill === null) throw new Error("no drill row");
      expect(drill.classList.contains("is-dear")).toBe(true);
      const lamp = () =>
        drill.querySelector<HTMLElement>(".board-lamp")?.style
          .backgroundPositionX;
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

  it("locked keys: Workshop and Engineers wait, with their unlock lines", () => {
    const screen = mountScreen();
    expect(key(screen, "workshop").disabled).toBe(true);
    expect(key(screen, "workshop").classList.contains("is-locked")).toBe(true);
    expect(subOf(screen, "workshop")).toBe("With the clay");
    expect(key(screen, "workshop").getAttribute("aria-label")).toBe(
      "Workshop, locked. Opens as the clay comes in",
    );
    expect(key(screen, "engineers").disabled).toBe(true);
    expect(subOf(screen, "engineers")).toBe("With 1st borer");
    expect(key(screen, "engineers").getAttribute("aria-label")).toBe(
      "Engineers, locked until the first tunnel borer",
    );
    for (const open of ["buys", "upgrades", "ledger"]) {
      expect(key(screen, open).disabled).toBe(false);
    }
    // A locked key opens nothing.
    key(screen, "workshop").click();
    key(screen, "engineers").click();
    expect(
      screen.root.querySelector<HTMLElement>(".workshop-dialog")?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>(".engineers-dialog")?.hidden,
    ).toBe(true);
  });

  it("red lamps: staffing teaching, and trouble on a tier with no bay", () => {
    // Ten carts, too few hands to run them: staffing is still to be taught.
    const short = mountScreen({
      storage: seeded({
        ...minedMountain(20_000_000),
        pocket: 2_000_000,
        helpers: 6,
        carts: 10,
        seen: ["workshop"],
        taught: ["workshop"],
      }),
    });
    expect(dotOn(short, "buys")).toBe(true);

    // The Great Machine era: the bays are drill, borer and machine.
    const screen = mountScreen({
      storage: seeded({
        ...minedMountain(125_000_000),
        pocket: 0,
        helpers: 40,
        carts: 10,
        drills: 4,
        borers: 2,
        taught: ["workshop", "staffing"],
        seen: ["workshop"],
      }),
    });
    expect(dotOn(screen, "buys")).toBe(false);
    screen.progress.previewTrouble("cart");
    expect(screen.progress.getSnapshot().trouble?.kind).toBe("cave-in");
    expect(dotOn(screen, "buys")).toBe(true);
    expect(key(screen, "buys").getAttribute("aria-label")).toMatch(/^Buys\. /);
    // Fixed on its row in the drawer: the lamp goes out.
    key(screen, "buys").click();
    expect(isOpen(screen, "buys")).toBe(true);
    const row = screen.root.querySelector<HTMLButtonElement>(
      '.board-sheet[data-sheet="buys"] .tier[data-tier="cart"]',
    );
    if (row === null) throw new Error("no cart row");
    for (
      let tap = 0;
      tap < 10 && screen.progress.getSnapshot().trouble !== undefined;
      tap += 1
    ) {
      row.click();
    }
    expect(screen.progress.getSnapshot().trouble).toBeUndefined();
    expect(dotOn(screen, "buys")).toBe(false);
    expect(key(screen, "buys").getAttribute("aria-label")).toBe("Buys");
  });

  it("timers on keys: the bench clock under Workshop ticks down", () => {
    vi.useFakeTimers();
    try {
      let at = CLOCK;
      const screen = mountScreen({
        storage: seeded(benchBusy(CLOCK), CLOCK),
        now: () => at,
      });
      expect(subOf(screen, "workshop")).toBe("9:00");
      expect(
        key(screen, "workshop")
          .querySelector(".board-key-sub")
          ?.classList.contains("board-num"),
      ).toBe(true);
      expect(key(screen, "workshop").getAttribute("aria-label")).toBe(
        "Workshop, bench 9:00 left",
      );
      at += 1_000;
      vi.advanceTimersByTime(1_000);
      expect(subOf(screen, "workshop")).toBe("8:59");
    } finally {
      vi.useRealTimers();
    }
  });

  it("the New sign stands over its key, and waits for an open drawer", () => {
    vi.useFakeTimers();
    try {
      const screen = mountScreen({
        storage: seeded(
          crewed({
            engineers: [],
            borers: 0,
            seen: ["workshop"],
            taught: ["workshop"],
          }),
        ),
      });
      document.body.append(screen.root);
      const sign = () =>
        screen.root.querySelector<HTMLElement>(
          ".board-sign-slot:not([hidden])",
        );
      key(screen, "buys").click();
      expect(isOpen(screen, "buys")).toBe(true);
      // The first engineer arrives under the open drawer.
      screen.progress.applyMutation((current) => ({
        ...current,
        borers: 1,
        engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
      }));
      vi.advanceTimersByTime(1_000);
      expect(sign()).toBeNull();
      drawer(screen, "buys")
        .querySelector<HTMLButtonElement>(".board-sheet-back")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      expect(isOpen(screen, "buys")).toBe(false);
      vi.advanceTimersByTime(1_000);
      expect(sign()?.textContent).toBe(engineersNote("Ada"));
      expect(sign()?.dataset["key"]).toBe("engineers");
      expect(key(screen, "engineers").getAttribute("aria-label")).toBe(
        `Engineers. ${engineersNote("Ada")}`,
      );
      key(screen, "ledger").dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      expect(sign()).toBeNull();
      expect(key(screen, "engineers").getAttribute("aria-label")).toBe(
        "Engineers",
      );
      expect(dotOn(screen, "engineers")).toBe(true);
      screen.root.remove();
    } finally {
      vi.useRealTimers();
    }
  });

  it("the Workshop sheet gives focus back to the door it opened from", () => {
    const screen = mountScreen({
      storage: seeded(crewed(benchBusy(CLOCK)), CLOCK),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    try {
      const sheet = screen.root.querySelector<HTMLElement>(".workshop-dialog");
      const escape = (): void => {
        sheet?.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      };
      // From its key.
      key(screen, "workshop").click();
      expect(sheet?.hidden).toBe(false);
      escape();
      expect(document.activeElement).toBe(key(screen, "workshop"));
      // From the menu's Workshop row: back to the Ledger key that opened the menu.
      key(screen, "ledger").click();
      screen.root.querySelector<HTMLButtonElement>(".workshop-open")?.click();
      expect(sheet?.hidden).toBe(false);
      expect(screen.root.querySelector<HTMLElement>(".game-menu")?.hidden).toBe(
        true,
      );
      escape();
      expect(document.activeElement).toBe(key(screen, "ledger"));
      // From its key again: the key once more.
      key(screen, "workshop").click();
      escape();
      expect(document.activeElement).toBe(key(screen, "workshop"));
    } finally {
      screen.root.remove();
    }
  });

  it("the Workshop sheet falls back to the Ledger key when its key is held by a re-load", async () => {
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
      storage: seeded(crewed(benchBusy(CLOCK)), CLOCK),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    try {
      const sheet = screen.root.querySelector<HTMLElement>(".workshop-dialog");
      key(screen, "workshop").click();
      expect(sheet?.hidden).toBe(false);
      await auth.signIn();
      await Promise.resolve();
      expect(screen.progress.getSnapshot().ready).toBe(false);
      expect(key(screen, "workshop").disabled).toBe(true);
      if (sheet?.hidden === false) {
        sheet.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        );
      }
      expect(sheet?.hidden).toBe(true);
      expect(document.activeElement).toBe(key(screen, "ledger"));
    } finally {
      screen.root.remove();
    }
  });

  it("every key says whether its sheet or drawer is open", () => {
    const screen = mountScreen({
      storage: seeded(crewed(benchBusy(CLOCK)), CLOCK),
      now: () => CLOCK,
    });
    const expanded = () =>
      ["buys", "workshop", "engineers", "upgrades", "ledger"].map((id) =>
        key(screen, id).getAttribute("aria-expanded"),
      );
    expect(expanded()).toEqual(["false", "false", "false", "false", "false"]);
    key(screen, "buys").click();
    expect(expanded()).toEqual(["true", "false", "false", "false", "false"]);
    key(screen, "upgrades").click();
    expect(expanded()).toEqual(["false", "false", "false", "true", "false"]);
    drawer(screen, "upgrades")
      .querySelector<HTMLButtonElement>(".board-sheet-back")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(expanded()).toEqual(["false", "false", "false", "false", "false"]);
    // A bay opens Buys: its key says so.
    screen.root.querySelector<HTMLButtonElement>(".board-bay")?.click();
    expect(isOpen(screen, "buys")).toBe(true);
    expect(expanded()[0]).toBe("true");
    drawer(screen, "buys")
      .querySelector<HTMLButtonElement>(".board-sheet-back")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    key(screen, "workshop").click();
    expect(expanded()).toEqual(["false", "true", "false", "false", "false"]);
    screen.root
      .querySelector<HTMLElement>(".workshop-dialog")
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    expect(expanded()).toEqual(["false", "false", "false", "false", "false"]);
  });

  it("a save that loads again takes the keys' dots, lit caps and timers away", async () => {
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
      storage: seeded(
        crewed({ ...benchBusy(CLOCK), pocket: 5_000_000, taught: [] }),
        CLOCK,
      ),
      now: () => CLOCK,
    });
    expect(subOf(screen, "workshop")).toBe("9:00");
    expect(screen.root.querySelector(".board-key.is-lit")).not.toBeNull();
    expect(
      screen.root.querySelector(".board-key-dot:not([hidden])"),
    ).not.toBeNull();
    await auth.signIn();
    await Promise.resolve();
    expect(screen.progress.getSnapshot().ready).toBe(false);
    expect(screen.root.querySelector(".board-key.is-lit")).toBeNull();
    expect(screen.root.querySelector(".board-key.is-locked")).toBeNull();
    expect(
      screen.root.querySelector(".board-key-dot:not([hidden])"),
    ).toBeNull();
    expect(
      screen.root.querySelector(".board-key-sub:not([hidden])"),
    ).toBeNull();
    expect(key(screen, "workshop").disabled).toBe(true);
    expect(key(screen, "engineers").disabled).toBe(true);
    expect(key(screen, "workshop").getAttribute("aria-label")).toBe("Workshop");
  });

  it("timers on keys: the soonest trip ticks under Engineers", () => {
    vi.useFakeTimers();
    try {
      let at = CLOCK;
      const screen = mountScreen({
        storage: seeded(
          crewed({
            engineers: [{ name: "Ada", rank: 0, trips: 1, post: "tunnel" }],
            expeditions: [
              {
                engineer: "Ada",
                tunnel: "side-seam",
                sentAt: CLOCK - 60_000,
                returnsAt: CLOCK + 12 * 60_000 + 3_000,
                home: "borer",
                find: { kind: "quiet" },
              },
            ],
          }),
          CLOCK,
        ),
        now: () => at,
      });
      expect(subOf(screen, "engineers")).toBe("12:03");
      expect(key(screen, "engineers").getAttribute("aria-label")).toBe(
        "Engineers, back in 12:03",
      );
      at += 1_000;
      vi.advanceTimersByTime(1_000);
      expect(subOf(screen, "engineers")).toBe("12:02");
    } finally {
      vi.useRealTimers();
    }
  });

  it("opening one drawer closes the other", () => {
    const screen = mountScreen({ storage: seeded(early()) });
    key(screen, "buys").click();
    expect(isOpen(screen, "buys")).toBe(true);
    key(screen, "upgrades").click();
    expect(isOpen(screen, "upgrades")).toBe(true);
    expect(isOpen(screen, "buys")).toBe(false);
    key(screen, "buys").click();
    expect(isOpen(screen, "buys")).toBe(true);
    expect(isOpen(screen, "upgrades")).toBe(false);
  });

  it("the save line opens its drawer over an open drawer", () => {
    const screen = mountScreen({ storage: seeded(early()) });
    document.body.append(screen.root);
    try {
      key(screen, "buys").click();
      expect(isOpen(screen, "buys")).toBe(true);
      screen.root.querySelector<HTMLElement>(".save-status")?.click();
      expect(
        screen.root.querySelector(".board-save-drawer.is-open"),
      ).not.toBeNull();
      expect(isOpen(screen, "buys")).toBe(true);
    } finally {
      screen.root.remove();
    }
  });

  it("Escape with the save drawer open over Buys closes only the save drawer", () => {
    const screen = mountScreen({ storage: seeded(early()) });
    document.body.append(screen.root);
    try {
      key(screen, "buys").click();
      screen.root.querySelector<HTMLElement>(".save-status")?.click();
      expect(
        screen.root.querySelector(".board-save-drawer.is-open"),
      ).not.toBeNull();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(
        screen.root.querySelector(".board-save-drawer.is-open"),
      ).toBeNull();
      expect(isOpen(screen, "buys")).toBe(true);
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(isOpen(screen, "buys")).toBe(false);
    } finally {
      screen.root.remove();
    }
  });

  it("Escape with the save drawer open over Upgrades closes only the save drawer", () => {
    const screen = mountScreen({ storage: seeded(early()) });
    document.body.append(screen.root);
    try {
      key(screen, "upgrades").click();
      screen.root.querySelector<HTMLElement>(".save-status")?.click();
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(
        screen.root.querySelector(".board-save-drawer.is-open"),
      ).toBeNull();
      expect(isOpen(screen, "upgrades")).toBe(true);
    } finally {
      screen.root.remove();
    }
  });

  it("an Engineers sheet that closes while its key is held gives focus to the Ledger key", () => {
    const screen = mountScreen({
      storage: seeded(crewed(benchBusy(CLOCK)), CLOCK),
      now: () => CLOCK,
    });
    document.body.append(screen.root);
    try {
      key(screen, "engineers").click();
      // A re-load takes the borer: the Engineers key is held again.
      screen.progress.applyMutation((current) => ({
        ...current,
        borers: 0,
        engineers: [],
      }));
      expect(key(screen, "engineers").disabled).toBe(true);
      screen.root.querySelector<HTMLButtonElement>(".engineers-close")?.click();
      expect(document.activeElement).toBe(key(screen, "ledger"));
    } finally {
      screen.root.remove();
    }
  });

  it("until the save is in, no key shows a dot, a lit cap or a sub-line", async () => {
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
    expect(screen.progress.getSnapshot().ready).toBe(false);
    const keys = [...screen.root.querySelectorAll<HTMLElement>(".board-key")];
    expect(keys).toHaveLength(5);
    expect(
      screen.root.querySelector(".board-key-dot:not([hidden])"),
    ).toBeNull();
    expect(screen.root.querySelector(".board-key.is-lit")).toBeNull();
    expect(screen.root.querySelector(".board-key.is-locked")).toBeNull();
    expect(
      screen.root.querySelector(".board-key-sub:not([hidden])"),
    ).toBeNull();
    expect(key(screen, "workshop").disabled).toBe(true);
    expect(key(screen, "engineers").disabled).toBe(true);
    finishLoad({
      kind: "found",
      mountain: crewed(benchBusy(Date.now())),
      rev: 1,
    });
    await Promise.resolve();
    expect(screen.progress.getSnapshot().ready).toBe(true);
    expect(key(screen, "workshop").disabled).toBe(false);
    expect(key(screen, "engineers").disabled).toBe(false);
  });

  describe("a finger's close of a drawer settles the keys under Back", () => {
    /** A finger's tap whose click has its pointer (detail 1), as a phone sends it. */
    const touch = (el: HTMLElement): void => {
      el.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
      el.dispatchEvent(
        new PointerEvent("pointerup", { bubbles: true, button: 0 }),
      );
      el.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      );
    };
    const back = (screen: ReturnType<typeof mountScreen>, name: string) => {
      const found = drawer(screen, name).querySelector<HTMLButtonElement>(
        ".board-sheet-back",
      );
      if (found === null) throw new Error(`no Back on ${name}`);
      return found;
    };
    /** Buys open and settled, on a tap clock the test moves. */
    const buysOpen = () => {
      const clock = { value: 10_000 };
      const screen = mountScreen({
        storage: seeded(crewed(), CLOCK),
        now: () => CLOCK,
        tapClock: () => clock.value,
      });
      touch(key(screen, "buys"));
      expect(isOpen(screen, "buys")).toBe(true);
      clock.value += 500;
      return { clock, screen };
    };
    const engineersShown = (screen: ReturnType<typeof mountScreen>) =>
      screen.root.querySelector<HTMLElement>(".engineers-dialog")?.hidden ===
      false;

    it("a double tap on a drawer's Back opens no key under it", () => {
      const { clock, screen } = buysOpen();
      touch(back(screen, "buys"));
      expect(isOpen(screen, "buys")).toBe(false);
      // The second tap of the double tap lands on the key under Back.
      clock.value += 150;
      touch(key(screen, "engineers"));
      expect(engineersShown(screen)).toBe(false);
      expect(key(screen, "engineers").getAttribute("aria-expanded")).toBe(
        "false",
      );
      touch(key(screen, "upgrades"));
      expect(isOpen(screen, "upgrades")).toBe(false);
      // Past the settle, the key opens.
      clock.value += 400;
      touch(key(screen, "engineers"));
      expect(engineersShown(screen)).toBe(true);
    });

    it("Back by keyboard, then a key tap opens at once", () => {
      const { clock, screen } = buysOpen();
      back(screen, "buys").click();
      expect(isOpen(screen, "buys")).toBe(false);
      clock.value += 150;
      touch(key(screen, "upgrades"));
      expect(isOpen(screen, "upgrades")).toBe(true);
    });

    it("the scrim's close leaves a key tap acting", () => {
      const { clock, screen } = buysOpen();
      const scrim = screen.root.querySelector<HTMLElement>(".board-scrim");
      if (scrim === null) throw new Error("no scrim");
      scrim.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
      );
      expect(isOpen(screen, "buys")).toBe(false);
      clock.value += 150;
      touch(key(screen, "upgrades"));
      expect(isOpen(screen, "upgrades")).toBe(true);
    });
  });
});
