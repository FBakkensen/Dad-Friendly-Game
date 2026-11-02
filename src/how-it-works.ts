import { BOOSTS, type Boost } from "./boosts";
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
import { LAYERS } from "./layers";
import {
  AWAY_PAY_RATE,
  BASE_AWAY_CAP_MS,
  LEGACY_STEP,
  SHIELD_AWAY_CAP_MS,
} from "./rates";
import { tierById } from "./tiers";
import { STEADY_AWAY_PER_LEVEL, UPGRADES } from "./upgrades";
import { VEIN_GLINT_MS } from "./veins";
import { recipeById } from "./workshop";

/**
 * The reveal line and the How it works card for every system (M11, #242).
 * One place for all of it, so the tone stays the same and a test can read
 * every word. Shown through the shared card in src/teach-ui.ts.
 *
 * Numbers rule: buying, tending and crafting say real numbers, read from
 * the game data below, never typed in. Discoveries (relics, finds, new
 * recipes) stay vague. No question marks, no payback or time-to-afford.
 */

/** An asset under src/assets, without ".png". */
type HowArt =
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
  | "mountain"
  | "relics/lantern"
  | "relics/shield"
  | "relics/hammer"
  | "relics/heart"
  | "relics/crown"
  | "relics/mantle";

type HowStep = readonly [HowArt, string];

export type HowItWorks = {
  /** The card's heading. */
  readonly title: string;
  /** One line for the reveal: the note, or the sheet's intro. */
  readonly reveal: string;
  /** Three or four lines, one icon each. One screen, no scroll. */
  readonly steps: readonly HowStep[];
};

export const HOW_SYSTEMS = [
  "tapping",
  "workers",
  "machines",
  "upgrades",
  "boosts",
  "veins",
  "relics",
  "engineers",
  "tending",
  "expeditions",
  "layers",
  "materials",
  "workshop",
  "recipes",
  "away",
  "legacy",
] as const;

export type HowSystem = (typeof HOW_SYSTEMS)[number];

const percent = (share: number): string =>
  `${String(Math.round(share * 100))}%`;
const stones = (count: number): string => `${formatCompact(count)} stones`;

const worker = tierById("helper");
const cart = tierById("cart");
const drill = tierById("drill");
const machine = tierById("machine");
const boost = (id: Boost["id"]): Boost => {
  const found = BOOSTS.find((item) => item.id === id);
  /* v8 ignore next 3 -- both ids are in BOOSTS */
  if (found === undefined) {
    throw new Error(`No boost ${id}`);
  }
  return found;
};
const sharper = boost("sharper");
const overtime = boost("overtime");
const granite = LAYERS[1];
const firstUpgrade = Math.min(...UPGRADES.map((item) => item.firstCost));
const shortTunnel = TUNNELS[0];
const longTunnel = TUNNELS[TUNNELS.length - 1] ?? TUNNELS[0];
const charge = recipeById("blasting-charge");
const reinforce = recipeById("reinforce");
const grease = recipeById("axle-grease");
const reinforcePerLevel =
  reinforce.effect.kind === "reinforce" ? reinforce.effect.perLevel : 0;
const greaseMs = grease.effect.kind === "axle" ? grease.effect.durationMs : 0;
const chargeMs = charge.effect.kind === "charge" ? charge.effect.durationMs : 0;
const tend = (rank: 0 | 1 | 2): string => String(TENDING_TENTHS[rank] * 10);

const boostLine =
  chargeMs === greaseMs
    ? `A blasting charge or axle grease doubles the crew for ${formatDuration(chargeMs)}.`
    : `A blasting charge doubles the crew for ${formatDuration(chargeMs)}, axle grease for ${formatDuration(greaseMs)}.`;

export const HOW_IT_WORKS: Readonly<Record<HowSystem, HowItWorks>> = {
  tapping: {
    title: "Tapping",
    reveal: "Tap the mountain. Every tap is a stone.",
    steps: [
      [
        "mountain",
        "Tap the mountain to dig. Each tap is a stone in your pocket.",
      ],
      ["stone", "Stones buy workers, machines and upgrades."],
      ["pick", "Tapping is a bonus. Your crew does the heavy lifting."],
    ],
  },
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
  boosts: {
    title: "Boosts",
    reveal: "A boost gives the crew a short, big push.",
    steps: [
      ["pick", `${sharper.name}: ${sharper.effect}`],
      ["helper-miner", `${overtime.name}: ${overtime.effect}`],
      [
        "stone",
        "Its timer shows on top while it runs. Buy it again once it ends.",
      ],
    ],
  },
  veins: {
    title: "Golden veins",
    reveal: "A golden vein glints now and then. Tap it quick.",
    steps: [
      ["gold-nugget", "Now and then a golden vein glints on the mountain."],
      [
        "pick",
        `Tap it within ${formatDuration(VEIN_GLINT_MS)} for a big handful of stones.`,
      ],
      ["relics/lantern", "Miss one and another comes along soon."],
    ],
  },
  relics: {
    title: "Relics and the shelf",
    reveal: "Something old is buried deep. Keep digging.",
    steps: [
      ["relics/lantern", "Old relics rest deep in the mountain."],
      [
        "relics/shield",
        "Dig deep enough and one turns up. Each helps for good.",
      ],
      [
        "relics/crown",
        "Found relics sit on the shelf. Tap one to see its gift.",
      ],
    ],
  },
  engineers: {
    title: "Engineers",
    reveal: "Your best worker can step up as engineer.",
    steps: [
      [
        "helper-miner",
        `Promote a worker for ${stones(PROMOTE_BASE_COST)}. Each next one costs double.`,
      ],
      [
        "relics/crown",
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
      ["helper-miner", "Call them back any time. Each trip makes them wiser."],
    ],
  },
  layers: {
    title: "Layers and hardness",
    reveal: "Deeper rock is new rock. Each layer digs differently.",
    steps: [
      [
        "mountain",
        `The mountain has ${String(LAYERS.length)} layers, each with its own rock.`,
      ],
      [
        "steam-drill",
        "Each layer is kinder to some machines and tougher on others.",
      ],
      [
        "mine-cart",
        "The layer card under the stones says which, in plain words.",
      ],
    ],
  },
  materials: {
    title: "Materials",
    reveal: "Each layer gives up its own ore as you dig.",
    steps: [
      [
        "ore-lump",
        `Digging brings up ore: clay first, iron from ${granite.name}.`,
      ],
      ["stone", "Ore comes on its own as the crew digs. Nothing to buy."],
      ["relics/hammer", "Ore goes into gear at the Workshop."],
    ],
  },
  workshop: {
    title: "Workshop",
    reveal: "Turn your clay into gear for the crew.",
    steps: [
      ["relics/hammer", "Pick a recipe. The bench makes one at a time."],
      ["ore-lump", boostLine],
      [
        "upgrades-icon",
        `Reinforce makes a machine ${percent(reinforcePerLevel)} faster a level, up to ${String(reinforce.maxLevel ?? 1)} levels.`,
      ],
      ["mine-cart", "Cancel any time and get back the share you did not use."],
    ],
  },
  recipes: {
    title: "Recipes",
    reveal: "New recipes turn up as you dig deeper.",
    steps: [
      ["worn-map", "Deeper rock keeps new recipes, folded like old sketches."],
      ["relics/hammer", "Each one shows up at the Workshop when found."],
      ["ore-lump", "Some keep for good, even past the bottom."],
    ],
  },
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
        `They keep at it for ${formatDuration(BASE_AWAY_CAP_MS)}, or ${formatDuration(SHIELD_AWAY_CAP_MS)} with the right relic.`,
      ],
      [
        "upgrades-icon",
        `Steady hands makes time away pay ${percent(STEADY_AWAY_PER_LEVEL)} more.`,
      ],
    ],
  },
  legacy: {
    title: "Passing to your kid",
    reveal: "Reach the bottom and pass the mine to your kid.",
    steps: [
      [
        "relics/mantle",
        "Reach the bottom with the last relic and you can pass the mine on.",
      ],
      ["kid-helper", "Your kid starts a fresh mountain with your recipes."],
      [
        "helper-miner",
        `Each pass makes crew and taps ${percent(LEGACY_STEP)} stronger, for good.`,
      ],
    ],
  },
};
