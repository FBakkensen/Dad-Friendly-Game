import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import {
  CRAFT_DONE_BUTTON,
  LAYER_DIG,
  layerCardWords,
  type LayerCardWords,
} from "./screen-words";
import type { RecipeId } from "./workshop";

/**
 * The layer card and the craft-done notice. Both sit over the mountain.
 * A welcome card or a relic reveal goes first; these wait, then one at a time.
 */

export function createArrivalPanel({
  progress,
  getView,
  mountainUrl,
  oreUrl,
  lanternUrl,
  tierArt,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  mountainUrl: string;
  oreUrl: string;
  lanternUrl: string;
  tierArt: {
    readonly helper: string;
    readonly cart: string;
    readonly drill: string;
    readonly machine: string;
  };
}) {
  const layer = document.createElement("div");
  layer.className = "layer-arrival";
  layer.setAttribute("role", "dialog");
  layer.setAttribute("aria-modal", "true");
  layer.setAttribute("aria-labelledby", "layer-arrival-title");
  layer.hidden = true;
  const layerCard = document.createElement("div");
  layerCard.className = "layer-card";
  const layerArt = document.createElement("img");
  layerArt.className = "layer-art";
  layerArt.src = mountainUrl;
  layerArt.alt = "";
  layerArt.width = 112;
  layerArt.height = 112;
  layerArt.draggable = false;
  const layerTitle = document.createElement("h2");
  layerTitle.id = "layer-arrival-title";
  const layerEvocative = document.createElement("p");
  layerEvocative.className = "layer-evocative";
  const layerAdvice = document.createElement("p");
  layerAdvice.className = "layer-advice";
  const layerSketch = document.createElement("p");
  layerSketch.className = "layer-sketch";
  const layerGo = document.createElement("button");
  layerGo.type = "button";
  layerGo.className = "layer-dig";
  layerGo.textContent = LAYER_DIG;
  layerGo.addEventListener("click", () => {
    progress.dismissLayer();
  });
  layerCard.append(
    layerArt,
    layerTitle,
    layerEvocative,
    layerAdvice,
    layerSketch,
    layerGo,
  );
  layer.append(layerCard);

  const notice = document.createElement("div");
  notice.className = "craft-notice";
  notice.setAttribute("role", "dialog");
  notice.setAttribute("aria-modal", "true");
  notice.setAttribute("aria-labelledby", "craft-notice-line");
  notice.hidden = true;
  const noticeCard = document.createElement("div");
  noticeCard.className = "notice-card";
  const noticeArt = document.createElement("img");
  noticeArt.className = "notice-art";
  noticeArt.alt = "";
  noticeArt.width = 64;
  noticeArt.height = 64;
  noticeArt.draggable = false;
  const noticeLine = document.createElement("p");
  noticeLine.id = "craft-notice-line";
  const noticeGo = document.createElement("button");
  noticeGo.type = "button";
  noticeGo.className = "craft-accept";
  noticeGo.textContent = CRAFT_DONE_BUTTON;
  noticeGo.addEventListener("click", () => {
    progress.dismissCraft();
  });
  noticeCard.append(noticeArt, noticeLine, noticeGo);
  notice.append(noticeCard);

  let layerWasOpen = false;
  let noticeWasOpen = false;

  const render = (): void => {
    const view = getView();
    const waiting =
      view.away !== undefined ||
      view.crewJoined !== undefined ||
      view.engineerJoined === true ||
      view.homecomings.length > 0 ||
      view.revealed !== undefined;
    const arrived = view.layersArrived[0];
    const words =
      arrived === undefined ? undefined : layerCardWords(arrived.id);
    const showLayer = !waiting && words !== undefined;
    paintLayer(words);
    layer.hidden = !showLayer;
    if (showLayer && !layerWasOpen) {
      layerGo.focus();
    }
    layerWasOpen = showLayer;

    const fitted = view.craftsFitted[0];
    const showNotice = !waiting && !showLayer && fitted !== undefined;
    if (fitted !== undefined) {
      noticeArt.src = noticeArtFor(fitted.id, { oreUrl, lanternUrl, tierArt });
      noticeLine.textContent = fitted.line;
    }
    notice.hidden = !showNotice;
    if (showNotice && !noticeWasOpen) {
      noticeGo.focus();
    }
    noticeWasOpen = showNotice;
  };

  const paintLayer = (words: LayerCardWords | undefined): void => {
    if (words === undefined) {
      return;
    }
    layerTitle.textContent = words.arrival;
    layerEvocative.textContent = words.evocative;
    layerAdvice.textContent = words.advice;
    layerSketch.textContent = words.sketch;
  };

  return { layer, notice, render };
}

function noticeArtFor(
  id: RecipeId,
  art: {
    readonly oreUrl: string;
    readonly lanternUrl: string;
    readonly tierArt: {
      readonly helper: string;
      readonly cart: string;
      readonly drill: string;
      readonly machine: string;
    };
  },
): string {
  switch (id) {
    case "iron-rails":
      return art.tierArt.cart;
    case "diamond-bits":
      return art.tierArt.drill;
    case "heartstone-core":
    case "heartstone-ember":
      return art.tierArt.machine;
    case "crystal-lamp":
    case "crystal-flare":
      return art.lanternUrl;
    case "engineers-kit":
      return art.tierArt.helper;
    case "sturdy-props":
    case "blasting-charge":
    case "reinforce":
    case "axle-grease":
      return art.oreUrl;
    default: {
      const never: never = id;
      return never;
    }
  }
}
