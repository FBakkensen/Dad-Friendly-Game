import { buildingById } from "./city";
import { AWAY_PAY_RATE } from "./rates";
import { percent } from "./screen-words";

/**
 * The words of the frame's cards (#663; spec, "The cards", "While a part is
 * the end of the game"): the Light Tower's end card, in one place so a
 * change of copy is one edit. The shift report's
 * words are its own view (src/shift-report-view.ts). They name no
 * bottleneck, no limit and no best buy.
 */

/** A card of words: its title, its paragraphs and its one key. */
export type CardWords = {
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly key: string;
};

const LIGHT_TOWER = buildingById("lightTower");

/** The end of part 1 (rule 6): the Light Tower's roof is on. */
export const END_CARD: CardWords = {
  title: `${LIGHT_TOWER.name}: operational`,
  paragraphs: [
    `Night shift output ${percent(LIGHT_TOWER.power.nightShift)}, up from ${percent(AWAY_PAY_RATE)}.`,
    "The city is planning its next building. It comes in a later update.",
  ],
  key: "Continue",
};
