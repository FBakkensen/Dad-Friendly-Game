// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createArrivalPanel } from "./arrival-panel";
import { createBoardHost } from "./board-host";
import { craftLine } from "./card-views";
import { LAYERS, type Layer } from "./layers";
import { mineView } from "./mine-window";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { layerCardWords } from "./screen-words";
import type { CraftNotice, DismissTarget, Notice } from "./session";
import { minedMountain } from "./test-fixtures";
import { RECIPE_IDS, type RecipeId } from "./workshop";

const plain = {
  mountain: minedMountain(12_000_000),
  homecomings: [],
  notices: [],
} as unknown as ProgressSnapshot;

/** How many times the panel dismissed this kind. */
const dismissed = (
  dismiss: { mock: { calls: readonly (readonly [DismissTarget])[] } },
  what: DismissTarget,
): number => dismiss.mock.calls.filter(([kind]) => kind === what).length;

const layers = (list: readonly Layer[]): Notice[] =>
  list.map((layer) => ({ kind: "layer", layer }));
const crafts = (list: readonly CraftNotice[]): Notice[] =>
  list.map((craft) => ({ kind: "craft", craft }));

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
    dismiss: vi.fn<(what: DismissTarget) => void>(),
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
      notices: layers(granite === undefined ? [] : [granite]),
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
    expect(dismissed(progress.dismiss, "layer")).toBe(1);
  });

  it.each(RECIPE_IDS)("shows the board art for %s on craft done", (id) => {
    const { panel, progress } = mount({
      ...plain,
      notices: crafts([{ id, level: 1, mountain: minedMountain(0), at: 0 }]),
    });
    expect(panel.notice.hidden).toBe(false);
    expect(panel.layer.hidden).toBe(true);
    const art = panel.notice.querySelector<HTMLImageElement>(".board-card-art");
    const [file, px] = ART[id];
    expect(art?.getAttribute("src")).toContain(file);
    expect([art?.width, art?.height]).toEqual([px, px]);
    expect(panel.notice.querySelector("#craft-notice-line")?.textContent).toBe(
      craftLine({ id, level: 1, mountain: minedMountain(0), at: 0 }),
    );
    panel.notice.querySelector<HTMLButtonElement>(".craft-accept")?.click();
    expect(dismissed(progress.dismiss, "craft")).toBe(1);
  });

  it("moves from one craft to the next without painting what stayed", () => {
    const { panel, show } = mount({
      ...plain,
      notices: crafts([
        { id: "iron-rails", level: 1, mountain: minedMountain(0), at: 0 },
      ]),
    });
    const art = panel.notice.querySelector<HTMLImageElement>(".board-card-art");
    show({
      ...plain,
      notices: crafts([
        { id: "diamond-bits", level: 1, mountain: minedMountain(0), at: 0 },
      ]),
    });
    expect(art?.getAttribute("src")).toContain("mach-drill.png");
    expect(art?.width).toBe(64);
    show({
      ...plain,
      notices: crafts([
        { id: "diamond-bits", level: 1, mountain: minedMountain(0), at: 0 },
      ]),
    });
    expect(art?.getAttribute("src")).toContain("mach-drill.png");
    show(plain);
    expect(panel.notice.hidden).toBe(true);
  });

  it("keeps the band's view through a repaint", () => {
    const granite = LAYERS.filter((layer) => layer.id === "granite");
    const { panel, show } = mount({ ...plain, notices: layers(granite) });
    show({ ...plain, notices: layers(granite) });
    expect(
      panel.layer.querySelector(".board-card-art")?.getAttribute("src"),
    ).toBe(mineView("granite"));
  });

  it("settles again when the next craft takes the card: a double tap never dismisses it unseen", () => {
    const rails = {
      id: "iron-rails",
      level: 1,
      mountain: minedMountain(0),
      at: 0,
    } as const;
    const bits = {
      id: "diamond-bits",
      level: 1,
      mountain: minedMountain(0),
      at: 0,
    } as const;
    const { panel, progress, show } = mount({
      ...plain,
      notices: crafts([rails, bits]),
    });
    const accept = panel.notice.querySelector<HTMLElement>(".craft-accept");
    time += 1000;
    fingerTap(accept);
    expect(dismissed(progress.dismiss, "craft")).toBe(1);
    show({ ...plain, notices: crafts([bits]) });
    time += 100;
    fingerTap(accept);
    expect(dismissed(progress.dismiss, "craft")).toBe(1);
    time += 350;
    fingerTap(accept);
    expect(dismissed(progress.dismiss, "craft")).toBe(2);
  });

  it("settles again when the next band takes the card", () => {
    const bands = LAYERS.slice(1, 3);
    const { panel, progress, show } = mount({
      ...plain,
      notices: layers(bands),
    });
    expect(panel.layer.hidden).toBe(false);
    const dig = panel.layer.querySelector<HTMLElement>(".layer-dig");
    time += 1000;
    fingerTap(dig);
    expect(dismissed(progress.dismiss, "layer")).toBe(1);
    show({ ...plain, notices: layers(bands.slice(1)) });
    time += 100;
    fingerTap(dig);
    expect(dismissed(progress.dismiss, "layer")).toBe(1);
    time += 350;
    fingerTap(dig);
    expect(dismissed(progress.dismiss, "layer")).toBe(2);
  });

  it("does not settle again on a repaint of the same card", () => {
    const rails = {
      id: "iron-rails",
      level: 1,
      mountain: minedMountain(0),
      at: 0,
    } as const;
    const { panel, progress, show } = mount({
      ...plain,
      notices: crafts([rails]),
    });
    time += 1000;
    show({ ...plain, notices: crafts([rails]) });
    fingerTap(panel.notice.querySelector<HTMLElement>(".craft-accept"));
    expect(dismissed(progress.dismiss, "craft")).toBe(1);
  });
});
