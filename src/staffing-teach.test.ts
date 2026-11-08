// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { createMountain, type Mountain } from "./mountain";
import { mountMountainScreen } from "./mountain-screen";
import { createProgressStore } from "./progress-store";
import { firstIdleTier } from "./rates";
import { STAFFING_INTRO, staffingAction, staffingLine } from "./screen-words";
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
    expect(staffingAction(150_400)).toBe("Hire a worker · 150.4K");
    expect(STAFFING_INTRO).not.toContain("?");
  });

  it("the idle machine is the New card; its tap hires, never another machine", () => {
    const clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => crew());
    const buys = screen.root.querySelector<HTMLButtonElement>(".buys-button");
    expect(buys?.querySelector(".teach-dot")).not.toBeNull();
    expect(
      screen.root.querySelector<HTMLElement>(".teach-note")?.hidden ?? true,
    ).toBe(true);
    buys?.click();
    const dialog = screen.root.querySelector<HTMLElement>(".buys-dialog");
    expect(dialog?.querySelector<HTMLElement>(".buys-intro")?.hidden).toBe(
      false,
    );
    expect(dialog?.querySelector(".buys-intro")?.textContent).toBe(
      STAFFING_INTRO,
    );
    const card = dialog?.querySelector<HTMLButtonElement>(
      '.tier[data-tier="cart"]',
    );
    expect(card?.classList.contains("teach-new")).toBe(true);
    expect(card?.querySelector(".teach-tag")?.textContent).toBe("New");
    const worker = tierById("helper");
    expect(card?.querySelector(".teach-action")?.textContent).toBe(
      staffingAction(tierCost(worker, 6)),
    );
    expect(card?.querySelector(".tier-needs")?.textContent).toBe(
      staffingLine(1, 4),
    );
    // The free count is on the crew plate alone (#371): not on the card,
    // not on a crew chip, and nothing is lit to point at it.
    expect(card?.textContent).not.toContain("free");
    expect(
      screen.root.querySelector(".board-gauge-row .board-crew-free")
        ?.textContent,
    ).toContain("free");
    for (const chip of screen.root.querySelectorAll(".crew-bit")) {
      expect(chip.textContent).not.toContain("free");
    }
    expect(screen.root.querySelector(".teach-point")).toBeNull();
    card?.click();
    const mountain = screen.progress.getSnapshot().mountain;
    expect(mountain.carts).toBe(10);
    expect(mountain.helpers).toBe(7);
    expect(mountain.taught).toContain("staffing");
    expect(buys?.querySelector(".teach-dot")).toBeNull();
    expect(card?.classList.contains("teach-new")).toBe(false);
    expect(screen.root.querySelector(".teach-point")).toBeNull();
  });

  it("a worker hired from the Worker card also counts", () => {
    const clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => crew());
    screen.root
      .querySelector<HTMLButtonElement>('.tier[data-tier="helper"]')
      ?.click();
    expect(screen.progress.getSnapshot().mountain.taught).toContain("staffing");
  });

  it("opens How it works for staffing and layers", () => {
    const screen = mount(() => 1_700_000_000_000);
    screen.progress.applyMutation(() => crew());
    screen.root.querySelector<HTMLButtonElement>(".buys-button")?.click();
    screen.root
      .querySelector<HTMLButtonElement>(".buys-dialog .teach-info")
      ?.click();
    const how = screen.root.querySelector<HTMLElement>(".buys-how");
    expect(how?.hidden).toBe(false);
    expect(
      [...(how?.querySelectorAll<HTMLElement>("[data-how]") ?? [])].map(
        (item) => item.dataset["how"],
      ),
    ).toEqual(["staffing", "layers"]);
  });
});
