import drawingUrl from "./assets/board/keepsake-drawing.png";
import pebbleUrl from "./assets/board/keepsake-pebble.png";
import ribbonUrl from "./assets/board/keepsake-ribbon.png";
import watchUrl from "./assets/board/keepsake-watch.png";
import whistleUrl from "./assets/board/keepsake-whistle.png";
import { el, hide, replay, setAttr, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import type { Pointer } from "./board-interaction";
import { RELIC_GOLD, RELIC_LIT } from "./board-relics";
import { drawerPlate } from "./board-save";
import { skin } from "./board-skin";
import { forgetAll, type PressTracker } from "./card-tap";
import { KEEPSAKES, type KeepsakeId } from "./expeditions";
import { RELICS, type Relic } from "./relics";
import { KEEPSAKES_TITLE, keepsakeWords } from "./screen-words";

/*
 * The relics drawer's three pages (#465): a found relic's detail with its keepsakes, the reveal
 * of a relic just found, and the Legend after the Mantle's. Each shows in the drawer's list
 * place (BoardSheet.showPage), and its plates press through the board's model, so a finger that
 * lands while the page settles is the second tap of the one that opened it. The words are
 * today's shelf, reveal and Legend words.
 */

/** Each keepsake's 16 art px icon (PixelLab, #465). */
export const KEEPSAKE_ART: Readonly<Record<KeepsakeId, string>> = {
  drawing: drawingUrl,
  watch: watchUrl,
  whistle: whistleUrl,
  pebble: pebbleUrl,
  ribbon: ribbonUrl,
};

const RELIC_KICKER = "A Legendary Relic of Fatherhood";
export const SHELF_BACK = "Back to the shelf";
const CARRY = "Carry it with pride";
const LEGEND_KICKER = "The bottom of the mountain";
const LEGEND_TITLE = "You became a Legend";
const LEGEND_CHEER =
  "Guidance, Protection, Building, Patience, Wisdom and Heroism: every relic of fatherhood is yours. Now you can pass the mine to your kid.";
const STAND_PROUD = "Stand proud";
const PASS_TO_KID = "Pass to your kid";

/** A page's plate act: how the press came, so a finger's close settles. */
type PageAct = (by: Pointer) => void;

/** A plate on a relics page whose press, past the settle, runs `act`. */
function pagePlate(
  board: BoardHost,
  trackers: PressTracker[],
  [label, id]: readonly [label: string, id: string],
  act: PageAct,
): HTMLButtonElement {
  return drawerPlate(
    board,
    trackers,
    { label, className: `relic-page-${id}`, control: { layer: "relics", id } },
    (_plate, by) => {
      act(by);
    },
  );
}

/** A relic's 24 art px icon, at 2×. */
function relicArt(className: string): HTMLImageElement {
  const art = el("img", className);
  art.alt = "";
  art.width = 48;
  art.height = 48;
  art.draggable = false;
  return art;
}

/** A page's frame: its kicker over its title, labelled by the title. */
function pageFrame(
  id: string,
  kicker: string,
): { root: HTMLElement; title: HTMLElement } {
  const root = el("div", `relic-page relic-${id}-page`);
  const title = el("h3", "relic-page-title");
  title.id = `relic-${id}-title`;
  setAttr(root, "role", "group");
  setAttr(root, "aria-labelledby", title.id);
  root.append(el("p", "relic-page-kicker", kicker));
  return { root, title };
}

/** A relic's head on a page: its art, its name, its virtue and its power. */
interface RelicHead {
  readonly art: HTMLImageElement;
  readonly virtue: HTMLElement;
  readonly boost: HTMLElement;
}

function relicHead(root: HTMLElement, title: HTMLElement): RelicHead {
  const art = relicArt("relic-page-art");
  const virtue = el("p", "relic-page-line");
  const boost = el("p", "relic-page-boost");
  root.append(art, title, virtue);
  return { art, virtue, boost };
}

function paintHead(head: RelicHead, relic: Relic): void {
  setAttr(head.art, "src", RELIC_LIT[relic.id]);
  write(head.virtue, `The virtue of ${relic.virtue}.`);
  write(head.boost, `Your power: ${relic.boost}`);
}

/** The keepsakes brought home, in an inset: each with its icon, name and story. */
function keepsakeBox(): {
  readonly root: HTMLElement;
  paint(shown: readonly KeepsakeId[]): void;
} {
  const root = el("div", "relic-keepsakes");
  root.append(el("p", "relic-keepsakes-title", KEEPSAKES_TITLE));
  const list = el("ul", "relic-keepsake-list");
  const items = KEEPSAKES.map((id) => {
    const words = keepsakeWords(id);
    const item = el("li", "relic-keepsake");
    item.dataset["keepsake"] = id;
    const art = el("img", "relic-keepsake-art");
    art.src = KEEPSAKE_ART[id];
    art.alt = "";
    art.width = 32;
    art.height = 32;
    art.draggable = false;
    const said = el("span", "relic-keepsake-words");
    said.append(
      el("span", "relic-keepsake-name", words.name),
      el("span", "relic-keepsake-story", words.story),
    );
    item.append(art, said);
    item.hidden = true;
    list.append(item);
    return { id, item };
  });
  root.append(list);
  skin(root, "inset");
  hide(root, true);
  return {
    root,
    paint(shown) {
      for (const { id, item } of items) {
        hide(item, !shown.includes(id));
      }
      hide(root, shown.length === 0);
    },
  };
}

export interface RelicPage {
  readonly root: HTMLElement;
  /** The page moved on: no plate's finger-down time carries over. */
  forget(): void;
}

/** A found relic's detail: its head, its power, the keepsakes, and Back to the shelf. */
export function createDetailPage({
  board,
  onBack,
}: {
  board: BoardHost;
  onBack: PageAct;
}): RelicPage & {
  paint(relic: Relic, keepsakes: readonly KeepsakeId[]): void;
} {
  const { root, title } = pageFrame("detail", RELIC_KICKER);
  const head = relicHead(root, title);
  const keepsakes = keepsakeBox();
  const trackers: PressTracker[] = [];
  const back = pagePlate(board, trackers, [SHELF_BACK, "shelf"], onBack);
  root.append(head.boost, keepsakes.root, back);
  skin(root, "frame");
  return {
    root,
    paint(relic, shown) {
      write(title, relic.name);
      paintHead(head, relic);
      keepsakes.paint(shown);
    },
    forget: forgetAll(trackers),
  };
}

/** The Mantle's reveal says this in place of a power: the Legend page says what it does next. */
const MANTLE_FOUND =
  "You reached the bottom of the mountain. Every dad who keeps showing up is a hero.";

/** The reveal's one line under the virtue: the relic's power, said once (#523). */
export function revealLine(relic: Relic): string {
  return relic.id === "mantle" ? MANTLE_FOUND : `Your power: ${relic.boost}`;
}

/** The reveal's stage: the gold relic at 2×, with its light around it (#523). */
function revealStage(): { root: HTMLElement; art: HTMLImageElement } {
  const root = el("div", "relic-reveal-stage");
  const light = el("span", "relic-reveal-light");
  setAttr(light, "aria-hidden", "true");
  const art = el("img", "relic-reveal-art");
  art.alt = "";
  art.draggable = false;
  root.append(light, art);
  return { root, art };
}

/** A relic just found: the gold relic in its light, its virtue, its one line, and Carry it with pride. */
export function createRevealPage({
  board,
  onCarry,
}: {
  board: BoardHost;
  onCarry: PageAct;
}): RelicPage & { paint(relic: Relic): void } {
  const { root, title } = pageFrame("reveal", RELIC_KICKER);
  const stage = revealStage();
  const virtue = el("p", "relic-page-line");
  const boost = el("p", "relic-page-boost");
  const trackers: PressTracker[] = [];
  const carry = pagePlate(board, trackers, [CARRY, "carry"], onCarry);
  root.append(stage.root, title, virtue, boost, carry);
  skin(root, "frame");
  return {
    root,
    paint(relic) {
      // The entrance plays afresh for each relic (#523), on a page that may still be shown.
      replay(root, "is-entering");
      write(title, `You found the ${relic.name}`);
      setAttr(stage.art, "src", RELIC_GOLD[relic.id]);
      write(virtue, `The virtue of ${relic.virtue}.`);
      write(boost, revealLine(relic));
    },
    forget: forgetAll(trackers),
  };
}

/** The finale: the six relics lit, the stones and the crew, Stand proud and Pass to your kid. */
export function createLegendPage({
  board,
  onStand,
  onPass,
}: {
  board: BoardHost;
  onStand: PageAct;
  onPass: PageAct;
}): RelicPage & { paint(stats: string): void } {
  const { root, title } = pageFrame("legend", LEGEND_KICKER);
  write(title, LEGEND_TITLE);
  const shelf = el("div", "relic-legend-shelf");
  for (const relic of RELICS) {
    const art = relicArt("relic-legend-art");
    art.src = RELIC_LIT[relic.id];
    art.alt = relic.name;
    shelf.append(art);
  }
  const stats = el("p", "relic-page-line relic-legend-stats");
  const cheer = el("p", "relic-page-power", LEGEND_CHEER);
  const trackers: PressTracker[] = [];
  const answers = el("div", "relic-page-answers");
  answers.append(
    pagePlate(board, trackers, [STAND_PROUD, "stand"], onStand),
    pagePlate(board, trackers, [PASS_TO_KID, "pass"], onPass),
  );
  root.append(title, shelf, stats, cheer, answers);
  skin(root, "frame");
  return {
    root,
    paint(line) {
      write(stats, line);
    },
    forget: forgetAll(trackers),
  };
}
