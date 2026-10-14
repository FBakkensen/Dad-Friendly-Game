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
import type { BoostId } from "./boosts";
import { formatCompact, formatCount, formatDuration } from "./format";
import type { TroubleKind } from "./hazards";
import type { LayerId } from "./layers";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { owned, tierById, type TierId } from "./tiers";
import {
  BOOTS_SPEED_PER_LEVEL,
  STEADY_AWAY_PER_LEVEL,
  SYNERGY_PER_UNIT,
  TAP_SHARE_PER_LEVEL,
  synergyBonus,
  upgradeLevel,
  type Upgrade,
} from "./upgrades";

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

/** "1%", "1.65%", "133%". Keeps a second decimal only when the tenth needs it. */
const shareWords = (share: number): string => {
  const pct = share * 100;
  const whole = Math.round(pct);
  if (Math.abs(pct - whole) < 1e-6) {
    return `${String(whole)}%`;
  }
  const tenth = Math.round(pct * 10) / 10;
  if (Math.abs(pct - tenth) < 1e-6) {
    return `${tenth.toFixed(1)}%`;
  }
  return `${pct.toFixed(2)}%`;
};

/** What Better boots does to this crew, in stones a second. */
function bootsEffectLine(mountain: Mountain, perWorker: number): string {
  const factor = 1 + BOOTS_SPEED_PER_LEVEL;
  const owned = upgradeLevel(mountain, "boots") > 0;
  const before = owned ? perWorker / factor : perWorker;
  const after = owned ? perWorker : perWorker * factor;
  return `Workers ${formatSpeed(before)}/s to ${formatSpeed(after)}/s.`;
}

/**
 * One sentence: the per-level rule and what this crew would get, or gets now.
 */
export function upgradeEffectLine(
  upgrade: Upgrade,
  mountain: Mountain,
  at: number,
): string {
  const rates = effectiveRates(mountain, at);
  switch (upgrade.id) {
    case "tap":
      return `Taps +${shareWords(TAP_SHARE_PER_LEVEL)}, now ${formatCount(rates.tapYield)}.`;
    case "boots":
      return bootsEffectLine(mountain, rates.tierSpeed.helper);
    case "steady":
      return `Away pay +${shareWords(STEADY_AWAY_PER_LEVEL)}, now ${shareWords(rates.awayPay)}.`;
    case "cartSyn":
    case "drillSyn":
    case "borerSyn":
    case "machineSyn":
      return synergyEffectLine(upgrade, mountain);
  }
}

function synergyEffectLine(upgrade: Upgrade, mountain: Mountain): string {
  if (upgrade.synergy === undefined) {
    return upgrade.perLevel;
  }
  const from = tierById(upgrade.synergy.from);
  const to = tierById(upgrade.synergy.to);
  const count = owned(mountain, from);
  const target =
    to.id === "machine"
      ? "the Great Machine"
      : `${to.shortName.toLowerCase()}s`;
  const each = shareWords(SYNERGY_PER_UNIT);
  const rule = `Each ${from.shortName.toLowerCase()} +${each}`;
  if (count === 0) {
    return `${rule} ${target}.`;
  }
  const verb = upgradeLevel(mountain, upgrade.id) > 0 ? "now" : "would";
  return `+${each} each ${from.shortName.toLowerCase()}; ${target} ${verb} ${shareWords(synergyBonus(mountain, upgrade))}.`;
}

/** Locked row: the name and the gate, one compact line. */
export function lockedUpgradeLine(upgrade: Upgrade): string {
  if (upgrade.unlock === undefined) {
    return upgrade.name;
  }
  const tier = tierById(upgrade.unlock.tier);
  if (tier.id === "machine") {
    // "Great Machine" does not fit one line beside the buy button at 360px.
    return `${upgrade.name} · ${tier.shortName}`;
  }
  const gate =
    upgrade.unlock.count === 1
      ? `first ${tier.shortName.toLowerCase()}`
      : `${String(upgrade.unlock.count)} ${tier.shortName.toLowerCase()}s`;
  return `${upgrade.name} · ${gate}`;
}

/** "the first 8 hours", "the first 16 hours", or "a whole day" with the Shield. */
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
 * Stones a second, in the game's number format.
 * "+800 stones/sec", "+1.2K stones/sec".
 */
/** A tending choice for a tier he has none of: no "+0", just the reason. */
export const NONE_BUILT = "none built yet";

export function stonesPerSecond(gain: number): string {
  return `+${formatCompact(Math.max(0, Math.floor(gain)))} stones/sec`;
}

/**
 * The open card's one sentence. A tended machine names the live gain.
 * Camp and a tunnel tend nothing.
 */
export function dutySentence(engineer: Engineer, gain?: string): string {
  const { name, post } = engineer;
  const { object } = voice(name);
  const pace = gain ?? stonesPerSecond(0);
  switch (post) {
    case "camp":
      return `${name} is resting at camp. Give ${object} a job below.`;
    case "tunnel":
      return `${name} is out exploring.`;
    case "machine":
      return `${name} is tending the Great Machine: ${pace}.`;
    case "cart":
      return `${name} is tending the carts: ${pace}.`;
    case "drill":
      return `${name} is tending the drills: ${pace}.`;
    case "borer":
      return `${name} is tending the borers: ${pace}.`;
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
export function tendBenefit(
  post: TendPost,
  name: Engineer["name"],
  gain?: string,
): string {
  const { subject, self } = voice(name);
  const line = (() => {
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
  })();
  if (post === "camp" || gain === undefined) {
    return line;
  }
  return `${gain.charAt(0).toUpperCase()}${gain.slice(1)}. ${line}`;
}

export function stationCheer(
  name: string,
  post: TendPost,
  gain?: string,
): string {
  const line = (() => {
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
  })();
  return post === "camp" || gain === undefined ? line : `${line} ${gain}`;
}

/** The Promote button. The price is the decision. */
/** One line on a buy button: "Buy · 46K", "Buy · 117.7K". */
export const buyPriceWords = (cost: number): string =>
  `Buy · ${formatCompact(cost)}`;

export function promoteOffer(cost: number): string {
  return `Promote: ${formatCompact(cost)} stones`;
}

/** Greyed reason when the pocket cannot cover a promotion. */
export function promoteNeeds(cost: number): string {
  return `Needs ${formatCompact(cost)} stones`;
}

/**
 * What buying a boost does right now, in stones. The × is the rule;
 * the count is the output.
 */
export function boostOutcome(
  id: BoostId,
  effect: string,
  multiplier: number,
  rates: { readonly tapYield: number; readonly crewPerSecond: number },
  running: boolean,
): string {
  if (id === "sharper") {
    const taps = running ? rates.tapYield : rates.tapYield * multiplier;
    return `${effect} ${formatCount(taps)} a tap.`;
  }
  const crew = running ? rates.crewPerSecond : rates.crewPerSecond * multiplier;
  return `${effect} ${formatCompact(crew)}/s.`;
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
    case "recipe":
      return `${name} came back from ${from} with a sketch folded in a pocket.`;
    case "quiet":
      return `${name} came back from ${from}. ${find.text}`;
  }
};

/** Soft confirm before a recall. No question mark: the buttons decide. */
export const recallConfirm = (name: string): string =>
  `${name} comes home empty-handed.`;

/** Menu row before the Granite. No counts, no question. */
export const WORKSHOP_LOCKED = "Locked · The Granite";

/** The bench is free, and a thin pocket is still a fine pocket. */
export const WORKSHOP_FREE_ASIDE = "A little at a time is plenty.";

/** Sound stays off until the dad asks. The house is asleep. */
export const WORKSHOP_QUIET = "Quiet";
export const WORKSHOP_SOUND = "Sound";

export const WORKSHOP_EARLIER = "Earlier";
export const WORKSHOP_MORE = "More to make";

/** A craft that spends no stones. The materials are the price. */
export const CRAFT_WORD = "Craft";

/** Unfound, and the sketch is still out on a trip. No name, no question. */
export const UNFOUND_DEEPER = "Deeper rock keeps a quiet gift.";

/** "Workshop" or "Workshop · 8:12" while something is on the bench. */
export function workshopMenuWords(leftMs: number | undefined): string {
  if (leftMs === undefined) {
    return WORKSHOP_TITLE;
  }
  return `${WORKSHOP_TITLE} · ${formatClock(leftMs)}`;
}

/** A craft this build cannot name. The countdown is the only number. */
export const BENCH_UNKNOWN = "Something is on the bench";

/** It is working. This build does not pretend to know what it will be. */
export const BENCH_UNKNOWN_ASIDE = "It keeps working while you rest.";

/** "Something is on the bench · 8:12 left", or ready when the clock has rung. */
export function benchUnknownWords(leftMs: number): string {
  if (leftMs <= 0) {
    return `${BENCH_UNKNOWN} · ready`;
  }
  return `${BENCH_UNKNOWN} · ${formatClock(leftMs)} left`;
}

/** "On the bench: Iron rails · 8:12 left", or ready when the clock has rung. */
export function benchBusyWords(name: string, leftMs: number): string {
  if (leftMs <= 0) {
    return `On the bench: ${name} · ready`;
  }
  return `On the bench: ${name} · ${formatClock(leftMs)} left`;
}

/** "Axle grease · 18:40 left". */
export function timerLeftWords(name: string, leftMs: number): string {
  return `${name} · ${formatClock(Math.max(0, leftMs))} left`;
}

/** Card time: "10 min", "1 h", "3 h 12 min". */
export function craftTimeWords(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) {
    return `${String(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (rest === 0) {
    return `${String(hours)} h`;
  }
  return `${String(hours)} h ${String(rest)} min`;
}

/**
 * A craft rate to one decimal, the same grain as the rest of the crew.
 * "8.5", "10.6", "3,500". Whole numbers stay whole.
 */
export function formatCraftSpeed(speed: number): string {
  const abs = Math.max(0, speed);
  const tenths = Math.round(abs * 10) / 10;
  if (tenths >= 10_000) {
    return formatCompact(Math.floor(abs));
  }
  if (Number.isInteger(tenths)) {
    return formatCompact(tenths);
  }
  return tenths.toFixed(1);
}

const MATERIAL_LABEL = {
  clay: "Clay",
  iron: "Iron",
  crystal: "Crystal",
  heartstone: "Heartstone",
} as const;

export type MaterialWord = keyof typeof MATERIAL_LABEL;

/** "Clay 10" on the pocket line. */
export function materialCountWords(
  material: MaterialWord,
  count: number,
): string {
  return `${MATERIAL_LABEL[material]} ${formatCompact(count)}`;
}

/** "4 iron" on a recipe card. */
export function materialCostWords(
  count: number,
  material: MaterialWord,
): string {
  return `${formatCompact(count)} ${material}`;
}

/** "500K stones" on a recipe card, beside the materials and the time. */
export function stoneCostWords(stones: number): string {
  return `${formatCompact(stones)} stones`;
}

/**
 * Another crew timer is already this strong. Grease, a charge, and Overtime
 * do not multiply, so the card does not promise a bigger crew.
 */
export function crewAlreadyWords(mark: number): string {
  return `Crew already at ×${formatCraftSpeed(mark)}.`;
}

/** "Level 1 of 2" for a craft that can be made more than once. */
export function craftLevelWords(next: number, max: number): string {
  return `Level ${String(next)} of ${String(max)}`;
}

/** A waiting card. The cost stays on the card; this is only the button. */
export const WORKSHOP_BENCH_BUSY = "Bench busy";

/** Second tap on cancel. The first tap only names the refund. */
export const WORKSHOP_CANCEL_CONFIRM = "Tap again to cancel";

function andList(parts: readonly string[]): string {
  const last = parts[parts.length - 1];
  if (last === undefined) {
    return "";
  }
  if (parts.length === 1) {
    return last;
  }
  const head = parts.slice(0, -1).join(", ");
  const joiner = parts.length === 2 ? " and " : ", and ";
  return `${head}${joiner}${last}`;
}

/**
 * What cancel gives back. Empty means the live timer has already used it.
 * "Cancel · 250K stones, 10 clay, and 4 iron back".
 */
export function refundBackWords(parts: readonly string[]): string {
  const list = andList(parts);
  if (list === "") {
    return "Cancel · nothing comes back";
  }
  return `Cancel · ${list} back`;
}

/**
 * M9-2 mock copy (#193). Craft prices and the material line are the plan's
 * first-cut examples so the sheets can show real numbers. M9-7 tunes the
 * economy; these lines are not that tuning.
 */
export const WORKSHOP_TITLE = "Workshop";

export const BENCH_FREE = "The bench is free";
export const BENCH_FREE_ASIDE = "Pick something good for the crew.";
export const BENCH_BUSY = "On the bench: Iron rails · 38 min left";
export const BENCH_BUSY_ASIDE = "Your crew will feel this one.";
export const RECIPE_ON_BENCH = "On the bench";
export const RECIPE_WAITING = "Waiting its turn";

/** One line on a craft button: "Craft · 4.2M". */
export const craftPriceWords = (stones: number): string =>
  `Craft · ${formatCompact(stones)}`;

/** What a short craft still needs: "Need 5 more iron". */
export const needMoreWords = (missing: number, material: string): string =>
  `Need ${formatCompact(missing)} more ${material}`;

export const LAYER_ARRIVAL = "You broke into the Granite!";
export const LAYER_EVOCATIVE = "The grey rock rings under every pick.";
export const LAYER_ADVICE = "Tough on carts. Drills love it.";
export const LAYER_DIG = "Dig on";

export const CRAFT_DONE = "Your Iron rails are fitted. Carts now 12/s.";
export const CRAFT_DONE_BUTTON = "The crew feels it";

/** The live layer card. Granite matches the approved mock, word for word. */
const LAYER_CARD = {
  granite: {
    arrival: LAYER_ARRIVAL,
    evocative: LAYER_EVOCATIVE,
    advice: LAYER_ADVICE,
  },
  crystal: {
    arrival: "You broke into the Crystal Caves!",
    evocative: "Light in the walls. Your crew can handle this.",
    advice: "Tough on drills and borers. The rest keep their pace.",
  },
  heart: {
    arrival: "You broke into the Deep Heart!",
    evocative: "Warm stone, deep down. Your crew earned this.",
    advice: "Tough on carts, drills, and borers. The Great Machine holds.",
  },
} as const;

export type LayerCardWords = {
  readonly arrival: string;
  readonly evocative: string;
  readonly advice: string;
  /** A recipe came up with the rock. No name, no numbers. */
  readonly sketch: string;
};

/**
 * The sketch a break-in leaves in a pocket. No recipe name, no numbers.
 * The Topsoil is home, and its three recipes are already known.
 */
function layerSketchWords(id: LayerId): string | undefined {
  switch (id) {
    case "topsoil":
      return undefined;
    case "granite":
      return "A sketch for the shed came up with the rock.";
    case "crystal":
      return "A sketch was caught in the glitter.";
    case "heart":
      return "A sketch was waiting in the warm stone.";
    /* v8 ignore next 3 -- layer ids are the closed list */
    default: {
      const never: never = id;
      return never;
    }
  }
}

/** Words for a break-in card. The Topsoil is home, not a break-in. */
export function layerCardWords(id: LayerId): LayerCardWords | undefined {
  switch (id) {
    case "topsoil":
      return undefined;
    case "granite":
    case "crystal":
    case "heart": {
      const sketch = layerSketchWords(id);
      /* v8 ignore next -- every break-in has a sketch */
      if (sketch === undefined) {
        return undefined;
      }
      return { ...LAYER_CARD[id], sketch };
    }
    /* v8 ignore next 3 -- layer ids are the closed list */
    default: {
      const never: never = id;
      return never;
    }
  }
}

/**
 * What the next band feels like, before you arrive. No depth, no material
 * name. The Deep Heart has nothing below it.
 */
export function nextLayerHint(id: LayerId | undefined): string | undefined {
  switch (id) {
    case "granite":
      return "Below the topsoil, the rock turns hard and grey.";
    case "crystal":
      return "Deeper on, the walls start to glitter.";
    case "heart":
      return "Something warm is still waiting below.";
    case "topsoil":
    case undefined:
      return undefined;
    /* v8 ignore next 3 -- layer ids are the closed list */
    default: {
      const never: never = id;
      return never;
    }
  }
}

/** One line for the welcome card: the arrival and the advice. */
export function layerWelcomeWords(id: LayerId): string | undefined {
  const words = layerCardWords(id);
  if (words === undefined) {
    return undefined;
  }
  return `${words.arrival} ${words.advice} ${words.sketch}`;
}

/**
 * "Your Iron rails are fitted. Carts now 12.5/s."
 * A name that ends in s takes "are".
 */
export function craftFittedWords(name: string, effect: string): string {
  const fitted = name.endsWith("s") ? "are" : "is";
  return `Your ${name} ${fitted} fitted. ${effect}`;
}

/** Unfound recipe. No name, no count, no question mark. */
export const UNFOUND_HINT = "A folded sketch, still in the dark.";

export const MOCK_MATERIALS = [
  { id: "clay", name: "clay", count: 42, text: "Clay 42" },
  { id: "iron", name: "iron", count: 7, text: "Iron 7" },
] as const;

export const MOCK_MATERIAL_LINE = "Clay 42 · Iron 7";

export const MOCK_RECIPES = [
  {
    id: "rails",
    name: "Iron rails",
    effect: "Carts 10/s to 12/s",
    materials: [{ id: "iron", name: "iron", count: 12, text: "12 iron" }],
    time: "1 h",
    stones: 4_200_000,
  },
  {
    id: "props",
    name: "Sturdy props",
    effect: "Trouble comes 30% less often.",
    materials: [
      { id: "clay", name: "clay", count: 20, text: "20 clay" },
      { id: "iron", name: "iron", count: 6, text: "6 iron" },
    ],
    time: "1 h",
    stones: 1_800_000,
  },
  {
    id: "charge",
    name: "Blasting charge",
    effect: "The crew digs at 2× for 20 min.",
    materials: [{ id: "clay", name: "clay", count: 6, text: "6 clay" }],
    time: "10 min",
    stones: 800_000,
  },
] as const;
