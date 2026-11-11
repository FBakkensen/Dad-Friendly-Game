/*
 * The board's tap rules in one pure place: the settle after an opening, the Done hold, the
 * blink on a tap that cannot act, the freeze while a drawer is open and the thanks after a
 * fix. No DOM and no clock: every input carries its own times, the view is read at a time the
 * caller gives, and `nextWake` says when to read it again.
 */

/** How long an overlay settles after opening: B4's double-tap guard, for every drawer and card. */
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
  "buys" | "upgrades" | "workshop" | "engineers" | "ledger" | "relics";
/**
 * The cards that open over the board by themselves or when something happens (#464). A card
 * goes on top of what is open, and its close takes off only itself.
 */
export type CardId =
  | "welcome"
  | "layer"
  | "craft"
  | "conflict"
  | "other-tab"
  | "update"
  | "copies"
  | "legacy";
export type OverlayId = DrawerId | CardId | "save" | "note";
/** Where a control sits: on an overlay, or on the board under them all. */
export type Layer = OverlayId | "board";
export interface ControlRef {
  readonly layer: Layer;
  readonly id: string;
}
/** How a press came: a finger (or mouse or pen) on the screen, or a key. */
export type Pointer = "finger" | "keyboard";
/**
 * How an overlay closed. Only a finger's close that ends its own tap (Back) settles what it
 * shows again. A tap-through close (the scrim, a tap outside a note) hands that same tap on
 * to what lay under it, and a program close (a timer, an update prompt) has no tap at all.
 */
export type CloseBy = Pointer | "tap-through" | "program";
/**
 * What a drawer holds in place while it is open, in order: its rows and sections, and how
 * many chip rows its crew line wraps to. A drawer whose rows show or hide in place (Upgrades)
 * lists every row it can show, hidden ones too, so their order holds and their showing stays
 * the painter's. Only a part the latest layout leaves out counts as no longer sold.
 */
export interface Layout {
  readonly parts: readonly string[];
  readonly chipRows: number;
}

export type BoardInput =
  | { readonly kind: "open"; readonly overlay: OverlayId; readonly at: number }
  | {
      readonly kind: "close";
      readonly overlay: OverlayId;
      readonly at: number;
      readonly by: CloseBy;
    }
  /**
   * A new screen under the finger (the "i" cards, a Workshop page, an armed cancel), so the
   * settle starts again.
   */
  | { readonly kind: "page"; readonly overlay: OverlayId; readonly at: number }
  /** What a drawer should show now; an open drawer keeps what it froze. */
  | {
      readonly kind: "layout";
      readonly overlay: DrawerId;
      readonly layout: Layout;
    }
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
export type PressDecision = "act" | "ignore-early" | "ignore-held" | "blink";

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

/**
 * A Done hold: every press judged before `until` is held. A press reaches the model after the
 * buy that started the hold, so one whose finger came down just before that buy is its
 * double tap too.
 */
interface Hold {
  readonly until: number;
}

export interface BoardState {
  /** Open overlays, bottom first. */
  readonly stack: readonly Opened[];
  readonly revealed: Revealed | undefined;
  readonly holds: ReadonlyMap<string, Hold>;
  /** When each control's blink started. */
  readonly blinks: ReadonlyMap<string, number>;
  /** When each thanks host's thanks ends. */
  readonly thanks: ReadonlyMap<string, number>;
  readonly reduced: boolean;
  /** Each drawer's latest layout. */
  readonly wanted: ReadonlyMap<DrawerId, Layout>;
  /** What each open drawer froze: kept as it was given, never copied. */
  readonly frozen: ReadonlyMap<DrawerId, Layout>;
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
  /**
   * What each drawer shows: frozen while it is open, the latest while it is shut. A drawer
   * with no entry (opened while the save loads, before any layout) is left as it is. A drawer
   * that keeps its order while loading (Upgrades) gives that order as a layout as it opens,
   * and the model freezes it; one that lays out as the save lands (Buys) gives nothing yet.
   */
  readonly layouts: ReadonlyMap<DrawerId, Layout>;
}

const BLINK: readonly ("red" | "off")[] = ["red", "off", "red", "off"];
const BLINK_MS = BLINK.length * BLINK_STEP_MS;

const DRAWER_IDS: readonly DrawerId[] = [
  "buys",
  "upgrades",
  "workshop",
  "engineers",
  "ledger",
  "relics",
];

function isDrawer(overlay: Layer): overlay is DrawerId {
  return (DRAWER_IDS as readonly Layer[]).includes(overlay);
}

const CARD_IDS: readonly CardId[] = [
  "welcome",
  "layer",
  "craft",
  "conflict",
  "other-tab",
  "update",
  "copies",
  "legacy",
];

function isCard(overlay: Layer): overlay is CardId {
  return (CARD_IDS as readonly Layer[]).includes(overlay);
}

/** Whether a drawer is on the stack. A note or the save drawer alone is not a drawer. */
export function drawerOpen(view: BoardView): boolean {
  return view.stack.some(isDrawer);
}

export function initialBoard(): BoardState {
  return {
    stack: [],
    revealed: undefined,
    holds: new Map(),
    blinks: new Map(),
    thanks: new Map(),
    reduced: false,
    wanted: new Map(),
    frozen: new Map(),
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
  const holds = kept(state.holds, (hold) => hold.until >= since);
  const blinks = kept(state.blinks, (start) => start + BLINK_MS >= since);
  const thanks = kept(state.thanks, (until) => until >= since);
  const same =
    holds === state.holds && blinks === state.blinks && thanks === state.thanks;
  return same ? state : { ...state, holds, blinks, thanks };
}

/** A blink on `key` from `at`, unless motion is reduced or one is still running there. */
function blinked(state: BoardState, key: string, at: number): BoardState {
  const running = state.blinks.get(key);
  if (state.reduced || (running !== undefined && at < running + BLINK_MS)) {
    return state;
  }
  return { ...state, blinks: withEntry(state.blinks, key, at) };
}

/** A hold on `key` for READY_HOLD_MS from `at`, never ending sooner than one running. */
function heldFrom(state: BoardState, key: string, at: number): BoardState {
  const running = state.holds.get(key)?.until ?? at;
  const hold = { until: Math.max(running, at + READY_HOLD_MS) };
  return { ...state, holds: withEntry(state.holds, key, hold) };
}

/** A buy landed: Done holds and a running blink ends, unless a hold already runs. */
function applied(state: BoardState, key: string, at: number): BoardState {
  const running = state.holds.get(key);
  if (running !== undefined && at < running.until) {
    return state;
  }
  return heldFrom(
    { ...state, blinks: withoutEntry(state.blinks, key) },
    key,
    at,
  );
}

/**
 * A fix thanks its host; a drawer row also holds again, so the burst runs on into no buy, and
 * its running blink ends.
 */
function fixed(state: BoardState, control: ControlRef, at: number): BoardState {
  const key = controlKey(control);
  const host = control.layer === "board" ? key : control.layer;
  const thanked = {
    ...state,
    thanks: withEntry(state.thanks, host, at + THANKS_MS),
  };
  return control.layer === "board"
    ? thanked
    : heldFrom(
        { ...thanked, blinks: withoutEntry(thanked.blinks, key) },
        key,
        at,
      );
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

/**
 * The stack once `overlay` opens: a drawer takes the place of every other drawer, the save drawer
 * and a note, but never of a card, which closes only itself; anything else goes on top.
 */
function stackWith(
  stack: readonly Opened[],
  overlay: OverlayId,
  at: number,
): readonly Opened[] {
  const opened: Opened = { overlay, settleFrom: at };
  if (isDrawer(overlay)) {
    return [...stack.filter((each) => isCard(each.overlay)), opened];
  }
  return [...stack, opened];
}

function opened(state: BoardState, overlay: OverlayId, at: number): BoardState {
  if (state.stack.some((each) => each.overlay === overlay)) {
    return state;
  }
  const stack = stackWith(state.stack, overlay, at);
  return {
    ...state,
    stack,
    revealed: undefined,
    frozen: frozenFor(state, stack),
  };
}

/** The freezes of the drawers still open in `stack`, and the latest layout of one just opened. */
function frozenFor(
  state: BoardState,
  stack: readonly Opened[],
): ReadonlyMap<DrawerId, Layout> {
  const frozen = new Map<DrawerId, Layout>();
  for (const { overlay } of stack) {
    const layout = isDrawer(overlay)
      ? (state.frozen.get(overlay) ?? state.wanted.get(overlay))
      : undefined;
    if (isDrawer(overlay) && layout !== undefined) {
      frozen.set(overlay, layout);
    }
  }
  return frozen;
}

/** A drawer's latest layout; an open drawer with nothing frozen yet freezes it. */
function laidOut(
  state: BoardState,
  overlay: DrawerId,
  layout: Layout,
): BoardState {
  const open = state.stack.some((each) => each.overlay === overlay);
  return {
    ...state,
    wanted: new Map(state.wanted).set(overlay, layout),
    frozen:
      open && !state.frozen.has(overlay)
        ? new Map(state.frozen).set(overlay, layout)
        : state.frozen,
  };
}

function closed(
  state: BoardState,
  overlay: OverlayId,
  at: number,
  by: CloseBy,
): BoardState {
  const index = state.stack.findIndex((each) => each.overlay === overlay);
  if (index === -1) {
    return state;
  }
  // A card closes only itself. Anything else takes what stands on it, but never a card: a
  // card is its own, and a drawer closed under one (a card covering the drawers) leaves it up.
  const stack = isCard(overlay)
    ? state.stack.filter((each) => each.overlay !== overlay)
    : [
        ...state.stack.slice(0, index),
        ...state.stack.slice(index + 1).filter((each) => isCard(each.overlay)),
      ];
  return {
    ...state,
    stack,
    frozen: frozenFor(state, stack),
    // Named fix 1: after a finger closes a drawer, a tap on what lies under it settles.
    revealed:
      by === "finger" && isDrawer(overlay)
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
    case "layout":
      return laidOut(state, input.overlay, input.layout);
    case "motion":
      return { ...state, reduced: input.reduced };
    case "unloaded":
      // A drawer's latest layout spoke of the old save too: one opened now freezes the next.
      return {
        ...state,
        holds: new Map(),
        blinks: new Map(),
        wanted: new Map(),
      };
  }
}

/**
 * When a press is judged: when its finger came down, unless that stamp is from the future
 * or too old to trust. Then it is judged when it was handled. This is the one home of that
 * rule: the host hands a press's raw age on.
 */
function judgedAt(input: Press): number {
  const age = input.at - input.pressedAt;
  return age > 0 && age < PRESS_AGE_LIMIT_MS ? input.pressedAt : input.at;
}

/** A finger act press that came down while its drawer or card settled, or what a drawer's close showed. */
function early(state: BoardState, input: Press, at: number): boolean {
  if (input.by !== "finger" || input.intent !== "act") {
    return false;
  }
  const { layer } = input.control;
  // Drawers and cards settle as they open; the save drawer and the board notes never did.
  const settling =
    isDrawer(layer) || isCard(layer)
      ? state.stack.find((each) => each.overlay === layer)
      : undefined;
  if (settling !== undefined && at < settling.settleFrom + DRAWER_SETTLE_MS) {
    return true;
  }
  return state.revealed?.layer === layer && at < state.revealed.until;
}

/**
 * A part the open drawer shows frozen but its latest layout no longer has: a row held in
 * place for a tier no longer shown sells nothing.
 */
function gone(state: BoardState, control: ControlRef): boolean {
  if (!isDrawer(control.layer)) {
    return false;
  }
  const frozen = state.frozen.get(control.layer);
  const latest = state.wanted.get(control.layer);
  // While the save loads again there is no latest layout to say what is sold: nothing is gone.
  return (
    frozen !== undefined &&
    latest !== undefined &&
    frozen.parts.includes(control.id) &&
    !latest.parts.includes(control.id)
  );
}

/** An act press that came down inside its control's Done hold. */
function inHold(state: BoardState, input: Press, at: number): boolean {
  const hold = state.holds.get(controlKey(input.control));
  return input.intent === "act" && hold !== undefined && at < hold.until;
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
  if (gone(state, input.control)) {
    return {
      state: blinked(state, controlKey(input.control), input.at),
      decision: "blink",
    };
  }
  return { state: pruned(state, input.at), decision: "act" };
}

/** The frame a blink from `start` shows at `at`: none before it starts or after it ends. */
function blinkFrame(start: number, at: number): "red" | "off" | undefined {
  return BLINK[Math.floor((at - start) / BLINK_STEP_MS)];
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
    // An open drawer shows what it froze, even while the save loads again; a shut one its latest.
    layouts: new Map([...state.wanted, ...state.frozen]),
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
