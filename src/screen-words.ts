import {
  JOURNEYMAN_TRIPS,
  MASTER_TRIPS,
  type Engineer,
  type EngineerPost,
  type EngineerRank,
} from "./engineers";
import type { SettledFind, TunnelId } from "./expeditions";
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

export const promotePriceWords = (cost: number): string =>
  `Promote a worker for ${formatCount(cost)} stones`;

/** Warm confirm. The name is whoever is about to step up. */
export const promoteConfirm = (name: string): string =>
  `${name} steps up as engineer. One worker fewer at the machines.`;

/** The three ways down. The sheet uses these sentences as the buttons. */
const TUNNEL_OFFER: Readonly<Record<TunnelId, string>> = {
  "side-seam": "A quick look down a side seam",
  "old-shaft": "About an hour in the old shaft",
  "deep-dark": "A long night in the deep dark",
};

export const tunnelOffer = (tunnel: TunnelId): string => TUNNEL_OFFER[tunnel];

/** Why an Apprentice cannot lead the deep dark. Other tunnels stay open. */
export const tunnelLock = (
  rank: EngineerRank,
  tunnel: TunnelId,
): string | undefined =>
  tunnel === "deep-dark" && rank < 1
    ? "The deep dark waits for a Journeyman."
    : undefined;

const LONG_NIGHT_MS = 90 * 60_000;
const ABOUT_AN_HOUR_MS = 20 * 60_000;
const A_LITTLE_WHILE_MS = 2 * 60_000;

/**
 * A running expedition, counted down without a clock.
 * Long night, about an hour, a little while, then back soon.
 */
export const expeditionChip = (name: string, leftMs: number): string => {
  if (leftMs <= A_LITTLE_WHILE_MS) {
    return `${name} will be back soon.`;
  }
  if (leftMs <= ABOUT_AN_HOUR_MS) {
    return `${name} will be gone a little while.`;
  }
  if (leftMs <= LONG_NIGHT_MS) {
    return `${name} will be gone about an hour.`;
  }
  return `${name} will be gone a long night.`;
};

const FROM_TUNNEL: Readonly<Record<TunnelId, string>> = {
  "side-seam": "a side seam",
  "old-shaft": "the old shaft",
  "deep-dark": "the deep dark",
};

const TOOL_WORDS = {
  pick: "Grandfather's pick",
  lamp: "an old miner's lamp",
  map: "a worn map",
  boots: "steel-toe boots",
} as const;

const KEEPSAKE_WORDS = {
  drawing: "a child's drawing",
  watch: "a pocket watch",
  whistle: "a carved whistle",
  pebble: "a smooth pebble",
  ribbon: "a faded ribbon",
} as const;

/** Who came home, and what they carried, in one or two sentences. */
export const cameBack = (
  name: string,
  tunnel: TunnelId,
  find: SettledFind,
): string => {
  const from = FROM_TUNNEL[tunnel];
  switch (find.kind) {
    case "tool":
      return `${name} came back from ${from} with ${TOOL_WORDS[find.id]}.`;
    case "keepsake":
      return `${name} came back from ${from} with ${KEEPSAKE_WORDS[find.id]}.`;
    case "engineer":
      return find.joined
        ? `${name} came back from ${from} with ${find.name}, who joined the crew.`
        : `${name} came back from ${from}. The lost engineer had already found a place.`;
    case "glimmer":
      return `${name} came back from ${from}. ${find.text}`;
    case "quiet":
      return `${name} came back from ${from}. ${find.text}`;
  }
};

/** Soft confirm before a recall. No question mark: the buttons decide. */
export const recallConfirm = (name: string): string =>
  `${name} comes home empty-handed.`;
