/*
 * The cage mock (#546): the levels and the cage, the last slivers of step 1
 * (docs/superpowers/specs/2026-11-14-line-works-village-design.md, "The levels and the cage").
 *
 * It is a picture, not the game. It mounts today's board on a save held in memory, stops it,
 * and then writes the cage's words and numbers over it by hand, so every skin, size and font is
 * the real board's. The bays wear the approved stage bays (#535, mockups/line/shots/). Nothing
 * here is a rule: the numbers are made up to read like a real evening, and the words are drafts
 * for Flemming to approve.
 *
 *   npm run dev, then /mockups/cage/index.html?scene=levels
 *   node mockups/cage/shots.mjs writes mockups/cage/shots/<scene>.png
 *
 * Scenes: plate, teach, levels, levels-seven, levels-seven-end, arrival, welcome, how.
 *
 * The pictures in shots/ are the record, not this page. It is typechecked against today's src
 * and reads today's markup, so a later sliver will break it: the first one that does deletes
 * index.html, cage.ts, cage.css, shots.mjs and their two knip.json entries. shots/ stays.
 */
import "../../src/tokens.css";
import "../../src/board.css";
import "./cage.css";
import veinUrl from "../../src/assets/gold-nugget.png";
import machineArtUrl from "../../src/assets/great-machine.png";
import helperUrl from "../../src/assets/helper-miner.png";
import kidUrl from "../../src/assets/kid-helper.png";
import cartArtUrl from "../../src/assets/mine-cart.png";
import drillArtUrl from "../../src/assets/steam-drill.png";
import borerArtUrl from "../../src/assets/tunnel-borer.png";
import borerUrl from "../../src/assets/board/mach-borer.png";
import cageUrl from "../../src/assets/board/cage.png";
import cartUrl from "../../src/assets/board/mach-cart.png";
import drillUrl from "../../src/assets/board/mach-drill.png";
import hoistUrl from "../../src/assets/board/mach-hoist.png";
import trainUrl from "../../src/assets/board/mach-train.png";
import dotUrl from "../../src/assets/board/key-dot.png";
import ironUrl from "../../src/assets/board/res-iron.png";
import pickUrl from "../../src/assets/board/res-pick.png";
import stoneUrl from "../../src/assets/board/res-stone.png";
import { createUnconfiguredAuth } from "../../src/auth";
import { el, frameX, writeFigures } from "../../src/board-dom";
import { trackBoardFit } from "../../src/board-fit";
import { RELIC_GOLD } from "../../src/board-relics";
import { LAMP_FRAME, LAMP_PX } from "../../src/board-row";
import { plateButton } from "../../src/board-save";
import { skin } from "../../src/board-skin";
import type { Stage } from "../../src/line";
import { mineView } from "../../src/mine-window";
import { mountMountainScreen } from "../../src/mountain-screen";
import {
  gaugeAngle,
  gaugeRange,
  gaugeReading,
  gaugeUnitText,
  needleFrame,
} from "../../src/output-gauge";
import { createProgressStore } from "../../src/progress-store";
import { createMountain, type Mountain } from "../../src/mountain";
import { MOUNTAIN_STONES } from "../../src/scale";
import { writeSessionSave } from "../../src/session-save";

type Scene =
  | "plate"
  | "teach"
  | "levels"
  | "levels-seven"
  | "levels-seven-end"
  | "arrival"
  | "welcome"
  | "how";
const SCENES: readonly Scene[] = [
  "plate",
  "teach",
  "levels",
  "levels-seven",
  "levels-seven-end",
  "arrival",
  "welcome",
  "how",
];

type Lamp = "off" | "amber" | "green";
/** One gauge sheet frame in CSS px, and the sheet's columns. */
const FACE_PX = 208;
const FACE_COLS = 11;

/* ---------- the words, for Flemming to approve ---------- */

const CARD_TITLE = "The cage";
const CARD_LINE =
  "Send the crew to any level the shaft has reached. The move is free.";
const CREW_HERE = "Crew here";
const DEEPER_HERE = "The shaft goes deeper here";
const CARD_BACK = "Back";
const ARRIVAL_LINE = "The cage stops here now, and at every level above.";
const TEACH_TITLE = "The cage";
const TEACH_LINE =
  "Tap it to send the crew to any level the shaft has reached. Clay is still at the Topsoil.";
const WELCOME_LINE =
  "The crew stayed on the Granite, so the shaft went no deeper.";
/** Today's dream line for the Deep Heart, where the shaft is (screen-words#awayCheerWords). */
const WELCOME_DREAM =
  "While you were gone, the Deep Heart beat slow and steady.";
const HOW_STEPS: readonly (readonly [string, string, 32 | 64])[] = [
  [
    cageUrl,
    "Every level the shaft has reached stays open. The cage takes the crew to one of them.",
    32,
  ],
  [
    ironUrl,
    "Each level brings up its own material. Below the Topsoil, its rock is hard on one stage.",
    32,
  ],
  [
    stoneUrl,
    "Stones dug above the deepest level pay as usual. Only the deepest level digs the shaft deeper.",
    32,
  ],
  [
    pickUrl,
    "The move is free and instant, and the crew stays there while you are away.",
    32,
  ],
];

/* ---------- the board ---------- */

interface StageBay {
  readonly stage: Stage;
  readonly name: string;
  readonly icon: "drill" | "borer" | "cart" | "hoist" | "train";
  /** What the stage's machines move a second. */
  readonly moves: number;
  readonly line: string;
  readonly lamp: Lamp;
  /** The lowest stage: it holds the line. */
  readonly hold: boolean;
}

interface Board {
  /** The cage plate: the working level, in the band tag's words. */
  readonly plate: string;
  /** The working level's own window picture. */
  readonly window: "topsoil" | "granite" | "crystal" | "heart";
  readonly line: number;
  readonly crew: string;
  readonly free: string;
  readonly ready: readonly [string, string];
  readonly bays: readonly [StageBay, StageBay, StageBay];
}

const ICON: Readonly<Record<StageBay["icon"], string>> = {
  drill: drillUrl,
  borer: borerUrl,
  cart: cartUrl,
  hoist: hoistUrl,
  train: trainUrl,
};

/** The evening the shaft first reaches the Granite: two levels, and the crew at the heading. */
const FIRST_GRANITE: Board = {
  plate: "The Granite · Suits borers",
  window: "granite",
  line: 1_150,
  crew: "20",
  free: "4 free",
  ready: ["Buy a tunnel borer · 1.2M", "+380/s · the face holds the line"],
  bays: [
    {
      stage: "face",
      name: "The face",
      icon: "borer",
      moves: 1_150,
      line: "Holds the line",
      lamp: "amber",
      hold: true,
    },
    {
      stage: "haul",
      name: "The haul",
      icon: "cart",
      moves: 1_600,
      line: "450/s spare",
      lamp: "off",
      hold: false,
    },
    {
      stage: "lift",
      name: "The lift",
      icon: "hoist",
      moves: 2_400,
      line: "1,250/s spare",
      lamp: "off",
      hold: false,
    },
  ],
};

/**
 * Days later: the shaft is in the Deep Heart, and he has parked the crew up on the Granite
 * for iron. The Granite is hard on drills, so the face holds the line there.
 */
const PARKED: Board = {
  plate: "The Granite · Suits borers",
  window: "granite",
  line: 10_400,
  crew: "112",
  free: "6 free",
  ready: ["Buy a tunnel borer · 41M", "+1,300/s · the face holds the line"],
  bays: [
    {
      stage: "face",
      name: "The face",
      icon: "borer",
      moves: 10_400,
      line: "Holds the line",
      lamp: "amber",
      hold: true,
    },
    {
      stage: "haul",
      name: "The haul",
      icon: "train",
      moves: 12_800,
      line: "2,400/s spare",
      lamp: "off",
      hold: false,
    },
    {
      stage: "lift",
      name: "The lift",
      icon: "hoist",
      moves: 13_100,
      line: "2,700/s spare",
      lamp: "off",
      hold: false,
    },
  ],
};

/* ---------- the levels ---------- */

interface Level {
  readonly name: string;
  /** The line's speed with the crew there. */
  readonly speed: number;
  /** The stage that holds the line there. */
  readonly holds: string;
  /** What comes up there. */
  readonly brings: string;
  readonly crew: boolean;
  /** The lowest level: the only one where the shaft goes deeper. */
  readonly heading: boolean;
}

const at = (
  name: string,
  speed: number,
  holds: string,
  brings: string,
  mark: "crew" | "heading" | "none" = "none",
): Level => ({
  name,
  speed,
  holds,
  brings,
  crew: mark === "crew",
  heading: mark === "heading",
});

/** The shaft in the Deep Heart, the crew parked on the Granite (the PARKED board). */
const FOUR: readonly Level[] = [
  at("The Topsoil", 11_300, "face", "Clay comes up, until you hold 10"),
  at("The Granite", 10_400, "face", "Iron comes up, until you hold 35", "crew"),
  at(
    "The Crystal Caves",
    10_200,
    "haul",
    "Crystal comes up, until you hold 15",
  ),
  at("The Deep Heart", 10_600, "lift", "Heartstone comes up", "heading"),
];

/**
 * A later run with seven levels, to show how the list pages. The three bands under the Deep
 * Heart are stand-ins: no band below it is named yet, and they bring up stones only.
 */
const SEVEN: readonly Level[] = [
  at("The Topsoil", 30_900, "face", "Clay comes up, until you hold 10"),
  at("The Granite", 28_700, "face", "Iron comes up, until you hold 35"),
  at(
    "The Crystal Caves",
    27_400,
    "haul",
    "Crystal comes up, until you hold 15",
  ),
  at(
    "The Deep Heart",
    29_100,
    "lift",
    "Heartstone comes up, until you hold 12",
    "crew",
  ),
  at("The Iron Roots", 26_800, "face", "Stones only"),
  at("The Ember Seam", 26_100, "haul", "Stones only"),
  at("The Sunless Sea", 25_300, "lift", "Stones only", "heading"),
];

/* ---------- helpers ---------- */

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function need(root: ParentNode, selector: string): HTMLElement {
  const found = root.querySelector<HTMLElement>(selector);
  if (found === null) {
    throw new Error(`The mock found no ${selector}`);
  }
  return found;
}

function lamp(state: Lamp): HTMLElement {
  const made = el("i", "board-lamp");
  made.setAttribute("aria-hidden", "true");
  frameX(made, LAMP_FRAME[state], LAMP_PX);
  return made;
}

const perSecond = (speed: number): string =>
  `${speed.toLocaleString("en-US")}/s`;

/* ---------- the stage bays, as #535 approved them ---------- */

/** The stage's flaps: what it moves, in the gauge's own five characters. */
function stageFlap(moves: number): HTMLElement {
  const text = gaugeReading(moves).padStart(5, " ");
  const flap = el("span", "board-flap board-num");
  flap.setAttribute("aria-hidden", "true");
  flap.append(el("i", "board-flap-l"));
  for (let k = 1; k < text.length; k++) {
    flap.append(el("i", "board-flap-m"));
  }
  flap.append(el("i", "board-flap-r"));
  for (let k = 0; k < text.length; k++) {
    const digit = el("span", "board-flap-d", text.charAt(k).trim());
    digit.style.setProperty("--k", String(k));
    flap.append(digit);
  }
  return flap;
}

function paintBay(button: HTMLElement, bay: StageBay): void {
  button.classList.add("line-bay");
  button.classList.toggle("is-hold", bay.hold);
  button.classList.remove("is-three");
  button.dataset["stage"] = bay.stage;
  button.dataset["icon"] = bay.icon;
  button.dataset["tier"] = bay.icon;
  const icon = el("img", "board-bay-icon");
  icon.src = ICON[bay.icon];
  icon.alt = "";
  const text = el("span", "board-bay-text");
  const sub = el("span", "board-bay-sub");
  writeFigures(sub, bay.line);
  text.append(el("span", "board-bay-name", bay.name), sub);
  button.replaceChildren(
    lamp(bay.lamp),
    icon,
    text,
    stageFlap(bay.moves),
    el("span", "line-per board-lg", "/s"),
  );
}

function paintGauge(root: HTMLElement, rate: number): void {
  const k = gaugeRange(rate);
  const frame = needleFrame(gaugeAngle(rate, k));
  const face = need(root, ".board-gauge-face");
  face.style.backgroundPosition = `${String(-(frame % FACE_COLS) * FACE_PX)}px ${String(-Math.floor(frame / FACE_COLS) * FACE_PX)}px`;
  need(root, ".board-gauge-unit").textContent = gaugeUnitText(k);
  need(root, ".board-gauge-read").textContent = gaugeReading(rate);
}

/* ---------- the cage plate ---------- */

/** The band tag becomes a plate: the working level in the tag's words, and the cage beside it. */
function paintPlate(root: HTMLElement, words: string): HTMLElement {
  const tag = need(root, ".board-band");
  tag.classList.add("cage-plate");
  const icon = el("img", "cage-plate-icon");
  icon.src = cageUrl;
  icon.alt = "";
  const text = el("span", "board-lg", words);
  tag.replaceChildren(icon, text);
  tag.querySelector(":scope > canvas.board-skin")?.remove();
  skin(tag, "tag");
  need(root, ".board-band-row").classList.add("cage-plate-row");
  return tag;
}

function paintBoard(root: HTMLElement, board: Board): void {
  paintPlate(root, board.plate);
  root.querySelectorAll<HTMLElement>(".board-bay").forEach((button, i) => {
    const bay = board.bays[i];
    if (bay !== undefined) {
      paintBay(button, bay);
    }
  });
  paintGauge(root, board.line);
  const crew = need(root, ".board-crew");
  crew.classList.remove("is-none");
  need(crew, ".board-crew-n").textContent = board.crew;
  need(crew, ".board-crew-free").textContent = board.free;
  frameX(need(crew, ".board-lamp"), LAMP_FRAME.amber, LAMP_PX);
  need(root, ".board-ready-kick").textContent = "Ready now";
  need(root, ".board-ready-guard").style.backgroundPositionX = "0px";
  need(root, ".board-ready-main").textContent = board.ready[0];
  need(root, ".board-ready-why").textContent = board.ready[1];
  const view = root.querySelector<HTMLImageElement>(".board-window-view");
  if (view !== null) {
    view.src = mineView(board.window);
  }
}

/* ---------- the level card ---------- */

function levelRow(level: Level): HTMLElement {
  const row = el("button", "cage-level");
  row.type = "button";
  row.classList.toggle("is-crew", level.crew);
  const head = el("span", "cage-level-head");
  head.append(
    lamp(level.crew ? "amber" : "off"),
    el("span", "cage-level-name", level.name),
  );
  if (level.crew) {
    head.append(el("span", "cage-level-mark", CREW_HERE));
  }
  const speed = el("span", "cage-level-line");
  writeFigures(
    speed,
    `${perSecond(level.speed)} · the ${level.holds} holds the line`,
  );
  const brings = el("span", "cage-level-line is-quiet", level.brings);
  row.append(head, speed, brings);
  if (level.heading) {
    row.append(el("span", "cage-level-line is-deeper", DEEPER_HERE));
  }
  row.setAttribute(
    "aria-label",
    `${level.name}: ${perSecond(level.speed)}, the ${level.holds} holds the line. ${level.brings}.`,
  );
  skin(row, "inset");
  return row;
}

/** The level card, on the board card shell (src/board-card.ts), over the board. */
function showLevels(root: HTMLElement, levels: readonly Level[]): HTMLElement {
  const card = el("div", "board-card cage-card");
  card.dataset["card"] = "cage";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "cage-card-title");
  const face = el("section", "board-card-face");
  const title = el("h2", "board-card-title", CARD_TITLE);
  title.id = "cage-card-title";
  const body = el("div", "board-card-body");
  const list = el("div", "cage-levels");
  list.append(...levels.map(levelRow));
  body.append(el("p", "board-card-line", CARD_LINE), list);
  const foot = el("div", "board-card-foot");
  const back = plateButton(CARD_BACK);
  back.classList.add("board-card-plate");
  foot.append(back);
  face.append(title, body, foot);
  skin(face, "frame");
  card.append(face);
  const stage = need(root, ".board-card").parentElement ?? root;
  stage.append(card);
  return list;
}

/* ---------- the teach note, the arrival line, the welcome line, How it works ---------- */

/** The first time there are two levels: a dot on the plate, and a note under it. */
function showTeach(root: HTMLElement): void {
  const plate = need(root, ".cage-plate");
  const dot = el("img", "board-key-dot cage-plate-dot");
  dot.src = dotUrl;
  dot.alt = "";
  plate.append(dot);
  const note = need(root, ".board-note");
  const body = el("div", "");
  body.append(el("span", "board-note-h", TEACH_TITLE), TEACH_LINE);
  need(note, ".board-note-body").replaceChildren(body);
  note.classList.add("on", "cage-teach");
}

function addArrivalLine(root: HTMLElement): void {
  const advice = need(root, ".layer-arrival .layer-advice");
  advice.after(el("p", "board-card-line cage-arrival", ARRIVAL_LINE));
}

function addWelcomeLine(root: HTMLElement): void {
  const body = need(root, ".welcome-back .board-card-body");
  const line = el("p", "board-card-line cage-welcome", WELCOME_LINE);
  const gone = body.querySelector(".welcome-gone");
  if (gone === null) {
    body.prepend(line);
  } else {
    gone.after(line);
  }
  // The dream reads the shaft, not the crew's level: the shaft is in the Deep Heart.
  need(body, ".welcome-cheer").textContent = WELCOME_DREAM;
  // Nine hours away at 30% of the parked line's 10.4K/s, as the board behind shows. The Shield
  // is on the shelf, so the crew digs the whole nine hours: 9 × 3,600 × 10,400 × 0.3.
  need(body, ".welcome-mined-count").textContent = "+101.1M";
}

/** The cage's card is the first under the Ledger's "i"; today's first card moves down. */
function paintHow(root: HTMLElement): void {
  const how = need(root, '.board-sheet[data-sheet="ledger"] .board-sheet-how');
  const first = need(how, ".teach-how");
  const card = first.cloneNode(true) as HTMLElement;
  need(card, ".teach-how-title").textContent = "How it works · The cage";
  card.setAttribute("aria-label", "How it works · The cage");
  need(card, ".teach-how-steps").replaceChildren(
    ...HOW_STEPS.map(([src, words, px]) => {
      const step = el("li", "");
      const img = el("img", "");
      img.src = src;
      img.alt = "";
      img.width = px;
      img.height = px;
      step.append(img, el("span", "", words));
      return step;
    }),
  );
  card.querySelector(".teach-how-back")?.remove();
  first.before(card);
}

/* ---------- the scenes ---------- */

/** Today's save the board is mounted on: only the window, the pocket and the cards show. */
interface Seed {
  readonly mountain: Mountain;
  readonly lastSeen: number;
}

const HOUR = 3_600_000;

/** A crew in the Granite, with stones in the pocket. */
function graniteSeed(
  dug: number,
  owned: Partial<Mountain["owned"]>,
  { lastSeen, pocket }: { readonly lastSeen: number; readonly pocket: number },
): Seed {
  const bare = createMountain();
  return {
    mountain: {
      ...bare,
      remaining: MOUNTAIN_STONES - dug,
      pocket,
      owned: { ...bare.owned, ...owned },
    },
    lastSeen,
  };
}

async function mount(root: HTMLElement, seed: Seed): Promise<() => void> {
  const storage = memoryStorage();
  writeSessionSave({ storage, ...seed });
  const stop = new AbortController();
  mountMountainScreen({
    root,
    veinUrl,
    tierArt: {
      helper: helperUrl,
      cart: cartArtUrl,
      drill: drillArtUrl,
      borer: borerArtUrl,
      machine: machineArtUrl,
      kid: kidUrl,
    },
    relicArt: RELIC_GOLD,
    auth: createUnconfiguredAuth(),
    progress: createProgressStore({
      auth: createUnconfiguredAuth(),
      sessionStorage: storage,
    }),
    deviceStorage: storage,
    // No golden vein glints into the picture.
    random: () => 0.5,
    signal: stop.signal,
  });
  trackBoardFit();
  await document.fonts.ready;
  await wait(1_500);
  return () => {
    stop.abort();
  };
}

/** Each scene's save: the arrival needs a save that crosses into the Granite, the welcome one away. */
function sceneSeed(scene: Scene): Seed {
  const now = Date.now();
  const crew = { helper: 20, cart: 5, drill: 2, borer: 1 };
  switch (scene) {
    case "arrival":
      // Four stones above the Granite: the crew digs across as the board settles.
      return graniteSeed(
        9_999_996,
        { helper: 40, cart: 13, drill: 4 },
        { lastSeen: now, pocket: 2_000_000 },
      );
    case "teach":
      return graniteSeed(25_000_000, crew, {
        lastSeen: now,
        pocket: 2_000_000,
      });
    case "welcome":
      return graniteSeed(25_000_000, crew, {
        lastSeen: now - 9 * HOUR,
        pocket: 45_000_000,
      });
    default:
      // The parked crew's pocket covers Ready now's borer.
      return graniteSeed(25_000_000, crew, {
        lastSeen: now,
        pocket: 45_000_000,
      });
  }
}

/** Opens the Ledger and its "i", then waits for both to settle. */
async function openLedgerHow(root: HTMLElement): Promise<void> {
  need(root, '.board-key[data-key="ledger"]').click();
  await wait(900);
  need(root, ".board-sheet.is-open .board-sheet-info").click();
  await wait(600);
}

async function show(root: HTMLElement, scene: Scene): Promise<void> {
  const stop = await mount(root, sceneSeed(scene));
  if (scene === "arrival") {
    // The Shield waits at the Granite's first stone: carry it, and the layer card is next.
    need(root, ".relic-page-carry").click();
    await wait(1_200);
  }
  if (scene === "how") {
    await openLedgerHow(root);
  }
  // The game stops here: from now on the board is a still picture.
  stop();
  root.inert = true;
  root.classList.add("cage-mock");
  const first = scene === "teach" || scene === "arrival";
  paintBoard(root, first ? FIRST_GRANITE : PARKED);
  switch (scene) {
    case "teach":
      await wait(50);
      showTeach(root);
      placeTeach(root);
      return;
    case "levels":
      showLevels(root, FOUR);
      return;
    case "levels-seven":
      showLevels(root, SEVEN);
      return;
    case "levels-seven-end": {
      const list = showLevels(root, SEVEN);
      await wait(50);
      list.scrollTop = list.scrollHeight;
      return;
    }
    case "arrival":
      addArrivalLine(root);
      return;
    case "welcome":
      addWelcomeLine(root);
      return;
    case "how":
      paintHow(root);
      return;
    case "plate":
      return;
  }
}

/** The note stands under the plate, centred on it, as board-note.ts places a note. */
function placeTeach(root: HTMLElement): void {
  const note = need(root, ".board-note");
  const plate = need(root, ".cage-plate");
  const stage = note.offsetParent;
  if (!(stage instanceof HTMLElement)) {
    return;
  }
  const k = stage.getBoundingClientRect().width / stage.offsetWidth;
  const s = stage.getBoundingClientRect();
  const p = plate.getBoundingClientRect();
  const left = (p.left - s.left + p.width / 2) / k - note.offsetWidth / 2;
  note.style.left = `${String(Math.round(left))}px`;
  note.style.top = `${String(Math.round((p.bottom - s.top) / k + 6))}px`;
}

const root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("missing #app");
}
const asked = new URLSearchParams(window.location.search).get("scene");
const scene = SCENES.find((each) => each === asked) ?? "levels";
await show(root, scene);
await wait(400);
document.body.dataset["mock"] = "ready";
