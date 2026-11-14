import { staffNeeded } from "./engineers";
import type { Trouble } from "./hazards";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { TIERS } from "./tiers";

/** The crew plate's numbers: everyone, what the running machines leave, and that as whole workers. */
export type CrewCounts = {
  readonly crew: number;
  readonly spare: number;
  readonly free: number;
};

/** Helpers and kids, less the staff of every machine the crew needs (#536). */
export function crewCounts(
  mountain: Mountain,
  now: number,
  trouble?: Trouble,
): CrewCounts {
  // A hand on a machine that moves nothing is as good as free (#536).
  const { needed } = effectiveRates(mountain, now, trouble);
  const crew = mountain.owned.helper + mountain.owned.kid;
  const spare =
    crew -
    TIERS.reduce(
      (used, tier) => used + needed[tier.id] * staffNeeded(mountain, tier),
      0,
    );
  return { crew, spare, free: Math.max(0, Math.floor(spare)) };
}
