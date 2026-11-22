import { buildingById, type BuildingId } from "./city";
import { partThreeOn, partTwoOn } from "./part-switch";
import { makerTakes } from "./makers";
import { AWAY_PAY_RATE } from "./rates";
import { percent } from "./screen-words";

/**
 * The words of the frame's cards (#663; spec, "The cards", "While a part is
 * the end of the game"): the first evening's card (#703), the end card of a
 * part's last roof, in part 2 the Light Tower's card that opens the
 * refinery (#671), and in part 3 the card of a level reached (#754), in one
 * place so a change of copy is one edit. The shift report's
 * words are its own view (src/shift-report-view.ts). They name no
 * bottleneck, no limit and no best buy.
 */

/** A card of words: its title, its paragraphs and its one key. */
export type CardWords = {
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly key: string;
};

/**
 * What a building gives once it is operational, one sentence a power, in
 * lower case for the city's "On completion:" line: "night shift output 45%,
 * up from 30%.", "stockyard capacity ×2.".
 */
export function powerWords(id: BuildingId): readonly string[] {
  const power = buildingById(id).power;
  return [
    ...(power.nightShift === undefined
      ? []
      : [
          `night shift output ${percent(power.nightShift)}, up from ${percent(AWAY_PAY_RATE)}.`,
        ]),
    ...(power.stockyard === undefined
      ? []
      : [`stockyard capacity ×${String(power.stockyard)}.`]),
  ];
}

/**
 * What a building opens in the parts that are live, for the city's
 * "On completion:" line and its card: the Light Tower opens the refinery in
 * part 2 (#671), the Warehouse trucks in part 3 (#754; spec, While a part is
 * the end of the game). Empty when it opens nothing live.
 */
export function opensWords(id: BuildingId): string {
  if (id === "lightTower" && partTwoOn()) {
    return "Opens the refinery.";
  }
  return id === "warehouse" && partThreeOn() ? "Opens trucks." : "";
}

const sentence = (words: string): string =>
  `${words.charAt(0).toUpperCase()}${words.slice(1)}`;

/** A building's card when its roof goes on: its name and what it gives. */
function operational(id: BuildingId, more: readonly string[]): CardWords {
  return {
    title: `${buildingById(id).name}: operational`,
    paragraphs: [...powerWords(id).map(sentence), ...more],
    key: "Continue",
  };
}

/** The end of a part (rule 6): its last roof is on, and nothing more is live. */
export function endCard(id: BuildingId): CardWords {
  return operational(id, [
    "The city is planning its next building. It comes in a later update.",
  ]);
}

/**
 * A building's card when its roof goes on and the next building is in play
 * (#682): its power and what it opens, in the city's approved words. In
 * part 3 it is the Warehouse's: "Stockyard capacity ×2." and "Opens trucks."
 */
export function builtCard(id: BuildingId): CardWords {
  const opened = opensWords(id);
  return operational(id, opened === "" ? [] : [opened]);
}

/**
 * Part 1's end card, the Light Tower's: shown only with part 2 off (unit
 * tests and labs), so it goes with the old game's clean-up (#665).
 */
export const END_CARD: CardWords = endCard("lightTower");

/**
 * Part 2 (#671; spec, While a part is the end of the game): the Light
 * Tower's roof opens the refinery, and the end card waits for the Warehouse.
 * The recipe is read when the card is painted, so a lab sweep's recipe holds.
 */
export const refineryOpens = (): CardWords =>
  operational("lightTower", [
    `New site: the refinery. A kiln makes 1 brick from ${String(makerTakes("kiln"))} rock. Transport carries rock from the pithead to the kilns, and stone to the stockyard. The stockyard holds a set amount of each good.`,
  ]);

/**
 * The first evening (#703, #769): one worker, the piles, and where the rest
 * comes from.
 */
export const FIRST_EVENING: CardWords = {
  title: "The first evening",
  paragraphs: [
    "One worker, on drilling. Drilled rock waits until haulage carries it to the shaft, hoisting lifts it to the pithead, and driving hauls it to the stockyard as stone.",
    "Move him between the jobs. Every worker you hire moves more.",
  ],
  key: "Start",
};

/**
 * Part 3 (#754, #769): the shaft is sunk and the Granite is open.
 */
export const LEVEL_REACHED: CardWords = {
  title: "The Granite: reached",
  paragraphs: [
    "A second level, twice as deep, with its own drilling and its own haulage. Nobody works there yet: put workers on it with − and + on the level.",
    "A hoist serves both levels in turn: down to one, up, then down to the other. A trip to the Granite takes twice as long. Under Hoisting, − and + assign a hoist to one level only.",
    "Topsoil rock goes to the kilns. Granite rock goes to the saws, which have their own pile of rock.",
    "Opened: saws in the refinery and locomotives for haulage.",
  ],
  key: "Continue",
};
