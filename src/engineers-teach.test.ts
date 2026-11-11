// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { createMountain, type Mountain } from "./mountain";
import { mountMountainScreen } from "./mountain-screen";
import { closeArrivals } from "./mountain-screen.harness";
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

import { noteFor, showsDot } from "./teach";
import { engineersIntro, engineersNote, firstTripWords } from "./screen-words";

const ada = { name: "Ada", rank: 0, trips: 0, post: "borer" } as const;
function crew(): Mountain {
  return {
    ...createMountain(),
    remaining: 228_000_000,
    pocket: 2_000_000,
    helpers: 30,
    carts: 10,
    drills: 6,
    borers: 1,
    engineers: [ada],
    seen: ["workshop"],
    taught: ["workshop"],
  };
}

describe("engineers teach (#246)", () => {
  it("is a big system: note and dot with the first engineer, gone after a trip", () => {
    expect(showsDot(createMountain(), "engineers")).toBe(false);
    expect(showsDot(crew(), "engineers")).toBe(true);
    expect(noteFor(crew())).toBe("engineers");
    expect(noteFor({ ...crew(), seen: ["workshop", "engineers"] })).toBe(
      undefined,
    );
    expect(
      showsDot({ ...crew(), engineers: [{ ...ada, trips: 1 }] }, "engineers"),
    ).toBe(false);
  });

  it("words the note, intro and first trip with real numbers and no question", () => {
    expect(engineersNote("Ada")).toBe("New · Ada is your first engineer");
    expect(firstTripWords("Ada", 10 * 60_000)).toBe(
      "Send Ada exploring · 10 min",
    );
    for (const line of [engineersNote("Ada"), engineersIntro("Ada")]) {
      expect(line).not.toContain("?");
    }
  });

  it("opens from its key under the New sign, and the first trip goes from her page", () => {
    const clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => crew());
    const button = screen.root.querySelector<HTMLElement>(
      ".board-key[data-key=engineers]",
    );
    expect(
      button?.querySelector(".board-key-dot:not([hidden])"),
    ).not.toBeNull();
    // The New sign waits for the relic and layer cards the jump opened, then stands
    // over its key (#372, #373).
    const sign = () =>
      screen.root.querySelector<HTMLElement>(".board-sign-slot:not([hidden])");
    expect(sign()).toBeNull();
    closeArrivals(screen.root);
    expect(sign()?.dataset["key"]).toBe("engineers");
    expect(sign()?.textContent).toBe("New · Ada is your first engineer");
    // Its key opens the drawer: seen, and the sign goes.
    button?.click();
    expect(screen.progress.getSnapshot().mountain.seen).toContain("engineers");
    expect(sign()).toBeNull();
    const sheet = screen.root.querySelector<HTMLElement>(
      ".board-sheet[data-sheet=engineers]",
    );
    expect(sheet?.classList.contains("is-open")).toBe(true);
    expect(sheet?.querySelector(".board-sheet-kick")?.textContent).toBe(
      engineersIntro("Ada"),
    );
    // Her row is the New one: amber, with its flag.
    const row = sheet?.querySelector<HTMLButtonElement>(
      '.engineer-row[data-engineer="Ada"]',
    );
    expect(row?.classList.contains("teach-new")).toBe(true);
    expect(row?.querySelector(".board-row-flag")?.textContent).toBe("New");
    row?.click();
    // Her page's left plate is the guided first trip.
    const trip = sheet?.querySelector<HTMLButtonElement>(".engineer-explore");
    expect(trip?.hidden).toBe(false);
    expect(trip?.classList.contains("teach-new")).toBe(true);
    expect(trip?.getAttribute("aria-label")).toBe(
      firstTripWords("Ada", 10 * 60_000),
    );
    expect(trip?.getAttribute("aria-label")).toBe(
      "Send Ada exploring · 10 min",
    );
    trip?.click();
    const after = screen.progress.getSnapshot().mountain;
    expect(after.expeditions?.[0]?.tunnel).toBe("side-seam");
    expect(after.taught).toContain("engineers");
    // Its own dot goes. The next step (the second engineer) may light it.
    expect(showsDot(screen.progress.getSnapshot().mountain, "engineers")).toBe(
      false,
    );
    // Her page again: she is out, so Call her back stands in the plate's place.
    expect(trip?.hidden).toBe(true);
    expect(sheet?.querySelector<HTMLElement>(".engineer-recall")?.hidden).toBe(
      false,
    );
    expect(sheet?.querySelector(".engineer-row.teach-new")).toBeNull();
    screen.root.remove();
  });

  it("opens How it works for engineers and expeditions from the i", () => {
    const screen = mount(() => 1_700_000_000_000);
    screen.progress.applyMutation(() => crew());
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=engineers]")
      ?.click();
    const sheet = screen.root.querySelector<HTMLElement>(
      ".board-sheet[data-sheet=engineers]",
    );
    sheet?.querySelector<HTMLButtonElement>(".board-sheet-info")?.click();
    const how = sheet?.querySelector<HTMLElement>(".board-sheet-how");
    expect(how?.hidden).toBe(false);
    expect(
      [
        ...(how?.querySelectorAll<HTMLElement>("[data-how]:not([hidden])") ??
          []),
      ].map((card) => card.dataset["how"]),
    ).toEqual(["engineers", "expeditions"]);
    expect(sheet?.querySelector<HTMLElement>(".board-sheet-list")?.hidden).toBe(
      true,
    );
    const backs = [
      ...(how?.querySelectorAll<HTMLButtonElement>(".teach-how-back") ?? []),
    ].filter((back) => !back.hidden);
    expect(backs).toHaveLength(1);
    expect(backs[0]?.textContent).toContain("Back to your engineers");
    backs[0]?.click();
    expect(how?.hidden).toBe(true);
    sheet?.querySelector<HTMLButtonElement>(".board-sheet-info")?.click();
    sheet?.querySelector<HTMLButtonElement>(".board-sheet-back")?.click();
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=engineers]")
      ?.click();
    expect(how?.hidden).toBe(true);
    screen.root.remove();
  });
});
