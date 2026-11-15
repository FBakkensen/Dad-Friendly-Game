import type { TierLock } from "./crew";
import { formatCompact, formatCount } from "./format";
import type { Tier } from "./tiers";

/**
 * Words on a locked tier card (M12-2, #250). The card names the depth the
 * machine opens at, never a price or a wait, in the dad's voice.
 */

type AtDepth = Extract<TierLock, { kind: "depth" | "relic" }>;

function relicShort(lock: Extract<TierLock, { kind: "relic" }>): string {
  return lock.relic.name.split(" ")[0] ?? lock.relic.name;
}

function depthOf(lock: AtDepth): number {
  return lock.at;
}

/**
 * A fresh mine's door (#653): a later part's door is only `later`. What
 * comes next stays vague (dad-friendly-game.md, Numbers and discoveries).
 */
const LATER = "later";

function capitalised(words: string): string {
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The short line under the name (#508): `Opens at 10M stones`, or for a relic's tier `With the
 * Crown at 259.3M`. The tier's own name is already on the row.
 */
export function lockRateLine(lock: TierLock): string {
  if (lock.kind === "later") {
    return capitalised(LATER);
  }
  const at = formatCompact(depthOf(lock));
  return lock.kind === "depth"
    ? `Opens at ${at} stones`
    : `With the ${relicShort(lock)} at ${at}`;
}

/** A narrower line where the first does not fit: `Opens at 10M`. A relic's line has none. */
export function lockShortLine(lock: TierLock): string | undefined {
  if (lock.kind === "later") {
    return capitalised(LATER);
  }
  return lock.kind === "depth"
    ? `Opens at ${formatCompact(depthOf(lock))}`
    : undefined;
}

/** The friendly line on the card body. */
export function lockBodyLine(tier: Tier, lock: TierLock): string {
  if (lock.kind === "later") {
    return `The ${tier.name} opens ${LATER}.`;
  }
  const at = formatCompact(depthOf(lock));
  if (lock.kind === "depth") {
    return `The ${tier.name} joins your crew at ${at} stones. Keep digging, Dad!`;
  }
  const relic = relicShort(lock);
  if (tier.id === "machine") {
    return `The Great Machine wakes up with the ${relic} at ${at} stones. You've got this!`;
  }
  return `${tier.name}s join with the ${relic} at ${at} stones. Nearly there, Dad!`;
}

/** What a screen reader hears on a locked card. */
export function lockAria(tier: Tier, lock: TierLock): string {
  if (lock.kind === "later") {
    return `${tier.name}, locked. Opens ${LATER}.`;
  }
  const at = formatCount(depthOf(lock));
  return lock.kind === "depth"
    ? `${tier.name}, locked. Joins your crew at ${at} stones down.`
    : `${tier.name}, locked. Needs the ${lock.relic.name}, found ${at} stones down.`;
}
