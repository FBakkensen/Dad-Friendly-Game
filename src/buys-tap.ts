import { buyRowView } from "./buys-rows";
import type { TroubleTier } from "./hazards";
import type { ProgressSnapshot } from "./progress-store";
import type { ReadyPick } from "./ready-now";
import type { TierId } from "./tiers";

/** What a Buys row's tap does, once the board's model lets it act. */
export type BuysTap =
  | { readonly kind: "blink" }
  | { readonly kind: "hire" }
  | { readonly kind: "trouble"; readonly tier: TroubleTier }
  | { readonly kind: "buy" };

/**
 * The row is read again at the tap, so a pocket that fell since the last paint buys nothing. A
 * row no longer shown (one the open drawer holds in place) or too dear blinks. The staffing New
 * row hires a worker: another of its machine would stand idle too. A troubled row is a trouble
 * press, and anything else buys.
 */
export function buysTap({
  snapshot,
  tier,
  pick,
  now,
  guided,
}: {
  snapshot: Pick<ProgressSnapshot, "mountain" | "trouble">;
  tier: TierId;
  pick: ReadyPick;
  now: number;
  /** The staffing New row's tier, if one shows. */
  guided: TierId | undefined;
}): BuysTap {
  const { mountain, trouble } = snapshot;
  const row = buyRowView({ mountain, now, trouble, tier, pick, guided });
  if (!row.shown || !row.can) {
    return { kind: "blink" };
  }
  if (row.guided) {
    return { kind: "hire" };
  }
  if (trouble?.tier === tier) {
    return { kind: "trouble", tier: trouble.tier };
  }
  return { kind: "buy" };
}
