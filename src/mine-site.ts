import { el, hide, mark, setAttr, write } from "./board-dom";
import { tierBuyMove } from "./economy/actions";
import type { FrameState } from "./frame-state";
import { listenSteps } from "./job-steps";
import { STAGES, type Stage } from "./line";
import { graniteOpen, isLevelMachine } from "./mine-levels";
import {
  levelsView,
  shaftGate,
  twoLevelScene,
  type TwoLevelScene,
} from "./mine-level-view";
import {
  createGraniteGate,
  createLevelsSite,
  type GraniteGate,
  type LevelsSite,
} from "./mine-levels-site";
import { atArt, buildRow, paintRow } from "./mine-row";
import {
  DEEPER_STRATA,
  levelPlate,
  machineKeys,
  mineScene,
  stageRows,
  STAGE_NAMES,
  type MachineKey,
  type MineScene,
} from "./mine-view";
import {
  DEEP_Y,
  LEVEL,
  drawMine,
  levelsOf,
  loadSprites,
  paintGround,
  startMotion,
} from "./mine-scene";
import type { Mountain } from "./mountain";
import { stageCount } from "./next-view";
import { priceIcon } from "./price-icons";
import { runScene } from "./scene-paint";
import type { GoodId } from "./stock";
import { NO_FREE_WORKER } from "./workforce-view";
import "./mine.css";

/**
 * The mine on slice 1's frame (#660; spec, The mine): the mountain cut open,
 * the Topsoil's plate, the line under it, a key for each stage's next
 * machine, and a row for each stage with its workers between − and +. It
 * paints the pure views (mine-view) and changes the game only through
 * `progress.dispatch`. There is no hire key here: hiring is in the frame.
 * With part 3 the Granite's plate waits under the Topsoil until the shaft is
 * sunk, and then the two levels take the rows' place (mine-levels-site,
 * #680): a drill's or a cart's key then asks which level.
 */

export type MineSite = {
  readonly root: HTMLElement;
  readonly paint: (mountain: Mountain, shown: boolean, now?: number) => void;
};

/** A machine's key: what it is and moves, its price and the workers it takes. */
export type KeyParts = {
  readonly root: HTMLButtonElement;
  readonly face: HTMLElement;
  readonly price: HTMLElement;
  /** The price's good's icon: stone, or cut stone for the borer and the locomotive in part 3. */
  readonly icon: HTMLImageElement;
  readonly staff: HTMLElement;
};

/** What a key in the mine keys' form says: a machine's, or the kiln's (#671). */
export type KeyFace = Pick<
  MachineKey,
  "face" | "price" | "staff" | "can" | "label"
>;

/**
 * A key in the mine keys' form: its face, and under it the price in stone and
 * the workers it takes. A tap runs `onTap`.
 */
export function buildKeyFace(className: string, onTap: () => void): KeyParts {
  const root = el("button", className);
  root.type = "button";
  const face = el("span", "mine-key-face");
  const price = el("span", "board-num");
  const staff = el("span", "mine-key-staff");
  const icon = el("img", "mine-key-icon");
  paintIcon(icon, "stones");
  icon.alt = "";
  const small = el("span", "mine-key-small");
  small.append(price, icon, staff);
  root.append(face, small);
  root.addEventListener("click", onTap);
  return { root, face, price, icon, staff };
}

/** The good each icon shows now, so a repaint sets its picture only when the good changes. */
const iconGoods = new WeakMap<HTMLImageElement, GoodId>();

/** Shows the icon of a price in `good`. */
export function paintIcon(icon: HTMLImageElement, good: GoodId): void {
  const url = priceIcon(good);
  if (iconGoods.get(icon) !== good && url !== undefined) {
    iconGoods.set(icon, good);
    icon.src = url;
  }
}

/**
 * A machine's key in the mine keys' form, which a stage's list uses too
 * (#661). A tap buys what `pick` finds at that moment, when he can pay.
 * With two levels a drilling or haulage machine's key asks which level on
 * the machine card instead (ruling 5), wherever the key is: every buy of a
 * level's machine goes through the card. Hoisting's serves the shaft and
 * buys at once.
 */
export function buildMachineKey(
  state: FrameState,
  className: string,
  pick: () => MachineKey | undefined,
): KeyParts {
  return buildKeyFace(className, () => {
    const key = pick();
    if (key === undefined) {
      return;
    }
    if (isLevelMachine(key.id) && graniteOpen(state.mountain())) {
      state.openMachine(key.id);
      return;
    }
    if (key.can) {
      void state.progress.dispatch(tierBuyMove(key.id, key.count));
    }
  });
}

/** Paints a key; `good` is what its price is paid in (stone unless the key says). */
export function paintMachineKey(
  parts: KeyParts,
  key: KeyFace,
  good: GoodId = "stones",
): void {
  paintIcon(parts.icon, good);
  write(parts.face, key.face);
  write(parts.price, key.price);
  write(parts.staff, ` · ${key.staff}`);
  mark(parts.root, "can", key.can);
  setAttr(parts.root, "aria-label", key.label);
}

/**
 * A stage's key at the mine's foot: the stage's next machine
 * (`buildMachineKey`), so with two levels drilling's and haulage's ask
 * which level on the machine card (ruling 5).
 */
function buildKey(state: FrameState, stage: Stage): KeyParts {
  const key = buildMachineKey(state, "mine-key", () =>
    machineKeys(state.mountain(), state.amount()).find(
      (each) => each.stage === stage,
    ),
  );
  key.root.dataset["stage"] = stage;
  return key;
}

/** The overlay over the canvas: the plate, the zone names and the line under the Topsoil. */
type Overlay = {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly rate: HTMLElement;
  readonly deep: HTMLElement;
};

function buildOverlay(): Overlay {
  const root = el("div", "mine-over");
  const plate = el("div", "mine-level");
  atArt(plate, LEVEL.top + 3);
  const name = el("span", "mine-level-name");
  const rate = el("span", "mine-level-rate board-num");
  const head = el("span", "mine-level-head");
  head.append(name, rate);
  plate.append(head);
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
  return { root, name, rate, deep };
}

/** The mine's canvas: its ground once a height and a count of levels, then its moving parts. */
function runCanvas(
  canvas: HTMLCanvasElement,
  shown: () => boolean,
  scene: () => MineScene | TwoLevelScene,
  signal: AbortSignal | undefined,
): void {
  const sprites = loadSprites();
  const motion = startMotion();
  runScene(
    canvas,
    {
      shown,
      ground: (c, height) => {
        paintGround(c, height, levelsOf(scene()));
      },
      draw: (c, clock) => {
        drawMine(c, sprites, scene(), motion, clock);
      },
      layout: () => levelsOf(scene()),
    },
    signal,
  );
}

/** What the canvas draws: the two levels once the Granite is open (ruling 1), else the one. */
function sceneOf(mountain: Mountain): MineScene | TwoLevelScene {
  return graniteOpen(mountain) ? twoLevelScene(mountain) : mineScene(mountain);
}

/** Each stage's key, or none for a stage with nothing to buy (never a stale one). */
function paintKeys(
  keys: ReadonlyMap<Stage, KeyParts>,
  offered: readonly MachineKey[],
): void {
  for (const [stage, parts] of keys) {
    const key = offered.find((each) => each.stage === stage);
    hide(parts.root, key === undefined);
    if (key !== undefined) {
      paintMachineKey(parts, key, key.good);
    }
  }
}

/**
 * What the mine shows for the Granite, built the first time it is needed so
 * that the mine without part 3 is today's to the last element: the plate
 * before the shaft, and the two levels once it is sunk.
 */
type Granite = {
  gate: GraniteGate | undefined;
  levels: LevelsSite | undefined;
};

/** The Granite's plate under the Topsoil while part 3 waits for the shaft, and the line under it. */
function paintGate(
  state: FrameState,
  granite: Granite,
  over: Overlay,
  mountain: Mountain,
): void {
  const view = shaftGate(mountain);
  if (view === undefined) {
    if (granite.gate !== undefined) {
      hide(granite.gate.root, true);
      atArt(over.deep, DEEP_Y);
    }
    return;
  }
  if (granite.gate === undefined) {
    granite.gate = createGraniteGate(state);
    over.root.append(granite.gate.root);
  }
  hide(granite.gate.root, false);
  atArt(over.deep, granite.gate.paint(view));
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
  const granite: Granite = { gate: undefined, levels: undefined };
  /** The two levels, built the first time the Granite is open (ruling 1). */
  const levels = (): LevelsSite => {
    if (granite.levels === undefined) {
      granite.levels = createLevelsSite(state, note);
      root.insertBefore(granite.levels.over, panel);
      panel.append(granite.levels.foot);
    }
    return granite.levels;
  };
  /** The one-level rows: a + that can place a worker takes the note down. */
  const paintOne = (mountain: Mountain, now: number | undefined): boolean => {
    const plate = levelPlate(mountain);
    write(over.name, plate.name);
    write(over.rate, plate.rate);
    paintGate(state, granite, over, mountain);
    const amount = state.amount();
    const views = stageRows(mountain, now);
    for (const row of views) {
      const parts = rows.get(row.stage);
      if (parts !== undefined) {
        paintRow(parts, row, {
          amount,
          lamp: stageCount(mountain, row.stage) > 0,
          pile: true,
        });
      }
    }
    return views.some((row) => row.canPlace);
  };
  let scene = sceneOf(state.mountain());
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
      // One reading of the mine with two levels a paint, for its rows, its strip and the scene.
      const view = levelsView(mountain, now);
      scene =
        view === undefined
          ? mineScene(mountain)
          : twoLevelScene(mountain, view);
      paintKeys(keys, machineKeys(mountain, state.amount(), now));
      const two = view !== undefined;
      hide(over.root, two);
      hide(rowBox, two);
      if (granite.levels !== undefined) {
        hide(granite.levels.over, !two);
        hide(granite.levels.foot, !two);
      }
      const canPlace =
        view === undefined
          ? paintOne(mountain, now)
          : levels().paint(mountain, view);
      // A + that can place a worker takes the no-free-worker line down; the hoists' line stays its time.
      if (canPlace && note.textContent === NO_FREE_WORKER) {
        hide(note, true);
      }
    },
  };
}
