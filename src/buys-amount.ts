import { write } from "./board-dom";
import type { BuyAmount } from "./tiers";

/*
 * The Buys drawer's amount key (#358): one fat key in the head that cycles ×1, ×10 and Max for
 * every row at once. It is pressed through the board's model like the "i", so the second tap of
 * the double tap that opened Buys changes nothing. The amount is a habit of this device's hand,
 * not progress: it is kept on this device, never in the save, and a store that throws
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
function nextAmount(amount: BuyAmount): BuyAmount {
  return AMOUNTS[(AMOUNTS.indexOf(amount) + 1) % AMOUNTS.length] ?? "one";
}

/** "Buys ten a tap. Tap for as many as you can afford." */
function amountAria(amount: BuyAmount): string {
  const now = AMOUNT_WORDS[amount].spoken;
  const next = AMOUNT_WORDS[nextAmount(amount)].spoken;
  return `Buys ${now} a tap. Tap for ${next}.`;
}

export type DeviceStorage = Pick<Storage, "getItem" | "setItem">;

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

/**
 * The amount this device last chose (×1 when none, or when the store throws),
 * and the step to the next one, which keeps it. Buys' key and the slice 1
 * frame's (#659) both hold one: one amount for the device.
 */
export type DeviceAmount = {
  readonly amount: () => BuyAmount;
  /** ×1, ×10, Max, then ×1 again; kept on the device. */
  readonly advance: () => void;
};

export function deviceAmount(storage: DeviceStorage | undefined): DeviceAmount {
  let amount = storedAmount(storage);
  return {
    amount: () => amount,
    advance: () => {
      amount = nextAmount(amount);
      storeAmount(storage, amount);
    },
  };
}

/** The key's face, and how a screen reader says it: "Buys ten a tap. Tap for …". */
export function paintAmountKey(
  root: HTMLElement,
  face: HTMLElement,
  amount: BuyAmount,
): void {
  write(face, AMOUNT_WORDS[amount].face);
  root.setAttribute("aria-label", amountAria(amount));
}
