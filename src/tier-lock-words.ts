import type { TierLock } from "./crew";
import { formatCompact, formatCount } from "./format";
import type { Tier } from "./tiers";

/**
 * Words on a locked tier card (M12-2, #250). The card names the depth the
 * machine opens at, never a price or a wait, in the dad's voice.
 */

function relicShort(lock: Extract<TierLock, { kind: "relic" }>): string {
  return lock.relic.name.split(" ")[0] ?? lock.relic.name;
}

function depthOf(lock: TierLock): number {
  return lock.at;
}

/** The short line under the name: `Borer · 10M` or `Machine · 120M`. */
export function lockRateLine(tier: Tier, lock: TierLock): string {
  const label = lock.kind === "depth" ? tier.shortName : relicShort(lock);
  return `${label} · ${formatCompact(depthOf(lock))}`;
}

/** The friendly line on the card body. */
export function lockBodyLine(tier: Tier, lock: TierLock): string {
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
  const at = formatCount(depthOf(lock));
  return lock.kind === "depth"
    ? `${tier.name}, locked. Joins your crew at ${at} stones down.`
    : `${tier.name}, locked. Needs the ${lock.relic.name}, found ${at} stones down.`;
}
