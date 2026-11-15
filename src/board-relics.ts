import lanternUrl from "./assets/board/relic-lantern.png";
import lanternDarkUrl from "./assets/board/relic-lantern-dark.png";
import shieldUrl from "./assets/board/relic-shield.png";
import shieldDarkUrl from "./assets/board/relic-shield-dark.png";
import hammerUrl from "./assets/board/relic-hammer.png";
import hammerDarkUrl from "./assets/board/relic-hammer-dark.png";
import heartUrl from "./assets/board/relic-heart.png";
import heartDarkUrl from "./assets/board/relic-heart-dark.png";
import crownUrl from "./assets/board/relic-crown.png";
import crownDarkUrl from "./assets/board/relic-crown-dark.png";
import mantleUrl from "./assets/board/relic-mantle.png";
import mantleDarkUrl from "./assets/board/relic-mantle-dark.png";
import type { RelicId } from "./relics";

/** Each relic's 24 art px icon, lit: found. */
export const RELIC_LIT: Readonly<Record<RelicId, string>> = {
  lantern: lanternUrl,
  shield: shieldUrl,
  hammer: hammerUrl,
  heart: heartUrl,
  crown: crownUrl,
  mantle: mantleUrl,
};
/** Each relic's icon, dark: the next to find (the Ledger's relics row shows it too, #375). */
export const RELIC_DARK: Readonly<Record<RelicId, string>> = {
  lantern: lanternDarkUrl,
  shield: shieldDarkUrl,
  hammer: hammerDarkUrl,
  heart: heartDarkUrl,
  crown: crownDarkUrl,
  mantle: mantleDarkUrl,
};
