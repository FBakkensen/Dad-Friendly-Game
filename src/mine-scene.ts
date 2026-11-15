import cageUrl from "./assets/board/cage.png";
import drillUrl from "./assets/board/drill-work-4f.png";
import dustUrl from "./assets/board/dust-burst-4f.png";
import hoistDimUrl from "./assets/board/mach-hoist-dim.png";
import hoistUrl from "./assets/board/mach-hoist.png";
import minerUrl from "./assets/board/miner-18f.png";
import sheaveUrl from "./assets/board/sheave-4f.png";
import tubEmptyUrl from "./assets/board/tub-empty.png";
import tubFullUrl from "./assets/board/tub-full.png";
import type { Stage } from "./line";
import type { MineScene } from "./mine-view";
import {
  SCENE_W,
  frame,
  glow,
  hash,
  heap,
  line,
  loadImages,
  paintSky,
  rect,
  zed,
} from "./scene-paint";

/**
 * The mine's scene (#660; spec, The mine): the mountain cut open, drawn on a
 * canvas in art px (one art px is two board px). The winding tower stands on
 * the surface, the shaft runs down the left, and the Topsoil's gallery has a
 * part for each stage: hoisting at the shaft, haulage on the rail, drilling
 * at the face. The state is seen, not said: rock piles where it waits, tubs
 * run empty or queue, the cage waits, and workers with nothing to do stand
 * with a "z" over them. The ground, the shaft and the gallery are drawn in
 * code; the workers, the cage, the tubs, the drill and the sheave are the
 * game's own sprites.
 */

/** Where the surface meets the sky. */
const SURF = 40;
/** The Topsoil's top, its gallery's top and its floor, in art px. */
export const LEVEL = { top: SURF, gallery: SURF + 34, floor: SURF + 66 };
/** Where the line under the Topsoil sits, and the zone labels. */
export const DEEP_Y = SURF + 84;

type Earth = {
  readonly base: string;
  readonly dark: string;
  readonly light: string;
  readonly pale: string;
};

const TOPSOIL: Earth = {
  base: "#5b3b22",
  dark: "#4a2f1b",
  light: "#6d4a2b",
  pale: "#8a6a44",
};
/** The strata under the Topsoil: not yet surveyed, so not named. */
const DEEPER: Earth = {
  base: "#2a2f3b",
  dark: "#232733",
  light: "#323846",
  pale: "#4a5262",
};

function earthAt(earth: Earth, x: number, y: number): string {
  const r = hash(x >> 1, y >> 1, 7);
  const q = hash(x, y, 8);
  if (r < 0.06) {
    return earth.pale;
  }
  if (r < 0.3 || (y % 11 === 0 && hash(x >> 2, y, 3) < 0.6)) {
    return earth.dark;
  }
  return r < 0.5 || q < 0.05 ? earth.light : earth.base;
}

function paintEarth(c: CanvasRenderingContext2D, height: number): void {
  for (let y = SURF; y < height; y += 1) {
    for (let x = 0; x < SCENE_W; x += 1) {
      const wobble = Math.round(
        2 * Math.sin(x / 11) + 1.5 * Math.sin(x / 5 + 2),
      );
      const earth = y < LEVEL.floor + 10 + wobble ? TOPSOIL : DEEPER;
      rect(c, x, y, 1, 1, earthAt(earth, x, y));
    }
  }
  for (let x = 0; x < SCENE_W; x += 1) {
    rect(c, x, SURF - 1, 1, 2, hash(x, 0, 4) < 0.5 ? "#3d5a2e" : "#2c4423");
    if (hash(x, 1, 4) < 0.25) {
      rect(c, x, SURF - 2, 1, 1, "#4d6e38");
    }
  }
}

function paintShaft(c: CanvasRenderingContext2D): void {
  const depth = LEVEL.floor - SURF + 1;
  rect(c, 14, SURF - 1, 22, depth, "#0f0c0a");
  rect(c, 14, SURF - 1, 2, depth, "#6b4a2a");
  rect(c, 34, SURF - 1, 2, depth, "#6b4a2a");
  for (let y = SURF + 4; y < LEVEL.floor; y += 9) {
    rect(c, 16, y, 18, 1, "#2a1d12");
  }
}

/** The Topsoil's gallery: its timbers, its lamps, its rail and its face. */
function paintGallery(c: CanvasRenderingContext2D): void {
  const { gallery: top, floor } = LEVEL;
  rect(c, 34, top, 168, 32, "#1a120d");
  rect(c, 36, top + 3, 166, 22, "#2c1f15");
  for (let y = top + 3; y < top + 25; y += 1) {
    for (let x = 36; x < 202; x += 1) {
      if (hash(x >> 1, y >> 1, 20) < 0.3) {
        rect(c, x, y, 1, 1, "#35261a");
      }
    }
  }
  for (let k = 0; k < 4; k += 1) {
    const lx = 57 + k * 34;
    glow(c, lx, top + 12, 16, "#5a3d1e", 30 + k);
    glow(c, lx, top + 8, 8, "#c98a3a", 40 + k);
    rect(c, lx, top + 2, 1, 4, "#2a1d12");
    rect(c, lx - 1, top + 6, 3, 3, "#ffcf6a");
    rect(c, lx, top + 7, 1, 1, "#fff3c4");
  }
  for (let k = 0; k <= 4; k += 1) {
    const px = 38 + k * 34;
    rect(c, px, top, 2, 31, "#7a5530");
    rect(c, px + 2, top, 1, 31, "#4d351d");
  }
  rect(c, 36, top, 166, 2, "#6b4a2a");
  rect(c, 36, top + 2, 166, 1, "#3a2817");
  rect(c, 36, floor - 1, 166, 1, "#0c0a08");
  for (let x = 36; x < 202; x += 4) {
    rect(c, x, floor - 2, 2, 1, "#4a3420");
  }
  rect(c, 36, floor - 3, 166, 1, "#9aa1ab");
  for (let y = top; y < floor; y += 1) {
    const w = 1 + Math.floor(hash(1, y, 50) * 4);
    rect(c, 202 - w, y, w + 1, 1, TOPSOIL.light);
    if (hash(2, y, 51) < 0.3) {
      rect(c, 201 - w, y, 1, 1, TOPSOIL.pale);
    }
  }
}

/** The headframe over the shaft and the winding house beside it. */
function paintHeadframe(c: CanvasRenderingContext2D): void {
  line(c, [11, SURF - 2], [21, 10], "#7a5530", 2);
  line(c, [37, SURF - 2], [28, 10], "#7a5530", 2);
  rect(c, 19, 9, 13, 2, "#7a5530");
  rect(c, 14, 26, 22, 1, "#5a3d22");
  rect(c, 17, 18, 16, 1, "#5a3d22");
  line(c, [15, 26], [32, 18], "#5a3d22");
  line(c, [35, 26], [18, 18], "#5a3d22");
  rect(c, 52, 24, 30, SURF - 26, "#4a3323");
  rect(c, 52, 24, 30, 1, "#2a1d12");
  for (let i = 0; i < 7; i += 1) {
    rect(c, 50 + i, 23 - i, 34 - i * 2, 1, "#33241a");
  }
  rect(c, 76, 12, 4, 8, "#3a2a22");
  rect(c, 58, 28, 6, 6, "#ffcf6a");
  rect(c, 60, 28, 1, 6, "#8a5a1e");
  rect(c, 70, 28, 6, 10, "#2a1d12");
  glow(c, 61, 31, 10, "#c98a3a", 60);
  line(c, [31, 6], [52, 22], "#1a1a1a");
}

/** The still parts of the scene, painted once for a height. */
export function paintGround(c: CanvasRenderingContext2D, height: number): void {
  paintSky(c, SURF);
  paintEarth(c, height);
  paintShaft(c);
  paintGallery(c);
  paintHeadframe(c);
}

/** The scene's sprites, loaded once. */
export type Sprites = Readonly<Record<SpriteId, HTMLImageElement>>;

const SPRITE_URLS = {
  cage: cageUrl,
  drill: drillUrl,
  dust: dustUrl,
  hoist: hoistUrl,
  hoistDim: hoistDimUrl,
  miner: minerUrl,
  sheave: sheaveUrl,
  tubEmpty: tubEmptyUrl,
  tubFull: tubFullUrl,
} as const;

type SpriteId = keyof typeof SPRITE_URLS;

export function loadSprites(): Sprites {
  return loadImages(SPRITE_URLS);
}

/** Where each stage's workers stand: hoisting at the shaft, haulage on the rail, drilling at the face. */
const ZONES: Readonly<
  Record<
    Stage,
    {
      readonly x: number;
      readonly gap: number;
      readonly most: number;
      readonly sway: number;
      /** The side whose slots the waiting workers take: away from the stage's machines. */
      readonly wait: "start" | "end";
    }
  >
> = {
  lift: { x: 38, gap: 9, most: 3, sway: 1, wait: "start" },
  haul: { x: 70, gap: 15, most: 4, sway: 5, wait: "end" },
  face: { x: 144, gap: 8, most: 4, sway: 1, wait: "start" },
};

/** What moves between frames: the piles ease toward their state, the tubs roll. */
export type Motion = {
  facePile: number;
  shaftPile: number;
  tubs: number;
  wheel: number;
  last: number;
};

export function startMotion(): Motion {
  return { facePile: 0.5, shaftPile: 0.5, tubs: 0, wheel: 0, last: 0 };
}

function drawWorkers(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: MineScene,
  t: number,
): void {
  for (const stage of ["lift", "haul", "face"] as const) {
    const zone = ZONES[stage];
    const on = scene.stages[stage];
    const drawn = Math.min(zone.most, on.workers);
    const waiting = scene.moving ? Math.round(drawn * (1 - on.busy)) : drawn;
    for (let j = 0; j < drawn; j += 1) {
      // Nobody waits beside a machine: the waiting take the zone's far
      // slots, the working ones the slots by its machines.
      const waits = j < waiting;
      const k = waits ? j : zone.most - 1 - (j - waiting);
      const slot = zone.wait === "start" ? k : zone.most - 1 - k;
      const x = zone.x + slot * zone.gap;
      const y = LEVEL.floor - 24;
      if (waits) {
        frame(c, sprites.miner, 18, 14, [x, y], stage === "lift");
        zed(c, x + 8, y - 6 - (Math.floor(t * 2 + j) % 2));
        continue;
      }
      const phase = t * 1.3 + j * 2.1;
      const step = Math.floor(t * 9 + j * 5) % 18;
      const flip =
        stage === "lift" || (stage === "haul" && Math.cos(phase) < 0);
      frame(
        c,
        sprites.miner,
        18,
        step,
        [x + Math.sin(phase) * zone.sway, y],
        flip,
      );
    }
  }
}

/** The cage: it rides the shaft, and waits at the bottom while hoisting has room to spare. */
function drawCage(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: MineScene,
  motion: Motion,
  t: number,
): void {
  const busy = scene.moving ? scene.stages.lift.busy : 0;
  const wait =
    busy > 0.999 ? 0 : Math.min(14, (6 * (1 - busy)) / Math.max(busy, 0.05));
  const tau = t % (6 + wait);
  const rising = tau >= 3 + wait;
  const still = busy <= 0 || (tau >= 3 && !rising);
  const u =
    busy <= 0 ? 1 : tau < 3 ? tau / 3 : rising ? 1 - (tau - 3 - wait) / 3 : 1;
  if (!still) {
    motion.wheel += 1;
  }
  frame(c, sprites.sheave, 4, Math.floor(motion.wheel / 2) % 4, [16, 0]);
  const top = SURF - 26;
  const bottom = LEVEL.floor - 26;
  const y = top + (bottom - top) * (0.5 - 0.5 * Math.cos(u * Math.PI));
  line(c, [25, 14], [25, y], "#1a1a1a");
  frame(c, sprites.cage, 1, 0, [15, y]);
  if (!still && rising) {
    frame(c, sprites.tubFull, 1, 0, [18, y + 8]);
  } else {
    frame(c, sprites.tubEmpty, 1, 0, [18, y + 11]);
  }
}

/** The tubs on the rail: some run empty, and they stop while the shaft cannot take them. */
function drawTubs(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: MineScene,
  motion: Motion,
  t: number,
  dt: number,
): void {
  const haul = scene.stages.haul;
  if (haul.workers === 0 && haul.owned === 0) {
    return;
  }
  const rolls =
    scene.moving && (scene.unload > 0.999 || (t / 4) % 1 < scene.unload);
  if (rolls) {
    motion.tubs += 16 * dt;
  }
  // Carts that do not run wait at the shaft end of the rail, empty, with nobody beside them.
  const parked = Math.min(2, haul.owned - haul.running);
  for (let k = 0; k < parked; k += 1) {
    frame(c, sprites.tubEmpty, 1, 0, [57 + k * 15, LEVEL.floor - 15]);
  }
  const gap = 40 - 4 * Math.min(4, haul.running);
  const offset = motion.tubs % gap;
  const first = Math.floor(motion.tubs / gap);
  const end = 56 + parked * 15;
  for (let x = 132 - offset, j = 0; x > end; x -= gap, j += 1) {
    const full = hash(first - j, 0, 91) < scene.load;
    frame(c, full ? sprites.tubFull : sprites.tubEmpty, 1, 0, [
      x,
      LEVEL.floor - (full ? 18 : 15),
    ]);
  }
}

/** The drill at the face: it works while drilling works, and stands when none runs. */
function drawDrill(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: MineScene,
  t: number,
): void {
  const face = scene.stages.face;
  if (face.owned === 0) {
    return;
  }
  const works =
    face.running > 0 &&
    scene.moving &&
    (face.busy > 0.999 || (t / 5) % 1 < face.busy);
  const x = 180;
  frame(c, sprites.drill, 4, works ? Math.floor(t * 8) % 4 : 0, [
    x,
    LEVEL.floor - 18,
  ]);
  if (works) {
    frame(c, sprites.dust, 4, Math.floor(t * 6) % 4, [
      x + 10,
      LEVEL.floor - 26,
    ]);
  }
}

/** The hoists, on the surface beside the headframe: lit while they run, dim while they stand. */
function drawHoists(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: MineScene,
): void {
  const lift = scene.stages.lift;
  for (let k = 0; k < Math.min(3, lift.owned); k += 1) {
    const runs = k < lift.running;
    frame(c, runs ? sprites.hoist : sprites.hoistDim, 1, 0, [
      88 + k * 30,
      SURF - 32,
    ]);
  }
}

/** One frame of the scene's moving parts, over the ground. */
export function drawMine(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: MineScene,
  motion: Motion,
  t: number,
): void {
  const dt = Math.min(0.2, Math.max(0, t - motion.last));
  motion.last = t;
  motion.facePile += (scene.facePile - motion.facePile) * 0.05;
  motion.shaftPile += (scene.shaftPile - motion.shaftPile) * 0.05;
  drawHoists(c, sprites, scene);
  drawCage(c, sprites, scene, motion, t);
  drawWorkers(c, sprites, scene, t);
  drawTubs(c, sprites, scene, motion, t, dt);
  heap(c, 134, LEVEL.floor - 3, 18, motion.facePile, 70);
  heap(c, 37, LEVEL.floor - 3, 16, motion.shaftPile, 80);
  drawDrill(c, sprites, scene, t);
}
