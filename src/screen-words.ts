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
import { RUSH_MS, RUSH_MULTIPLIER } from "./gold-rush";
import type { TroubleKind } from "./hazards";
import type { LayerId, Materials, MaterialId } from "./layers";
import type { Mountain } from "./mountain";
import { AWAY_END_MS, effectiveRates, type Rates } from "./rates";
import { RELICS } from "./relics";
import { owned, tierById, type TierId } from "./tiers";
import { upgradeLevel, type Upgrade, type UpgradeId } from "./upgrades";

// Player-facing wording shared by the screen's panels.

/** Away pay as a percentage people read, e.g. "30%" or "37.5%". */
export const percent = (share: number): string =>
  `${String(Number((share * 100).toFixed(1)))}%`;

/**
 * The crew's stones a second, as the header shows it: whole stones, compact
 * past ten thousand. Pass `crewPerSecond`, not the exact rate (#332).
 */
export const formatCrewSpeed = (perSecond: number): string =>
  formatCompact(perSecond);

/** Per-unit speed: one decimal while small and fractional (Better boots). */
export const formatSpeed = (speed: number): string =>
  speed < 10 && !Number.isInteger(speed)
    ? speed.toFixed(1)
    : formatCompact(speed);

/**
 * Workers one more of this machine needs. The free count lives on the crew
 * line, so a card never repeats it.
 */
export function staffBillWords(
  staff: number,
  spare: number,
): string | undefined {
  void spare;
  if (staff <= 0) {
    return undefined;
  }
  return `Needs ${formatCompact(staff)} ${workerWords(staff)}`;
}

export type CrewPost = {
  readonly label: string;
  readonly workers: number;
};

/** Where busy workers sit. Hands and kids are the pool, not a post. */
export function crewPostLabel(
  id: TierId,
): "carts" | "drills" | "borers" | "the machine" | undefined {
  switch (id) {
    case "cart":
      return "carts";
    case "drill":
      return "drills";
    case "borer":
      return "borers";
    case "machine":
      return "the machine";
    case "helper":
    case "kid":
      return undefined;
    default: {
      const never: never = id;
      return never;
    }
  }
}

/** "28 workers: 13 on carts, 15 on drills, 0 free". */
export function crewPostsWords(
  total: number,
  free: number,
  posts: readonly CrewPost[],
): string {
  const head = `${formatCompact(total)} ${workerWords(total)}`;
  const places = posts
    .filter((post) => post.workers > 0)
    .map((post) => `${formatCompact(post.workers)} on ${post.label}`);
  const tail = `${formatCompact(Math.max(0, Math.floor(free)))} free`;
  return places.length === 0
    ? `${head}: ${tail}`
    : `${head}: ${places.join(", ")}, ${tail}`;
}

/** One line when the full breakdown does not fit. */
export function crewPostsShort(total: number, free: number): string {
  return `${formatCompact(total)} ${workerWords(total)} · ${formatCompact(Math.max(0, Math.floor(free)))} free`;
}

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

/** "1 stone a second" or "6 stones a second": the crew line and Buys' aria. */
export const stonesASecond = (rate: number): string =>
  rate === 1 ? "1 stone a second" : `${formatCount(rate)} stones a second`;

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

/** The same mountain with one upgrade at another level. */
const withLevel = (
  mountain: Mountain,
  id: UpgradeId,
  level: number,
): Mountain => ({
  ...mountain,
  upgrades: { ...mountain.upgrades, [id]: level },
});

/**
 * What the card's number is before and after one more level, or what it is
 * now once every level is bought. A one-level upgrade keeps showing what it
 * did once it is owned.
 */
type UpgradeChange =
  | { readonly kind: "next"; readonly before: Rates; readonly after: Rates }
  | { readonly kind: "maxed"; readonly now: Rates };

function upgradeChange(
  upgrade: Upgrade,
  mountain: Mountain,
  at: number,
): UpgradeChange {
  const level = upgradeLevel(mountain, upgrade.id);
  if (upgrade.maxLevel === 1) {
    return {
      kind: "next",
      before: effectiveRates(withLevel(mountain, upgrade.id, 0), at),
      after: effectiveRates(withLevel(mountain, upgrade.id, 1), at),
    };
  }
  return level >= upgrade.maxLevel
    ? { kind: "maxed", now: effectiveRates(mountain, at) }
    : {
        kind: "next",
        before: effectiveRates(mountain, at),
        after: effectiveRates(withLevel(mountain, upgrade.id, level + 1), at),
      };
}

/** "6/s to 6.7/s", or "now 6.7/s" once every level is bought. */
function fromTo(change: UpgradeChange, read: (rates: Rates) => string): string {
  return change.kind === "maxed"
    ? `now ${read(change.now)}`
    : `${read(change.before)} to ${read(change.after)}`;
}

/**
 * One sentence: what this card's number is now, and what buying makes it,
 * from the same rates the game runs on (#324).
 */
export function upgradeEffectLine(
  upgrade: Upgrade,
  mountain: Mountain,
  at: number,
): string {
  const change = upgradeChange(upgrade, mountain, at);
  switch (upgrade.id) {
    case "tap":
      return `Taps ${fromTo(change, (rates) => formatCount(rates.tapYield))}.`;
    case "boots":
      return `Workers ${fromTo(change, (rates) => `${formatSpeed(rates.tierSpeed.helper)}/s`)}.`;
    case "steady":
      return `Away pay ${fromTo(change, (rates) => shareWords(rates.awayPay))}.`;
    case "cartSyn":
    case "drillSyn":
    case "borerSyn":
    case "machineSyn":
      return synergyEffectLine(upgrade, mountain, change);
  }
}

/** Whether a synergy has any of the tier that feeds it. */
const synergyFed = (upgrade: Upgrade, mountain: Mountain): boolean =>
  upgrade.synergy !== undefined &&
  owned(mountain, tierById(upgrade.synergy.from)) > 0;

function synergyEffectLine(
  upgrade: Upgrade,
  mountain: Mountain,
  change: UpgradeChange,
): string {
  if (upgrade.synergy === undefined || !synergyFed(upgrade, mountain)) {
    return upgrade.perLevel;
  }
  const to = tierById(upgrade.synergy.to);
  const name = to.id === "machine" ? "Great Machine" : `${to.shortName}s`;
  return `${name} ${fromTo(change, (rates) => `${formatSpeed(rates.tierSpeed[to.id])}/s`)}.`;
}

/** The card's quiet second line: why it is worth it, never the effect again. */
const UPGRADE_WHY: Record<UpgradeId, string> = {
  tap: "Each tap takes a little more.",
  boots: "The workers pick up their feet.",
  steady: "Time away pays a little more.",
  cartSyn: "Each worker makes carts 1% faster.",
  drillSyn: "Each cart makes the drills a little quicker.",
  borerSyn: "Each drill makes the borers a little quicker.",
  machineSyn: "Each borer makes the machine a little quicker.",
};

/** "workers", "carts", "borers": the tier a synergy needs, plural. */
const tierPlural = (id: TierId): string =>
  id === "helper" ? workerWords(2) : `${tierById(id).shortName.toLowerCase()}s`;

/**
 * The why line under the effect line (#342). A synergy with none of its
 * source already shows its rule, so this says what makes it count. Strong arms
 * on a crew too small to move the number says it grows with the crew.
 */
export function upgradeWhyLine(
  upgrade: Upgrade,
  mountain: Mountain,
  at: number,
): string {
  if (upgrade.synergy !== undefined && !synergyFed(upgrade, mountain)) {
    return `It counts once you have ${tierPlural(upgrade.synergy.from)}.`;
  }
  if (upgrade.id === "tap") {
    const change = upgradeChange(upgrade, mountain, at);
    if (
      change.kind === "next" &&
      formatCount(change.before.tapYield) === formatCount(change.after.tapYield)
    ) {
      return "It grows with your crew's speed.";
    }
  }
  return UPGRADE_WHY[upgrade.id];
}

/**
 * The welcome-back line for how long the crew dug (#278): the whole time,
 * then easing off on the slope, then a full day's haul once a day has passed.
 */
function awayStretchWords(report: {
  readonly awayMs: number;
  readonly paidMs: number;
}): string {
  if (report.paidMs >= report.awayMs) {
    return "Your crew kept digging the whole time.";
  }
  return report.awayMs <= AWAY_END_MS
    ? "Your crew dug hard, then took it easy. Rested and ready for you."
    : "Your crew saved a full day's haul for you. Good to have you back.";
}

/** Grandpa's crew chip (#338): "Grandpa on carts". */
export const grandpaChipWords = (post: TierId): string =>
  `Grandpa on ${crewPostLabel(post) ?? "the crew"}`;

/** What a screen reader hears about Grandpa (#338). */
export const grandpaSentence = (post: TierId): string =>
  `Grandpa tends ${post === "machine" ? "the Great Machine" : `the ${crewPostLabel(post) ?? "crew"}`}, slow and steady.`;

/** The small note a short absence leaves on the mountain (#334). */
export const quietAwayWords = (stones: number): string =>
  `+${formatCount(stones)} ${stones === 1 ? "stone" : "stones"} while you were away`;

/** The welcome card's titles: an away haul, the crew grew alone, someone came home (#464). */
export const WELCOME_AWAY_TITLE = "While you were away";
export const CREW_GREW_TITLE = "Your crew grew";
export const WELCOME_HOME_TITLE = "Welcome home";

/** Helpers who joined an older save's machines (#89); alone, the title already says the crew grew. */
export const crewGrewWords = (joined: number, alone: boolean): string =>
  `${alone ? "" : "Your crew grew: "}${formatCount(joined)} ${workerWords(joined)} joined to run your machines.`;

/**
 * The welcome card's big number and its unit, read together: "+1.2 million stones", "+1 stone".
 * The card sets the unit smaller beside the number.
 */
export const awayMinedWords = (
  mined: number,
): { readonly count: string; readonly unit: "stone" | "stones" } => ({
  count: `+${formatCount(mined)}`,
  unit: mined === 1 ? "stone" : "stones",
});

/** How long you were gone, how the crew dug, and the Heart of Patience's share. */
export function awayGoneWords(report: {
  readonly awayMs: number;
  readonly paidMs: number;
  readonly heart: number;
}): string {
  const heart =
    report.heart > 1
      ? ` The Heart of Patience made it ×${report.heart.toFixed(2).replace(/0$/, "")}.`
      : "";
  return `You were gone ${formatDuration(report.awayMs)}. ${awayStretchWords(report)}${heart}`;
}

/** The welcome card's quote line, under the haul. */
export const AWAY_CHEER =
  "Time with the people who matter is never wasted. Your crew kept the mountain moving.";

/** Away this long (a night) and the quote gives way to a dream (#337). */
export const DREAM_AWAY_MS = 8 * 60 * 60 * 1000;

/**
 * The quote line, or after a long absence one vague, dreamy line about what
 * lies deeper than the band you are in (#337). No numbers, no depths.
 */
export function awayCheerWords(awayMs: number, band: LayerId): string {
  if (awayMs < DREAM_AWAY_MS) {
    return AWAY_CHEER;
  }
  switch (band) {
    case "topsoil":
      return "While you were gone, the crew dreamt of cold grey stone.";
    case "granite":
      return "While you were gone, something hummed below the Granite.";
    case "crystal":
      return "While you were gone, something warm stirred under the caves.";
    case "heart":
      return "While you were gone, the Deep Heart beat slow and steady.";
  }
}

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
/** The welcome card's one plate (#464). */
export const BACK_TO_THE_MOUNTAIN = "Back to the mountain";

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
/** The promotion's two answers, and the Engineers pages' way back (#455): today's words. */
export const PROMOTE_NOT_YET = "Not yet";
export const PROMOTE_STEP_UP = "Step up";
export const ENGINEERS_BACK = "Back to your engineers";

/** Engineers first visit (#246): the line above the New card. */
export function engineersIntro(name: string): string {
  return `${name} can explore a side tunnel and bring home a find.`;
}

/** The staffing New card's bill. The free count stays on the crew chip. */
export function staffingLine(staff: number, idle: number): string {
  return `Needs ${formatCompact(staff)} ${workerWords(staff)} each · ${formatCompact(idle)} idle`;
}

/** The Buys intro while an idle machine is the New card. */
export const STAFFING_INTRO = "Idle machines start when you hire workers.";

/** The intro line on the guided second engineer. */
export const PROMOTION_INTRO = "A second engineer can tend another machine.";

/** The guided Promote's payoff line: the real gain, worker counted. */
export function promotionPayoff(
  name: string,
  post: Exclude<TendPost, "camp">,
  gain: string,
): string {
  return `${name} could tend ${TEND_TITLE[post].replace(/^The/, "the")}: ${gain}`;
}

/** The intro line on the guided first tend. */
export function tendingIntro(name: string): string {
  return `${name} can tend a machine so it digs faster.`;
}

/** The one big button on the guided first trip. */
export function firstTripWords(name: string, awayMs: number): string {
  return `Send ${name} exploring · ${String(Math.round(awayMs / 60_000))} min`;
}

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

/** The bench is free, and a thin pocket is still a fine pocket. */
export const WORKSHOP_FREE_ASIDE = "A little at a time is plenty.";

/** Sound stays off until the dad asks. The house is asleep. */
export const WORKSHOP_QUIET = "Quiet";
export const WORKSHOP_SOUND = "Sound";

export const WORKSHOP_EARLIER = "Earlier";
export const WORKSHOP_MORE = "More to make";

/** Upgrades sheet (#245): the line above a New card, and the quiet hint. */
export const UPGRADES_INTRO = "Something new for the crew, right on top.";
export const UPGRADES_MORE = "More open up as your crew grows.";

/** A craft that spends no stones. The materials are the price. */
export const CRAFT_WORD = "Craft";

/** Unfound, and the sketch is still out on a trip. No name, no question. */
export const UNFOUND_DEEPER = "Deeper rock keeps a quiet gift.";

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
/** A crew timer already running, on its own card: the same clock as the chip. */
export function crewRunningWords(mark: string, leftMs: number): string {
  return `Crew ${mark}× now · ${formatClock(Math.max(0, leftMs))} left`;
}

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
 * "X/s to Y/s" for a craft card. When whole stones would print the same
 * number on both sides, both keep a tenth (#347), so a raise always shows.
 */
export function craftSpeedPair(before: number, after: number): string {
  const from = formatCraftSpeed(before);
  const to = formatCraftSpeed(after);
  if (from !== to || after <= before) {
    return `${from}/s to ${to}/s`;
  }
  // Past ten thousand "12.3K" can hide a raise: whole stones first, then
  // a tenth only if those match too.
  const whole = (speed: number) =>
    Math.floor(Math.max(0, speed)).toLocaleString("en-US");
  if (whole(before) !== whole(after)) {
    return `${whole(before)}/s to ${whole(after)}/s`;
  }
  const tenth = (speed: number) =>
    Math.max(0, speed).toLocaleString("en-US", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    });
  return `${tenth(before)}/s to ${tenth(after)}/s`;
}

/**
 * A craft rate to one decimal under a thousand, whole stones from there
 * (#347). "8.5", "10.6", "5,197". Whole numbers stay whole.
 */
export function formatCraftSpeed(speed: number): string {
  const abs = Math.max(0, speed);
  // From a thousand on, whole stones like the header (#347): a tenth there
  // is noise ("5197.5/s").
  if (abs >= 1_000) {
    return formatCompact(abs);
  }
  const tenths = Math.round(abs * 10) / 10;
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

/** "Lv 0/2", the same level chip as Upgrades, for a craft made more than once. */
export function craftLevelWords(level: number, max: number): string {
  return `Lv ${String(level)}/${String(max)}`;
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

/** The Workshop drawer's resting kick (#374), the mockup's. */
export const WORKSHOP_KICK = "One bench. Crafts finish while you are away";

/** The legend over the Workshop drawer's recipe rows (#374). */
export const RECIPES_LEGEND = "Recipes";

/** The dark row for recipes not found yet (#374); today's hint is its info. */
export const SKETCH_NAME = "Sketch";
/** The one-time note above the bar (M11 #241, mocked on #240). */
export const WORKSHOP_NOTE = "New · The Workshop is open";

/** The Engineers note (#246), the same bar style as the Workshop's. */
export function engineersNote(name: string): string {
  return `New · ${name} is your first engineer`;
}

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
export const LAYER_ADVICE = "The Granite suits borers. Tough on drills.";
export const LAYER_DIG = "Dig on";

export const CRAFT_DONE = "Your Iron rails are fitted. Carts now 12/s.";
export const CRAFT_DONE_BUTTON = "The crew feels it";

/** Two copies of one run, and the player picks. */
export const SAVE_CONFLICT_TITLE = "Two saves found";
export const SAVE_CONFLICT_BODY =
  "Both of these kept digging. Pick the one you want to play – the other one is kept safe, nothing is lost.";
export const SAVE_CONFLICT_PHONE = "This phone";
export const SAVE_CONFLICT_OTHER = "Other device";
export const SAVE_CONFLICT_PLAY = "Play this one";
export const SAVE_CONFLICT_CONFIRM =
  "Play this one? The other is saved for 7 days.";
export const SAVE_CONFLICT_ERROR =
  "Couldn't store the other save yet – try again";
export const SAVED_COPIES_TITLE = "Saved copies";
export const SAVED_COPIES_EMPTY = "No saved copies yet.";
export const SAVED_COPY_GONE = "That copy is no longer here.";
export const SAVED_COPY_EARLIER_RUN =
  "From an earlier run – can't be played now";

/** Pass the mine to your kid (M6): the confirm card's title and its two answers. */
export const PASS_TITLE = "Pass the mine to your kid.";
export const PASS_NOT_YET = "Not yet";
export const PASS_IT_ON = "Pass it on";

/** One mountain, one tab. The other tabs wait. */
export const OTHER_TAB_TITLE = "Playing in another tab";
export const OTHER_TAB_BODY =
  "The other one has the mountain. Nothing here is lost.";
export const OTHER_TAB_PLAY = "Play here";
/** A newer build is waiting: the card that reloads into it. */
export const UPDATE_TITLE = "Update available";
export const UPDATE_RELOAD = "Reload";
/** Spelled-out tap for the mock. The live button does the same handoff. */
export const OTHER_TAB_TAP =
  "Presses in. This tab takes the mountain, after the other one saves. Stones already mined stay. Silent until unmuted.";

/** The live layer card. Granite matches the approved mock, word for word. */
const LAYER_CARD = {
  granite: {
    arrival: LAYER_ARRIVAL,
    evocative: LAYER_EVOCATIVE,
    advice: LAYER_ADVICE,
    line: "Suits borers.",
  },
  crystal: {
    arrival: "You broke into the Crystal Caves!",
    evocative: "Light in the walls. Your crew can handle this.",
    advice: "The Crystal Caves suit drills. Tough on borers.",
    line: "Suits drills.",
  },
  heart: {
    arrival: "You broke into the Deep Heart!",
    evocative: "Warm stone, deep down. Your crew earned this.",
    advice: "The Deep Heart suits the Great Machine. Tough on borers.",
    line: "Suits the Great Machine.",
  },
} as const;

export type LayerCardWords = {
  readonly arrival: string;
  readonly evocative: string;
  readonly advice: string;
  /** The same advice, short, for the line under the stones. */
  readonly line: string;
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
/** "Your Iron rails are fitted.": a finished craft, on its own (Tonight's line). */
export function craftFittedLine(name: string): string {
  const fitted = name.endsWith("s") ? "are" : "is";
  return `Your ${name} ${fitted} fitted.`;
}

export function craftFittedWords(name: string, effect: string): string {
  return `${craftFittedLine(name)} ${effect}`;
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

/** Pocket order: the shallow ore first. */
export const AWAY_ORE: readonly MaterialId[] = [
  "clay",
  "iron",
  "crystal",
  "heartstone",
];

/**
 * The welcome-back ore line (#247): what came up while you were away, and
 * where it goes. Nothing when no ore came up.
 */
export function awayMaterialsWords(gained: Materials): string | undefined {
  const parts = AWAY_ORE.filter((id) => gained[id] > 0).map(
    (id) => `+${formatCompact(gained[id])} ${id}`,
  );
  return parts.length === 0
    ? undefined
    : `Ore for the Workshop: ${parts.join(" · ")}`;
}

/** Under the ore line: what the Workshop turns it into. */
export const AWAY_MATERIALS_USE = "Craft it into gear for the crew.";

/** The Ledger drawer's kick, under its title (#375). */
export const LEDGER_KICK = "Tonight, and the mine so far";
/** The Ledger's legends: this run's latest lines, then the mine itself. */
export const TONIGHT_LEGEND = "Tonight";
export const MINE_LEGEND = "The mine";
/** The Ledger's "i" cards go back to the list under this. */
export const LEDGER_BACK = "Back to the Ledger";
/** The Pass the mine plate's short fit; the full words stay on its label. */
export const PASS_SHORT = "Pass the mine";
/** Passing the mine, in full: the Pass plate's label and the legacy panel's door. */
export const PASS_FULL = "Pass the mine to your kid";

/** "2 of 6 relics found": the Ledger's relics row. */
export const relicsFoundWords = (found: number): string =>
  `${String(found)} of ${String(RELICS.length)} relics found`;

/** The relics row's goal before the Lantern lights the way, on a first mountain. */
export const RELICS_UNGUIDED =
  "Six Legendary Relics of Fatherhood lie deep inside. Tap to mine.";
/** The relics row's goal before the Lantern, on a mine passed down: `legacy` is its bonus. */
export const kidMineWords = (legacy: string): string =>
  `Your kid's mine: six relics wait inside. Legacy ${legacy}.`;
/** The relics row's goal once every relic is found. */
export const RELICS_ALL_FOUND = "Every relic is yours. You are a legend.";
/** The relics row's goal: the next relic and its vague hint. */
export const nextRelicWords = (name: string, hint: string): string =>
  `Next: ${name} · ${hint}`;
/** The relics bar's label: the relic it fills toward, and the next layer's hint if any. */
export const relicProgressLabel = (
  name: string,
  hint: string | undefined,
): string =>
  hint === undefined
    ? `Progress to the ${name}`
    : `Progress to the ${name}. ${hint}`;

/** Start over, and its confirm page (moved from the menu, #375). */
export const START_OVER = "Start over";
export const START_OVER_TITLE = "Start over?";
export const START_OVER_DETAIL =
  "You will lose all your progress: every stone mined, your whole crew, and every relic you found. The mountain fills back up. This can't be undone.";
export const START_OVER_KEEP = "Keep my mountain";
export const START_OVER_YES = "Yes, start over";

/** The account's words (moved from the menu and the save drawer, #375). */
export const ACCOUNT = "Account";
export const NOT_SIGNED_IN = "Not signed in";
export const SIGN_IN = "Sign in";
export const SIGN_IN_GOOGLE = "Sign in with Google";
export const SIGNING_IN = "Signing in...";
export const SIGN_OUT = "Sign out";
export const signedInWords = (label: string): string => `Signed in as ${label}`;

/*
 * Tonight's lines (#375): one thing this run's field log saw, as one short sentence. Each
 * names only what the event carries.
 */

/** "Hired worker 56.", "Hired kid worker 2.", "Bought mine cart 3.", "Bought Great Machine 1." */
export function tierBuyLine(id: TierId, count: number): string {
  const n = count.toLocaleString("en-US");
  if (id === "helper") {
    return `Hired worker ${n}.`;
  }
  if (id === "kid") {
    return `Hired kid worker ${n}.`;
  }
  const { name } = tierById(id);
  const shown =
    id === "machine" ? name : `${name.charAt(0).toLowerCase()}${name.slice(1)}`;
  return `Bought ${shown} ${n}.`;
}

/** "Strong arms, level 3." */
export const upgradeLevelLine = (name: string, level: number): string =>
  `${name}, level ${level.toLocaleString("en-US")}.`;

/** "Overtime started for 30:00." */
export const boostStartedLine = (name: string, ms: number): string =>
  `${name} started for ${formatClock(ms)}.`;

/** "Iron rails went on the bench." */
export const benchStartedLine = (name: string): string =>
  `${name} went on the bench.`;

/** "Found the Hammer of the Builder." */
export const relicFoundLine = (name: string): string => `Found the ${name}.`;

/** "Came back. The crew dug 1.2M while you were away." */
export const awayDugLine = (stones: number): string =>
  `Came back. The crew dug ${formatCompact(stones)} while you were away.`;

/** "A golden vein gave 4,200 stones." */
export const veinGaveLine = (stones: number): string =>
  `A golden vein gave ${tapWords(stones)}.`;

/** "Ada came home." */
export const cameHomeLine = (name: string): string => `${name} came home.`;

/**
 * The vein's payout note. A quick vein's also names the Gold rush, on a line
 * of its own so the note stays inside the board (Flemming, 11 Nov 2026).
 */
export function veinWords(reward: number, rush: boolean): string {
  const paid = `Golden vein! +${formatCount(reward)} ${reward === 1 ? "stone" : "stones"}`;
  return rush
    ? `${paid}.\nGold rush: the crew digs ×${String(RUSH_MULTIPLIER)} for ${String(RUSH_MS / 1000)} seconds.`
    : paid;
}

/**
 * The welcome card's line for the stones an hour away held for the Gold rush
 * (#468): they come in as the crew digs ×10. Flemming, 11 Nov 2026.
 */
export function rushHeldWords(held: number): string {
  return `${formatCount(held)} of them wait for your Gold rush: watch for the golden vein.`;
}
