import minerUrl from "./assets/board/miner-18f.png";
import wagonUrl from "./assets/city/horse-wagon.png";
import towerUrl from "./assets/city/light-tower.png";
import warehouseUrl from "./assets/city/warehouse.png";
import type { BuildingId } from "./city";
import type { CityScene, Plot } from "./city-view";
import {
  SCENE_W,
  frame,
  glow,
  hash,
  heap,
  loadImages,
  paintSky,
  rect,
  zed,
} from "./scene-paint";

/**
 * The city's scene (#662; spec, The city): the skyline at night with a plot
 * for each building, the road in front, and the building in hand rising from
 * its own picture behind scaffold. What is on the site lies beside it, the
 * builders work at it, and the wagons drive along the road to it, as full as
 * transport brings, or stand. The sky, the ground, the road, the scaffold
 * and a plot's stakes are drawn in code; the Light Tower, the horse wagon
 * and the builders are the game's own pictures.
 */

/**
 * What lies under the road, from the foot up, in art px: the project's card,
 * the plots' tags and the road. The page sets the same rows (city-site).
 */
export const CITY_FOOT = { card: 88, tags: 15, road: 11 } as const;

/** Where the ground meets the sky, for a scene `height` art px tall. */
function groundY(height: number): number {
  return height - 2 - CITY_FOOT.card - CITY_FOOT.tags - CITY_FOOT.road;
}

/** The three plots, left to right, in art px: where each starts and its width. */
export const PLOT_SPANS: readonly { readonly x: number; readonly w: number }[] =
  [
    { x: 4, w: 88 },
    { x: 96, w: 56 },
    { x: 154, w: 54 },
  ];

/**
 * Where each plot's building stands, in art px from the scene's left: the
 * Light Tower 6 into the first plot, and the Warehouse 5 into the second, so
 * its 46-wide picture and its scaffold fit the 56-wide plot (#672).
 */
const BUILDING_INSETS: readonly number[] = [6, 5, 6];

export function buildingX(plot: number): number {
  return (PLOT_SPANS[plot]?.x ?? 0) + (BUILDING_INSETS[plot] ?? 6);
}

/**
 * The yard of the building in hand, in art px: where its builders stand and
 * where its goods lie, which is where the wagons stop. The first plot has room beside the Light Tower. The
 * second has none beside the Warehouse, so its yard is to its left, on the
 * first plot's free ground beside the Light Tower, operational by then
 * (#672; docs/ART.md, the Warehouse). The third plot's yard comes with part 3.
 */
const SITE_YARDS: readonly {
  readonly builders: number;
  readonly heap: number;
}[] = [
  { builders: 46, heap: 74 },
  { builders: 62, heap: 44 },
];

export function siteYard(plot: number): {
  readonly builders: number;
  readonly heap: number;
} {
  return SITE_YARDS[plot] ?? SITE_YARDS[0] ?? { builders: 0, heap: 0 };
}

/** The buildings drawn: the Light Tower (#662) and the Warehouse (#672). */
const BUILDING_URLS = {
  lightTower: towerUrl,
  warehouse: warehouseUrl,
} as const satisfies Partial<Record<BuildingId, string>>;

function drawnBuilding(id: BuildingId): id is keyof typeof BUILDING_URLS {
  return id in BUILDING_URLS;
}

const SPRITE_URLS = { miner: minerUrl, wagon: wagonUrl, ...BUILDING_URLS };

type Sprites = Readonly<Record<keyof typeof SPRITE_URLS, HTMLImageElement>>;

export function loadCitySprites(): Sprites {
  return loadImages(SPRITE_URLS);
}

/** The ground, the road and the grass verge, from `g` down. */
function paintRoad(
  c: CanvasRenderingContext2D,
  g: number,
  height: number,
): void {
  for (let x = 0; x < SCENE_W; x += 1) {
    rect(c, x, g - 1, 1, 2, hash(x, 0, 4) < 0.5 ? "#3d5a2e" : "#2c4423");
    if (hash(x, 1, 4) < 0.25) {
      rect(c, x, g - 2, 1, 1, "#4d6e38");
    }
    for (let y = g + 1; y < g + CITY_FOOT.road; y += 1) {
      const r = hash(x >> 1, y, 12);
      rect(
        c,
        x,
        y,
        1,
        1,
        r < 0.15 ? "#6d5236" : r < 0.6 ? "#5a4330" : "#4d3826",
      );
    }
  }
  for (let x = 0; x < SCENE_W; x += 3) {
    rect(c, x, g + 4, 2, 1, "#433021");
    rect(c, x + 1, g + 8, 2, 1, "#433021");
  }
  rect(
    c,
    0,
    g + CITY_FOOT.road,
    SCENE_W,
    height - g - CITY_FOOT.road,
    "#1d2a1c",
  );
}

/** The still parts of the city, painted once for a height. */
export function paintCityGround(
  c: CanvasRenderingContext2D,
  height: number,
): void {
  const g = groundY(height);
  paintSky(c, g);
  paintRoad(c, g, height);
}

/** A plot nobody builds on yet: two stakes and a rope between them. */
function stakes(
  c: CanvasRenderingContext2D,
  x0: number,
  w: number,
  g: number,
): void {
  for (const x of [x0, x0 + w - 2]) {
    rect(c, x, g - 7, 2, 7, "#b98a55");
    rect(c, x, g - 7, 2, 1, "#e2552d");
  }
  for (let x = x0 + 2; x < x0 + w - 2; x += 3) {
    rect(c, x, g - 5, 2, 1, "#d8c08a");
  }
}

/** Scaffold round a building `w` wide, up to `top` art px over the ground. */
function scaffold(
  c: CanvasRenderingContext2D,
  x0: number,
  w: number,
  g: number,
  top: number,
): void {
  for (const x of [x0 - 4, x0 + w + 2]) {
    rect(c, x, g - top - 6, 2, top + 6, "#b98a55");
    rect(c, x, g - top - 6, 1, top + 6, "#d8a25e");
  }
  for (let y = 9; y < top + 4; y += 10) {
    rect(c, x0 - 6, g - y, w + 12, 1, "#d8a25e");
  }
  for (let y = 2; y < Math.min(top, 30); y += 3) {
    rect(c, x0 + w + 4, g - y, 3, 1, "#8a6238");
  }
}

/**
 * A building from the ground up to `risen` of its three steps: its picture
 * cut at that height, behind scaffold, and whole with its lamp lit once
 * operational.
 */
function drawBuilding(
  c: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  g: number,
  risen: number,
  t: number,
): void {
  if (!img.complete || img.naturalWidth === 0) {
    return;
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (risen >= 3) {
    glow(
      c,
      x + Math.floor(w / 2),
      g - h + 16,
      15,
      "#ffb13a",
      Math.floor(t * 7),
    );
    c.drawImage(img, x, g - h);
    return;
  }
  const shown = Math.round((h * risen) / 3);
  if (shown <= 0) {
    stakes(c, x - 4, w + 8, g);
    return;
  }
  c.drawImage(img, 0, h - shown, w, shown, x, g - shown, w, shown);
  scaffold(c, x, w, g, Math.max(8, shown + 4));
}

/**
 * A horse wagon facing left, to the site: its heap of stones shows `load`,
 * the share of a full wagon it carries.
 */
function drawWagon(
  c: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  load: number,
): void {
  if (!img.complete || img.naturalWidth === 0) {
    return;
  }
  // The picture's top rows over the wagon bed are its stones.
  const heapRows = 9;
  const bed = 26;
  const cut = heapRows - Math.round(heapRows * Math.min(1, load));
  c.save();
  c.translate(Math.round(x) + img.naturalWidth, Math.round(y));
  c.scale(-1, 1);
  c.drawImage(
    img,
    0,
    cut,
    bed,
    img.naturalHeight - cut,
    0,
    cut,
    bed,
    img.naturalHeight - cut,
  );
  c.drawImage(
    img,
    bed,
    0,
    img.naturalWidth - bed,
    img.naturalHeight,
    bed,
    0,
    img.naturalWidth - bed,
    img.naturalHeight,
  );
  c.restore();
}

/**
 * The site of the building in hand: what lies on it, and the builders at
 * it, in its yard (`siteYard`). With no order the builders wait in the first
 * plot's yard with a "z".
 */
function drawSite(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: CityScene,
  g: number,
  t: number,
): void {
  const yard = siteYard(scene.sitePlot ?? 0);
  if (scene.sitePlot !== undefined) {
    heap(c, yard.heap, g, 16, scene.siteFill, 95);
  }
  const drawn = Math.min(3, scene.builders);
  const waiting = Math.round(drawn * (1 - scene.building));
  for (let j = 0; j < drawn; j += 1) {
    const x = yard.builders + j * 10;
    const y = g - 21;
    if (j >= drawn - waiting) {
      frame(c, sprites.miner, 18, 14, [x, y]);
      zed(c, x + 8, y - 6 - (Math.floor(t * 2 + j) % 2));
      continue;
    }
    const phase = t * 1.3 + j * 2.1;
    frame(
      c,
      sprites.miner,
      18,
      Math.floor(t * 9 + j * 5) % 18,
      [x + Math.sin(phase), y],
      Math.cos(phase) < 0,
    );
  }
}

/** The wagons: driving to the site while transport brings, else standing. */
function drawWagons(
  c: CanvasRenderingContext2D,
  img: HTMLImageElement,
  scene: CityScene,
  g: number,
  t: number,
): void {
  // A vehicle with no driver stands behind the road, empty, with nobody on it.
  for (let k = 0; k < Math.min(2, scene.undriven); k += 1) {
    drawWagon(c, img, SCENE_W - 72 - k * 48, g - 24, 0);
  }
  const shown = Math.min(3, scene.driven);
  const road = g + CITY_FOOT.road - 24;
  if (scene.load <= 0) {
    for (let k = 0; k < shown; k += 1) {
      const x = SCENE_W - 48 - k * 48;
      drawWagon(c, img, x, road, 0);
      zed(c, x + 8, road - 6 - (Math.floor(t * 2 + k) % 2));
    }
    return;
  }
  // They stop at the yard's heap, where the site's goods lie (`siteYard`).
  const end = siteYard(scene.sitePlot ?? 0).heap - 2;
  const span = SCENE_W - end;
  for (let k = 0; k < shown; k += 1) {
    const x = SCENE_W - ((t * 9 + (k * span) / shown) % span);
    drawWagon(c, img, x, road, scene.load);
  }
}

/** One frame of the city's moving parts, over the ground. */
export function drawCity(
  c: CanvasRenderingContext2D,
  sprites: Sprites,
  scene: CityScene,
  height: number,
  t: number,
): void {
  const g = groundY(height);
  scene.plots.forEach((plot: Plot, at) => {
    const span = PLOT_SPANS[at];
    if (span === undefined) {
      return;
    }
    if (plot.building === undefined || !drawnBuilding(plot.building)) {
      stakes(c, span.x + 6, span.w - 12, g);
      return;
    }
    drawBuilding(c, sprites[plot.building], buildingX(at), g, plot.risen, t);
  });
  drawSite(c, sprites, scene, g, t);
  drawWagons(c, sprites.wagon, scene, g, t);
}
