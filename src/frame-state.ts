import type { Stage } from "./line";
import type { Mountain } from "./mountain";
import type { SiteId } from "./next-view";
import type { ProgressStore } from "./progress-store";
import type { BuyAmount } from "./tiers";
import type { LevelMachineId, MineLevelId } from "./mine-levels";

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
  /** Global Transport sheet (#768), sibling to Workforce under Slice 2 Part 1. */
  readonly openTransport: () => void;
  /** Research Lab sheet (#779), opened from the City's Research Lab door under Slice 2 Part 2. */
  readonly openResearch: () => void;
  /** A stage's list (#661), from a tap on its row in the mine: with two levels, a level's row opens that level's list (#680). */
  readonly openStage: (stage: Stage, level?: MineLevelId) => void;
  /** The machine card (#680), from a tap on a drilling or haulage machine's key with two levels: which level? */
  readonly openMachine: (id: LevelMachineId) => void;
};
