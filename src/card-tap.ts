import { eventAge } from "./board-host";

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
  readonly by: "finger" | "keyboard";
  /**
   * When this gesture's finger came down on the card, on the board's clock. Undefined for a
   * key press, and for a finger's click on a card that saw no pointerdown of its own: the board
   * then judges it by the click's own age.
   */
  readonly downAt: number | undefined;
}

/**
 * `buy` runs for a tap or a key press, with how it came and its click. A finger that moves, or
 * a list that scrolls under the finger, does not buy. Pressed state covers `card`. The finger-down
 * time is kept from pointerdown to the click, so a press held long is still judged by when it came
 * down. It is dropped at the click, at a cancel or a drag, and on `forget()`, so a lost press can
 * never reach a later one. A keyboard press is a click with no pointer (detail 0) that this
 * handler did not send itself at a finger's pointerup.
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
  let downAt: number | undefined;
  /** The click this handler sends itself at a finger's pointerup. */
  let fromPointerUp = false;
  let x = 0;
  let y = 0;
  let top = 0;

  const forget = (): void => {
    downAt = undefined;
  };
  card.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }
    gesture += 1;
    armed = true;
    moved = false;
    downAt = clock() - pressAge(event);
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
    forget();
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
      forget();
      return;
    }
    const target = event.target;
    if (target instanceof Node && button.contains(target)) {
      return;
    }
    armed = false;
    fromPointerUp = true;
    try {
      button.click();
    } finally {
      fromPointerUp = false;
    }
  });
  button.addEventListener("click", (event) => {
    const finger = event.detail !== 0 || fromPointerUp;
    const press: CardPress = finger
      ? { by: "finger", downAt }
      : { by: "keyboard", downAt: undefined };
    forget();
    armed = false;
    moved = false;
    if (blocked === gesture || button.disabled) {
      return;
    }
    buy(press, event);
  });
  return { forget };
}
