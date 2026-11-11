import upgradesIconUrl from "./assets/board/icon-upgrades.png";
import borerUrl from "./assets/board/mach-borer.png";
import cartUrl from "./assets/board/mach-cart.png";
import drillUrl from "./assets/board/mach-drill.png";
import machineUrl from "./assets/board/mach-machine.png";
import workerUrl from "./assets/board/mach-worker.png";
import bootUrl from "./assets/board/res-boot.png";
import clayUrl from "./assets/board/res-clay.png";
import mapUrl from "./assets/board/res-map.png";
import mountainUrl from "./assets/board/res-mountain.png";
import nuggetUrl from "./assets/board/res-nugget.png";
import pickUrl from "./assets/board/res-pick.png";
import stoneUrl from "./assets/board/res-stone.png";
import { RELIC_LIT } from "./board-relics";
import { plateButton } from "./board-save";
import { HOW_IT_WORKS, howItWorks, type HowArt } from "./how-it-works";
import type { Mountain } from "./mountain";
import { oneOffStretch, stretch } from "./scale";
import { createHowCard, setHowSteps, type HowCardStep } from "./teach-ui";

/*
 * How it works in the drawer skin (#373): the same cards and words, drawn with the board's own
 * icons at exactly 2x. Machines and the worker are 32 art px (64 shown), a relic 24 (48), the
 * small icons 16 (32).
 */

/** One board icon for a How it works step, and its CSS px. */
export interface BoardHowArt {
  readonly src: string;
  readonly px: 32 | 48 | 64;
}

/** The board's icon for each How it works art the drawers' cards use. */
export const BOARD_HOW_ART: Readonly<Partial<Record<HowArt, BoardHowArt>>> = {
  "mine-cart": { src: cartUrl, px: 64 },
  "great-machine": { src: machineUrl, px: 64 },
  "tunnel-borer": { src: borerUrl, px: 64 },
  "steam-drill": { src: drillUrl, px: 64 },
  "helper-miner": { src: workerUrl, px: 64 },
  stone: { src: stoneUrl, px: 32 },
  "upgrades-icon": { src: upgradesIconUrl, px: 32 },
  pick: { src: pickUrl, px: 32 },
  mountain: { src: mountainUrl, px: 32 },
  "relics/lantern": { src: RELIC_LIT.lantern, px: 48 },
  "relics/shield": { src: RELIC_LIT.shield, px: 48 },
  "relics/hammer": { src: RELIC_LIT.hammer, px: 48 },
  "relics/crown": { src: RELIC_LIT.crown, px: 48 },
  "ore-lump": { src: clayUrl, px: 32 },
  // The Engineers and Expeditions cards' own (PixelLab, #455).
  "worn-map": { src: mapUrl, px: 32 },
  "boot-tile": { src: bootUrl, px: 32 },
  "gold-nugget": { src: nuggetUrl, px: 32 },
};

/** The systems whose cards open from a drawer's "i". */
export type BoardHowSystem =
  | "staffing"
  | "layers"
  | "upgrades"
  | "boosts"
  | "workshop"
  | "materials"
  | "away"
  | "relics"
  | "engineers"
  | "expeditions"
  | "tending";

/** Every art these cards use is mapped (board-how-art.test.ts); stone is the fallback. */
const FALLBACK: BoardHowArt = { src: stoneUrl, px: 32 };

/**
 * Today's How it works card for `system`, with board art and `data-how`. Its way back is a
 * plate button, as Back is in the drawer.
 */
export function boardHowCard(
  system: BoardHowSystem,
  back: string,
  onBack: () => void,
): HTMLElement {
  const copy = HOW_IT_WORKS[system];
  const steps = copy.steps.map(([art, words]): HowCardStep => {
    const { src, px } = BOARD_HOW_ART[art] ?? FALLBACK;
    return [src, words, px];
  });
  const card = createHowCard(
    `How it works · ${copy.title}`,
    steps,
    back,
    () => undefined,
  );
  card.dataset["how"] = system;
  const plate = plateButton(back);
  plate.classList.add("teach-how-back");
  plate.addEventListener("click", onBack);
  card.querySelector(".teach-how-back")?.replaceWith(plate);
  return card;
}

/**
 * Reprices the cards of `systems` under `how` by the mountain's stretch: their numbers are the
 * run's real prices. Writes only when the stretch changed.
 */
export function createHowPricer(
  how: HTMLElement,
  systems: readonly BoardHowSystem[],
): (current: Mountain) => void {
  let priced = "1:1";
  return (current) => {
    const key = `${String(stretch(current))}:${String(oneOffStretch(current))}`;
    if (key === priced) {
      return;
    }
    priced = key;
    const copy = howItWorks(stretch(current), oneOffStretch(current));
    for (const card of how.querySelectorAll<HTMLElement>("[data-how]")) {
      const system = systems.find((each) => each === card.dataset["how"]);
      if (system !== undefined) {
        setHowSteps(card, copy[system].steps);
      }
    }
  };
}
