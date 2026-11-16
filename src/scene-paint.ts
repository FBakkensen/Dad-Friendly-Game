import { runBoardLoop } from "./board-window";

/**
 * What slice 1's scenes draw with (#660, #662): a canvas in art px (one art
 * px is two board px), the same noise, sky, lamps, heaps and "z" for the
 * mine and the city, and one loop that paints them.
 */

/** A scene's width in art px: the board is 424 px. */
export const SCENE_W = 212;

const SKY = [
  "#141a2e",
  "#1a2238",
  "#232a44",
  "#34304c",
  "#4c3850",
  "#7a4a4a",
  "#b0643e",
  "#d98a44",
];

/** A pixel noise that is the same for the same point. */
export function hash(x: number, y: number, seed: number): number {
  let n =
    (Math.imul(x | 0, 374761393) +
      Math.imul(y | 0, 668265263) +
      Math.imul(seed | 0, 1442695041)) |
    0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function rect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colour: string,
): void {
  c.fillStyle = colour;
  c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

/** A one-art-px line, stepped. */
export function line(
  c: CanvasRenderingContext2D,
  from: readonly [number, number],
  to: readonly [number, number],
  colour: string,
  thick = 1,
): void {
  const steps = Math.max(
    Math.abs(to[0] - from[0]),
    Math.abs(to[1] - from[1]),
    1,
  );
  for (let i = 0; i <= steps; i += 1) {
    const x = from[0] + ((to[0] - from[0]) * i) / steps;
    const y = from[1] + ((to[1] - from[1]) * i) / steps;
    rect(c, x, y, thick, thick, colour);
  }
}

/** A lamp's warm light, dithered. */
export function glow(
  c: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  colour: string,
  seed: number,
): void {
  c.fillStyle = colour;
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      const d = Math.sqrt(x * x + y * y) / r;
      if (d < 1 && hash(cx + x, cy + y, seed) < (1 - d) * (1 - d) * 0.9) {
        c.fillRect(cx + x, cy + y, 1, 1);
      }
    }
  }
}

/** The night sky down to `horizon`, its stars, and the hills against it. */
export function paintSky(c: CanvasRenderingContext2D, horizon: number): void {
  for (let y = 0; y < horizon; y += 1) {
    const t = (y / horizon) * (SKY.length - 1);
    const band = Math.floor(t);
    for (let x = 0; x < SCENE_W; x += 1) {
      const next = SKY[Math.min(band + 1, SKY.length - 1)] ?? "#000";
      rect(
        c,
        x,
        y,
        1,
        1,
        hash(x, y, 1) < t - band ? next : (SKY[band] ?? "#000"),
      );
    }
  }
  const starry = Math.round(horizon * 0.4);
  for (let i = 0; i < 26; i += 1) {
    rect(c, hash(i, 1, 2) * SCENE_W, hash(i, 2, 2) * starry, 1, 1, "#cfd6ff");
  }
  for (let x = 0; x < SCENE_W; x += 1) {
    const hill = horizon - 7 - 5 * Math.sin(x / 31 + 1) - 2 * Math.sin(x / 9);
    rect(c, x, hill, 1, horizon - hill, "#2b2334");
  }
}

/** Loads a scene's pictures once. */
export function loadImages<Id extends string>(
  urls: Readonly<Record<Id, string>>,
): Readonly<Record<Id, HTMLImageElement>> {
  return Object.fromEntries(
    Object.entries<string>(urls).map(([id, url]) => {
      const img = new Image();
      img.src = url;
      return [id, img];
    }),
  ) as Record<Id, HTMLImageElement>;
}

/** One frame of a strip of `frames` frames, at art px. */
export function frame(
  c: CanvasRenderingContext2D,
  img: HTMLImageElement,
  frames: number,
  index: number,
  at: readonly [number, number],
  flip = false,
): void {
  if (!img.complete || img.naturalWidth === 0) {
    return;
  }
  const w = img.naturalWidth / frames;
  const h = img.naturalHeight;
  const x = Math.round(at[0]);
  const y = Math.round(at[1]);
  if (flip) {
    c.save();
    c.translate(x + w, y);
    c.scale(-1, 1);
    c.drawImage(img, index * w, 0, w, h, 0, 0, w, h);
    c.restore();
    return;
  }
  c.drawImage(img, index * w, 0, w, h, x, y, w, h);
}

/** A "z" over a worker who waits. */
export function zed(c: CanvasRenderingContext2D, x: number, y: number): void {
  rect(c, x, y, 4, 1, "#cfd6ff");
  rect(c, x + 2, y + 1, 1, 1, "#cfd6ff");
  rect(c, x + 1, y + 2, 1, 1, "#cfd6ff");
  rect(c, x, y + 3, 4, 1, "#cfd6ff");
}

/**
 * A heap of stone standing on `base`: high when it is full, low when it is
 * not, two stones when bare.
 */
export function heap(
  c: CanvasRenderingContext2D,
  x0: number,
  base: number,
  w: number,
  fill: number,
  seed: number,
): void {
  if (fill < 0.08) {
    rect(c, x0 + 3, base - 1, 2, 1, "#6e7782");
    rect(c, x0 + w - 6, base - 1, 1, 1, "#8f9aa5");
    return;
  }
  const height = Math.round(2 + fill * 10);
  for (let y = 0; y < height; y += 1) {
    const half = Math.round(
      (w / 2) * (1 - y / (height + 1)) * (0.4 + 0.6 * fill),
    );
    for (let x = -half; x <= half; x += 1) {
      const r = hash(x + 40, y, seed);
      rect(
        c,
        x0 + w / 2 + x,
        base - 1 - y,
        1,
        1,
        r < 0.2 ? "#aab4bf" : r < 0.6 ? "#8f9aa5" : "#6e7782",
      );
    }
  }
}

/** How a scene is painted: its still ground once a height, then its frames. */
export type ScenePainter = {
  readonly shown: () => boolean;
  readonly ground: (c: CanvasRenderingContext2D, height: number) => void;
  readonly draw: (c: CanvasRenderingContext2D, clock: number) => void;
  /** What the ground shows besides its height (the mine's levels, #680): a new one paints it again. */
  readonly layout?: () => number;
};

/**
 * A scene's canvas and its frames, on the board's own loop: the ground is
 * painted once a height and a layout, the rest about ten times a second, on
 * hard steps.
 */
export function runScene(
  canvas: HTMLCanvasElement,
  painter: ScenePainter,
  signal: AbortSignal | undefined,
): void {
  const c = canvas.getContext("2d");
  if (c === null) {
    return;
  }
  const ground = document.createElement("canvas");
  let clock = 0;
  let since = 0;
  let layout = painter.layout?.();
  runBoardLoop((dt) => {
    clock += dt;
    since += dt;
    if (!painter.shown() || since < 0.1) {
      return;
    }
    since = 0;
    const height = Math.max(1, Math.floor(canvas.clientHeight / 2));
    const now = painter.layout?.();
    if (
      canvas.height !== height ||
      ground.height !== height ||
      now !== layout
    ) {
      layout = now;
      canvas.width = SCENE_W;
      canvas.height = height;
      ground.width = SCENE_W;
      ground.height = height;
      const g = ground.getContext("2d");
      if (g !== null) {
        painter.ground(g, height);
      }
    }
    c.drawImage(ground, 0, 0);
    painter.draw(c, clock);
  }, signal);
}
