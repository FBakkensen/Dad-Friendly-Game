import type { BoardHost } from "./board-host";
import { write } from "./board-dom";
import { plateButton } from "./board-save";
import { pressOnBoard } from "./card-tap";
import type { BuyAmount } from "./tiers";

/*
 * The Buys drawer's amount key (#358): one fat key in the head that cycles ×1, ×10 and Max for
 * every row at once. It is pressed through the board's model like the "i", so the second tap of
 * the double tap that opened Buys changes nothing. The amount is a habit of this device's hand,
 * not progress: it is kept beside the vein wait, never in the save, and a store that throws
 * starts at ×1.
 */

const AMOUNT_KEY = "dad-friendly-buy-amount";

const AMOUNTS: readonly BuyAmount[] = ["one", "ten", "max"];

/** The key's face, and how a screen reader says each amount. */
const AMOUNT_WORDS: Readonly<
  Record<BuyAmount, { readonly face: string; readonly spoken: string }>
> = {
  one: { face: "×1", spoken: "one" },
  ten: { face: "×10", spoken: "ten" },
  max: { face: "Max", spoken: "as many as you can afford" },
};

/** The amount after this one: ×1, ×10, Max, then ×1 again. */
export function nextAmount(amount: BuyAmount): BuyAmount {
  return AMOUNTS[(AMOUNTS.indexOf(amount) + 1) % AMOUNTS.length] ?? "one";
}

/** "Buys ten a tap. Tap for as many as you can afford." */
export function amountAria(amount: BuyAmount): string {
  const now = AMOUNT_WORDS[amount].spoken;
  const next = AMOUNT_WORDS[nextAmount(amount)].spoken;
  return `Buys ${now} a tap. Tap for ${next}.`;
}

type DeviceStorage = Pick<Storage, "getItem" | "setItem">;

function storedAmount(storage: DeviceStorage | undefined): BuyAmount {
  try {
    const raw = (storage ?? localStorage).getItem(AMOUNT_KEY);
    return AMOUNTS.find((amount) => amount === raw) ?? "one";
  } catch {
    return "one";
  }
}

function storeAmount(
  storage: DeviceStorage | undefined,
  amount: BuyAmount,
): void {
  try {
    (storage ?? localStorage).setItem(AMOUNT_KEY, amount);
  } catch {
    // Private mode or a full store: the next open starts at ×1.
  }
}

export interface AmountKey {
  readonly root: HTMLButtonElement;
  /** How many a row's tap buys now. */
  readonly amount: () => BuyAmount;
}

/**
 * The amount key, at the amount this device last chose. A press the board lets act moves to the
 * next amount, keeps it, and calls `changed` so the rows repaint.
 */
export function createAmountKey({
  board,
  storage,
  changed,
}: {
  board: BoardHost;
  /** Where the amount is kept; localStorage when undefined. */
  storage: DeviceStorage | undefined;
  changed: () => void;
}): AmountKey {
  let amount = storedAmount(storage);
  const root = plateButton(AMOUNT_WORDS[amount].face);
  root.classList.add("buy-amount");
  const face = root.querySelector<HTMLElement>(".board-platebtn-text");
  const paint = (): void => {
    if (face !== null) {
      write(face, AMOUNT_WORDS[amount].face);
    }
    root.setAttribute("aria-label", amountAria(amount));
  };
  paint();
  pressOnBoard(root, board, { layer: "buys", id: "amount" }, (decision) => {
    if (decision !== "act") {
      return;
    }
    amount = nextAmount(amount);
    storeAmount(storage, amount);
    paint();
    changed();
  });
  return { root, amount: () => amount };
}
