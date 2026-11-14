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
 * Scenes: start, shaft, home (the mountain, the layout I recommend), line and village (a part
 * opened), rooms (the other layout: three rooms and a tab bar).
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
import { skin, type SkinKind } from "../../../src/board-skin";

type Scene = "start" | "shaft" | "home" | "line" | "village" | "rooms";
const SCENES: readonly Scene[] = [
  "start",
  "shaft",
  "home",
  "line",
  "village",
  "rooms",
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
    made: "Bricks 96/s",
    holds: "the kilns hold",
  },
  {
    kind: "open",
    name: "Granite",
    view: graniteUrl,
    gangs: 2,
    moves: true,
    rock: "1,350/s",
    made: "Cut stone 60/s",
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
  }
}

/** The board's steel, by part. A skin measures its host, so it is painted once the picture is up. */
const STEEL: readonly (readonly [string, SkinKind])[] = [
  [".village, .mine, .group, .card", "frame"],
  [".pile, .stage, .sum, .row, .next, .back, .key, .tab", "counter"],
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
