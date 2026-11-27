import kilnDimUrl from "./assets/board/mach-kiln-dim.png";
import kilnUrl from "./assets/board/mach-kiln.png";
import sawDimUrl from "./assets/board/mach-saw-dim.png";
import sawUrl from "./assets/board/mach-saw.png";
import brickUrl from "./assets/board/res-brick.png";
import cutStoneUrl from "./assets/board/res-cut-stone.png";
import partsUrl from "./assets/board/res-parts.png";
import { PART2_ART } from "./part2-art";
import type { Bay, RefineryScene } from "./refinery-view";
import {
  SCENE_W,
  frame,
  glow,
  hash,
  heap,
  line,
  loadImages,
  rect,
} from "./scene-paint";

/**
 * The refinery's scene (#671; spec, The refinery): a flow from top to
 * bottom on a brick wall, in art px (one art px is two board px). The
 * Topsoil's rock falls into its hopper, which is as full as the kilns' own
 * pile, and from it into the kilns; what finds no room there runs down the
 * middle chute to stone. The stockyard's bays are their own strip at the
 * site's foot (`drawYard`). The state is seen, not said: the kiln's fire
 * burns and brick falls while it makes, rock runs down the chute while it
 * bypasses, and a kiln with nobody on it stands dark. The wall, the hopper
 * and the chute are drawn in code; the kiln and the brick are the game's
 * own sprites (#668, #669).
 *
 * Part 3 (#754): with the saws open the Granite's hopper and the saw stand
 * on the right, as the Topsoil's and the kiln do on the left, and the
 * bypass chute runs down the middle between them, taking what neither
 * maker's pile has room for (the prototype's seventeenth version). With the
 * kilns alone the drawing is as before.
 */

/** A hopper's top and its mouth, in art px. */
type Hopper = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly mouth: number;
};

/** The Topsoil's hopper, over the kilns. */
const HOPPER: Hopper = { left: 22, right: 78, top: 18, mouth: 40 };
/** The Granite's hopper, over the saws: the Topsoil's mirrored. */
const GRANITE_HOPPER: Hopper = { left: 134, right: 190, top: 18, mouth: 40 };
/** The bypass chute's column: at the side with the kilns alone, between the hoppers with the saws. */
type Chute = { readonly left: number; readonly right: number };
const CHUTE: Chute = { left: 132, right: 146 };
const MIDDLE_CHUTE: Chute = { left: 99, right: 113 };
/** Where the kiln stands: under the hopper's mouth. */
const KILN = { x: 18, y: 44 };
/** Where the saw stands: under the Granite's hopper's mouth. */
const SAW = { x: 130, y: 44 };

/** Three-maker layout (#779): Topsoil, Granite, and Crystal hoppers across the wall. */
const THREE_TOPSOIL_HOPPER: Hopper = { left: 8, right: 54, top: 18, mouth: 38 };
const THREE_GRANITE_HOPPER: Hopper = {
  left: 76,
  right: 122,
  top: 18,
  mouth: 38,
};
const THREE_CRYSTAL_HOPPER: Hopper = {
  left: 158,
  right: 204,
  top: 18,
  mouth: 38,
};
const THREE_CHUTE: Chute = { left: 132, right: 146 };
const CRYSTAL_FURNACE = { x: 165, y: 38 };

/** The rock of each level, as it falls and lies in its hopper. */
const TOPSOIL_ROCK = ["#7a5a3a", "#5b3b22", "#8a6a44"] as const;
const GRANITE_ROCK = ["#74808f", "#566170", "#8d99a8"] as const;
const CRYSTAL_ROCK = ["#5ea8b8", "#2d6d7d", "#8cd8e6"] as const;
type Rock = readonly [string, string, string];

type Sprites = Readonly<
  Record<
    | "kiln"
    | "kilnDim"
    | "saw"
    | "sawDim"
    | "glassworks"
    | "brick"
    | "cutStone"
    | "glass"
    | "parts",
    HTMLImageElement
  >
>;

export function loadRefinerySprites(): Sprites {
  return loadImages({
    kiln: kilnUrl,
    kilnDim: kilnDimUrl,
    saw: sawUrl,
    sawDim: sawDimUrl,
    glassworks: PART2_ART.glassworks,
    brick: brickUrl,
    cutStone: cutStoneUrl,
    glass: PART2_ART.glass,
    parts: partsUrl,
  });
}

/** Number of maker columns on the refinery wall: 1 (kilns), 2 (kilns+saws), 3 (+glassworks). */
export type RefineryLayout = 1 | 2 | 3;

/** The chute the bypass runs down for a layout. */
const chuteOf = (layout: RefineryLayout): Chute =>
  layout === 1 ? CHUTE : layout === 2 ? MIDDLE_CHUTE : THREE_CHUTE;

/** A hopper's feed: the column its rock comes down. */
const feedX = (hopper: Hopper): number => (hopper.left + hopper.right) / 2;

const WALL = { brick: "#5a2c22", dark: "#46211a", light: "#6a3528" };
const MORTAR = "#2a1612";

function paintBricks(c: CanvasRenderingContext2D, height: number): void {
  rect(c, 0, 0, SCENE_W, height, MORTAR);
  for (let row = 0; row * 5 < height; row += 1) {
    const offset = row % 2 === 0 ? 0 : 5;
    for (let x = -offset; x < SCENE_W; x += 10) {
      const r = hash(x, row, 60);
      const colour = r < 0.25 ? WALL.dark : r < 0.8 ? WALL.brick : WALL.light;
      rect(c, x + 1, row * 5 + 1, 9, 4, colour);
    }
  }
}

function paintStandardHoppers(
  c: CanvasRenderingContext2D,
  chute: Chute,
  withGranite: boolean,
): void {
  line(
    c,
    [HOPPER.right - 2, HOPPER.top + 6],
    [chute.left, HOPPER.top + 14],
    "#4a4f58",
    2,
  );
  paintHopper(c, HOPPER);
  if (withGranite) {
    line(
      c,
      [chute.right - 2, GRANITE_HOPPER.top + 14],
      [GRANITE_HOPPER.left, GRANITE_HOPPER.top + 6],
      "#4a4f58",
      2,
    );
    paintHopper(c, GRANITE_HOPPER);
  }
}

/**
 * The refinery's wall: brick in running bond, never quite even, with one,
 * two, or three hoppers and the bypass chute.
 */
export function paintWall(
  c: CanvasRenderingContext2D,
  height: number,
  layout: boolean | RefineryLayout = false,
): void {
  const mode: RefineryLayout =
    typeof layout === "boolean" ? (layout ? 2 : 1) : layout;
  paintBricks(c, height);
  const chute = chuteOf(mode);
  paintChute(c, height, chute);
  if (mode === 3) {
    paintHopper(c, THREE_TOPSOIL_HOPPER);
    paintHopper(c, THREE_GRANITE_HOPPER);
    paintHopper(c, THREE_CRYSTAL_HOPPER);
    return;
  }
  paintStandardHoppers(c, chute, mode === 2);
}

/** The bypass chute, from beside the hoppers down to the stockyard. */
function paintChute(
  c: CanvasRenderingContext2D,
  height: number,
  { left, right }: Chute,
): void {
  rect(c, left, HOPPER.top + 6, right - left, height, "#1b1d22");
  rect(c, left, HOPPER.top + 6, 2, height, "#4a4f58");
  rect(c, right - 2, HOPPER.top + 6, 2, height, "#4a4f58");
  for (let y = HOPPER.top + 10; y < height; y += 12) {
    rect(c, left + 2, y, right - left - 4, 1, "#2b2e35");
  }
}

/** A hopper: a funnel of plate, with the feed coming down into it. */
function paintHopper(c: CanvasRenderingContext2D, hopper: Hopper): void {
  const { left, right, top, mouth } = hopper;
  rect(c, feedX(hopper) - 2, 0, 4, top, "#2b2e35");
  for (let y = top; y < mouth; y += 1) {
    const inset = Math.round(((y - top) / (mouth - top)) * 18);
    rect(c, left + inset, y, right - left - 2 * inset, 1, "#3a3e46");
    rect(c, left + inset, y, 2, 1, "#8a929c");
    rect(c, right - inset - 2, y, 2, 1, "#5d646e");
  }
  rect(c, left - 2, top - 2, right - left + 4, 2, "#a3abb5");
}

/** Rock in a hopper, as full as its maker's pile. */
function drawHopperRock(
  c: CanvasRenderingContext2D,
  hopper: Hopper,
  fill: number,
  rock: Rock,
): void {
  const { left, right, top, mouth } = hopper;
  const depth = Math.round((mouth - top - 2) * Math.min(1, fill));
  for (let y = mouth - depth; y < mouth; y += 1) {
    const inset = Math.round(((y - top) / (mouth - top)) * 18) + 2;
    for (let x = left + inset; x < right - inset; x += 1) {
      const r = hash(x, y, 61);
      rect(c, x, y, 1, 1, r < 0.3 ? rock[0] : r < 0.7 ? rock[1] : rock[2]);
    }
  }
}

/** Bits that fall, a column of them moving down with the clock. */
function falling(
  c: CanvasRenderingContext2D,
  x: number,
  from: number,
  to: number,
  t: number,
  colour: string,
  seed: number,
): void {
  const span = Math.max(1, to - from);
  for (let k = 0; k < 4; k += 1) {
    const y = from + ((t * 26 + k * (span / 4)) % span);
    const dx = Math.round(hash(k, seed, 62) * 6) - 3;
    rect(c, x + dx, y, 2, 2, colour);
  }
}

/** A sprite at twice its size: the kiln and the saw are the scene's big machines. */
function twice(
  c: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
): void {
  if (img.complete && img.naturalWidth > 0) {
    c.drawImage(img, x, y, img.naturalWidth * 2, img.naturalHeight * 2);
  }
}

/**
 * Makers in a row, the first in front: up to `most` drawn, each lit while it
 * runs and dim while it does not. `step` is how far each one behind stands
 * to the side.
 */
function drawMakers(
  c: CanvasRenderingContext2D,
  sprites: { readonly lit: HTMLImageElement; readonly dim: HTMLImageElement },
  at: { readonly x: number; readonly y: number },
  row: { readonly owned: number; readonly running: number },
  shape: { readonly most: number; readonly step: number },
): void {
  const shown = Math.min(shape.most, Math.max(1, row.owned));
  for (let k = shown - 1; k >= 0; k -= 1) {
    const lit = row.owned > 0 && k < row.running;
    twice(
      c,
      lit ? sprites.lit : sprites.dim,
      at.x + k * shape.step,
      at.y - k * 4,
    );
  }
}

/**
 * The kilns: up to three drawn, lit while one runs, dim while none does.
 * Beside the saws, two, the second standing out to the wall's side.
 */
function drawKilns(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: RefineryScene,
  t: number,
): void {
  if (scene.making) {
    const flicker = Math.floor(t * 8) % 3;
    glow(c, KILN.x + 32, KILN.y + 44, 22 + flicker, "#7a3a1e", 63 + flicker);
  }
  drawMakers(
    c,
    { lit: sprites.kiln, dim: sprites.kilnDim },
    KILN,
    { owned: scene.kilns, running: scene.running },
    scene.saws === undefined ? { most: 3, step: 22 } : { most: 2, step: -8 },
  );
  if (scene.making) {
    for (let k = 0; k < 3; k += 1) {
      const rise = (t * 6 + k * 7) % 21;
      rect(
        c,
        KILN.x + 26 + Math.round(Math.sin(t + k) * 2),
        KILN.y - 2 - rise,
        2,
        2,
        "#8a8f98",
      );
    }
  }
}

/**
 * The saws (#754): up to two drawn under the Granite's hopper, the second
 * standing out to the wall's side, lit while one runs. While they make, dust
 * flies off the blade and cut stone falls to the stockyard.
 */
function drawSaws(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  saws: NonNullable<RefineryScene["saws"]>,
  t: number,
): void {
  drawMakers(
    c,
    { lit: sprites.saw, dim: sprites.sawDim },
    SAW,
    { owned: saws.saws, running: saws.running },
    { most: 2, step: 8 },
  );
  if (!saws.making) {
    return;
  }
  for (let k = 0; k < 4; k += 1) {
    const a = (t * 2 + k / 4) % 1;
    rect(
      c,
      SAW.x + 26 - a * 14,
      SAW.y + 30 - Math.sin(a * 3) * 8,
      1,
      1,
      "#dfe6ec",
    );
  }
  falling(c, SAW.x + 31, SAW.y + 64, c.canvas.height, t, "#dfe6ec", 4);
}

/** The Granite's side: its rock coming up into its hopper, and the saws under it. */
function drawGraniteSide(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  saws: NonNullable<RefineryScene["saws"]>,
  t: number,
): void {
  drawHopperRock(c, GRANITE_HOPPER, saws.hopper, GRANITE_ROCK);
  if (saws.lifting) {
    const x = feedX(GRANITE_HOPPER) - 1;
    falling(c, x, 0, GRANITE_HOPPER.top, t, GRANITE_ROCK[2], 5);
  }
  drawSaws(c, sprites, saws, t);
}

/** The Crystal Caves Glassworks side (#779): crystal hopper + furnace icon. */
function drawGlassworksSide(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  glassworks: NonNullable<RefineryScene["glassworks"]>,
  t: number,
): void {
  drawHopperRock(c, THREE_CRYSTAL_HOPPER, glassworks.hopper, CRYSTAL_ROCK);
  if (glassworks.lifting) {
    falling(
      c,
      feedX(THREE_CRYSTAL_HOPPER) - 1,
      0,
      THREE_CRYSTAL_HOPPER.top,
      t,
      CRYSTAL_ROCK[2],
      6,
    );
  }
  if (glassworks.making) {
    const flicker = Math.floor(t * 8) % 3;
    glow(
      c,
      CRYSTAL_FURNACE.x + 24,
      CRYSTAL_FURNACE.y + 24,
      18 + flicker,
      "#2e6d7d",
      66 + flicker,
    );
  }
  const running = glassworks.furnaces > 0 && glassworks.running > 0;
  c.save();
  if (!running) {
    c.globalAlpha = 0.45;
  }
  const img = sprites.glassworks;
  if (img.complete && img.naturalWidth > 0) {
    c.drawImage(
      img,
      CRYSTAL_FURNACE.x,
      CRYSTAL_FURNACE.y,
      img.naturalWidth,
      img.naturalHeight,
    );
  }
  c.restore();
  if (glassworks.making) {
    falling(
      c,
      CRYSTAL_FURNACE.x + 28,
      CRYSTAL_FURNACE.y + 46,
      c.canvas.height,
      t,
      "#8cd8e6",
      7,
    );
  }
}

function drawThreeMakerWall(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: RefineryScene,
  t: number,
): void {
  if (scene.saws !== undefined) {
    drawHopperRock(c, THREE_GRANITE_HOPPER, scene.saws.hopper, GRANITE_ROCK);
    if (scene.saws.lifting) {
      falling(
        c,
        feedX(THREE_GRANITE_HOPPER) - 1,
        0,
        THREE_GRANITE_HOPPER.top,
        t,
        GRANITE_ROCK[2],
        5,
      );
    }
  }
  if (scene.glassworks !== undefined) {
    drawGlassworksSide(c, sprites, scene.glassworks, t);
  }
}

/** One frame of the scene's moving parts, over the wall. */
export function drawRefinery(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: RefineryScene,
  t: number,
): void {
  const mode: RefineryLayout =
    scene.glassworks !== undefined ? 3 : scene.saws !== undefined ? 2 : 1;
  const topHopper = mode === 3 ? THREE_TOPSOIL_HOPPER : HOPPER;
  drawHopperRock(c, topHopper, scene.hopper, TOPSOIL_ROCK);
  if (scene.lifting) {
    falling(c, feedX(topHopper) - 1, 0, topHopper.top, t, TOPSOIL_ROCK[2], 1);
  }
  if (mode === 3) {
    drawThreeMakerWall(c, sprites, scene, t);
  } else {
    drawKilns(c, sprites, scene, t);
    if (scene.saws !== undefined) {
      drawGraniteSide(c, sprites, scene.saws, t);
    }
  }
  const height = c.canvas.height;
  if (scene.making && mode !== 3) {
    falling(c, KILN.x + 31, KILN.y + 64, height, t, "#b0502e", 2);
  }
  if (scene.bypassing) {
    const chute = chuteOf(mode);
    falling(c, chute.left + 6, topHopper.top + 14, height, t, "#8f9aa5", 3);
  }
}

/** A bay's width in art px: half the strip for brick and stone, a third with cut stone (#754). */
const baySpan = (count: number): number => SCENE_W / Math.max(2, count);

/** The stockyard's strip: a bay for each of `count` stockpiles, as full as it is. */
export function paintYardGround(
  c: CanvasRenderingContext2D,
  height: number,
  count = 2,
): void {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < SCENE_W; x += 1) {
      const r = hash(x >> 1, y >> 1, 64);
      rect(
        c,
        x,
        y,
        1,
        1,
        r < 0.3 ? "#3a2a1c" : r < 0.8 ? "#4a3624" : "#5b4430",
      );
    }
  }
  for (const x of postsX(count)) {
    rect(c, x, 0, 3, height, "#7a5530");
  }
}

/** The posts between the bays, in art px: one at each end and one between each two. */
function postsX(count: number): readonly number[] {
  const bays = Math.max(2, count);
  const between = Array.from(
    { length: bays - 1 },
    (_, k) => (k + 1) * baySpan(bays) - 1,
  );
  return [0, ...between, SCENE_W - 3];
}

/** A stack of brick or cut stone, row on row, as high as the bay is full. */
function stack(
  c: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  x0: number,
  w: number,
  base: number,
  fill: number,
): void {
  if (fill <= 0) {
    return;
  }
  const rows = Math.max(1, Math.round(fill * 4));
  for (let row = 0; row < rows; row += 1) {
    const count = Math.max(1, Math.floor(w / 12) - row);
    const off = x0 + (w - count * 12) / 2;
    for (let k = 0; k < count; k += 1) {
      frame(c, sprite, 1, 0, [off + k * 12, base - 8 - row * 6]);
    }
  }
}

/** One frame of the stockyard's bays. */
export function drawYard(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  bays: readonly Bay[],
): void {
  const base = c.canvas.height - 2;
  const span = baySpan(bays.length);
  for (const [index, bay] of bays.entries()) {
    const x0 = index * span + 6;
    const w = span - 12;
    if (bay.good === "brick") {
      stack(c, sprites.brick, x0, w, base, bay.fill);
    } else if (bay.good === "cutStone") {
      stack(c, sprites.cutStone, x0, w, base, bay.fill);
    } else if (bay.good === "glass") {
      stack(c, sprites.glass, x0, w, base, bay.fill);
    } else if (bay.good === "parts") {
      stack(c, sprites.parts, x0, w, base, bay.fill);
    } else {
      heap(c, x0, base, w, bay.fill, 65 + index);
    }
  }
}
