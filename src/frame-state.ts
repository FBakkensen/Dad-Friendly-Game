import type { Move } from "./economy/actions";
import type { Mountain } from "./mountain";
import type { SiteId } from "./next-view";
import type { ProgressStore } from "./progress-store";
import type { BuyAmount } from "./tiers";

/**
 * What the frame's parts share (#659): the store, the amount key's amount,
 * and the site in view. The frame (src/frame-screen.ts) owns it, and the
 * workforce sheet reads it.
 */

/** What a tap on the frame needs: the store, the amount, and where he is. */
export type FrameState = {
  readonly progress: ProgressStore;
  readonly mountain: () => Mountain;
  readonly amount: () => BuyAmount;
  readonly setAmount: (amount: BuyAmount) => void;
  readonly site: () => SiteId;
  readonly go: (site: SiteId) => void;
  readonly openWorkforce: () => void;
};

/** One of a tier is today's buy; ×10 and Max buy several in one move (#358). */
export function hireMove(
  count: number,
): Extract<Move, { kind: "buyTier" | "buyTiers" }> {
  return count === 1
    ? { kind: "buyTier", id: "helper" }
    : { kind: "buyTiers", id: "helper", count };
}
