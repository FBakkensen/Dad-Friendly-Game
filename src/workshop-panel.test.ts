// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryAuth } from "./auth";
import { DRAWER_SETTLE_MS } from "./board-drawer";
import { type CloudSave } from "./cloud-save";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import {
  createMemoryStorage,
  mountScreen,
  setReducedMotion,
  stopScreens,
  tileUrl,
} from "./mountain-screen.harness";
import { writeSessionSave } from "./session-save";
import {
  recipesForMined,
  type RecipeId,
  NOTHING_KEPT,
  COLD_CLOCKS,
} from "./workshop";

/*
 * The Workshop drawer on the mounted screen (#374): its doors, its rows' taps through the
 * board's model (the settle, the Done hold, the red blink), the bench's cancel confirm, the
 * pages of three, the plates and the sound key.
 */

beforeEach(() => {
  setReducedMotion(true);
});
afterEach(stopScreens);

const CLOCK = 1_700_000_000_000;
const PAST_SETTLE = DRAWER_SETTLE_MS + 100;

function granite(over: Partial<Mountain> = {}): Mountain {
  return {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - 12_000_000,
    pocket: 200_000,
    helpers: 4,
    carts: 1,
    materials: { clay: 2, iron: 1, crystal: 0, heartstone: 0 },
    recipes: recipesForMined(12_000_000),
    seen: ["workshop"],
    taught: ["workshop"],
    ...over,
  };
}

/** Sturdy props on the bench, with nothing in the shed. */
function busy(at: number): Mountain {
  return granite({
    pocket: 0,
    materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
    bench: { recipe: "sturdy-props", startedAt: at, endsAt: at + 600_000 },
  });
}

/** Enough in the shed for every Granite craft. */
function rich(over: Partial<Mountain> = {}): Mountain {
  return granite({
    pocket: 80_000_000,
    materials: { clay: 40, iron: 40, crystal: 0, heartstone: 0 },
    ...over,
  });
}

type Screen = ReturnType<typeof mountScreen>;

function mount(
  mountain: Mountain,
  {
    now = () => CLOCK,
    tapClock,
  }: { now?: () => number; tapClock?: () => number } = {},
): Screen {
  const storage = createMemoryStorage();
  writeSessionSave({ storage, mountain, lastSeen: now() });
  const screen = mountScreen({
    storage,
    now,
    ...(tapClock === undefined ? {} : { tapClock }),
  });
  document.body.append(screen.root);
  return screen;
}

const drawerOf = (screen: Screen): HTMLElement => {
  const found = screen.root.querySelector<HTMLElement>(
    '.board-sheet[data-sheet="workshop"]',
  );
  if (found === null) throw new Error("no Workshop drawer");
  return found;
};
const isOpen = (screen: Screen, name = "workshop"): boolean =>
  screen.root
    .querySelector(`.board-sheet[data-sheet="${name}"]`)
    ?.classList.contains("is-open") === true;
const keyOf = (screen: Screen, id: string): HTMLButtonElement => {
  const found = screen.root.querySelector(`.board-key[data-key="${id}"]`);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no ${id} key`);
  return found;
};
const recipeRow = (screen: Screen, id: string): HTMLButtonElement => {
  const found = drawerOf(screen).querySelector(
    `button.workshop-recipe[data-recipe="${id}"]`,
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no ${id} row`);
  return found;
};
const benchRow = (screen: Screen): HTMLButtonElement => {
  const found = drawerOf(screen).querySelector(".workshop-bench");
  if (!(found instanceof HTMLButtonElement)) throw new Error("no bench row");
  return found;
};
const partOf = (row: HTMLElement, part: string) =>
  row.querySelector<HTMLElement>(`.board-row-${part}`)?.textContent;
const lampOf = (row: HTMLElement) =>
  row.querySelector<HTMLElement>(".board-lamp")?.style.backgroundPositionX;
/** The shown rows' recipes (or "sketch"), top to bottom. */
const shownRows = (screen: Screen): string[] =>
  [
    ...drawerOf(screen).querySelectorAll<HTMLElement>(
      ".workshop-recipe:not([hidden]), .workshop-sketch:not([hidden])",
    ),
  ].map((row) => row.dataset["recipe"] ?? "sketch");
const fingerTap = (target: HTMLElement): void => {
  target.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(
    new PointerEvent("pointerup", { bubbles: true, button: 0 }),
  );
  target.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
};
const escape = (): void => {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
};
/** Pages forward until the recipe's row shows. */
const pageTo = (screen: Screen, id: string): HTMLButtonElement => {
  for (let i = 0; i < 4 && !shownRows(screen).includes(id); i += 1) {
    drawerOf(screen)
      .querySelector<HTMLButtonElement>(".workshop-more:not([hidden])")
      ?.click();
  }
  return recipeRow(screen, id);
};

describe("the Workshop drawer (#374)", () => {
  it("the Workshop key opens a board drawer", () => {
    const screen = mount(granite());
    keyOf(screen, "workshop").click();
    expect(isOpen(screen)).toBe(true);
    expect(screen.root.querySelector(".workshop-dialog")).toBeNull();
    const list = drawerOf(screen).querySelector(".board-sheet-list");
    const order = [...(list?.children ?? [])]
      .filter((part) => !(part as HTMLElement).hidden)
      .map((part) => part.className.split(" ")[0]);
    // The timers line keeps its room even with no timer, so no row moves when one starts.
    expect(order.slice(0, 4)).toEqual([
      "workshop-mats",
      "board-row",
      "workshop-timers",
      "board-sec",
    ]);
    expect(order.slice(4, 7)).toEqual(["board-row", "board-row", "board-row"]);
    expect(drawerOf(screen).querySelector(".board-sec")?.textContent).toBe(
      "Recipes",
    );
    expect(
      drawerOf(screen).querySelector(".board-sheet-kick")?.textContent,
    ).toBe("One bench. Crafts finish while you are away");
    expect(keyOf(screen, "workshop").getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  it("a double tap on the key crafts nothing", () => {
    vi.useFakeTimers();
    try {
      let clock = 10_000;
      const screen = mount(rich(), { tapClock: () => clock });
      fingerTap(keyOf(screen, "workshop"));
      const first = drawerOf(screen).querySelector<HTMLButtonElement>(
        ".workshop-recipe:not([hidden])",
      );
      if (first === null) throw new Error("no first row");
      clock += 150;
      fingerTap(first);
      expect(screen.progress.getSnapshot().mountain.bench).toBeUndefined();
      clock += 350;
      fingerTap(first);
      expect(screen.progress.getSnapshot().mountain.bench?.recipe).toBe(
        first.dataset["recipe"],
      );
      expect(partOf(first, "verb")).toBe("Done");
    } finally {
      vi.useRealTimers();
    }
  });

  it("Done holds the row", () => {
    vi.useFakeTimers();
    try {
      let clock = 10_000;
      const screen = mount(rich(), { tapClock: () => clock });
      keyOf(screen, "workshop").click();
      clock += PAST_SETTLE;
      const row = pageTo(screen, "axle-grease");
      clock += PAST_SETTLE;
      row.click();
      expect(screen.progress.getSnapshot().mountain.bench?.recipe).toBe(
        "axle-grease",
      );
      expect(partOf(row, "verb")).toBe("Done");
      clock += 1_800;
      vi.advanceTimersByTime(1_800);
      row.click();
      expect(partOf(row, "verb")).toBe("Done");
      clock += 150;
      vi.advanceTimersByTime(150);
      expect(partOf(row, "verb")).toBe("On the bench");
    } finally {
      vi.useRealTimers();
    }
  });

  it("a short craft blinks red, and not under reduced motion", () => {
    for (const reduced of [false, true]) {
      setReducedMotion(reduced);
      let clock = 10_000;
      const screen = mount(granite(), { tapClock: () => clock });
      keyOf(screen, "workshop").click();
      clock += PAST_SETTLE;
      const short = drawerOf(screen).querySelector<HTMLButtonElement>(
        ".workshop-recipe.is-short:not([hidden])",
      );
      if (short === null) throw new Error("no short row");
      expect(partOf(short, "need")).toMatch(/^Need \d+ more (iron|clay)$/);
      const before = screen.progress.getSnapshot().mountain;
      short.click();
      expect(screen.progress.getSnapshot().mountain).toBe(before);
      if (reduced) {
        expect(lampOf(short)).not.toBe("-120px");
      } else {
        expect(lampOf(short)).toBe("-120px");
      }
      screen.root.remove();
    }
  });

  it("the bench cancels on the second tap past the settle", () => {
    vi.useFakeTimers();
    try {
      let clock = 10_000;
      const screen = mount(busy(CLOCK), { tapClock: () => clock });
      keyOf(screen, "workshop").click();
      clock += PAST_SETTLE;
      const bench = benchRow(screen);
      expect(partOf(bench, "name")).toBe("Sturdy props");
      expect(partOf(bench, "gain")).toBe("10:00");
      fingerTap(bench);
      expect(partOf(bench, "why")).toBe("Tap again to cancel");
      clock += 100;
      fingerTap(bench);
      expect(screen.progress.getSnapshot().mountain.bench?.recipe).toBe(
        "sturdy-props",
      );
      clock += 400;
      fingerTap(bench);
      const mountain = screen.progress.getSnapshot().mountain;
      expect(mountain.bench).toBeUndefined();
      expect(mountain.pocket).toBe(250_000);
      expect(mountain.materials.clay).toBe(10);
      expect(mountain.materials.iron).toBe(4);
      expect(partOf(bench, "verb")).toBe("Done");

      // Armed and left alone, it disarms after four seconds.
      const again = mount(busy(CLOCK), { tapClock: () => clock });
      keyOf(again, "workshop").click();
      clock += PAST_SETTLE;
      fingerTap(benchRow(again));
      expect(partOf(benchRow(again), "why")).toBe("Tap again to cancel");
      vi.advanceTimersByTime(4_000);
      expect(partOf(benchRow(again), "why")).toBe("");
      expect(again.progress.getSnapshot().mountain.bench?.recipe).toBe(
        "sturdy-props",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("pages of three", () => {
    let clock = 10_000;
    const screen = mount(
      granite({
        recipes: [
          ...new Set<RecipeId>([
            ...recipesForMined(12_000_000),
            "axle-grease",
            "reinforce",
          ]),
        ],
      }),
      { tapClock: () => clock },
    );
    keyOf(screen, "workshop").click();
    const first = shownRows(screen);
    expect(first).toHaveLength(3);
    const more =
      drawerOf(screen).querySelector<HTMLButtonElement>(".workshop-more");
    const earlier =
      drawerOf(screen).querySelector<HTMLButtonElement>(".workshop-earlier");
    if (more === null || earlier === null) throw new Error("no pager");
    expect(more.hidden).toBe(false);
    expect(earlier.hidden).toBe(true);
    clock += PAST_SETTLE;
    fingerTap(more);
    const second = shownRows(screen);
    expect(second).not.toEqual(first);
    expect(earlier.hidden).toBe(false);
    // A second tap inside the new page's settle pages nothing.
    clock += 100;
    fingerTap(more);
    expect(shownRows(screen)).toEqual(second);
    clock += PAST_SETTLE;
    fingerTap(earlier);
    expect(shownRows(screen)).toEqual(first);
  });

  it("rows keep their places", () => {
    let clock = 10_000;
    const screen = mount(rich(), { tapClock: () => clock });
    keyOf(screen, "workshop").click();
    const before = shownRows(screen);
    clock += PAST_SETTLE;
    const last = before.at(-1) ?? "";
    recipeRow(screen, last).click();
    expect(screen.progress.getSnapshot().mountain.bench?.recipe).toBe(last);
    expect(shownRows(screen)).toEqual(before);
    drawerOf(screen)
      .querySelector<HTMLButtonElement>(".board-sheet-back")
      ?.click();
    keyOf(screen, "workshop").click();
    expect(shownRows(screen)[0]).toBe(last);
  });

  /** The list's parts that take room, top to bottom, up to the first recipe row shown. */
  const partsAbove = (screen: Screen): string[] => {
    const list = drawerOf(screen).querySelector(".board-sheet-list");
    const shown = [...(list?.children ?? [])].filter(
      (part) => !(part as HTMLElement).hidden,
    );
    const first = shown.findIndex(
      (part) =>
        part.classList.contains("workshop-recipe") ||
        part.classList.contains("workshop-sketch"),
    );
    return shown
      .slice(0, first)
      .map((part) => part.className.split(" ")[0] ?? "");
  };
  const timersLine = (screen: Screen): HTMLElement => {
    const found =
      drawerOf(screen).querySelector<HTMLElement>(".workshop-timers");
    if (found === null) throw new Error("no timers line");
    return found;
  };

  it("the timers line keeps its room, so no row moves when the last timer ends", () => {
    let clock = CLOCK;
    const screen = mount(
      rich({ clocks: { ...COLD_CLOCKS, "axle-grease": CLOCK + 60_000 } }),
      {
        now: () => clock,
        tapClock: () => clock,
      },
    );
    keyOf(screen, "workshop").click();
    expect(timersLine(screen).textContent).toMatch(/^Axle grease · /);
    const above = partsAbove(screen);
    const rows = shownRows(screen);
    clock += 61_000;
    screen.progress.applyMutation((current) => current);
    expect(timersLine(screen).textContent).toBe("");
    expect(timersLine(screen).hidden).toBe(false);
    expect(timersLine(screen).classList.contains("is-empty")).toBe(true);
    expect(partsAbove(screen)).toEqual(above);
    expect(shownRows(screen)).toEqual(rows);
  });

  it("the timers line keeps its room, so no row moves when a craft starts the first timer", () => {
    let clock = CLOCK;
    const screen = mount(rich(), { now: () => clock, tapClock: () => clock });
    keyOf(screen, "workshop").click();
    clock += PAST_SETTLE;
    const row = pageTo(screen, "axle-grease");
    expect(timersLine(screen).textContent).toBe("");
    expect(timersLine(screen).classList.contains("is-empty")).toBe(true);
    const above = partsAbove(screen);
    const rows = shownRows(screen);
    clock += PAST_SETTLE;
    row.click();
    expect(screen.progress.getSnapshot().mountain.bench?.recipe).toBe(
      "axle-grease",
    );
    expect(timersLine(screen).textContent).toMatch(/^Axle grease · /);
    expect(timersLine(screen).classList.contains("is-empty")).toBe(false);
    expect(partsAbove(screen)).toEqual(above);
    expect(shownRows(screen)).toEqual(rows);
  });

  it("the plates open the cards", () => {
    let clock = 10_000;
    const screen = mount(granite(), { tapClock: () => clock });
    keyOf(screen, "workshop").click();
    const plates = [
      ...drawerOf(screen).querySelectorAll<HTMLButtonElement>(
        ".workshop-mat:not([hidden])",
      ),
    ];
    expect(plates.map((plate) => plate.dataset["material"])).toEqual([
      "clay",
      "iron",
    ]);
    const how = drawerOf(screen).querySelector<HTMLElement>(".board-sheet-how");
    fingerTap(plates[0] as HTMLButtonElement);
    expect(how?.hidden).toBe(true);
    clock += PAST_SETTLE;
    fingerTap(plates[0] as HTMLButtonElement);
    expect(how?.hidden).toBe(false);
    expect(how?.querySelector("[data-how=workshop]")).not.toBeNull();
    expect(how?.querySelector("[data-how=materials]")).not.toBeNull();
    const back = [
      ...(how?.querySelectorAll<HTMLButtonElement>(".teach-how-back") ?? []),
    ].find((each) => !each.hidden);
    expect(back?.textContent).toBe("Back to the Workshop");
    clock += PAST_SETTLE;
    back?.click();
    expect(how?.hidden).toBe(true);
    expect(
      drawerOf(screen).querySelector<HTMLElement>(".board-sheet-list")?.hidden,
    ).toBe(false);
  });

  it("sound: the key flips, and a craft knocks the hammer once it is on", () => {
    const started: number[] = [];
    class FakeAudio {
      readonly sampleRate = 8_000;
      readonly destination = {};
      createBuffer(_channels: number, length: number) {
        return { getChannelData: () => new Float32Array(length) };
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
    try {
      let clock = 10_000;
      const screen = mount(rich(), { tapClock: () => clock });
      keyOf(screen, "workshop").click();
      clock += PAST_SETTLE;
      const sound = drawerOf(screen).querySelector<HTMLButtonElement>(
        ".board-sheet-head .workshop-sound",
      );
      expect(sound?.getAttribute("aria-pressed")).toBe("false");
      expect(sound?.getAttribute("aria-label")).toBe("Sound is off");
      sound?.click();
      expect(sound?.getAttribute("aria-pressed")).toBe("true");
      expect(sound?.getAttribute("aria-label")).toBe("Sound is on");
      expect(sound?.textContent).toBe("Sound");
      expect(started).toHaveLength(1);
      pageTo(screen, "axle-grease").click();
      expect(started).toHaveLength(2);
    } finally {
      window.AudioContext = previous;
    }
  });

  it("shows a craft this build cannot name and will not replace it", () => {
    const screen = mount(
      rich({
        kept: {
          ...NOTHING_KEPT,
          bench: {
            recipe: "future-bit",
            startedAt: CLOCK,
            endsAt: CLOCK + 8 * 60_000,
          },
        },
      }),
    );
    keyOf(screen, "workshop").click();
    const bench = benchRow(screen);
    expect(partOf(bench, "name")).toBe("Something is on the bench");
    expect(partOf(bench, "gain")).toBe("8:00");
    expect(bench.textContent).not.toContain("Cancel ·");
    expect(bench.querySelector<HTMLElement>(".workshop-bar")?.hidden).toBe(
      false,
    );
    const row = drawerOf(screen).querySelector<HTMLButtonElement>(
      ".workshop-recipe:not([hidden])",
    );
    expect(row?.querySelector(".board-row-verb")?.textContent).toBe(
      "Bench busy",
    );
    row?.click();
    bench.click();
    expect(screen.progress.getSnapshot().mountain.bench).toBeUndefined();
    expect(screen.progress.getSnapshot().mountain.kept.bench?.recipe).toBe(
      "future-bit",
    );
  });

  it("stays locked until the Granite, then crafts for real", () => {
    const screen = mount({ ...createMountain() });
    expect(keyOf(screen, "workshop").disabled).toBe(true);
    keyOf(screen, "workshop").click();
    expect(isOpen(screen)).toBe(false);
    screen.progress.applyMutation(() => rich());
    expect(keyOf(screen, "workshop").disabled).toBe(false);
    keyOf(screen, "workshop").click();
    expect(isOpen(screen)).toBe(true);
    const row = pageTo(screen, "axle-grease");
    expect(partOf(row, "verb")).toBe("Craft");
    row.click();
    expect(screen.progress.getSnapshot().mountain.bench?.recipe).toBe(
      "axle-grease",
    );
    expect(benchRow(screen).textContent).toContain("Cancel ·");
    expect(
      drawerOf(screen).querySelector(".workshop-timers")?.textContent,
    ).toMatch(/^Axle grease · \d+:\d\d left$/);
  });

  it("guides the first craft: New row, How it works, then the payoff (#243)", () => {
    vi.useFakeTimers();
    try {
      guideFirstCraft();
    } finally {
      vi.useRealTimers();
    }
  });

  function guideFirstCraft(): void {
    let clock = CLOCK;
    const screen = mount(
      granite({
        pocket: 400_000,
        helpers: 40,
        materials: { clay: 10, iron: 0, crystal: 0, heartstone: 0 },
        seen: [],
        taught: [],
      }),
      { now: () => clock, tapClock: () => clock },
    );
    keyOf(screen, "workshop").click();
    expect(isOpen(screen)).toBe(true);
    expect(
      drawerOf(screen).querySelector(".board-sheet-kick")?.textContent,
    ).toBe("Turn your clay into gear for the crew.");
    const first = recipeRow(screen, "blasting-charge");
    expect(shownRows(screen)[0]).toBe("blasting-charge");
    expect(first.classList.contains("teach-new")).toBe(true);
    expect(partOf(first, "flag")).toBe("New");

    drawerOf(screen)
      .querySelector<HTMLButtonElement>(".board-sheet-info")
      ?.click();
    const how = drawerOf(screen).querySelector<HTMLElement>(
      "[data-how='workshop']",
    );
    expect(how?.querySelectorAll("li")).toHaveLength(4);
    drawerOf(screen)
      .querySelector<HTMLButtonElement>(
        "[data-how='materials'] .teach-how-back",
      )
      ?.click();

    first.click();
    clock += 1_000;
    screen.progress.applyMutation((current) => current);
    expect(screen.progress.getSnapshot().mountain.bench?.recipe).toBe(
      "blasting-charge",
    );
    expect(screen.progress.getSnapshot().mountain.taught).toEqual(["workshop"]);
    // The row holds Done, then shows the payoff.
    clock += 1_000;
    vi.advanceTimersByTime(2_000);
    expect(first.classList.contains("teach-new")).toBe(false);
    expect(partOf(first, "flag")).toMatch(/^\+[\d,]+\/s now$/);
    expect(
      drawerOf(screen).querySelector(".board-sheet-kick")?.textContent,
    ).toBe("One bench. Crafts finish while you are away");
  }

  it("cancels a running craft for the refund", () => {
    const screen = mount(busy(CLOCK));
    keyOf(screen, "workshop").click();
    const bench = benchRow(screen);
    expect(partOf(bench, "info")).toBe(
      "Cancel · 250K stones, 10 clay, and 4 iron back",
    );
    bench.click();
    bench.click();
    const mountain = screen.progress.getSnapshot().mountain;
    expect(mountain.bench).toBeUndefined();
    expect(mountain.pocket).toBe(250_000);
  });

  it("one drawer at a time", () => {
    const screen = mount(granite());
    keyOf(screen, "workshop").click();
    keyOf(screen, "buys").click();
    expect(isOpen(screen)).toBe(false);
    expect(isOpen(screen, "buys")).toBe(true);
    keyOf(screen, "workshop").click();
    expect(isOpen(screen, "buys")).toBe(false);
    expect(isOpen(screen)).toBe(true);
    keyOf(screen, "upgrades").click();
    expect(isOpen(screen)).toBe(false);
    keyOf(screen, "workshop").click();
    expect(isOpen(screen, "upgrades")).toBe(false);
    escape();
    expect(isOpen(screen)).toBe(false);
    expect(document.activeElement).toBe(keyOf(screen, "workshop"));
  });

  it("while the save loads again", async () => {
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: () => () => undefined,
    };
    const auth = createMemoryAuth();
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: busy(CLOCK), lastSeen: CLOCK });
    const screen = mountScreen({ auth, cloudSave, storage, now: () => CLOCK });
    document.body.append(screen.root);
    keyOf(screen, "workshop").click();
    expect(benchRow(screen).disabled).toBe(false);
    await auth.signIn();
    await Promise.resolve();
    expect(screen.progress.getSnapshot().ready).toBe(false);
    expect(isOpen(screen)).toBe(true);
    expect(benchRow(screen).disabled).toBe(true);
    const shown = [
      ...drawerOf(screen).querySelectorAll<HTMLButtonElement>(
        ".workshop-recipe:not([hidden]), .workshop-mat:not([hidden])",
      ),
    ];
    expect(shown.length).toBeGreaterThan(0);
    expect(shown.every((each) => each.disabled)).toBe(true);
    expect(
      [...drawerOf(screen).querySelectorAll(".workshop-mat-count")].map(
        (count) => count.textContent,
      ),
    ).toEqual(["", "", "", ""]);
    // Back goes to the Ledger key while the re-load holds the Workshop's.
    expect(keyOf(screen, "workshop").disabled).toBe(true);
    escape();
    expect(isOpen(screen)).toBe(false);
    expect(document.activeElement).toBe(keyOf(screen, "ledger"));
  });

  it("a card that opens over the drawer during a re-load keeps its focus", async () => {
    const cloudSave: CloudSave = {
      load: () => Promise.resolve({ kind: "missing" }),
      write: () => Promise.resolve({ kind: "ok" }),
      writeFieldLog: () => Promise.resolve({ kind: "ok" }),
      watch: () => () => undefined,
    };
    const auth = createMemoryAuth();
    const storage = createMemoryStorage();
    writeSessionSave({ storage, mountain: busy(CLOCK), lastSeen: CLOCK });
    const screen = mountScreen({ auth, cloudSave, storage, now: () => CLOCK });
    document.body.append(screen.root);
    keyOf(screen, "workshop").click();
    await auth.signIn();
    await Promise.resolve();
    expect(keyOf(screen, "workshop").disabled).toBe(true);
    expect(isOpen(screen)).toBe(true);
    screen.progress.layoutPreview.conflict();
    expect(isOpen(screen)).toBe(false);
    const card = screen.root.querySelector<HTMLElement>(".save-conflict");
    expect(card?.hidden).toBe(false);
    expect(card?.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(keyOf(screen, "ledger"));
  });

  it("closes when the save it was open on starts over", () => {
    const screen = mount(granite());
    keyOf(screen, "workshop").click();
    expect(isOpen(screen)).toBe(true);
    screen.progress.applyMutation(() => createMountain());
    expect(isOpen(screen)).toBe(false);
  });

  it("draws the plates' own art", () => {
    const screen = mount(granite());
    keyOf(screen, "workshop").click();
    const icon = drawerOf(screen).querySelector<HTMLImageElement>(
      ".workshop-mat[data-material=clay] img",
    );
    expect(icon?.getAttribute("src")).not.toBe(tileUrl);
    expect(icon?.getAttribute("src")).toContain("res-clay");
  });
});
