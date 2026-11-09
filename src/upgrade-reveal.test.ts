// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { createMountain, type Mountain } from "./mountain";
import { mountMountainScreen } from "./mountain-screen";
import { createProgressStore } from "./progress-store";

beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce"),
  })) as unknown as typeof window.matchMedia;
});

const tile =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function memoryStorage(): Storage {
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

function mount(now: () => number) {
  const root = document.createElement("div");
  const progress = createProgressStore({
    auth: createUnconfiguredAuth(),
    sessionStorage: memoryStorage(),
    cloudWriteGapMs: 0,
    now,
  });
  mountMountainScreen({
    root,
    lanternUrl: tile,
    mountainUrl: tile,
    stoneUrl: tile,
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
    progress,
    now,
    random: () => 0,
  });
  document.body.append(root);
  return { root, progress };
}

import {
  anyHiddenRow,
  boostShown,
  shownRows,
  upgradeShown,
} from "./upgrade-reveal";
import { boostById } from "./boosts";
import { upgradeById, upgradeCost } from "./upgrades";
import { BAND_SCALE } from "./scale";
import { UPGRADES_INTRO, UPGRADES_MORE } from "./screen-words";
import { formatCompact } from "./format";
import { MOUNTAIN_STONES } from "./mountain";
import { showsDot } from "./teach";

const arms = upgradeById("tap");

/** A price that must exist: the upgrade is not maxed. */
function mustPrice(price: number | undefined): number {
  if (price === undefined) {
    throw new Error("expected a price");
  }
  return price;
}

describe("rows open at a fixed point in the climb (#250)", () => {
  it("shows an upgrade at its owned count, never for a full pocket", () => {
    const start = createMountain();
    expect(upgradeShown({ ...start, pocket: 1e12 }, arms)).toBe(false);
    expect(upgradeShown({ ...start, carts: 2 }, arms)).toBe(false);
    expect(upgradeShown({ ...start, carts: 3 }, arms)).toBe(true);
    const boots = upgradeById("boots");
    expect(upgradeShown({ ...start, pocket: 1e12, helpers: 9 }, boots)).toBe(
      false,
    );
    expect(upgradeShown({ ...start, helpers: 10 }, boots)).toBe(true);
  });

  it("shows a boost with the first machine of its tier, never for a full pocket", () => {
    const start = createMountain();
    const sharper = boostById("sharper");
    const overtime = boostById("overtime");
    expect(boostShown({ ...start, pocket: 1e12 }, sharper)).toBe(false);
    expect(boostShown({ ...start, carts: 1 }, sharper)).toBe(true);
    expect(boostShown({ ...start, carts: 1 }, overtime)).toBe(false);
    expect(boostShown({ ...start, drills: 1 }, overtime)).toBe(true);
  });

  it("keeps a row once bought or seen", () => {
    const start = createMountain();
    expect(upgradeShown(start, arms)).toBe(false);
    expect(upgradeShown({ ...start, seen: ["upgrade:tap"] }, arms)).toBe(true);
    expect(upgradeShown({ ...start, upgrades: { tap: 1 } }, arms)).toBe(true);
    const sharper = boostById("sharper");
    expect(boostShown(start, sharper)).toBe(false);
    expect(boostShown({ ...start, boosts: { sharper: 0 } }, sharper)).toBe(
      true,
    );
    expect(boostShown({ ...start, seen: ["boost:sharper"] }, sharper)).toBe(
      true,
    );
  });

  it("lists the rows showing, and says when some still hide", () => {
    const climbing = { ...createMountain(), carts: 3, drills: 1 };
    expect(shownRows(climbing)).toEqual([
      "boost:sharper",
      "boost:overtime",
      "upgrade:tap",
      "upgrade:steady",
    ]);
    expect(anyHiddenRow(climbing)).toBe(true);
    expect(anyHiddenRow(createMountain())).toBe(true);
    const maxed: Mountain = {
      ...createMountain(),
      helpers: 10,
      carts: 5,
      drills: 5,
      borers: 3,
      machines: 1,
      upgrades: {
        tap: 10,
        boots: 1,
        steady: 1,
        cartSyn: 1,
        drillSyn: 1,
        borerSyn: 1,
        machineSyn: 1,
      },
      boosts: { sharper: 0, overtime: 0 },
    };
    expect(anyHiddenRow(maxed)).toBe(false);
  });

  it("puts a dot on each row that shows and is not bought yet", () => {
    const open = { ...createMountain(), carts: 3 };
    expect(showsDot(open, "upgrade:tap")).toBe(true);
    expect(showsDot(createMountain(), "upgrade:tap")).toBe(false);
    expect(showsDot({ ...open, upgrades: { tap: 1 } }, "upgrade:tap")).toBe(
      false,
    );
  });
});

describe("upgrades drawer reveal (#245)", () => {
  const clock = 1_700_000_000_000;
  const row = (root: HTMLElement, id: string) =>
    root.querySelector<HTMLButtonElement>(`.board-row[data-upgrade="${id}"]`);
  const drawer = (root: HTMLElement) =>
    root.querySelector<HTMLElement>('.board-sheet[data-sheet="upgrades"]');
  const kick = (root: HTMLElement) =>
    drawer(root)?.querySelector(".board-sheet-kick")?.textContent;
  /** The section legends showing, top to bottom. */
  const sections = (root: HTMLElement) =>
    [...(drawer(root)?.querySelectorAll<HTMLElement>(".board-sec") ?? [])]
      .filter((sec) => !sec.hidden)
      .map((sec) => sec.textContent);
  /** The first row under a section's legend. */
  const firstIn = (root: HTMLElement, name: string) =>
    [...(drawer(root)?.querySelectorAll<HTMLElement>(".board-sec") ?? [])].find(
      (sec) => sec.textContent === name,
    )?.nextElementSibling;

  it("prices a lasting upgrade by the band it stands in (#356)", () => {
    const screen = mount(() => clock);
    const price = mustPrice(
      upgradeCost(upgradeById("boots"), 0, BAND_SCALE[2]),
    );
    const caves = (pocket: number): Mountain => ({
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 45_000_000,
      helpers: 10,
      pocket,
    });
    screen.progress.applyMutation(() => caves(price - 1));
    screen.root
      .querySelector<HTMLElement>(".board-key[data-key=upgrades]")
      ?.click();
    const boots = () => row(screen.root, "boots");
    const buy = () => boots()?.querySelector(".board-row-price");
    expect(buy()?.textContent).toBe(formatCompact(price));
    expect(boots()?.classList.contains("is-dear")).toBe(true);
    screen.progress.applyMutation(() => caves(price));
    expect(buy()?.textContent).toBe(formatCompact(price));
    expect(boots()?.classList.contains("is-can")).toBe(true);
    screen.root.remove();
  });

  it("quotes the same first upgrade price on the how card as on its button (#356)", () => {
    const screen = mount(() => clock);
    const price = mustPrice(upgradeCost(arms, 0, BAND_SCALE[2]));
    screen.progress.applyMutation(() => ({
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 45_000_000,
      helpers: 10,
      carts: 3,
      pocket: 0,
    }));
    screen.root
      .querySelector<HTMLElement>(".board-key[data-key=upgrades]")
      ?.click();
    const buy = row(screen.root, "tap")?.querySelector(".board-row-price");
    expect(buy?.textContent).toBe(formatCompact(price));
    const card = screen.root.querySelector<HTMLElement>(
      '[data-how="upgrades"] .teach-how-steps li span',
    );
    expect(card?.textContent).toBe(
      `Upgrades start at ${formatCompact(price)} stones and last the whole mountain.`,
    );
    screen.root.remove();
  });

  it("hides everything far off, with one quiet line and no dot", () => {
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => createMountain());
    const button = screen.root.querySelector<HTMLElement>(
      ".board-key[data-key=upgrades]",
    );
    expect(button?.querySelector(".board-key-dot:not([hidden])")).toBeNull();
    button?.click();
    expect(row(screen.root, "tap")?.hidden).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>('.board-row[data-boost="sharper"]')
        ?.hidden,
    ).toBe(true);
    const more = drawer(screen.root)?.querySelector<HTMLElement>(
      ".board-sheet-foot",
    );
    expect(more?.hidden).toBe(false);
    expect(more?.textContent).toBe(UPGRADES_MORE);
    expect(kick(screen.root)).toBe("Boosts for tonight, gear for good");
    expect(screen.root.querySelector(".teach-new")).toBeNull();
    screen.root.remove();
  });

  it("shows an opened row with a dot, a New card on top, and keeps it after a dip", () => {
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => ({
      ...createMountain(),
      carts: 3,
      // Short of the first level, so the button is greyed.
      pocket: Math.floor(mustPrice(upgradeCost(arms, 0)) * 0.65),
      upgrades: { steady: 1 },
      boosts: { sharper: 0, overtime: 0 },
    }));
    const button = screen.root.querySelector<HTMLElement>(
      ".board-key[data-key=upgrades]",
    );
    expect(
      button?.querySelector(".board-key-dot:not([hidden])"),
    ).not.toBeNull();
    button?.click();
    const tap = row(screen.root, "tap");
    expect(tap?.hidden).toBe(false);
    expect(tap?.classList.contains("teach-new")).toBe(true);
    expect(tap?.querySelector(".board-row-flag")?.textContent).toBe("New");
    expect(tap?.querySelector(".board-row-price")?.textContent).toBe(
      formatCompact(mustPrice(upgradeCost(arms, 0))),
    );
    expect(tap?.classList.contains("is-dear")).toBe(true);
    expect(firstIn(screen.root, "Lasting upgrades")).toBe(tap);
    expect(kick(screen.root)).toBe(UPGRADES_INTRO);
    expect(sections(screen.root)[0]).toBe("Lasting upgrades");
    expect(kick(screen.root)).not.toContain("?");
    expect(screen.progress.getSnapshot().mountain.seen).toContain(
      "upgrade:tap",
    );
    screen.progress.applyMutation((current) => ({ ...current, pocket: 0 }));
    expect(row(screen.root, "tap")?.hidden).toBe(false);
    screen.progress.applyMutation((current) => ({
      ...current,
      pocket: mustPrice(upgradeCost(arms, 0)),
    }));
    row(screen.root, "tap")?.click();
    expect(screen.progress.getSnapshot().mountain.upgrades?.tap).toBe(1);
    expect(row(screen.root, "tap")?.classList.contains("teach-new")).toBe(
      false,
    );
    expect(button?.querySelector(".board-key-dot:not([hidden])")).toBeNull();
    expect(kick(screen.root)).toBe("Boosts for tonight, gear for good");
    screen.root.remove();
  });

  it("puts a new boost first when that is the one to try", () => {
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => ({
      ...createMountain(),
      carts: 1,
      pocket: 400,
      upgrades: { tap: 1 },
    }));
    screen.root
      .querySelector<HTMLElement>(".board-key[data-key=upgrades]")
      ?.click();
    const sharper = screen.root.querySelector<HTMLElement>(
      '.board-row[data-boost="sharper"]',
    );
    expect(sharper?.classList.contains("teach-new")).toBe(true);
    expect(sharper?.querySelector(".board-row-flag")?.textContent).toBe("New");
    expect(firstIn(screen.root, "Quick boosts")).toBe(sharper);
    expect(kick(screen.root)).toBe(UPGRADES_INTRO);
    expect(sections(screen.root)[0]).toBe("Quick boosts");
    screen.root.remove();
  });

  it("drops the 'on top' kick once the New flag moves to a row that is not on top", () => {
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => ({
      ...createMountain(),
      carts: 1,
      pocket: 400,
      upgrades: { tap: 1 },
    }));
    screen.root
      .querySelector<HTMLElement>(".board-key[data-key=upgrades]")
      ?.click();
    expect(kick(screen.root)).toBe(UPGRADES_INTRO);
    // He buys the New row: the flag passes to another row, and the frozen order holds.
    screen.root
      .querySelector<HTMLElement>('.board-row[data-boost="sharper"]')
      ?.click();
    const flagged = screen.root.querySelector(".board-row.teach-new");
    const first = screen.root.querySelector(
      ".board-sheet[data-sheet=upgrades] .board-row:not([hidden])",
    );
    expect(flagged).not.toBeNull();
    expect(flagged).not.toBe(first);
    expect(kick(screen.root)).toBe("Boosts for tonight, gear for good");
    screen.root.remove();
  });

  it("opening an open drawer again does not reorder or mark rows seen again", () => {
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => ({
      ...createMountain(),
      carts: 1,
      pocket: 400,
      upgrades: { tap: 1 },
    }));
    const key = screen.root.querySelector<HTMLElement>(
      ".board-key[data-key=upgrades]",
    );
    key?.click();
    const before = [
      ...screen.root.querySelectorAll(
        ".board-sheet[data-sheet=upgrades] .board-row",
      ),
    ];
    screen.progress.applyMutation((current) => ({
      ...current,
      pocket: 50_000_000,
      carts: 5,
    }));
    const seen = screen.progress.getSnapshot().mountain.seen;
    key?.click();
    expect([
      ...screen.root.querySelectorAll(
        ".board-sheet[data-sheet=upgrades] .board-row",
      ),
    ]).toEqual(before);
    expect(screen.progress.getSnapshot().mountain.seen).toEqual(seen);
    screen.root.remove();
  });

  it("opens How it works for upgrades and boosts from the i, with one way back", () => {
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => ({
      ...createMountain(),
      pocket: 30_000,
    }));
    screen.root
      .querySelector<HTMLElement>(".board-key[data-key=upgrades]")
      ?.click();
    const sheet = drawer(screen.root);
    const head = sheet?.querySelector(".board-sheet-head");
    expect(head?.querySelector("h2")?.textContent).toBe("Upgrades");
    head?.querySelector<HTMLButtonElement>(".teach-info")?.click();
    const how = sheet?.querySelector<HTMLElement>(".board-sheet-how");
    expect(how?.hidden).toBe(false);
    expect(
      [...(how?.querySelectorAll<HTMLElement>(".teach-how") ?? [])].map(
        (card) => card.dataset["how"],
      ),
    ).toEqual(["upgrades", "boosts"]);
    const backs = [
      ...(how?.querySelectorAll<HTMLButtonElement>(".teach-how-back") ?? []),
    ].filter((button) => !button.hidden);
    expect(backs).toHaveLength(1);
    expect(sheet?.querySelector<HTMLElement>(".board-sheet-list")?.hidden).toBe(
      true,
    );
    backs[0]?.click();
    expect(how?.hidden).toBe(true);
    sheet?.querySelector<HTMLButtonElement>(".teach-info")?.click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(sheet?.classList.contains("is-open")).toBe(false);
    screen.root
      .querySelector<HTMLElement>(".board-key[data-key=upgrades]")
      ?.click();
    expect(how?.hidden).toBe(true);
    screen.root.remove();
  });

  it("lights the Upgrades key live with the pocket, beside the dot; Buys never lights; a locked key never lights (#373)", () => {
    let clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    const key = (id: string) =>
      screen.root.querySelector<HTMLButtonElement>(
        `.board-rail .board-key[data-key=${id}]`,
      );
    screen.progress.applyMutation(() => ({
      ...createMountain(),
      carts: 3,
      upgrades: { steady: 1 },
      boosts: { sharper: 0 },
      pocket: 0,
    }));
    expect(key("buys")?.classList.contains("is-lit")).toBe(false);
    expect(key("upgrades")?.classList.contains("is-lit")).toBe(false);
    screen.progress.applyMutation((current) => ({
      ...current,
      pocket: 60_000,
    }));
    clock += 1000;
    // The Ready now plate and the bay lamps say what Buys can buy.
    expect(key("buys")?.classList.contains("is-lit")).toBe(false);
    const upgrades = key("upgrades");
    expect(upgrades?.classList.contains("is-lit")).toBe(true);
    expect(upgrades?.getAttribute("aria-label")).toBe(
      "Upgrades, one is affordable",
    );
    expect(
      upgrades?.querySelector(".board-key-dot:not([hidden])"),
    ).not.toBeNull();
    const workshop = key("workshop");
    expect(workshop?.disabled).toBe(true);
    expect(workshop?.classList.contains("is-lit")).toBe(false);
    screen.progress.applyMutation((current) => ({ ...current, pocket: 0 }));
    expect(upgrades?.classList.contains("is-lit")).toBe(false);
    screen.root.remove();
  });
});
