import { tierLock, type TierLock } from "./crew";
import { crewCounts } from "./crew-count";
import { atHome, isTendTier, staffForBuy, staffNeeded } from "./engineers";
import { formatCompact, formatCount } from "./format";
import type { Trouble } from "./hazards";
import {
  MARK_SHORT,
  REACHED_LINE,
  milestonesReached,
  nextMark,
} from "./milestones";
import type { Mountain } from "./mountain";
import { effectiveRates, handsGain, machineGain, tendingGain } from "./rates";
import type { Stage } from "./line";
import type { ReadyPick } from "./ready-now";
import type { RowView } from "./row-view";
import { stretch } from "./scale";
import {
  NEEDS_MORE_WORKERS,
  formatSpeed,
  percent,
  roomToSpare,
  staffBillWords,
  staffingLine,
  stonesASecond,
  stonesPerSecond,
  tendingEngineer,
  tendsNote,
  troubleAria,
  troubleShout,
  workerWords,
} from "./screen-words";
import { lockAria, lockBodyLine, lockRateLine } from "./tier-lock-words";
import {
  owned,
  tierById,
  tierCost,
  tierQuote,
  tierShown,
  type BuyAmount,
  type Tier,
  type TierId,
} from "./tiers";
import { tierSynergy } from "./upgrades";

/** The art a Buys row shows, by key: the drawer maps each to its PNG. */
export type BuyIcon =
  | "worker"
  | "kid"
  | "kid-dim"
  | "cart"
  | "hoist"
  | "drill"
  | "borer"
  | "tarp"
  | "train"
  | "train-dim"
  | "machine"
  | "machine-dim";

/** One Buys row (#373): a tier's row, with its art and whether it shows. */
export interface BuyRowView extends RowView {
  readonly tier: TierId;
  readonly shown: boolean;
  readonly icon: BuyIcon;
  /** The staffing New row: a tap hires a worker, never another machine. */
  readonly guided: boolean;
  /** How many a tap buys, with the price for all of them (#358). */
  readonly buying: number;
}

/** The Buys drawer's two sections, in row order. */
export const BUY_SECTIONS = {
  crew: ["helper", "kid"],
  machines: ["cart", "hoist", "drill", "borer", "train", "machine"],
} as const;

/** Each tier's quiet line, where it has no milestone line. */
export const TIER_WHY: Readonly<Record<TierId, string>> = {
  helper: "Another pair of hands on the rock.",
  cart: "Hauls what the crew already cut.",
  hoist: "Lifts the haul up the shaft.",
  drill: "Bites the wall while you rest.",
  borer: "Chews a tunnel you can walk from.",
  train: "Hauls by the wagonload, deep down.",
  machine: "The big one, with a crew of its own.",
  kid: "Mines, and teaches the others a little.",
};

/** The row's state and the words that go with it. */
type Face = Pick<
  RowView,
  "state" | "info" | "need" | "price" | "dimTag" | "verb" | "lamp" | "can"
>;

/** "1 worker", "8 workers": the verb on a machine that needs hands. */
function workersVerb(staff: number): string {
  return `${formatCompact(staff)} ${workerWords(staff)}`;
}

/**
 * The next mark (#506): its progress with the goal's payoff, which may take the row's two
 * lines, then with the short payoff, then the progress alone. Past the last mark, the reached
 * line. A tier without marks shows its count and its quiet line.
 */
function milestoneOptions(id: TierId, count: number): readonly string[] {
  const next = nextMark(id, count, formatCompact);
  if (next !== undefined) {
    return [
      `${next.progress} · ${next.payoff}`,
      `${next.progress} · ${MARK_SHORT}`,
      next.progress,
    ];
  }
  if (milestonesReached(id, count) > 0) {
    return [REACHED_LINE];
  }
  const owns = `${formatCompact(count)} owned`;
  return [`${owns} · ${TIER_WHY[id]}`, owns];
}

function buyIcon(id: TierId, count: number, locked: boolean): BuyIcon {
  switch (id) {
    case "helper":
      return "worker";
    case "kid":
      return locked ? "kid-dim" : "kid";
    case "cart":
    case "hoist":
    case "drill":
      return id;
    case "borer":
      return count === 0 ? "tarp" : "borer";
    case "train":
      return locked ? "train-dim" : "train";
    case "machine":
      return locked ? "machine-dim" : "machine";
  }
}

type BuyInput = {
  mountain: Mountain;
  now: number;
  trouble: Trouble | undefined;
  tier: TierId;
  pick: ReadyPick;
  guided: TierId | undefined;
  /** How many a tap buys (#358). The staffing New row hires one whatever it says. */
  amount: BuyAmount;
};

type BuyFacts = {
  readonly mountain: Mountain;
  readonly id: TierId;
  readonly tier: Tier;
  readonly count: number;
  /** How many a tap buys now, and `price` is all of them together (#358). */
  readonly buying: number;
  /** How many the row's gain counts: one on ×1, else those the free hands can run. */
  readonly gaining: number;
  /**
   * The workers the gaining ones still lack. A row short of hands shows what
   * it adds once they are hired (#536), never the nothing an idle one adds.
   */
  readonly missing: number;
  readonly price: number;
  readonly lock: TierLock | undefined;
  readonly troubled: Trouble | undefined;
  readonly speed: number;
  readonly idle: number;
  readonly crewEach: number;
  readonly isGuided: boolean;
  readonly workerPrice: number;
  readonly pickHere: boolean;
  readonly isPick: boolean;
  readonly buyVerb: string;
  /**
   * The verb on a row too dear or short of hands: the hands one more needs, or, on ×10 and Max,
   * the counted verb, so the row still says how many (#358).
   */
  readonly handsVerb: string;
  readonly staff: number;
  /** The workers one more of this tier still needs, in words, when there are too few spare. */
  readonly shortOf: string | undefined;
  readonly dear: boolean;
};

type Tending = { name: string; gain: number };

/** What a Buys row reads off the mountain, worked out once. */
function buyFacts({
  mountain,
  now,
  trouble,
  tier: id,
  pick,
  guided,
  amount,
}: BuyInput): BuyFacts {
  const tier = tierById(id);
  const count = owned(mountain, tier);
  const lock = tierLock(mountain, tier);
  const troubled = trouble?.tier === id ? trouble : undefined;
  const isGuided = guided === id && troubled === undefined;
  // The staffing New row hires one worker, whatever the amount.
  const asked = isGuided ? "one" : amount;
  const { count: buying, cost: price } = tierQuote(mountain, tier, asked);
  const rates = effectiveRates(mountain, now, trouble);
  const { spare } = crewCounts(mountain, now, trouble);
  // What the buy needs. The Great Machine's bill drops when an engineer
  // would tend it.
  const staff = staffForBuy(mountain, tier) * buying;
  const bill = staffBillWords(staff);
  const worker = tierById("helper");
  // Workers (helper, kid) are hired; machines are bought. ×10 and Max say how many.
  const buyVerb = `${tier.staff === 0 ? "Hire" : "Buy"}${asked === "one" ? "" : ` ${formatCompact(buying)}`}`;
  const gaining = gainingCount(asked, buying, staff / buying, spare);
  // The plate's pick is one machine the free hands can run. A ready pick whose ×10 or Max the
  // pocket cannot pay, or the free hands cannot all run, is not offered on this row (#358).
  const pickHere =
    pick.kind !== "mined-out" &&
    pick.tier === id &&
    !(
      pick.kind === "ready" &&
      (mountain.stock.stones < price || gaining < buying)
    );
  return {
    mountain,
    id,
    tier,
    count,
    buying,
    gaining,
    missing: Math.max(0, (staff / buying) * gaining - spare),
    price,
    lock,
    troubled,
    speed: rates.tierSpeed[id],
    idle: count - rates.running[id],
    crewEach: staffNeeded(mountain, tier),
    isGuided,
    workerPrice: tierCost(worker, owned(mountain, worker), stretch(mountain)),
    pickHere,
    isPick: pick.kind === "ready" && pickHere,
    buyVerb,
    handsVerb: asked === "one" && staff > 0 ? workersVerb(staff) : buyVerb,
    staff,
    shortOf: lock === undefined && spare < staff ? bill : undefined,
    dear:
      lock === undefined &&
      troubled === undefined &&
      mountain.stock.stones < price,
  };
}

/**
 * How many of a buy the row's gain counts (#358). ×1 shows what one more adds, as it always has.
 * ×10 and Max count only those the free hands can run, so a Max of idle carts never promises
 * their output.
 */
function gainingCount(
  amount: BuyAmount,
  buying: number,
  staffEach: number,
  spare: number,
): number {
  if (amount === "one" || staffEach === 0) {
    return amount === "one" ? 1 : buying;
  }
  return Math.min(buying, Math.floor(Math.max(0, spare) / staffEach));
}

/** The best-ranked engineer on this machine, and what she adds. */
function tendingOf(
  mountain: Mountain,
  id: TierId,
  now: number,
  trouble: Trouble | undefined,
): Tending | undefined {
  if (!isTendTier(id)) {
    return undefined;
  }
  const who = tendingEngineer(atHome(mountain), id);
  return who === undefined
    ? undefined
    : {
        name: who.name,
        gain: tendingGain(
          mountain,
          mountain.engineers.indexOf(who),
          id,
          now,
          trouble,
        ),
      };
}

function troubleFace(troubled: Trouble): Face {
  return {
    state: "trouble",
    info: [`${troubleShout(troubled.kind)} · Hold to fix`],
    need: "",
    price: "",
    dimTag: false,
    verb: "",
    lamp: "red",
    can: true,
  };
}

function guidedFace(facts: BuyFacts): Face {
  const { mountain, workerPrice, crewEach, idle } = facts;
  const short = mountain.stock.stones < workerPrice;
  return {
    state: short ? "dear" : "ready",
    info: [staffingLine(crewEach, idle)],
    need: "",
    price: formatCompact(workerPrice),
    dimTag: short,
    verb: "Hire",
    // The staffing New row is the board's pick: amber, as every New row (#509).
    lamp: short ? "off" : "amber",
    can: !short,
  };
}

function lockedFace(tier: Tier, lock: TierLock): Face {
  return {
    state: "locked",
    info: [lockBodyLine(tier, lock), lockRateLine(lock)],
    need: "",
    price: "Locked",
    dimTag: true,
    verb: "",
    lamp: "off",
    can: false,
  };
}

/**
 * A ready machine that adds nothing (#536): its stage has room to spare, so the row says so,
 * keeps its lamp dark, and still buys.
 */
function roomFace(stage: Stage, facts: BuyFacts): Face {
  return {
    state: "ready",
    info: [roomToSpare(stage)],
    need: "",
    price: formatCompact(facts.price),
    dimTag: false,
    verb: facts.buyVerb,
    lamp: "off",
    can: true,
  };
}

/** An unlocked tier: too dear, short of workers, or ready. */
function pricedFace(facts: BuyFacts, gain: number): Face {
  const { id, count, price, shortOf, dear, buyVerb, handsVerb, isPick } = facts;
  const info = milestoneOptions(id, count);
  const shown = formatCompact(price);
  if (dear) {
    return {
      state: "dear",
      info,
      need: "",
      price: shown,
      dimTag: true,
      verb: handsVerb,
      lamp: "off",
      can: false,
    };
  }
  if (shortOf !== undefined) {
    return {
      state: "short",
      info,
      need: shortOf,
      price: shown,
      dimTag: false,
      verb: handsVerb,
      lamp: "off",
      can: true,
    };
  }
  const { stage } = facts.tier;
  if (gain <= 0 && stage !== undefined) {
    return roomFace(stage, facts);
  }
  return {
    state: "ready",
    info,
    need: "",
    price: shown,
    dimTag: false,
    verb: buyVerb,
    lamp: isPick ? "amber" : "green",
    can: true,
  };
}

function buyFace(facts: BuyFacts, gain: number): Face {
  const { troubled, isGuided, lock, tier } = facts;
  if (troubled !== undefined) {
    return troubleFace(troubled);
  }
  if (isGuided) {
    return guidedFace(facts);
  }
  return lock === undefined ? pricedFace(facts, gain) : lockedFace(tier, lock);
}

/** Who tends and what she adds, then the number alone (#506): it is what the flag is for. */
function tendFlag(who: Tending): string[] {
  const adds = `+${formatSpeed(who.gain)}/s`;
  return [`${who.name} ${adds}`, adds];
}

function buyFlag(facts: BuyFacts, tending: Tending | undefined): string[] {
  if (facts.isGuided) {
    return ["New"];
  }
  const pickWord = !facts.pickHere
    ? undefined
    : facts.isPick
      ? "Ready now"
      : "Saving for";
  const tends = tending === undefined ? [] : tendFlag(tending);
  const [named] = tends;
  if (pickWord === undefined) {
    return tends;
  }
  return named === undefined
    ? [pickWord]
    : [`${pickWord} · ${named}`, pickWord];
}

/** "Buy a mine cart", "Buy 10 mine carts": what the tap buys. */
function buyingWhat(tier: Tier, buying: number): string {
  const name = tier.name.toLowerCase();
  return buying === 1 ? `Buy a ${name}` : `Buy ${formatCount(buying)} ${name}s`;
}

/** The buy sentence: price, output, synergy, what you have and who is idle. */
function buyingAria(facts: BuyFacts, synergy: number): string {
  const { tier, buying, price, speed, count, idle, crewEach, shortOf } = facts;
  const faster =
    synergy > 0 ? `, ${percent(synergy)} faster from crew synergy` : "";
  const idleWords =
    idle > 0
      ? `, ${formatCount(idle)} idle: each needs ${String(crewEach)} ${workerWords(crewEach)} to run`
      : "";
  const more = shortOf !== undefined ? `. ${NEEDS_MORE_WORKERS}` : "";
  const mines = buying === 1 ? "mines" : "each mines";
  return `${buyingWhat(tier, buying)} for ${formatCount(price)} stones, ${mines} ${stonesASecond(speed)}${faster}. You have ${formatCount(count)}${idleWords}${more}.`;
}

/**
 * " The haul has room to spare." on a machine that adds nothing, else
 * nothing. A row whose free hands run none of the ones it buys reads +0 for
 * want of hands, not room, so it says nothing here.
 */
function roomAria(facts: BuyFacts, gain: number | undefined): string {
  const { stage } = facts.tier;
  return gain === 0 &&
    facts.gaining > 0 &&
    stage !== undefined &&
    !facts.isGuided
    ? ` ${roomToSpare(stage)}.`
    : "";
}

function buyAria(
  facts: BuyFacts,
  tending: Tending | undefined,
  synergy: number,
): string {
  const { id, tier, lock, troubled, isGuided, idle, crewEach, speed } = facts;
  if (isGuided) {
    return `${tier.name}: ${formatCount(idle)} idle: each needs ${String(crewEach)} ${workerWords(crewEach)} to run. Tap to hire a worker for ${formatCount(facts.workerPrice)} stones.`;
  }
  if (troubled !== undefined) {
    return troubleAria(troubled.kind, tier);
  }
  // Today's card's four sentences, word for word.
  const tends =
    tending === undefined
      ? ""
      : ` ${tendsNote(tending.name, id)} ${stonesPerSecond(tending.gain)}`;
  return lock === undefined
    ? `${buyingAria(facts, synergy)}${tends}`
    : `${lockAria(tier, lock)} Mines ${stonesASecond(speed)} each.${tends}`;
}

/**
 * What the row's buy adds. Workers and kids add the crew's rise, with the idle machines they
 * start (#490); the staffing New row hires one worker. A machine adds what the line gains from
 * it (#536), with the workers it still lacks, which is nothing when its stage already has room
 * to spare.
 */
function rowGain(
  facts: BuyFacts,
  now: number,
  trouble: Trouble | undefined,
): number {
  const { mountain, id, isGuided, gaining } = facts;
  if (isGuided) {
    return handsGain(mountain, "helper", 1, now, trouble);
  }
  if (id === "helper" || id === "kid") {
    return handsGain(mountain, id, gaining, now, trouble);
  }
  return machineGain(mountain, id, gaining, now, trouble, facts.missing);
}

/**
 * One tier's Buys row, from what today's card reads. Display only: it reads
 * the mountain and never buys; only a tap buys. Trouble wins, then the
 * staffing New row, then a lock, then too dear, then short of workers.
 */
export function buyRowView(input: BuyInput): BuyRowView {
  const { mountain, now, trouble } = input;
  const facts = buyFacts(input);
  const { id, tier, lock, troubled, isGuided, count, buying } = facts;
  const tending = tendingOf(mountain, id, now, trouble);
  const gain =
    lock !== undefined || troubled !== undefined
      ? undefined
      : rowGain(facts, now, trouble);
  return {
    tier: id,
    shown: tierShown(mountain, tier),
    icon: buyIcon(id, count, lock !== undefined),
    guided: isGuided,
    buying,
    name: tier.name,
    badge: "",
    ...buyFace(facts, gain ?? 0),
    why: "",
    flag: buyFlag(facts, tending),
    gain: gain === undefined ? "" : `+${formatSpeed(gain)}/s`,
    pick: facts.isPick,
    aria: `${buyAria(facts, tending, tierSynergy(mountain, id))}${roomAria(facts, gain)}`,
  };
}
