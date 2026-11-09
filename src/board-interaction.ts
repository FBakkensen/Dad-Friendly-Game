/*
 * The board's tap rules in one pure place (#410, spec part B): the settle after an opening,
 * the Done hold, the blink on a tap that cannot act, the freeze while a drawer is open and the
 * thanks after a fix. No DOM and no clock: every input carries its own times, the view is read
 * at a time the caller gives, and `nextWake` says when to read it again. I2 (#411) moves the
 * board's parts onto it; until then it is wired to nothing but its timing values.
 */

/** How long an overlay settles after opening: B4's double-tap guard, for every drawer. */
export const DRAWER_SETTLE_MS = 400;
/** How long Done holds after a buy: a second sleepy tap in it buys nothing. */
export const READY_HOLD_MS = 1900;
/** One frame of the red blink: red, off, red, off. */
export const BLINK_STEP_MS = 140;
/** How long a fix's thanks stays. */
export const THANKS_MS = 1600;
/** A press stamp older than this is a stamp gone wrong, not a press still in the queue. */
export const PRESS_AGE_LIMIT_MS = 10_000;

/** Drawers replace one another. The save drawer and a board note open on top. */
export type DrawerId =
  "buys" | "upgrades" | "workshop" | "engineers" | "ledger";
export type OverlayId = DrawerId | "save" | "note";
/** Where a control sits: on an overlay, or on the board under them all. */
export type Layer = OverlayId | "board";
export interface ControlRef {
  readonly layer: Layer;
  readonly id: string;
}
export type Pointer = "finger" | "keyboard";

export type BoardInput =
  | { readonly kind: "open"; readonly overlay: OverlayId; readonly at: number }
  | {
      readonly kind: "close";
      readonly overlay: OverlayId;
      readonly at: number;
      readonly by: Pointer;
    }
  /** The "i" cards in or out: a new screen under the finger, so the settle starts again. */
  | { readonly kind: "page"; readonly overlay: OverlayId; readonly at: number }
  /** What a press that acted led to: a buy landed, the buy was refused, or a trouble fixed. */
  | {
      readonly kind: "result";
      readonly control: ControlRef;
      readonly at: number;
      readonly outcome: "applied" | "refused" | "fixed";
    }
  | { readonly kind: "motion"; readonly reduced: boolean }
  /** The save is loading again: holds and blinks speak of a save that may not land. */
  | { readonly kind: "unloaded" };

export interface Press {
  readonly control: ControlRef;
  /** When the finger came down (the handler's time less the event's age). */
  readonly pressedAt: number;
  /** When the handler ran. */
  readonly at: number;
  readonly by: Pointer;
  /** A trouble press is not a spend: neither the settle nor a hold stops it. */
  readonly intent: "act" | "trouble";
}
export type PressDecision = "act" | "ignore-early" | "ignore-held";

/** One open overlay, and when its settle last started (its open, or its last page). */
interface Opened {
  readonly overlay: OverlayId;
  readonly settleFrom: number;
}

/** The layer a finger's close showed again, settling until `until`. */
interface Revealed {
  readonly layer: Layer;
  readonly until: number;
}

/** A Done hold: presses judged from `from` (the acting press) until `until` are held. */
interface Hold {
  readonly from: number;
  readonly until: number;
}

export interface BoardState {
  /** Open overlays, bottom first. */
  readonly stack: readonly Opened[];
  readonly revealed: Revealed | undefined;
  /** Each control's latest acting press, by its judged time. */
  readonly acted: ReadonlyMap<string, number>;
  readonly holds: ReadonlyMap<string, Hold>;
  /** When each control's blink started. */
  readonly blinks: ReadonlyMap<string, number>;
  /** When each thanks host's thanks ends. */
  readonly thanks: ReadonlyMap<string, number>;
  readonly reduced: boolean;
}

export interface BoardView {
  /** Open overlays, bottom first; empty means the board alone. */
  readonly stack: readonly OverlayId[];
  /** controlKey of each control holding Done. */
  readonly held: ReadonlySet<string>;
  /** controlKey to the blink frame it shows now. */
  readonly blinking: ReadonlyMap<string, "red" | "off">;
  /** Thanks hosts: a drawer's id for its kick line, or a board control's key (a bay). */
  readonly thanks: ReadonlySet<string>;
}

const BLINK: readonly ("red" | "off")[] = ["red", "off", "red", "off"];
const BLINK_MS = BLINK.length * BLINK_STEP_MS;

const DRAWERS: ReadonlySet<OverlayId> = new Set<DrawerId>([
  "buys",
  "upgrades",
  "workshop",
  "engineers",
  "ledger",
]);

export function initialBoard(): BoardState {
  return {
    stack: [],
    revealed: undefined,
    acted: new Map(),
    holds: new Map(),
    blinks: new Map(),
    thanks: new Map(),
    reduced: false,
  };
}

function withEntry<V>(
  map: ReadonlyMap<string, V>,
  key: string,
  value: V,
): ReadonlyMap<string, V> {
  return new Map(map).set(key, value);
}

function withoutEntry<V>(
  map: ReadonlyMap<string, V>,
  key: string,
): ReadonlyMap<string, V> {
  if (!map.has(key)) {
    return map;
  }
  const next = new Map(map);
  next.delete(key);
  return next;
}

/** The entries still `alive`; the same map when none has gone. */
function kept<V>(
  map: ReadonlyMap<string, V>,
  alive: (value: V) => boolean,
): ReadonlyMap<string, V> {
  const next = new Map([...map].filter(([, value]) => alive(value)));
  return next.size === map.size ? map : next;
}

/**
 * Drops what ended more than PRESS_AGE_LIMIT_MS before `at`: no press stamp reaches back that
 * far, so nothing sooner may go, or a late press would miss the hold it came down in.
 */
function pruned(state: BoardState, at: number): BoardState {
  const since = at - PRESS_AGE_LIMIT_MS;
  const acted = kept(state.acted, (pressedAt) => pressedAt >= since);
  const holds = kept(state.holds, (hold) => hold.until >= since);
  const blinks = kept(state.blinks, (start) => start + BLINK_MS >= since);
  const thanks = kept(state.thanks, (until) => until >= since);
  const same =
    acted === state.acted &&
    holds === state.holds &&
    blinks === state.blinks &&
    thanks === state.thanks;
  return same ? state : { ...state, acted, holds, blinks, thanks };
}

/** A blink on `key` from `at`, unless motion is reduced or one is still running there. */
function blinked(state: BoardState, key: string, at: number): BoardState {
  const running = state.blinks.get(key);
  if (state.reduced || (running !== undefined && at < running + BLINK_MS)) {
    return state;
  }
  return { ...state, blinks: withEntry(state.blinks, key, at) };
}

/** A hold on `key` from its acting press (or `at`) for READY_HOLD_MS. */
function heldFrom(state: BoardState, key: string, at: number): BoardState {
  const hold = { from: state.acted.get(key) ?? at, until: at + READY_HOLD_MS };
  return { ...state, holds: withEntry(state.holds, key, hold) };
}

/** A buy landed: Done holds, unless a hold already runs, and a running blink ends. */
function applied(state: BoardState, key: string, at: number): BoardState {
  const quiet = { ...state, blinks: withoutEntry(state.blinks, key) };
  const running = state.holds.get(key);
  return running !== undefined && at < running.until
    ? quiet
    : heldFrom(quiet, key, at);
}

/** A fix thanks its host; a drawer row also holds again, so the burst runs on into no buy. */
function fixed(state: BoardState, control: ControlRef, at: number): BoardState {
  const key = controlKey(control);
  const host = control.layer === "board" ? key : control.layer;
  const thanked = {
    ...state,
    thanks: withEntry(state.thanks, host, at + THANKS_MS),
  };
  return control.layer === "board" ? thanked : heldFrom(thanked, key, at);
}

function resulted(
  state: BoardState,
  input: Extract<BoardInput, { kind: "result" }>,
): BoardState {
  const key = controlKey(input.control);
  switch (input.outcome) {
    case "applied":
      return applied(state, key, input.at);
    case "refused":
      return blinked(state, key, input.at);
    case "fixed":
      return fixed(state, input.control, input.at);
  }
}

export function controlKey(control: ControlRef): string {
  return `${control.layer}/${control.id}`;
}

/** The stack once `overlay` opens: a drawer stands alone, a note replaces a note on top. */
function stackWith(
  stack: readonly Opened[],
  overlay: OverlayId,
  at: number,
): readonly Opened[] {
  const opened: Opened = { overlay, settleFrom: at };
  if (DRAWERS.has(overlay)) {
    return [opened];
  }
  const below =
    overlay === "note" && stack.at(-1)?.overlay === "note"
      ? stack.slice(0, -1)
      : stack;
  return [...below, opened];
}

function opened(state: BoardState, overlay: OverlayId, at: number): BoardState {
  if (state.stack.some((each) => each.overlay === overlay)) {
    return state;
  }
  return {
    ...state,
    stack: stackWith(state.stack, overlay, at),
    revealed: undefined,
  };
}

function closed(
  state: BoardState,
  overlay: OverlayId,
  at: number,
  by: Pointer,
): BoardState {
  const index = state.stack.findIndex((each) => each.overlay === overlay);
  if (index === -1) {
    return state;
  }
  const stack = state.stack.slice(0, index);
  return {
    ...state,
    stack,
    revealed:
      by === "finger"
        ? {
            layer: stack.at(-1)?.overlay ?? "board",
            until: at + DRAWER_SETTLE_MS,
          }
        : undefined,
  };
}

function paged(state: BoardState, overlay: OverlayId, at: number): BoardState {
  if (!state.stack.some((each) => each.overlay === overlay)) {
    return state;
  }
  return {
    ...state,
    stack: state.stack.map((each) =>
      each.overlay === overlay ? { ...each, settleFrom: at } : each,
    ),
  };
}

export function step(state: BoardState, input: BoardInput): BoardState {
  switch (input.kind) {
    case "open":
      return opened(pruned(state, input.at), input.overlay, input.at);
    case "close":
      return closed(pruned(state, input.at), input.overlay, input.at, input.by);
    case "page":
      return paged(pruned(state, input.at), input.overlay, input.at);
    case "result":
      return resulted(pruned(state, input.at), input);
    case "motion":
      return { ...state, reduced: input.reduced };
    case "unloaded":
      return {
        ...state,
        acted: new Map(),
        holds: new Map(),
        blinks: new Map(),
      };
  }
}

/**
 * When a press is judged: when its finger came down, unless that stamp is from the future
 * or too old to trust, as `eventAge` reads it. Then it is judged when it was handled.
 */
function judgedAt(input: Press): number {
  const age = input.at - input.pressedAt;
  return age > 0 && age < PRESS_AGE_LIMIT_MS ? input.pressedAt : input.at;
}

/** A finger act press that came down while its layer was settling. */
function early(state: BoardState, input: Press, at: number): boolean {
  if (input.by !== "finger" || input.intent !== "act") {
    return false;
  }
  const { layer } = input.control;
  const settling = state.stack.find((each) => each.overlay === layer);
  if (settling !== undefined && at < settling.settleFrom + DRAWER_SETTLE_MS) {
    return true;
  }
  return state.revealed?.layer === layer && at < state.revealed.until;
}

/** An act press that came down inside its control's Done hold. */
function inHold(state: BoardState, input: Press, at: number): boolean {
  const hold = state.holds.get(controlKey(input.control));
  return (
    input.intent === "act" &&
    hold !== undefined &&
    at >= hold.from &&
    at < hold.until
  );
}

export function press(
  state: BoardState,
  input: Press,
): { readonly state: BoardState; readonly decision: PressDecision } {
  const at = judgedAt(input);
  if (early(state, input, at)) {
    return { state, decision: "ignore-early" };
  }
  if (inHold(state, input, at)) {
    return { state, decision: "ignore-held" };
  }
  const recorded = pruned(state, input.at);
  return {
    state: {
      ...recorded,
      acted: withEntry(recorded.acted, controlKey(input.control), at),
    },
    decision: "act",
  };
}

/** The frame a blink from `start` shows at `at`, if it still runs. */
function blinkFrame(start: number, at: number): "red" | "off" | undefined {
  return at < start
    ? undefined
    : BLINK[Math.floor((at - start) / BLINK_STEP_MS)];
}

export function boardView(state: BoardState, at: number): BoardView {
  const blinking = new Map<string, "red" | "off">();
  for (const [key, start] of state.blinks) {
    const frame = blinkFrame(start, at);
    if (frame !== undefined) {
      blinking.set(key, frame);
    }
  }
  return {
    stack: state.stack.map((each) => each.overlay),
    held: new Set(
      [...state.holds]
        .filter(([, hold]) => at < hold.until)
        .map(([key]) => key),
    ),
    blinking,
    thanks: new Set(
      [...state.thanks].filter(([, until]) => at < until).map(([host]) => host),
    ),
  };
}

/** The next time after `at` that boardView changes, or undefined when nothing is pending. */
export function nextWake(state: BoardState, at: number): number | undefined {
  const times = [
    ...[...state.holds.values()].map((hold) => hold.until),
    ...[...state.blinks.values()].flatMap((start) =>
      BLINK.map((_, index) => start + (index + 1) * BLINK_STEP_MS),
    ),
    ...state.thanks.values(),
  ].filter((time) => time > at);
  return times.length === 0 ? undefined : Math.min(...times);
}
