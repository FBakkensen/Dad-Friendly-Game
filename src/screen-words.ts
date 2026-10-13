import {
  JOURNEYMAN_TRIPS,
  MASTER_TRIPS,
  type Engineer,
  type EngineerPost,
  type EngineerRank,
} from "./engineers";
import type { LostToolId } from "./lost-tools";
import {
  KEEPSAKES,
  type FindId,
  type KeepsakeId,
  type SettledFind,
  type TunnelId,
} from "./expeditions";
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

export const ENGINEER_SHEET_TITLE = "Your engineers";

export const ENGINEER_SHEET_SUB =
  "Each one makes a machine better, or goes exploring for finds.";

/** Posts the Tend list offers, in sheet order. A tunnel is not one of them. */
export const TEND_POSTS = [
  "cart",
  "drill",
  "borer",
  "machine",
  "camp",
] as const satisfies readonly Exclude<EngineerPost, "tunnel">[];

export type TendPost = (typeof TEND_POSTS)[number];

export const TEND_MACHINE = "Tend a machine";
export const SEND_EXPLORING = "Send exploring";
export const KEEP_EXPLORING = "Keep exploring";
export const CALL_BACK = "Call back";

export const PROMOTE_TITLE = "Promote a worker";
export const PROMOTE_WHY =
  "A new engineer can tend another machine or explore while the others work.";
export const PROMOTE_BUTTON = "Promote";
export const PROMOTE_SHORT_POCKET = "The pocket is too light for that.";

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

type Voice = {
  readonly subject: "she" | "he";
  readonly object: "her" | "him";
  readonly possessive: "her" | "his";
  readonly self: "herself" | "himself";
};

/** Ada, Ruth and Mae, then Nils and Otto. The sheet speaks to each of them. */
function voice(name: Engineer["name"]): Voice {
  if (name === "Nils" || name === "Otto") {
    return {
      subject: "he",
      object: "him",
      possessive: "his",
      self: "himself",
    };
  }
  return { subject: "she", object: "her", possessive: "her", self: "herself" };
}

/** How much faster that rank makes a machine. Never a percent. */
const PACE = ["a bit", "quite a bit", "much"] as const;

const TEND_TITLE: Readonly<Record<TendPost, string>> = {
  cart: "The carts",
  drill: "The drills",
  borer: "The borers",
  machine: "The Great Machine",
  camp: "Rest at camp",
};

const TUNNEL_TITLE: Readonly<Record<TunnelId, string>> = {
  "side-seam": "Quick look",
  "old-shaft": "Old shaft",
  "deep-dark": "The deep dark",
};

const TUNNEL_PLACE: Readonly<Record<TunnelId, string>> = {
  "side-seam": "a side seam",
  "old-shaft": "the old shaft",
  "deep-dark": "the deep dark",
};

const TUNNEL_BENEFIT: Readonly<Record<TunnelId, string>> = {
  "side-seam": "Back in a few minutes with a small find.",
  "old-shaft": "About an hour, often a lost tool or keepsake.",
  "deep-dark": "All night, the best chance of a relic hint or a new engineer.",
};

/**
 * The open card's one sentence: what they are doing, and what it does.
 * Rank changes the pace words only. A tunnel uses the trip lines instead.
 */
export function dutySentence(engineer: Engineer): string {
  const { name, rank, post } = engineer;
  const { subject, object, self } = voice(name);
  const pace = PACE[rank];
  switch (post) {
    case "camp":
      return `${name} is resting at camp. Give ${object} a job below.`;
    case "tunnel":
      return `${name} is out exploring.`;
    case "machine":
      return `${name} is tending the Great Machine, it digs ${pace} faster and ${subject} fixes trouble there ${self}.`;
    case "cart":
      return `${name} is tending the carts, they dig ${pace} faster and ${subject} fixes trouble there ${self}.`;
    case "drill":
      return `${name} is tending the drills, they dig ${pace} faster and ${subject} fixes trouble there ${self}.`;
    case "borer":
      return `${name} is tending the borers, they dig ${pace} faster and ${subject} fixes trouble there ${self}.`;
  }
}

/** One line on a collapsed card. The countdown uses the same words as the chip. */
export function dutyLine(
  engineer: Engineer,
  trip?: { readonly tunnel: TunnelId; readonly leftMs: number },
): string {
  switch (engineer.post) {
    case "camp":
      return "Resting at camp";
    case "tunnel":
      return trip === undefined
        ? "Exploring a tunnel"
        : `Exploring ${TUNNEL_PLACE[trip.tunnel]} · ${awayShort(trip.leftMs)}`;
    case "cart":
      return "Tending the carts";
    case "drill":
      return "Tending the drills";
    case "borer":
      return "Tending the borers";
    case "machine":
      return "Tending the Great Machine";
  }
}

export function tendTitle(post: TendPost, here: boolean): string {
  const title = TEND_TITLE[post];
  return here ? `${title} · here now` : title;
}

/**
 * What tending that post does, in one line.
 * Cave-in on the carts, flood on the drills, jam on the borers and the
 * Great Machine. The Great Machine also runs with far fewer workers.
 */
export function tendBenefit(post: TendPost, name: Engineer["name"]): string {
  const { subject, self } = voice(name);
  switch (post) {
    case "cart":
      return `They roll faster, and ${subject} shores up cave-ins ${self}.`;
    case "drill":
      return `They bite deeper, and ${subject} pumps out floods ${self}.`;
    case "borer":
      return `They dig faster, and ${subject} clears any jam ${self}.`;
    case "machine":
      return `It runs with far fewer workers, and ${subject} clears any jam ${self}.`;
    case "camp":
      return "Rests by the fire, ready for the next job.";
  }
}

export function stationCheer(name: string, post: TendPost): string {
  switch (post) {
    case "camp":
      return `${name} puts the kettle on at camp.`;
    case "cart":
      return `${name} heads to the carts!`;
    case "drill":
      return `${name} heads to the drills!`;
    case "borer":
      return `${name} heads to the borers!`;
    case "machine":
      return `${name} heads to the Great Machine!`;
  }
}

export const exploreTitle = (tunnel: TunnelId): string => TUNNEL_TITLE[tunnel];

export const exploreBenefit = (tunnel: TunnelId): string =>
  TUNNEL_BENEFIT[tunnel];

export function exploreAside(
  name: Engineer["name"],
  post: Engineer["post"],
): string {
  const { subject, possessive, object } = voice(name);
  if (post === "camp" || post === "tunnel") {
    return `No machine slows while ${subject} explores.`;
  }
  return `While ${subject} explores, ${possessive} machine works without ${object}.`;
}

export function exploreCheer(name: string): string {
  return `${name} lights a lamp and heads in!`;
}

export function callBackLabel(name: Engineer["name"]): string {
  return `Call ${voice(name).object} back`;
}

export function tripTitle(name: string, tunnel: TunnelId): string {
  return `${name} is exploring ${TUNNEL_PLACE[tunnel]}.`;
}

/** Words-only countdown under the walker, plus what they hope to carry home. */
export function tripDetail(name: Engineer["name"], leftMs: number): string {
  const { subject } = voice(name);
  const who = subject === "she" ? "She" : "He";
  return `${expeditionChip(name, leftMs)} ${who}'ll bring home whatever is found.`;
}

export function homeCheer(name: string): string {
  return `${name} is home, empty-handed.`;
}

export function promoteCheer(name: string): string {
  return `${name} steps up. The crew cheers.`;
}

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

/** Keepsakes on the shelf, in the order they came home. Tools stay on Upgrades. */
export function keepsakesBroughtHome(
  finds: readonly FindId[] | undefined,
): readonly KeepsakeId[] {
  if (finds === undefined) {
    return [];
  }
  return finds.filter((id): id is KeepsakeId =>
    (KEEPSAKES as readonly string[]).includes(id),
  );
}

/** Names on the card row. The stories stay whole, at reading size. */
export function broughtHomeNames(ids: readonly KeepsakeId[]): string {
  return ids.map((id) => keepsakeWords(id).name).join(", ");
}

/** Every story, in a toast. Normal sentences, no counts. */
export function broughtHomeToast(ids: readonly KeepsakeId[]): string {
  return ids
    .map((id) => {
      const words = keepsakeWords(id);
      return `${words.name}. ${words.story}`;
    })
    .join(" ");
}

/** Warm confirm. The name is whoever is about to step up. */
export const promoteConfirm = (name: string): string =>
  `${name} steps up as engineer. One worker fewer at the machines.`;

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

/** Short countdown for a collapsed row. Same buckets as the mountain chip. */
function awayShort(leftMs: number): string {
  if (leftMs <= A_LITTLE_WHILE_MS) {
    return "back soon";
  }
  if (leftMs <= ABOUT_AN_HOUR_MS) {
    return "gone a little while";
  }
  if (leftMs <= LONG_NIGHT_MS) {
    return "gone about an hour";
  }
  return "gone a long night";
}

/** What a tool does, short enough for the welcome card on a small phone. */
const TOOL_HELPS = {
  pick: "Taps bite deeper.",
  lamp: "Golden veins linger.",
  map: "Trips come home sooner.",
  boots: "Fewer troubles at the machines.",
} as const;

const TOOL_IN_SENTENCE = {
  pick: "Grandfather's pick",
  lamp: "an old miner's lamp",
  map: "a worn map",
  boots: "steel-toe boots",
} as const;

const KEEPSAKE_IN_SENTENCE = {
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
  const from = TUNNEL_PLACE[tunnel];
  switch (find.kind) {
    case "tool":
      return `${name} came back from ${from} with ${TOOL_IN_SENTENCE[find.id]}. ${TOOL_HELPS[find.id]}`;
    case "keepsake":
      return `${name} came back from ${from} with ${KEEPSAKE_IN_SENTENCE[find.id]}. It waits on the relic shelf.`;
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
