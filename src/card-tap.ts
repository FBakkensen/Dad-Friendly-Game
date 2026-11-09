import { eventAge, type BoardHost } from "./board-host";
import type { ControlRef, Pointer, PressDecision } from "./board-interaction";

const SLOP_PX = 10;

/** The list that scrolls under a card, if this tap started in one. */
function scroller(card: HTMLElement): HTMLElement | null {
  const found = card.closest(
    ".workshop-recipes, .engineers-dialog, .board-sheet-list",
  );
  return found instanceof HTMLElement ? found : null;
}

/** How the press that reached `buy` came. */
export interface CardPress {
  readonly by: Pointer;
  /**
   * When this gesture's finger came down on the card, on the board's clock. Undefined for a
   * key press, and for a finger's click on a card that saw no pointerdown of its own: the board
   * then judges it by the click's own age.
   */
  readonly downAt: number | undefined;
}

/** The clock a finger-down time is read on, and how late a press reached the page. */
interface PressClock {
  readonly clock: () => number;
  readonly pressAge: (event: Event) => number;
}

/** One control's press, kept from its finger's pointerdown to its click. */
export interface PressTracker {
  /**
   * How the press this click ends came, and when its finger came down. A click with no pointer
   * (detail 0) is the keyboard, unless this tracker sent it with `clickFor`. The finger-down
   * time is dropped here, so it can never reach a later press.
   */
  press(click: MouseEvent): CardPress;
  /** Clicks `button` for a finger's pointerup: a click with no pointer, but a finger's. */
  clickFor(button: HTMLElement): void;
  /** Drops the finger-down time of a press that never reached its click. */
  forget(): void;
}

/**
 * Keeps the finger-down time of the presses on `target`: a main-button pointerdown stores it
 * on the clock, less the press's age, so a press held long is judged by when it came down. A
 * cancel drops it.
 */
export function trackPress(
  target: HTMLElement,
  { clock, pressAge }: PressClock,
  options: AddEventListenerOptions = {},
): PressTracker {
  let downAt: number | undefined;
  /** The click this tracker sends itself for a finger. */
  let sending = false;
  const forget = (): void => {
    downAt = undefined;
  };
  target.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button === 0) {
        downAt = clock() - pressAge(event);
      }
    },
    options,
  );
  target.addEventListener("pointercancel", forget, options);
  return {
    press(click) {
      const press: CardPress =
        click.detail !== 0 || sending
          ? { by: "finger", downAt }
          : { by: "keyboard", downAt: undefined };
      forget();
      return press;
    },
    clickFor(button) {
      sending = true;
      try {
        button.click();
      } finally {
        sending = false;
      }
    },
    forget,
  };
}

/** How a board control's listeners are added, and what kind of press a click is. */
export interface BoardPressOptions extends AddEventListenerOptions {
  /** A trouble press (a bay in trouble) is never early or held. Every click acts otherwise. */
  readonly intent?: (click: MouseEvent) => "act" | "trouble";
}

/**
 * One of the board's controls, pressed through the board. Its press is tracked on `target`, so
 * it is judged by its own finger-down time, and that time is dropped at a cancel or when the
 * drawer moves on. A target that holds several controls (the key rail) reads which one a click
 * pressed from the click; a click on none of them presses nothing.
 */
export function pressOnBoard(
  target: HTMLElement,
  board: BoardHost,
  control: ControlRef | ((click: MouseEvent) => ControlRef | undefined),
  judged: (decision: PressDecision, by: Pointer, event: MouseEvent) => void,
  { intent = () => "act", ...options }: BoardPressOptions = {},
): PressTracker {
  const tracker = trackPress(target, board, options);
  target.addEventListener(
    "click",
    (event) => {
      const { by, downAt } = tracker.press(event);
      const pressed = typeof control === "function" ? control(event) : control;
      if (pressed === undefined) {
        return;
      }
      const decision = board.press({
        control: pressed,
        by,
        intent: intent(event),
        downAt,
        event,
      });
      judged(decision, by, event);
    },
    options,
  );
  return tracker;
}

/**
 * `buy` runs for a tap or a key press, with how it came and its click. A finger that moves, or
 * a list that scrolls under the finger, does not buy. Pressed state covers `card`. The press is
 * tracked on `card` (`trackPress`), and its finger-down time is also dropped at a drag. The click
 * this handler sends itself at a finger's pointerup is a finger's.
 */
export function buyOnTap(
  card: HTMLElement,
  button: HTMLButtonElement,
  buy: (press: CardPress, event: MouseEvent) => void,
  {
    clock = () => performance.now(),
    pressAge = eventAge,
  }: {
    clock?: () => number;
    pressAge?: (event: Event) => number;
  } = {},
): { forget(): void } {
  let armed = false;
  let moved = false;
  let gesture = 0;
  let blocked = -1;
  const tracker = trackPress(card, { clock, pressAge });
  let x = 0;
  let y = 0;
  let top = 0;

  card.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    gesture += 1;
    armed = true;
    moved = false;
    x = event.clientX;
    y = event.clientY;
    top = scroller(card)?.scrollTop ?? 0;
    if (!button.disabled) {
      card.classList.add("is-pressed");
    }
  });
  card.addEventListener("pointermove", (event) => {
    if (!armed) {
      return;
    }
    if (Math.hypot(event.clientX - x, event.clientY - y) > SLOP_PX) {
      moved = true;
      card.classList.remove("is-pressed");
    }
  });
  const release = (): void => {
    card.classList.remove("is-pressed");
  };
  card.addEventListener("pointercancel", () => {
    blocked = gesture;
    armed = false;
    release();
  });
  card.addEventListener("pointerleave", () => {
    release();
  });
  card.addEventListener("pointerup", (event) => {
    release();
    if (!armed || button.disabled) {
      armed = false;
      return;
    }
    const dragged =
      moved || Math.abs((scroller(card)?.scrollTop ?? 0) - top) > 2;
    if (dragged) {
      // The click that follows this gesture is the drag, not a buy.
      // The next press gets a new gesture, so it can still buy.
      blocked = gesture;
      armed = false;
      tracker.forget();
      return;
    }
    const target = event.target;
    if (target instanceof Node && button.contains(target)) {
      return;
    }
    armed = false;
    tracker.clickFor(button);
  });
  button.addEventListener("click", (event) => {
    const press = tracker.press(event);
    armed = false;
    moved = false;
    if (blocked === gesture || button.disabled) {
      return;
    }
    buy(press, event);
  });
  return tracker;
}
