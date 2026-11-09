/*
 * The one place the board's model meets the clock. It keeps the model's state, steps it on
 * every input and press, and holds the single timer that wakes the painters when the view next
 * changes: a hold ending, a blink frame, a thanks going.
 */
import {
  boardView,
  initialBoard,
  nextWake,
  press,
  PRESS_AGE_LIMIT_MS,
  step,
  type BoardInput,
  type BoardState,
  type BoardView,
  type ControlRef,
  type PressDecision,
} from "./board-interaction";
import { reducedMotion } from "./float-text";

/**
 * How long an event waited before the page got to it: a busy phone hands a press over late,
 * and the settle is about when the finger came down, not when the handler ran. The stamp and
 * `performance.now()` share one origin; a stamp from the future, none at all, or one too old
 * to trust counts as now.
 */
export function eventAge(event: Event, now = performance.now()): number {
  if (!(event.timeStamp > 0)) {
    return 0;
  }
  const age = now - event.timeStamp;
  return age > 0 && age < PRESS_AGE_LIMIT_MS ? age : 0;
}

export interface BoardHost {
  /** The clock every input's time is read from. */
  readonly clock: () => number;
  /** How long an event waited before its handler ran, on that clock. */
  readonly pressAge: (event: Event) => number;
  send(input: BoardInput): void;
  press(input: {
    control: ControlRef;
    by: "finger" | "keyboard";
    intent: "act" | "trouble";
    downAt: number | undefined;
    event: Event;
  }): PressDecision;
  view(): BoardView;
  subscribe(paint: () => void): () => void;
}

export function createBoardHost({
  clock,
  pressAge = eventAge,
  reduced = reducedMotion,
  signal,
}: {
  clock: () => number;
  pressAge?: ((event: Event) => number) | undefined;
  reduced?: () => boolean;
  signal?: AbortSignal | undefined;
}): BoardHost {
  let state: BoardState = initialBoard();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const painters = new Set<() => void>();

  const disarm = (): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
  };
  const notify = (): void => {
    for (const paint of [...painters]) {
      paint();
    }
  };
  /** Re-armed before any painter runs, so one that throws cannot strand a hold. */
  const rearm = (): void => {
    disarm();
    const now = clock();
    const wake = nextWake(state, now);
    if (wake !== undefined && signal?.aborted !== true) {
      timer = setTimeout(
        () => {
          timer = undefined;
          rearm();
          notify();
        },
        Math.max(0, wake - now),
      );
    }
  };
  const change = (next: BoardState, always: boolean): void => {
    const changed = next !== state;
    state = next;
    rearm();
    if (changed || always) {
      notify();
    }
  };

  signal?.addEventListener("abort", disarm, { once: true });

  return {
    clock,
    pressAge,
    send(input) {
      change(step(state, input), false);
    },
    press({ control, by, intent, downAt, event }) {
      state = step(state, { kind: "motion", reduced: reduced() });
      const at = clock();
      const result = press(state, {
        control,
        pressedAt: downAt ?? at - pressAge(event),
        at,
        by,
        intent,
      });
      change(result.state, true);
      return result.decision;
    },
    view: () => boardView(state, clock()),
    subscribe(paint) {
      painters.add(paint);
      return () => {
        painters.delete(paint);
      };
    },
  };
}
