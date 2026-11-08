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
    upgradesUrl: tile,
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
import { buyPriceWords } from "./screen-words";
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

describe("upgrades sheet reveal (#245)", () => {
  const clock = 1_700_000_000_000;
  const row = (root: HTMLElement, id: string) =>
    root.querySelector<HTMLElement>(`[data-upgrade="${id}"]`);

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
    screen.root.querySelector<HTMLElement>(".upgrades-button")?.click();
    const buy = () =>
      row(screen.root, "boots")?.querySelector<HTMLButtonElement>(
        ".upgrade-buy",
      );
    expect(buy()?.textContent).toBe(buyPriceWords(price));
    expect(buy()?.disabled).toBe(true);
    screen.progress.applyMutation(() => caves(price));
    expect(buy()?.textContent).toBe(buyPriceWords(price));
    expect(buy()?.disabled).toBe(false);
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
    screen.root.querySelector<HTMLElement>(".upgrades-button")?.click();
    const buy = row(screen.root, "tap")?.querySelector<HTMLButtonElement>(
      ".upgrade-buy",
    );
    expect(buy?.textContent).toBe(buyPriceWords(price));
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
    const button = screen.root.querySelector<HTMLElement>(".upgrades-button");
    expect(button?.querySelector(".teach-dot")).toBeNull();
    button?.click();
    expect(row(screen.root, "tap")?.hidden).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>('li[data-boost="sharper"]')
        ?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>(".upgrades-more")?.hidden,
    ).toBe(false);
    expect(
      screen.root.querySelector<HTMLElement>(".upgrades-intro")?.hidden,
    ).toBe(true);
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
    const button = screen.root.querySelector<HTMLElement>(".upgrades-button");
    expect(button?.querySelector(".teach-dot")).not.toBeNull();
    button?.click();
    const tap = row(screen.root, "tap");
    expect(tap?.hidden).toBe(false);
    expect(tap?.classList.contains("teach-new")).toBe(true);
    expect(tap?.querySelector(".teach-tag")?.textContent).toBe("New");
    const buy = tap?.querySelector<HTMLButtonElement>(".upgrade-buy");
    expect(buy?.classList.contains("teach-action")).toBe(true);
    expect(buy?.textContent).toBe(
      buyPriceWords(mustPrice(upgradeCost(arms, 0))),
    );
    expect(buy?.disabled).toBe(true);
    expect(tap?.parentElement?.firstElementChild).toBe(tap);
    const intro = screen.root.querySelector<HTMLElement>(".upgrades-intro");
    expect(intro?.hidden).toBe(false);
    expect(intro?.nextElementSibling?.textContent).toBe("Lasting upgrades");
    expect(intro?.textContent).not.toContain("?");
    expect(screen.progress.getSnapshot().mountain.seen).toContain(
      "upgrade:tap",
    );
    screen.progress.applyMutation((current) => ({ ...current, pocket: 0 }));
    expect(row(screen.root, "tap")?.hidden).toBe(false);
    screen.progress.applyMutation((current) => ({
      ...current,
      pocket: mustPrice(upgradeCost(arms, 0)),
    }));
    row(screen.root, "tap")
      ?.querySelector<HTMLButtonElement>(".upgrade-buy")
      ?.click();
    expect(screen.progress.getSnapshot().mountain.upgrades?.tap).toBe(1);
    expect(row(screen.root, "tap")?.classList.contains("teach-new")).toBe(
      false,
    );
    expect(button?.querySelector(".teach-dot")).toBeNull();
    expect(
      screen.root.querySelector<HTMLElement>(".upgrades-intro")?.hidden,
    ).toBe(true);
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
    screen.root.querySelector<HTMLElement>(".upgrades-button")?.click();
    const sharper = screen.root.querySelector<HTMLElement>(
      'li[data-boost="sharper"]',
    );
    expect(sharper?.classList.contains("teach-new")).toBe(true);
    expect(sharper?.parentElement?.firstElementChild).toBe(sharper);
    const intro = screen.root.querySelector<HTMLElement>(".upgrades-intro");
    expect(intro?.nextElementSibling?.textContent).toBe("Quick boosts");
    screen.root.remove();
  });

  it("opens How it works for upgrades and boosts from the i, with one way back", () => {
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => ({
      ...createMountain(),
      pocket: 30_000,
    }));
    screen.root.querySelector<HTMLElement>(".upgrades-button")?.click();
    const sheet = screen.root.querySelector<HTMLElement>(".upgrades-dialog");
    const head = sheet?.querySelector(".upgrades-head");
    expect(head?.querySelector("h2")?.textContent).toBe("Upgrades");
    head?.querySelector<HTMLButtonElement>(".teach-info")?.click();
    const how = sheet?.querySelector<HTMLElement>(".upgrades-how");
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
    expect(
      sheet?.querySelector<HTMLElement>(".upgrades-scroll")?.parentElement
        ?.hidden,
    ).toBe(true);
    backs[0]?.click();
    expect(how?.hidden).toBe(true);
    screen.root.querySelector<HTMLButtonElement>(".teach-info")?.click();
    screen.root.querySelector<HTMLButtonElement>(".upgrades-close")?.click();
    screen.root.querySelector<HTMLElement>(".upgrades-button")?.click();
    expect(how?.hidden).toBe(true);
    screen.root.remove();
  });

  it("glows bar buttons live with the pocket, beside the dot, never on a locked one", () => {
    let clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    const bar = (cls: string) =>
      screen.root.querySelector<HTMLButtonElement>(`.thumb-bar .${cls}`);
    screen.progress.applyMutation(() => ({
      ...createMountain(),
      carts: 3,
      upgrades: { steady: 1 },
      boosts: { sharper: 0 },
      pocket: 0,
    }));
    expect(bar("buys-button")?.classList.contains("afford-glow")).toBe(false);
    expect(bar("upgrades-button")?.classList.contains("afford-glow")).toBe(
      false,
    );
    screen.progress.applyMutation((current) => ({
      ...current,
      pocket: 60_000,
    }));
    clock += 1000;
    expect(bar("buys-button")?.classList.contains("afford-glow")).toBe(true);
    const upgrades = bar("upgrades-button");
    expect(upgrades?.classList.contains("afford-glow")).toBe(true);
    expect(upgrades?.querySelector(".teach-dot")).not.toBeNull();
    const workshop = bar("thumb-workshop");
    expect(workshop?.disabled).toBe(true);
    expect(workshop?.classList.contains("afford-glow")).toBe(false);
    screen.progress.applyMutation((current) => ({ ...current, pocket: 0 }));
    expect(bar("buys-button")?.classList.contains("afford-glow")).toBe(false);
    screen.root.remove();
  });
});
