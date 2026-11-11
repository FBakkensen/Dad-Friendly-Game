// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { createMountain, type Mountain } from "./mountain";
import { mountMountainScreen } from "./mountain-screen";
import { createProgressStore } from "./progress-store";
import { buyWithTeach } from "./economy/actions";
import { firstIdleTier } from "./rates";
import { formatCompact, formatCount } from "./format";
import { STAFFING_INTRO, staffingLine } from "./screen-words";
import { tierById, tierCost } from "./tiers";
import { noteFor, showsDot } from "./teach";

// Each mounted screen runs a 1s ticker; abort it so it never fires after teardown.
let screens = new AbortController();

beforeEach(() => {
  screens = new AbortController();
  window.matchMedia = ((query: string) => ({
    matches: query.includes("reduce"),
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  screens.abort();
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
    signal: screens.signal,
  });
  document.body.append(root);
  return { root, progress };
}

/** Ten carts, a crew too small to run them all. */
function crew(): Mountain {
  return {
    ...createMountain(),
    remaining: 220_000_000,
    pocket: 2_000_000,
    helpers: 6,
    carts: 10,
    seen: ["workshop"],
    taught: ["workshop"],
  };
}

describe("staffing teach (#246)", () => {
  it("is small: a dot with no note while a machine stands idle", () => {
    expect(firstIdleTier(crew())).toBe("cart");
    expect(showsDot(crew(), "staffing")).toBe(true);
    expect(noteFor(crew())).toBe(undefined);
    expect(showsDot({ ...crew(), helpers: 40 }, "staffing")).toBe(false);
    expect(
      showsDot({ ...crew(), taught: ["workshop", "staffing"] }, "staffing"),
    ).toBe(false);
  });

  it("words the bill without the free count and never asks", () => {
    expect(staffingLine(1, 4)).toBe("Needs 1 worker each · 4 idle");
    expect(staffingLine(3, 2)).toBe("Needs 3 workers each · 2 idle");
    expect(staffingLine(3, 2)).not.toContain("free");
    expect(STAFFING_INTRO).not.toContain("?");
  });

  it("the idle machine is the New row; its tap hires, never another machine", () => {
    const clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => crew());
    const buys = screen.root.querySelector<HTMLButtonElement>(
      ".board-key[data-key=buys]",
    );
    expect(buys?.querySelector(".board-key-dot:not([hidden])")).not.toBeNull();
    expect(
      screen.root.querySelector<HTMLElement>(".board-sign-slot")?.hidden,
    ).toBe(true);
    const row = screen.root.querySelector<HTMLButtonElement>(
      '.board-sheet[data-sheet="buys"] .board-row.tier[data-tier="cart"]',
    );
    // The row sits under the list's view as the drawer opens (#373).
    const list = screen.root.querySelector<HTMLElement>(
      '.board-sheet[data-sheet="buys"] .board-sheet-list',
    );
    const clip = screen.root.querySelector<HTMLElement>(".board-sheet-clip");
    const box = (top: number, bottom: number) =>
      ({ top, bottom, left: 0, right: 100 }) as DOMRect;
    const scrolled = vi.fn();
    if (row !== null && list !== null) {
      row.scrollIntoView = scrolled;
      vi.spyOn(list, "getBoundingClientRect").mockReturnValue(box(250, 788));
      vi.spyOn(row, "getBoundingClientRect").mockReturnValue(box(800, 876));
    }
    buys?.click();
    const drawer = screen.root.querySelector<HTMLElement>(
      '.board-sheet[data-sheet="buys"].is-open',
    );
    expect(drawer?.querySelector(".board-sheet-kick")?.textContent).toBe(
      STAFFING_INTRO,
    );
    // The New row is brought into view as the drawer opens, by its list alone: the board's
    // clip never scrolls (#373).
    expect(list?.scrollTop).toBe(88);
    expect(clip?.scrollTop).toBe(0);
    expect(scrolled).not.toHaveBeenCalled();
    expect(row?.classList.contains("teach-new")).toBe(true);
    expect(row?.querySelector(".board-row-flag")?.textContent).toBe("New");
    expect(row?.querySelector(".board-row-verb")?.textContent).toBe("Hire");
    const worker = tierById("helper");
    expect(row?.querySelector(".board-row-price")?.textContent).toBe(
      formatCompact(tierCost(worker, 6)),
    );
    expect(row?.querySelector(".board-row-info")?.textContent).toBe(
      staffingLine(1, 4),
    );
    expect(row?.getAttribute("aria-label")).toBe(
      `Mine cart: 4 idle: each needs 1 worker to run. Tap to hire a worker for ${formatCount(tierCost(worker, 6))} stones.`,
    );
    // The free count is on the crew plate alone (#371): not on the row,
    // not on a crew chip, and nothing is lit to point at it.
    expect(row?.textContent).not.toContain("free");
    expect(
      screen.root.querySelector(".board-gauge-row .board-crew-free")
        ?.textContent,
    ).toContain("free");
    for (const chip of screen.root.querySelectorAll(".crew-bit")) {
      expect(chip.textContent).not.toContain("free");
    }
    expect(screen.root.querySelector(".teach-point")).toBeNull();
    row?.click();
    const mountain = screen.progress.getSnapshot().mountain;
    expect(mountain.carts).toBe(10);
    expect(mountain.helpers).toBe(7);
    expect(mountain.taught).toContain("staffing");
    expect(buys?.querySelector(".board-key-dot:not([hidden])")).toBeNull();
    expect(row?.classList.contains("teach-new")).toBe(false);
    // The hire holds Done: a second sleepy tap never buys the machine under it.
    row?.click();
    expect(screen.progress.getSnapshot().mountain.carts).toBe(10);
    expect(screen.root.querySelector(".teach-point")).toBeNull();
  });

  it("a worker hired from the Worker card also counts", () => {
    const clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => crew());
    screen.root
      .querySelector<HTMLButtonElement>('.board-row.tier[data-tier="helper"]')
      ?.click();
    expect(screen.progress.getSnapshot().mountain.taught).toContain("staffing");
  });

  it("opens How it works for staffing and layers", () => {
    const screen = mount(() => 1_700_000_000_000);
    screen.progress.applyMutation(() => crew());
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=buys]")
      ?.click();
    screen.root
      .querySelector<HTMLButtonElement>(
        '.board-sheet[data-sheet="buys"].is-open .teach-info',
      )
      ?.click();
    const how = screen.root.querySelector<HTMLElement>(
      '.board-sheet[data-sheet="buys"] .board-sheet-how',
    );
    expect(how?.hidden).toBe(false);
    expect(
      [...(how?.querySelectorAll<HTMLElement>("[data-how]") ?? [])].map(
        (item) => item.dataset["how"],
      ),
    ).toEqual(["staffing", "layers"]);
  });
});

describe("buyWithTeach", () => {
  it("a worker bought while a machine stands idle marks staffing taught", () => {
    const before = crew();
    expect(showsDot(before, "staffing")).toBe(true);
    const after = buyWithTeach(before, "helper");
    expect(after.helpers).toBe(before.helpers + 1);
    expect(after.taught).toContain("staffing");
  });

  it("a cart is bought, and staffing stays untaught", () => {
    const before = crew();
    const after = buyWithTeach(before, "cart");
    expect(after.carts).toBe(before.carts + 1);
    expect(after.taught).not.toContain("staffing");
  });

  it("an unaffordable tier returns the same mountain", () => {
    const broke = { ...crew(), pocket: 0 };
    expect(buyWithTeach(broke, "helper")).toBe(broke);
    expect(buyWithTeach(broke, "cart")).toBe(broke);
  });
});
