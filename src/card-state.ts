/**
 * Which cards over the board are up. A card writes its shown state here, so
 * the screen can ask whether one is up without reading the DOM `hidden` flag.
 */

const up = new WeakSet<HTMLElement>();

/** Shows or hides a card and records which, so `cardUp` can answer later. */
export function showCard(card: HTMLElement, shown: boolean): void {
  card.hidden = !shown;
  if (shown) {
    up.add(card);
  } else {
    up.delete(card);
  }
}

/** The last state `showCard` recorded; a card never shown is not up. */
export function cardUp(card: HTMLElement): boolean {
  return up.has(card);
}
