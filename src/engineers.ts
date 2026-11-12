import { oneOffStretch } from "./scale";
import { factor } from "./economy/factors";
import type { Mountain } from "./mountain";
import { TIERS, type TierId } from "./tiers";

/**
 * Engineers (M7 §3). A few named hands, never a second currency.
 * The first arrives free with the first borer and tends it. Promoting
 * spends stones and one worker. See docs/DESIGN.md.
 */

/** Closed list of warm names. At most one engineer per name. */
export const ENGINEER_NAMES = ["Ada", "Nils", "Ruth", "Otto", "Mae"] as const;

export type EngineerName = (typeof ENGINEER_NAMES)[number];

/** Machine tiers an engineer can tend, plus waiting at camp. */
const MACHINE_POSTS = [
  "cart",
  "drill",
  "borer",
  "machine",
] as const satisfies readonly TierId[];

/**
 * Where an engineer works when at home. A trip does not change it: away is
 * read from the expeditions (`onTrip`), and the post is where they come back to.
 */
export const ENGINEER_POSTS = [...MACHINE_POSTS, "camp"] as const;

export type EngineerPost = (typeof ENGINEER_POSTS)[number];

/** Where an engineer is now: their post, or "tunnel" while away. The save writes this. */
const DUTIES = [...ENGINEER_POSTS, "tunnel"] as const;

export type Duty = (typeof DUTIES)[number];

/** Apprentice, Journeyman, Master. */
export type EngineerRank = 0 | 1 | 2;

export type Engineer = {
  readonly name: EngineerName;
  readonly rank: EngineerRank;
  readonly trips: number;
  readonly post: EngineerPost;
};

/** An engineer as the save and the screen show them: away reads "tunnel". */
export type DutyEngineer = Omit<Engineer, "post"> & {
  readonly post: Duty;
};

/** Away on an expedition: the one test for it. */
export function onTrip(
  mountain: Pick<Mountain, "expeditions">,
  name: EngineerName,
): boolean {
  return mountain.expeditions.some((trip) => trip.engineer === name);
}

/** The crew as the save and the screen show them, derived from the trips. */
export function onDuty(
  mountain: Pick<Mountain, "engineers" | "expeditions">,
): readonly DutyEngineer[] {
  return mountain.expeditions.length === 0
    ? mountain.engineers
    : mountain.engineers.map((engineer) =>
        onTrip(mountain, engineer.name)
          ? { ...engineer, post: "tunnel" }
          : engineer,
      );
}

/** The engineers at home, who tend their posts. */
export function atHome(
  mountain: Pick<Mountain, "engineers" | "expeditions">,
): readonly Engineer[] {
  return mountain.expeditions.length === 0
    ? mountain.engineers
    : mountain.engineers.filter((engineer) => !onTrip(mountain, engineer.name));
}

/** Never more than five. Mirrored in firestore.rules. */
export const MAX_ENGINEERS = 5;

/** A sanity cap for saves. Mirrored in firestore.rules. */
export const MAX_ENGINEER_TRIPS = 1_000_000;

/** Journeyman after 3 trips; Master after 6 more (9). */
export const JOURNEYMAN_TRIPS = 3;
export const MASTER_TRIPS = 9;

/**
 * Stones for the next promotion. Doubles for each engineer already in the
 * crew: 1,000,000 with none, so 2,000,000 once Ada is here (Nils), then
 * 4,000,000, 8,000,000 and 16,000,000. The pacing sim pays this same price.
 * The plain dad then reaches the bottom on day 5.5, and a second run on
 * day 4. The first mountain still takes at least 5 days (#163, #171).
 */
export const PROMOTE_BASE_COST = 1_000_000;

/** +10 / +20 / +30 percent, as tenths, for ranks 0, 1 and 2. */
export const TENDING_TENTHS = [1, 2, 3] as const;

export function rankOf(trips: number): EngineerRank {
  if (trips >= MASTER_TRIPS) {
    return 2;
  }
  if (trips >= JOURNEYMAN_TRIPS) {
    return 1;
  }
  return 0;
}

/** Rounded up to a whole stone, as upgradeCost is: a kid-run stretch is not whole, and the pocket must stay whole. */
export function promoteCost(mountain: Mountain): number {
  return Math.ceil(
    Number(
      (
        PROMOTE_BASE_COST *
        oneOffStretch(mountain) *
        2 ** mountain.engineers.length
      ).toPrecision(12),
    ),
  );
}

/** The first warm name no engineer has yet, or undefined when all are taken. */
export function nextEngineerName(
  engineers: readonly Engineer[],
): EngineerName | undefined {
  return ENGINEER_NAMES.find((name) =>
    engineers.every((engineer) => engineer.name !== name),
  );
}

/**
 * A promotion would go through now: a name is free, a worker can step up,
 * and the pocket covers the price. The rule `promote` applies, read only.
 */
export function canPromote(mountain: Mountain): boolean {
  return (
    nextEngineerName(mountain.engineers) !== undefined &&
    mountain.helpers >= 1 &&
    mountain.pocket >= promoteCost(mountain)
  );
}

/**
 * Turns one worker into an engineer at camp. Same mountain when the crew is
 * full, no worker is free to step up, or the pocket can't cover the price.
 */
export function promote(mountain: Mountain): Mountain {
  const engineers = mountain.engineers;
  const name = nextEngineerName(engineers);
  if (
    name === undefined ||
    mountain.helpers < 1 ||
    mountain.pocket < promoteCost(mountain)
  ) {
    return mountain;
  }
  return {
    ...mountain,
    pocket: mountain.pocket - promoteCost(mountain),
    helpers: mountain.helpers - 1,
    engineers: [...engineers, { name, rank: 0, trips: 0, post: "camp" }],
  };
}

/**
 * The first engineer, free, already tending the borers. Does not take a
 * worker out of the pool: machines that were running stay running.
 * Once is enough; a crew that already has an engineer is unchanged.
 */
export function grantFirstEngineer(mountain: Mountain): {
  readonly mountain: Mountain;
  readonly joined: boolean;
} {
  if (mountain.borers < 1 || mountain.engineers.length > 0) {
    return { mountain, joined: false };
  }
  return {
    joined: true,
    mountain: {
      ...mountain,
      engineers: [
        { name: ENGINEER_NAMES[0], rank: 0, trips: 0, post: "borer" },
      ],
    },
  };
}

/** Moves one engineer to a post. Unknown index, or the post they already hold, is a no-op. */
export function station(
  mountain: Mountain,
  index: number,
  post: EngineerPost,
): Mountain {
  const engineers = mountain.engineers;
  const engineer = engineers[index];
  if (engineer === undefined || engineer.post === post) {
    return mountain;
  }
  const next = engineers.slice();
  next[index] = { ...engineer, post };
  return { ...mountain, engineers: next };
}

/**
 * One expedition finished. Rank follows the trip count. At the trip cap the
 * mountain is unchanged so a save cannot grow past the rules.
 */
export function addTrip(mountain: Mountain, index: number): Mountain {
  const engineers = mountain.engineers;
  const engineer = engineers[index];
  if (engineer === undefined || engineer.trips >= MAX_ENGINEER_TRIPS) {
    return mountain;
  }
  const trips = engineer.trips + 1;
  const next = engineers.slice();
  next[index] = { ...engineer, trips, rank: rankOf(trips) };
  return { ...mountain, engineers: next };
}

/**
 * Workers one Great Machine needs while an engineer tends that tier.
 * Untended, it still needs the tier's own staff (10). Tuned so the pacing
 * dads run one after the Hammer and still take at least 5 days.
 */
export const TENDED_MACHINE_STAFF = 5;

/** Workers one of this tier needs right now. */
export function staffNeeded(
  mountain: Mountain,
  tier: { readonly id: TierId; readonly staff: number },
): number {
  if (tier.id !== "machine" || !machineTended(mountain)) {
    return tier.staff;
  }
  return TENDED_MACHINE_STAFF;
}

/**
 * Workers a buy would need. Buying a Great Machine moves a free engineer
 * onto it, so the bill is the tended staff even before the post changes.
 */
export function staffForBuy(
  mountain: Mountain,
  tier: { readonly id: TierId; readonly staff: number },
): number {
  if (tier.id === "machine" && hasEngineerOutOfTunnel(mountain)) {
    return TENDED_MACHINE_STAFF;
  }
  return staffNeeded(mountain, tier);
}

/**
 * The pacing dad's one engineer. A Great Machine comes first, because that
 * is what lets it run on a small crew; otherwise the borers. Someone already
 * in a tunnel stays there.
 */
export function tendBestTier(mountain: Mountain): Mountain {
  const engineers = mountain.engineers;
  if (engineers.length === 0) {
    return mountain;
  }
  const wanted: EngineerPost | undefined =
    mountain.machines > 0
      ? "machine"
      : mountain.borers > 0
        ? "borer"
        : undefined;
  if (
    wanted === undefined ||
    atHome(mountain).some((engineer) => engineer.post === wanted)
  ) {
    return mountain;
  }
  const index = engineers.findIndex(
    (engineer) => !onTrip(mountain, engineer.name),
  );
  if (index < 0) {
    return mountain;
  }
  return station(mountain, index, wanted);
}

function machineTended(mountain: Mountain): boolean {
  return atHome(mountain).some((engineer) => engineer.post === "machine");
}

function hasEngineerOutOfTunnel(mountain: Mountain): boolean {
  return atHome(mountain).length > 0;
}

/** M12 retune (#252): tending counts a quarter more, at every rank. */
export const TENDING_GAIN = 1.25;

/**
 * Grandpa (#338): after you pass the mine, the old dad stays on. He only
 * tends, at an apprentice's pace (gentle, so the kid's run still stretches:
 * the pacing sims pin it), never explores, and is never promoted. Nothing is
 * saved for him: he is there whenever the Legacy is. Tending speeds his tier;
 * it does not change its crew bill.
 */
export const GRANDPA_RANK: EngineerRank = 0;

/**
 * The group Grandpa tends: of the machines that are running (fully staffed,
 * as `effectiveRates` staffs them, #500) and that no engineer tends, the one
 * with the most base output, `running * tier.perSecond`. A tie goes to the
 * higher tier. Undefined before a pass, or with nothing running to tend.
 * An idle machine never takes him, and one new borer never pulls him off a
 * big group of drills, so buying a machine never slows the crew (#356).
 */
export function grandpaPost(
  mountain: Mountain,
  running: Readonly<Record<TierId, number>>,
): TierId | undefined {
  if (mountain.legacy < 1) {
    return undefined;
  }
  const tended = new Set<TierId | EngineerPost>(
    atHome(mountain).map((one) => one.post),
  );
  let best: TierId | undefined;
  let bestOutput = 0;
  for (const tier of [...TIERS].reverse()) {
    const output = running[tier.id] * tier.perSecond;
    // Biggest tier first, so only a strictly larger group displaces a tie.
    if (
      tier.staff > 0 &&
      running[tier.id] > 0 &&
      !tended.has(tier.id) &&
      output > bestOutput
    ) {
      best = tier.id;
      bestOutput = output;
    }
  }
  return best;
}

/**
 * How many tenths faster a tier runs because an engineer is posted there.
 * The best rank wins; they do not stack. Camp and tunnel tend nothing.
 * After a pass, Grandpa counts at GRANDPA_RANK on his post (#338), which
 * he picks from what `running` says runs.
 * Ranks are +1, +2 and +3 tenths, times TENDING_GAIN. A sweep may scale it.
 */
export function tendingTenths(
  mountain: Mountain,
  tierId: TierId,
  running: Readonly<Record<TierId, number>>,
): number {
  const scale = factor("tending.gain") * TENDING_GAIN;
  const grandpa =
    grandpaPost(mountain, running) === tierId
      ? TENDING_TENTHS[GRANDPA_RANK] * scale
      : 0;
  return Math.max(grandpa, engineerTenths(mountain, tierId));
}

/** The tenths the engineers at home add to a tier, without Grandpa. */
export function engineerTenths(mountain: Mountain, tierId: TierId): number {
  const scale = factor("tending.gain") * TENDING_GAIN;
  let best = 0;
  for (const engineer of atHome(mountain)) {
    if (engineer.post === tierId) {
      best = Math.max(best, TENDING_TENTHS[engineer.rank] * scale);
    }
  }
  return best;
}

/** Untrusted save data: closed names and posts, rank matching trips, at most five. */
export function parseEngineers(
  value: unknown,
): readonly DutyEngineer[] | undefined {
  if (!Array.isArray(value) || value.length > MAX_ENGINEERS) {
    return undefined;
  }
  const parsed: DutyEngineer[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const engineer = parseEngineer(item);
    if (engineer === undefined || seen.has(engineer.name)) {
      return undefined;
    }
    seen.add(engineer.name);
    parsed.push(engineer);
  }
  return parsed;
}

function parseEngineer(value: unknown): DutyEngineer | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (
    keys.length !== 4 ||
    keys.some(
      (key) =>
        key !== "name" && key !== "rank" && key !== "trips" && key !== "post",
    )
  ) {
    return undefined;
  }
  const name = record["name"];
  const rank = record["rank"];
  const trips = record["trips"];
  const post = record["post"];
  if (
    !isEngineerName(name) ||
    !isCount(trips) ||
    trips > MAX_ENGINEER_TRIPS ||
    !isDuty(post) ||
    rank !== rankOf(trips)
  ) {
    return undefined;
  }
  return { name, rank: rankOf(trips), trips, post };
}

function isEngineerName(value: unknown): value is EngineerName {
  return (
    typeof value === "string" &&
    (ENGINEER_NAMES as readonly string[]).includes(value)
  );
}

function isDuty(value: unknown): value is Duty {
  return (
    typeof value === "string" && (DUTIES as readonly string[]).includes(value)
  );
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}
