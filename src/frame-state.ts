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
  /** The amount key: ×1, ×10, Max, kept on the device as Buys' is. */
  readonly advanceAmount: () => void;
  readonly site: () => SiteId;
  readonly go: (site: SiteId) => void;
  readonly openWorkforce: () => void;
};
