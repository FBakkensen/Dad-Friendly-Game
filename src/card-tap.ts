const SLOP_PX = 10;

/** The list that scrolls under a card, if this tap started in one. */
function scroller(card: HTMLElement): HTMLElement | null {
  const found = card.closest(
    ".sheet-scroll, .upgrades-scroll, .tier-grid, .workshop-recipes, .engineers-dialog",
  );
  return found instanceof HTMLElement ? found : null;
}

/**
 * `buy` runs for a tap or a key press. A finger that moves, or a list that
 * scrolls under the finger, does not buy. Pressed state covers `card`.
 */
export function buyOnTap(
  card: HTMLElement,
  button: HTMLButtonElement,
  buy: () => void,
): void {
  let armed = false;
  let moved = false;
  let gesture = 0;
  let blocked = -1;
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
      return;
    }
    const target = event.target;
    if (target instanceof Node && button.contains(target)) {
      return;
    }
    armed = false;
    button.click();
  });
  button.addEventListener("click", () => {
    if (blocked === gesture || button.disabled) {
      armed = false;
      moved = false;
      return;
    }
    armed = false;
    moved = false;
    buy();
  });
}
