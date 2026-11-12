import digUrl from "./assets/board/dig-button.png";
import plateUrl from "./assets/board/plate.png";
import guardUrl from "./assets/board/ready-guard.png";
import {
  el,
  fitFirst,
  fitsWidth,
  frameX,
  mark,
  refitAll,
  setAttr,
  write,
} from "./board-dom";
import type { BoardHost } from "./board-host";
import { controlKey, type ControlRef } from "./board-interaction";
import { pressLook, pressOnBoard } from "./card-tap";
import { onFontsSettled } from "./fit-cache";
import { reducedMotion } from "./float-text";
import { etaShort, formatCompact, formatCount } from "./format";
import type { TendTier } from "./rates";
import type { ReadyPick, ReadyTier } from "./ready-now";
import { formatSpeed } from "./screen-words";

/*
 * The Ready row (#372): the Ready now plate, a guarded lamp button that buys the pick or opens
 * Buys, and the red DIG button that digs by hand. The pick is readyNow's; this draws it and
 * passes taps on. Fixed places are in board.css (art px x --art); sprite frames are inline
 * background-position-x in CSS px, one art px = 2 CSS px, written only when they change.
 */

/** How long Done holds after a buy: a second sleepy tap in it buys nothing. */
export { READY_HOLD_MS } from "./board-interaction";
/** How long "By hand" holds after the last dig before the legend settles back to Dig. */
export const BY_HAND_MS = 1500;

export type ReadyWords = {
  readonly kick: string;
  /** Fit options, longest first. */
  readonly main: readonly string[];
  /** Fit options, longest first. */
  readonly why: readonly string[];
  readonly aria: string;
  readonly guard: "lit" | "dim" | "done" | "off";
};

export type ReadyTap =
  | {
      readonly kind: "bought";
      readonly tier: ReadyTier;
      readonly count: number;
      readonly gain: number;
    }
  | { readonly kind: "opened" }
  | { readonly kind: "nothing" };

export interface ReadyPlate {
  readonly root: HTMLElement;
  readonly button: HTMLButtonElement;
  render(pick: ReadyPick | undefined, enabled: boolean): void;
}

export interface DigButton {
  readonly root: HTMLElement;
  readonly button: HTMLButtonElement;
  /** An undefined yield shows no legend: the mountain is mined out. */
  set(tapYield: number | undefined, enabled: boolean, label: string): void;
  /** Back to the start: disabled, no words or numbers, no tally (the save is loading again). */
  loading(): void;
  dug(mined: number): void;
  echo(): void;
}

const ONE: Readonly<Record<ReadyTier, string>> = {
  cart: "a cart",
  drill: "a drill",
  borer: "a borer",
  machine: "a Great Machine",
  helper: "a worker",
};

const AT_WORK: Readonly<Record<ReadyTier, (count: string) => string>> = {
  cart: (n) => `Cart ${n} is rolling`,
  drill: (n) => `Drill ${n} is drilling`,
  borer: (n) => `Borer ${n} is boring in`,
  machine: (n) => `Great Machine ${n} is running`,
  helper: (n) => `Worker ${n} is on the crew`,
};

/** The idle machine a hired worker starts (#490). */
const STARTS: Readonly<Record<TendTier, string>> = {
  cart: "starts an idle cart",
  drill: "starts an idle drill",
  borer: "starts an idle borer",
  machine: "starts an idle Great Machine",
};

const MINED_OUT = "The mountain is mined out";

const gainText = (gain: number): string => `+${formatSpeed(gain)}/s`;

/** Why the plate offers a ready pick: the free hands that can run it, or what a worker starts. */
function readyReason(pick: Extract<ReadyPick, { kind: "ready" }>): string {
  if (pick.tier === "helper") {
    if (pick.starts !== undefined) {
      return STARTS[pick.starts];
    }
    return pick.firstWorker === true
      ? "your first worker"
      : "every hand is busy";
  }
  return pick.free === 1
    ? "your free worker can run it"
    : `${formatCount(pick.free)} free workers can run it`;
}

/** The plate's words for a pick: buy it now, save for it, or nothing left to dig. */
export function readyWords(pick: ReadyPick): ReadyWords {
  if (pick.kind === "mined-out") {
    return {
      kick: "",
      main: [MINED_OUT],
      why: [""],
      aria: MINED_OUT,
      guard: "off",
    };
  }
  const n = ONE[pick.tier];
  const g = gainText(pick.gain);
  const p = formatCompact(pick.price);
  if (pick.kind === "ready") {
    const verb = pick.tier === "helper" ? "Hire a worker" : `Buy ${n}`;
    const reason = readyReason(pick);
    const main = [`${verb} · ${p}`, verb];
    const why = [`${g} · ${reason}`, g];
    return {
      kick: "Ready now",
      main,
      why,
      aria: `Ready now: ${main[0] ?? verb}, ${why[0] ?? g}`,
      guard: "lit",
    };
  }
  // readyNow gives no time for a speed with none; a non-finite one would read "NaNm".
  const eta =
    pick.etaMs !== undefined && Number.isFinite(pick.etaMs)
      ? etaShort(pick.etaMs)
      : undefined;
  const main =
    eta === undefined
      ? [`Saving for ${n}`, `For ${n}`]
      : [
          `Saving for ${n} · in ${eta}`,
          `For ${n} · in ${eta}`,
          `Saving for ${n}`,
        ];
  const why = `${p} · ${g}`;
  return {
    kick: "Saving for",
    main,
    why: [why],
    aria: `${main[0] ?? ""}. ${why}. Opens Buys`,
    guard: "dim",
  };
}

/** What the plate says for its hold after a buy: the new one at work and what it adds. */
export function doneWords(
  tier: ReadyTier,
  count: number,
  gain: number,
): ReadyWords {
  const g = gainText(gain);
  const line = AT_WORK[tier](formatCount(count));
  return {
    kick: "Done",
    main: [`Done · ${g}`, "Done"],
    why: [line],
    aria: `Done. ${line}, ${g}`,
    guard: "done",
  };
}

/** One guard frame in CSS px: 40 art px at 2 px each. */
const GUARD_PX = 80;
const GUARD_FRAME = { lit: 0, dim: 1, pressed: 2, done: 3, off: 4 } as const;
/** One red-button frame in CSS px: 56 art px at 2 px each. */
const DIG_PX = 112;
const DIG_REST = 0;
const DIG_DOWN = 1;
const DIG_UP = 2;
/** The click's up frame, and the echo's down and up frames. */
const DIG_UP_MS = 70;
const ECHO_DOWN_MS = 80;
const ECHO_UP_MS = 60;
/** Before the save is in: a disabled button needs a name, and this is no news. */
const LOADING = "Loading your save...";

/** A sprite strip: its frames are written with frameX. */
function strip(className: string, url: string): HTMLElement {
  const made = el("i", className);
  made.style.backgroundImage = `url(${url})`;
  made.setAttribute("aria-hidden", "true");
  return made;
}

/** The plate's parts, built once. */
interface PlateParts {
  readonly root: HTMLElement;
  readonly button: HTMLButtonElement;
  readonly kick: HTMLElement;
  readonly guard: HTMLElement;
  readonly main: HTMLElement;
  readonly why: HTMLElement;
}

/** The buy a Done hold names. */
type Bought = Extract<ReadyTap, { kind: "bought" }>;

/** What the plate shows: the latest pick, or the buy its Done hold names while it holds. */
interface PlateShows {
  readonly pick: ReadyPick | undefined;
  readonly enabled: boolean;
  readonly done: Bought | undefined;
}

/** The plate on the board: its Done hold is the board's. */
const READY: ControlRef = { layer: "board", id: "ready" };

/** Before the save is in: no words, the guard dark. */
const NO_SAVE: ReadyWords = {
  kick: "",
  main: [""],
  why: [""],
  aria: LOADING,
  guard: "off",
};

function buildPlate(): PlateParts {
  const root = el("div", "board-ready-row");
  const button = el("button", "board-ready");
  button.type = "button";
  button.setAttribute("aria-live", "polite");
  const kick = el("span", "board-ready-kick board-lg");
  const guard = strip("board-ready-guard", guardUrl);
  const plate = el("img", "board-ready-plate");
  plate.src = plateUrl;
  plate.alt = "";
  plate.draggable = false;
  const lines = el("span", "board-ready-text");
  const main = el("span", "board-ready-main");
  const why = el("span", "board-ready-why");
  lines.append(main, why);
  button.append(kick, guard, plate, lines);
  root.append(button);
  return { root, button, kick, guard, main, why };
}

/**
 * Paints Done while the plate holds, else the latest pick and whether it can be pressed. A hold
 * leaves `disabled` as it was when the hold began; the pick after it sets it again.
 */
function paintPlate(
  parts: PlateParts,
  shows: PlateShows,
  fits: (el: HTMLElement) => boolean,
): void {
  const { button } = parts;
  const { done, pick } = shows;
  let words: ReadyWords;
  let state: "is-saving" | "is-done" | "";
  if (done !== undefined) {
    words = doneWords(done.tier, done.count, done.gain);
    state = "is-done";
  } else {
    const disabled =
      pick === undefined || pick.kind === "mined-out" || !shows.enabled;
    if (button.disabled !== disabled) {
      button.disabled = disabled;
    }
    words = pick === undefined ? NO_SAVE : readyWords(pick);
    state = pick?.kind === "saving" ? "is-saving" : "";
  }
  for (const name of ["is-saving", "is-done"] as const) {
    mark(button, name, name === state);
  }
  frameX(parts.guard, GUARD_FRAME[words.guard], GUARD_PX);
  write(parts.kick, words.kick);
  fitFirst(parts.main, words.main, fits);
  fitFirst(parts.why, words.why, fits);
  setAttr(button, "aria-label", words.aria);
}

/**
 * The plate's press goes through the board, judged by when its finger came down: only a press
 * the board lets act asks `onTap`. A buy names its Done first, then tells the board, which holds
 * the plate and paints it at once.
 */
function wirePlatePress(
  button: HTMLButtonElement,
  board: BoardHost,
  onTap: () => ReadyTap,
  bought: (done: Bought) => void,
): void {
  pressOnBoard(button, board, READY, (decision) => {
    if (decision !== "act") {
      return;
    }
    // Opened or nothing holds nothing, and neither does a throw.
    const result = onTap();
    if (result.kind !== "bought") {
      return;
    }
    bought(result);
    board.send({
      kind: "result",
      control: READY,
      at: board.clock(),
      outcome: "applied",
    });
  });
}

/**
 * The Ready now plate. A tap asks `onTap`, which re-reads the rule from the store: the painted
 * pick is never trusted. A buy shows Done while the board holds the plate, READY_HOLD_MS, so a
 * double tap buys exactly one.
 */
export function createReadyPlate({
  board,
  onTap,
  fits = fitsWidth,
}: {
  board: BoardHost;
  onTap: () => ReadyTap;
  fits?: (el: HTMLElement) => boolean;
}): ReadyPlate {
  const parts = buildPlate();
  const { root, button, guard } = parts;
  /** Undefined before the save is in. */
  let pick: ReadyPick | undefined;
  let enabled = false;
  /** The buy the latest Done hold names. */
  let bought: Bought | undefined;

  const holding = (): Bought | undefined =>
    board.view().held.has(controlKey(READY)) ? bought : undefined;
  const paint = (): void => {
    paintPlate(parts, { pick, enabled, done: holding() }, fits);
  };

  const render = (next: ReadyPick | undefined, on: boolean): void => {
    pick = next;
    enabled = on;
    paint();
  };

  wirePlatePress(button, board, onTap, (done) => {
    bought = done;
  });
  pressLook(button, {
    enabled: () =>
      holding() === undefined && !button.disabled && pick?.kind === "ready",
    lifts: ["pointerleave", "pointercancel"],
    paint: (down) => {
      if (down) frameX(guard, GUARD_FRAME.pressed, GUARD_PX);
      else paint();
    },
  });

  board.subscribe(paint);
  // Lines fitted with fallback metrics may not fit in the board's own fonts. A Done hold keeps
  // its words, fitted again.
  onFontsSettled(() => {
    refitAll(root);
    paint();
  });

  paint();
  return { root, button, render };
}

/**
 * The red DIG button. A click digs through `onPress`, the same dig as a window tap. Its legend
 * reads the tap yield, or the running "By hand" tally while digs keep coming.
 */
export function createDigButton({
  onPress,
}: {
  onPress: () => void;
}): DigButton {
  const root = el("div", "board-dig");

  const button = el("button", "board-dig-button");
  button.type = "button";
  button.disabled = true;
  button.setAttribute("aria-label", LOADING);
  const sprite = strip("board-dig-sprite", digUrl);
  const frame = (n: number): void => {
    frameX(sprite, n, DIG_PX);
  };
  button.append(sprite);

  const lg = el("span", "board-dig-lg board-lg");
  lg.setAttribute("aria-hidden", "true");
  const word = el("span", "");
  const sep = document.createTextNode("");
  const count = el("b", "");
  lg.append(word, sep, count);
  root.append(button, lg);

  const legend = (w: string, figure: number | undefined): void => {
    write(word, w);
    const dot = w === "" ? "" : " · ";
    if (sep.data !== dot) {
      sep.data = dot;
    }
    write(count, figure === undefined ? "" : `+${formatCompact(figure)}`);
  };

  /** Undefined before the save is in: no words or numbers yet. */
  let tapYield: number | undefined;
  let tally = 0;
  let tallyTimer: ReturnType<typeof setTimeout> | undefined;
  let pressTimer: ReturnType<typeof setTimeout> | undefined;

  const settle = (): void => {
    legend(tapYield === undefined ? "" : "Dig", tapYield);
  };

  const stopPress = (): void => {
    if (pressTimer !== undefined) {
      clearTimeout(pressTimer);
      pressTimer = undefined;
    }
  };

  /** Shows `first`, then each later step after its wait; a new press cuts the run short. */
  const run = (
    first: number,
    steps: readonly (readonly [ms: number, frame: number])[],
  ): void => {
    stopPress();
    frame(first);
    const [next, ...rest] = steps;
    if (next === undefined) {
      return;
    }
    pressTimer = setTimeout(() => {
      pressTimer = undefined;
      run(next[1], rest);
    }, next[0]);
  };

  pressLook(button, {
    // A disabled button never clicks, so it never pops back up: no down frame.
    enabled: () => !button.disabled,
    lifts: ["pointerup", "pointercancel", "pointerleave"],
    paint: (down) => {
      if (down) run(DIG_DOWN, []);
      else if (pressTimer === undefined) frame(DIG_REST);
    },
  });
  button.addEventListener("click", () => {
    onPress();
    run(DIG_UP, [[DIG_UP_MS, DIG_REST]]);
  });
  const set = (
    yieldNow: number | undefined,
    enabled: boolean,
    label: string,
  ): void => {
    tapYield = yieldNow;
    if (button.disabled === enabled) {
      button.disabled = !enabled;
    }
    setAttr(button, "aria-label", label);
    if (tallyTimer === undefined) {
      settle();
    }
  };

  const loading = (): void => {
    if (tallyTimer !== undefined) {
      clearTimeout(tallyTimer);
      tallyTimer = undefined;
    }
    tally = 0;
    root.classList.remove("is-hit");
    set(undefined, false, LOADING);
  };

  const dug = (mined: number): void => {
    tally += mined;
    root.classList.add("is-hit");
    legend("By hand", tally);
    if (tallyTimer !== undefined) {
      clearTimeout(tallyTimer);
    }
    tallyTimer = setTimeout(() => {
      tallyTimer = undefined;
      tally = 0;
      root.classList.remove("is-hit");
      settle();
    }, BY_HAND_MS);
  };

  const echo = (): void => {
    if (reducedMotion()) {
      return;
    }
    run(DIG_DOWN, [
      [ECHO_DOWN_MS, DIG_UP],
      [ECHO_UP_MS, DIG_REST],
    ]);
  };

  frame(DIG_REST);
  settle();
  return { root, button, set, loading, dug, echo };
}
