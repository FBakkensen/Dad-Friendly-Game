import crystalUrl from "./assets/board/mine-view-crystal.png";
import graniteUrl from "./assets/board/mine-view-granite.png";
import heartUrl from "./assets/board/mine-view-heart.png";
import topsoilUrl from "./assets/board/mine-view-topsoil.png";
import type { Trouble, TroubleTier } from "./hazards";
import {
  haulageNewCart,
  haulagePose,
  haulageRest,
  haulageStep,
  type Haulage,
  type HaulageEvent,
  type HaulagePose,
} from "./haulage";
import { rushLeft } from "./gold-rush";
import { layerOf, type LayerId } from "./layers";
import type { Mountain } from "./mountain";

/*
 * The window down No. 2 shaft, as pure rules: which view each band shows, what the window draws
 * (the scene), the beats when a machine arrives, where the vein and the dig puff sit, and the
 * machines' timers (the mockup's windowTick, drillTick, borerTick, tarpTick and windowBeat).
 *
 * Every coordinate is a whole art px inside the 92x76 view, and everything moves on hard steps.
 * The window reads the mountain and the trouble; it never writes the mountain.
 */

/** The view behind the window, one per band (92x76 art px each). */
export const MINE_VIEWS: Readonly<Record<LayerId, string>> = {
  topsoil: topsoilUrl,
  granite: graniteUrl,
  crystal: crystalUrl,
  heart: heartUrl,
};

export function mineView(band: LayerId): string {
  return MINE_VIEWS[band];
}

/** What the window draws. */
export type WindowScene = {
  readonly band: LayerId;
  /** The haulage run: once there is a worker, a kid or a cart. */
  readonly run: boolean;
  readonly drill: boolean;
  readonly borer: boolean;
  readonly machine: boolean;
  readonly kid: boolean;
  readonly carts: number;
  readonly drills: number;
  readonly borers: number;
  readonly trouble: TroubleTier | undefined;
  readonly legacy: boolean;
  /** A Gold rush is running: gold sparkles over the face (#468). */
  readonly rush: boolean;
};

export function windowScene(
  mountain: Mountain,
  trouble: Trouble | undefined,
  now?: number,
): WindowScene {
  return {
    band: layerOf(mountain).id,
    run: mountain.helpers > 0 || mountain.kids > 0 || mountain.carts > 0,
    drill: mountain.drills > 0,
    borer: mountain.borers > 0,
    machine: mountain.machines > 0,
    kid: mountain.kids > 0,
    carts: mountain.carts,
    drills: mountain.drills,
    borers: mountain.borers,
    trouble: trouble?.tier,
    legacy: (mountain.legacy ?? 0) > 0,
    rush: now !== undefined && rushLeft(mountain, now) > 0,
  };
}

/** One calm beat in the window when a machine arrives. */
export type WindowBeat = "cart" | "drill" | "first-borer";

/**
 * The beats between two scenes: one per tier whose count rose, however far. Nothing on the first
 * render (`before` undefined) or when a count falls (Start over, Pass the mine).
 */
export function windowBeats(
  before: WindowScene | undefined,
  after: WindowScene,
): readonly WindowBeat[] {
  if (before === undefined) {
    return [];
  }
  const beats: WindowBeat[] = [];
  if (after.carts > before.carts) {
    beats.push("cart");
  }
  if (after.drills > before.drills) {
    beats.push("drill");
  }
  if (before.borers < 1 && after.borers > 0) {
    beats.push("first-borer");
  }
  return beats;
}

/** Clamps to lo..hi; a value that is not a number sits at `fallback`. */
function clamp(value: number, lo: number, hi: number, fallback = lo): number {
  if (Number.isNaN(value)) {
    return fallback;
  }
  return Math.max(lo, Math.min(hi, value));
}

const VEIN_X = { from: 0.35, to: 0.65, left: 8, right: 64 } as const;
const VEIN_Y = { from: 0.4, to: 0.8, top: 26, bottom: 48 } as const;

/** Where the vein's glint sits on the view, in view art px. */
export type VeinSpot = { readonly left: number; readonly top: number };

/**
 * Where the vein's glint (25x26) sits: today's vein place (x 0.35..0.65, y 0.4..0.8, clamped)
 * mapped linearly onto the galleries' rock, left 8..64 and top 26..48 view art px.
 */
export function veinSpot(x: number, y: number): VeinSpot {
  const mid = (lo: number, hi: number) => (lo + hi) / 2;
  const cx = clamp(x, VEIN_X.from, VEIN_X.to, mid(VEIN_X.from, VEIN_X.to));
  const cy = clamp(y, VEIN_Y.from, VEIN_Y.to, mid(VEIN_Y.from, VEIN_Y.to));
  const across = (cx - VEIN_X.from) / (VEIN_X.to - VEIN_X.from);
  const down = (cy - VEIN_Y.from) / (VEIN_Y.to - VEIN_Y.from);
  return {
    left: Math.round(VEIN_X.left + across * (VEIN_X.right - VEIN_X.left)),
    top: Math.round(VEIN_Y.top + down * (VEIN_Y.bottom - VEIN_Y.top)),
  };
}

type Spot = { readonly x: number; readonly y: number };

/**
 * Where a dig's dust puff (16x16) comes up: under the finger, or at the upper face for a keyboard
 * click. `point` is in view art px.
 */
export function puffSpot(point: Spot | undefined): Spot {
  if (point === undefined) {
    return { x: 67, y: 30 };
  }
  return {
    x: clamp(Math.round(point.x) - 8, -2, 78, 67),
    y: clamp(Math.round(point.y) - 8, -2, 62, 30),
  };
}

/** Where the dig's "+N" starts, centred over the puff and kept inside the view. */
export function plusSpot(puff: Spot, width: number): Spot {
  return {
    x: clamp(puff.x + 8 - Math.round(width / 2), 1, 91 - width),
    y: clamp(puff.y - 2, 1, 67),
  };
}

/* ---------- The machines ---------- */

/** The longest step the machines take at once: a tab back from hours away is one 0.1s step. */
const MAX_DT = 0.1;
const SHEAVE_STEP = 0.2;
const SHEAVE_CART = 1.6;
const STEAM_STEP = 0.32;
const DRILL_STEP = 0.14;
const DRILL_STROKES = 6;
const DRILL_NEW_STROKES = 9;
const DRILL_REST = 2;
const DRILL_FRAMES = [0, 1, 2, 1] as const;
const BORER_STEP = 0.16;
const BORER_DUST_FIRST = 3.4;
const BORER_DUST_STEP = 0.09;
const BORER_DUST_GAP = 3;
const TARP_AT = { x: 7, y: 55 } as const;
const TARP_WAIT = 0.3;
const TARP_LIFT = 0.12;
const TARP_DRAG = 0.06;
const TARP_GONE = -27;
const CAVE_IN_STEP = 0.12;
const VEIN_STEP = 0.18;
/** The Gold rush's sparkle loop: four frames, a little quicker than the vein. */
const RUSH_STEP = 0.16;
const FRAMES = 4;
/** The drill beat's dust puff, at the drill's bit (the mockup's puff(69, 53)). */
const DRILL_PUFF: HaulageEvent = { kind: "fill", x: 69, y: 53 };

type Loop = { readonly f: number; readonly acc: number };
type Sheave = Loop & { readonly fast: number };
type Drill = {
  readonly seq: number;
  readonly acc: number;
  readonly strokes: number;
  readonly rest: number;
};
/** `dust` is the puff's frame, or -1 between puffs while `dustIn` counts down. */
type Borer = Loop & {
  readonly dustIn: number;
  readonly dust: number;
  readonly dacc: number;
};
type Tarp = {
  readonly x: number;
  readonly y: number;
  readonly step: number;
  readonly acc: number;
  readonly per: number;
};

type State = {
  readonly sheave: Sheave;
  readonly steam: Loop;
  readonly drill: Drill;
  readonly borer: Borer;
  /** The tarp being dragged off the first borer; null when it is not moving. */
  readonly tarp: Tarp | null;
  /** The cave-in falling while a cart trouble lasts. */
  readonly caveIn: Loop | null;
  readonly vein: Loop;
  /** The Gold rush's sparkles; null when no rush runs. */
  readonly rush: Loop | null;
  readonly run: Haulage;
  /** Events a beat made, given out by the next step. */
  readonly pending: readonly HaulageEvent[];
};

declare const machinesBrand: unique symbol;
/** The machines' timers. Opaque: read them with machinesView. */
export type Machines = { readonly [machinesBrand]: true };

/** What the window draws this frame: strip frames, and positions in view art px. */
export type MachinesView = {
  readonly sheave: number;
  readonly steam: number;
  readonly drill: number;
  readonly borer: number;
  /** The borer's dust puff frame, or undefined between puffs. */
  readonly borerDust: number | undefined;
  /** The tarp over the borer bay, or undefined once it is off. */
  readonly tarp: { readonly x: number; readonly y: number } | undefined;
  /** The cave-in strip's frame during a cart trouble, else undefined. */
  readonly caveIn: number | undefined;
  readonly vein: number;
  /** The Gold rush strip's frame while a rush runs, else undefined. */
  readonly rush: number | undefined;
  readonly run: HaulagePose;
};

const seal = (state: State): Machines => state as unknown as Machines;
const open = (m: Machines): State => m as unknown as State;

const LOOP_REST: Loop = { f: 0, acc: 0 };
const DRILL_REST_STATE: Drill = {
  seq: 0,
  acc: 0,
  strokes: DRILL_STROKES,
  rest: 0,
};
const BORER_REST: Borer = {
  f: 0,
  acc: 0,
  dustIn: BORER_DUST_FIRST,
  dust: -1,
  dacc: 0,
};

/** The mockup's windowRest: every strip on frame 0, the run at the cage. */
export function machinesRest(): Machines {
  return seal({
    sheave: { ...LOOP_REST, fast: 0 },
    steam: LOOP_REST,
    drill: DRILL_REST_STATE,
    borer: BORER_REST,
    tarp: null,
    caveIn: null,
    vein: LOOP_REST,
    rush: null,
    run: haulageRest(),
    pending: [],
  });
}

/** One calm beat (the mockup's windowBeat). Under reduced motion, skip it: the view is its end. */
export function machinesBeat(m: Machines, beat: WindowBeat): Machines {
  const s = open(m);
  switch (beat) {
    case "cart":
      // the sheave winds fast, and the handover happens at the tub's next visit to the cage
      return seal({
        ...s,
        sheave: { ...s.sheave, fast: SHEAVE_CART },
        run: haulageNewCart(s.run),
      });
    case "drill":
      return seal({
        ...s,
        drill: { seq: 0, acc: 0, strokes: DRILL_NEW_STROKES, rest: 0 },
        pending: [...s.pending, DRILL_PUFF],
      });
    case "first-borer":
      return seal({
        ...s,
        borer: BORER_REST,
        tarp: { ...TARP_AT, step: 0, acc: 0, per: TARP_WAIT },
      });
  }
}

/** A strip of four frames that advances one frame every `per` seconds. */
function loopTick(loop: Loop, dt: number, per: number): Loop {
  let { f, acc } = loop;
  acc += dt;
  while (acc >= per) {
    acc -= per;
    f = (f + 1) % FRAMES;
  }
  return { f, acc };
}

function sheaveTick(sheave: Sheave, dt: number): Sheave {
  const fast = sheave.fast > 0;
  const loop = loopTick(sheave, dt * (fast ? 3 : 1), SHEAVE_STEP);
  return { ...loop, fast: fast ? Math.max(0, sheave.fast - dt) : 0 };
}

/** Strokes in fours (frames 0, 1, 2, 1), then a rest on frame 0. */
function drillTick(drill: Drill, dt: number): Drill {
  if (drill.rest > 0) {
    const rest = drill.rest - dt;
    return rest <= 0
      ? { ...drill, rest: 0, acc: 0, seq: 0 }
      : { ...drill, rest };
  }
  let { seq, acc } = drill;
  acc += dt;
  while (acc >= DRILL_STEP) {
    acc -= DRILL_STEP;
    seq += 1;
    if (seq >= drill.strokes * FRAMES) {
      return { seq: 0, acc, strokes: DRILL_STROKES, rest: DRILL_REST };
    }
  }
  return { ...drill, seq, acc };
}

/** The borer cuts, and now and then a little dust comes off the left face. */
function borerTick(borer: Borer, dt: number, random: () => number): Borer {
  const cut = loopTick(borer, dt, BORER_STEP);
  let { dustIn, dust, dacc } = borer;
  if (dust < 0) {
    dustIn -= dt;
    if (dustIn <= 0) {
      dust = 0;
      dacc = 0;
    }
  } else {
    dacc += dt;
    while (dacc >= BORER_DUST_STEP && dust >= 0) {
      dacc -= BORER_DUST_STEP;
      dust += 1;
      if (dust >= FRAMES) {
        dust = -1;
        dustIn = BORER_DUST_GAP + random();
      }
    }
  }
  return { ...cut, dustIn, dust, dacc };
}

/** The tarp lifts two pixels, then is dragged off to the left a pixel at a time. */
function tarpTick(tarp: Tarp, dt: number): Tarp | null {
  let { x, y, step, acc, per } = tarp;
  acc += dt;
  while (acc >= per) {
    acc -= per;
    step += 1;
    if (step <= 2) {
      y = TARP_AT.y - step;
      per = TARP_LIFT;
    } else {
      x -= 1;
      per = TARP_DRAG;
    }
    if (x <= TARP_GONE) {
      return null;
    }
  }
  return { x, y, step, acc, per };
}

/** The cave-in falls through its four frames and stays down on the last. */
function caveInTick(caveIn: Loop, dt: number): Loop {
  let { f, acc } = caveIn;
  acc += dt;
  while (acc >= CAVE_IN_STEP && f < FRAMES - 1) {
    acc -= CAVE_IN_STEP;
    f += 1;
  }
  return { f, acc };
}

/**
 * One step of every machine (at most 0.1s). It steps the haulage run inside, holding it during a
 * cart trouble, and gives out the fill puffs the window draws: the run's fills and a drill beat's
 * dust. The run's sheave events are spent here, on the sheave.
 */
export function machinesStep(
  m: Machines,
  dt: number,
  scene: WindowScene,
  random: () => number,
): { readonly next: Machines; readonly events: readonly HaulageEvent[] } {
  if (!(dt > 0)) {
    return { next: m, events: [] };
  }
  const s = open(m);
  const step = Math.min(dt, MAX_DT);
  const events: HaulageEvent[] = [...s.pending];
  const { sheave, run } = haulTick(s, step, scene, events);
  const drill =
    scene.drills > 0 ? drillStep(s.drill, step, scene) : DRILL_REST_STATE;
  const { borer, tarp } = borerStep(s, step, scene, random);
  const caveIn =
    scene.trouble === "cart" ? caveInTick(s.caveIn ?? LOOP_REST, step) : null;
  const next: State = {
    sheave,
    steam: loopTick(s.steam, step, STEAM_STEP),
    drill,
    borer,
    tarp,
    caveIn,
    vein: loopTick(s.vein, step, VEIN_STEP),
    rush: scene.rush ? loopTick(s.rush ?? LOOP_REST, step, RUSH_STEP) : null,
    run,
    pending: [],
  };
  return { next: seal(next), events };
}

/**
 * The sheave and the haulage run. A run's sheave event speeds the sheave;
 * its other events go out with this step's.
 */
function haulTick(
  s: State,
  step: number,
  scene: WindowScene,
  events: HaulageEvent[],
): { readonly sheave: Sheave; readonly run: Haulage } {
  let sheave = sheaveTick(s.sheave, step);
  if (!scene.run) {
    return { sheave, run: haulageRest() };
  }
  const hauled = haulageStep(s.run, step, scene.trouble === "cart");
  for (const event of hauled.events) {
    if (event.kind === "sheave") {
      sheave = { ...sheave, fast: Math.max(sheave.fast, event.seconds) };
    } else {
      events.push(event);
    }
  }
  return { sheave, run: hauled.next };
}

/** The drill turns, unless it is in trouble. */
function drillStep(drill: Drill, step: number, scene: WindowScene): Drill {
  return scene.trouble === "drill" ? drill : drillTick(drill, step);
}

/** The borer cuts, unless its tarp is still coming off or it is in trouble. */
function borerStep(
  s: State,
  step: number,
  scene: WindowScene,
  random: () => number,
): { readonly borer: Borer; readonly tarp: Tarp | null } {
  if (!(scene.borers > 0)) {
    return { borer: BORER_REST, tarp: null };
  }
  if (s.tarp) {
    return { borer: s.borer, tarp: tarpTick(s.tarp, step) };
  }
  const borer =
    scene.trouble === "borer" ? s.borer : borerTick(s.borer, step, random);
  return { borer, tarp: null };
}

/** What to draw. A trouble holds its machine on frame 0 at once, before the next step. */
export function machinesView(m: Machines, scene: WindowScene): MachinesView {
  const s = open(m);
  const drill =
    scene.drills > 0 && scene.trouble !== "drill"
      ? DRILL_FRAMES[s.drill.seq % FRAMES]
      : 0;
  const cutting =
    scene.borers > 0 && s.tarp === null && scene.trouble !== "borer";
  let tarp: MachinesView["tarp"];
  if (scene.borers < 1) {
    tarp = { x: TARP_AT.x, y: TARP_AT.y };
  } else if (s.tarp) {
    tarp = { x: s.tarp.x, y: s.tarp.y };
  }
  let caveIn: number | undefined;
  if (scene.trouble === "cart") {
    caveIn = s.caveIn?.f ?? 0;
  }
  return {
    sheave: s.sheave.f,
    steam: s.steam.f,
    drill: drill ?? 0,
    borer: cutting ? s.borer.f : 0,
    borerDust: cutting && s.borer.dust >= 0 ? s.borer.dust : undefined,
    tarp,
    caveIn,
    vein: s.vein.f,
    rush: scene.rush ? (s.rush?.f ?? 0) : undefined,
    run: haulagePose(scene.run ? s.run : haulageRest()),
  };
}
