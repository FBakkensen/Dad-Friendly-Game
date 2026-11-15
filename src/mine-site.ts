import stoneUrl from "./assets/board/res-stone.png";
import { el, hide, mark, setAttr, write } from "./board-dom";
import { tierBuyMove } from "./economy/actions";
import type { FrameState } from "./frame-state";
import { listenSteps, paintSteps, stepper } from "./job-steps";
import type { Stage } from "./line";
import {
  DEEPER_STRATA,
  levelPlate,
  machineKeys,
  mineScene,
  stageRows,
  STAGE_NAMES,
  type MineScene,
  type StageRow,
} from "./mine-view";
import {
  DEEP_Y,
  LEVEL,
  SCENE_W,
  drawMine,
  loadSprites,
  paintGround,
  startMotion,
} from "./mine-scene";
import type { Mountain } from "./mountain";
import type { BuyAmount } from "./tiers";
import { NO_FREE_WORKER } from "./workforce-view";
import "./mine.css";

/**
 * The mine on slice 1's frame (#660; spec, The mine): the mountain cut open,
 * the Topsoil's plate, the line under it, a key for each stage's next
 * machine, and a row for each stage with its workers between − and +. It
 * paints the pure views (mine-view) and changes the game only through
 * `progress.dispatch`. There is no hire key here: hiring is in the frame.
 */

export type MineSite = {
  readonly root: HTMLElement;
  readonly paint: (mountain: Mountain, shown: boolean, now?: number) => void;
};

const STAGE_ORDER: readonly Stage[] = ["face", "haul", "lift"];

/** Positions a part of the overlay at an art px row of the scene. */
function atArt(target: HTMLElement, row: number): void {
  target.style.setProperty("--at", String(row));
}

type KeyParts = {
  readonly root: HTMLButtonElement;
  readonly face: HTMLElement;
  readonly price: HTMLElement;
  readonly staff: HTMLElement;
};

function buildKey(state: FrameState, stage: Stage): KeyParts {
  const root = el("button", "mine-key");
  root.type = "button";
  root.dataset["stage"] = stage;
  const face = el("span", "mine-key-face");
  const price = el("span", "board-num");
  const staff = el("span", "mine-key-staff");
  const stone = el("img", "mine-key-icon");
  stone.src = stoneUrl;
  stone.alt = "";
  const small = el("span", "mine-key-small");
  small.append(price, stone, staff);
  root.append(face, small);
  root.addEventListener("click", () => {
    const key = machineKeys(state.mountain(), state.amount()).find(
      (each) => each.stage === stage,
    );
    if (key !== undefined && key.can) {
      void state.progress.dispatch(tierBuyMove(key.id, key.count));
    }
  });
  return { root, face, price, staff };
}

type RowParts = {
  readonly root: HTMLElement;
  readonly now: HTMLElement;
  readonly can: HTMLElement;
  readonly sum: HTMLElement;
  readonly bandCan: HTMLElement;
  readonly bandNow: HTMLElement;
  readonly count: HTMLElement;
  readonly unit: HTMLElement;
  readonly minus: HTMLButtonElement;
  readonly plus: HTMLButtonElement;
};

function buildRow(row: StageRow): RowParts {
  const root = el("div", "mine-stage");
  root.dataset["stage"] = row.stage;
  const info = el("div", "mine-stage-info");
  const band = el("span", "mine-band");
  const bandCan = el("i", "mine-band-can");
  const bandNow = el("i", "mine-band-now");
  band.append(bandCan, bandNow);
  const head = el("span", "mine-stage-head");
  const now = el("b", "board-num");
  const can = el("i", "board-num");
  const rate = el("span", "mine-stage-rate");
  rate.append(now, " of ", can);
  head.append(el("span", "mine-stage-name", row.name), rate);
  const sum = el("span", "mine-stage-sum");
  info.append(band, head, sum);
  const minus = stepper("−", row.job, "free");
  const plus = stepper("+", row.job, "place");
  const count = el("b", "board-num");
  const unit = el("small", "");
  const workers = el("span", "mine-stage-count");
  workers.append(count, unit);
  root.append(info, minus, workers, plus);
  return { root, now, can, sum, bandCan, bandNow, count, unit, minus, plus };
}

/**
 * The fullest form of the row's sum that fits its line. A sum too long for
 * one line in every form (the third state's words) takes two lines.
 */
function writeSum(target: HTMLElement, forms: readonly string[]): void {
  mark(target, "wrap", false);
  for (const form of forms) {
    write(target, form);
    if (target.scrollWidth <= target.clientWidth + 1) {
      return;
    }
  }
  mark(target, "wrap", true);
  write(target, forms[1] ?? "");
}

function paintRow(parts: RowParts, row: StageRow, amount: BuyAmount): void {
  write(parts.now, row.now);
  write(parts.can, row.can);
  writeSum(parts.sum, row.sum);
  parts.bandCan.style.width = `${String(Math.round(row.band.can * 1000) / 10)}%`;
  parts.bandNow.style.width = `${String(Math.round(row.band.now * 1000) / 10)}%`;
  write(parts.count, String(row.workers));
  write(parts.unit, row.workers === 1 ? "worker" : "workers");
  paintSteps(parts, row, amount);
}

/** The overlay over the canvas: the plate, the zone names and the line under the Topsoil. */
function buildOverlay(): {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly rate: HTMLElement;
  readonly line: HTMLElement;
} {
  const root = el("div", "mine-over");
  const plate = el("div", "mine-level");
  atArt(plate, LEVEL.top + 3);
  const name = el("span", "mine-level-name");
  const rate = el("span", "mine-level-rate board-num");
  const head = el("span", "mine-level-head");
  head.append(name, rate);
  const line = el("span", "mine-level-line");
  plate.append(head, line);
  const zones = el("div", "mine-zones");
  atArt(zones, LEVEL.floor + 1);
  for (const stage of ["lift", "haul", "face"] as const) {
    const zone = el("span", "mine-zone", STAGE_NAMES[stage]);
    zone.dataset["stage"] = stage;
    zones.append(zone);
  }
  const deep = el("p", "mine-deep", DEEPER_STRATA);
  atArt(deep, DEEP_Y);
  root.append(plate, zones, deep);
  return { root, name, rate, line };
}

/** The canvas and its frames: the ground is painted once a height, the rest each frame. */
function runCanvas(
  canvas: HTMLCanvasElement,
  shown: () => boolean,
  scene: () => MineScene,
  signal: AbortSignal | undefined,
): void {
  const c = canvas.getContext("2d");
  if (c === null || typeof requestAnimationFrame !== "function") {
    return;
  }
  const sprites = loadSprites();
  const motion = startMotion();
  const ground = document.createElement("canvas");
  let last = 0;
  const step = (ms: number): void => {
    if (signal?.aborted === true) {
      return;
    }
    requestAnimationFrame(step);
    // Hard steps, as the board moves: about ten frames a second.
    if (!shown() || ms - last < 100) {
      return;
    }
    last = ms;
    const height = Math.max(1, Math.floor(canvas.clientHeight / 2));
    if (canvas.height !== height || ground.height !== height) {
      canvas.width = SCENE_W;
      canvas.height = height;
      ground.width = SCENE_W;
      ground.height = height;
      const g = ground.getContext("2d");
      if (g !== null) {
        paintGround(g, height);
      }
    }
    c.drawImage(ground, 0, 0);
    drawMine(c, sprites, scene(), motion, ms / 1000);
  };
  requestAnimationFrame(step);
}

export function createMineSite(
  state: FrameState,
  signal?: AbortSignal,
): MineSite {
  const root = el("section", "mine");
  root.setAttribute("aria-label", "The mine");
  const canvas = el("canvas", "mine-canvas");
  canvas.setAttribute("aria-hidden", "true");
  const over = buildOverlay();
  const panel = el("div", "mine-panel");
  const note = el("p", "mine-note", NO_FREE_WORKER);
  note.hidden = true;
  const keyRow = el("div", "mine-keys");
  const keys = new Map(
    STAGE_ORDER.map((stage) => [stage, buildKey(state, stage)]),
  );
  keyRow.append(...[...keys.values()].map((key) => key.root));
  const rowBox = el("div", "mine-stages");
  const rows = new Map(
    stageRows(state.mountain()).map((row) => [row.stage, buildRow(row)]),
  );
  rowBox.append(...[...rows.values()].map((row) => row.root));
  listenSteps(rowBox, state, note);
  panel.append(note, keyRow, rowBox);
  root.append(canvas, over.root, panel);
  let scene = mineScene(state.mountain());
  let visible = true;
  runCanvas(
    canvas,
    () => visible,
    () => scene,
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
      scene = mineScene(mountain);
      const plate = levelPlate(mountain, now);
      write(over.name, plate.name);
      write(over.rate, plate.rate);
      write(over.line, plate.line);
      for (const key of machineKeys(mountain, state.amount())) {
        const parts = keys.get(key.stage);
        if (parts !== undefined) {
          write(parts.face, key.face);
          write(parts.price, key.price);
          write(parts.staff, ` · ${key.staff}`);
          mark(parts.root, "can", key.can);
          setAttr(parts.root, "aria-label", key.label);
        }
      }
      const amount = state.amount();
      const views = stageRows(mountain, now);
      if (views.some((row) => row.canPlace)) {
        hide(note, true);
      }
      for (const row of views) {
        const parts = rows.get(row.stage);
        if (parts !== undefined) {
          paintRow(parts, row, amount);
        }
      }
    },
  };
}
