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

/** Helpers and kids, less the staff every running machine needs. */
export function crewCounts(
  mountain: Mountain,
  now: number,
  trouble?: Trouble,
): CrewCounts {
  const { running } = effectiveRates(mountain, now, trouble);
  const crew = mountain.helpers + mountain.kids;
  const spare =
    crew -
    TIERS.reduce(
      (used, tier) => used + running[tier.id] * staffNeeded(mountain, tier),
      0,
    );
  return { crew, spare, free: Math.max(0, Math.floor(spare)) };
}
