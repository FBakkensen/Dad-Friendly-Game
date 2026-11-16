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
import { legSeconds } from "./cages";
import type { CageSprite, TwoLevelScene } from "./mine-level-view";
import type { MineLevelId } from "./mine-levels";
import type { MineScene, StageScene } from "./mine-view";
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
 * game's own sprites. With two levels (#680, ruling 8) the shaft runs to the
 * Granite's floor, the Granite's gallery lies under the Topsoil's, and every
 * cage rides the shaft where its trip has taken it, with its tub.
 */

/** Where the surface meets the sky. */
const SURF = 40;
/** The Topsoil's top, its gallery's top and its floor, in art px. */
export const LEVEL = { top: SURF, gallery: SURF + 34, floor: SURF + 66 };
/** Where the line under the Topsoil sits, and the zone labels. */
export const DEEP_Y = SURF + 84;

/**
 * The mine with two levels (#680), in art px from a level's top: its two
 * rows sit on the level, its gallery under them, and its two piles' line
 * under its floor. The rows hold − and + at the 48px every key has, 8px
 * apart (#719): 24, 4 and 24 art px. So a level is taller than the
 * prototype's 79, and its gallery 27 high, not the one level's 32, so both
 * levels and the hoisting under them fit the phone without a scroll. The
 * site's DOM and the scene both place a level here.
 */
export const LEVELS = {
  height: 86,
  rows: 0,
  gallery: 52,
  floor: 79,
  piles: 79,
} as const;

/** A level's top with two levels: the Topsoil's (0) at the surface, the Granite's (1) under it. */
export function levelTop(index: number): number {
  return SURF + index * LEVELS.height;
}

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
/** The Granite's earth, under the Topsoil once the shaft is sunk (the prototype's). */
const GRANITE: Earth = {
  base: "#3f4755",
  dark: "#333a47",
  light: "#4c5666",
  pale: "#74808f",
};
/** The strata under the last level: not yet surveyed, so not named. */
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

/** How many levels the mine shows: the Topsoil, or the Topsoil and the Granite. */
export type LevelCount = 1 | 2;

/** The earth at a row: the Topsoil's, the Granite's with two levels, then the unsurveyed strata. */
function earthOf(y: number, levels: LevelCount): Earth {
  if (levels === 1) {
    return y < LEVEL.floor + 10 ? TOPSOIL : DEEPER;
  }
  if (y < levelTop(1)) {
    return TOPSOIL;
  }
  return y < levelTop(2) ? GRANITE : DEEPER;
}

function paintEarth(
  c: CanvasRenderingContext2D,
  height: number,
  levels: LevelCount,
): void {
  for (let y = SURF; y < height; y += 1) {
    for (let x = 0; x < SCENE_W; x += 1) {
      const wobble = Math.round(
        2 * Math.sin(x / 11) + 1.5 * Math.sin(x / 5 + 2),
      );
      rect(c, x, y, 1, 1, earthAt(earthOf(y - wobble, levels), x, y));
    }
  }
  for (let x = 0; x < SCENE_W; x += 1) {
    rect(c, x, SURF - 1, 1, 2, hash(x, 0, 4) < 0.5 ? "#3d5a2e" : "#2c4423");
    if (hash(x, 1, 4) < 0.25) {
      rect(c, x, SURF - 2, 1, 1, "#4d6e38");
    }
  }
}

/** The shaft from the surface down to `bottom`, the last level's floor. */
function paintShaft(c: CanvasRenderingContext2D, bottom: number): void {
  const depth = bottom - SURF + 1;
  rect(c, 14, SURF - 1, 22, depth, "#0f0c0a");
  rect(c, 14, SURF - 1, 2, depth, "#6b4a2a");
  rect(c, 34, SURF - 1, 2, depth, "#6b4a2a");
  for (let y = SURF + 4; y < bottom; y += 9) {
    rect(c, 16, y, 18, 1, "#2a1d12");
  }
}

/**
 * Where a level is drawn: its gallery's top and its floor in art px, its
 * place (0 the Topsoil), which seeds its look, and where a waiting worker's
 * "z" goes from his top left: over his head, or beside it in a gallery too
 * low for that (two levels).
 */
type Floor = {
  readonly gallery: number;
  readonly floor: number;
  readonly index: number;
  readonly zed: readonly [number, number];
};

/** The Topsoil with one level. */
const ONE_LEVEL: Floor = {
  gallery: LEVEL.gallery,
  floor: LEVEL.floor,
  index: 0,
  zed: [8, -6],
};

/** A level's floor with two levels: the Topsoil's (0) and the Granite's (1). */
function levelFloor(index: number): Floor {
  return {
    gallery: levelTop(index) + LEVELS.gallery,
    floor: levelTop(index) + LEVELS.floor,
    index,
    zed: [10, -2],
  };
}

/** A gallery's own colours: the Topsoil's warm, the Granite's cold (the prototype's). */
const GALLERY_LOOK = [
  {
    earth: TOPSOIL,
    dark: "#1a120d",
    back: "#2c1f15",
    grain: "#35261a",
    lamp: "#5a3d1e",
  },
  {
    earth: GRANITE,
    dark: "#12151b",
    back: "#1f2630",
    grain: "#262e3a",
    lamp: "#3b4a5c",
  },
] as const;

/** A level's gallery: its timbers, its lamps, its rail and its face. */
function paintGallery(c: CanvasRenderingContext2D, at: Floor): void {
  const { gallery: top, floor, index } = at;
  const look = GALLERY_LOOK[index] ?? GALLERY_LOOK[0];
  const high = floor - top;
  rect(c, 34, top, 168, high, look.dark);
  rect(c, 36, top + 3, 166, high - 10, look.back);
  for (let y = top + 3; y < top + high - 7; y += 1) {
    for (let x = 36; x < 202; x += 1) {
      if (hash(x >> 1, y >> 1, 20 + index) < 0.3) {
        rect(c, x, y, 1, 1, look.grain);
      }
    }
  }
  for (let k = 0; k < 4; k += 1) {
    const lx = 57 + k * 34;
    glow(c, lx, top + 12, 16, look.lamp, 30 + k);
    glow(c, lx, top + 8, 8, "#c98a3a", 40 + k);
    rect(c, lx, top + 2, 1, 4, "#2a1d12");
    rect(c, lx - 1, top + 6, 3, 3, "#ffcf6a");
    rect(c, lx, top + 7, 1, 1, "#fff3c4");
  }
  for (let k = 0; k <= 4; k += 1) {
    const px = 38 + k * 34;
    rect(c, px, top, 2, high - 1, "#7a5530");
    rect(c, px + 2, top, 1, high - 1, "#4d351d");
  }
  rect(c, 36, top, 166, 2, "#6b4a2a");
  rect(c, 36, top + 2, 166, 1, "#3a2817");
  rect(c, 36, floor - 1, 166, 1, "#0c0a08");
  for (let x = 36; x < 202; x += 4) {
    rect(c, x, floor - 2, 2, 1, "#4a3420");
  }
  rect(c, 36, floor - 3, 166, 1, "#9aa1ab");
  for (let y = top; y < floor; y += 1) {
    const w = 1 + Math.floor(hash(1, y, 50 + index) * 4);
    rect(c, 202 - w, y, w + 1, 1, look.earth.light);
    if (hash(2, y, 51 + index) < 0.3) {
      rect(c, 201 - w, y, 1, 1, look.earth.pale);
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

/** The still parts of the scene, painted once for a height and a count of levels. */
export function paintGround(
  c: CanvasRenderingContext2D,
  height: number,
  levels: LevelCount = 1,
): void {
  paintSky(c, SURF);
  paintEarth(c, height, levels);
  if (levels === 1) {
    paintShaft(c, LEVEL.floor);
    paintGallery(c, ONE_LEVEL);
  } else {
    paintShaft(c, levelFloor(1).floor);
    paintGallery(c, levelFloor(0));
    paintGallery(c, levelFloor(1));
  }
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

/** What moves on a level between frames: its piles ease toward their state, its tubs roll. */
type LevelMotion = { facePile: number; shaftPile: number; tubs: number };

/** What moves between frames: each level's piles and tubs, the sheave, and the cages' depths. */
export type Motion = {
  readonly levels: Record<MineLevelId, LevelMotion>;
  wheel: number;
  last: number;
  /** The cages' depths as drawn, shallowest first: they ride toward the trips' depths. */
  cages: number[];
};

const startLevel = (): LevelMotion => ({
  facePile: 0.5,
  shaftPile: 0.5,
  tubs: 0,
});

export function startMotion(): Motion {
  return {
    levels: { topsoil: startLevel(), granite: startLevel() },
    wheel: 0,
    last: 0,
    cages: [],
  };
}

/** A stage's workers in the scene: how many, and the share of the time they work. */
type Crew = Pick<StageScene, "workers" | "busy">;

/** A stage's workers in their zone on a level: those who wait stand with a "z" over them. */
function drawCrew(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  stage: Stage,
  crew: Crew,
  at: { readonly floor: Floor; readonly moving: boolean; readonly t: number },
): void {
  const { floor, moving, t } = at;
  const i = floor.index;
  const zone = ZONES[stage];
  const drawn = Math.min(zone.most, crew.workers);
  const waiting = moving ? Math.round(drawn * (1 - crew.busy)) : drawn;
  for (let j = 0; j < drawn; j += 1) {
    // Nobody waits beside a machine: the waiting take the zone's far
    // slots, the working ones the slots by its machines.
    const waits = j < waiting;
    const k = waits ? j : zone.most - 1 - (j - waiting);
    const slot = zone.wait === "start" ? k : zone.most - 1 - k;
    const x = zone.x + slot * zone.gap;
    const y = floor.floor - 24;
    if (waits) {
      frame(c, sprites.miner, 18, 14, [x, y], stage === "lift");
      zed(
        c,
        x + floor.zed[0],
        y + floor.zed[1] - (Math.floor(t * 2 + j + i) % 2),
      );
      continue;
    }
    const phase = t * 1.3 + j * 2.1 + i;
    const step = Math.floor(t * 9 + j * 5 + i * 3) % 18;
    const flip = stage === "lift" || (stage === "haul" && Math.cos(phase) < 0);
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
  hangCage(c, sprites, y, !still && rising);
}

/** A cage on its rope at `y`, with a full tub or an empty one. */
function hangCage(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  y: number,
  loaded: boolean,
): void {
  line(c, [25, 14], [25, y], "#1a1a1a");
  frame(c, sprites.cage, 1, 0, [15, y]);
  if (loaded) {
    frame(c, sprites.tubFull, 1, 0, [18, y + 8]);
  } else {
    frame(c, sprites.tubEmpty, 1, 0, [18, y + 11]);
  }
}

/** What a level draws: its drilling and haulage, its piles and its tubs, and whether its line moves. */
type LevelLook = Pick<
  MineScene,
  "moving" | "facePile" | "shaftPile" | "load" | "unload"
> & { readonly face: StageScene; readonly haul: StageScene };

/** The tubs on a level's rail: some run empty, and they stop while the shaft cannot take them. */
function drawTubs(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  look: LevelLook,
  motion: LevelMotion,
  at: { readonly floor: Floor; readonly t: number; readonly dt: number },
): void {
  const { haul } = look;
  const { floor, t, dt } = at;
  if (haul.workers === 0 && haul.owned === 0) {
    return;
  }
  const rolls =
    look.moving && (look.unload > 0.999 || (t / 4) % 1 < look.unload);
  if (rolls) {
    motion.tubs += 16 * dt;
  }
  // Carts that do not run wait at the shaft end of the rail, empty, with nobody beside them.
  const parked = Math.min(2, haul.owned - haul.running);
  for (let k = 0; k < parked; k += 1) {
    frame(c, sprites.tubEmpty, 1, 0, [57 + k * 15, floor.floor - 15]);
  }
  const gap = 40 - 4 * Math.min(4, haul.running);
  const offset = motion.tubs % gap;
  const first = Math.floor(motion.tubs / gap);
  const end = 56 + parked * 15;
  for (let x = 132 - offset, j = 0; x > end; x -= gap, j += 1) {
    const full = hash(first - j, floor.index, 91) < look.load;
    frame(c, full ? sprites.tubFull : sprites.tubEmpty, 1, 0, [
      x,
      floor.floor - (full ? 18 : 15),
    ]);
  }
}

/** The drill at a level's end: it works while drilling works, and stands when none runs. */
function drawDrill(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  look: LevelLook,
  at: { readonly floor: Floor; readonly t: number },
): void {
  const { face } = look;
  const { floor, t } = at;
  if (face.owned === 0) {
    return;
  }
  const i = floor.index;
  const works =
    face.running > 0 &&
    look.moving &&
    (face.busy > 0.999 || (t / 5 + i * 0.5) % 1 < face.busy);
  const x = 180;
  frame(c, sprites.drill, 4, works ? Math.floor(t * 8) % 4 : 0, [
    x,
    floor.floor - 18,
  ]);
  if (works) {
    frame(c, sprites.dust, 4, Math.floor(t * 6 + i * 2) % 4, [
      x + 10,
      floor.floor - 26,
    ]);
  }
}

/** A level's moving parts: haulage's and drilling's workers, the tubs, the heaps, the drill. */
function drawLevel(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  look: LevelLook,
  motion: LevelMotion,
  at: { readonly floor: Floor; readonly t: number; readonly dt: number },
): void {
  const { floor, t } = at;
  motion.facePile += (look.facePile - motion.facePile) * 0.05;
  motion.shaftPile += (look.shaftPile - motion.shaftPile) * 0.05;
  for (const stage of ["haul", "face"] as const) {
    drawCrew(c, sprites, stage, look[stage], { floor, moving: look.moving, t });
  }
  drawTubs(c, sprites, look, motion, at);
  heap(c, 134, floor.floor - 3, 18, motion.facePile, 70 + floor.index);
  heap(c, 37, floor.floor - 3, 16, motion.shaftPile, 80 + floor.index);
  drawDrill(c, sprites, look, at);
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

/** The one-level mine's moving parts, as it has always drawn them. */
function drawOneLevel(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: MineScene,
  motion: Motion,
  clock: { readonly t: number; readonly dt: number },
): void {
  const { t } = clock;
  const at = { floor: ONE_LEVEL, t, dt: clock.dt };
  drawHoists(c, sprites, scene);
  drawCage(c, sprites, scene, motion, t);
  drawCrew(c, sprites, "lift", scene.stages.lift, {
    floor: ONE_LEVEL,
    moving: scene.moving,
    t,
  });
  drawLevel(
    c,
    sprites,
    { ...scene, face: scene.stages.face, haul: scene.stages.haul },
    motion.levels.topsoil,
    at,
  );
}

/** Where a cage hangs at a depth: 0 at the top, 1 at the Topsoil's floor, 2 at the Granite's. */
function cageY(depth: number): number {
  const top = SURF - 26;
  const first = levelFloor(0).floor - 26;
  const second = levelFloor(1).floor - 26;
  return depth <= 1
    ? top + (first - top) * depth
    : first + (second - first) * (depth - 1);
}

/** The fastest a cage rides, in levels a second: a level's depth over its leg down. */
function cageSpeed(): number {
  return Math.max(
    1 / legSeconds("topsoil", "down"),
    2 / legSeconds("granite", "down"),
  );
}

/**
 * The drawn depths for a new count of cages: the cages at the top merge and
 * split, so the drawn ones are matched to the targets deepest first and a
 * cage below keeps riding; a target with none drawn is put at once.
 */
export function alignDeepest(
  drawn: readonly number[],
  targets: readonly number[],
): number[] {
  const offset = drawn.length - targets.length;
  return targets.map((target, k) => drawn[k + offset] ?? target);
}

/**
 * The cages' depths as drawn, ridden toward the trips' depths: the trips
 * step once a second, and the cages ride between at a cage's speed. Drawn
 * and target are matched shallowest first, as cages in one shaft look
 * alike; a cage too far behind is put at once.
 */
function rideCages(
  motion: Motion,
  cages: readonly CageSprite[],
  dt: number,
): boolean {
  const targets = cages.map((cage) => cage.depth).sort((a, b) => a - b);
  if (motion.cages.length !== targets.length) {
    // Cages merge and split at the top: those below keep their place, matched deepest first.
    motion.cages = alignDeepest(motion.cages, targets);
  }
  const step = cageSpeed() * 1.25 * dt;
  let moved = false;
  motion.cages = motion.cages.map((drawn, k) => {
    const target = targets[k] ?? drawn;
    const gap = target - drawn;
    if (Math.abs(gap) > 0.5) {
      return target;
    }
    const next = drawn + Math.sign(gap) * Math.min(Math.abs(gap), step);
    moved ||= next !== drawn;
    return next;
  });
  return moved;
}

/** Every cage on its rope at its depth with its tub, the sheave turning while one rides. */
function drawCages(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: TwoLevelScene,
  motion: Motion,
  dt: number,
): void {
  if (rideCages(motion, scene.cages, dt)) {
    motion.wheel += 1;
  }
  frame(c, sprites.sheave, 4, Math.floor(motion.wheel / 2) % 4, [16, 0]);
  const loads = [...scene.cages].sort((a, b) => a.depth - b.depth);
  for (const [k, depth] of motion.cages.entries()) {
    hangCage(c, sprites, cageY(depth), loads[k]?.loaded ?? false);
  }
}

/** The two levels' moving parts (ruling 8): the cages, hoisting's workers by the shaft, and each level's line. */
function drawTwoLevels(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: TwoLevelScene,
  motion: Motion,
  clock: { readonly t: number; readonly dt: number },
): void {
  const { t, dt } = clock;
  drawCages(c, sprites, scene, motion, dt);
  drawCrew(c, sprites, "lift", scene.hoisting, {
    floor: levelFloor(0),
    moving: true,
    t,
  });
  for (const [index, id] of (["topsoil", "granite"] as const).entries()) {
    const level = scene.levels[id];
    drawLevel(
      c,
      sprites,
      { ...level, moving: level.face.busy > 0 || level.haul.busy > 0 },
      motion.levels[id],
      { floor: levelFloor(index), t, dt },
    );
  }
}

/** How many levels a scene draws. */
export function levelsOf(scene: MineScene | TwoLevelScene): LevelCount {
  return "levels" in scene ? 2 : 1;
}

/** One frame of the scene's moving parts, over the ground. */
export function drawMine(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: MineScene | TwoLevelScene,
  motion: Motion,
  t: number,
): void {
  const dt = Math.min(0.2, Math.max(0, t - motion.last));
  motion.last = t;
  if ("levels" in scene) {
    drawTwoLevels(c, sprites, scene, motion, { t, dt });
  } else {
    drawOneLevel(c, sprites, scene, motion, { t, dt });
  }
}
