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
  | { readonly kind: "page"; readonly overlay: OverlayId; readonly at: number };

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
export type PressDecision = "act" | "ignore-early";

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

export interface BoardState {
  /** Open overlays, bottom first. */
  readonly stack: readonly Opened[];
  readonly revealed: Revealed | undefined;
}

export interface BoardView {
  /** Open overlays, bottom first; empty means the board alone. */
  readonly stack: readonly OverlayId[];
}

const DRAWERS: ReadonlySet<OverlayId> = new Set<DrawerId>([
  "buys",
  "upgrades",
  "workshop",
  "engineers",
  "ledger",
]);

export function initialBoard(): BoardState {
  return { stack: [], revealed: undefined };
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
      return opened(state, input.overlay, input.at);
    case "close":
      return closed(state, input.overlay, input.at, input.by);
    case "page":
      return paged(state, input.overlay, input.at);
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

export function press(
  state: BoardState,
  input: Press,
): { readonly state: BoardState; readonly decision: PressDecision } {
  const at = judgedAt(input);
  if (early(state, input, at)) {
    return { state, decision: "ignore-early" };
  }
  return { state, decision: "act" };
}

export function boardView(state: BoardState, at: number): BoardView {
  void at;
  return { stack: state.stack.map((each) => each.overlay) };
}
