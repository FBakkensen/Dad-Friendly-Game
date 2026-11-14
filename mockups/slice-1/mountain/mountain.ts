/*
 * The mountain screen mock (#649, #648): a new screen for the road-to-Mars game, for Flemming's
 * yes or no. Today's board was built for one line and one pile. This one is built for a mine of
 * several levels, a yard of several goods and a village that grows.
 *
 * It is a picture, not the game. Nothing here is a rule: the numbers are made up to read like
 * one real evening, and the words are drafts for Flemming to approve. It uses art that exists.
 * The village's buildings, the kilns, the saws, the bricks and the cut stone have no pictures
 * yet, so no picture here shows one.
 *
 *   npm run dev, then /mockups/slice-1/mountain/index.html?scene=home
 *   node mockups/slice-1/mountain/shots.mjs writes mockups/slice-1/mountain/shots/<scene>.png
 *
 * Scenes, first round: start, shaft, home (the mountain on one screen), line and village (a part
 * opened), rooms (three rooms and a tab bar).
 *
 * Scenes, second round, after Flemming said each kind of work should be really different: the
 * places. place-first (the first evening, two places), then one evening in four places:
 * place-mine, place-works (refining), place-workshop (manufacturing) and place-village.
 */
import "./mountain.css";
import digUrl from "../../../src/assets/board/dig-button.png";
import iconBuysUrl from "../../../src/assets/board/icon-buys.png";
import iconEngineersUrl from "../../../src/assets/board/icon-engineers.png";
import iconUpgradesUrl from "../../../src/assets/board/icon-upgrades.png";
import iconWorkshopUrl from "../../../src/assets/board/icon-workshop.png";
import lampUrl from "../../../src/assets/board/lamp.png";
import borerUrl from "../../../src/assets/board/mach-borer.png";
import cartUrl from "../../../src/assets/board/mach-cart.png";
import drillUrl from "../../../src/assets/board/mach-drill.png";
import hoistUrl from "../../../src/assets/board/mach-hoist.png";
import machineDimUrl from "../../../src/assets/board/mach-machine-dim.png";
import trainUrl from "../../../src/assets/board/mach-train.png";
import workerUrl from "../../../src/assets/board/mach-worker.png";
import crystalUrl from "../../../src/assets/board/mine-view-crystal.png";
import graniteUrl from "../../../src/assets/board/mine-view-granite.png";
import topsoilUrl from "../../../src/assets/board/mine-view-topsoil.png";
import clayUrl from "../../../src/assets/board/res-clay.png";
import ironUrl from "../../../src/assets/board/res-iron.png";
import nuggetUrl from "../../../src/assets/gold-nugget.png";
import stoneUrl from "../../../src/assets/stone.png";
import { skin, type SkinKind } from "../../../src/board-skin";

type Scene =
  | "start"
  | "shaft"
  | "home"
  | "line"
  | "village"
  | "rooms"
  | "place-first"
  | "place-mine"
  | "place-works"
  | "place-workshop"
  | "place-village";
const SCENES: readonly Scene[] = [
  "start",
  "shaft",
  "home",
  "line",
  "village",
  "rooms",
  "place-first",
  "place-mine",
  "place-works",
  "place-workshop",
  "place-village",
];

type Lamp = "off" | "amber" | "green" | "red";
const LAMPS: readonly Lamp[] = ["off", "amber", "green", "red"];

/** The mine pictures are 92 by 76 art pixels, drawn at four screen pixels each. */
const VIEW_SCALE = 4;
const VIEW_W = 92 * VIEW_SCALE;
const VIEW_H = 76 * VIEW_SCALE;
/** The gallery under the surface starts at art row 26. */
const GALLERY_TOP = 27 * VIEW_SCALE;
/** The surface picture leaves out the top of the sky. */
const SURFACE_TOP = 2 * VIEW_SCALE;
/** A level's picture is the end of its gallery, where the lamp lights the rock. */
const SPINE_LEFT = 62 * VIEW_SCALE;

/* ---------- the words, for Flemming to approve ---------- */

const VILLAGE = "The village";
const MINE = "The mine";
const NEXT = "Next";
const SEND = "Send";
const SINK = "Sink the shaft";
const DEEPER_NAME = "Deeper";
const DEEPER_LINE = "Harder rock lies below. The village has to grow first.";
const HOLDS = "holds the line";
const BACK = "The mountain";
const SAVED = "Saved on this device";

/* ---------- what a picture shows ---------- */

interface Ask {
  readonly good: string;
  readonly sent: string;
  readonly of: string;
  readonly fill: number;
  /** What a tap on Send sends now, or null when the pile is empty. */
  readonly send: string | null;
}

interface Order {
  readonly building: string;
  readonly step: string;
  /** How many of the building's three orders are done. */
  readonly done: number;
  readonly asks: readonly Ask[];
}

interface Pile {
  readonly good: string;
  readonly have: string;
  readonly room: string | null;
  readonly fill: number;
}

interface StageChip {
  readonly name: string;
  readonly rate: string;
  readonly note: string;
  readonly holds: boolean;
}

interface OpenLevel {
  readonly kind: "open";
  readonly name: string;
  readonly view: string;
  readonly gangs: number;
  /** False while one level is open: the whole crew is there. */
  readonly moves: boolean;
  readonly rock: string;
  readonly made: string;
  readonly holds: string;
}

interface PricedLevel {
  readonly kind: "priced";
  readonly name: string;
  readonly view: string;
  readonly price: string;
}

interface HintLevel {
  readonly kind: "hint";
  readonly view: string;
}

type Level = OpenLevel | PricedLevel | HintLevel;

interface NextBuy {
  readonly what: string;
  readonly why: string;
  readonly more: number;
}

interface Home {
  readonly order: Order;
  readonly piles: readonly Pile[];
  readonly crew: string;
  readonly stages: readonly [StageChip, StageChip, StageChip];
  readonly levels: readonly Level[];
  readonly next: NextBuy;
}

const STOREHOUSE_WALLS: Order = {
  building: "The Storehouse",
  step: "Walls",
  done: 1,
  asks: [
    { good: "Stones", sent: "9.2M", of: "15M", fill: 0.61, send: "5.8M" },
    { good: "Bricks", sent: "1.1M", of: "4M", fill: 0.28, send: "1.24M" },
  ],
};

const EVENING_PILES: readonly Pile[] = [
  { good: "Stones", have: "12.40M", room: "of 27M", fill: 0.46 },
  { good: "Bricks", have: "1.24M", room: "of 4.5M", fill: 0.28 },
  { good: "Cut stone", have: "310K", room: "of 2.2M", fill: 0.14 },
];

const EVENING_STAGES: Home["stages"] = [
  { name: "Face", rate: "2,700/s", note: HOLDS, holds: true },
  { name: "Haul", rate: "2,900/s", note: "200/s spare", holds: false },
  { name: "Lift", rate: "3,400/s", note: "700/s spare", holds: false },
];

const EVENING_LEVELS: readonly Level[] = [
  {
    kind: "open",
    name: "Topsoil",
    view: topsoilUrl,
    gangs: 2,
    moves: true,
    rock: "1,350/s",
    made: "Bricks 396/s",
    holds: "the kilns hold",
  },
  {
    kind: "open",
    name: "Granite",
    view: graniteUrl,
    gangs: 2,
    moves: true,
    rock: "1,350/s",
    made: "Cut stone 360/s",
    holds: "the saws hold",
  },
  { kind: "hint", view: crystalUrl },
];

const EVENING_NEXT: NextBuy = {
  what: "Borer · 48.8K cut stone",
  why: `+310/s · the face ${HOLDS}`,
  more: 6,
};

const HOMES: Readonly<Record<"start" | "shaft" | "home", Home>> = {
  start: {
    order: {
      building: "The Beacon",
      step: "Footings",
      done: 0,
      asks: [
        { good: "Stones", sent: "62K", of: "150K", fill: 0.41, send: "9,420" },
      ],
    },
    piles: [{ good: "Stones", have: "9,420", room: null, fill: 0 }],
    crew: "14",
    stages: [
      { name: "Face", rate: "34/s", note: HOLDS, holds: true },
      { name: "Haul", rate: "41/s", note: "7/s spare", holds: false },
      { name: "Lift", rate: "52/s", note: "18/s spare", holds: false },
    ],
    levels: [
      {
        kind: "open",
        name: "Topsoil",
        view: topsoilUrl,
        gangs: 4,
        moves: false,
        rock: "34/s",
        made: "Stones 34/s",
        holds: "all of it is stones",
      },
      { kind: "hint", view: graniteUrl },
    ],
    next: {
      what: "Worker · 136 stones",
      why: "+2.4/s · the face holds",
      more: 1,
    },
  },
  shaft: {
    order: {
      building: "The Storehouse",
      step: "Footings",
      done: 0,
      asks: [
        { good: "Stones", sent: "2.1M", of: "8M", fill: 0.26, send: "5.9M" },
        { good: "Bricks", sent: "310K", of: "1M", fill: 0.31, send: "690K" },
      ],
    },
    piles: [
      { good: "Stones", have: "10.60M", room: "of 27M", fill: 0.39 },
      { good: "Bricks", have: "1.52M", room: "of 4.5M", fill: 0.34 },
    ],
    crew: "121",
    stages: [
      { name: "Face", rate: "2,100/s", note: "200/s spare", holds: false },
      { name: "Haul", rate: "1,900/s", note: HOLDS, holds: true },
      { name: "Lift", rate: "2,600/s", note: "700/s spare", holds: false },
    ],
    levels: [
      {
        kind: "open",
        name: "Topsoil",
        view: topsoilUrl,
        gangs: 4,
        moves: false,
        rock: "1,900/s",
        made: "Bricks 72/s",
        holds: "the kilns hold",
      },
      {
        kind: "priced",
        name: "Granite",
        view: graniteUrl,
        price: "10M stones · 1.5M bricks",
      },
    ],
    next: {
      what: "Mine cart · 912K stones",
      why: `+140/s · the haul ${HOLDS}`,
      more: 4,
    },
  },
  home: {
    order: STOREHOUSE_WALLS,
    piles: EVENING_PILES,
    crew: "148",
    stages: EVENING_STAGES,
    levels: EVENING_LEVELS,
    next: EVENING_NEXT,
  },
};

/* ---------- small parts ---------- */

type Kid = Node | string;

function h(
  tag: string,
  className: string,
  ...kids: readonly Kid[]
): HTMLElement {
  const made = document.createElement(tag);
  made.className = className;
  made.append(...kids);
  return made;
}

function num(text: string): HTMLElement {
  return h("span", "num", text);
}

function lamp(state: Lamp): HTMLElement {
  const made = h("span", "art lamp");
  made.style.backgroundImage = `url(${lampUrl})`;
  made.style.backgroundPosition = `${String(-20 * LAMPS.indexOf(state))}px 0`;
  return made;
}

/** A piece of a mine picture: `left` and `top` are screen pixels into the picture. */
function view(
  className: string,
  url: string,
  left: number,
  top: number,
): HTMLElement {
  const made = h("div", `art ${className}`);
  made.style.backgroundImage = `url(${url})`;
  made.style.backgroundSize = `${String(VIEW_W)}px ${String(VIEW_H)}px`;
  made.style.backgroundPosition = `${String(-left)}px ${String(-top)}px`;
  return made;
}

function icon(url: string): HTMLElement {
  const made = h("span", "art icon");
  made.style.backgroundImage = `url(${url})`;
  return made;
}

function bar(fill: number): HTMLElement {
  const inner = document.createElement("i");
  inner.style.width = `${String(Math.round(fill * 100))}%`;
  return h("div", "bar", inner);
}

/* ---------- the village and its order ---------- */

function askRow(ask: Ask): HTMLElement {
  const words = h(
    "div",
    "ask-words",
    h("span", "good", ask.good),
    num(ask.sent),
    h("span", "quiet", "of"),
    num(ask.of),
  );
  const send =
    ask.send === null
      ? h("button", "send none", "Nothing to send")
      : h("button", "send", SEND, num(ask.send));
  return h("div", "ask", words, send, bar(ask.fill));
}

function steps(done: number): HTMLElement {
  const made = h("div", "steps");
  for (let at = 0; at < 3; at++) {
    const state = at < done ? " done" : at === done ? " now" : "";
    made.append(h("span", `step${state}`));
  }
  return made;
}

function orderCard(order: Order): HTMLElement {
  const head = h(
    "div",
    "order-head",
    h("span", "order-name", order.building),
    h("span", "amber", order.step),
    steps(order.done),
  );
  return h("div", "order", head, ...order.asks.map(askRow));
}

function village(order: Order): HTMLElement {
  const surface = view("surface", graniteUrl, 0, SURFACE_TOP);
  surface.append(
    h("div", "tag", h("span", "label", VILLAGE), h("span", "go", "›")),
  );
  return h("section", "village", surface, orderCard(order));
}

/* ---------- the yard ---------- */

function pile(made: Pile, wide: boolean): HTMLElement {
  if (wide) {
    return h(
      "div",
      "pile wide",
      h("span", "label", made.good),
      h("span", "num have", made.have),
      h(
        "span",
        "room",
        "No yard yet.",
        document.createElement("br"),
        "The pocket holds it all.",
      ),
    );
  }
  return h(
    "div",
    "pile",
    h("span", "label", made.good),
    h("span", "num have", made.have),
    h("span", "room", made.room ?? ""),
    bar(made.fill),
  );
}

function yard(piles: readonly Pile[]): HTMLElement {
  const wide = piles.length === 1;
  return h("section", "yard", ...piles.map((each) => pile(each, wide)));
}

/* ---------- the mine ---------- */

function stageChip(stage: StageChip): HTMLElement {
  return h(
    "button",
    stage.holds ? "stage holds" : "stage",
    lamp(stage.holds ? "amber" : "off"),
    h("span", "name", stage.name),
    h("span", "num rate", stage.rate),
    h("span", stage.holds ? "note amber" : "note", stage.note),
  );
}

function pips(gangs: number): HTMLElement {
  const made = h("div", "pips");
  for (let at = 0; at < 4; at++) {
    made.append(h("span", at < gangs ? "pip on" : "pip"));
  }
  return made;
}

function openLevel(level: OpenLevel): HTMLElement {
  const count = level.moves
    ? `${String(level.gangs)} of 4 gangs`
    : "The whole crew";
  const gangs = h("div", "gangs", pips(level.gangs), h("span", "count", count));
  const share = level.moves
    ? h(
        "div",
        "share",
        h("button", "stepper", "−"),
        gangs,
        h("button", "stepper", "+"),
      )
    : h("div", "share", gangs);
  const made = h("div", "made");
  made.append(h("b", "", level.made), ` · ${level.holds}`);
  const head = h(
    "div",
    "level-head",
    h("span", "level-name", level.name),
    num(level.rock),
  );
  return h(
    "div",
    "level",
    view("spine", level.view, SPINE_LEFT, GALLERY_TOP),
    h("div", "body", head, share, made),
  );
}

function pricedLevel(level: PricedLevel): HTMLElement {
  const head = h("div", "level-head", h("span", "level-name", level.name));
  return h(
    "div",
    "level closed",
    view("spine", level.view, SPINE_LEFT, GALLERY_TOP),
    h(
      "div",
      "body",
      head,
      h("div", "price num", level.price),
      h("button", "sink", lamp("green"), SINK),
    ),
  );
}

function hintLevel(level: HintLevel): HTMLElement {
  return h(
    "div",
    "level hint",
    view("spine", level.view, SPINE_LEFT, GALLERY_TOP),
    h(
      "div",
      "body",
      h("span", "level-name", DEEPER_NAME),
      h("span", "words", DEEPER_LINE),
    ),
  );
}

function levelRow(level: Level): HTMLElement {
  switch (level.kind) {
    case "open":
      return openLevel(level);
    case "priced":
      return pricedLevel(level);
    case "hint":
      return hintLevel(level);
  }
}

function mine(home: Home): HTMLElement {
  const head = h(
    "div",
    "mine-head",
    h("span", "label", MINE),
    h("span", "quiet", "Crew"),
    num(home.crew),
    h("span", "go", "›"),
  );
  const stages = h("div", "stages", ...home.stages.map(stageChip));
  return h("section", "mine", head, stages, ...home.levels.map(levelRow));
}

/* ---------- the foot ---------- */

function nextCard(next: NextBuy): HTMLElement {
  const more = h("span", "more", num(String(next.more)), "ready");
  return h(
    "button",
    "next",
    lamp("green"),
    h("span", "label amber", NEXT),
    more,
    h("span", "what", next.what),
    h("span", "why", next.why),
  );
}

function digButton(): HTMLElement {
  const art = h("span", "art");
  art.style.backgroundImage = `url(${digUrl})`;
  return h("button", "dig", art, h("span", "label", "Dig · +1"));
}

function foot(next: NextBuy): HTMLElement {
  return h("div", "foot", nextCard(next), digButton());
}

function saveLine(): HTMLElement {
  return h("div", "save", lamp("amber"), SAVED);
}

function homeScreen(home: Home): HTMLElement {
  return h(
    "main",
    "screen",
    village(home.order),
    yard(home.piles),
    mine(home),
    foot(home.next),
    saveLine(),
  );
}

/* ---------- a part opened ---------- */

function topBar(title: string): HTMLElement {
  return h(
    "div",
    "top",
    h("button", "back", "‹", BACK),
    h("span", "title", title),
  );
}

interface Buy {
  readonly art: string;
  readonly name: string;
  readonly own: string;
  readonly price: string;
  readonly good: string;
  readonly state: "ready" | "short" | "waits";
}

function buyRow(buy: Buy): HTMLElement {
  const price =
    buy.state === "waits"
      ? h("div", "price waits", buy.price)
      : h(
          "button",
          buy.state === "ready" ? "price ready" : "price",
          num(buy.price),
          h("span", "of", buy.good),
        );
  return h(
    "div",
    "buy",
    icon(buy.art),
    h("div", "", h("div", "name", buy.name), h("div", "own", buy.own)),
    price,
  );
}

function stageGroup(stage: StageChip, buys: readonly Buy[]): HTMLElement {
  const head = h(
    "div",
    "group-head",
    lamp(stage.holds ? "amber" : "off"),
    h("span", "name", `The ${stage.name.toLowerCase()}`),
    num(stage.rate),
    h("span", stage.holds ? "note amber" : "note", stage.note),
  );
  return h(
    "section",
    stage.holds ? "group holds" : "group",
    head,
    ...buys.map(buyRow),
  );
}

const FACE_BUYS: readonly Buy[] = [
  {
    art: workerUrl,
    name: "Worker",
    own: "148 · 2.4/s each",
    price: "334K",
    good: "stones",
    state: "ready",
  },
  {
    art: drillUrl,
    name: "Steam drill",
    own: "16 · 96/s each",
    price: "1.74M",
    good: "stones",
    state: "ready",
  },
  {
    art: borerUrl,
    name: "Tunnel borer",
    own: "1 · 1,071/s each",
    price: "48.8K",
    good: "cut stone",
    state: "ready",
  },
];

const HAUL_BUYS: readonly Buy[] = [
  {
    art: cartUrl,
    name: "Mine cart",
    own: "38 · 34/s each",
    price: "1.11M",
    good: "stones",
    state: "ready",
  },
  {
    art: trainUrl,
    name: "Pit train",
    own: "1 · 1,600/s each",
    price: "73.1K",
    good: "cut stone",
    state: "ready",
  },
];

const LIFT_BUYS: readonly Buy[] = [
  {
    art: hoistUrl,
    name: "Hoist",
    own: "28 · 121/s each",
    price: "1.53M",
    good: "stones",
    state: "ready",
  },
  {
    art: machineDimUrl,
    name: "The Great Machine",
    own: "Not built",
    price: "Waits for the Forge",
    good: "",
    state: "waits",
  },
];

function key(art: string, name: string, on: boolean): HTMLElement {
  return h("button", on ? "key on" : "key", icon(art), name);
}

function lineScreen(): HTMLElement {
  const [face, haul, lift] = EVENING_STAGES;
  const words = h("div", "words");
  words.append(
    "rock a second. ",
    h("b", "", "The face holds the line."),
    " Widen it, and the haul holds next, at 2,900.",
  );
  return h(
    "main",
    "screen",
    topBar("The line"),
    h("div", "sum", h("span", "num big", "2,700"), words),
    stageGroup(face, FACE_BUYS),
    stageGroup(haul, HAUL_BUYS),
    stageGroup(lift, LIFT_BUYS),
    h(
      "div",
      "keys",
      key(iconBuysUrl, "Line", true),
      key(iconUpgradesUrl, "Upgrades", false),
      key(iconWorkshopUrl, "Workshop", false),
      key(iconEngineersUrl, "Engineers", false),
    ),
  );
}

function villageScreen(): HTMLElement {
  const stepWords = h(
    "div",
    "step-words",
    h("span", "done", "Footings ✓"),
    h("span", "now", "Walls"),
    h("span", "", "Roof"),
  );
  const power = h("div", "power");
  power.append(
    "When the roof is on: ",
    h("b", "", "the yard holds twice as much."),
  );
  const building = h(
    "section",
    "card",
    h("span", "label amber", "Building now"),
    h(
      "div",
      "order-head",
      h("span", "order-name", STOREHOUSE_WALLS.building),
      steps(STOREHOUSE_WALLS.done),
    ),
    stepWords,
    ...STOREHOUSE_WALLS.asks.map(askRow),
    power,
  );
  const beacon = h(
    "div",
    "row",
    lamp("green"),
    h(
      "div",
      "stack",
      h("span", "name", "The Beacon"),
      h("span", "words", "Stands. Golden veins come 40% sooner."),
    ),
  );
  const nextUp = h(
    "div",
    "row",
    lamp("off"),
    h(
      "div",
      "stack",
      h("span", "name quiet", "After the Storehouse"),
      h("span", "words", "The smith is asking for a roof of his own."),
    ),
  );
  const surface = view("surface wide", graniteUrl, 0, SURFACE_TOP);
  return h(
    "main",
    "screen",
    topBar(VILLAGE),
    surface,
    building,
    h("span", "label", "Standing"),
    beacon,
    h("span", "label", "What comes next"),
    nextUp,
    h(
      "div",
      "keys",
      h("button", "key on", "Buildings"),
      h("button", "key", "Keepsakes"),
      h("button", "key", "Ledger"),
    ),
  );
}

/* ---------- the other layout: three rooms and a tab bar ---------- */

function bay(stage: StageChip, art: string): HTMLElement {
  return h(
    "button",
    "bay",
    lamp(stage.holds ? "amber" : "off"),
    icon(art),
    h(
      "div",
      "",
      h("div", "name", `The ${stage.name.toLowerCase()}`),
      h("div", stage.holds ? "note amber" : "note", stage.note),
    ),
    num(stage.rate),
  );
}

function plainLevel(level: OpenLevel): HTMLElement {
  const gangs = h(
    "div",
    "gangs",
    pips(level.gangs),
    h("span", "count", `${String(level.gangs)} of 4 gangs`),
  );
  const made = h("div", "made");
  made.append(h("b", "", level.made), ` · ${level.holds}`);
  return h(
    "div",
    "level plain",
    h(
      "div",
      "level-head",
      h("span", "level-name", level.name),
      num(level.rock),
    ),
    h(
      "div",
      "share",
      h("button", "stepper", "−"),
      gangs,
      h("button", "stepper", "+"),
    ),
    made,
  );
}

function roomsScreen(): HTMLElement {
  const [face, haul, lift] = EVENING_STAGES;
  const lineBox = h(
    "section",
    "mine",
    h(
      "div",
      "mine-head",
      h("span", "label", "The line"),
      h("span", "quiet", "Crew"),
      num("148"),
    ),
    bay(face, borerUrl),
    bay(haul, trainUrl),
    bay(lift, hoistUrl),
  );
  const levels = h(
    "section",
    "mine",
    h("div", "mine-head", h("span", "label", "The levels")),
  );
  for (const level of EVENING_LEVELS) {
    if (level.kind === "open") {
      levels.append(plainLevel(level));
    }
  }
  const tabs = h(
    "div",
    "tabs",
    h("button", "tab", lamp("green"), "Village"),
    h("button", "tab", lamp("off"), "Yard"),
    h("button", "tab on", lamp("green"), "Mine"),
  );
  return h(
    "main",
    "screen",
    h("section", "yard", ...EVENING_PILES.map((each) => pile(each, false))),
    lineBox,
    levels,
    foot(EVENING_NEXT),
    tabs,
  );
}

/* ---------- the places: each kind of work has its own room ---------- */

type Place = "mine" | "works" | "workshop" | "village";

interface Tab {
  readonly place: Place;
  readonly name: string;
  readonly lamp: Lamp;
}

/** The first evening has two places. A place is added when its work opens. */
const TWO_TABS: readonly Tab[] = [
  { place: "mine", name: "Mine", lamp: "green" },
  { place: "village", name: "Village", lamp: "green" },
];

const FOUR_TABS: readonly Tab[] = [
  { place: "mine", name: "Mine", lamp: "green" },
  { place: "works", name: "Works", lamp: "green" },
  { place: "workshop", name: "Workshop", lamp: "amber" },
  { place: "village", name: "Village", lamp: "green" },
];

function tabBar(tabs: readonly Tab[], on: Place): HTMLElement {
  return h(
    "nav",
    "tabs places",
    ...tabs.map((tab) =>
      h(
        "button",
        tab.place === on ? "tab on" : "tab",
        lamp(tab.lamp),
        tab.name,
      ),
    ),
  );
}

/** What the village asks for, in every place: the goal stays on top. */
function orderStrip(order: Order): HTMLElement {
  const asks = h("div", "ostrip-asks");
  for (const ask of order.asks) {
    asks.append(
      h(
        "span",
        "ostrip-ask",
        h("b", "", ask.good),
        num(`${ask.sent} of ${ask.of}`),
      ),
    );
  }
  const head = h(
    "div",
    "ostrip-head",
    h("span", "ostrip-name", order.building),
    h("span", "amber", order.step),
    steps(order.done),
  );
  return h("button", "ostrip", head, asks);
}

/** Next, where the dig button is not: it names the place the buy is in. */
function nextWide(next: NextBuy, where: string): HTMLElement {
  const card = nextCard(next);
  const label = card.querySelector(".label");
  if (label !== null) {
    label.textContent = `${NEXT} · ${where}`;
  }
  return h("div", "foot", card);
}

function placeScreen(
  parts: readonly HTMLElement[],
  tabs: readonly Tab[],
  on: Place,
): HTMLElement {
  return h("main", "screen", ...parts, tabBar(tabs, on), saveLine());
}

function minePlace(home: Home, tabs: readonly Tab[]): HTMLElement {
  return placeScreen(
    [orderStrip(home.order), yard(home.piles), mine(home), foot(home.next)],
    tabs,
    "mine",
  );
}

/* ---------- the works: refining ---------- */

interface Maker {
  readonly title: string;
  readonly owned: string;
  readonly level: string;
  readonly view: string;
  readonly rock: string;
  readonly takeWords: string;
  readonly takes: string;
  readonly good: string;
  readonly out: string;
  /** The share of the level's rock the makers take. */
  readonly share: number;
  readonly words: string;
  readonly buy: string;
  readonly gain: string;
  readonly price: string;
  readonly priceGood: string;
}

const MAKERS: readonly Maker[] = [
  {
    title: "The kilns",
    owned: "33 kilns",
    level: "Topsoil",
    view: topsoilUrl,
    rock: "1,350/s",
    takeWords: "Kilns take",
    takes: "396/s",
    good: "Bricks",
    out: "396/s",
    share: 0.29,
    words:
      "The kilns hold the bricks. The other 954 rock a second is stacked as stones.",
    buy: "Kiln",
    gain: "+12 bricks/s",
    price: "10.3M",
    priceGood: "stones",
  },
  {
    title: "The saws",
    owned: "12 saws",
    level: "Granite",
    view: graniteUrl,
    rock: "1,350/s",
    takeWords: "Saws take",
    takes: "360/s",
    good: "Cut stone",
    out: "360/s",
    share: 0.27,
    words:
      "The saws hold the cut stone. The other 990 rock a second is stacked as stones.",
    buy: "Saw",
    gain: "+30 cut stone/s",
    price: "269K",
    priceGood: "bricks",
  },
];

function flowPlate(label: string, value: string): HTMLElement {
  return h("div", "plate", h("span", "label", label), num(value));
}

function makerBox(maker: Maker): HTMLElement {
  const rock = view("plate rock", maker.view, SPINE_LEFT, GALLERY_TOP);
  rock.append(h("span", "label", maker.level), num(maker.rock));
  const flow = h(
    "div",
    "flow",
    rock,
    h("span", "arrow", "›"),
    flowPlate(maker.takeWords, maker.takes),
    h("span", "arrow", "›"),
    flowPlate(maker.good, maker.out),
  );
  const split = h("div", "split", document.createElement("i"));
  const taken = split.firstElementChild;
  if (taken instanceof HTMLElement) {
    taken.style.width = `${String(Math.round(maker.share * 100))}%`;
  }
  const head = h(
    "div",
    "mine-head",
    h("span", "label", maker.title),
    num(maker.owned),
  );
  const buy = h(
    "div",
    "maker-buy",
    h("div", "", h("div", "name", maker.buy), h("div", "own", maker.gain)),
    h(
      "button",
      "price ready",
      num(maker.price),
      h("span", "of", maker.priceGood),
    ),
  );
  return h(
    "section",
    "mine maker",
    head,
    flow,
    split,
    h("div", "words", maker.words),
    buy,
  );
}

function yardBox(): HTMLElement {
  const buy = h(
    "div",
    "maker-buy",
    h(
      "div",
      "",
      h("div", "name", "Extend the yard"),
      h("div", "own", "Every pile holds three times as much"),
    ),
    h("button", "price", num("1.35M"), h("span", "of", "bricks")),
  );
  return h(
    "section",
    "mine maker",
    h("div", "mine-head", h("span", "label", "The yard"), num("level 2")),
    buy,
  );
}

function worksPlace(): HTMLElement {
  return placeScreen(
    [
      orderStrip(STOREHOUSE_WALLS),
      yard(EVENING_PILES),
      ...MAKERS.map(makerBox),
      yardBox(),
      nextWide(EVENING_NEXT, "in the mine"),
    ],
    FOUR_TABS,
    "works",
  );
}

/* ---------- the workshop: manufacturing ---------- */

interface Recipe {
  readonly name: string;
  readonly gives: string;
  readonly needs: string;
  readonly time: string;
  /** What is missing, or null when it can go on the bench. */
  readonly short: string | null;
}

const RECIPES: readonly Recipe[] = [
  {
    name: "Reinforce",
    gives: "Pit trains 1,600/s to 1,680/s each",
    needs: "5 iron",
    time: "10 min",
    short: null,
  },
  {
    name: "Blasting charge",
    gives: "Crew 2,700/s to 5,400/s for 20 min",
    needs: "100K stones · 4 clay",
    time: "10 min",
    short: null,
  },
  {
    name: "Sturdy props",
    gives: "Trouble comes 30% less often",
    needs: "250K stones · 10 clay · 4 iron",
    time: "10 min",
    short: "3 clay short",
  },
];

function material(
  art: string,
  name: string,
  have: string,
  fill: number,
): HTMLElement {
  return h(
    "div",
    "pile material",
    icon(art),
    h("span", "label", name),
    h("span", "num have", have),
    bar(fill),
  );
}

function recipeRow(recipe: Recipe): HTMLElement {
  const needs = h("div", "needs", recipe.needs);
  if (recipe.short !== null) {
    needs.append(h("span", "amber", ` · ${recipe.short}`));
  }
  return h(
    "div",
    "recipe",
    lamp(recipe.short === null ? "green" : "off"),
    h(
      "div",
      "",
      h("div", "name", recipe.name),
      h("div", "own", recipe.gives),
      needs,
    ),
    h("span", "time num", recipe.time),
  );
}

function workshopPlace(): HTMLElement {
  const bench = h(
    "section",
    "mine bench",
    h(
      "div",
      "mine-head",
      h("span", "label amber", "On the bench"),
      lamp("amber"),
    ),
    h("div", "order-name", "Iron rails"),
    h("div", "own", "Mine carts 34/s to 42.5/s each"),
    bar(0.4),
    h("div", "words", "Done in 6 min. The bench works on while you are away."),
  );
  const list = h(
    "section",
    "mine",
    h(
      "div",
      "mine-head",
      h("span", "label", "Next on the bench"),
      h("span", "quiet", "One job at a time"),
    ),
    ...RECIPES.map(recipeRow),
  );
  return placeScreen(
    [
      orderStrip(STOREHOUSE_WALLS),
      h(
        "section",
        "yard",
        material(clayUrl, "Clay", "7 of 10", 0.7),
        material(ironUrl, "Iron", "22 of 35", 0.63),
      ),
      bench,
      list,
      nextWide(EVENING_NEXT, "in the mine"),
    ],
    FOUR_TABS,
    "workshop",
  );
}

/* ---------- the village: building ---------- */

interface Plot {
  readonly art: string | null;
  readonly name: string;
  readonly state: string;
  readonly lamp: Lamp;
  readonly on: boolean;
}

const PLOTS: readonly Plot[] = [
  {
    art: nuggetUrl,
    name: "The Beacon",
    state: "Stands",
    lamp: "green",
    on: false,
  },
  {
    art: stoneUrl,
    name: "The Storehouse",
    state: "Walls",
    lamp: "amber",
    on: true,
  },
  {
    art: null,
    name: "An empty plot",
    state: "The smith asks",
    lamp: "off",
    on: false,
  },
];

function plotTile(plot: Plot): HTMLElement {
  const art = plot.art === null ? h("span", "icon") : icon(plot.art);
  return h(
    "button",
    plot.on ? "plot on" : "plot",
    art,
    h("span", "name", plot.name),
    h("span", "state", lamp(plot.lamp), plot.state),
  );
}

function villagePlace(): HTMLElement {
  const surface = view("surface wide", graniteUrl, 0, SURFACE_TOP);
  const stepWords = h(
    "div",
    "step-words",
    h("span", "done", "Footings ✓"),
    h("span", "now", "Walls"),
    h("span", "", "Roof"),
  );
  const power = h("div", "power");
  power.append(
    "When the roof is on: ",
    h("b", "", "the yard holds twice as much."),
  );
  const building = h(
    "section",
    "card",
    h(
      "div",
      "order-head",
      h("span", "order-name", STOREHOUSE_WALLS.building),
      steps(STOREHOUSE_WALLS.done),
    ),
    stepWords,
    ...STOREHOUSE_WALLS.asks.map(askRow),
    power,
  );
  const beacon = h(
    "div",
    "row",
    lamp("green"),
    h(
      "div",
      "stack",
      h("span", "name", "The Beacon gives"),
      h("span", "words", "Golden veins come 40% sooner."),
    ),
  );
  return placeScreen(
    [
      surface,
      yard(EVENING_PILES),
      h("div", "plots", ...PLOTS.map(plotTile)),
      building,
      beacon,
      nextWide(EVENING_NEXT, "in the mine"),
    ],
    FOUR_TABS,
    "village",
  );
}

/* ---------- the page ---------- */

function sceneOf(search: string): Scene {
  const asked = new URLSearchParams(search).get("scene");
  return SCENES.find((scene) => scene === asked) ?? "home";
}

function show(root: HTMLElement, scene: Scene): void {
  switch (scene) {
    case "start":
    case "shaft":
    case "home":
      root.append(homeScreen(HOMES[scene]));
      return;
    case "line":
      root.append(lineScreen());
      return;
    case "village":
      root.append(villageScreen());
      return;
    case "rooms":
      root.append(roomsScreen());
      return;
    case "place-first":
      root.append(minePlace(HOMES.start, TWO_TABS));
      return;
    case "place-mine":
      root.append(minePlace(HOMES.home, FOUR_TABS));
      return;
    case "place-works":
      root.append(worksPlace());
      return;
    case "place-workshop":
      root.append(workshopPlace());
      return;
    case "place-village":
      root.append(villagePlace());
      return;
  }
}

/** The board's steel, by part. A skin measures its host, so it is painted once the picture is up. */
const STEEL: readonly (readonly [string, SkinKind])[] = [
  [".village, .mine, .group, .card", "frame"],
  [".pile, .stage, .sum, .row, .next, .back, .key, .tab", "counter"],
  [".ostrip, .plate:not(.rock), .plot", "counter"],
  [".stepper", "key"],
  [".tag", "tag"],
];

function paintSteel(root: HTMLElement): void {
  for (const [parts, kind] of STEEL) {
    for (const part of root.querySelectorAll<HTMLElement>(parts)) {
      skin(part, kind);
    }
  }
}

const app = document.getElementById("app");
if (app === null) {
  throw new Error("The mock page has no #app");
}
show(app, sceneOf(window.location.search));
await document.fonts.ready;
paintSteel(app);
await new Promise((resolve) => setTimeout(resolve, 500));
document.body.dataset.mock = "ready";
