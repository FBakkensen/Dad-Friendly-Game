// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createUnconfiguredAuth } from "./auth";
import { holdFactors } from "./economy/factors";
import { mountFrameScreen } from "./frame-screen";
import { makerPrice } from "./makers";
import type { Mountain } from "./mountain";
import { PART_THREE_OFF, PART_TWO_OFF } from "./part-switch";
import { levels } from "./part-three.harness";
import { priceIcon } from "./price-icons";
import { createProgressStore } from "./progress-store";
import { createMemoryStorage } from "./test-fixtures";

/** The refinery on slice 1's frame with the Granite's saws, on the DOM (#754). */

let unmount = new AbortController();

beforeEach(() => {
  holdFactors({ [PART_TWO_OFF]: 0, [PART_THREE_OFF]: 0 });
});

afterEach(() => {
  unmount.abort();
  unmount = new AbortController();
  holdFactors({});
});

/** The frame on `mountain`, opened on the refinery. */
function mount(mountain: Mountain) {
  const root = document.createElement("div");
  document.body.replaceChildren(root);
  const auth = createUnconfiguredAuth();
  const progress = createProgressStore({
    auth,
    sessionStorage: createMemoryStorage(),
    cloudWriteGapMs: 0,
  });
  progress.applyMutation(() => mountain);
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
  button('.frame-site[data-site="refinery"]').click();
  return { root, progress, button };
}

/** The Granite sunk, a kiln and a saw each with its worker, one worker free, and the brick for a saw. */
function sunk(): Mountain {
  const base = levels({ kilns: 1, saws: 1, topsoil: 2, granite: 2 });
  return {
    ...base,
    owned: { ...base.owned, helper: base.owned.helper + 1 },
    stock: {
      ...base.stock,
      brick: makerPrice(base, "saw")[0]?.amount ?? 0,
    },
  };
}

const plateNames = (root: HTMLElement): string[] =>
  [...root.querySelectorAll(".refinery-plate .mine-stage-name")].map(
    (name) => name.textContent,
  );

describe("the refinery with the saws", () => {
  it("paints a plate for each maker, and the saws' + places a worker", () => {
    const { root, progress, button } = mount(sunk());
    expect(root.querySelectorAll(".refinery-plate")).toHaveLength(2);
    expect(plateNames(root)).toEqual(["Kilns", "Saws"]);
    const saw = button(".refinery-saw-key");
    expect(saw.querySelector("img")?.getAttribute("src")).toBe(
      priceIcon("brick"),
    );
    expect(saw.classList.contains("can")).toBe(true);
    expect(saw.getAttribute("aria-label")).toMatch(/ brick\. /);
    button('.refinery .frame-step[data-job="saws"][data-way="place"]').click();
    expect(progress.getSnapshot().mountain.jobs.saws).toBe(2);
    expect(progress.getSnapshot().mountain.jobs.kilns).toBe(1);
  });

  it("buys a saw from the saws' key", () => {
    const { progress, button } = mount(sunk());
    button(".refinery-saw-key").click();
    expect(progress.getSnapshot().mountain.makers.saw).toBe(2);
    expect(progress.getSnapshot().mountain.makers.kiln).toBe(1);
  });

  it("sets the two plates side by side, and one plate as today", () => {
    const two = mount(sunk());
    expect(two.root.querySelector(".refinery")?.classList.contains("two")).toBe(
      true,
    );
    unmount.abort();
    unmount = new AbortController();
    holdFactors({ [PART_TWO_OFF]: 0 });
    const one = mount(sunk());
    expect(one.root.querySelectorAll(".refinery-plate")).toHaveLength(1);
    expect(plateNames(one.root)).toEqual(["Kilns"]);
    expect(one.root.querySelector(".refinery")?.classList.contains("two")).toBe(
      false,
    );
    expect(
      one.root.querySelector<HTMLElement>(".refinery-in-granite")?.hidden,
    ).toBe(true);
  });

  it("names the Granite's rock over its hopper", () => {
    const { root } = mount(sunk());
    const granite = root.querySelector<HTMLElement>(".refinery-in-granite");
    expect(granite?.hidden).toBe(false);
    expect(granite?.querySelector("b")?.textContent).toBe("Granite");
  });

  it("builds the saws' plate when the Granite opens under it", () => {
    const { root, progress } = mount(levels({ kilns: 1, sunk: false }));
    expect(plateNames(root)).toEqual(["Kilns"]);
    progress.applyMutation(() => levels({ kilns: 1 }));
    expect(plateNames(root)).toEqual(["Kilns", "Saws"]);
  });

  it("acts once on a tap after the plates are built again", () => {
    /** One kiln with its worker, two workers free, and the stone for many kilns. */
    const kilns = (sunk: boolean): Mountain => {
      const base = levels({ kilns: 1, sunk, stock: { stones: 1e9 } });
      return {
        ...base,
        owned: { ...base.owned, helper: base.owned.helper + 2 },
      };
    };
    const { progress, button } = mount(kilns(false));
    progress.applyMutation(() => kilns(true));
    const mountain = () => progress.getSnapshot().mountain;
    button(".refinery-kiln-key").click();
    expect(mountain().makers.kiln).toBe(2);
    button('.refinery .frame-step[data-job="kilns"][data-way="place"]').click();
    expect(mountain().jobs.kilns).toBe(2);
  });

  it("shows the cut stone stockpile in the top row and its bay in the stockyard", () => {
    const shown = (root: HTMLElement, selector: string): string[] =>
      [...root.querySelectorAll<HTMLElement>(selector)]
        .filter((each) => each.closest("[hidden]") === null)
        .map((each) => each.textContent);
    const goods = (root: HTMLElement): string[] =>
      [...root.querySelectorAll<HTMLElement>(".frame-top .frame-pile")]
        .filter((each) => !each.hidden)
        .map((each) => each.dataset["good"] ?? "");
    const open = mount(sunk());
    expect(goods(open.root)).toEqual(["stones", "brick", "cutStone"]);
    const cut = open.root.querySelector('.frame-pile[data-good="cutStone"]');
    expect(cut?.querySelector("img")?.getAttribute("src")).toBe(
      priceIcon("cutStone"),
    );
    expect(cut?.querySelector(".frame-pile-room")?.textContent).toBe("of 250K");
    const bays = shown(open.root, ".refinery-bay");
    expect(bays).toHaveLength(3);
    expect(bays[0]).toMatch(/^Brick .+ of 1M$/);
    expect(bays[1]).toBe("Stone 0 of 6M");
    expect(bays[2]).toBe("Cut stone 0 of 250K");
    unmount.abort();
    unmount = new AbortController();
    // The shaft not yet sunk: stone and brick, as today.
    const shut = mount(levels({ kilns: 1, sunk: false }));
    expect(goods(shut.root)).toEqual(["stones", "brick"]);
    expect(shown(shut.root, ".refinery-bay")).toHaveLength(2);
  });
});
