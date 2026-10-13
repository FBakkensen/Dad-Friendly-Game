import {
  JOURNEYMAN_TRIPS,
  MASTER_TRIPS,
  type Engineer,
  type EngineerPost,
  type EngineerRank,
} from "./engineers";
import type { KeepsakeId } from "./expeditions";
import type { LostToolId } from "./lost-tools";
import { formatCompact, formatCount, formatDuration } from "./format";
import type { TroubleKind } from "./hazards";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { owned, tierById, type TierId } from "./tiers";
import { synergyBonus, upgradeLevel, type Upgrade } from "./upgrades";

// Player-facing wording shared by the screen's panels.

/** Away pay as a percentage people read, e.g. "30%" or "37.5%". */
export const percent = (share: number): string =>
  `${String(Number((share * 100).toFixed(1)))}%`;

/** Away pay can grow (Steady hands), so the copy reads the live rate. */
export const restingPace = (mountain: Mountain): string =>
  `at a resting pace (${percent(effectiveRates(mountain).awayPay)} of their speed)`;

/** Per-unit speed: one decimal while small and fractional (Better boots). */
export const formatSpeed = (speed: number): string =>
  speed < 10 && !Number.isInteger(speed)
    ? speed.toFixed(1)
    : formatCompact(speed);

/** 9:05, or 1:02:03 past an hour. */
export const formatClock = (ms: number): string => {
  const total = Math.ceil(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${String(minutes)}:${seconds}`;
};

/** "worker" or "workers". The save field stays `helpers`. */
export const workerWords = (count: number): string =>
  count === 1 ? "worker" : "workers";

/**
 * Buy UI, before and after the tap, when the next machine would sit idle.
 * No counts: the idle line already says how many.
 */
export const NEEDS_MORE_WORKERS = "Needs more workers to run";

/** "Your 12 workers make carts 12% faster." — or would, before it's bought. */
const synergyNow = (upgrade: Upgrade, mountain: Mountain): string => {
  if (upgrade.synergy === undefined) {
    return "";
  }
  const from = tierById(upgrade.synergy.from);
  const to = tierById(upgrade.synergy.to);
  const count = owned(mountain, from);
  if (count === 0) {
    return "";
  }
  const plural =
    count === 1 ? from.name.toLowerCase() : `${from.name.toLowerCase()}s`;
  const target =
    to.id === "machine"
      ? "the Great Machine"
      : `${to.shortName.toLowerCase()}s`;
  const bonus = percent(synergyBonus(mountain, upgrade));
  return upgradeLevel(mountain, upgrade.id) > 0
    ? `Your ${String(count)} ${plural} make ${target} ${bonus} faster.`
    : `Your ${String(count)} ${plural} would make ${target} ${bonus} faster.`;
};

/** What the upgrade does for this crew right now. */
export const upgradeNow = (
  upgrade: Upgrade,
  mountain: Mountain,
  at: number,
): string => {
  const rates = effectiveRates(mountain, at);
  switch (upgrade.id) {
    case "tap":
      return `Each tap now mines ${formatCount(rates.tapYield)}.`;
    case "boots":
      return `Each worker now mines ${formatSpeed(rates.tierSpeed.helper)}/s.`;
    case "steady":
      return `Time away now pays ${percent(rates.awayPay)} of crew speed.`;
    case "cartSyn":
    case "drillSyn":
    case "borerSyn":
    case "machineSyn":
      return synergyNow(upgrade, mountain);
  }
};

export const unlockWords = (upgrade: Upgrade): string => {
  if (upgrade.unlock === undefined) {
    return "Locked";
  }
  const tier = tierById(upgrade.unlock.tier);
  if (tier.id === "machine") {
    return "Unlocks with the Great Machine";
  }
  return upgrade.unlock.count === 1
    ? `Unlocks with your first ${tier.name.toLowerCase()}`
    : `Unlocks at ${String(upgrade.unlock.count)} ${tier.name.toLowerCase()}s`;
};

/** "the first 8 hours", or "a whole day" once the Shield lifts the cap. */
export const capWords = (capMs: number): string =>
  capMs >= 24 * 3_600_000
    ? "a whole day"
    : `the first ${formatDuration(capMs)}`;

export const tapWords = (stones: number): string =>
  stones === 1 ? "one stone" : `${formatCount(stones)} stones`;

/** Older saves that already own a borer, the one time their first engineer arrives. */
export const ENGINEER_WELCOME = "Your best worker steps up as engineer.";

/** The card's shout. No counts, no timers. */
export function troubleShout(kind: TroubleKind): string {
  switch (kind) {
    case "cave-in":
      return "Cave-in!";
    case "flood":
      return "Flood!";
    case "jam":
      return "Jam!";
  }
}

/** What a screen reader hears on a troubled card. No numbers. */
export function troubleAria(
  kind: TroubleKind,
  tier: { readonly id: string; readonly name: string },
): string {
  const who =
    tier.id === "machine"
      ? "The Great Machine needs"
      : `The ${tier.name.toLowerCase()}s need`;
  return `${troubleShout(kind)} ${who} a hand. Tap a few times, or hold, to help.`;
}

export const TROUBLE_FIXED = "Fixed! The crew cheers.";

export const fieldLogCopy = "Copy field log";
export const fieldLogCopied = "Copied";
export const fieldLogTitle = "Field log";
export const fieldLogFallback = "Select the log and copy it from here.";
export const fieldLogClose = "Back to the mountain";

/** Where the sheet can send an engineer. A tunnel is a trip, not a post you pick. */
export const ENGINEER_STATIONS: readonly {
  readonly post: Exclude<EngineerPost, "tunnel">;
  readonly label: string;
}[] = [
  { post: "cart", label: "Carts" },
  { post: "drill", label: "Drills" },
  { post: "borer", label: "Borers" },
  { post: "machine", label: "Machine" },
  { post: "camp", label: "Call to camp" },
];

const RANK_LABEL: Readonly<Record<EngineerRank, string>> = {
  0: "Apprentice",
  1: "Journeyman",
  2: "Master engineer",
};

/** Rank in words, for the lamp group. The sheet never prints the number. */
export const rankLabel = (rank: EngineerRank): string => RANK_LABEL[rank];

/**
 * One expedition from the next rank. Anything earlier stays quiet:
 * a count of trips would be a number, and "nearly" means nearly.
 */
export const rankHint = (
  engineer: Pick<Engineer, "rank" | "trips">,
): string | undefined => {
  if (engineer.rank === 0 && engineer.trips === JOURNEYMAN_TRIPS - 1) {
    return "nearly a Journeyman";
  }
  if (engineer.rank === 1 && engineer.trips === MASTER_TRIPS - 1) {
    return "nearly a Master";
  }
  return undefined;
};

/** Where they stand right now, with no bonus percent. */
export const postWords = (post: EngineerPost): string => {
  switch (post) {
    case "camp":
      return "At camp";
    case "tunnel":
      return "Away in a tunnel";
    case "cart":
      return "Tending the carts";
    case "drill":
      return "Tending the drills";
    case "borer":
      return "Tending the borers";
    case "machine":
      return "Tending the Great Machine";
  }
};

/** The tending bonus as a sentence. Camp and a tunnel tend nothing. */
export const tendingWords = (engineer: Engineer): string | undefined => {
  const { name, post } = engineer;
  switch (post) {
    case "camp":
    case "tunnel":
      return undefined;
    case "cart":
      return `Your carts hum a little faster while ${name} tends them.`;
    case "drill":
      return `Your drills hum a little faster while ${name} tends them.`;
    case "borer":
      return `Your borers hum a little faster while ${name} tends them.`;
    case "machine":
      return `The Great Machine hums a little faster while ${name} tends it.`;
  }
};

/** Best-ranked engineer posted on this tier, if someone is. */
export const tendingEngineer = (
  engineers: readonly Engineer[] | undefined,
  tierId: TierId,
): Engineer | undefined => {
  let best: Engineer | undefined;
  for (const engineer of engineers ?? []) {
    if (engineer.post !== tierId) {
      continue;
    }
    if (best === undefined || engineer.rank > best.rank) {
      best = engineer;
    }
  }
  return best;
};

/** Added to a tended card's label. Plural tiers, and the one Great Machine. */
export const tendsNote = (name: string, tierId: TierId): string =>
  tierId === "machine" ? `${name} tends it.` : `${name} tends them.`;

export const PROMOTE_NEEDS_WORKER = "No worker is free to step up.";
export const PROMOTE_CREW_FULL = "Every named hand is already an engineer.";

/** Status on a lost tool. The sheet shows this and the warm line, nothing else. */
export const FOUND_LABEL = "Found";

const LOST_TOOL_WORDS: Readonly<
  Record<LostToolId, { readonly name: string; readonly line: string }>
> = {
  pick: {
    name: "Grandfather's pick",
    line: "Your taps bite a little deeper.",
  },
  lamp: {
    name: "Old miner's lamp",
    line: "Golden veins linger longer in its light.",
  },
  map: {
    name: "Worn map",
    line: "The tunnels bring them home a little sooner.",
  },
  boots: {
    name: "Steel-toe boots",
    line: "Trouble at the machines comes less often.",
  },
};

/** Name and one warm line. No counts, no question marks. */
export const lostToolWords = (
  id: LostToolId,
): { readonly name: string; readonly line: string } => LOST_TOOL_WORDS[id];

const KEEPSAKE_WORDS: Readonly<
  Record<KeepsakeId, { readonly name: string; readonly story: string }>
> = {
  drawing: {
    name: "A child's drawing",
    story: "A little figure with a lamp, folded for a pocket.",
  },
  watch: {
    name: "A pocket watch",
    story: "Quiet in the hand. Someone loved it.",
  },
  whistle: {
    name: "A carved whistle",
    story: "Soft notes, and the house stays asleep.",
  },
  pebble: {
    name: "A smooth pebble",
    story: "Warm from a hand that held it.",
  },
  ribbon: {
    name: "A faded ribbon",
    story: "Tied until the ends went soft.",
  },
};

/** Name and one story. Found keepsakes only; the shelf stays quiet otherwise. */
export const keepsakeWords = (
  id: KeepsakeId,
): { readonly name: string; readonly story: string } => KEEPSAKE_WORDS[id];

export const BROUGHT_HOME = "Brought home";
export const KEEPSAKES_TITLE = "Keepsakes";

export const promotePriceWords = (cost: number): string =>
  `Promote a worker for ${formatCount(cost)} stones`;

/** Warm confirm. The name is whoever is about to step up. */
export const promoteConfirm = (name: string): string =>
  `${name} steps up as engineer. One worker fewer at the machines.`;
