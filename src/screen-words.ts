import {
  JOURNEYMAN_TRIPS,
  MASTER_TRIPS,
  type Duty,
  type DutyEngineer,
  type Engineer,
  type EngineerPost,
  type EngineerRank,
} from "./engineers";
import type { LostToolId } from "./lost-tools";
import type { MakerId } from "./makers";
import {
  KEEPSAKES,
  type FindId,
  type KeepsakeId,
  type SettledFind,
  type TunnelId,
} from "./expeditions";
import { formatCompact, formatCount, formatDuration } from "./format";
import type { LayerId, Materials, MaterialId } from "./layers";
import type { Mountain } from "./mountain";
import { AWAY_END_MS, effectiveRates, type Rates } from "./rates";
import type { Stage } from "./line";
import { owned, tierById, type MachineId, type TierId } from "./tiers";
import type { VehicleId } from "./transport";
import { upgradeLevel, type Upgrade, type UpgradeId } from "./upgrades";
import { haulageWorkers, toolSpeed } from "./workforce";

// Player-facing wording shared by the screen's panels.

/** Away pay as a percentage people read, e.g. "30%" or "37.5%". */
export const percent = (share: number): string =>
  `${String(Number((share * 100).toFixed(1)))}%`;

/** One, or more than one: `plural(2, ["cart", "carts"])` is "carts". */
export const plural = (
  count: number,
  [one, many]: readonly [string, string],
): string => (count === 1 ? one : many);

/** What a stage's workers hold when they run no machine: one, and more than one. */
export const TOOL_WORDS: Readonly<Record<Stage, readonly [string, string]>> = {
  face: ["with a pick", "with picks"],
  haul: ["with a barrow", "with barrows"],
  lift: ["on a winch", "on winches"],
};

/** A vehicle as the city's transport plate counts it: one, and more than one. */
export const VEHICLE_WORDS: Readonly<
  Record<VehicleId, readonly [string, string]>
> = {
  horseWagon: ["horse wagon", "horse wagons"],
  truck: ["truck", "trucks"],
};

/** A vehicle on its key in the city: "+Wagon", "+10 Wagons". */
export const VEHICLE_KEYS: Readonly<
  Record<VehicleId, readonly [string, string]>
> = {
  horseWagon: ["Wagon", "Wagons"],
  truck: ["Truck", "Trucks"],
};

/** A machine as the workforce and the mine count it: one, and more than one. */
export const MACHINE_WORDS: Readonly<
  Record<MachineId, readonly [string, string]>
> = {
  cart: ["cart", "carts"],
  hoist: ["hoist", "hoists"],
  drill: ["drill", "drills"],
  borer: ["borer", "borers"],
  train: ["locomotive", "locomotives"],
  machine: ["great machine", "great machines"],
};

/** A maker's noun (#754), as the machines' are: the refinery's plates and the workforce's notes. */
export const MAKER_WORDS: Readonly<Record<MakerId, readonly [string, string]>> =
  {
    kiln: ["kiln", "kilns"],
    saw: ["saw", "saws"],
  };

/** Per-unit speed: one decimal while small and fractional (Work boots). */
export const formatSpeed = (speed: number): string =>
  speed < 10 && !Number.isInteger(speed)
    ? speed.toFixed(1)
    : formatCompact(speed);

/**
 * Workers one more of this machine needs. The free count lives on the crew
 * line, so a card never repeats it.
 */
export function staffBillWords(staff: number): string | undefined {
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
    // The line's machines have no post words until Buys by stage (#538).
    case "hoist":
    case "train":
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
const workerWords = (count: number): string =>
  count === 1 ? "worker" : "workers";

/** "1 stone a second" or "6 stones a second": the crew line and Buys' aria. */
const stonesASecond = (rate: number): string =>
  rate === 1 ? "1 stone a second" : `${formatCount(rate)} stones a second`;

/**
 * "Your crew mines 586 stones a second", compact once it's big. Buys' crew
 * line is a figure, so a big rate carries /s ("154.1K stones/s") and never
 * wraps; the dial's note when a crew timer runs out is a sentence, so it
 * keeps "a second" ("154.1K stones a second", Flemming 13 Nov 2026), the
 * #508 rule (#527).
 */
export function crewMinesWords(
  crewPerSecond: number,
  unit: "/s" | " a second" = "/s",
): string {
  const rate = Math.max(0, Math.floor(crewPerSecond));
  return rate >= 1_000
    ? `Your crew mines ${formatCompact(rate)} stones${unit}`
    : `Your crew mines ${stonesASecond(rate)}`;
}

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
    case "boots":
      // Work boots lifts only a worker with a tool (rule 2.9).
      return `Workers with a tool ${fromTo(change, (rates) => `${formatSpeed(toolSpeed(rates.tierSpeed, "face"))}/s`)}.`;
    case "cartSyn":
    case "drillSyn":
    case "borerSyn":
    case "machineSyn":
      return synergyEffectLine(upgrade, mountain, change);
  }
}

/**
 * Whether a synergy has any of the tier that feeds it. The workers that
 * feed Loading crews are the ones on haulage (rule 2.9).
 */
const synergyFed = (upgrade: Upgrade, mountain: Mountain): boolean =>
  upgrade.synergy !== undefined &&
  (upgrade.synergy.from === "helper"
    ? haulageWorkers(mountain)
    : owned(mountain, tierById(upgrade.synergy.from))) > 0;

function synergyEffectLine(
  upgrade: Upgrade,
  mountain: Mountain,
  change: UpgradeChange,
): string {
  if (upgrade.synergy === undefined || !synergyFed(upgrade, mountain)) {
    return UPGRADE_RULE[upgrade.id] ?? upgrade.perLevel;
  }
  const to = tierById(upgrade.synergy.to);
  const name = to.id === "machine" ? "Great Machine" : `${to.shortName}s`;
  return `${name} ${fromTo(change, (rates) => `${formatSpeed(rates.tierSpeed[to.id])}/s`)}.`;
}

/**
 * The card's quiet second line: why it is worth it, never the effect again.
 * Work boots lifts only a worker with a tool, and Loading crews counts the
 * workers on haulage (#661, the spec's call 41). Approved by Flemming on
 * 15 Nov 2026; the names are the engineering ones he chose that day (#711).
 */
const UPGRADE_WHY: Record<UpgradeId, string> = {
  boots:
    "Picks, barrows and winches go faster. Machines, drivers and builders do not.",
  cartSyn: "Each worker on haulage makes carts 1% faster.",
  drillSyn: "Each cart makes the drills a little quicker.",
  borerSyn: "Each drill makes the borers a little quicker.",
  machineSyn: "Each borer makes the machine a little quicker.",
};

/** An upgrade's rule, where its `perLevel` does not say it (#661). */
const UPGRADE_RULE: Partial<Record<UpgradeId, string>> = {
  cartSyn: "Each worker on haulage makes carts 1% faster.",
};

/** "workers", "carts", "borers": the tier a synergy needs, plural. */
const tierPlural = (id: TierId): string =>
  id === "helper" ? workerWords(2) : `${tierById(id).shortName.toLowerCase()}s`;

/**
 * The why line under the effect line (#342). A synergy with none of its
 * source already shows its rule, so this says what makes it count.
 */
export function upgradeWhyLine(upgrade: Upgrade, mountain: Mountain): string {
  if (upgrade.synergy !== undefined && !synergyFed(upgrade, mountain)) {
    // A rule is already the effect line, and it has no other approved words.
    return UPGRADE_RULE[upgrade.id] === undefined
      ? `It counts once you have ${tierPlural(upgrade.synergy.from)}.`
      : "";
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

/**
 * The welcome card's big number and its unit, read together: "+1.2M stones", "+1 stone".
 * The card sets the unit smaller beside the number.
 */
export const awayMinedWords = (
  mined: number,
): { readonly count: string; readonly unit: "stone" | "stones" } => ({
  // The board's short figures (#508): "+947.1K", never "+947.1 thousand".
  count: `+${formatCompact(mined)}`,
  unit: mined === 1 ? "stone" : "stones",
});

/** How long you were gone, and how the crew dug. */
export function awayGoneWords(report: {
  readonly awayMs: number;
  readonly paidMs: number;
}): string {
  return `You were gone ${formatDuration(report.awayMs)}. ${awayStretchWords(report)}`;
}

export const TROUBLE_FIXED = "Fixed! The crew cheers.";

export const fieldLogCopy = "Copy field log";
export const fieldLogCopied = "Copied";
export const fieldLogTitle = "Field log";
export const fieldLogFallback = "Select the log and copy it from here.";
/**
 * The way back from a drawer or a card on slice 1's frame (#708), the
 * workforce sheet's word: the frame has no board and more than the mine.
 */
export const CLOSE = "Close";

/** Posts the Tend list offers, in sheet order. A tunnel is not one of them. */
export const TEND_POSTS = [
  "cart",
  "drill",
  "borer",
  "machine",
  "camp",
] as const satisfies readonly EngineerPost[];

export type TendPost = (typeof TEND_POSTS)[number];

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
  "deep-dark": "All night, the best chance of a new engineer.",
};

/**
 * Stones a second, in the game's number format.
 * "+800 stones/sec", "+1.2K stones/sec".
 */

export function stonesPerSecond(gain: number): string {
  return `+${formatCompact(Math.max(0, Math.floor(gain)))} stones/sec`;
}

/**
 * The open card's one sentence. A tended machine names the live gain.
 * Camp and a tunnel tend nothing.
 */
export function dutySentence(engineer: DutyEngineer, gain?: string): string {
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
  engineer: DutyEngineer,
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

export const exploreTitle = (tunnel: TunnelId): string => TUNNEL_TITLE[tunnel];

export const exploreBenefit = (tunnel: TunnelId): string =>
  TUNNEL_BENEFIT[tunnel];

export function exploreAside(name: Engineer["name"], post: Duty): string {
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

/** Best-ranked engineer posted on this tier, if someone is. Pass the crew at home. */
export const tendingEngineer = (
  engineers: readonly Engineer[],
  tierId: TierId,
): Engineer | undefined => {
  let best: Engineer | undefined;
  for (const engineer of engineers) {
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
  map: "Trips come home sooner.",
  boots: "Fewer troubles at the machines.",
} as const;

const TOOL_IN_SENTENCE = {
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
      return `${name} came back from ${from} with ${KEEPSAKE_IN_SENTENCE[find.id]}.`;
    case "engineer":
      return find.joined
        ? `${name} came back from ${from} with ${find.name}, who joined the crew.`
        : `${name} came back from ${from}. The lost engineer had already found a place.`;
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

/** The Ledger's one Sound key (#491). It stays off until the dad asks. The house is asleep. */
export const SOUND_QUIET = "Quiet";
export const SOUND_ON = "Sound";

export const WORKSHOP_EARLIER = "Earlier";
export const WORKSHOP_MORE = "More to make";

/** Unfound, and the sketch is still out on a trip. No name, no question. */
export const UNFOUND_DEEPER = "Deeper rock keeps a quiet gift.";

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
 * Another crew timer is already this strong. Grease and a charge do not
 * multiply, so the card does not promise a bigger crew.
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

/** One mountain, one tab. The other tabs wait. */
export const OTHER_TAB_TITLE = "Playing in another tab";
export const OTHER_TAB_BODY =
  "The other one has the mountain. Nothing here is lost.";
export const OTHER_TAB_PLAY = "Play here";
/** A newer build is waiting: the card that reloads into it. */
export const UPDATE_TITLE = "Update available";
export const UPDATE_RELOAD = "Reload";
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
const AWAY_ORE: readonly MaterialId[] = [
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
/** Start over, and its confirm page (moved from the menu, #375). */
export const START_OVER = "Start over";
export const START_OVER_TITLE = "Start over?";
/** Start over in a fresh mine (#708): no mountain to fill. */
export const START_OVER_FRESH_DETAIL =
  "You will lose all your progress: the stone in the stockpile, every worker and machine, and the city's buildings. The mine starts again from the beginning. This can't be undone.";
export const START_OVER_FRESH_KEEP = "Keep my mine";
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

/** A thing bought, by its frame name, and its count (#708): "Bought cart 3." */
export function machineBuyLine(name: string, count: number): string {
  return `Bought ${name} ${count.toLocaleString("en-US")}.`;
}

/** A vehicle bought (#708): "Bought horse wagon 2.", as a machine bought. */
export function vehicleBuyLine(id: VehicleId, count: number): string {
  return machineBuyLine(VEHICLE_WORDS[id][0], count);
}

/** "Work boots, level 1." */
export const upgradeLevelLine = (name: string, level: number): string =>
  `${name}, level ${level.toLocaleString("en-US")}.`;

/** "Iron rails went on the bench." */
export const benchStartedLine = (name: string): string =>
  `${name} went on the bench.`;

/** "Came back. The crew dug 1.2M while you were away." */
export const awayDugLine = (stones: number): string =>
  `Came back. The crew dug ${formatCompact(stones)} while you were away.`;

/** "Ada came home." */
export const cameHomeLine = (name: string): string => `${name} came home.`;

/**
 * The note on the Pace dial when the crew timer runs out (#527): what
 * ended, and what the crew mines now, so a sudden drop has its reason.
 */
export function boostOverWords(name: string, crewPerSecond: number): string {
  return `${name} over.\n${crewMinesWords(crewPerSecond, " a second")} now.`;
}
