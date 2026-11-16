import brickUrl from "./assets/board/res-brick.png";
import { el, hide, icon, mark, setAttr, write } from "./board-dom";
import type { FrameState } from "./frame-state";
import { listenSteps, paintSteps, stepper } from "./job-steps";
import type { MakerId } from "./makers";
import type { MineLevelId } from "./mine-levels";
import type { LevelHopper } from "./mine-view";
import { buildKeyFace, paintMachineKey, type KeyParts } from "./mine-site";
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
  type MakerPlate,
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
 *
 * Part 3 (#754): with the saws open their plate sits beside the kilns', and
 * the Granite's rock is named over its own hopper on the right.
 */

export type RefinerySite = {
  readonly root: HTMLElement;
  readonly paint: (mountain: Mountain, shown: boolean, now?: number) => void;
};

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
  readonly key: KeyParts;
};

/** One more kiln or saw, on the mine's own key (a maker is bought one at a time). */
function buildKey(state: FrameState, id: MakerId): KeyParts {
  return buildKeyFace(`mine-key refinery-maker-key refinery-${id}-key`, () => {
    const plate = refineryView(state.mountain()).plates.find(
      (each) => each.id === id,
    );
    if (plate?.key.can === true) {
      void state.progress.dispatch({ kind: "buyMaker", id });
    }
  });
}

/** A maker's plate, for its maker: its name, its unit and its job do not change. */
function buildPlate(state: FrameState, plate: MakerPlate): PlateParts {
  const root = el("div", "refinery-plate");
  root.dataset["maker"] = plate.id;
  const recipe = el("p", "refinery-recipe");
  const row = el("div", "refinery-row");
  const info = el("div", "refinery-info");
  const head = el("span", "mine-stage-head");
  const now = el("b", "board-num");
  const can = el("i", "board-num");
  const rate = el("span", "mine-stage-rate");
  rate.append(now, " of ", can, ` ${plate.unit}`);
  head.append(el("span", "mine-stage-name", plate.name), rate);
  const runs = el("span", "refinery-machines");
  const machines = el("span", "");
  const idle = el("span", "refinery-idle");
  runs.append(machines, idle);
  const pile = el("span", "mine-stage-pile");
  info.append(head, runs, pile);
  const minus = stepper("−", plate.job, "free");
  const plus = stepper("+", plate.job, "place");
  const count = el("b", "board-num");
  const unit = el("small", "");
  const workers = el("span", "mine-stage-count");
  workers.append(count, unit);
  row.append(info, minus, workers, plus);
  const key = buildKey(state, plate.id);
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
    key,
  };
}

function paintPlate(
  parts: PlateParts,
  plate: MakerPlate,
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
  paintMachineKey(parts.key, plate.key, plate.key.good);
}

/**
 * The makers' plates, one for each open maker, side by side when there are
 * two. They are built again when the makers change, as the Granite opens,
 * as the workforce sheet builds its groups again.
 */
function buildPlates(state: FrameState): {
  readonly root: HTMLElement;
  readonly paint: (plates: readonly MakerPlate[], amount: BuyAmount) => void;
} {
  const root = el("div", "refinery-plates");
  const parts = new Map<MakerId, PlateParts>();
  let shown = "";
  const layout = (plates: readonly MakerPlate[]): void => {
    const key = plates.map((plate) => plate.id).join(",");
    if (key === shown) {
      return;
    }
    shown = key;
    parts.clear();
    for (const plate of plates) {
      parts.set(plate.id, buildPlate(state, plate));
    }
    root.replaceChildren(...[...parts.values()].map((each) => each.root));
    mark(root, "two", plates.length > 1);
  };
  return {
    root,
    paint: (plates, amount) => {
      layout(plates);
      for (const plate of plates) {
        const each = parts.get(plate.id);
        if (each !== undefined) {
          paintPlate(each, plate, amount);
        }
      }
    },
  };
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

/** A level's name and its rate over its hopper. */
type InParts = {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly rate: HTMLElement;
};

function buildIn(level: MineLevelId): InParts {
  const root = el("p", `refinery-in refinery-in-${level}`);
  const name = el("b", "");
  const rate = el("span", "board-num");
  root.append(name, " ", rate);
  return { root, name, rate };
}

/** A level's rock over its hopper, or nothing while the level is shut. */
function paintIn(parts: InParts, hopper: LevelHopper | undefined): void {
  hide(parts.root, hopper === undefined);
  write(parts.name, hopper?.name ?? "");
  write(parts.rate, hopper?.rate ?? "");
}

/** The overlay over the canvas: each level's rock coming up, and the bypass. */
function buildOverlay(): {
  readonly root: HTMLElement;
  readonly ins: Readonly<Record<MineLevelId, InParts>>;
  readonly bypass: HTMLElement;
} {
  const root = el("div", "refinery-over");
  const ins = { topsoil: buildIn("topsoil"), granite: buildIn("granite") };
  const chute = el("p", "refinery-bypass");
  const bypass = el("span", "board-num");
  chute.append(
    el("span", "", "bypass to stone"),
    bypass,
    el("span", "", BYPASS_RECIPE),
  );
  root.append(ins.topsoil.root, ins.granite.root, chute);
  return { root, ins, bypass };
}

/** How often the night forecast is played again: it is a whole night on a copy. */
const FORECAST_MS = 1000;

type Forecast = {
  readonly at: number;
  readonly key: string;
  readonly words: string;
};

/** What the forecast turns on at once: the stockyard's level, the makers and who runs them. */
const forecastKey = (mountain: Mountain): string =>
  [
    mountain.stockyard,
    mountain.makers.kiln,
    mountain.jobs.kilns,
    mountain.makers.saw,
    mountain.jobs.saws,
  ].join(":");

/**
 * The forecast again once a second, or at once when a buy or a move changed
 * what it turns on; not at all while no expand key shows it.
 */
function nextForecast(
  last: Forecast,
  mountain: Mountain,
  clock: number,
  shown: boolean,
): Forecast {
  const key = forecastKey(mountain);
  const due =
    clock - last.at >= FORECAST_MS || clock < last.at || key !== last.key;
  return shown && due
    ? { at: clock, key, words: nightForecast(mountain, clock) }
    : last;
}

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
  const plates = buildPlates(state);
  const yard = buildYard(state);
  panel.append(note, plates.root, yard.root);
  listenSteps(plates.root, state, note);
  root.append(canvas, over.root, panel);
  let view: RefineryView = refineryView(state.mountain());
  let visible = false;
  let forecast: Forecast = { at: -Infinity, key: "", words: "" };
  const sprites = loadRefinerySprites();
  runScene(
    canvas,
    {
      shown: () => visible,
      ground: (c, height) => {
        paintWall(c, height, view.scene.saws !== undefined);
      },
      layout: () => (view.scene.saws === undefined ? 1 : 2),
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
      forecast = nextForecast(
        forecast,
        mountain,
        now ?? Date.now(),
        view.stockyard.expand !== undefined,
      );
      mark(root, "two", view.scene.saws !== undefined);
      for (const level of ["topsoil", "granite"] as const) {
        paintIn(
          over.ins[level],
          view.hoppers.find((hopper) => hopper.level === level),
        );
      }
      write(over.bypass, view.bypass.rate);
      if (view.plates.some((plate) => plate.canPlace)) {
        hide(note, true);
      }
      plates.paint(view.plates, state.amount());
      paintYard(yard, view.stockyard, forecast.words);
    },
  };
}
