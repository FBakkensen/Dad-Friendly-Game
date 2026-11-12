import { tierLock, type TierLock } from "./crew";
import { crewCounts } from "./crew-count";
import { atHome, staffForBuy, staffNeeded } from "./engineers";
import { formatCompact, formatCount } from "./format";
import type { Trouble } from "./hazards";
import { REACHED_LINE, milestoneLine } from "./milestones";
import type { Mountain } from "./mountain";
import { effectiveRates, handsGain, tendingGain } from "./rates";
import type { ReadyPick } from "./ready-now";
import type { RowView } from "./row-view";
import { stretch } from "./scale";
import {
  NEEDS_MORE_WORKERS,
  formatSpeed,
  percent,
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
  isMachine,
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
  | "drill"
  | "borer"
  | "tarp"
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
  machines: ["cart", "drill", "borer", "machine"],
} as const;

/** Each tier's quiet line, where it has no milestone line. */
export const TIER_WHY: Readonly<Record<TierId, string>> = {
  helper: "Another pair of hands on the rock.",
  cart: "Hauls what the crew already cut.",
  drill: "Bites the wall while you rest.",
  borer: "Chews a tunnel you can walk from.",
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
 * The next milestone line, then the same without its "Twice as fast now."
 * lead. A tier without marks shows its count and its quiet line.
 */
function milestoneOptions(id: TierId, count: number): readonly string[] {
  const line = milestoneLine(id, count, formatCompact);
  if (line === undefined) {
    const owns = `${formatCompact(count)} owned`;
    return [`${owns} · ${TIER_WHY[id]}`, owns];
  }
  const bare = line.replace(`${REACHED_LINE} `, "");
  return bare === line ? [line] : [line, bare];
}

function buyIcon(id: TierId, count: number, locked: boolean): BuyIcon {
  switch (id) {
    case "helper":
      return "worker";
    case "kid":
      return locked ? "kid-dim" : "kid";
    case "cart":
    case "drill":
      return id;
    case "borer":
      return count === 0 ? "tarp" : "borer";
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
  const bill = staffBillWords(staff, spare);
  const worker = tierById("helper");
  // Workers (helper, kid) are hired; machines are bought. ×10 and Max say how many.
  const buyVerb = `${tier.staff === 0 ? "Hire" : "Buy"}${asked === "one" ? "" : ` ${formatCompact(buying)}`}`;
  const gaining = gainingCount(asked, buying, staff / buying, spare);
  // The plate's pick is one machine the free hands can run. A ready pick whose ×10 or Max the
  // pocket cannot pay, or the free hands cannot all run, is not offered on this row (#358).
  const pickHere =
    pick.kind !== "mined-out" &&
    pick.tier === id &&
    !(pick.kind === "ready" && (mountain.pocket < price || gaining < buying));
  return {
    mountain,
    id,
    tier,
    count,
    buying,
    gaining,
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
      lock === undefined && troubled === undefined && mountain.pocket < price,
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
  tier: Tier,
  now: number,
  trouble: Trouble | undefined,
): Tending | undefined {
  if (!isMachine(tier)) {
    return undefined;
  }
  const who = tendingEngineer(atHome(mountain), tier.id);
  return who === undefined
    ? undefined
    : {
        name: who.name,
        gain: tendingGain(
          mountain,
          mountain.engineers.indexOf(who),
          tier.id,
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
  const short = mountain.pocket < workerPrice;
  return {
    state: short ? "dear" : "ready",
    info: [staffingLine(crewEach, idle)],
    need: "",
    price: formatCompact(workerPrice),
    dimTag: short,
    verb: "Hire",
    lamp: short ? "off" : "green",
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

/** An unlocked tier: too dear, short of workers, or ready. */
function pricedFace(facts: BuyFacts): Face {
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

function buyFace(facts: BuyFacts): Face {
  const { troubled, isGuided, lock, tier } = facts;
  if (troubled !== undefined) {
    return troubleFace(troubled);
  }
  if (isGuided) {
    return guidedFace(facts);
  }
  return lock === undefined ? pricedFace(facts) : lockedFace(tier, lock);
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
  const tendWord =
    tending === undefined
      ? undefined
      : `${tending.name} tends · +${formatSpeed(tending.gain)}/s`;
  const flagWords = [pickWord, tendWord].filter(
    (word): word is string => word !== undefined,
  );
  return flagWords.length === 2
    ? [flagWords.join(" · "), ...flagWords.slice(0, 1)]
    : flagWords;
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
 * start (#490); the staffing New row hires one worker. A machine adds its own speed per one.
 */
function rowGain(
  facts: BuyFacts,
  now: number,
  trouble: Trouble | undefined,
): number {
  const { mountain, id, isGuided, speed, gaining } = facts;
  if (isGuided) {
    return handsGain(mountain, "helper", 1, now, trouble);
  }
  return id === "helper" || id === "kid"
    ? handsGain(mountain, id, gaining, now, trouble)
    : speed * gaining;
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
  const tending = tendingOf(mountain, tier, now, trouble);
  return {
    tier: id,
    shown: tierShown(mountain, tier),
    icon: buyIcon(id, count, lock !== undefined),
    guided: isGuided,
    buying,
    name: tier.name,
    badge: "",
    ...buyFace(facts),
    why: "",
    flag: buyFlag(facts, tending),
    gain:
      lock !== undefined || troubled !== undefined
        ? ""
        : `+${formatSpeed(rowGain(facts, now, trouble))}/s`,
    pick: facts.isPick,
    aria: buyAria(facts, tending, tierSynergy(mountain, id)),
  };
}
