import brickUrl from "./assets/board/res-brick.png";
import stoneUrl from "./assets/board/res-stone.png";
import { el, hide, mark, setAttr, write } from "./board-dom";
import type { FrameState } from "./frame-state";
import { listenSteps, paintSteps, stepper } from "./job-steps";
import type { Mountain } from "./mountain";
import {
  drawRefinery,
  drawYard,
  loadRefinerySprites,
  paintWall,
  paintYardGround,
} from "./refinery-scene";
import {
  BYPASS_RECIPE,
  nightForecast,
  refineryView,
  type KilnPlate,
  type RefineryView,
  type StockyardView,
} from "./refinery-view";
import { runScene } from "./scene-paint";
import type { BuyAmount } from "./tiers";
import { NO_FREE_WORKER } from "./workforce-view";
import "./refinery.css";

/**
 * The refinery on slice 1's frame (#671; spec, The refinery): the flow on
 * its canvas with the Topsoil's rock and the bypass named over it, the
 * kilns' plate with its workers between − and + and the key for one more,
 * and the stockyard at the foot with its bays and "Expand the stockyard".
 * It paints the pure view (refinery-view) and changes the game only through
 * `progress.dispatch`. There is no hire key here: hiring is in the frame.
 */

export type RefinerySite = {
  readonly root: HTMLElement;
  readonly paint: (mountain: Mountain, shown: boolean, now?: number) => void;
};

function icon(url: string, className: string): HTMLImageElement {
  const img = el("img", className);
  img.src = url;
  img.alt = "";
  img.draggable = false;
  return img;
}

type PlateParts = {
  readonly root: HTMLElement;
  readonly recipe: HTMLElement;
  readonly now: HTMLElement;
  readonly can: HTMLElement;
  readonly machines: HTMLElement;
  readonly idle: HTMLElement;
  readonly pile: HTMLElement;
  readonly count: HTMLElement;
  readonly unit: HTMLElement;
  readonly minus: HTMLButtonElement;
  readonly plus: HTMLButtonElement;
  readonly key: HTMLButtonElement;
  readonly keyFace: HTMLElement;
  readonly keyPrice: HTMLElement;
  readonly keyStaff: HTMLElement;
};

function buildKey(state: FrameState): {
  readonly root: HTMLButtonElement;
  readonly face: HTMLElement;
  readonly price: HTMLElement;
  readonly staff: HTMLElement;
} {
  const root = el("button", "mine-key refinery-kiln-key");
  root.type = "button";
  const face = el("span", "mine-key-face");
  const price = el("span", "board-num");
  const staff = el("span", "mine-key-staff");
  const small = el("span", "mine-key-small");
  small.append(price, icon(stoneUrl, "mine-key-icon"), staff);
  root.append(face, small);
  root.addEventListener("click", () => {
    if (refineryView(state.mountain()).plate.key.can) {
      void state.progress.dispatch({ kind: "buyMaker", id: "kiln" });
    }
  });
  return { root, face, price, staff };
}

function buildPlate(state: FrameState): PlateParts {
  const root = el("div", "refinery-plate");
  const recipe = el("p", "refinery-recipe");
  const row = el("div", "refinery-row");
  const info = el("div", "refinery-info");
  const head = el("span", "mine-stage-head");
  const now = el("b", "board-num");
  const can = el("i", "board-num");
  const rate = el("span", "mine-stage-rate");
  rate.append(now, " of ", can, " brick/s");
  head.append(el("span", "mine-stage-name", "Kilns"), rate);
  const runs = el("span", "refinery-machines");
  const machines = el("span", "");
  const idle = el("span", "refinery-idle");
  runs.append(machines, idle);
  const pile = el("span", "mine-stage-pile");
  info.append(head, runs, pile);
  const minus = stepper("−", "kilns", "free");
  const plus = stepper("+", "kilns", "place");
  const count = el("b", "board-num");
  const unit = el("small", "");
  const workers = el("span", "mine-stage-count");
  workers.append(count, unit);
  row.append(info, minus, workers, plus);
  const key = buildKey(state);
  root.append(recipe, row, key.root);
  return {
    root,
    recipe,
    now,
    can,
    machines,
    idle,
    pile,
    count,
    unit,
    minus,
    plus,
    key: key.root,
    keyFace: key.face,
    keyPrice: key.price,
    keyStaff: key.staff,
  };
}

function paintPlate(
  parts: PlateParts,
  plate: KilnPlate,
  amount: BuyAmount,
): void {
  write(parts.recipe, plate.recipe);
  write(parts.now, plate.now);
  write(parts.can, plate.can);
  write(parts.machines, plate.machines);
  hide(parts.idle, plate.idle === undefined);
  write(parts.idle, plate.idle === undefined ? "" : ` ${plate.idle}`);
  hide(parts.pile, plate.pile === undefined);
  write(parts.pile, plate.pile ?? "");
  write(parts.count, String(plate.workers));
  write(parts.unit, plate.workers === 1 ? "worker" : "workers");
  paintSteps(parts, plate, amount);
  write(parts.keyFace, plate.key.face);
  write(parts.keyPrice, plate.key.price);
  write(parts.keyStaff, ` · ${plate.key.staff}`);
  mark(parts.key, "can", plate.key.can);
  setAttr(parts.key, "aria-label", plate.key.label);
}

type YardParts = {
  readonly root: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly bays: readonly HTMLElement[];
  readonly expand: HTMLButtonElement;
  readonly gives: HTMLElement;
  readonly price: HTMLElement;
};

function buildYard(state: FrameState): YardParts {
  const root = el("div", "refinery-yard");
  root.setAttribute("aria-label", "The stockyard");
  const canvas = el("canvas", "refinery-yard-canvas");
  canvas.setAttribute("aria-hidden", "true");
  const labels = el("div", "refinery-bays");
  const bays = [el("span", "refinery-bay"), el("span", "refinery-bay")];
  labels.append(...bays);
  const expand = el("button", "refinery-expand");
  expand.type = "button";
  const words = el("span", "refinery-expand-words");
  const gives = el("small", "");
  words.append(el("b", "", "Expand the stockyard"), gives);
  const cost = el("span", "refinery-expand-price");
  const price = el("span", "board-num");
  cost.append(price, icon(brickUrl, "mine-key-icon"));
  expand.append(words, cost);
  expand.addEventListener("click", () => {
    if (refineryView(state.mountain()).stockyard.expand?.can === true) {
      void state.progress.dispatch({ kind: "expandStockyard" });
    }
  });
  root.append(canvas, labels, expand);
  return { root, canvas, bays, expand, gives, price };
}

function paintYard(
  parts: YardParts,
  yard: StockyardView,
  forecast: string,
): void {
  for (const [index, label] of parts.bays.entries()) {
    const bay = yard.bays[index];
    hide(label, bay === undefined);
    write(label, bay?.text ?? "");
    mark(label, "full", bay?.full === true);
    setAttr(label, "data-good", bay?.good);
  }
  const expand = yard.expand;
  hide(parts.expand, expand === undefined);
  if (expand !== undefined) {
    write(parts.gives, `${forecast} ${expand.gives}`);
    write(parts.price, expand.price);
    mark(parts.expand, "can", expand.can);
    setAttr(
      parts.expand,
      "aria-label",
      `Expand the stockyard for ${expand.price} brick. ${forecast} ${expand.gives}`,
    );
  }
}

/** The overlay over the canvas: the Topsoil's rock coming up, and the bypass. */
function buildOverlay(): {
  readonly root: HTMLElement;
  readonly rate: HTMLElement;
  readonly bypass: HTMLElement;
} {
  const root = el("div", "refinery-over");
  const hopper = el("p", "refinery-in");
  const rate = el("span", "board-num");
  hopper.append(el("b", "", "Topsoil"), " ", rate);
  const chute = el("p", "refinery-bypass");
  const bypass = el("span", "board-num");
  chute.append(
    el("span", "", "bypass to stone"),
    bypass,
    el("span", "", BYPASS_RECIPE),
  );
  root.append(hopper, chute);
  return { root, rate, bypass };
}

/** How often the night forecast is played again: it is a whole night on a copy. */
const FORECAST_MS = 1000;

export function createRefinerySite(
  state: FrameState,
  signal?: AbortSignal,
): RefinerySite {
  const root = el("section", "refinery");
  root.setAttribute("aria-label", "The refinery");
  const canvas = el("canvas", "refinery-canvas");
  canvas.setAttribute("aria-hidden", "true");
  const over = buildOverlay();
  const panel = el("div", "refinery-panel");
  const note = el("p", "mine-note", NO_FREE_WORKER);
  note.hidden = true;
  const plate = buildPlate(state);
  const yard = buildYard(state);
  panel.append(note, plate.root, yard.root);
  listenSteps(plate.root, state, note);
  root.append(canvas, over.root, panel);
  let view: RefineryView = refineryView(state.mountain());
  let visible = false;
  let forecast = { at: -Infinity, words: "" };
  const sprites = loadRefinerySprites();
  runScene(
    canvas,
    {
      shown: () => visible,
      ground: paintWall,
      draw: (c, clock) => {
        drawRefinery(c, sprites, view.scene, clock);
      },
    },
    signal,
  );
  runScene(
    yard.canvas,
    {
      shown: () => visible,
      ground: paintYardGround,
      draw: (c) => {
        drawYard(c, sprites, view.scene.bays);
      },
    },
    signal,
  );
  return {
    root,
    paint: (mountain, shown, now) => {
      visible = shown;
      hide(root, !shown);
      if (!shown) {
        hide(note, true);
        return;
      }
      view = refineryView(mountain, now);
      const clock = now ?? Date.now();
      if (clock - forecast.at >= FORECAST_MS || clock < forecast.at) {
        forecast = { at: clock, words: nightForecast(mountain, clock) };
      }
      write(over.rate, view.hopper.rate);
      write(over.bypass, view.bypass.rate);
      if (view.plate.canPlace) {
        hide(note, true);
      }
      paintPlate(plate, view.plate, state.amount());
      paintYard(yard, view.stockyard, forecast.words);
    },
  };
}
