import kilnDimUrl from "./assets/board/mach-kiln-dim.png";
import kilnUrl from "./assets/board/mach-kiln.png";
import brickUrl from "./assets/board/res-brick.png";
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
 */

/** The hopper's top and its mouth, and the chute's column, in art px. */
const HOPPER = { left: 22, right: 78, top: 18, mouth: 40 };
const CHUTE = { left: 132, right: 146 };
/** Where the kiln stands: under the hopper's mouth. */
const KILN = { x: 18, y: 44 };

type Sprites = Readonly<Record<"kiln" | "kilnDim" | "brick", HTMLImageElement>>;

export function loadRefinerySprites(): Sprites {
  return loadImages({ kiln: kilnUrl, kilnDim: kilnDimUrl, brick: brickUrl });
}

const WALL = { brick: "#5a2c22", dark: "#46211a", light: "#6a3528" };
const MORTAR = "#2a1612";

/** The refinery's wall: brick in running bond, never quite even. */
export function paintWall(c: CanvasRenderingContext2D, height: number): void {
  rect(c, 0, 0, SCENE_W, height, MORTAR);
  for (let row = 0; row * 5 < height; row += 1) {
    const offset = row % 2 === 0 ? 0 : 5;
    for (let x = -offset; x < SCENE_W; x += 10) {
      const r = hash(x, row, 60);
      const colour = r < 0.25 ? WALL.dark : r < 0.8 ? WALL.brick : WALL.light;
      rect(c, x + 1, row * 5 + 1, 9, 4, colour);
    }
  }
  paintChute(c, height);
  paintHopper(c);
}

/** The middle chute, from the hopper's side down to the stockyard. */
function paintChute(c: CanvasRenderingContext2D, height: number): void {
  const { left, right } = CHUTE;
  rect(c, left, HOPPER.top + 6, right - left, height, "#1b1d22");
  rect(c, left, HOPPER.top + 6, 2, height, "#4a4f58");
  rect(c, right - 2, HOPPER.top + 6, 2, height, "#4a4f58");
  for (let y = HOPPER.top + 10; y < height; y += 12) {
    rect(c, left + 2, y, right - left - 4, 1, "#2b2e35");
  }
  // The overflow from the hopper's side into the chute.
  line(
    c,
    [HOPPER.right - 2, HOPPER.top + 6],
    [left, HOPPER.top + 14],
    "#4a4f58",
    2,
  );
}

/** The hopper: a funnel of plate, with the feed coming down into it. */
function paintHopper(c: CanvasRenderingContext2D): void {
  const { left, right, top, mouth } = HOPPER;
  rect(c, 48, 0, 4, top, "#2b2e35");
  for (let y = top; y < mouth; y += 1) {
    const inset = Math.round(((y - top) / (mouth - top)) * 18);
    rect(c, left + inset, y, right - left - 2 * inset, 1, "#3a3e46");
    rect(c, left + inset, y, 2, 1, "#8a929c");
    rect(c, right - inset - 2, y, 2, 1, "#5d646e");
  }
  rect(c, left - 2, top - 2, right - left + 4, 2, "#a3abb5");
}

/** Rock in the hopper, as full as the kilns' pile. */
function drawHopperRock(c: CanvasRenderingContext2D, fill: number): void {
  const { left, right, top, mouth } = HOPPER;
  const depth = Math.round((mouth - top - 2) * Math.min(1, fill));
  for (let y = mouth - depth; y < mouth; y += 1) {
    const inset = Math.round(((y - top) / (mouth - top)) * 18) + 2;
    for (let x = left + inset; x < right - inset; x += 1) {
      const r = hash(x, y, 61);
      rect(
        c,
        x,
        y,
        1,
        1,
        r < 0.3 ? "#7a5a3a" : r < 0.7 ? "#5b3b22" : "#8a6a44",
      );
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

/** A sprite at twice its size: the kiln is the scene's one big machine. */
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

/** The kilns: up to three drawn, lit while one runs, dim while none does. */
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
  const shown = Math.min(3, Math.max(1, scene.kilns));
  for (let k = shown - 1; k >= 0; k -= 1) {
    const lit = scene.kilns > 0 && k < scene.running;
    twice(
      c,
      lit ? sprites.kiln : sprites.kilnDim,
      KILN.x + k * 22,
      KILN.y - k * 4,
    );
  }
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

/** One frame of the scene's moving parts, over the wall. */
export function drawRefinery(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: RefineryScene,
  t: number,
): void {
  drawHopperRock(c, scene.hopper);
  if (scene.lifting) {
    falling(c, 49, 0, HOPPER.top, t, "#8a6a44", 1);
  }
  drawKilns(c, sprites, scene, t);
  const height = c.canvas.height;
  if (scene.making) {
    falling(c, KILN.x + 31, KILN.y + 64, height, t, "#b0502e", 2);
  }
  if (scene.bypassing) {
    falling(c, CHUTE.left + 6, HOPPER.top + 14, height, t, "#8f9aa5", 3);
  }
}

/** The stockyard's strip: a bay for each stockpile, as full as it is. */
export function paintYardGround(
  c: CanvasRenderingContext2D,
  height: number,
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
  for (const x of [0, SCENE_W / 2 - 1, SCENE_W - 3]) {
    rect(c, x, 0, 3, height, "#7a5530");
  }
}

/** A stack of brick, row on row, as high as the bay is full. */
function brickStack(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
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
      frame(c, sprites.brick, 1, 0, [off + k * 12, base - 8 - row * 6]);
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
  const half = SCENE_W / 2;
  for (const [index, bay] of bays.entries()) {
    const x0 = index * half + 6;
    const w = half - 12;
    if (bay.good === "brick") {
      brickStack(c, sprites, x0, w, base, bay.fill);
    } else {
      heap(c, x0, base, w, bay.fill, 65 + index);
    }
  }
}
