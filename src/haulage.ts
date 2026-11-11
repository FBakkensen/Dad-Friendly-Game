/*
 * The haulage run in the mine window, as a pure reducer (the mockup's tubTick, roundTick and
 * hoistTick). A miner pushes a tub out to the face, walks round behind it while it is filled,
 * pushes it back, tips it at the cage and walks round again. When a new cart is on its way, the
 * next full tub goes up the cage and the new empty one comes down in its place.
 *
 * Every position is a whole art px inside the run box (the view's rows 28..49), and everything
 * moves one art px at a time on the mockup's timers. Miner frames: 0-3 push east, 4-7 walk east,
 * 8-11 push west, 12-15 walk west, 16 and 17 three-quarter turns (lamp east, lamp west).
 */

/** The run's constants, from the mockup's RUN. */
const RUN = {
  top: 28,
  floor: 47,
  cage: 14,
  face: 58,
  mh: 21,
  tw: 14,
  cageX: 11,
  cageY: 25,
  cageOff: 22,
} as const;

/** The longest step the run takes at once: a tab back from hours away is one 0.1s step. */
const MAX_DT = 0.1;
const PUSH_STEP = 0.2;
const WALK_STEP = 0.1;
const HOIST_STEP = 0.07;
const PAUSE = 0.35;
const TURN = 0.2;
const HOIST_WAIT = 0.4;
const HOIST_TOP = 0.5;
const SHEAVE_FAST = 3;

type Dir = 1 | -1;
type Face = "E" | "W";

/** A turnaround: a pause (0), a walk round behind the tub (1), two turn frames (3), a beat facing it (2). */
type Round = {
  readonly from: number;
  readonly to: number;
  readonly dir: Dir;
  readonly stage: 0 | 1 | 2 | 3;
  readonly acc: number;
  readonly mx: number;
  readonly f: number;
  readonly midDone: boolean;
};

/** The handover: a wait (0), the cage up (1), a beat at the top (2), the cage down (3), settled (4). */
type Hoist = {
  readonly stage: 0 | 1 | 2 | 3 | 4;
  readonly acc: number;
  readonly dy: number;
};

type Phase = "out" | "back" | "face" | "cage" | "cage2";

type State = {
  readonly ph: Phase;
  readonly x: number;
  readonly y: number;
  readonly full: boolean;
  readonly f: number;
  readonly acc: number;
  readonly mx: number;
  readonly face: Face;
  readonly walk: boolean;
  readonly pose: 16 | 17 | null;
  readonly round: Round | null;
  readonly hoist: Hoist | null;
  /** A new cart is on its way (the mockup's W.nw). */
  readonly nw: boolean;
};

declare const haulageBrand: unique symbol;
/** The run's state. Opaque: read it with haulagePose. */
export type Haulage = { readonly [haulageBrand]: true };

export type HaulageEvent =
  | { readonly kind: "fill"; readonly x: number; readonly y: number }
  | { readonly kind: "sheave"; readonly seconds: number };

export type HaulagePose = {
  readonly tubX: number;
  readonly tubY: number;
  readonly full: boolean;
  readonly minerX: number;
  readonly minerY: number;
  readonly minerFrame: number;
  readonly minerBehind: boolean;
  readonly cageX: number;
  readonly cageY: number;
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type Work = Mutable<Omit<State, "round" | "hoist">> & {
  round: Mutable<Round> | null;
  hoist: Mutable<Hoist> | null;
};

const seal = (state: State): Haulage => state as unknown as Haulage;
const open = (h: Haulage): State => h as unknown as State;

function clone(state: State): Work {
  return {
    ...state,
    round: state.round ? { ...state.round } : null,
    hoist: state.hoist ? { ...state.hoist } : null,
  };
}

const tubTop = (full: boolean): number =>
  RUN.floor - (full ? 15 : 12) + 1 - RUN.top;

/** His hands (art x 8..9 of the frame, outline at 10) rest on the tub's end. */
const pushX = (t: Work | State): number =>
  t.face === "E" ? t.x - 10 : t.x + RUN.tw - 2;

/** The mockup's windowRest for the run: the empty tub at the cage, the miner facing the face. */
export function haulageRest(): Haulage {
  const rest: State = {
    ph: "out",
    x: RUN.cage,
    y: tubTop(false),
    full: false,
    f: 0,
    acc: 0,
    mx: RUN.cage - 10,
    face: "E",
    walk: false,
    pose: null,
    round: null,
    hoist: null,
    nw: false,
  };
  return seal(rest);
}

/** A new cart: it waits for the tub's next visit to the cage. */
export function haulageNewCart(h: Haulage): Haulage {
  return seal({ ...open(h), nw: true });
}

/** One step of the run. While `hold` (a cave-in), nothing changes. */
export function haulageStep(
  h: Haulage,
  dt: number,
  hold: boolean,
): { readonly next: Haulage; readonly events: readonly HaulageEvent[] } {
  if (hold || !(dt > 0)) {
    return { next: h, events: [] };
  }
  const t = clone(open(h));
  const events: HaulageEvent[] = [];
  tubTick(t, Math.min(dt, MAX_DT), events);
  return { next: seal(t), events };
}

function go(t: Work, ph: Phase): void {
  t.ph = ph;
  t.acc = 0;
  t.f = 0;
}

function tubTick(t: Work, dt: number, events: HaulageEvent[]): void {
  t.acc += dt;
  if (t.ph === "out" || t.ph === "back") {
    pushTick(t, t.ph === "out");
  } else if (t.ph === "face") {
    faceTick(t, dt, events);
  } else if (t.ph === "cage") {
    if ((t.nw && !t.round) || t.hoist) {
      hoistTick(t, dt, events);
      return;
    }
    cageTick(t, dt, events);
  } else if (t.round) {
    // cage2: after a handover he walks round the new tub, without a tip
    roundTick(
      t,
      t.round,
      dt,
      () => undefined,
      () => turnOut(t),
    );
  }
  t.y = tubTop(t.full);
}

/** He pushes the tub one art px a step, out to the face or back to the cage. */
function pushTick(t: Work, out: boolean): void {
  const dir = out ? 1 : -1;
  const end = out ? RUN.face : RUN.cage;
  t.walk = false;
  t.face = out ? "E" : "W";
  let pushing = true;
  while (pushing && t.acc >= PUSH_STEP) {
    t.acc -= PUSH_STEP;
    t.x += dir;
    t.f = (t.f + 1) % 4;
    if (t.x === end) {
      pushing = false;
      go(t, out ? "face" : "cage");
    }
  }
  t.mx = pushX(t);
}

/** At the face he walks round the tub while it is filled, then pushes it back. */
function faceTick(t: Work, dt: number, events: HaulageEvent[]): void {
  t.round ??= freshRound(pushX(t), t.x + RUN.tw - 2, 1);
  roundTick(
    t,
    t.round,
    dt,
    () => {
      t.full = true;
      events.push({ kind: "fill", x: t.x + 8, y: 29 });
    },
    () => {
      t.face = "W";
      t.round = null;
      go(t, "back");
    },
  );
}

/** At the cage he tips the tub as he walks round it, then pushes it out. */
function cageTick(t: Work, dt: number, events: HaulageEvent[]): void {
  t.round ??= freshRound(pushX(t), t.x - 10, -1);
  roundTick(
    t,
    t.round,
    dt,
    () => {
      t.full = false;
      events.push({ kind: "fill", x: t.x - 4, y: 30 });
    },
    () => turnOut(t),
  );
}

/** The round at the cage is done: he faces the face and sets off. */
function turnOut(t: Work): void {
  t.face = "E";
  t.round = null;
  go(t, "out");
}

function freshRound(from: number, to: number, dir: Dir): Mutable<Round> {
  return { from, to, dir, stage: 0, acc: 0, mx: from, f: 0, midDone: false };
}

/*
 * A turnaround: a short pause, a walk round behind the tub (the load changes when he is behind
 * it), a beat facing the new way. 0.1s a step.
 */
function roundTick(
  t: Work,
  r: Mutable<Round>,
  dt: number,
  mid: () => void,
  done: () => void,
): void {
  r.acc += dt;
  if (r.stage === 0) {
    roundPause(t, r);
    return;
  }
  if (r.stage === 1) {
    roundWalk(t, r, mid);
    return;
  }
  if (r.stage === 3 && roundTurning(t, r)) {
    return;
  }
  // stage 2: he has turned to face the tub and takes hold
  t.walk = false;
  t.face = r.dir > 0 ? "W" : "E";
  t.f = 0;
  t.mx = r.to;
  t.pose = null;
  if (r.acc >= PAUSE) {
    done();
  }
}

/** Stage 0: he stands still a moment before the walk round. */
function roundPause(t: Work, r: Mutable<Round>): void {
  t.walk = false;
  t.f = 0;
  t.mx = r.from;
  if (r.acc >= PAUSE) {
    r.stage = 1;
    r.acc = 0;
    t.pose = null;
  }
}

/** True once he has walked at least half way round, going `dir`. */
const pastHalf = (r: Mutable<Round>, half: number): boolean =>
  r.dir > 0 ? r.mx >= half : r.mx <= half;

/** Stage 1: he walks round behind the tub; half way, the load changes. */
function roundWalk(t: Work, r: Mutable<Round>, mid: () => void): void {
  t.walk = true;
  t.face = r.dir > 0 ? "E" : "W";
  const half = r.from + (r.to - r.from) / 2;
  while (r.acc >= WALK_STEP && r.stage === 1) {
    r.acc -= WALK_STEP;
    r.mx += r.dir;
    r.f = (r.f + 1) % 4;
    if (!r.midDone && pastHalf(r, half)) {
      r.midDone = true;
      mid();
    }
    if (r.mx === r.to) {
      r.stage = 3;
      r.acc = 0;
      r.f = 0;
    }
  }
  t.mx = r.mx;
  t.f = r.f;
  if (r.stage === 3) {
    // the step that arrives is the first turn frame
    t.walk = false;
    t.pose = r.dir > 0 ? 16 : 17;
  }
}

/** The turn frame `acc` seconds into the turn: 16 then 17 going east, 17 then 16 going west. */
function turnPose(r: Mutable<Round>): 16 | 17 {
  const first = r.acc < WALK_STEP;
  if (r.dir > 0) {
    return first ? 16 : 17;
  }
  return first ? 17 : 16;
}

/**
 * Stage 3: he turns through two three-quarter frames, 0.1s each, towards the tub. True while
 * he is still turning; once done, the round moves on to stage 2.
 */
function roundTurning(t: Work, r: Mutable<Round>): boolean {
  t.walk = false;
  t.mx = r.to;
  if (r.acc < TURN) {
    t.pose = turnPose(r);
    return true;
  }
  r.stage = 2;
  r.acc = 0;
  t.pose = null;
  return false;
}

/*
 * The handover for a new cart: the full tub goes up the cage behind the deck beam, the new empty
 * one comes down in its place, and the miner walks round to take it out.
 */
function hoistTick(t: Work, dt: number, events: HaulageEvent[]): void {
  const h = t.hoist ?? startHoist(t);
  h.acc += dt;
  if (h.stage === 0) {
    if (h.acc >= HOIST_WAIT) {
      h.stage = 1;
      h.acc = 0;
      events.push({ kind: "sheave", seconds: SHEAVE_FAST });
    }
  } else if (h.stage === 1) {
    hoistUp(t, h);
  } else if (h.stage === 2) {
    if (h.acc >= HOIST_TOP) {
      h.stage = 3;
      h.acc = 0;
      h.dy = -RUN.cageOff;
      t.y = tubTop(false) - RUN.cageOff;
    }
  } else if (h.stage === 3) {
    hoistDown(t, h);
  } else {
    // stage 4: settled; he walks round it as at every cage visit, without a tip
    t.hoist = null;
    t.round = freshRound(t.mx, t.x - 10, -1); // still standing (pose 17) until he sets off
    t.ph = "cage2";
  }
}

/** He lets go and stands back a pixel, three-quarter to the cage, hands down, while it winds. */
function startHoist(t: Work): Mutable<Hoist> {
  const h: Mutable<Hoist> = { stage: 0, acc: 0, dy: 0 };
  t.hoist = h;
  t.walk = false;
  t.f = 0;
  t.mx = pushX(t) + 1;
  t.pose = 17;
  return h;
}

/** Stage 1: the cage goes up with the full tub until its deck is behind the deck beam. */
function hoistUp(t: Work, h: Mutable<Hoist>): void {
  while (h.acc >= HOIST_STEP && h.stage === 1) {
    h.acc -= HOIST_STEP;
    t.y -= 1;
    h.dy -= 1;
    if (h.dy <= -RUN.cageOff) {
      h.stage = 2;
      h.acc = 0;
      t.full = false;
    }
  }
}

/** Stage 3: it comes back down with the new empty tub. */
function hoistDown(t: Work, h: Mutable<Hoist>): void {
  while (h.acc >= HOIST_STEP && h.stage === 3) {
    h.acc -= HOIST_STEP;
    t.y += 1;
    h.dy += 1;
    if (h.dy >= 0) {
      h.dy = 0;
      t.y = tubTop(false);
      h.stage = 4;
      h.acc = 0;
      t.nw = false;
    }
  }
}

/** Where everything stands, in whole art px inside the run box. */
export function haulagePose(h: Haulage): HaulagePose {
  const t = open(h);
  const frame = t.pose ?? (t.face === "E" ? 0 : 8) + (t.walk ? 4 : 0) + t.f;
  return {
    tubX: t.x,
    tubY: t.y,
    full: t.full,
    minerX: t.mx,
    minerY: RUN.floor - RUN.mh + 1 - RUN.top,
    minerFrame: frame,
    minerBehind: t.walk,
    cageX: RUN.cageX,
    cageY: RUN.cageY - RUN.top + (t.hoist ? t.hoist.dy : 0),
  };
}
