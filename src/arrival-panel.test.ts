// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createArrivalPanel } from "./arrival-panel";
import { createBoardHost } from "./board-host";
import { LAYERS } from "./layers";
import { mineView } from "./mine-window";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { layerCardWords } from "./screen-words";
import { minedMountain } from "./test-fixtures";
import { RECIPE_IDS, type RecipeId } from "./workshop";

const plain = {
  mountain: minedMountain(12_000_000),
  away: undefined,
  crewJoined: undefined,
  engineerJoined: undefined,
  homecomings: [],
  layersArrived: [],
  craftsFitted: [],
  revealed: undefined,
} as unknown as ProgressSnapshot;

let time = 1000;

/** A finger's tap: pointerdown, then a click that counts its taps (detail 1). */
const fingerTap = (target: HTMLElement | null | undefined): void => {
  target?.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
  );
  target?.dispatchEvent(
    new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
  );
};

const mount = (first: ProgressSnapshot) => {
  time = 1000;
  let view = first;
  const progress = {
    dismissLayer: vi.fn(),
    dismissCraft: vi.fn(),
  };
  const panel = createArrivalPanel({
    progress: progress as unknown as ProgressStore,
    getView: () => view,
    board: createBoardHost({
      clock: () => time,
      pressAge: () => 0,
      reduced: () => false,
    }),
  });
  panel.render();
  return {
    panel,
    progress,
    show: (next: ProgressSnapshot) => {
      view = next;
      panel.render();
    },
  };
};

/** The board art each recipe's craft-done card shows, and its size. */
const ART: Readonly<Record<RecipeId, readonly [string, number]>> = {
  "iron-rails": ["mach-cart.png", 64],
  "diamond-bits": ["mach-drill.png", 64],
  "heartstone-core": ["mach-machine.png", 64],
  "heartstone-ember": ["mach-machine.png", 64],
  "engineers-kit": ["mach-worker.png", 64],
  "crystal-lamp": ["relic-lantern.png", 48],
  "crystal-flare": ["relic-lantern.png", 48],
  "sturdy-props": ["res-stone.png", 32],
  "blasting-charge": ["res-stone.png", 32],
  reinforce: ["res-stone.png", 32],
  "axle-grease": ["res-stone.png", 32],
};

describe("the arrival cards (#464)", () => {
  it("shows neither card with nothing to tell", () => {
    const { panel } = mount(plain);
    expect(panel.layer.hidden).toBe(true);
    expect(panel.notice.hidden).toBe(true);
  });

  it("shows the band's own window view at 2x, and its words", () => {
    const granite = LAYERS.find((layer) => layer.id === "granite");
    const { panel, progress } = mount({
      ...plain,
      layersArrived: granite === undefined ? [] : [granite],
    });
    expect(panel.layer.hidden).toBe(false);
    expect(panel.layer.dataset["card"]).toBe("layer");
    const art = panel.layer.querySelector<HTMLImageElement>(".board-card-art");
    expect(art?.getAttribute("src")).toBe(mineView("granite"));
    expect([art?.width, art?.height]).toEqual([184, 152]);
    const words = layerCardWords("granite");
    expect(panel.layer.querySelector("#layer-arrival-title")?.textContent).toBe(
      words?.arrival,
    );
    expect(panel.layer.querySelector(".layer-sketch")?.textContent).toBe(
      words?.sketch,
    );
    panel.layer.querySelector<HTMLButtonElement>(".layer-dig")?.click();
    expect(progress.dismissLayer).toHaveBeenCalledTimes(1);
  });

  it.each(RECIPE_IDS)("shows the board art for %s on craft done", (id) => {
    const { panel, progress } = mount({
      ...plain,
      craftsFitted: [{ id, level: 1, line: "Fitted." }],
    });
    expect(panel.notice.hidden).toBe(false);
    expect(panel.layer.hidden).toBe(true);
    const art = panel.notice.querySelector<HTMLImageElement>(".board-card-art");
    const [file, px] = ART[id];
    expect(art?.getAttribute("src")).toContain(file);
    expect([art?.width, art?.height]).toEqual([px, px]);
    expect(panel.notice.querySelector("#craft-notice-line")?.textContent).toBe(
      "Fitted.",
    );
    panel.notice.querySelector<HTMLButtonElement>(".craft-accept")?.click();
    expect(progress.dismissCraft).toHaveBeenCalledTimes(1);
  });

  it("moves from one craft to the next without painting what stayed", () => {
    const { panel, show } = mount({
      ...plain,
      craftsFitted: [{ id: "iron-rails", level: 1, line: "Rails." }],
    });
    const art = panel.notice.querySelector<HTMLImageElement>(".board-card-art");
    show({
      ...plain,
      craftsFitted: [{ id: "diamond-bits", level: 1, line: "Bits." }],
    });
    expect(art?.getAttribute("src")).toContain("mach-drill.png");
    expect(art?.width).toBe(64);
    show({
      ...plain,
      craftsFitted: [{ id: "diamond-bits", level: 1, line: "Bits." }],
    });
    expect(art?.getAttribute("src")).toContain("mach-drill.png");
    show(plain);
    expect(panel.notice.hidden).toBe(true);
  });

  it("keeps the band's view through a repaint", () => {
    const granite = LAYERS.filter((layer) => layer.id === "granite");
    const { panel, show } = mount({ ...plain, layersArrived: granite });
    show({ ...plain, layersArrived: granite });
    expect(
      panel.layer.querySelector(".board-card-art")?.getAttribute("src"),
    ).toBe(mineView("granite"));
  });

  it("settles again when the next craft takes the card: a double tap never dismisses it unseen", () => {
    const rails = { id: "iron-rails", level: 1, line: "Rails." } as const;
    const bits = { id: "diamond-bits", level: 1, line: "Bits." } as const;
    const { panel, progress, show } = mount({
      ...plain,
      craftsFitted: [rails, bits],
    });
    const accept = panel.notice.querySelector<HTMLElement>(".craft-accept");
    time += 1000;
    fingerTap(accept);
    expect(progress.dismissCraft).toHaveBeenCalledTimes(1);
    show({ ...plain, craftsFitted: [bits] });
    time += 100;
    fingerTap(accept);
    expect(progress.dismissCraft).toHaveBeenCalledTimes(1);
    time += 350;
    fingerTap(accept);
    expect(progress.dismissCraft).toHaveBeenCalledTimes(2);
  });

  it("settles again when the next band takes the card", () => {
    const bands = LAYERS.slice(1, 3);
    const { panel, progress, show } = mount({
      ...plain,
      layersArrived: bands,
    });
    expect(panel.layer.hidden).toBe(false);
    const dig = panel.layer.querySelector<HTMLElement>(".layer-dig");
    time += 1000;
    fingerTap(dig);
    expect(progress.dismissLayer).toHaveBeenCalledTimes(1);
    show({ ...plain, layersArrived: bands.slice(1) });
    time += 100;
    fingerTap(dig);
    expect(progress.dismissLayer).toHaveBeenCalledTimes(1);
    time += 350;
    fingerTap(dig);
    expect(progress.dismissLayer).toHaveBeenCalledTimes(2);
  });

  it("does not settle again on a repaint of the same card", () => {
    const rails = { id: "iron-rails", level: 1, line: "Rails." } as const;
    const { panel, progress, show } = mount({
      ...plain,
      craftsFitted: [rails],
    });
    time += 1000;
    show({ ...plain, craftsFitted: [rails] });
    fingerTap(panel.notice.querySelector<HTMLElement>(".craft-accept"));
    expect(progress.dismissCraft).toHaveBeenCalledTimes(1);
  });
});
