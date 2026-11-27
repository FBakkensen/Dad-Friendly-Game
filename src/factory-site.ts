import partsUrl from "./assets/board/res-parts.png";
import { el, hide, mark, write } from "./board-dom";
import type { FactoryMakerId } from "./factory";
import {
  factoryView,
  type FactoryLineView,
  type FactoryOutputView,
  type FactoryScene,
  type FactoryView,
} from "./factory-view";
import type { FrameState } from "./frame-state";
import { listenSteps, paintSteps, stepper } from "./job-steps";
import { buildKeyFace, paintMachineKey, type KeyParts } from "./mine-site";
import type { Mountain } from "./mountain";
import { PART2_ART } from "./part2-art";
import {
  buildBufferPart,
  paintBufferPart,
  type BufferParts,
} from "./refinery-site";
import {
  SCENE_W,
  frame,
  hash,
  loadImages,
  rect,
  runScene,
} from "./scene-paint";
import type { BuyAmount } from "./tiers";
import { NO_FREE_WORKER } from "./workforce-view";
import "./factory.css";

/**
 * The steady-flow multi-input Factory site (Slice 2 Part 2, #779; spec,
 * "What he sees"): animated conveyor floor, shared Parts output buffer,
 * Parts Press (2 input buffers) and Precision Assembly (3 input buffers once
 * Crystal Caves is open). Reuses `buildKeyFace` / `paintMachineKey`,
 * `stepper` / `listenSteps`, and `buildBufferPart` / `paintBufferPart`.
 */

export type FactorySite = {
  readonly root: HTMLElement;
  readonly paint: (mountain: Mountain, shown: boolean, now?: number) => void;
};

type FactorySprites = Readonly<
  Record<"partsPress" | "precisionAssembly" | "parts", HTMLImageElement>
>;

function loadFactorySprites(): FactorySprites {
  return loadImages({
    partsPress: PART2_ART.partsPress,
    precisionAssembly: PART2_ART.precisionAssembly,
    parts: partsUrl,
  });
}

function paintFloor(c: CanvasRenderingContext2D, height: number): void {
  rect(c, 0, 0, SCENE_W, height, "#10161e");
  for (let y = 0; y < height; y += 6) {
    for (let x = 0; x < SCENE_W; x += 12) {
      const shade = hash(x, y, 81) < 0.45 ? "#161e28" : "#131a23";
      rect(c, x + 1, y + 1, 10, 4, shade);
    }
  }
}

function drawBelt(
  c: CanvasRenderingContext2D,
  sprites: FactorySprites,
  row: {
    readonly y: number;
    readonly icon: HTMLImageElement;
    readonly owned: number;
    readonly running: boolean;
  },
  t: number,
): void {
  const { y, icon, owned, running } = row;
  rect(c, 6, y + 4, 152, 10, "#1d2631");
  rect(c, 6, y + 4, 152, 1, running ? "#f2b441" : "#2b333c");
  rect(c, 6, y + 13, 152, 1, running ? "#f2b441" : "#2b333c");
  for (let x = 10; x < 154; x += 8) {
    const shift = running ? Math.floor(t * 20) % 8 : 0;
    rect(c, x + shift, y + 5, 2, 8, "#26313e");
  }
  c.save();
  if (owned <= 0 || !running) {
    c.globalAlpha = 0.45;
  }
  if (icon.complete && icon.naturalWidth > 0) {
    c.drawImage(icon, 8, y, 18, 18);
  }
  c.restore();
  if (running) {
    for (let k = 0; k < 4; k += 1) {
      const px = 32 + ((t * 28 + k * 32) % 118);
      frame(c, sprites.parts, 1, 0, [px, y + 1]);
    }
  }
}

function drawFactoryScene(
  c: CanvasRenderingContext2D,
  sprites: FactorySprites,
  scene: FactoryScene,
  t: number,
): void {
  drawBelt(
    c,
    sprites,
    {
      y: 4,
      icon: sprites.partsPress,
      owned: scene.pressOwned,
      running: scene.pressRunning,
    },
    t,
  );
  if (scene.assemblyOpen) {
    drawBelt(
      c,
      sprites,
      {
        y: 23,
        icon: sprites.precisionAssembly,
        owned: scene.assemblyOwned,
        running: scene.assemblyRunning,
      },
      t,
    );
  }
  // Output crate at the belt's right end, filling with Parts.
  rect(c, 166, 6, 38, 30, "#141a22");
  rect(c, 166, 6, 38, 1, "#3a4654");
  rect(c, 166, 35, 38, 1, "#3a4654");
  rect(c, 166, 6, 1, 30, "#3a4654");
  rect(c, 203, 6, 1, 30, "#3a4654");
  const fillH = Math.round(24 * Math.min(1, scene.outputFill));
  if (fillH > 0) {
    rect(
      c,
      169,
      33 - fillH,
      32,
      fillH,
      scene.outputFill >= 1 ? "#ef6a55" : "#f2b441",
    );
  }
  frame(c, sprites.parts, 1, 0, [177, 13]);
}

type OutputParts = {
  readonly root: HTMLElement;
  readonly text: HTMLElement;
  readonly shipping: HTMLElement;
  readonly fill: HTMLElement;
};

function buildOutput(): OutputParts {
  const root = el("div", "factory-output");
  const top = el("div", "factory-output-top");
  const name = el("span", "factory-output-name", "Parts output");
  const text = el("span", "factory-output-text board-num");
  const shipping = el("span", "factory-output-ship board-num");
  top.append(name, text, shipping);
  const track = el("span", "maker-buf-track");
  const fill = el("i", "maker-buf-fill");
  track.append(fill);
  root.append(top, track);
  return { root, text, shipping, fill };
}

function paintOutput(parts: OutputParts, output: FactoryOutputView): void {
  write(parts.text, output.text);
  write(parts.shipping, `Shipping ${output.shipping}`);
  mark(parts.root, "full", output.full);
  parts.fill.style.width = `${String(Math.round(output.fill * 1000) / 10)}%`;
}

type LineParts = {
  readonly root: HTMLElement;
  readonly recipe: HTMLElement;
  readonly standing: HTMLElement;
  readonly now: HTMLElement;
  readonly can: HTMLElement;
  readonly machines: HTMLElement;
  readonly idle: HTMLElement;
  readonly buffers: readonly BufferParts[];
  readonly count: HTMLElement;
  readonly unit: HTMLElement;
  readonly minus: HTMLButtonElement;
  readonly plus: HTMLButtonElement;
  readonly key: KeyParts;
};

function buildLineKey(state: FrameState, id: FactoryMakerId): KeyParts {
  return buildKeyFace(`mine-key factory-line-key factory-${id}-key`, () => {
    const line = factoryView(state.mountain()).lines.find(
      (each) => each.id === id,
    );
    if (line?.key.can === true) {
      void state.progress.dispatch({ kind: "buyMaker", id });
    }
  });
}

function buildLinePlate(state: FrameState, line: FactoryLineView): LineParts {
  const root = el("div", "factory-plate");
  root.dataset["maker"] = line.id;
  const recipeBar = el("div", "refinery-recipe-bar");
  const recipe = el("p", "refinery-recipe");
  const standing = el("span", "maker-standing", "standing");
  standing.hidden = true;
  recipeBar.append(recipe, standing);
  const row = el("div", "refinery-row");
  const info = el("div", "refinery-info");
  const head = el("span", "mine-stage-head");
  const now = el("b", "board-num");
  const can = el("i", "board-num");
  const rate = el("span", "mine-stage-rate");
  rate.append(now, " of ", can, ` ${line.unit}`);
  head.append(el("span", "mine-stage-name", line.name), rate);
  const runs = el("span", "refinery-machines");
  const machines = el("span", "");
  const idle = el("span", "refinery-idle");
  runs.append(machines, idle);
  info.append(head, runs);
  const minus = stepper("−", line.job, "free");
  const plus = stepper("+", line.job, "place");
  const count = el("b", "board-num");
  const unit = el("small", "");
  const workers = el("span", "mine-stage-count");
  workers.append(count, unit);
  row.append(info, minus, workers, plus);
  const buffers = line.buffers.map(buildBufferPart);
  const bufRow = el("div", "maker-buffers");
  bufRow.dataset["count"] = String(buffers.length);
  bufRow.append(...buffers.map((each) => each.root));
  const key = buildLineKey(state, line.id);
  root.append(recipeBar, row, bufRow, key.root);
  return {
    root,
    recipe,
    standing,
    now,
    can,
    machines,
    idle,
    buffers,
    count,
    unit,
    minus,
    plus,
    key,
  };
}

function paintLinePlate(
  parts: LineParts,
  line: FactoryLineView,
  amount: BuyAmount,
): void {
  write(parts.recipe, line.recipe);
  hide(parts.standing, !line.standing);
  write(parts.now, line.now);
  write(parts.can, line.can);
  write(parts.machines, line.machines);
  hide(parts.idle, line.idle === undefined);
  write(parts.idle, line.idle === undefined ? "" : ` ${line.idle}`);
  for (const [index, buf] of line.buffers.entries()) {
    const target = parts.buffers[index];
    if (target !== undefined) {
      paintBufferPart(target, buf);
    }
  }
  write(parts.count, String(line.workers));
  write(parts.unit, line.workers === 1 ? "worker" : "workers");
  paintSteps(parts, line, amount);
  paintMachineKey(parts.key, line.key, line.key.priceParts ?? line.key.good);
}

export function createFactorySite(
  state: FrameState,
  signal?: AbortSignal,
): FactorySite {
  const root = el("section", "factory");
  root.setAttribute("aria-label", "The factory");
  root.hidden = true;
  const floor = el("div", "factory-floor");
  const canvas = el("canvas", "factory-canvas");
  canvas.setAttribute("aria-hidden", "true");
  floor.append(canvas);
  const note = el("p", "mine-note", NO_FREE_WORKER);
  note.hidden = true;
  const output = buildOutput();
  const linesWrap = el("div", "factory-lines");
  const lineParts = new Map<FactoryMakerId, LineParts>();
  let shownLines = "";
  root.append(floor, note, output.root, linesWrap);
  listenSteps(linesWrap, state, note);

  let view: FactoryView = factoryView(state.mountain());
  let visible = false;
  const sprites = loadFactorySprites();
  runScene(
    canvas,
    {
      shown: () => visible,
      ground: paintFloor,
      draw: (c, clock) => {
        drawFactoryScene(c, sprites, view.scene, clock);
      },
    },
    signal,
  );

  return {
    root,
    paint: (mountain, shown) => {
      visible = shown;
      hide(root, !shown);
      if (!shown) {
        hide(note, true);
        return;
      }
      view = factoryView(mountain);
      paintOutput(output, view.output);
      const key = view.lines.map((line) => line.id).join(",");
      if (key !== shownLines) {
        shownLines = key;
        lineParts.clear();
        for (const line of view.lines) {
          lineParts.set(line.id, buildLinePlate(state, line));
        }
        linesWrap.replaceChildren(
          ...[...lineParts.values()].map((each) => each.root),
        );
      }
      if (view.lines.some((line) => line.canPlace)) {
        hide(note, true);
      }
      const amount = state.amount();
      for (const line of view.lines) {
        const parts = lineParts.get(line.id);
        if (parts !== undefined) {
          paintLinePlate(parts, line, amount);
        }
      }
    },
  };
}
