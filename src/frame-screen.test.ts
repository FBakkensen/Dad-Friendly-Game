// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { holdFactors } from "./economy/factors";
import { mountFrameScreen } from "./frame-screen";
import { FRESH_OFF } from "./line-switch";
import { createMemoryStorage } from "./mountain-screen.harness";
import type { Mountain } from "./mountain";
import { createProgressStore } from "./progress-store";
import { NO_FREE_WORKER } from "./workforce-view";

/** Slice 1's frame and its workforce, on the DOM (#659). */

let unmount = new AbortController();

beforeEach(() => {
  holdFactors({ [FRESH_OFF]: 0 });
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
      expect(root.querySelector(".frame-scene button")).toBeNull();
    }
  });

  it("hires at the amount key's amount", () => {
    const { progress, button } = mount(withStones(10_000));
    button(".frame-hire").click();
    expect(progress.getSnapshot().mountain.owned.helper).toBe(13);
    button(".frame-workers").click();
    button(".frame-amount").click();
    expect(button(".frame-hire").textContent).toContain("+10 Workers");
    button(".frame-hire").click();
    expect(progress.getSnapshot().mountain.owned.helper).toBe(23);
  });

  it("says where a free worker comes from when + has none", () => {
    const { root, progress, button } = mount();
    button(".frame-workers").click();
    const sheet = root.querySelector<HTMLElement>(".frame-sheet");
    expect(sheet?.hidden).toBe(false);
    const note = root.querySelector<HTMLElement>(".frame-sheet-note");
    expect(note?.hidden).toBe(true);
    button('.frame-step[data-job="drilling"][data-way="place"]').click();
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toBe(NO_FREE_WORKER);
    expect(progress.getSnapshot().mountain.jobs.drilling).toBe(3);
    button('.frame-step[data-job="building"][data-way="free"]').click();
    expect(note?.hidden).toBe(true);
    button('.frame-step[data-job="drilling"][data-way="place"]').click();
    expect(progress.getSnapshot().mountain.jobs).toMatchObject({
      drilling: 4,
      building: 1,
    });
  });

  it("moves up to ten workers at ×10", () => {
    const { progress, button } = mount();
    button(".frame-workers").click();
    button(".frame-amount").click();
    button('.frame-step[data-job="drilling"][data-way="free"]').click();
    expect(progress.getSnapshot().mountain.jobs.drilling).toBe(0);
    button('.frame-step[data-job="haulage"][data-way="place"]').click();
    expect(progress.getSnapshot().mountain.jobs.haulage).toBe(6);
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

  it("keeps the save line in view", () => {
    const { root } = mount();
    expect(root.querySelector(".board-saveline")).not.toBeNull();
  });
});
