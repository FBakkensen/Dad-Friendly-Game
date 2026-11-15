import { buildingById, type BuildingId } from "./city";
import { makerTakes } from "./makers";
import { AWAY_PAY_RATE } from "./rates";
import { percent } from "./screen-words";

/**
 * The words of the frame's cards (#663; spec, "The cards", "While a part is
 * the end of the game"): the first evening's card (#703), the end card of a
 * part's last roof, and in part 2 the Light Tower's card that opens the
 * refinery (#671), in one place so a change of copy is one edit. The shift report's
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

/** The end of part 1: the Light Tower's roof is on. */
export const END_CARD: CardWords = endCard("lightTower");

/**
 * Part 2 (#671; spec, While a part is the end of the game): the Light
 * Tower's roof opens the refinery, and the end card waits for the Warehouse.
 * The recipe is read when the card is painted, so a lab sweep's recipe holds.
 */
export const refineryOpens = (): CardWords =>
  operational("lightTower", [
    `New site: the refinery. A kiln makes 1 brick from ${String(makerTakes("kiln"))} rock. Hoisting fills the rock at the kilns first, and rock that finds no room there goes to the stockyard as stone. The stockyard holds a set amount of each good.`,
  ]);

/**
 * The first evening (#703): one worker, the piles, and where the rest comes
 * from. Approved by Flemming, 15 Nov 2026 (no "face": an engineering game).
 */
export const FIRST_EVENING: CardWords = {
  title: "The first evening",
  paragraphs: [
    "One worker, on drilling. Drilled rock waits until haulage carries it to the shaft, and at the shaft until hoisting lifts it up as stone.",
    "Move him between the jobs. Every worker you hire moves more.",
  ],
  key: "Start",
};
