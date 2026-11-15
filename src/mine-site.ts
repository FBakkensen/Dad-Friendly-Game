import stoneUrl from "./assets/board/res-stone.png";
import { el, hide, mark, setAttr, write } from "./board-dom";
import { tierBuyMove } from "./economy/actions";
import type { FrameState } from "./frame-state";
import { listenSteps, paintSteps, stepper } from "./job-steps";
import { STAGES, type Stage } from "./line";
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
  drawMine,
  loadSprites,
  paintGround,
  startMotion,
} from "./mine-scene";
import type { Mountain } from "./mountain";
import { stageCount } from "./next-view";
import { runScene } from "./scene-paint";
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
  readonly info: HTMLButtonElement;
  readonly lamp: HTMLElement;
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

function buildRow(state: FrameState, row: StageRow): RowParts {
  const root = el("div", "mine-stage");
  root.dataset["stage"] = row.stage;
  // A tap on the row's words opens the stage's list (#661).
  const info = el("button", "mine-stage-info");
  info.type = "button";
  info.addEventListener("click", () => {
    state.openStage(row.stage);
  });
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
  const lamp = el("i", "frame-lamp");
  info.append(band, head, sum, lamp);
  const minus = stepper("−", row.job, "free");
  const plus = stepper("+", row.job, "place");
  const count = el("b", "board-num");
  const unit = el("small", "");
  const workers = el("span", "mine-stage-count");
  workers.append(count, unit);
  root.append(info, minus, workers, plus);
  return {
    root,
    info,
    lamp,
    now,
    can,
    sum,
    bandCan,
    bandNow,
    count,
    unit,
    minus,
    plus,
  };
}

/**
 * The fullest form of the row's sum that fits its line. A sum too long for
 * one line in every form (the third state's words) takes two lines, in
 * its full words.
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
  write(target, forms[0] ?? "");
}

function paintRow(
  parts: RowParts,
  row: StageRow,
  amount: BuyAmount,
  lamp: boolean,
): void {
  setAttr(parts.lamp, "data-lamp", lamp ? "green" : "dark");
  setAttr(
    parts.info,
    "aria-label",
    `${row.name}: ${row.now}/s of ${row.can}. Opens its list.`,
  );
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

/** The mine's canvas: its ground once a height, then its moving parts. */
function runCanvas(
  canvas: HTMLCanvasElement,
  shown: () => boolean,
  scene: () => MineScene,
  signal: AbortSignal | undefined,
): void {
  const sprites = loadSprites();
  const motion = startMotion();
  runScene(
    canvas,
    {
      shown,
      ground: paintGround,
      draw: (c, clock) => {
        drawMine(c, sprites, scene(), motion, clock);
      },
    },
    signal,
  );
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
  const keys = new Map(STAGES.map((stage) => [stage, buildKey(state, stage)]));
  keyRow.append(...[...keys.values()].map((key) => key.root));
  const rowBox = el("div", "mine-stages");
  const rows = new Map(
    stageRows(state.mountain()).map((row) => [row.stage, buildRow(state, row)]),
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
      const offered = machineKeys(mountain, state.amount(), now);
      for (const [stage, parts] of keys) {
        const key = offered.find((each) => each.stage === stage);
        // A stage with nothing to buy shows no key, never a stale one.
        hide(parts.root, key === undefined);
        if (key !== undefined) {
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
          paintRow(parts, row, amount, stageCount(mountain, row.stage) > 0);
        }
      }
    },
  };
}
