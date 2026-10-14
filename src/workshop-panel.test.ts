import { beforeEach, describe, expect, it } from "vitest";
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
    expect(locked?.textContent).toContain("Locked · The Granite");
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
    expect(sheet?.textContent).toContain("Carts 8.5/s to 10.63/s");
    expect(sheet?.textContent).toContain("10 min");
    expect(sheet?.textContent).toContain("A little at a time is plenty.");
    expect(sheet?.textContent).not.toMatch(/\?/);
    const hidden = sheet?.querySelector(".workshop-card.is-hidden");
    expect(hidden?.textContent).toBe("A folded sketch, still in the dark.");
    expect(hidden?.textContent).not.toMatch(/[0-9?]/);

    const short = sheet?.querySelector<HTMLButtonElement>(
      "[data-short='Need 3 more iron']",
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
    cancel?.click();
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
