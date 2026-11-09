// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { createMountain, type Mountain } from "./mountain";
import { mountMountainScreen } from "./mountain-screen";
import { createProgressStore } from "./progress-store";
import { effectiveRates, firstTend } from "./rates";
import { firstTendWords, stonesPerSecond, tendingIntro } from "./screen-words";
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
  });

  it("words the intro and button with a real payoff and no question", () => {
    expect(firstTendWords("machine", "+12 stones/sec")).toBe(
      "Tend the Great Machine · +12 stones/sec",
    );
    expect(tendingIntro("Ada")).not.toContain("?");
  });

  it("the New card's one big button tends, shows the real gain, and the dot goes", () => {
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
      screen.root.querySelector<HTMLElement>(".teach-note")?.hidden ?? true,
    ).toBe(true);
    button?.click();
    const sheet = screen.root.querySelector<HTMLElement>(".engineers-dialog");
    expect(
      sheet?.querySelector<HTMLElement>(".engineers-intro")?.textContent,
    ).toBe(tendingIntro("Ada"));
    const card = sheet?.querySelector(".engineer-open");
    expect(card?.classList.contains("teach-new")).toBe(true);
    const tend = sheet?.querySelector<HTMLButtonElement>(
      ".engineer-first-tend",
    );
    expect(tend?.hidden).toBe(false);
    const before = screen.progress.getSnapshot();
    const after = {
      ...before.mountain,
      engineers: [{ ...ada, post: "machine" as const }],
    };
    const gain =
      effectiveRates(after, clock, before.trouble).crewPerSecond -
      effectiveRates(before.mountain, clock, before.trouble).crewPerSecond;
    expect(gain).toBeGreaterThan(0);
    expect(tend?.textContent).toBe(
      firstTendWords("machine", stonesPerSecond(gain)),
    );
    tend?.click();
    const mountain = screen.progress.getSnapshot().mountain;
    expect(mountain.engineers?.[0]?.post).toBe("machine");
    expect(mountain.taught).toContain("tending");
    // Its own dot goes. The next step (the second engineer) may light it.
    expect(showsDot(screen.progress.getSnapshot().mountain, "tending")).toBe(
      false,
    );
    expect(tend?.hidden).toBe(true);
    expect(card?.classList.contains("teach-new")).toBe(false);
  });

  it("a tend from the menu also counts as the first tend", () => {
    const clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => crew());
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=engineers]")
      ?.click();
    const choice = screen.root.querySelector<HTMLButtonElement>(
      '.engineer-choice[data-post="borer"]',
    );
    choice?.click();
    const mountain = screen.progress.getSnapshot().mountain;
    expect(mountain.engineers?.[0]?.post).toBe("borer");
    expect(mountain.taught).toContain("tending");
  });
});
