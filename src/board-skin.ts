import frameUrl from "./assets/board/frame.png";
import insetUrl from "./assets/board/inset.png";
import keyUrl from "./assets/board/key.png";
import tagUrl from "./assets/board/tag.png";

export type SkinKind = "frame" | "tag" | "key" | "keyp" | "inset";

type SkinSource = "frame" | "tag" | "key" | "inset";

interface SkinSpec {
  readonly src: SkinSource;
  /** Left offset of this state inside the source sheet (key.png holds 32px cells). */
  readonly ox: number;
  /** Width and height of the source cell, in art px. */
  readonly sw: number;
  readonly sh: number;
  /** Corner sizes. */
  readonly l: number;
  readonly t: number;
  readonly r: number;
  readonly b: number;
  /** Source column and row repeated along the edges. */
  readonly col: number;
  readonly row: number;
  /** Source rect [x, y, w, h] tiled across the middle. */
  readonly fill: readonly [number, number, number, number];
  /** Rivet strips [source start, length], frame only. */
  readonly rivetsH?: readonly [number, number];
  readonly rivetsV?: readonly [number, number];
  readonly pitch?: number;
}

/** The mockup's SK table. Sizes are art pixels (1 art px = 2 CSS px). */
export const SKINS: Readonly<Record<SkinKind, SkinSpec>> = {
  frame: {
    src: "frame",
    ox: 0,
    sw: 42,
    sh: 45,
    l: 8,
    t: 9,
    r: 8,
    b: 8,
    col: 21,
    row: 23,
    rivetsH: [10, 6],
    rivetsV: [10, 6],
    pitch: 22,
    fill: [10, 11, 22, 24],
  },
  tag: {
    src: "tag",
    ox: 0,
    sw: 26,
    sh: 10,
    l: 9,
    t: 3,
    r: 9,
    b: 3,
    col: 12,
    row: 5,
    fill: [9, 3, 8, 4],
  },
  key: {
    src: "key",
    ox: 0,
    sw: 32,
    sh: 32,
    l: 8,
    t: 8,
    r: 8,
    b: 8,
    col: 16,
    row: 16,
    fill: [8, 8, 16, 16],
  },
  keyp: {
    src: "key",
    ox: 32,
    sw: 32,
    sh: 32,
    l: 8,
    t: 8,
    r: 8,
    b: 8,
    col: 16,
    row: 16,
    fill: [8, 8, 16, 16],
  },
  inset: {
    src: "inset",
    ox: 0,
    sw: 48,
    sh: 48,
    l: 11,
    t: 11,
    r: 9,
    b: 9,
    col: 14,
    row: 16,
    fill: [14, 14, 4, 4],
  },
};

/** One drawImage call, in art px: source rect then destination origin. */
export interface Blit {
  readonly sx: number;
  readonly sy: number;
  readonly w: number;
  readonly h: number;
  readonly dx: number;
  readonly dy: number;
}

/** The mockup's compose() as data: fill tiles, edge strips, rivets (frame only), then the four corners. */
export function nineSlicePlan(
  kind: SkinKind,
  width: number,
  height: number,
): readonly Blit[] {
  const s = SKINS[kind];
  const { l, t, r, b, ox, sw, sh } = s;
  const out: Blit[] = [];
  const d = (
    sx: number,
    sy: number,
    w: number,
    h: number,
    dx: number,
    dy: number,
  ) => {
    if (w > 0 && h > 0) out.push({ sx: sx + ox, sy, w, h, dx, dy });
  };
  const [fx, fy, fw, fh] = s.fill;
  for (let y = t; y < height - b; y += fh) {
    for (let x = l; x < width - r; x += fw) {
      d(
        fx,
        fy,
        Math.min(fw, width - r - x),
        Math.min(fh, height - b - y),
        x,
        y,
      );
    }
  }
  for (let x = l; x < width - r; x++) {
    d(s.col, 0, 1, t, x, 0);
    d(s.col, sh - b, 1, b, x, height - b);
  }
  for (let y = t; y < height - b; y++) {
    d(0, s.row, l, 1, 0, y);
    d(sw - r, s.row, r, 1, width - r, y);
  }
  if (s.rivetsH && s.rivetsV && s.pitch) {
    const [rx, rw] = s.rivetsH;
    const span = width - l - r;
    const n = Math.floor(span / s.pitch);
    for (let i = 0; i < n; i++) {
      const x = l + Math.round(((i + 0.5) * span) / n - rw / 2);
      d(rx, 0, rw, t, x, 0);
      d(rx, sh - b, rw, b, x, height - b);
    }
    const [ry, rh] = s.rivetsV;
    const spanV = height - t - b;
    const m = Math.floor(spanV / s.pitch);
    for (let i = 0; i < m; i++) {
      const y = t + Math.round(((i + 0.5) * spanV) / m - rh / 2);
      d(0, ry, l, rh, 0, y);
      d(sw - r, ry, r, rh, width - r, y);
    }
  }
  d(0, 0, l, t, 0, 0);
  d(sw - r, 0, r, t, width - r, 0);
  d(0, sh - b, l, b, 0, height - b);
  d(sw - r, sh - b, r, b, width - r, height - b);
  return out;
}

const URLS: Record<SkinSource, string> = {
  frame: frameUrl,
  tag: tagUrl,
  key: keyUrl,
  inset: insetUrl,
};

const images = new Map<SkinSource, Promise<HTMLImageElement | null>>();

function loadImage(src: SkinSource): Promise<HTMLImageElement | null> {
  let p = images.get(src);
  if (!p) {
    p = new Promise((resolve) => {
      try {
        const img = new Image();
        img.onload = () => {
          resolve(img);
        };
        img.onerror = () => {
          resolve(null);
        };
        img.src = URLS[src];
      } catch {
        resolve(null);
      }
    });
    images.set(src, p);
  }
  return p;
}

/**
 * Puts one canvas.board-skin behind the host's content, painted at floor(host size / 2)
 * art px and shown at 2x. `pressed` swaps the kind while the host has .down.
 * Never throws: with no 2D context or no image the canvas stays blank.
 */
export function skin(
  host: HTMLElement,
  kind: SkinKind,
  pressed?: SkinKind,
): void {
  const canvas = document.createElement("canvas");
  canvas.className = "board-skin";
  canvas.setAttribute("aria-hidden", "true");
  host.classList.add("board-skinned");
  host.insertBefore(canvas, host.firstChild);

  const paint = (): void => {
    try {
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      if (!w || !h) return;
      const want = pressed && host.classList.contains("down") ? pressed : kind;
      const spec = SKINS[want];
      const width = Math.max(18, Math.floor(w / 2));
      const height = Math.max(want === "tag" ? 6 : 17, Math.floor(h / 2));
      const g = canvas.getContext("2d");
      if (!g) return;
      void loadImage(spec.src).then((img) => {
        if (!img) return;
        canvas.width = width;
        canvas.height = height;
        canvas.style.width = `${String(width * 2)}px`;
        canvas.style.height = `${String(height * 2)}px`;
        g.imageSmoothingEnabled = false;
        g.clearRect(0, 0, width, height);
        for (const p of nineSlicePlan(want, width, height)) {
          g.drawImage(img, p.sx, p.sy, p.w, p.h, p.dx, p.dy, p.w, p.h);
        }
      });
    } catch {
      /* a blank skin is fine */
    }
  };

  paint();
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(() => {
      paint();
    }).observe(host);
  }
  if (pressed && typeof MutationObserver !== "undefined") {
    new MutationObserver(() => {
      paint();
    }).observe(host, { attributes: true, attributeFilter: ["class"] });
  }
}
