import { beforeEach, describe, expect, it, vi } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import { mountMountainScreen } from "./mountain-screen";
import { createProgressStore } from "./progress-store";
import { recipesForMined } from "./workshop";

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

function granite(): Mountain {
  return {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - 12_000_000,
    pocket: 200_000,
    helpers: 4,
    carts: 1,
    materials: { clay: 2, iron: 1, crystal: 0, heartstone: 0 },
    recipes: recipesForMined(12_000_000),
  };
}

describe("workshop panel (#199)", () => {
  it("shows a craft this build cannot name and will not replace it", () => {
    const clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => ({
      ...granite(),
      pocket: 80_000_000,
      materials: { clay: 40, iron: 40, crystal: 0, heartstone: 0 },
      kept: {
        bench: {
          recipe: "future-bit",
          startedAt: clock,
          endsAt: clock + 8 * 60_000,
        },
      },
    }));
    screen.root.querySelector<HTMLButtonElement>(".menu-button")?.click();
    expect(screen.root.querySelector(".workshop-open")?.textContent).toContain(
      "Workshop · 8:00",
    );
    screen.root.querySelector<HTMLButtonElement>(".workshop-open")?.click();
    const sheet = screen.root.querySelector(".workshop-dialog");
    expect(sheet?.textContent).toContain(
      "Something is on the bench · 8:00 left",
    );
    expect(sheet?.textContent).toContain("It keeps working while you rest.");
    expect(
      sheet?.querySelector<HTMLButtonElement>(".workshop-cancel")?.hidden,
    ).toBe(true);
    expect(sheet?.querySelector<HTMLElement>(".workshop-bar")?.hidden).toBe(
      false,
    );
    sheet?.querySelector<HTMLButtonElement>(".workshop-craft")?.click();
    expect(screen.progress.getSnapshot().mountain.bench).toBeUndefined();
    expect(screen.progress.getSnapshot().mountain.kept?.bench?.recipe).toBe(
      "future-bit",
    );
    screen.root.remove();
  });

  it("stays a locked silhouette until the Granite, then crafts for real", () => {
    window.matchMedia = (() => ({
      matches: false,
    })) as unknown as typeof window.matchMedia;
    let clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    const menu = () =>
      screen.root.querySelector<HTMLButtonElement>(".menu-button");
    menu()?.click();
    const locked = screen.root.querySelector(".workshop-locked");
    expect(locked?.textContent).toBe("Workshop · opens as the clay comes in");
    expect(locked?.querySelector("img")?.getAttribute("src")).toBe(
      screen.root
        .querySelector<HTMLImageElement>(".thumb-workshop img")
        ?.getAttribute("src"),
    );
    expect(locked?.textContent).not.toMatch(/\?/);
    expect(
      screen.root.querySelector<HTMLButtonElement>(".workshop-open")?.hidden,
    ).toBe(true);
    expect(
      screen.root.querySelector<HTMLElement>(".workshop-dialog")?.hidden,
    ).toBe(true);

    screen.progress.applyMutation(() => granite());
    expect(
      screen.root.querySelector<HTMLButtonElement>(".workshop-open")?.hidden,
    ).toBe(false);
    screen.root.querySelector<HTMLButtonElement>(".workshop-open")?.click();
    const sheet = screen.root.querySelector<HTMLElement>(".workshop-dialog");
    expect(sheet?.hidden).toBe(false);
    expect(sheet?.textContent).toContain("Need 3 more iron");
    expect(sheet?.textContent).toContain("Carts 10/s to 12.5/s");
    expect(sheet?.textContent).toContain("500K stones");
    expect(sheet?.textContent).toContain("Lv 0/2");
    const stoneIcon = sheet?.querySelector(".mat-stones");
    const clayIcon = sheet?.querySelector(".mat-clay");
    expect(stoneIcon?.getAttribute("src")).toContain("stone");
    expect(stoneIcon?.getAttribute("src")).not.toBe(
      clayIcon?.getAttribute("src"),
    );
    expect(sheet?.textContent).toContain("10 min");
    expect(sheet?.textContent).toContain("A little at a time is plenty.");
    expect(sheet?.textContent).not.toMatch(/\?/);
    const hidden = sheet?.querySelector(".workshop-card.is-hidden");
    expect(hidden?.textContent).toBe("A folded sketch, still in the dark.");
    expect(hidden?.textContent).not.toMatch(/[0-9?]/);

    const short = sheet?.querySelector<HTMLButtonElement>(
      "[data-short='Need 3 more iron']",
    );
    const cards = [...(sheet?.querySelectorAll(".workshop-card") ?? [])];
    expect(cards.every((card) => card.classList.contains("sheet-card"))).toBe(
      true,
    );
    expect(
      cards.every((card) => card.querySelector(".sheet-card-icon") !== null),
    ).toBe(true);
    const shortCard = short?.closest(".workshop-card");
    expect(shortCard?.classList.contains("sheet-dear")).toBe(true);
    expect(short?.textContent).toMatch(/^Craft/);
    expect(shortCard?.querySelector(".workshop-need")?.textContent).toBe(
      "Need 3 more iron",
    );
    const pocketBefore = screen.progress.getSnapshot().mountain.pocket;
    short?.click();
    const shaking = sheet?.querySelector("[data-short='Need 3 more iron']");
    expect(shaking?.classList.contains("is-shaking")).toBe(true);
    expect(screen.progress.getSnapshot().mountain.pocket).toBe(pocketBefore);
    expect(screen.progress.getSnapshot().mountain.bench).toBeUndefined();

    sheet?.querySelector<HTMLButtonElement>(".workshop-more")?.click();
    expect(sheet?.textContent).toContain("Reinforce");
    sheet?.querySelector<HTMLButtonElement>(".workshop-earlier")?.click();
    const axle = [...(sheet?.querySelectorAll(".workshop-card") ?? [])].find(
      (card) => card.getAttribute("data-recipe") === "axle-grease",
    );
    expect(axle?.textContent).toContain("Craft");
    axle?.querySelector("button")?.click();
    expect(
      sheet?.querySelector(".workshop-bench")?.classList.contains("is-hammer"),
    ).toBe(true);
    expect(sheet?.querySelectorAll(".float-chip").length).toBeGreaterThan(0);
    expect(screen.progress.getSnapshot().mountain.bench?.recipe).toBe(
      "axle-grease",
    );
    expect(sheet?.textContent).toContain("Cancel ·");
    expect(sheet?.textContent).toMatch(/Axle grease · \d+:\d+ left/);

    const label = () =>
      screen.root.querySelector(".workshop-open")?.textContent ?? "";
    sheet?.querySelector<HTMLButtonElement>(".workshop-close")?.click();
    expect(sheet?.hidden).toBe(true);
    const before = label();
    clock += 5_000;
    screen.progress.tick();
    expect(label()).not.toBe(before);
    expect(screen.progress.getSnapshot().mountain.bench?.recipe).toBe(
      "axle-grease",
    );

    screen.root.remove();
  });

  it("plays a hammer only after the dad turns sound on", () => {
    const clock = 1_700_000_000_000;
    const started: number[] = [];
    class FakeAudio {
      readonly sampleRate = 8_000;
      readonly destination = {};
      readonly currentTime = 0;
      createBuffer(_channels: number, length: number) {
        return {
          getChannelData: () => new Float32Array(length),
        };
      }
      createBufferSource() {
        return {
          buffer: null as unknown,
          connect: () => undefined,
          start: () => {
            started.push(1);
          },
          onended: null as (() => void) | null,
        };
      }
      createGain() {
        return { gain: { value: 0 }, connect: () => undefined };
      }
      close() {
        return Promise.resolve();
      }
    }
    const previous = window.AudioContext;
    window.AudioContext = FakeAudio as unknown as typeof window.AudioContext;
    const screen = mount(() => clock);
    try {
      screen.progress.applyMutation(() => ({
        ...granite(),
        pocket: 80_000_000,
        materials: { clay: 40, iron: 40, crystal: 0, heartstone: 0 },
      }));
      screen.root.querySelector<HTMLButtonElement>(".menu-button")?.click();
      screen.root.querySelector<HTMLButtonElement>(".workshop-open")?.click();
      const craft = () => {
        const found = screen.root.querySelector<HTMLButtonElement>(
          "[data-recipe='axle-grease'] .workshop-craft",
        );
        if (found !== null) {
          return found;
        }
        screen.root.querySelector<HTMLButtonElement>(".workshop-more")?.click();
        return screen.root.querySelector<HTMLButtonElement>(
          "[data-recipe='axle-grease'] .workshop-craft",
        );
      };
      craft()?.click();
      expect(started).toHaveLength(0);
      screen.progress.applyMutation((current) => {
        const { bench, ...rest } = current;
        void bench;
        return {
          ...rest,
          materials: { clay: 40, iron: 40, crystal: 0, heartstone: 0 },
        };
      });
      screen.root.querySelector<HTMLButtonElement>(".workshop-sound")?.click();
      expect(started).toHaveLength(1);
      expect(screen.root.querySelector(".workshop-sound")?.textContent).toBe(
        "Sound",
      );
      craft()?.click();
      expect(started.length).toBeGreaterThan(1);
    } finally {
      window.AudioContext = previous;
      screen.root.remove();
    }
  });

  it("guides the first craft: New card, How it works, then the payoff (#243)", () => {
    let clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => ({
      ...granite(),
      pocket: 400_000,
      helpers: 40,
      materials: { clay: 10, iron: 0, crystal: 0, heartstone: 0 },
    }));
    const thumb =
      screen.root.querySelector<HTMLButtonElement>(".thumb-workshop");
    expect(thumb?.querySelector(".teach-dot")).not.toBeNull();
    screen.root.querySelector<HTMLButtonElement>(".teach-note")?.click();
    const sheet = screen.root.querySelector<HTMLElement>(".workshop-dialog");
    expect(sheet?.hidden).toBe(false);
    expect(screen.root.querySelector<HTMLElement>(".teach-note")?.hidden).toBe(
      true,
    );
    expect(sheet?.querySelector(".teach-intro")?.textContent).toBe(
      "Turn your clay into gear for the crew.",
    );
    const first = sheet?.querySelector<HTMLElement>(".workshop-card");
    expect(first?.dataset["recipe"]).toBe("blasting-charge");
    expect(first?.classList.contains("teach-new")).toBe(true);
    expect(first?.querySelector(".teach-tag")?.textContent).toBe("New");
    expect(first?.querySelectorAll("button")).toHaveLength(1);
    expect(first?.querySelector(".teach-action")?.textContent).toBe(
      "Craft Blasting charge · 4 clay · 100K",
    );

    sheet?.querySelector<HTMLButtonElement>(".teach-info")?.click();
    const how = sheet?.querySelector<HTMLElement>("[data-how='workshop']");
    expect(how?.hidden).toBe(false);
    expect(sheet?.querySelector<HTMLElement>(".workshop-recipes")?.hidden).toBe(
      true,
    );
    expect(how?.querySelectorAll("li")).toHaveLength(4);
    how?.querySelector<HTMLButtonElement>(".teach-how-back")?.click();
    expect(how?.hidden).toBe(true);

    sheet?.querySelector<HTMLButtonElement>(".workshop-materials")?.click();
    const ore = sheet?.querySelector<HTMLElement>("[data-how='materials']");
    expect(ore?.hidden).toBe(false);
    expect(ore?.querySelector(".teach-how-title")?.textContent).toBe(
      "How it works · Materials",
    );
    ore?.querySelector<HTMLButtonElement>(".teach-how-back")?.click();
    expect(ore?.hidden).toBe(true);

    sheet?.querySelector<HTMLButtonElement>(".teach-action")?.click();
    clock += 1_000;
    screen.progress.applyMutation((current) => current);
    expect(screen.progress.getSnapshot().mountain.bench?.recipe).toBe(
      "blasting-charge",
    );
    expect(screen.progress.getSnapshot().mountain.taught).toEqual(["workshop"]);
    expect(thumb?.querySelector(".teach-dot")).toBeNull();
    const after = sheet?.querySelector<HTMLElement>(".workshop-card");
    expect(after?.dataset["recipe"]).toBe("blasting-charge");
    expect(after?.querySelector(".teach-tag")).toBeNull();
    expect(sheet?.querySelector<HTMLElement>(".teach-intro")?.hidden).toBe(
      true,
    );
    expect(after?.querySelector(".teach-payoff")?.textContent).toMatch(
      /^\+[\d,]+\/s now$/,
    );
  });

  it("cancels a running craft for the refund on the button", () => {
    const clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => ({
      ...granite(),
      pocket: 0,
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      bench: {
        recipe: "sturdy-props" as const,
        startedAt: clock,
        endsAt: clock + 600_000,
      },
    }));
    screen.root.querySelector<HTMLButtonElement>(".menu-button")?.click();
    screen.root.querySelector<HTMLButtonElement>(".workshop-open")?.click();
    const cancel =
      screen.root.querySelector<HTMLButtonElement>(".workshop-cancel");
    expect(cancel?.textContent).toBe(
      "Cancel · 250K stones, 10 clay, and 4 iron back",
    );
    expect(
      screen.root.querySelector(".workshop-bench .workshop-timers"),
    ).toBeNull();
    vi.useFakeTimers();
    try {
      cancel?.click();
      expect(cancel?.textContent).toBe("Tap again to cancel");
      expect(screen.progress.getSnapshot().mountain.bench?.recipe).toBe(
        "sturdy-props",
      );
      vi.advanceTimersByTime(4_000);
      expect(cancel?.textContent).toBe(
        "Cancel · 250K stones, 10 clay, and 4 iron back",
      );
      expect(screen.progress.getSnapshot().mountain.bench?.recipe).toBe(
        "sturdy-props",
      );
      cancel?.click();
      expect(cancel?.textContent).toBe("Tap again to cancel");
      cancel?.click();
    } finally {
      vi.useRealTimers();
    }
    const mountain = screen.progress.getSnapshot().mountain;
    expect(mountain.bench).toBeUndefined();
    expect(mountain.pocket).toBe(250_000);
    expect(mountain.materials?.clay).toBe(10);
    expect(mountain.materials?.iron).toBe(4);
    expect(screen.root.querySelector(".workshop-bench")?.textContent).toContain(
      "The bench is free",
    );
    screen.root.remove();
  });
});
