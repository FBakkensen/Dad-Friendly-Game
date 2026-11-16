import {
  JOURNEYMAN_TRIPS,
  MASTER_TRIPS,
  MAX_ENGINEERS,
  PROMOTE_BASE_COST,
  TENDED_MACHINE_STAFF,
  TENDING_TENTHS,
} from "./engineers";
import { TUNNELS } from "./expeditions";
import { formatCompact, formatDuration } from "./format";
import { ENGINEER_FIX_MS, FIX_TAPS } from "./hazards";
import { AWAY_PAY_RATE, AWAY_END_MS } from "./rates";
import { tierById } from "./tiers";
import { UPGRADES } from "./upgrades";

/**
 * The reveal line and the How it works card for every system (M11, #242).
 * One place for all of it, so the tone stays the same and a test can read
 * every word. Shown through the shared card in src/teach-ui.ts.
 *
 * Numbers rule: buying, tending and crafting say real numbers, read from
 * the game data below, never typed in. Discoveries (finds, new recipes)
 * stay vague. No question marks, no payback or time-to-afford.
 */

/** An asset under src/assets, without ".png". */
export type HowArt =
  | "pick"
  | "helper-miner"
  | "mine-cart"
  | "steam-drill"
  | "tunnel-borer"
  | "great-machine"
  | "kid-helper"
  | "upgrades-icon"
  | "gold-nugget"
  | "ore-lump"
  | "stone"
  | "worn-map"
  | "boot-tile"
  | "mountain";

type HowStep = readonly [HowArt, string];

export type HowItWorks = {
  /** The card's heading. */
  readonly title: string;
  /** One line for the reveal: the note, or the sheet's intro. */
  readonly reveal: string;
  /** Three or four lines (Time away two, #728), one icon each. One screen, no scroll. */
  readonly steps: readonly HowStep[];
};

export const HOW_SYSTEMS = [
  "workers",
  "machines",
  "staffing",
  "upgrades",
  "engineers",
  "tending",
  "expeditions",
  "away",
] as const;

export type HowSystem = (typeof HOW_SYSTEMS)[number];

const percent = (share: number): string =>
  `${String(Math.round(share * 100))}%`;

const worker = tierById("helper");
const cart = tierById("cart");
const drill = tierById("drill");
const borer = tierById("borer");
const machine = tierById("machine");
const firstUpgrade = Math.min(...UPGRADES.map((item) => item.firstCost));
const shortTunnel = TUNNELS[0];
const longTunnel = TUNNELS[TUNNELS.length - 1] ?? TUNNELS[0];
const tend = (rank: 0 | 1 | 2): string => String(TENDING_TENTHS[rank] * 10);

/** Stone prices on the cards, as the buttons start. */
interface Prices {
  readonly stones: (count: number) => string;
}

type Cards<S extends HowSystem> = Readonly<Record<S, HowItWorks>>;

/** The first cards: the crew and its machines. */
function crewCards({
  stones,
}: Prices): Cards<"workers" | "machines" | "staffing"> {
  return {
    workers: {
      title: "Workers",
      reveal: "Hire a worker and the mountain digs itself.",
      steps: [
        [
          "helper-miner",
          `A worker costs ${stones(worker.firstCost)} and digs ${String(worker.perSecond)}/s, all day long.`,
        ],
        ["stone", "Each worker costs a little more than the last."],
        ["mine-cart", "Machines need workers to run them, so keep hiring."],
      ],
    },
    machines: {
      title: "Machines",
      reveal: "Machines dig far more than hands can.",
      steps: [
        [
          "mine-cart",
          `A mine cart costs ${stones(cart.firstCost)}, digs ${String(cart.perSecond)}/s and needs ${String(cart.staff)} worker.`,
        ],
        [
          "steam-drill",
          `A steam drill digs ${String(drill.perSecond)}/s with ${String(drill.staff)} workers on it.`,
        ],
        [
          "helper-miner",
          "A machine without its crew stands still. Hire first, then build.",
        ],
        [
          "boot-tile",
          `When one breaks, tap it ${String(FIX_TAPS)} times and it runs again.`,
        ],
      ],
    },
    staffing: {
      title: "Staffing",
      reveal: "Every machine needs its own crew to run.",
      steps: [
        [
          "mine-cart",
          `A cart needs ${String(cart.staff)} worker, a drill ${String(drill.staff)}, a borer ${String(borer.staff)}.`,
        ],
        [
          "great-machine",
          `The Great Machine needs ${String(machine.staff)}, or ${String(TENDED_MACHINE_STAFF)} while an engineer tends it.`,
        ],
        [
          "tunnel-borer",
          "Without its crew a machine stands idle and digs nothing.",
        ],
        [
          "helper-miner",
          "Free workers show on the crew line. Hire more and idle machines start.",
        ],
      ],
    },
  };
}

/** What stones buy for good. */
function spendCards({ stones }: Prices): Cards<"upgrades"> {
  return {
    upgrades: {
      title: "Upgrades",
      reveal: "Upgrades make the whole crew better, for good.",
      steps: [
        [
          "upgrades-icon",
          `Upgrades start at ${stones(firstUpgrade)} and last the whole mountain.`,
        ],
        [
          "helper-miner",
          "Some wait until your crew grows. They show up when ready.",
        ],
        ["pick", "Each card says exactly what it does before you buy."],
      ],
    },
  };
}

/** The engineers: promotion, tending and expeditions. */
function engineerCards({
  stones,
}: Prices): Cards<"engineers" | "tending" | "expeditions"> {
  return {
    engineers: {
      title: "Engineers",
      reveal: "Your best worker can step up as engineer.",
      steps: [
        [
          "helper-miner",
          `Promote a worker for ${stones(PROMOTE_BASE_COST)}. Each next one costs double.`,
        ],
        [
          "helper-miner",
          `Up to ${String(MAX_ENGINEERS)} engineers, each with a name.`,
        ],
        [
          "worn-map",
          `They grow with every trip: a rank up at ${String(JOURNEYMAN_TRIPS)} and ${String(MASTER_TRIPS)} trips.`,
        ],
        [
          "boot-tile",
          `Engineers fix trouble on their own within ${formatDuration(ENGINEER_FIX_MS)}.`,
        ],
      ],
    },
    tending: {
      title: "Tending",
      reveal: "An engineer can tend one kind of machine.",
      steps: [
        [
          "steam-drill",
          "Put an engineer on a machine and that kind digs faster.",
        ],
        [
          "helper-miner",
          `+${tend(0)}% at first, then +${tend(1)}% and +${tend(2)}% as they grow.`,
        ],
        [
          "great-machine",
          `A tended Great Machine needs ${String(TENDED_MACHINE_STAFF)} workers, not ${String(machine.staff)}.`,
        ],
      ],
    },
    expeditions: {
      title: "Expeditions",
      reveal: "Engineers can go exploring side tunnels.",
      steps: [
        [
          "worn-map",
          `Send an engineer from ${formatDuration(shortTunnel.awayMs)} up to ${formatDuration(longTunnel.awayMs)}.`,
        ],
        [
          "gold-nugget",
          "They come home with a find. Some are lost tools, some keepsakes.",
        ],
        [
          "helper-miner",
          "Call them back any time. Each trip makes them wiser.",
        ],
      ],
    },
  };
}

/** Time away. */
function endCards(): Cards<"away"> {
  return {
    away: {
      title: "Time away",
      reveal: "Your crew keeps digging while you're gone.",
      steps: [
        [
          "helper-miner",
          `While you're away the crew digs at ${percent(AWAY_PAY_RATE)} of their speed.`,
        ],
        [
          "stone",
          `They dig hard, then ease off, and rest after ${formatDuration(AWAY_END_MS)}.`,
        ],
      ],
    },
  };
}

/** The how-it-works copy, with real stone prices. */
function howItWorks(): Readonly<Record<HowSystem, HowItWorks>> {
  const stones = (count: number): string => `${formatCompact(count)} stones`;
  const prices: Prices = { stones };
  return {
    ...crewCards(prices),
    ...spendCards(prices),
    ...engineerCards(prices),
    ...endCards(),
  };
}

/** The how-it-works copy every card reads. */
export const HOW_IT_WORKS = howItWorks();
