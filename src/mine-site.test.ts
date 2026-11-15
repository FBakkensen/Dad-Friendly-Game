// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { holdFactors } from "./economy/factors";
import { mountFrameScreen } from "./frame-screen";
import { FRESH_OFF } from "./line-switch";
import { DEEPER_STRATA, stageRows } from "./mine-view";
import { createMemoryStorage } from "./mountain-screen.harness";
import type { Mountain } from "./mountain";
import { createProgressStore } from "./progress-store";
import { CREWED_JOBS } from "./test-fixtures";
import { NO_FREE_WORKER } from "./workforce-view";

/** The mine on slice 1's frame, on the DOM (#660). */

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
  // The mine is read with the crew of 21 the tests were written for (#703).
  progress.applyMutation((start) =>
    change({
      ...start,
      owned: { ...start.owned, helper: 21 },
      jobs: CREWED_JOBS,
    }),
  );
  mountFrameScreen({
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
  const text = (selector: string): string =>
    root.querySelector(selector)?.textContent ?? "";
  return { root, progress, button, text };
}

const withStones =
  (stones: number) =>
  (mountain: Mountain): Mountain => ({
    ...mountain,
    stock: { ...mountain.stock, stones },
  });

describe("the mine", () => {
  it("shows the Topsoil, its line, and no name for the level under it", () => {
    const { root, text } = mount();
    expect(text(".mine-level-name")).toBe("Topsoil");
    expect(text(".mine-level-line")).toBe(
      "4 crews · all rock is hoisted as stone",
    );
    expect(text(".mine-deep")).toBe(DEEPER_STRATA);
    expect(root.querySelector(".mine")?.textContent).not.toMatch(/granite/i);
  });

  it("is on the mine's site only", () => {
    const { root, button } = mount();
    const mine = root.querySelector<HTMLElement>(".mine");
    expect(mine?.hidden).toBe(false);
    button('.frame-site[data-site="city"]').click();
    expect(mine?.hidden).toBe(true);
    button('.frame-site[data-site="mine"]').click();
    expect(mine?.hidden).toBe(false);
  });

  it("has a key for each stage's machine and no hire key", () => {
    const { root } = mount();
    const keys = [...root.querySelectorAll<HTMLElement>(".mine .mine-key")];
    expect(keys.map((key) => key.dataset["stage"])).toEqual([
      "face",
      "haul",
      "lift",
    ]);
    expect(keys[1]?.textContent).toMatch(/^\+Cart · .*\/s.* · 1 to run$/);
    const words = [
      ...(root.querySelector(".mine")?.querySelectorAll("button") ?? []),
    ]
      .map(
        (key) => `${key.textContent} ${key.getAttribute("aria-label") ?? ""}`,
      )
      .join(" ");
    expect(words).not.toMatch(/\bhire\b|\+Worker/i);
  });

  it("buys a stage's machine from its key", () => {
    const { progress, button } = mount(withStones(10_000));
    button('.mine-key[data-stage="haul"]').click();
    expect(progress.getSnapshot().mountain.owned.cart).toBe(1);
  });

  it("buys nothing when the key is dark", () => {
    const { progress, button } = mount(withStones(0));
    button('.mine-key[data-stage="haul"]').click();
    expect(progress.getSnapshot().mountain.owned.cart).toBe(0);
  });

  it("says each stage's rate and who works with what, as the view does", () => {
    const { progress, text } = mount();
    const [drilling] = stageRows(progress.getSnapshot().mountain);
    expect(text('.mine-stage[data-stage="face"] .mine-stage-name')).toBe(
      "Drilling",
    );
    expect(text('.mine-stage[data-stage="face"] .mine-stage-rate')).toBe(
      `${drilling?.now ?? ""} of ${drilling?.can ?? ""}`,
    );
    expect(text('.mine-stage[data-stage="face"] .mine-stage-sum')).toBe(
      drilling?.sum[0],
    );
    expect(text('.mine-stage[data-stage="face"] .mine-stage-count')).toBe(
      `${String(drilling?.workers)}workers`,
    );
  });

  it("says the pile after drilling and after haulage inside the row's words", () => {
    const { root, text } = mount((mountain) => ({
      ...mountain,
      piles: { face: 200, shaft: 12 },
    }));
    const pile = (stage: string) =>
      root.querySelector<HTMLElement>(
        `.mine-stage[data-stage="${stage}"] .mine-stage-info .mine-stage-pile`,
      );
    expect(text('.mine-stage[data-stage="face"] .mine-stage-pile')).toBe(
      "Drilled rock: 200 of 300",
    );
    expect(text('.mine-stage[data-stage="haul"] .mine-stage-pile')).toBe(
      "Rock at the shaft: 12 of 300",
    );
    expect(pile("face")?.hidden).toBe(false);
    expect(pile("lift")?.hidden).toBe(true);
    expect(
      root
        .querySelector('.mine-stage[data-stage="face"] .mine-stage-info')
        ?.getAttribute("aria-label"),
    ).toMatch(/Drilled rock: 200 of 300\. Opens its list\.$/);
  });

  it("says where a free worker comes from when + has none, and moves with −", () => {
    const { root, progress, button } = mount();
    const note = root.querySelector<HTMLElement>(".mine-note");
    expect(note?.hidden).toBe(true);
    const drilling = progress.getSnapshot().mountain.jobs.drilling;
    button('.mine .frame-step[data-job="drilling"][data-way="place"]').click();
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toBe(NO_FREE_WORKER);
    expect(progress.getSnapshot().mountain.jobs.drilling).toBe(drilling);
    button('.mine .frame-step[data-job="hoisting"][data-way="free"]').click();
    expect(note?.hidden).toBe(true);
    button('.mine .frame-step[data-job="drilling"][data-way="place"]').click();
    expect(progress.getSnapshot().mountain.jobs.drilling).toBe(drilling + 1);
  });

  it("takes the no-free-worker line down once a worker is hired", () => {
    const { root, button } = mount(withStones(1_000));
    button('.mine .frame-step[data-job="haulage"][data-way="place"]').click();
    const note = root.querySelector<HTMLElement>(".mine-note");
    expect(note?.hidden).toBe(false);
    button(".frame-hire").click();
    expect(note?.hidden).toBe(true);
  });

  it("says a machine stands, with both numbers, when its workers move more with tools", () => {
    holdFactors({ [FRESH_OFF]: 0, "output.cart": 0.03 });
    const { progress, text } = mount((m) => ({
      ...m,
      owned: { ...m.owned, cart: 1 },
    }));
    const [, haulage] = stageRows(progress.getSnapshot().mountain);
    expect(haulage?.sum[0]).toMatch(
      /^1 cart stands · 1 worker moves .*\/s with a barrow, .*\/s on the cart \+ \d+ with barrows .*\/s$/,
    );
    expect(text('.mine-stage[data-stage="haul"] .mine-stage-sum')).toBe(
      haulage?.sum[0],
    );
  });

  it("keeps the approved words, /s included, when the stand line takes two lines", () => {
    holdFactors({ [FRESH_OFF]: 0, "output.cart": 0.03 });
    const proto = HTMLElement.prototype;
    const wide = Object.getOwnPropertyDescriptor(proto, "scrollWidth");
    const narrow = Object.getOwnPropertyDescriptor(proto, "clientWidth");
    Object.defineProperty(proto, "scrollWidth", {
      configurable: true,
      get: () => 1000,
    });
    Object.defineProperty(proto, "clientWidth", {
      configurable: true,
      get: () => 100,
    });
    try {
      const { root, progress } = mount((m) => ({
        ...m,
        owned: { ...m.owned, cart: 1 },
      }));
      const [, haulage] = stageRows(progress.getSnapshot().mountain);
      const sum = root.querySelector(
        '.mine-stage[data-stage="haul"] .mine-stage-sum',
      );
      expect(sum?.classList.contains("wrap")).toBe(true);
      expect(sum?.textContent).toBe(haulage?.sum[0]);
      expect(sum?.textContent).toMatch(/\/s with a barrow, .*\/s on the cart/);
    } finally {
      for (const [key, descriptor] of [
        ["scrollWidth", wide],
        ["clientWidth", narrow],
      ] as const) {
        if (descriptor === undefined) {
          Reflect.deleteProperty(proto, key);
        } else {
          Object.defineProperty(proto, key, descriptor);
        }
      }
    }
  });

  it("never says hands, and names no limit", () => {
    const { root } = mount();
    expect(root.querySelector(".mine")?.textContent).not.toMatch(
      /\bhands?\b|by hand|bottleneck|limit/i,
    );
  });
});
