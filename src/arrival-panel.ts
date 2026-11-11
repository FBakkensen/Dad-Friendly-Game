import cartUrl from "./assets/board/mach-cart.png";
import drillUrl from "./assets/board/mach-drill.png";
import machineUrl from "./assets/board/mach-machine.png";
import workerUrl from "./assets/board/mach-worker.png";
import lanternUrl from "./assets/board/relic-lantern.png";
import stoneUrl from "./assets/board/res-stone.png";
import { cardArt, cardLine, createBoardCard } from "./board-card";
import { write } from "./board-dom";
import type { BoardHost } from "./board-host";
import { arrivalCard, type ArrivalCard } from "./card-views";
import { mineView } from "./mine-window";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { CRAFT_DONE_BUTTON, LAYER_DIG } from "./screen-words";
import type { RecipeId } from "./workshop";

/**
 * The layer card and the craft-done card (#464), on the board card shell. Both wait behind the
 * welcome card and a relic reveal, then show one at a time: `card-views#arrivalCard` picks.
 */

/** Craft done's picture: the board's machine, lantern or stone icon for what was fitted. */
function craftArt(id: RecipeId): {
  readonly src: string;
  readonly px: 32 | 48 | 64;
} {
  switch (id) {
    case "iron-rails":
      return { src: cartUrl, px: 64 };
    case "diamond-bits":
      return { src: drillUrl, px: 64 };
    case "heartstone-core":
    case "heartstone-ember":
      return { src: machineUrl, px: 64 };
    case "engineers-kit":
      return { src: workerUrl, px: 64 };
    case "crystal-lamp":
    case "crystal-flare":
      return { src: lanternUrl, px: 48 };
    case "sturdy-props":
    case "blasting-charge":
    case "reinforce":
    case "axle-grease":
      return { src: stoneUrl, px: 32 };
  }
}

/** An image's source and size, written only when they change. */
function paintArt(art: HTMLImageElement, src: string, px: number): void {
  if (art.getAttribute("src") !== src) {
    art.src = src;
  }
  if (art.width !== px) {
    art.width = px;
    art.height = px;
  }
}

/** What a card tells, as one key: its kind, then the band or the recipe and its line. */
function arrivalKey(shown: ArrivalCard | undefined): string | undefined {
  if (shown === undefined) {
    return undefined;
  }
  return shown.kind === "layer"
    ? `layer ${shown.band}`
    : `craft ${shown.recipe} ${shown.line}`;
}

export function createArrivalPanel({
  progress,
  getView,
  board,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  board: BoardHost;
}) {
  const layer = createBoardCard({
    name: "layer",
    hook: "layer-arrival",
    titleId: "layer-arrival-title",
    board,
  });
  // The new band's own window view, at 2x (92 x 76 art).
  const layerArt = cardArt(184, 152);
  const evocative = cardLine("layer-evocative");
  const advice = cardLine("layer-advice");
  const sketch = cardLine("layer-sketch is-quiet");
  layer.body.append(layerArt, evocative, advice, sketch);
  const dig = layer.plate(LAYER_DIG, "dig", "layer-dig", () => {
    progress.dismissLayer();
  });

  // Its fitted line is its heading, as today's dialog is labelled by it.
  const craft = createBoardCard({
    name: "craft",
    hook: "craft-notice",
    titleId: "craft-notice-line",
    board,
  });
  const craftPicture = cardArt(64);
  craft.body.append(craftPicture);
  const accept = craft.plate(
    CRAFT_DONE_BUTTON,
    "accept",
    "craft-accept",
    () => {
      progress.dismissCraft();
    },
  );

  const paint = (shown: ArrivalCard): void => {
    if (shown.kind === "layer") {
      const { words } = shown;
      if (layerArt.getAttribute("src") !== mineView(shown.band)) {
        layerArt.src = mineView(shown.band);
      }
      write(layer.title, words.arrival);
      write(evocative, words.evocative);
      write(advice, words.advice);
      write(sketch, words.sketch);
      return;
    }
    const art = craftArt(shown.recipe);
    paintArt(craftPicture, art.src, art.px);
    write(craft.title, shown.line);
  };

  // The card on show, by what it tells: the next band or craft on a card that is already up
  // is a new page, so it settles under the finger again.
  let shownKey: string | undefined;
  const render = (): void => {
    const shown = arrivalCard(getView());
    if (shown !== undefined) {
      paint(shown);
    }
    const key = arrivalKey(shown);
    if (shownKey !== undefined && key !== shownKey) {
      if (shown?.kind === "layer" && shownKey.startsWith("layer ")) {
        layer.page();
      } else if (shown?.kind === "craft" && shownKey.startsWith("craft ")) {
        craft.page();
      }
    }
    shownKey = key;
    layer.show(shown?.kind === "layer", dig);
    craft.show(shown?.kind === "craft", accept);
  };

  return { layer: layer.root, notice: craft.root, render };
}
