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

import { noteFor, showsDot } from "./teach";
import { engineersIntro, engineersNote, firstTripWords } from "./screen-words";

/** Closes the relic and layer cards a jump in depth opens, one after another. */
function closeArrivals(root: HTMLElement): void {
  for (let i = 0; i < 20; i += 1) {
    const go = root.querySelector<HTMLButtonElement>(
      ".relic-reveal:not([hidden]) .reveal-continue, .layer-arrival:not([hidden]) .layer-dig",
    );
    if (go === null) return;
    go.click();
  }
}

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

  it("opens from the note on the New card, and the one big button sends the first trip", () => {
    const clock = 1_700_000_000_000;
    const screen = mount(() => clock);
    screen.progress.applyMutation(() => crew());
    const button = screen.root.querySelector<HTMLElement>(
      ".board-key[data-key=engineers]",
    );
    expect(
      button?.querySelector(".board-key-dot:not([hidden])"),
    ).not.toBeNull();
    // The New note waits for the relic and layer cards the jump opened, then shows in
    // the board note above its key (#372, #373).
    expect(screen.root.querySelector(".board-note.on .teach-note")).toBeNull();
    closeArrivals(screen.root);
    // Anchored on the key: a press on it keeps the note up.
    button?.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
    );
    button?.dispatchEvent(
      new PointerEvent("pointerup", { bubbles: true, button: 0 }),
    );
    const note = screen.root.querySelector<HTMLButtonElement>(
      ".board-note.on .teach-note",
    );
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toBe("New · Ada is your first engineer");
    note?.click();
    expect(screen.progress.getSnapshot().mountain.seen).toContain("engineers");
    expect(note?.hidden).toBe(true);
    const sheet = screen.root.querySelector<HTMLElement>(".engineers-dialog");
    expect(sheet?.hidden).toBe(false);
    expect(
      sheet?.querySelector<HTMLElement>(".engineers-intro")?.textContent,
    ).toBe(engineersIntro("Ada"));
    const card = sheet?.querySelector(".engineer-open");
    expect(card?.classList.contains("teach-new")).toBe(true);
    expect(card?.querySelector(".teach-tag")?.textContent).toBe("New");
    const trip = sheet?.querySelector<HTMLButtonElement>(
      ".engineer-first-trip",
    );
    expect(trip?.hidden).toBe(false);
    expect(trip?.textContent).toBe("Send Ada exploring · 10 min");
    expect(sheet?.querySelector<HTMLElement>(".engineer-acts")?.hidden).toBe(
      true,
    );
    trip?.click();
    const after = screen.progress.getSnapshot().mountain;
    expect(after.expeditions?.[0]?.tunnel).toBe("side-seam");
    expect(after.taught).toContain("engineers");
    // Its own dot goes. The next step (the second engineer) may light it.
    expect(showsDot(screen.progress.getSnapshot().mountain, "engineers")).toBe(
      false,
    );
    expect(sheet?.querySelector(".engineer-open.teach-new")).toBeNull();
    expect(trip?.hidden).toBe(true);
    screen.root.remove();
  });

  it("opens How it works for engineers, expeditions and tending from the i", () => {
    const screen = mount(() => 1_700_000_000_000);
    screen.progress.applyMutation(() => crew());
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=engineers]")
      ?.click();
    const sheet = screen.root.querySelector<HTMLElement>(".engineers-dialog");
    sheet?.querySelector<HTMLButtonElement>(".teach-info")?.click();
    const how = sheet?.querySelector<HTMLElement>(".engineers-how");
    expect(how?.hidden).toBe(false);
    expect(
      [...(how?.querySelectorAll<HTMLElement>(".teach-how") ?? [])].map(
        (card) => card.dataset["how"],
      ),
    ).toEqual(["engineers", "expeditions", "tending"]);
    expect(sheet?.querySelector<HTMLElement>(".engineer-list")?.hidden).toBe(
      true,
    );
    const backs = [
      ...(how?.querySelectorAll<HTMLButtonElement>(".teach-how-back") ?? []),
    ].filter((back) => !back.hidden);
    expect(backs).toHaveLength(1);
    backs[0]?.click();
    expect(how?.hidden).toBe(true);
    sheet?.querySelector<HTMLButtonElement>(".teach-info")?.click();
    sheet?.querySelector<HTMLButtonElement>(".engineers-close")?.click();
    screen.root
      .querySelector<HTMLButtonElement>(".board-key[data-key=engineers]")
      ?.click();
    expect(how?.hidden).toBe(true);
    screen.root.remove();
  });
});
