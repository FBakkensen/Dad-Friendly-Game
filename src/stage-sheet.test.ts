// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { holdFactors } from "./economy/factors";
import { mountFrameScreen } from "./frame-screen";
import type { Mountain } from "./mountain";
import { createProgressStore } from "./progress-store";
import { stageList } from "./stage-list-view";
import { createMemoryStorage, crewedStart } from "./test-fixtures";

/** A stage's list and the workers' upgrades, on the DOM (#661). */

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
  progress.applyMutation(change);
  const screen = mountFrameScreen({
    root,
    auth,
    progress,
    storage: createMemoryStorage(),
    signal: unmount.signal,
  });
  const find = (selector: string): HTMLElement => {
    const found = root.querySelector(selector);
    if (!(found instanceof HTMLElement)) {
      throw new Error(`${selector} did not render`);
    }
    return found;
  };
  const text = (selector: string): string =>
    root.querySelector(selector)?.textContent ?? "";
  return { root, progress, screen, find, text };
}

const withStones =
  (stones: number, owned: Partial<Mountain["owned"]> = {}) =>
  (mountain: Mountain): Mountain => ({
    ...mountain,
    owned: { ...mountain.owned, ...owned },
    stock: { ...mountain.stock, stones },
  });

const sheet = ".stage-sheet";

describe("a stage's list", () => {
  it("opens from a tap on a stage's row, with what it moves and a line for each part", () => {
    const { find, text, progress, root } = mount();
    expect(find(sheet).hidden).toBe(true);
    find('.mine-stage[data-stage="haul"] .mine-stage-info').click();
    expect(find(sheet).hidden).toBe(false);
    const view = stageList(progress.getSnapshot().mountain, "haul", "one", 0);
    expect(text(`${sheet} .frame-sheet-title`)).toBe("Haulage");
    expect(text(`${sheet} .stage-total`)).toBe(
      `Moves${view.now} of ${view.can}`,
    );
    expect(
      [...root.querySelectorAll(`${sheet} .stage-part`)].map(
        (line) => line.textContent,
      ),
    ).toEqual(
      view.parts.map((part) => `${part.name}${part.detail}${part.moves}`),
    );
    expect(find(`${sheet} .stage-moves`).getAttribute("aria-label")).toBe(
      view.sentence,
    );
    expect(find(`${sheet} .stage-page[data-stage="haul"]`).hidden).toBe(false);
    expect(find(`${sheet} .stage-page[data-stage="face"]`).hidden).toBe(true);
    find(`${sheet} .frame-sheet-close`).click();
    expect(find(sheet).hidden).toBe(true);
  });

  it("buys the stage's machine from its key, with the amount key", () => {
    const { find, progress } = mount(withStones(100_000_000));
    find('.mine-stage[data-stage="lift"] .mine-stage-info').click();
    find(`${sheet} .frame-amount`).click();
    find(`${sheet} [data-machine="hoist"] .stage-key`).click();
    expect(progress.getSnapshot().mountain.owned.hoist).toBe(10);
  });

  it("shows no old instant-buy upgrade rows in stage sheets (#780)", () => {
    const { find, root } = mount(withStones(5_000_000, { cart: 5, drill: 5 }));
    for (const stage of ["face", "haul", "lift"]) {
      find(`.mine-stage[data-stage="${stage}"] .mine-stage-info`).click();
      expect(root.querySelectorAll(`${sheet} [data-upgrade]`)).toHaveLength(0);
      expect(find(sheet).textContent).not.toContain("Upgrades");
    }
  });

  it("buys nothing from a dark key", () => {
    const { find, progress } = mount(withStones(0, { cart: 5 }));
    find('.mine-stage[data-stage="haul"] .mine-stage-info').click();
    find(`${sheet} [data-machine="cart"] .stage-key`).click();
    const mountain = progress.getSnapshot().mountain;
    expect(mountain.owned.cart).toBe(5);
  });

  it("lights a stage's row while its list holds something he can afford", () => {
    const { find } = mount(withStones(1_000));
    const lamp = (stage: string): string | null =>
      find(`.mine-stage[data-stage="${stage}"] .frame-lamp`).getAttribute(
        "data-lamp",
      );
    expect(lamp("haul")).toBe("green");
    expect(lamp("face")).toBe("dark");
  });

  it("never says hands, and names no limit", () => {
    const { find, root } = mount(withStones(5_000_000, { cart: 5, drill: 5 }));
    for (const stage of ["face", "haul", "lift"]) {
      find(`.mine-stage[data-stage="${stage}"] .mine-stage-info`).click();
      expect(find(sheet).textContent).not.toMatch(
        /\bhands?\b|by hand|bottleneck|limit|best buy/i,
      );
    }
    expect(root.textContent).not.toMatch(/\bhands?\b/i);
  });
});

describe("the workers in the workforce", () => {
  it("shows the workers' mark under the jobs without old Work boots upgrade rows (#780)", () => {
    const { find, root, text } = mount(() =>
      withStones(2_000_000)(crewedStart()),
    );
    find(".frame-workers").click();
    expect(text(".frame-workers-own .stage-row-why")).toBe(
      "21 of 25 · Every worker with a tool works twice as fast.",
    );
    expect(root.querySelectorAll(".frame-sheet [data-upgrade]")).toHaveLength(
      0,
    );
    expect(find(".frame-workers-own").textContent).not.toContain("Work boots");
  });
});
