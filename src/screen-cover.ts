import type { KeyId } from "./key-rail";
import type { ProgressSnapshot } from "./progress-store";
import { engineersNote, WORKSHOP_NOTE } from "./screen-words";
import { noteFor } from "./teach";

export interface CoverState {
  /** A card open over the board. */
  readonly cardUp: boolean;
  /** The model's stack holds a drawer. */
  readonly drawerOpen: boolean;
  /** The board note shows. */
  readonly noteOn: boolean;
}

export interface Cover {
  /** A card that opens by itself closes the drawers. */
  readonly closeDrawers: boolean;
  /** The note and the New sign go while a card or a drawer is up. */
  readonly putAway: boolean;
  /** The New sign waits while anything else is up. */
  readonly holdSign: boolean;
}

/** What the card, the drawers and the note ask of each other. */
export function coverFor({ cardUp, drawerOpen, noteOn }: CoverState): Cover {
  const putAway = cardUp || drawerOpen;
  return { closeDrawers: cardUp, putAway, holdSign: noteOn || putAway };
}

export interface SignWant {
  readonly id: string;
  readonly key: KeyId;
  readonly words: string;
}

/** The New sign the save asks for, in the order teach.ts lists them. */
export function wantedSign(view: ProgressSnapshot): SignWant | undefined {
  const id = view.ready ? noteFor(view.mountain) : undefined;
  if (id === "workshop") {
    return { id, key: "workshop", words: WORKSHOP_NOTE };
  }
  const first = view.mountain.engineers?.[0]?.name;
  if (id === "engineers" && first !== undefined) {
    return { id, key: "engineers", words: engineersNote(first) };
  }
  return undefined;
}
