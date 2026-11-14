/*
 * The slice 1 mock (#649, #648): the start of the road-to-Mars game, for Flemming's yes or no.
 *
 * It is a picture, not the game. It mounts today's board on a save held in memory, stops it,
 * and then writes slice 1's words and numbers over it by hand, so every skin, size and font is
 * the real board's. The bays wear the approved stage bays (#535, mockups/line/shots/). Nothing
 * here is a rule: the numbers are made up to read like one real evening, and the words are
 * drafts for Flemming to approve. It uses art that exists. The village's buildings, the kilns
 * and the saws have no pictures yet, so no picture here shows one.
 *
 *   npm run dev, then /mockups/slice-1/index.html?scene=board
 *   node mockups/slice-1/shots.mjs writes mockups/slice-1/shots/<scene>.png
 *
 * Scenes: start, shaft, board, levels, order, welcome.
 */
import "../../src/tokens.css";
import "../../src/board.css";
import "./slice.css";
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

type Scene = "start" | "shaft" | "board" | "levels" | "order" | "welcome";
const SCENES: readonly Scene[] = [
  "start",
  "shaft",
  "board",
  "levels",
  "order",
  "welcome",
];

type Lamp = "off" | "amber" | "green";
/** One gauge sheet frame in CSS px, and the sheet's columns. */
const FACE_PX = 208;
const FACE_COLS = 11;

/* ---------- the words, for Flemming to approve ---------- */

const GAUGE_LEGEND = "Rock a second";
const LEVELS_TITLE = "The levels";
const LEVELS_LINE =
  "Share the crew between the levels. A move is free, and it holds while you are away.";
const SHAFT_LINE =
  "The crew works one level. Sink the shaft, and you can share them out.";
const SINK = "Sink the shaft";
const DEEPER_NAME = "Deeper";
const DEEPER_LINE = "Harder rock lies below. The village has to grow first.";
const ORDER_LINE =
  "The village asks for goods. Send what the yard holds: a part delivery counts.";
const ORDER_STEPS = "Footings done · Walls · Roof";
const STANDING = "Standing: the Beacon. Golden veins come 40% sooner.";
const CARD_BACK = "Back";
const WELCOME_GOODS = "+4.2M bricks · +2.1M cut stone";
const WELCOME_GONE = "You were gone 9 hours. The crew dug the whole time.";
const WELCOME_STOPS =
  "The brick pile filled at 02:49, the cut stone at 03:08. After that all the rock was stacked as stones.";
const WELCOME_CHEER = "While you were gone, the kilns glowed all night.";

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

/** A pile in the yard: what it holds, and its room. */
interface Pile {
  readonly name: string;
  readonly holds: number;
  readonly room: string;
  /** How full, 0 to 1. */
  readonly full: number;
}

interface Board {
  /** The top plate's tag: the open order. */
  readonly order: string;
  /** The yard's made goods. Before the Beacon stands there is no yard: the plate shows the order alone. */
  readonly piles:
    | readonly Pile[]
    | { readonly asks: string; readonly sent: string; readonly done: number };
  /** The stone pile's room, beside the odometer's legend. */
  readonly stonesRoom: string | null;
  /** The level plate, where the band tag was. */
  readonly plate: string;
  readonly window: "topsoil" | "granite";
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

const bay = (
  stage: Stage,
  icon: StageBay["icon"],
  moves: number,
  line: string,
  lampState: Lamp,
): StageBay => ({
  stage,
  name: `The ${stage}`,
  icon,
  moves,
  line,
  lamp: lampState,
  hold: line === "Holds the line",
});

/** The first evening: one level, stones only, and the village's first order. */
const START: Board = {
  order: "The Beacon · footings",
  piles: { asks: "150K stones", sent: "62K sent", done: 62 / 150 },
  stonesRoom: null,
  plate: "The Topsoil",
  window: "topsoil",
  line: 96,
  crew: "12",
  free: "3 free",
  ready: ["Buy a hoist · 7,314", "+34/s · the lift holds the line"],
  bays: [
    bay("face", "drill", 108, "12/s spare", "off"),
    bay("haul", "cart", 126, "30/s spare", "off"),
    bay("lift", "hoist", 60, "Holds the line", "amber"),
  ],
};

/** The Beacon stands: kilns, the yard, and the Granite has a price. One level still. */
const BEFORE_SHAFT: Board = {
  order: "The Storehouse · footings",
  piles: [
    { name: "Bricks", holds: 1_620_000, room: "of 4.5M", full: 0.36 },
    { name: "Cut stone", holds: 0, room: "from the Granite", full: 0 },
  ],
  stonesRoom: "room for 27M",
  plate: "The Topsoil · 4 gangs",
  window: "topsoil",
  line: 700,
  crew: "58",
  free: "3 free",
  ready: ["Buy a kiln · 172K", "+12 bricks/s · the kilns hold the bricks"],
  bays: [
    bay("face", "drill", 860, "160/s spare", "off"),
    bay("haul", "cart", 640, "Holds the line", "amber"),
    bay("lift", "hoist", 720, "20/s spare", "off"),
  ],
};

/** Days later: two levels, two gangs on each, and the Storehouse's walls on order. */
const EVENING: Board = {
  order: "The Storehouse · walls",
  piles: [
    { name: "Bricks", holds: 1_240_000, room: "of 4.5M", full: 0.28 },
    { name: "Cut stone", holds: 310_000, room: "of 2.2M", full: 0.14 },
  ],
  stonesRoom: "room for 27M",
  plate: "Topsoil 2 · Granite 2",
  window: "granite",
  line: 2_700,
  crew: "96",
  free: "5 free",
  ready: ["Borer · 96K cut stone", "+310/s · the face holds the line"],
  bays: [
    bay("face", "borer", 2_300, "Holds the line", "amber"),
    bay("haul", "train", 2_900, "200/s spare", "off"),
    bay("lift", "hoist", 3_400, "700/s spare", "off"),
  ],
};

/** The morning after: the two made piles are full, and the stones kept coming. */
const MORNING: Board = {
  ...EVENING,
  piles: [
    { name: "Bricks", holds: 4_500_000, room: "of 4.5M · full", full: 1 },
    { name: "Cut stone", holds: 2_200_000, room: "of 2.2M · full", full: 1 },
  ],
};

/* ---------- the levels ---------- */

interface Level {
  readonly name: string;
  /** Gangs working there, of four. */
  readonly gangs: number;
  /** Whether the gangs can be moved: false while there is one level. */
  readonly moves: boolean;
  readonly lines: readonly string[];
}

const TWO: readonly Level[] = [
  {
    name: "The Topsoil",
    gangs: 2,
    moves: true,
    lines: [
      "2 of 4 gangs · 1,350/s of rock",
      "Bricks 900/s · the kilns hold the bricks",
      "Stones 450/s",
    ],
  },
  {
    name: "The Granite",
    gangs: 2,
    moves: true,
    lines: [
      "2 of 4 gangs · 1,350/s of rock",
      "Cut stone 420/s · the saws hold the cut stone",
      "Stones 930/s",
    ],
  },
];

const ONE: readonly Level[] = [
  {
    name: "The Topsoil",
    gangs: 4,
    moves: false,
    lines: [
      "4 of 4 gangs · 700/s of rock",
      "Bricks 300/s · the kilns hold the bricks",
      "Stones 400/s",
    ],
  },
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

/* ---------- the top plate: the order, and the yard ---------- */

function pileCell(pile: Pile): HTMLElement {
  const cell = el("div", "s1-pile");
  const words = el("span", "s1-pile-words");
  const bar = el("span", "s1-bar");
  const fill = el("i", "");
  fill.style.width = `${String(Math.round(pile.full * 100))}%`;
  bar.append(fill);
  bar.classList.toggle("is-full", pile.full >= 1);
  const room = el("span", "s1-pile-room");
  writeFigures(room, pile.room);
  words.append(el("span", "board-lg s1-pile-name", pile.name), room, bar);
  cell.append(words, stageFlap(pile.holds));
  return cell;
}

/** The relics' plate becomes the village's: the open order on its tag, the yard's piles on its face. */
function paintVillage(root: HTMLElement, board: Board): void {
  const plate = need(root, ".board-relics");
  plate.classList.add("s1-village");
  plate.querySelectorAll(".board-socket").forEach((socket) => {
    socket.remove();
  });
  const face = el("div", "s1-yard");
  if (Array.isArray(board.piles)) {
    face.append(...board.piles.map(pileCell));
  } else {
    const ask = board.piles as { asks: string; sent: string; done: number };
    const cell = el("div", "s1-ask");
    const bar = el("span", "s1-bar");
    const fill = el("i", "");
    fill.style.width = `${String(Math.round(ask.done * 100))}%`;
    bar.append(fill);
    const sent = el("span", "s1-pile-room");
    writeFigures(sent, ask.sent);
    const asks = el("span", "s1-ask-big");
    writeFigures(asks, `The village asks for ${ask.asks}`);
    cell.append(lamp("green"), asks, sent, bar);
    face.append(cell);
  }
  plate.prepend(face);
  need(plate, ".board-tag .board-lg").textContent = board.order;
  const legend = need(root, ".board-odo-legend");
  legend.querySelector(".s1-room")?.remove();
  if (board.stonesRoom !== null) {
    const room = el("span", "board-lg s1-room");
    writeFigures(room, `· ${board.stonesRoom}`);
    need(legend, ".board-lg").after(room);
  }
}

/* ---------- the level plate ---------- */

/** The band tag becomes a plate that takes a tap: where the gangs are. */
function paintPlate(root: HTMLElement, words: string): HTMLElement {
  const tag = need(root, ".board-band");
  tag.classList.add("s1-plate");
  const icon = el("img", "s1-plate-icon");
  icon.src = cageUrl;
  icon.alt = "";
  const text = el("span", "board-lg", words);
  tag.replaceChildren(icon, text);
  tag.querySelector(":scope > canvas.board-skin")?.remove();
  skin(tag, "tag");
  need(root, ".board-band-row").classList.add("s1-plate-row");
  return tag;
}

function paintBoard(root: HTMLElement, board: Board): void {
  paintVillage(root, board);
  paintPlate(root, board.plate);
  root.querySelectorAll<HTMLElement>(".board-bay").forEach((button, i) => {
    const each = board.bays[i];
    if (each !== undefined) {
      paintBay(button, each);
    }
  });
  paintGauge(root, board.line);
  need(root, ".board-gauge-legend").textContent = GAUGE_LEGEND;
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

/* ---------- the cards ---------- */

/** An empty board card on the card shell (src/board-card.ts), over the board. */
function showCard(
  root: HTMLElement,
  name: string,
  title: string,
  line: string,
): HTMLElement {
  const card = el("div", `board-card s1-card s1-${name}`);
  card.dataset["card"] = name;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", `s1-${name}-title`);
  const face = el("section", "board-card-face");
  const head = el("h2", "board-card-title", title);
  head.id = `s1-${name}-title`;
  const body = el("div", "board-card-body");
  const list = el("div", "s1-rows");
  body.append(el("p", "board-card-line", line), list);
  const foot = el("div", "board-card-foot");
  const back = plateButton(CARD_BACK);
  back.classList.add("board-card-plate");
  foot.append(back);
  face.append(head, body, foot);
  skin(face, "frame");
  card.append(face);
  const stage = need(root, ".board-card").parentElement ?? root;
  stage.append(card);
  return list;
}

function stepper(sign: string, label: string): HTMLButtonElement {
  const button = plateButton(sign);
  button.classList.add("s1-step");
  button.setAttribute("aria-label", label);
  return button;
}

function levelRow(level: Level): HTMLElement {
  const row = el("div", "s1-row");
  const head = el("div", "s1-row-head");
  head.append(
    lamp(level.gangs > 0 ? "amber" : "off"),
    el("span", "s1-row-name", level.name),
  );
  if (level.moves) {
    const count = el("span", "s1-gangs board-num", String(level.gangs));
    head.append(
      stepper("−", `One gang fewer at ${level.name}`),
      count,
      stepper("+", `One gang more at ${level.name}`),
    );
  }
  row.append(head);
  level.lines.forEach((words, i) => {
    const line = el("span", i === 0 ? "s1-row-line" : "s1-row-line is-quiet");
    writeFigures(line, words);
    row.append(line);
  });
  skin(row, "inset");
  return row;
}

/** A level that is not open: its price with a plate, or only a hint. */
function closedRow(price: string | null): HTMLElement {
  const row = el("div", "s1-row is-closed");
  const head = el("div", "s1-row-head");
  head.append(
    lamp(price === null ? "off" : "green"),
    el("span", "s1-row-name", price === null ? DEEPER_NAME : "The Granite"),
  );
  row.append(head);
  if (price === null) {
    row.append(el("span", "s1-row-line is-quiet", DEEPER_LINE));
  } else {
    const cost = el("span", "s1-row-line");
    writeFigures(cost, price);
    const sink = plateButton(SINK);
    sink.classList.add("s1-row-plate");
    row.append(
      el("span", "s1-row-line is-quiet", "Hard grey rock under the Topsoil."),
      cost,
      sink,
    );
  }
  skin(row, "inset");
  return row;
}

function showLevels(root: HTMLElement, levels: readonly Level[]): void {
  const one = levels.length === 1;
  const list = showCard(
    root,
    "levels",
    LEVELS_TITLE,
    one ? SHAFT_LINE : LEVELS_LINE,
  );
  list.append(
    ...levels.map(levelRow),
    closedRow(one ? "10M stones · 1.5M bricks" : null),
  );
}

function orderRow(
  name: string,
  sent: string,
  done: number,
  send: string,
): HTMLElement {
  const row = el("div", "s1-row");
  const head = el("div", "s1-row-head");
  const plate = plateButton(send);
  plate.classList.add("s1-send");
  head.append(lamp("green"), el("span", "s1-row-name", name), plate);
  const line = el("span", "s1-row-line");
  writeFigures(line, sent);
  const bar = el("span", "s1-bar is-wide");
  const fill = el("i", "");
  fill.style.width = `${String(Math.round(done * 100))}%`;
  bar.append(fill);
  row.append(head, line, bar);
  skin(row, "inset");
  return row;
}

function showOrder(root: HTMLElement): void {
  const list = showCard(root, "order", "The Storehouse · walls", ORDER_LINE);
  list.append(
    orderRow("Stones", "9.2M of 15M sent", 9.2 / 15, "Send 5.8M"),
    orderRow("Bricks", "1.1M of 4M sent", 1.1 / 4, "Send 1.24M"),
  );
  list.after(
    el("p", "board-card-line is-quiet", ORDER_STEPS),
    el("p", "board-card-line is-quiet", STANDING),
  );
}

/** The welcome card after a night that filled the two made piles. */
function paintWelcome(root: HTMLElement): void {
  const body = need(root, ".welcome-back .board-card-body");
  need(body, ".welcome-mined-count").textContent = "+19.9M";
  const count = need(body, ".welcome-mined-count").parentElement ?? body;
  const goods = el("p", "board-card-line s1-welcome-goods");
  writeFigures(goods, WELCOME_GOODS);
  count.after(goods);
  const gone = body.querySelector<HTMLElement>(".welcome-gone");
  if (gone !== null) {
    gone.textContent = WELCOME_GONE;
  }
  const stops = el("p", "board-card-line s1-welcome-stops");
  writeFigures(stops, WELCOME_STOPS);
  (gone ?? goods).after(stops);
  need(body, ".welcome-cheer").textContent = WELCOME_CHEER;
  body
    .querySelectorAll<HTMLElement>(
      ".welcome-rush, .welcome-ore, .welcome-relic",
    )
    .forEach((line) => {
      line.hidden = true;
    });
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

/** Each scene's save. Only the window, the pocket and the welcome card come from it. */
function sceneSeed(scene: Scene): Seed {
  const now = Date.now();
  switch (scene) {
    case "start":
      return graniteSeed(
        400_000,
        { helper: 12, cart: 3 },
        { lastSeen: now, pocket: 86_400 },
      );
    case "shaft":
      return graniteSeed(
        6_000_000,
        { helper: 58, cart: 16, drill: 5 },
        { lastSeen: now, pocket: 11_200_000 },
      );
    case "welcome":
      return graniteSeed(
        25_000_000,
        { helper: 20, cart: 5, drill: 2, borer: 1 },
        { lastSeen: now - 9 * HOUR, pocket: 18_490_000 },
      );
    default:
      return graniteSeed(
        25_000_000,
        { helper: 20, cart: 5, drill: 2, borer: 1 },
        { lastSeen: now, pocket: 12_400_000 },
      );
  }
}

const BOARD: Readonly<Record<Scene, Board>> = {
  start: START,
  shaft: BEFORE_SHAFT,
  board: EVENING,
  levels: EVENING,
  order: EVENING,
  welcome: MORNING,
};

async function show(root: HTMLElement, scene: Scene): Promise<void> {
  const stop = await mount(root, sceneSeed(scene));
  // The game stops here: from now on the board is a still picture.
  stop();
  root.inert = true;
  root.classList.add("s1-mock");
  paintBoard(root, BOARD[scene]);
  switch (scene) {
    case "shaft":
      showLevels(root, ONE);
      return;
    case "levels":
      showLevels(root, TWO);
      return;
    case "order":
      showOrder(root);
      return;
    case "welcome":
      paintWelcome(root);
      return;
    case "start":
    case "board":
      return;
  }
}

const root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("missing #app");
}
const asked = new URLSearchParams(window.location.search).get("scene");
const scene = SCENES.find((each) => each === asked) ?? "board";
await show(root, scene);
await wait(400);
document.body.dataset["mock"] = "ready";
