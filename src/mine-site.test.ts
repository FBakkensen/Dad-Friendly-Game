// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { graniteBuyMove, tierBuyMove } from "./economy/actions";
import { holdFactors } from "./economy/factors";
import { mountFrameScreen } from "./frame-screen";
import { FRESH_OFF } from "./line-switch";
import {
  HOIST_WAITS_LINE,
  NOT_NOW,
  SHAFT_WAITS_LINE,
  hoistingRow,
  machineCardTitle,
  mineLevels,
} from "./mine-level-view";
import { shaftPrice } from "./mine-levels";
import { DEEPER_STRATA, stageRows } from "./mine-view";
import type { Mountain } from "./mountain";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { levels } from "./part-three.harness";
import { createProgressStore } from "./progress-store";
import { createMemoryStorage, CREWED_JOBS } from "./test-fixtures";
import type { BuyAmount } from "./tiers";
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

function mount(
  change: (mountain: Mountain) => Mountain = (m) => m,
  amount: BuyAmount = "one",
) {
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
  const storage = createMemoryStorage();
  storage.setItem("dad-friendly-buy-amount", amount);
  mountFrameScreen({
    root,
    auth,
    progress,
    storage,
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
  it("shows the Topsoil, no line under it (#715), and no name for the level under it", () => {
    const { root, text } = mount();
    expect(text(".mine-level-name")).toBe("Topsoil");
    expect(root.querySelector(".mine-level-line")).toBeNull();
    expect(root.querySelector(".mine")?.textContent).not.toMatch(/crews/i);
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
      piles: { face: 200, shaft: 12, kiln: 0 },
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

  it("paints today's mine with part 3 off", () => {
    const { root } = mount(withStones(50_000));
    const mine = root.querySelector<HTMLElement>(".mine");
    expect({
      text: mine?.textContent,
      stages: [...(mine?.querySelectorAll("[data-stage]") ?? [])].map(
        (each) => `${each.className}:${each.getAttribute("data-stage") ?? ""}`,
      ),
      elements: mine?.querySelectorAll("*").length,
    }).toMatchInlineSnapshot(`
      {
        "elements": 87,
        "stages": [
          "mine-zone:lift",
          "mine-zone:haul",
          "mine-zone:face",
          "mine-key:face",
          "mine-key can:haul",
          "mine-key can:lift",
          "mine-stage:face",
          "mine-stage:haul",
          "mine-stage:lift",
        ],
        "text": "Topsoil18/sHoistingHaulageDrillingDeeper strata: not yet surveyed. The city has to grow first.No free worker. Hire one, or take one off another job.+Drill · 108/s73K · 1 to run+Cart · 60/s600 · 1 to run+Hoist · 60/s6,000 · 1 to runDrilling18 of 18/s6 with picks 18/sDrilled rock: 0 of 300−6workers+Haulage18 of 18/s6 with barrows 18/sRock at the shaft: 0 of 300−6workers+Hoisting18 of 18/s6 on winches 18/s−6workers+",
      }
    `);
  });

  it("never says hands, and names no limit", () => {
    const { root } = mount();
    expect(root.querySelector(".mine")?.textContent).not.toMatch(
      /\bhands?\b|by hand|bottleneck|limit/i,
    );
  });
});

/** Part 3's mine, on the DOM (#680): the Granite's gate, its two levels, the strip and the machine card. */
describe("the mine with two levels", () => {
  beforeEach(() => {
    holdFactors({ [FRESH_OFF]: 0, [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 });
  });

  const twoLevels = (mountain: Mountain) => () => mountain;

  /** The moves the site sends, with nothing applied: a tap's move is what is checked. */
  function sent(progress: ReturnType<typeof mount>["progress"]) {
    return vi
      .spyOn(progress, "dispatch")
      .mockImplementation(() => ({ kind: "refused", reason: "no-change" }));
  }

  it("paints each level's rows on the level and its piles under its gallery", () => {
    const mountain = levels({
      topsoil: 3,
      granite: 2,
      hoisting: 2,
      hoists: 1,
      piles: { face: 20, shaft: 5 },
      granitePiles: { face: 7, shaft: 3 },
    });
    const { root, progress } = mount(twoLevels(mountain));
    const views = mineLevels(progress.getSnapshot().mountain);
    const boxes = [...root.querySelectorAll<HTMLElement>(".mine-level-rows")];
    expect(boxes.map((box) => box.dataset["level"])).toEqual([
      "topsoil",
      "granite",
    ]);
    for (const [index, box] of boxes.entries()) {
      const view = views[index];
      const rows = [...box.querySelectorAll(".mine-stage")];
      expect(rows.map((row) => row.getAttribute("data-stage"))).toEqual([
        "face",
        "haul",
      ]);
      const [drilling, haulage] = view?.rows ?? [];
      const head = (at: number, part: string) =>
        rows[at]?.querySelector(part)?.textContent;
      // "TOPSOIL drilling 1,300 of 1,300/s": the name is upper case in the CSS, as every row's is.
      expect(head(0, ".mine-stage-name")).toBe(view?.name);
      expect(head(0, ".mine-stage-rate")).toBe(
        `drilling ${drilling?.now ?? ""} of ${drilling?.can ?? ""}`,
      );
      expect(head(1, ".mine-stage-name")).toBe("Haulage");
      expect(head(1, ".mine-stage-rate")).toBe(
        `${haulage?.now ?? ""} of ${haulage?.can ?? ""}`,
      );
      expect(
        rows[0]
          ?.querySelector('[data-job][data-way="place"]')
          ?.getAttribute("data-job"),
      ).toBe(index === 0 ? "drilling" : "graniteDrilling");
    }
    const piles = (level: string) =>
      root.querySelector(`.mine-piles[data-level="${level}"]`)?.textContent;
    expect(piles("topsoil")).toMatch(
      /^Rock at the shaft: 5 of [\d,]+Drilled rock: 20 of [\d,]+$/,
    );
    expect(piles("granite")).toMatch(
      /^Rock at the shaft: 3 of [\d,]+Drilled rock: 7 of [\d,]+$/,
    );
    // The one-level rows, the plate and the zones give way to the levels' own.
    expect(root.querySelector<HTMLElement>(".mine-stages")?.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>(".mine-over")?.hidden).toBe(true);
    // Hoisting has the one row under the keys.
    const lift = hoistingRow(progress.getSnapshot().mountain);
    expect(
      root.querySelector(
        '.mine-hoisting .mine-stage[data-stage="lift"] .mine-stage-rate',
      )?.textContent,
    ).toBe(`${lift.now} of ${lift.can}`);
    expect(root.querySelector(".mine")?.textContent).not.toMatch(
      /\bhands?\b|by hand|\bface\b|bottleneck|limit/i,
    );
  });

  it("assigns a hoist from the strip", () => {
    const mountain = levels({ hoisting: 4, hoists: 2 });
    for (const [amount, count] of [
      ["one", 1],
      ["ten", 10],
    ] as const) {
      const { button, progress } = mount(twoLevels(mountain), amount);
      const dispatch = sent(progress);
      button('.mine-strip-cell[data-place="granite"] .mine-strip-more').click();
      expect(dispatch).toHaveBeenCalledWith({
        kind: "assignHoist",
        level: "granite",
        count,
      });
    }
  });

  it("writes the hoists' line when a tap moves nothing", () => {
    const mountain = levels({
      hoisting: 2,
      hoists: 1,
      assigned: { topsoil: 1 },
    });
    const { root, button, progress } = mount(twoLevels(mountain));
    const dispatch = sent(progress);
    const note = root.querySelector<HTMLElement>(".mine-note");
    const more = button(
      '.mine-strip-cell[data-place="granite"] .mine-strip-more',
    );
    expect(more.classList.contains("can")).toBe(false);
    more.click();
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toBe(HOIST_WAITS_LINE);
    button('.mine-strip-cell[data-place="granite"] .mine-strip-less').click();
    button('.mine-strip-cell[data-place="both"]').click();
    root
      .querySelector<HTMLElement>(
        '.mine-strip-cell[data-place="granite"] .mine-strip-name',
      )
      ?.click();
    expect(dispatch).not.toHaveBeenCalled();
    // A tap that moves a hoist takes the line down.
    button('.mine-strip-cell[data-place="topsoil"] .mine-strip-less').click();
    expect(note?.hidden).toBe(true);
    expect(dispatch).toHaveBeenCalledWith({
      kind: "unassignHoist",
      level: "topsoil",
      count: 1,
    });
  });

  it("asks which level when a drill's key is tapped, and buys for the chosen level", () => {
    // With the Granite open, drilling's next machine is the borer, paid in cut stone (#673).
    const mountain = levels({ topsoil: 2, stock: { cutStone: 1e6 } });
    const { root, button, progress } = mount(twoLevels(mountain));
    const dispatch = sent(progress);
    const card = root.querySelector<HTMLElement>(".machine-card");
    expect(card?.hidden).toBe(true);
    button('.mine-key[data-stage="face"]').click();
    expect(card?.hidden).toBe(false);
    const title = () => card?.querySelector(".machine-card-title")?.textContent;
    expect(title()).toBe(machineCardTitle("borer"));
    expect(title()).toBe("A borer for which level?");
    expect(card?.querySelector(".machine-card-machine")?.textContent).toBe(
      root.querySelector('.mine-key[data-stage="face"]')?.textContent,
    );
    const keys = [
      ...(card?.querySelectorAll<HTMLElement>(".machine-card-level") ?? []),
    ];
    expect(keys.map((key) => key.textContent)).toEqual(["Topsoil", "Granite"]);
    // Drawn alike: neither is the answer.
    expect(keys.map((key) => key.className)).toEqual([
      "machine-card-level can",
      "machine-card-level can",
    ]);
    expect(card?.textContent).toContain(
      "It stays on the level it is bought for.",
    );
    expect(card?.textContent).toContain("Topsoil: 0 borers");
    expect(card?.textContent).toContain("Granite: 0 borers");
    expect(button(".machine-card-not-now").textContent).toBe(NOT_NOW);
    expect(dispatch).not.toHaveBeenCalled();
    button('.machine-card-level[data-level="granite"]').click();
    expect(dispatch).toHaveBeenLastCalledWith(graniteBuyMove("borer", 1));
    expect(card?.hidden).toBe(true);
    button('.mine-key[data-stage="face"]').click();
    button('.machine-card-level[data-level="topsoil"]').click();
    expect(dispatch).toHaveBeenLastCalledWith(tierBuyMove("borer", 1));
    dispatch.mockClear();
    button('.mine-key[data-stage="haul"]').click();
    expect(title()).toBe("A train for which level?");
    button(".machine-card-not-now").click();
    expect(card?.hidden).toBe(true);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("buys nothing from a dark level key", () => {
    const { root, button, progress } = mount(twoLevels(levels({ topsoil: 2 })));
    const dispatch = sent(progress);
    button('.mine-key[data-stage="face"]').click();
    const granite = button('.machine-card-level[data-level="granite"]');
    expect(granite.classList.contains("can")).toBe(false);
    granite.click();
    expect(dispatch).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLElement>(".machine-card")?.hidden).toBe(
      false,
    );
  });

  it("buys hoisting's machine at once, with no card", () => {
    const mountain = levels({ stock: { stones: 1e9 } });
    const { root, button, progress } = mount(twoLevels(mountain));
    const dispatch = sent(progress);
    button('.mine-key[data-stage="lift"]').click();
    expect(root.querySelector<HTMLElement>(".machine-card")?.hidden).toBe(true);
    expect(dispatch).toHaveBeenCalledWith(tierBuyMove("hoist", 1));
  });

  it("sinks the shaft from the Granite's plate", () => {
    const stock = Object.fromEntries(
      shaftPrice().map(({ good, amount }) => [good, amount]),
    );
    const open = mount(twoLevels(levels({ sunk: false, stock })));
    const dispatch = sent(open.progress);
    const sink = open.button(".mine-sink");
    expect(open.text(".mine-granite-name")).toBe("Granite · not reached");
    expect(sink.hidden).toBe(false);
    expect(sink.classList.contains("can")).toBe(true);
    expect(sink.textContent).toMatch(/^Sink the shaft to the Granite/);
    sink.click();
    expect(dispatch).toHaveBeenCalledWith({ kind: "sinkShaft" });
    expect(open.root.querySelector(".mine-level-rows")).toBeNull();

    const waits = mount(twoLevels(levels({ sunk: false, operational: [] })));
    expect(waits.text(".mine-granite-line")).toBe(SHAFT_WAITS_LINE);
    expect(
      waits.root.querySelector<HTMLElement>(".mine-sink")?.hidden ?? true,
    ).toBe(true);
    expect(waits.text(".mine-deep")).toBe(DEEPER_STRATA);
  });
});
