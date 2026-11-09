const SLOP_PX = 10;

/** The list that scrolls under a card, if this tap started in one. */
function scroller(card: HTMLElement): HTMLElement | null {
  const found = card.closest(
    ".workshop-recipes, .engineers-dialog, .board-sheet-list",
  );
  return found instanceof HTMLElement ? found : null;
}

/** How the tap that reached `buy` began. */
export interface CardPress {
  /**
   * The finger went down while `settling` said the sheet had only just
   * opened: the second tap of a double tap that opened it.
   */
  readonly early: boolean;
}

/**
 * `buy` runs for a tap or a key press. A finger that moves, or a list that
 * scrolls under the finger, does not buy. Pressed state covers `card`.
 * `settling` is asked when the finger goes down, so a press that started
 * early stays early however long it is held, and again at a finger's click:
 * a touch's click lands where the finger lifts, on a row that may have slid
 * under it as the drawer rose and never saw the press (#373). A keyboard
 * press (a click with no pointer, detail 0) is never early.
 */
export function buyOnTap(
  card: HTMLElement,
  button: HTMLButtonElement,
  buy: (press: CardPress) => void,
  { settling }: { settling?: () => boolean } = {},
): void {
  let armed = false;
  let moved = false;
  let gesture = 0;
  let blocked = -1;
  let early = false;
  /** The click this handler sends itself at a finger's pointerup. */
  let fromPointerUp = false;
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
    early = settling?.() === true;
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
    // A press is early once, and only a finger's click is: a key press has no finger.
    const finger = event.detail !== 0 || fromPointerUp;
    const press = { early: finger && (early || settling?.() === true) };
    early = false;
    if (blocked === gesture || button.disabled) {
      armed = false;
      moved = false;
      return;
    }
    armed = false;
    moved = false;
    buy(press);
  });
}
