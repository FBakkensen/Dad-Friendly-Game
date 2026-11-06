import type { Mountain } from "./mountain";
import type { EngineerRank } from "./engineers";
import type { TierId } from "./tiers";

/**
 * Grandpa (#338): after you pass the mine, the old dad stays on. He only
 * tends, at an apprentice's pace (gentle, so the kid's run still stretches:
 * the pacing sims pin it), never explores, and is never promoted. Nothing is
 * saved for him: he is there whenever the Legacy is, on the biggest machine
 * no engineer is tending. Tending speeds that tier; it does not change its
 * crew bill.
 */
export const GRANDPA_RANK: EngineerRank = 0;

/** Biggest first: where his years count most. */
const MACHINES = ["machine", "borer", "drill", "cart"] as const;

const OWNED: Readonly<Record<(typeof MACHINES)[number], keyof Mountain>> = {
  machine: "machines",
  borer: "borers",
  drill: "drills",
  cart: "carts",
};

/** The machine he tends, or undefined (no pass yet, or nothing to tend). */
export function grandpaPost(mountain: Mountain): TierId | undefined {
  if ((mountain.legacy ?? 0) < 1) {
    return undefined;
  }
  const tended = new Set((mountain.engineers ?? []).map((one) => one.post));
  return MACHINES.find((tier) => {
    const count = mountain[OWNED[tier]];
    return typeof count === "number" && count > 0 && !tended.has(tier);
  });
}
