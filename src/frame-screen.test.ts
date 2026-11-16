// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { placeOrder } from "./city";
import { holdFactors } from "./economy/factors";
import { mountFrameScreen } from "./frame-screen";
import { PART_TWO_OFF } from "./part-switch";
import type { Mountain } from "./mountain";
import { createProgressStore } from "./progress-store";
import { createMemoryStorage, CREWED_JOBS } from "./test-fixtures";
import { NO_FREE_WORKER } from "./workforce-view";

/** Slice 1's frame and its workforce, on the DOM (#659). */

let unmount = new AbortController();

beforeEach(() => {
  holdFactors({});
});

afterEach(() => {
  unmount.abort();
  unmount = new AbortController();
  holdFactors({});
});

function mount(change: (mountain: Mountain) => Mountain = (m) => m) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const auth = createUnconfiguredAuth();
  const progress = createProgressStore({
    auth,
    sessionStorage: createMemoryStorage(),
    cloudWriteGapMs: 0,
  });
  // The screens are read with the crew of 21 the tests were written for (#703).
  progress.applyMutation((start) =>
    change({
      ...start,
      owned: { ...start.owned, helper: 21 },
      jobs: CREWED_JOBS,
    }),
  );
  const screen = mountFrameScreen({
    root,
    auth,
    progress,
    storage: createMemoryStorage(),
    signal: unmount.signal,
  });
  const button = (selector: string): HTMLButtonElement => {
    const found = root.querySelector(selector);
    if (!(found instanceof HTMLButtonElement)) {
      throw new Error(`${selector} did not render`);
    }
    return found;
  };
  return { root, progress, screen, button };
}

const withStones =
  (stones: number) =>
  (mountain: Mountain): Mountain => ({
    ...mountain,
    stock: { ...mountain.stock, stones },
  });

/** The keys that hire, by what they say: in the frame, outside the workforce sheet. */
function hireKeysInFrame(root: HTMLElement): Element[] {
  const frame = root.querySelector(".frame");
  return [...(frame?.querySelectorAll("button") ?? [])].filter((key) =>
    /^Hire\b/.test(key.getAttribute("aria-label") ?? key.textContent),
  );
}

describe("frame screen", () => {
  it("has one hire key on every site, beside the count of workers, and no other", () => {
    const { root, button } = mount();
    for (const site of ["mine", "city", "mine"]) {
      button(`.frame-site[data-site="${site}"]`).click();
      const keys = hireKeysInFrame(root);
      expect(keys).toHaveLength(1);
      expect(keys[0]?.parentElement?.className).toBe("frame-top");
      // The mine's keys buy machines and move workers; none of them hires.
    }
  });

  it("hires at the amount key's amount", () => {
    const { progress, button } = mount(withStones(10_000));
    button(".frame-hire").click();
    expect(progress.getSnapshot().mountain.owned.helper).toBe(22);
    button(".frame-workers").click();
    button(".frame-amount").click();
    expect(button(".frame-hire").textContent).toContain("+10 Workers");
    button(".frame-hire").click();
    expect(progress.getSnapshot().mountain.owned.helper).toBe(32);
  });

  it("says where a free worker comes from when + has none", () => {
    const { root, progress, button } = mount();
    button(".frame-workers").click();
    const sheet = root.querySelector<HTMLElement>(".frame-sheet");
    expect(sheet?.hidden).toBe(false);
    const note = root.querySelector<HTMLElement>(".frame-sheet-note");
    expect(note?.hidden).toBe(true);
    button(
      '.frame-sheet .frame-step[data-job="drilling"][data-way="place"]',
    ).click();
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toBe(NO_FREE_WORKER);
    expect(progress.getSnapshot().mountain.jobs.drilling).toBe(6);
    button(
      '.frame-sheet .frame-step[data-job="building"][data-way="free"]',
    ).click();
    expect(note?.hidden).toBe(true);
    button(
      '.frame-sheet .frame-step[data-job="drilling"][data-way="place"]',
    ).click();
    expect(progress.getSnapshot().mountain.jobs).toMatchObject({
      drilling: 7,
      building: 1,
      kilns: 0,
    });
  });

  it("takes the no-free-worker line down once a worker is hired", () => {
    const { root, button } = mount(withStones(1_000));
    button(".frame-workers").click();
    button(
      '.frame-sheet .frame-step[data-job="drilling"][data-way="place"]',
    ).click();
    const note = root.querySelector<HTMLElement>(".frame-sheet-note");
    expect(note?.hidden).toBe(false);
    button(".frame-sheet-hire").click();
    expect(note?.hidden).toBe(true);
  });

  it("moves up to ten workers at ×10", () => {
    const { progress, button } = mount();
    button(".frame-workers").click();
    button(".frame-amount").click();
    button(
      '.frame-sheet .frame-step[data-job="drilling"][data-way="free"]',
    ).click();
    expect(progress.getSnapshot().mountain.jobs.drilling).toBe(0);
    button(
      '.frame-sheet .frame-step[data-job="haulage"][data-way="place"]',
    ).click();
    expect(progress.getSnapshot().mountain.jobs.haulage).toBe(12);
  });

  it("points Next at the building nobody has ordered, and goes to the city", () => {
    const { root, button } = mount();
    expect(root.querySelector(".frame-next-line")?.textContent).toBe(
      "Order the Light Tower",
    );
    button(".frame-next").click();
    expect(button(".frame-site.on").dataset["site"]).toBe("city");
    expect(root.querySelector(".frame-order-step")?.textContent).toBe(
      "Foundation · not ordered",
    );
  });

  it("takes Next to the next site with something affordable", () => {
    const { root, button } = mount((m) => withStones(1_000)(placeOrder(m)));
    expect(root.querySelector(".frame-next-line")?.textContent).toBe(
      "Mine 1 · City 1",
    );
    button(".frame-next").click();
    expect(button(".frame-site.on").dataset["site"]).toBe("city");
    button(".frame-next").click();
    expect(button(".frame-site.on").dataset["site"]).toBe("mine");
  });

  it("opens the workforce from Next when only the worker's upgrades are affordable", () => {
    const { root, button } = mount((m) => ({
      ...withStones(1_700_000)(placeOrder(m)),
      owned: { ...m.owned, cart: 60, hoist: 40, drill: 30 },
      fleet: { horseWagon: 60, truck: 0 },
    }));
    expect(root.querySelector(".frame-next-line")?.textContent).toBe(
      "Workforce 1",
    );
    button(".frame-next").click();
    expect(root.querySelector<HTMLElement>(".frame-sheet")?.hidden).toBe(false);
    button(".frame-sheet-close").click();
    expect(root.querySelector<HTMLElement>(".frame-sheet")?.hidden).toBe(true);
  });

  it("opens the workforce from Next when only this site and the workforce have something", () => {
    const { root, button } = mount((m) => ({
      ...withStones(1_700_000)(placeOrder(m)),
      fleet: { horseWagon: 60, truck: 0 },
    }));
    expect(root.querySelector(".frame-next-line")?.textContent).toBe(
      "Mine 3 · Workforce 1",
    );
    button(".frame-next").click();
    expect(root.querySelector<HTMLElement>(".frame-sheet")?.hidden).toBe(false);
    expect(button(".frame-site.on").dataset["site"]).toBe("mine");
  });

  it("stays put on a Next with nothing to point at", () => {
    const { root, button } = mount(placeOrder);
    expect(root.querySelector(".frame-next-head")?.textContent).toBe(
      "Nothing to buy on the sites yet.",
    );
    button(".frame-next").click();
    expect(button(".frame-site.on").dataset["site"]).toBe("mine");
    expect(root.querySelector<HTMLElement>(".frame-sheet")?.hidden).toBe(true);
  });

  it("names what is operational after the last roof, with no order to point at", () => {
    const { root } = mount((m) => ({ ...m, operational: ["lightTower"] }));
    expect(root.querySelector(".frame-order-line")?.textContent).toBe(
      "The Light Tower is operational · the city is planning its next building",
    );
    expect(root.querySelector(".frame-order-name")?.textContent).toBe("");
    // The line takes both rows, beside the pips and the Ledger's key (#708).
    expect(root.querySelector<HTMLElement>(".frame-order-top")?.hidden).toBe(
      true,
    );
    expect(
      root.querySelector<HTMLElement>(".frame-order")?.dataset["order"],
    ).toBe("planning");
  });

  it("paints the work of each second", () => {
    vi.useFakeTimers();
    try {
      const { root } = mount();
      const before = root.querySelector(".frame-pile-count")?.textContent;
      vi.advanceTimersByTime(5_000);
      expect(root.querySelector(".frame-pile-count")?.textContent).not.toBe(
        before,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("carries the exact stone count for the journeys, beside the shown one (#664)", () => {
    const { root, progress } = mount();
    const pile = root.querySelector<HTMLElement>(".frame-pile-count");
    expect(pile?.dataset["count"]).toBe(
      String(progress.getSnapshot().mountain.stock.stones),
    );
  });

  it("keeps the save line in view", () => {
    const { root } = mount();
    expect(root.querySelector(".board-saveline")).not.toBeNull();
  });
});

describe("the refinery on the frame (#671)", () => {
  const lit = (mountain: Mountain): Mountain => ({
    ...mountain,
    operational: ["lightTower"],
    stock: { ...mountain.stock, stones: 20_000 },
  });
  const tab = (root: HTMLElement): HTMLElement | null =>
    root.querySelector('.frame-site[data-site="refinery"]');

  it("has no refinery tab or site in part 1, even under the Light Tower's roof", () => {
    const { root } = mount(lit);
    expect(tab(root)?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".refinery")?.hidden).toBe(true);
  });

  it("opens the refinery in part 2 once the Light Tower is operational", () => {
    holdFactors({ [PART_TWO_OFF]: 0 });
    const { root, button } = mount(lit);
    expect(tab(root)?.hidden).toBe(false);
    button('.frame-site[data-site="refinery"]').click();
    expect(root.querySelector<HTMLElement>(".refinery")?.hidden).toBe(false);
    expect(root.querySelector(".refinery-recipe")?.textContent).toBe(
      "Recipe: 2 rock → 1 brick",
    );
    // The kiln is in reach at 20K stone: the key is lit, and buying takes the stone.
    const key = button(".refinery-kiln-key");
    expect(key.classList.contains("can")).toBe(true);
    key.click();
    expect(root.querySelector(".refinery-machines")?.textContent).toContain(
      "1 kiln",
    );
    // Two stockpiles on the top row now, each with its room.
    expect(root.querySelector(".frame-top")?.classList).toContain("two-piles");
  });

  it("has one hire key on the refinery too", () => {
    holdFactors({ [PART_TWO_OFF]: 0 });
    const { root, button } = mount(lit);
    button('.frame-site[data-site="refinery"]').click();
    expect(hireKeysInFrame(root)).toHaveLength(1);
  });

  it("moves a worker onto the kilns and off with − and +", () => {
    holdFactors({ [PART_TWO_OFF]: 0 });
    const { root, progress, button } = mount((mountain) => ({
      ...lit(mountain),
      owned: { ...mountain.owned, helper: mountain.owned.helper + 1 },
      makers: { kiln: 1, saw: 0 },
    }));
    button('.frame-site[data-site="refinery"]').click();
    const kilns = () => progress.getSnapshot().mountain.jobs.kilns;
    button('.refinery .frame-step[data-way="place"]').click();
    expect(kilns()).toBe(1);
    expect(root.querySelector(".refinery-machines")?.textContent).toBe(
      "1 kiln: 1 of 1 worker",
    );
    button('.refinery .frame-step[data-way="free"]').click();
    expect(kilns()).toBe(0);
  });

  it("expands the stockyard for its brick", () => {
    holdFactors({ [PART_TWO_OFF]: 0 });
    const { progress, button } = mount((mountain) => ({
      ...lit(mountain),
      stock: { ...lit(mountain).stock, brick: 150_000 },
    }));
    button('.frame-site[data-site="refinery"]').click();
    const expand = button(".refinery-expand");
    expect(expand.classList.contains("can")).toBe(true);
    expand.click();
    const after = progress.getSnapshot().mountain;
    expect(after.stockyard).toBe(1);
    expect(after.stock.brick).toBe(0);
  });

  it("groups the kilns under the refinery in the workforce only while it is open", () => {
    const group = (root: HTMLElement) =>
      root.querySelector<HTMLElement>(
        '.frame-jobs-group[data-site="refinery"]',
      );
    const one = mount(lit);
    expect(group(one.root)?.hidden).toBe(true);
    unmount.abort();
    unmount = new AbortController();
    holdFactors({ [PART_TWO_OFF]: 0 });
    const two = mount(lit);
    two.button(".frame-workers").click();
    expect(group(two.root)?.hidden).toBe(false);
    expect(group(two.root)?.textContent).toContain("Kilns");
  });

  it("goes back to the mine when the refinery closes under it", () => {
    holdFactors({ [PART_TWO_OFF]: 0 });
    const { root, progress, button } = mount(lit);
    button('.frame-site[data-site="refinery"]').click();
    expect(button(".frame-site.on").dataset["site"]).toBe("refinery");
    // A copy from before the Light Tower's roof is taken (a save card's choice).
    progress.applyMutation((mountain) => ({ ...mountain, operational: [] }));
    expect(
      root.querySelector<HTMLElement>(".frame-scene")?.dataset["site"],
    ).toBe("mine");
    expect(tab(root)?.hidden).toBe(true);
  });
});
