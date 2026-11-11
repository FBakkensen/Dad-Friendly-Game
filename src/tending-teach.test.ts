// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { createMountain, type Mountain } from "./mountain";
import { mountMountainScreen } from "./mountain-screen";
import { closeArrivals } from "./mountain-screen.harness";
import { createProgressStore } from "./progress-store";
import { effectiveRates, firstTend } from "./rates";
import { stonesPerSecond, tendingIntro } from "./screen-words";
import { noteFor, showsDot } from "./teach";

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

const ada = { name: "Ada", rank: 0, trips: 1, post: "camp" } as const;
/** After the first trip, Ada waiting at camp, a Great Machine to tend. */
function crew(): Mountain {
  return {
    ...createMountain(),
    remaining: 200_000_000,
    pocket: 2_000_000,
    helpers: 60,
    carts: 10,
    drills: 6,
    borers: 2,
    machines: 1,
    engineers: [ada],
    seen: ["workshop", "engineers"],
    taught: ["workshop", "engineers"],
  };
}

describe("tending teach (#246)", () => {
  it("is small: a dot with no note, only once there is a step up", () => {
    expect(showsDot(crew(), "tending")).toBe(true);
    expect(noteFor(crew())).toBe(undefined);
    // On the borers nothing pays more: no dot asks for a step down.
    expect(
      showsDot(
        { ...crew(), engineers: [{ ...ada, post: "borer" }] },
        "tending",
      ),
    ).toBe(false);
    expect(
      showsDot(
        { ...crew(), engineers: [{ ...ada, trips: 0 }], taught: ["workshop"] },
        "tending",
      ),
    ).toBe(false);
    expect(firstTend(crew())).toEqual({ index: 0, post: "machine" });
    expect(firstTend({ ...crew(), machines: 0 })).toEqual({
      index: 0,
      post: "borer",
    });
    // A save with no crew at all has no first tend.
    const noCrew = { ...crew() };
    delete noCrew.engineers;
    expect(firstTend(noCrew)).toBeUndefined();
  });

  it("words the intro with no question", () => {
    expect(tendingIntro("Ada")).not.toContain("?");
  });

  it("the New post row tends, shows the real gain in its row and the cheer, and the dot goes", () => {
    const clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => crew());
    const button = screen.root.querySelector<HTMLButtonElement>(
      ".board-key[data-key=engineers]",
    );
    expect(
      button?.querySelector(".board-key-dot:not([hidden])"),
    ).not.toBeNull();
    expect(
      screen.root.querySelector<HTMLElement>(".board-sign-slot")?.hidden,
    ).toBe(true);
    closeArrivals(screen.root);
    button?.click();
    const sheet = screen.root.querySelector<HTMLElement>(
      ".board-sheet[data-sheet=engineers]",
    );
    expect(sheet?.querySelector(".board-sheet-kick")?.textContent).toBe(
      tendingIntro("Ada"),
    );
    // Her row is the New one; her page's New row is the Great Machine.
    const row = sheet?.querySelector<HTMLButtonElement>(
      '.engineer-row[data-engineer="Ada"]',
    );
    expect(row?.classList.contains("teach-new")).toBe(true);
    row?.click();
    const tend = sheet?.querySelector<HTMLButtonElement>(
      '.engineer-post[data-post="machine"]',
    );
    expect(tend?.classList.contains("teach-new")).toBe(true);
    expect(tend?.querySelector(".board-row-flag")?.textContent).toBe("New");
    const before = screen.progress.getSnapshot();
    const after = {
      ...before.mountain,
      engineers: [{ ...ada, post: "machine" as const }],
    };
    const gain =
      effectiveRates(after, clock, before.trouble).crewPerSecond -
      effectiveRates(before.mountain, clock, before.trouble).crewPerSecond;
    expect(gain).toBeGreaterThan(0);
    // The real gain, in the row and in the cheer.
    expect(tend?.querySelector(".board-row-gain")?.textContent).toBe(
      stonesPerSecond(gain),
    );
    tend?.click();
    expect(sheet?.querySelector(".board-sheet-kick")?.textContent).toBe(
      `Ada heads to the Great Machine! ${stonesPerSecond(gain)}`,
    );
    const mountain = screen.progress.getSnapshot().mountain;
    expect(mountain.engineers?.[0]?.post).toBe("machine");
    expect(mountain.taught).toContain("tending");
    // Its own dot goes. The next step (the second engineer) may light it.
    expect(showsDot(screen.progress.getSnapshot().mountain, "tending")).toBe(
      false,
    );
    expect(tend?.classList.contains("teach-new")).toBe(false);
    expect(sheet?.querySelector(".engineer-row.teach-new")).toBeNull();
  });

  it("a tend from any post row also counts as the first tend", () => {
    const clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => crew());
    closeArrivals(screen.root);
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=engineers]")
      ?.click();
    screen.root
      .querySelector<HTMLButtonElement>('.engineer-row[data-engineer="Ada"]')
      ?.click();
    screen.root
      .querySelector<HTMLButtonElement>('.engineer-post[data-post="borer"]')
      ?.click();
    const mountain = screen.progress.getSnapshot().mountain;
    expect(mountain.engineers?.[0]?.post).toBe("borer");
    expect(mountain.taught).toContain("tending");
  });
});
