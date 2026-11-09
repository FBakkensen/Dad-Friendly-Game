import { tierLock } from "./crew";
import { crewCounts } from "./crew-count";
import { staffForBuy, staffNeeded } from "./engineers";
import { formatCompact, formatCount } from "./format";
import type { Trouble } from "./hazards";
import { REACHED_LINE, milestoneLine } from "./milestones";
import type { Mountain } from "./mountain";
import { effectiveRates, tendingGain } from "./rates";
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
  tierShown,
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

/**
 * One tier's Buys row, from what today's card reads. Display only: it reads
 * the mountain and never buys; only a tap buys. Trouble wins, then the
 * staffing New row, then a lock, then too dear, then short of workers.
 */
export function buyRowView({
  mountain,
  now,
  trouble,
  tier: id,
  pick,
  guided,
}: {
  mountain: Mountain;
  now: number;
  trouble: Trouble | undefined;
  tier: TierId;
  pick: ReadyPick;
  guided: TierId | undefined;
}): BuyRowView {
  const tier = tierById(id);
  const count = owned(mountain, tier);
  const price = tierCost(tier, count, stretch(mountain));
  const lock = tierLock(mountain, tier);
  const troubled = trouble?.tier === id ? trouble : undefined;
  const rates = effectiveRates(mountain, now, trouble);
  const { spare } = crewCounts(mountain, now, trouble);
  // One more of this tier. The Great Machine's bill drops when an engineer
  // would tend it.
  const staff = staffForBuy(mountain, tier);
  const bill = staffBillWords(staff, spare);
  const needsMore = lock === undefined && bill !== undefined && spare < staff;
  const dear =
    lock === undefined && troubled === undefined && mountain.pocket < price;
  const speed = rates.tierSpeed[id];
  const idle = count - rates.running[id];
  const crewEach = staffNeeded(mountain, tier);
  const isGuided = guided === id && troubled === undefined;
  const worker = tierById("helper");
  const workerPrice = tierCost(
    worker,
    owned(mountain, worker),
    stretch(mountain),
  );
  const pickHere = pick.kind !== "mined-out" && pick.tier === id;
  const isPick = pick.kind === "ready" && pickHere;
  // Workers (helper, kid) are hired; machines are bought.
  const buyVerb = tier.staff === 0 ? "Hire" : "Buy";

  // The best-ranked engineer on this machine, and what she adds.
  const tending = ((): { name: string; gain: number } | undefined => {
    if (!isMachine(tier)) {
      return undefined;
    }
    const engineers = mountain.engineers ?? [];
    const who = tendingEngineer(engineers, tier.id);
    return who === undefined
      ? undefined
      : {
          name: who.name,
          gain: tendingGain(
            mountain,
            engineers.indexOf(who),
            tier.id,
            now,
            trouble,
          ),
        };
  })();

  const face = ((): Face => {
    if (troubled !== undefined) {
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
    if (isGuided) {
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
    if (lock !== undefined) {
      return {
        state: "locked",
        info: [lockBodyLine(tier, lock), lockRateLine(tier, lock)],
        need: "",
        price: "Locked",
        dimTag: true,
        verb: "",
        lamp: "off",
        can: false,
      };
    }
    const info = milestoneOptions(id, count);
    if (dear) {
      return {
        state: "dear",
        info,
        need: "",
        price: formatCompact(price),
        dimTag: true,
        verb: staff > 0 ? workersVerb(staff) : buyVerb,
        lamp: "off",
        can: false,
      };
    }
    if (needsMore) {
      return {
        state: "short",
        info,
        need: bill,
        price: formatCompact(price),
        dimTag: false,
        verb: workersVerb(staff),
        lamp: "off",
        can: true,
      };
    }
    return {
      state: "ready",
      info,
      need: "",
      price: formatCompact(price),
      dimTag: false,
      verb: buyVerb,
      lamp: isPick ? "amber" : "green",
      can: true,
    };
  })();

  const pickWord = !pickHere
    ? undefined
    : pick.kind === "ready"
      ? "Ready now"
      : "Saving for";
  const tendWord =
    tending === undefined
      ? undefined
      : `${tending.name} tends · +${formatSpeed(tending.gain)}/s`;
  const flagWords = [pickWord, tendWord].filter(
    (word): word is string => word !== undefined,
  );
  const flag = isGuided
    ? ["New"]
    : flagWords.length === 2
      ? [flagWords.join(" · "), ...flagWords.slice(0, 1)]
      : flagWords;

  // Today's card's four sentences, word for word.
  const tends =
    tending === undefined
      ? ""
      : ` ${tendsNote(tending.name, id)} ${stonesPerSecond(tending.gain)}`;
  const synergy = tierSynergy(mountain, id);
  const aria = isGuided
    ? `${tier.name}: ${formatCount(idle)} idle: each needs ${String(crewEach)} ${workerWords(crewEach)} to run. Tap to hire a worker for ${formatCount(workerPrice)} stones.`
    : troubled !== undefined
      ? troubleAria(troubled.kind, tier)
      : lock !== undefined
        ? `${lockAria(tier, lock)} Mines ${stonesASecond(speed)} each.${tends}`
        : `Buy a ${tier.name.toLowerCase()} for ${formatCount(price)} stones, mines ${stonesASecond(speed)}${synergy > 0 ? `, ${percent(synergy)} faster from crew synergy` : ""}. You have ${formatCount(count)}${idle > 0 ? `, ${formatCount(idle)} idle: each needs ${String(crewEach)} ${workerWords(crewEach)} to run` : ""}${needsMore ? `. ${NEEDS_MORE_WORKERS}` : ""}.${tends}`;

  return {
    tier: id,
    shown: tierShown(mountain, tier),
    icon: buyIcon(id, count, lock !== undefined),
    guided: isGuided,
    name: tier.name,
    badge: "",
    ...face,
    why: "",
    flag,
    gain:
      lock !== undefined || troubled !== undefined
        ? ""
        : `+${formatSpeed(speed)}/s`,
    pick: isPick,
    aria,
  };
}
