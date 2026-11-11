import borerCutUrl from "./assets/board/borer-cut-4f.png";
import tarpUrl from "./assets/board/borer-tarp.png";
import cageUrl from "./assets/board/cage.png";
import drillUrl from "./assets/board/drill-work-4f.png";
import dustUrl from "./assets/board/dust-burst-4f.png";
import minerUrl from "./assets/board/miner-18f.png";
import sheaveUrl from "./assets/board/sheave-4f.png";
import steamUrl from "./assets/board/steam-4f.png";
import tubEmptyUrl from "./assets/board/tub-empty.png";
import tubFullUrl from "./assets/board/tub-full.png";
import caveInUrl from "./assets/board/window-cave-in-4f.png";
import frameUrl from "./assets/board/window-frame.png";
import glassUrl from "./assets/board/window-glass.png";
import machineUrl from "./assets/board/window-great-machine.png";
import kidUrl from "./assets/board/window-kid.png";
import veinUrl from "./assets/board/window-vein-4f.png";
import { skin } from "./board-skin";
import { reducedMotion } from "./float-text";
import { formatCount } from "./format";
import type { HaulagePose } from "./haulage";
import {
  machinesBeat,
  machinesRest,
  machinesStep,
  machinesView,
  mineView,
  plusSpot,
  puffSpot,
  windowBeats,
  type Machines,
  type MachinesView,
  type VeinSpot,
  type WindowScene,
} from "./mine-window";

/*
 * The window down No. 2 Shaft, drawn (#371): the view, its machines and the haulage run on hard
 * steps, the dig puff and "+N", the golden vein over the view, and the Legacy plate on the frame's
 * lower edge. The rules live in mine-window.ts; this draws them and passes taps on.
 *
 * Fixed places are in board.css (art px x --art). What moves is set here as inline CSS px, one art
 * px = 2 CSS px, as B2's save lamp does: positions in left/top, sprite frames in
 * background-position-x.
 */

export interface MineWindow {
  readonly root: HTMLElement;
  readonly dig: HTMLButtonElement;
  readonly vein: HTMLButtonElement;
  render(scene: WindowScene): void;
  showVein(spot: VeinSpot | undefined): void;
  tick(dt: number): void;
  /** Plays the dig puff and "+N" at the upper face for a dig made elsewhere (the red button). */
  dug(mined: number): void;
  /** Back to the frame and the glass while a save loads again; the next render is a first one. */
  loading(): void;
}

type Spot = { readonly x: number; readonly y: number };

/** CSS px per art px. */
const ART = 2;
/** The view's width in art px, and where it sits inside the frame. */
const VIEW_W = 92;
const VIEW_AT = 7;
/** Frame widths in art px, one per sprite strip. */
const W = {
  sheave: 19,
  steam: 11,
  drill: 23,
  borer: 28,
  dust: 16,
  miner: 12,
  caveIn: 46,
  vein: 25,
} as const;
const PUFF_FRAMES = 4;
const PUFF_STEP = 0.07;
const PUFF_STILL = 0.24;
const FILL_STEP = 0.09;
const PLUS_STEP = 0.07;
const PLUS_STEPS = 12;
const PLUS_STILL = 0.7;
/** The cave-in's last frame: under reduced motion the rock is simply down. */
const CAVE_IN_DOWN = 3;

const px = (art: number): string => `${String(art * ART)}px`;

type Inline = "left" | "top" | "backgroundPositionX";
/** What each element was last given, so a frame writes only what changed. */
const written = new WeakMap<HTMLElement, Map<Inline, string>>();

/** Every moving style goes through here: it writes only a value that changed. */
const put = (el: HTMLElement, prop: Inline, value: string): void => {
  let seen = written.get(el);
  if (seen === undefined) {
    seen = new Map();
    written.set(el, seen);
  }
  if (seen.get(prop) === value) {
    return;
  }
  seen.set(prop, value);
  el.style[prop] = value;
};

const show = (el: HTMLElement, on: boolean): void => {
  if (el.hidden === on) {
    el.hidden = !on;
  }
};

const place = (el: HTMLElement, left: number, top: number): void => {
  put(el, "left", px(left));
  put(el, "top", px(top));
};

const frameX = (el: HTMLElement, frame: number, width: number): void => {
  put(el, "backgroundPositionX", px(-frame * width));
};

function sprite(className: string, url: string): HTMLElement {
  const el = document.createElement("i");
  el.className = className;
  el.style.backgroundImage = `url(${url})`;
  el.setAttribute("aria-hidden", "true");
  return el;
}

/** An image; with no url yet (the view, until the first render) it loads nothing. */
function picture(className: string, url?: string): HTMLImageElement {
  const img = document.createElement("img");
  img.className = className;
  if (url !== undefined) {
    img.src = url;
  }
  img.alt = "";
  img.draggable = false;
  return img;
}

/** A strip that plays its four frames once, then hides. */
type Puff = { readonly f: number; readonly acc: number };
/** "+N" on its way up: where it started, the steps taken, and time towards the next. */
type Rise = { readonly y: number; readonly step: number; readonly acc: number };

/** The view's pictures and sprites, back to front. */
interface ViewParts {
  readonly view: HTMLElement;
  readonly art: HTMLImageElement;
  readonly sheave: HTMLElement;
  readonly steam: HTMLElement;
  readonly machine: HTMLImageElement;
  readonly drill: HTMLElement;
  readonly tarp: HTMLImageElement;
  readonly borer: HTMLElement;
  readonly borerDust: HTMLElement;
  readonly kid: HTMLImageElement;
  readonly run: HTMLElement;
  readonly tub: HTMLImageElement;
  readonly miner: HTMLElement;
  readonly cage: HTMLImageElement;
  readonly caveIn: HTMLElement;
  readonly fill: HTMLElement;
  readonly dust: HTMLElement;
  readonly plus: HTMLElement;
}

/** Every element the window draws, made once at mount. */
interface Parts extends ViewParts {
  readonly root: HTMLElement;
  readonly dig: HTMLButtonElement;
  readonly vein: HTMLButtonElement;
  readonly glint: HTMLElement;
  readonly plate: HTMLElement;
  /** What the first render shows: the view and the shaft. */
  readonly shaft: readonly HTMLElement[];
  /** What stays hidden until the save has loaded, and again while it loads. */
  readonly sceneParts: readonly HTMLElement[];
}

/** The view inside the frame: the mine, its machines, the run, the puffs, "+N", the glass. */
function buildView(): ViewParts {
  const view = document.createElement("span");
  view.className = "board-window-view";
  const art = picture("board-window-art");
  const sheave = sprite("board-window-sheave", sheaveUrl);
  const steam = sprite("board-window-steam", steamUrl);
  const machine = picture("board-window-machine", machineUrl);
  const drill = sprite("board-window-drill", drillUrl);
  const tarp = picture("board-window-tarp", tarpUrl);
  const borer = sprite("board-window-borer", borerCutUrl);
  const borerDust = sprite("board-window-borer-dust", dustUrl);
  const kid = picture("board-window-kid", kidUrl);
  const run = document.createElement("span");
  run.className = "board-window-run";
  const tub = picture("board-window-tub", tubEmptyUrl);
  const miner = sprite("board-window-miner", minerUrl);
  const cage = picture("board-window-cage", cageUrl);
  run.append(tub, miner, cage);
  const caveIn = sprite("board-window-cave-in", caveInUrl);
  const fill = sprite("board-window-fill", dustUrl);
  const dust = sprite("board-dig-dust", dustUrl);
  const plus = document.createElement("span");
  plus.className = "board-dig-plus board-num";
  plus.setAttribute("aria-hidden", "true");
  const glass = picture("board-window-glass", glassUrl);
  view.append(
    art,
    sheave,
    steam,
    machine,
    drill,
    tarp,
    borer,
    borerDust,
    kid,
    run,
    caveIn,
    fill,
    dust,
    plus,
    glass,
  );
  return {
    view,
    art,
    sheave,
    steam,
    machine,
    drill,
    tarp,
    borer,
    borerDust,
    kid,
    run,
    tub,
    miner,
    cage,
    caveIn,
    fill,
    dust,
    plus,
  };
}

/** The window: the view in its frame with the shaft's tag, the vein over it, the Legacy plate. */
function buildParts(legacyBadge: HTMLElement): Parts {
  const root = document.createElement("div");
  root.className = "board-mine";

  const dig = document.createElement("button");
  dig.type = "button";
  dig.className = "board-window";

  const parts = buildView();
  const frame = picture("board-window-frame", frameUrl);
  const tag = document.createElement("span");
  tag.className = "board-window-tag";
  skin(tag, "tag");
  const tagText = document.createElement("span");
  tagText.className = "board-lg";
  tagText.textContent = "No. 2 Shaft";
  tag.append(tagText);
  dig.append(parts.view, frame, tag);

  const vein = document.createElement("button");
  vein.type = "button";
  vein.className = "golden-vein";
  vein.hidden = true;
  vein.setAttribute("aria-label", "Golden vein, tap for a burst of stones");
  const glint = sprite("board-vein-glint", veinUrl);
  vein.append(glint);

  const plate = document.createElement("span");
  plate.className = "board-legacy";
  plate.hidden = true;
  skin(plate, "brass");
  plate.append(legacyBadge);

  root.append(dig, vein, plate);

  const { art, sheave, steam, run } = parts;
  const shaft = [art, sheave, steam, run];
  const sceneParts = [
    ...shaft,
    parts.machine,
    parts.drill,
    parts.tarp,
    parts.borer,
    parts.borerDust,
    parts.kid,
    parts.tub,
    parts.miner,
    parts.caveIn,
    parts.fill,
    parts.dust,
    parts.plus,
  ];
  return { ...parts, root, dig, vein, glint, plate, shaft, sceneParts };
}

/** The machines' frames, and which of them show. */
function paintMachines(p: Parts, v: MachinesView, scene: WindowScene): void {
  frameX(p.sheave, v.sheave, W.sheave);
  frameX(p.steam, v.steam, W.steam);
  show(p.drill, scene.drill);
  frameX(p.drill, v.drill, W.drill);
  show(p.borer, scene.borer);
  frameX(p.borer, v.borer, W.borer);
  show(p.borerDust, v.borerDust !== undefined);
  frameX(p.borerDust, v.borerDust ?? 0, W.dust);
  show(p.tarp, v.tarp !== undefined);
  if (v.tarp) {
    place(p.tarp, v.tarp.x, v.tarp.y);
  }
  show(p.caveIn, v.caveIn !== undefined);
  if (v.caveIn !== undefined) {
    frameX(p.caveIn, reducedMotion() ? CAVE_IN_DOWN : v.caveIn, W.caveIn);
  }
  frameX(p.glint, v.vein, W.vein);
}

/**
 * The run, in run-box px; the box clips a tub hoisted up behind the deck beam. Takes whether
 * the tub was drawn full and gives back whether it is now.
 */
function paintRun(
  p: Parts,
  pose: HaulagePose,
  scene: WindowScene,
  fullTub: boolean,
): boolean {
  const { tub, miner } = p;
  show(tub, scene.run);
  show(miner, scene.run);
  if (pose.full !== fullTub) {
    tub.src = pose.full ? tubFullUrl : tubEmptyUrl;
    tub.classList.toggle("is-full", pose.full);
  }
  place(tub, pose.tubX, pose.tubY);
  place(miner, pose.minerX, pose.minerY);
  frameX(miner, pose.minerFrame, W.miner);
  if (miner.classList.contains("is-behind") !== pose.minerBehind) {
    miner.classList.toggle("is-behind", pose.minerBehind);
  }
  place(p.cage, pose.cageX, pose.cageY);
  return pose.full;
}

/** Puts a strip at its spot on its first frame. */
function startPuff(el: HTMLElement, at: Spot): Puff {
  place(el, at.x, at.y);
  el.hidden = false;
  return { f: 0, acc: 0 };
}

/** Plays a strip's four frames, one each `per` seconds; null once it is done. */
function stepPuff(
  el: HTMLElement,
  puff: Puff,
  dt: number,
  per: number,
  still: boolean,
): Puff | null {
  let { f, acc } = puff;
  acc += dt;
  while (acc >= per) {
    acc -= per;
    f += 1;
    if (still || f >= PUFF_FRAMES) {
      el.hidden = true;
      return null;
    }
  }
  // only a new frame is painted, so a still puff keeps the frame it was shown on
  if (f !== puff.f) {
    frameX(el, f, W.dust);
  }
  return { f, acc };
}

/** "+N" rises one art px each 70ms for 12 steps; under reduced motion it holds for 0.7s. */
function stepRise(
  plus: HTMLElement,
  r: Rise,
  dt: number,
  still: boolean,
): Rise | null {
  let { step: n, acc } = r;
  const per = still ? PLUS_STILL : PLUS_STEP;
  acc += dt;
  while (acc >= per) {
    acc -= per;
    n += 1;
    if (still || n > PLUS_STEPS) {
      plus.hidden = true;
      return null;
    }
  }
  put(plus, "top", px(r.y - n));
  return { y: r.y, step: n, acc };
}

/** Where a pointer went down on the view, in art px (the view may be drawn scaled). */
function pointIn(view: HTMLElement, event: PointerEvent): Spot {
  const box = view.getBoundingClientRect();
  const scale = box.width > 0 ? box.width / (VIEW_W * ART) : 1;
  return {
    x: (event.clientX - box.left) / scale / ART,
    y: (event.clientY - box.top) / scale / ART,
  };
}

/** The vein shows at its spot on the view, or hides with none. */
function placeVein(vein: HTMLElement, spot: VeinSpot | undefined): void {
  vein.hidden = spot === undefined;
  if (spot) {
    place(vein, VIEW_AT + spot.left, VIEW_AT + spot.top);
  }
}

export function createMineWindow({
  onDig,
  onVein,
  legacyBadge,
  random,
}: {
  onDig: () => number;
  onVein: () => void;
  legacyBadge: HTMLElement;
  random: () => number;
}): MineWindow {
  const p = buildParts(legacyBadge);
  const { root, dig, view, vein, plate, art, machine, kid, fill, dust, plus } =
    p;

  // Until the save has loaded there is no scene: the window is its frame and glass on the dark,
  // so nothing unearned shows while "Loading your save..." is up. The first render puts the view
  // on, and paint() shows each machine only once it is owned.
  for (const el of p.sceneParts) {
    el.hidden = true;
  }

  let machines: Machines = machinesRest();
  let scene: WindowScene | undefined;
  let fullTub = false;
  let digPuff: Puff | null = null;
  let fillPuff: Puff | null = null;
  let rise: Rise | null = null;
  let point: Spot | undefined;

  // A save that loads again (a sign-in, another account) starts the window over, as at mount.
  const loading = (): void => {
    for (const el of [...p.sceneParts, vein, plate]) {
      el.hidden = true;
    }
    machines = machinesRest();
    scene = undefined;
    digPuff = null;
    fillPuff = null;
    rise = null;
    point = undefined;
  };

  const paint = (): void => {
    if (scene === undefined) {
      return;
    }
    const v = machinesView(machines, scene);
    paintMachines(p, v, scene);
    fullTub = paintRun(p, v.run, scene, fullTub);
  };

  const showDig = (at: Spot | undefined, mined: number): void => {
    const still = reducedMotion();
    const spot = puffSpot(at);
    digPuff = startPuff(dust, spot);
    frameX(dust, still ? 1 : 0, W.dust);

    plus.textContent = `+${formatCount(mined)}`;
    plus.hidden = false;
    const start = plusSpot(spot, Math.ceil(plus.offsetWidth / ART));
    place(plus, start.x, start.y);
    rise = { y: start.y, step: 0, acc: 0 };
  };

  dig.addEventListener("pointerdown", (event) => {
    point = pointIn(view, event);
  });

  dig.addEventListener("click", (event) => {
    // a keyboard click has no point: it puffs at the upper face
    const at = event.detail > 0 ? point : undefined;
    point = undefined;
    const mined = onDig();
    if (mined > 0) {
      showDig(at, mined);
    }
  });

  vein.addEventListener("click", () => {
    onVein();
  });

  const render = (next: WindowScene): void => {
    if (scene === undefined) {
      for (const el of p.shaft) {
        el.hidden = false;
      }
    }
    if (scene?.band !== next.band) {
      root.dataset.band = next.band;
      art.src = mineView(next.band);
    }
    machine.hidden = !next.machine;
    kid.hidden = !next.kid;
    plate.hidden = !next.legacy;
    if (!reducedMotion()) {
      for (const beat of windowBeats(scene, next)) {
        machines = machinesBeat(machines, beat);
      }
    }
    scene = next;
    paint();
  };

  const tick = (dt: number): void => {
    const step = dt > 0 ? dt : 0;
    const still = reducedMotion();
    if (scene !== undefined && !still) {
      const stepped = machinesStep(machines, step, scene, random);
      machines = stepped.next;
      for (const event of stepped.events) {
        // machinesStep gives out only fills (the sheave's are spent inside it)
        if (event.kind === "fill") {
          fillPuff = startPuff(fill, { x: event.x, y: event.y });
          frameX(fill, 0, W.dust);
        }
      }
    }
    paint();
    if (fillPuff) {
      fillPuff = stepPuff(fill, fillPuff, step, FILL_STEP, false);
    }
    if (digPuff) {
      digPuff = stepPuff(
        dust,
        digPuff,
        step,
        still ? PUFF_STILL : PUFF_STEP,
        still,
      );
    }
    if (rise) {
      rise = stepRise(plus, rise, step, still);
    }
  };

  const dug = (mined: number): void => {
    if (mined > 0) {
      showDig(undefined, mined);
    }
  };

  const showVein = (spot: VeinSpot | undefined): void => {
    placeVein(vein, spot);
  };

  return { root, dig, vein, render, showVein, tick, dug, loading };
}

/** The longest step the board takes: a tab back from hours away is one 0.1s step. */
const MAX_DT = 0.1;

/**
 * Calls `step` once a frame with the seconds since the last one, capped at 0.1, until `signal`
 * aborts. Without requestAnimationFrame (tests, very old browsers) it does nothing.
 */
export function runBoardLoop(
  step: (dt: number) => void,
  signal?: AbortSignal,
): void {
  if (typeof requestAnimationFrame !== "function") {
    return;
  }
  if (signal?.aborted) {
    return;
  }
  let last: number | undefined;
  let pending = 0;
  const frame = (now: number): void => {
    // the next frame is asked for first, so a step that throws never stops the board
    pending = requestAnimationFrame(frame);
    const dt = last === undefined ? undefined : (now - last) / 1000;
    last = now;
    if (dt !== undefined) {
      step(Math.min(MAX_DT, Math.max(0, dt)));
    }
  };
  pending = requestAnimationFrame(frame);
  signal?.addEventListener(
    "abort",
    () => {
      cancelAnimationFrame(pending);
    },
    { once: true },
  );
}
