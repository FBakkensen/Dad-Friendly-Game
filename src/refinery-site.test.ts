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
    expect(
      two.root.querySelector(".refinery-plates")?.classList.contains("two"),
    ).toBe(true);
    unmount.abort();
    unmount = new AbortController();
    holdFactors({ [PART_TWO_OFF]: 0 });
    const one = mount(sunk());
    expect(one.root.querySelectorAll(".refinery-plate")).toHaveLength(1);
    expect(plateNames(one.root)).toEqual(["Kilns"]);
    expect(
      one.root.querySelector(".refinery-plates")?.classList.contains("two"),
    ).toBe(false);
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
});
