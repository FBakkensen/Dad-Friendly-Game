import clayUrl from "./assets/board/res-clay.png";
import ironUrl from "./assets/board/res-iron.png";
import type { BlueprintId } from "./factory";
import { SCENE_W, hash, loadImages, rect } from "./scene-paint";

/**
 * The factory's scene (#681; spec, The factory): a bench seen from above,
 * in art px (one art px is two board px), as the prototype draws it. Wood,
 * the tool rail along the top, a bin for each material with its clay or
 * iron in it, and the station's plate in the middle, where the work order's
 * gear is drawn dim and fills in as its goods arrive. The wood, the tools,
 * the plate and the gear's drawings are drawn in code; the clay and the
 * iron are the game's own sprites.
 */

/** The bins' boxes, in art px. */
const BINS = [
  { x: 6, y: 26, w: 98, h: 42 },
  { x: 108, y: 26, w: 98, h: 42 },
] as const;

/** The blueprints' strip at the foot, in art px. */
const STRIP_H = 90;

/** The station's plate, for a scene `height` art px tall. */
function stationBox(height: number): {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
} {
  return { x: 10, y: 74, w: 192, h: Math.max(40, height - 74 - STRIP_H) };
}

type Sprites = Readonly<Record<"clay" | "iron", HTMLImageElement>>;

export function loadFactorySprites(): Sprites {
  return loadImages({ clay: clayUrl, iron: ironUrl });
}

const WOOD = ["#b98a55", "#c4955d", "#ad7f4c", "#be8f58"] as const;
const SEAM = "#7d5933";
const KNOT = "#9a6f42";
const FRAME = "#5c3f24";

/** The bench's planks: 13 art px a plank, a seam every 90, never quite even. */
function paintPlanks(c: CanvasRenderingContext2D, height: number): void {
  for (let y = 0; y < height; y += 1) {
    const plank = Math.floor(y / 13);
    const shift = Math.floor(hash(plank, 0, 21) * 90);
    for (let x = 0; x < SCENE_W; x += 1) {
      const seam = y % 13 === 12 || (x + shift) % 90 === 0;
      const tone =
        WOOD[Math.floor(hash(plank, Math.floor((x + shift) / 90), 22) * 4)] ??
        WOOD[0];
      const knot = !seam && hash((x + shift) >> 3, y, 23) < 0.12;
      rect(c, x, y, 1, 1, seam ? SEAM : knot ? KNOT : tone);
    }
  }
  rect(c, 0, 0, SCENE_W, 2, FRAME);
  rect(c, 0, 0, 2, height, FRAME);
  rect(c, SCENE_W - 2, 0, 2, height, FRAME);
  rect(c, 0, height - 2, SCENE_W, 2, FRAME);
}

/** The tool rail along the top: a hammer, a wrench, a chisel and a saw. */
function paintTools(c: CanvasRenderingContext2D): void {
  rect(c, 4, 4, 204, 18, "#6b4a2c");
  rect(c, 4, 4, 204, 1, "#8a6238");
  rect(c, 4, 21, 204, 2, "#4a321c");
  rect(c, 10, 10, 14, 3, "#d8a25e");
  rect(c, 22, 7, 6, 9, "#aab4bf");
  rect(c, 22, 7, 6, 2, "#dfe6ec");
  rect(c, 36, 9, 16, 2, "#aab4bf");
  rect(c, 36, 14, 16, 2, "#aab4bf");
  rect(c, 50, 8, 4, 9, "#59606a");
  rect(c, 62, 8, 3, 11, "#d8a25e");
  rect(c, 62, 6, 3, 3, "#aab4bf");
  rect(c, 72, 8, 20, 4, "#aab4bf");
  for (let x = 72; x < 92; x += 2) {
    rect(c, x, 12, 1, 1, "#aab4bf");
  }
  rect(c, 90, 7, 8, 7, "#d8a25e");
}

function paintBins(c: CanvasRenderingContext2D): void {
  for (const { x, y, w, h } of BINS) {
    rect(c, x, y, w, h, FRAME);
    rect(c, x + 2, y + 2, w - 4, h - 4, "#2e1f12");
    rect(c, x + 2, y + 2, w - 4, 2, "#1d130a");
    rect(c, x, y, w, 1, "#8a6238");
  }
}

const PLATE = {
  edge: "#16211e",
  face: "#24352f",
  grid: "#2c4038",
  lit: "#3d574d",
  dash: "#5f8a7b",
};

/** The station's plate: a steel sheet on a grid, bolted at its corners. */
function paintStation(c: CanvasRenderingContext2D, height: number): void {
  const m = stationBox(height);
  rect(c, m.x - 2, m.y - 2, m.w + 4, m.h + 4, PLATE.edge);
  rect(c, m.x, m.y, m.w, m.h, PLATE.face);
  for (let x = m.x + 12; x < m.x + m.w; x += 12) {
    rect(c, x, m.y, 1, m.h, PLATE.grid);
  }
  for (let y = m.y + 12; y < m.y + m.h; y += 12) {
    rect(c, m.x, y, m.w, 1, PLATE.grid);
  }
  rect(c, m.x, m.y, m.w, 1, PLATE.lit);
  const corners = [
    [m.x + 3, m.y + 3],
    [m.x + m.w - 6, m.y + 3],
    [m.x + 3, m.y + m.h - 6],
    [m.x + m.w - 6, m.y + m.h - 6],
  ] as const;
  for (const [bx, by] of corners) {
    rect(c, bx, by, 3, 3, "#59606a");
    rect(c, bx, by, 1, 1, "#aab4bf");
  }
}

/** The bench once a height: the planks, the tools, the bins and the station. */
export function paintBench(c: CanvasRenderingContext2D, height: number): void {
  paintPlanks(c, height);
  paintTools(c);
  paintBins(c);
  paintStation(c, height);
}

/**
 * One drawn part of a gear: a box in its 24 art px square and its colour,
 * and "solid" for a fill a line drawing leaves out.
 */
type Part =
  | readonly [number, number, number, number, string]
  | readonly [number, number, number, number, string, "solid"];

const RAILS: readonly Part[] = [
  ...[2, 7, 12, 17, 21].map((x): Part => [x, 3, 2, 18, "#8a6238"]),
  [0, 6, 24, 2, "#c9d2db"],
  [0, 16, 24, 2, "#c9d2db"],
  [0, 7, 24, 1, "#7b848f"],
  [0, 17, 24, 1, "#7b848f"],
];

const PROPS: readonly Part[] = [
  [3, 4, 3, 19, "#b98a55"],
  [18, 4, 3, 19, "#b98a55"],
  [1, 2, 22, 3, "#d8a25e"],
  ...[0, 1, 2, 3, 4, 5].flatMap((i): Part[] => [
    [6 + i, 10 - i, 1, 2, "#8a6238"],
    [17 - i, 10 - i, 1, 2, "#8a6238"],
  ]),
  [3, 4, 1, 19, "#8a6238"],
  [18, 4, 1, 19, "#8a6238"],
];

const CHARGE: readonly Part[] = [
  ...[9, 13, 17].flatMap((y): Part[] => [
    [4, y, 16, 3, "#b03a2e"],
    [4, y, 16, 1, "#d8573f"],
  ]),
  [10, 8, 4, 13, "#d8c08a"],
  [12, 4, 1, 4, "#3a2a1a"],
  [13, 3, 3, 1, "#3a2a1a"],
  [16, 1, 2, 2, "#ffcf6a"],
];

/** A steel girder: two flanges and the web, with its rivets. */
const REINFORCE: readonly Part[] = [
  [1, 4, 22, 3, "#9aa4ae"],
  [1, 17, 22, 3, "#9aa4ae"],
  [10, 7, 4, 10, "#7b848f"],
  [1, 4, 22, 1, "#c9d2db"],
  [1, 17, 22, 1, "#c9d2db"],
  ...[3, 8, 15, 20].map((x): Part => [x, 5, 1, 1, "#4a4f58"]),
  ...[3, 8, 15, 20].map((x): Part => [x, 18, 1, 1, "#4a4f58"]),
];

/**
 * A tin of axle grease with its spout. Its fill and its grease are left out
 * of a line drawing (`solid`), so the blueprint shows the tin's outline.
 */
const GREASE: readonly Part[] = [
  [6, 9, 12, 13, "#3a3f47", "solid"],
  [8, 13, 8, 5, "#d8a25e", "solid"],
  [8, 13, 8, 1, "#ffcf6a", "solid"],
  [5, 8, 14, 2, "#aab4bf"],
  [5, 10, 1, 12, "#59606a"],
  [18, 10, 1, 12, "#59606a"],
  [5, 21, 14, 1, "#59606a"],
  [8, 12, 8, 1, "#7b848f"],
  [8, 18, 8, 1, "#7b848f"],
  [16, 4, 2, 4, "#7b848f"],
  [17, 2, 4, 2, "#7b848f"],
  [19, 1, 2, 1, "#ffcf6a"],
];

const DRAWINGS: Readonly<Record<BlueprintId, readonly Part[]>> = {
  "iron-rails": RAILS,
  "sturdy-props": PROPS,
  "blasting-charge": CHARGE,
  reinforce: REINFORCE,
  "axle-grease": GREASE,
};

/**
 * A gear's drawing at (x, y), `scale` art px a dot: in its own colours, or
 * all in `ink` (a blueprint's white line, the station's dim outline).
 */
function drawGear(
  c: CanvasRenderingContext2D,
  id: BlueprintId,
  x: number,
  y: number,
  scale: number,
  ink?: string,
): void {
  for (const [px, py, w, h, colour, solid] of DRAWINGS[id]) {
    if (ink !== undefined && solid === "solid") {
      continue;
    }
    rect(
      c,
      x + px * scale,
      y + py * scale,
      w * scale,
      h * scale,
      ink ?? colour,
    );
  }
}

/** What the scene draws each frame. */
export type FactoryScene = {
  readonly clay: number;
  readonly iron: number;
  /** The work order on the station: its gear and how far it is (1 when done). */
  readonly order:
    { readonly blueprint: BlueprintId; readonly share: number } | undefined;
};

function drawBins(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: FactoryScene,
): void {
  const [clayBin, ironBin] = BINS;
  for (let i = 0; i < Math.min(10, scene.clay); i += 1) {
    const row = i > 4 ? 1 : 0;
    c.drawImage(
      sprites.clay,
      clayBin.x + 4 + (i % 5) * 18 + row * 6,
      clayBin.y + 3 + row * 8,
    );
  }
  for (let i = 0; i < Math.min(18, scene.iron); i += 1) {
    c.drawImage(
      sprites.iron,
      ironBin.x + 3 + (i % 9) * 10,
      ironBin.y + 3 + Math.floor(i / 9) * 8,
    );
  }
}

/**
 * The bins' contents and the work order's gear: dim, then lit from the
 * left as far as its goods have arrived, with a spark at the edge while it
 * is still delivering.
 */
export function drawFactory(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: FactoryScene,
  height: number,
  clock: number,
): void {
  if (sprites.clay.complete && sprites.iron.complete) {
    drawBins(c, sprites, scene);
  }
  const order = scene.order;
  if (order === undefined) {
    return;
  }
  const m = stationBox(height);
  const size = 48;
  const x = m.x + 12;
  const y = m.y + Math.max(26, Math.floor((m.h - size) / 2) + 6);
  drawGear(c, order.blueprint, x, y, 2, PLATE.lit);
  c.save();
  c.beginPath();
  c.rect(x, y, Math.round(size * order.share), size);
  c.clip();
  drawGear(c, order.blueprint, x, y, 2);
  c.restore();
  const tick = Math.floor(clock * 6);
  if (order.share < 1 && tick % 2 === 1) {
    const edge = x + size * order.share;
    rect(c, edge - 1, y + 10 + hash(tick, 1, 3) * 28, 2, 2, "#ffe07a");
    rect(c, edge + 2, y + 8 + hash(tick, 2, 3) * 30, 1, 1, "#ff9a2e");
  }
}

/** A blueprint's paper icon: the gear drawn in white line, 24 art px square. */
export function paintBlueprintIcon(
  c: CanvasRenderingContext2D,
  id: BlueprintId,
): void {
  c.clearRect(0, 0, 24, 24);
  drawGear(c, id, 0, 0, 1, "#e6f0ff");
}
