/*
 * The stage bays mock (#535): step 1 of the line, the works and the village
 * (docs/superpowers/specs/2026-11-14-line-works-village-design.md, "What he sees").
 *
 * It is a picture, not the game. It mounts today's board on a save held in memory, stops it,
 * and then writes the line's words and numbers over it by hand, so every skin, size and font is
 * the real board's. Nothing here is a rule: the numbers are the spec's worked examples.
 *
 *   npm run dev, then /mockups/line/index.html?scene=mid
 *   node mockups/line/shots.mjs writes mockups/line/shots/<scene>.png
 *
 * Scenes: early, mid, mid-after, buys, buys-haul, how. Delete this folder once #537 and #538 have shipped.
 */
import "../../src/tokens.css";
import "../../src/board.css";
import "./line.css";
import veinUrl from "../../src/assets/gold-nugget.png";
import machineArtUrl from "../../src/assets/great-machine.png";
import helperUrl from "../../src/assets/helper-miner.png";
import kidUrl from "../../src/assets/kid-helper.png";
import cartArtUrl from "../../src/assets/mine-cart.png";
import drillArtUrl from "../../src/assets/steam-drill.png";
import borerArtUrl from "../../src/assets/tunnel-borer.png";
import borerUrl from "../../src/assets/board/mach-borer.png";
import cartUrl from "../../src/assets/board/mach-cart.png";
import drillUrl from "../../src/assets/board/mach-drill.png";
import pickUrl from "../../src/assets/board/res-pick.png";
import { createUnconfiguredAuth } from "../../src/auth";
import { el, writeFigures } from "../../src/board-dom";
import { trackBoardFit } from "../../src/board-fit";
import { RELIC_GOLD } from "../../src/board-relics";
import { skin } from "../../src/board-skin";
import { mountMountainScreen } from "../../src/mountain-screen";
import {
  gaugeAngle,
  gaugeRange,
  gaugeReading,
  gaugeUnitText,
  needleFrame,
} from "../../src/output-gauge";
import { createProgressStore } from "../../src/progress-store";
import { SESSION_SAVE_KEY } from "../../src/session-save";
import drillDimUrl from "./art/mach-drill-dim.png";
import hoistUrl from "./art/mach-hoist.png";
import trainUrl from "./art/mach-train.png";

type Scene = "early" | "mid" | "mid-after" | "buys" | "buys-haul" | "how";
const SCENES: readonly Scene[] = [
  "early",
  "mid",
  "mid-after",
  "buys",
  "buys-haul",
  "how",
];

type Lamp = "off" | "amber" | "green";
/** One lamp frame in CSS px, and lamp.png's frames. */
const LAMP_PX = 40;
const LAMP_FRAME: Readonly<Record<Lamp, number>> = {
  off: 0,
  amber: 1,
  green: 2,
};
/** One gauge sheet frame in CSS px, and the sheet's columns. */
const FACE_PX = 208;
const FACE_COLS = 11;

interface StageBay {
  readonly stage: "face" | "haul" | "lift";
  readonly name: string;
  /** The stage's biggest machine he owns, or its first machine, dim, while he owns none. */
  readonly icon: "drill" | "drill-dim" | "borer" | "cart" | "hoist" | "train";
  /** What the stage's machines move a second. */
  readonly moves: number;
  readonly line: string;
  readonly lamp: Lamp;
  /** The lowest stage: it holds the line. */
  readonly hold: boolean;
}

interface Board {
  readonly band: string;
  readonly line: number;
  readonly crew: string;
  readonly free: string;
  readonly ready: readonly [string, string];
  readonly bays: readonly [StageBay, StageBay, StageBay];
}

const ICON: Readonly<Record<StageBay["icon"], string>> = {
  drill: drillUrl,
  "drill-dim": drillDimUrl,
  borer: borerUrl,
  cart: cartUrl,
  hoist: hoistUrl,
  train: trainUrl,
};

/** The spec's first steps: twelve workers, a cart and a hoist move 27 a second. */
const EARLY: Board = {
  band: "The Topsoil",
  line: 27,
  crew: "12",
  free: "10 free",
  ready: ["Buy a steam drill · 73,080", "+27/s · the face holds the line"],
  bays: [
    {
      stage: "face",
      name: "The face",
      icon: "drill-dim",
      moves: 0,
      line: "Holds the line",
      lamp: "amber",
      hold: true,
    },
    {
      stage: "haul",
      name: "The haul",
      icon: "cart",
      moves: 18,
      line: "Hands add 9/s",
      lamp: "green",
      hold: false,
    },
    {
      stage: "lift",
      name: "The lift",
      icon: "hoist",
      moves: 60,
      line: "33/s spare",
      lamp: "off",
      hold: false,
    },
  ],
};

/** The spec's sitting in the Crystal Caves: face 14.8K, haul 5.7K, lift 10.6K, line 10.1K. */
const MID: Board = {
  band: "The Crystal Caves · Suits trains",
  line: 10_100,
  crew: "96",
  free: "8 free",
  ready: ["Buy a pit train · 30M", "+2,025/s · the haul holds the line"],
  bays: [
    {
      stage: "face",
      name: "The face",
      icon: "borer",
      moves: 14_800,
      line: "4,700/s spare",
      lamp: "off",
      hold: false,
    },
    {
      stage: "haul",
      name: "The haul",
      icon: "cart",
      moves: 5_700,
      line: "Holds the line",
      lamp: "amber",
      hold: true,
    },
    {
      stage: "lift",
      name: "The lift",
      icon: "hoist",
      moves: 10_600,
      line: "500/s spare",
      lamp: "off",
      hold: false,
    },
  ],
};

/** The same sitting two pit trains later: the haul is wide, and now the lift holds the line. */
const MID_AFTER: Board = {
  band: MID.band,
  line: 13_800,
  crew: "112",
  free: "8 free",
  ready: ["Buy a hoist · 2.8M", "+120/s · the lift holds the line"],
  bays: [
    {
      stage: "face",
      name: "The face",
      icon: "borer",
      moves: 14_800,
      line: "1,000/s spare",
      lamp: "off",
      hold: false,
    },
    {
      stage: "haul",
      name: "The haul",
      icon: "train",
      moves: 12_800,
      line: "Hands add 1,000/s",
      lamp: "off",
      hold: false,
    },
    {
      stage: "lift",
      name: "The lift",
      icon: "hoist",
      moves: 10_600,
      line: "Holds the line",
      lamp: "amber",
      hold: true,
    },
  ],
};

/** Today's saves the board is mounted on: only the band, the pocket and the rows' counts show. */
const EARLY_SAVE = {
  version: 6,
  mountain: {
    staffed: 2,
    remaining: 239_500_000,
    pocket: 76_412,
    helpers: 12,
    carts: 1,
  },
  workshop: {
    materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
    recipes: ["iron-rails", "sturdy-props", "blasting-charge"],
  },
};
const MID_SAVE = {
  version: 6,
  mountain: {
    staffed: 2,
    remaining: 180_000_000,
    pocket: 64_500_000,
    helpers: 96,
    carts: 52,
    drills: 30,
    borers: 9,
    engineers: [{ name: "Ada", rank: 0, trips: 0, post: "borer" }],
  },
  workshop: {
    materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
    recipes: [
      "iron-rails",
      "sturdy-props",
      "blasting-charge",
      "reinforce",
      "axle-grease",
    ],
  },
};

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

function lampAt(lamp: HTMLElement, state: Lamp): void {
  lamp.style.backgroundPositionX = `${String(-LAMP_FRAME[state] * LAMP_PX)}px`;
}

/** A skin drawn again on a copy: a copied canvas is blank. */
function reskin(host: HTMLElement, kind: "frame" | "tag"): void {
  host.querySelector(":scope > canvas.board-skin")?.remove();
  skin(host, kind);
}

/* ---------- the board ---------- */

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
  // The icons' own places in board.css go by tier.
  button.dataset["tier"] = bay.icon.replace("-dim", "");
  button.setAttribute(
    "aria-label",
    `${bay.name}: moves ${gaugeReading(bay.moves)} stones a second. ${bay.line}. Opens Buys`,
  );
  const lamp = el("i", "board-lamp");
  lamp.setAttribute("aria-hidden", "true");
  lampAt(lamp, bay.lamp);
  const icon = el("img", "board-bay-icon");
  icon.src = ICON[bay.icon];
  icon.alt = "";
  const text = el("span", "board-bay-text");
  const sub = el("span", "board-bay-sub");
  writeFigures(sub, bay.line);
  text.append(el("span", "board-bay-name", bay.name), sub);
  button.replaceChildren(
    lamp,
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

function paintBoard(root: HTMLElement, board: Board): void {
  need(root, ".board-band .board-lg").textContent = board.band;
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
  lampAt(need(crew, ".board-lamp"), "amber");
  need(root, ".board-ready-kick").textContent = "Ready now";
  need(root, ".board-ready-guard").style.backgroundPositionX = "0px";
  need(root, ".board-ready-main").textContent = board.ready[0];
  need(root, ".board-ready-why").textContent = board.ready[1];
}

/* ---------- Buys by stage ---------- */

interface BuyRow {
  /** Today's row this one is drawn on. */
  readonly from: "cart" | "drill" | "borer";
  readonly name: string;
  readonly icon: string;
  readonly flag?: string;
  readonly info: string;
  readonly gain: string;
  readonly price: string;
  readonly verb: string;
  readonly lamp: Lamp;
  /** ready: the Ready now pick. can: the pocket and the hands cover it. zero: it adds nothing. */
  readonly state: "ready" | "can" | "zero";
}

const ROOM = (stage: string): string => `The ${stage} has room to spare`;

const MID_ROWS: Readonly<Record<StageBay["stage"], readonly BuyRow[]>> = {
  face: [
    {
      from: "drill",
      name: "Steam drill",
      icon: drillUrl,
      info: ROOM("face"),
      gain: "+0/s",
      price: "1.9M",
      verb: "Buy",
      lamp: "off",
      state: "zero",
    },
    {
      from: "borer",
      name: "Tunnel borer",
      icon: borerUrl,
      info: ROOM("face"),
      gain: "+0/s",
      price: "17.4M",
      verb: "Buy",
      lamp: "off",
      state: "zero",
    },
  ],
  haul: [
    {
      from: "cart",
      name: "Mine cart",
      icon: cartUrl,
      info: "52 of 100 · Twice as fast again.",
      gain: "+101/s",
      price: "861K",
      verb: "Buy",
      lamp: "green",
      state: "can",
    },
    {
      from: "cart",
      name: "Pit train",
      icon: trainUrl,
      flag: "Ready now",
      info: "0 of 5 · Every train hauls twice as fast.",
      gain: "+2,025/s",
      price: "30M",
      verb: "Buy",
      lamp: "amber",
      state: "ready",
    },
  ],
  lift: [
    {
      from: "cart",
      name: "Hoist",
      icon: hoistUrl,
      info: ROOM("lift"),
      gain: "+0/s",
      price: "2.8M",
      verb: "Buy",
      lamp: "off",
      state: "zero",
    },
  ],
};

const ROW_STATES = [
  "is-ready",
  "is-pick",
  "is-can",
  "is-short",
  "is-dear",
  "is-dim-tag",
  "teach-new",
  "line-zero",
];

function buyRow(list: HTMLElement, row: BuyRow): HTMLElement {
  const made = need(list, `.board-row[data-tier="${row.from}"]`).cloneNode(
    true,
  ) as HTMLElement;
  made.hidden = false;
  made.classList.remove(...ROW_STATES);
  if (row.state === "ready") {
    made.classList.add("is-ready", "is-pick", "is-can");
  } else if (row.state === "can") {
    made.classList.add("is-can");
  } else {
    made.classList.add("line-zero");
  }
  made.setAttribute("aria-label", `${row.name}: ${row.gain}, ${row.price}`);
  lampAt(need(made, ".board-lamp"), row.lamp);
  need(made, ".board-row-icon").setAttribute("src", row.icon);
  const name = need(made, ".board-row-name");
  name.replaceChildren(row.name);
  const flag = need(made, ".board-row-flag");
  flag.hidden = row.flag === undefined;
  flag.textContent = row.flag ?? "";
  const info = need(made, ".board-row-info");
  info.classList.add("is-roomy");
  writeFigures(info, row.info);
  need(made, ".board-row-need").hidden = true;
  need(made, ".board-row-why").hidden = true;
  const gain = need(made, ".board-row-gain");
  gain.hidden = false;
  gain.textContent = row.gain;
  need(made, ".board-row-price").textContent = row.price;
  const verb = need(made, ".board-row-verb");
  verb.hidden = false;
  verb.textContent = row.verb;
  reskin(made, "frame");
  reskin(need(made, ".board-row-tag"), "tag");
  return made;
}

/** A stage's legend: its name, and what its bay says. */
function stageLegend(bay: StageBay): HTMLElement {
  const legend = el("div", "board-sec line-sec");
  legend.classList.toggle("is-hold", bay.hold);
  legend.dataset["sec"] = bay.stage;
  legend.append(
    el("span", "board-lg", bay.name),
    el("span", "board-lg", bay.hold ? "Holds the line" : "Room to spare"),
  );
  return legend;
}

/** The crew's line and its chips, by stage. */
function paintCrew(list: HTMLElement): void {
  const status = need(list, ".crew-status");
  status.classList.remove("crew-short");
  status.classList.add("line-hands");
  status.textContent = "10,100/s · Hands help at the haul";
  const chips = [
    "96 workers",
    "38 at the face",
    "26 at the haul",
    "24 at the lift",
    "8 free",
  ];
  need(list, ".crew-posts-words").textContent = chips.join(", ");
  const [row, ...others] = list.querySelectorAll<HTMLElement>(".crew-row");
  if (row === undefined) {
    throw new Error("The mock found no crew chips");
  }
  for (const other of others) {
    other.remove();
  }
  const second = el("span", "crew-row");
  second.setAttribute("aria-hidden", "true");
  const chip = (words: string): HTMLElement => {
    const bit = el("span", "crew-bit");
    bit.append(el("span", "crew-bit-text", words));
    skin(bit, "tag");
    return bit;
  };
  row.replaceChildren(...chips.slice(0, 3).map(chip));
  second.append(...chips.slice(3).map(chip));
  row.after(second);
}

function paintBuys(root: HTMLElement, board: Board): HTMLElement {
  const sheet = need(root, '.board-sheet[data-sheet="buys"]');
  const list = need(sheet, ".board-sheet-list");
  paintCrew(list);
  const worker = need(list, '.board-row[data-tier="helper"]');
  worker.classList.remove("is-ready", "is-pick");
  need(worker, ".board-row-flag").hidden = true;
  lampAt(need(worker, ".board-lamp"), "green");
  need(worker, ".board-row-gain").textContent = "+12/s";
  const machine = need(list, '.board-row[data-tier="machine"]');
  const made: HTMLElement[] = [];
  for (const bay of board.bays) {
    made.push(stageLegend(bay));
    made.push(...MID_ROWS[bay.stage].map((row) => buyRow(list, row)));
  }
  for (const old of list.querySelectorAll(
    '.board-sec[data-sec="machines"], .board-row[data-tier="cart"], .board-row[data-tier="drill"], .board-row[data-tier="borer"]',
  )) {
    old.remove();
  }
  // The Great Machine's own row closes the lift: locked, as it is today.
  machine.before(...made);
  const foot = sheet.querySelector(".board-sheet-foot");
  if (foot !== null) {
    foot.textContent =
      "Ready now offers the biggest machine for the stage that holds the line, if your free workers can run it and you can afford it. It never buys for you.";
  }
  return list;
}

/* ---------- How it works ---------- */

const LINE_STEPS: readonly (readonly [string, string, 32 | 64])[] = [
  [
    drillUrl,
    "Rock is dug at the face, hauled to the shaft and raised by the lift.",
    64,
  ],
  [
    cartUrl,
    "The line moves as fast as its slowest stage. Its bay reads Holds the line.",
    64,
  ],
  // A small icon, so two cards of four steps still fit the drawer.
  [pickUrl, "Your workers help by hand where the line is short.", 32],
  [
    hoistUrl,
    "A machine in a stage with room to spare adds nothing yet. Its row says +0/s.",
    64,
  ],
];

/** The line's card, in the first card's place; today's first card moves down to the second. */
function paintHow(root: HTMLElement): void {
  const how = need(root, '.board-sheet[data-sheet="buys"] .board-sheet-how');
  const [first, second] = how.querySelectorAll<HTMLElement>(".teach-how");
  if (first === undefined || second === undefined) {
    throw new Error("The mock found no How it works cards");
  }
  need(second, ".teach-how-title").textContent = need(
    first,
    ".teach-how-title",
  ).textContent;
  need(second, ".teach-how-steps").replaceChildren(
    ...need(first, ".teach-how-steps").cloneNode(true).childNodes,
  );
  need(first, ".teach-how-title").textContent = "How it works · The line";
  need(first, ".teach-how-steps").replaceChildren(
    ...LINE_STEPS.map(([src, words, px]) => {
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
}

/* ---------- the scenes ---------- */

async function mount(root: HTMLElement, save: object): Promise<() => void> {
  const storage = memoryStorage();
  storage.setItem(
    SESSION_SAVE_KEY,
    JSON.stringify({ ...save, lastSeen: Date.now() }),
  );
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

/** Each scene's board, and today's save it is drawn on. */
function sceneBoard(scene: Scene): readonly [Board, object] {
  switch (scene) {
    case "early":
      return [EARLY, EARLY_SAVE];
    case "mid-after":
      return [
        MID_AFTER,
        {
          ...MID_SAVE,
          mountain: { ...MID_SAVE.mountain, helpers: 112, pocket: 3_180_000 },
        },
      ];
    default:
      return [MID, MID_SAVE];
  }
}

async function show(root: HTMLElement, scene: Scene): Promise<void> {
  const [board, save] = sceneBoard(scene);
  const stop = await mount(root, save);
  if (scene === "buys" || scene === "buys-haul" || scene === "how") {
    need(root, '.board-key[data-key="buys"]').click();
    await wait(900);
  }
  if (scene === "how") {
    need(root, ".board-sheet.is-open .board-sheet-info").click();
    await wait(600);
  }
  // The game stops here: from now on the board is a still picture.
  stop();
  root.classList.add("line-mock");
  paintBoard(root, board);
  if (scene === "how") {
    paintHow(root);
    return;
  }
  if (scene === "buys" || scene === "buys-haul") {
    const list = paintBuys(root, board);
    await wait(100);
    if (scene === "buys-haul") {
      // A tap on the haul's bay opens Buys at the haul's machines.
      list.scrollTop = need(list, '.line-sec[data-sec="haul"]').offsetTop;
    }
  }
}

const root = document.getElementById("app");
if (!(root instanceof HTMLElement)) {
  throw new Error("missing #app");
}
const asked = new URLSearchParams(window.location.search).get("scene");
const scene = SCENES.find((each) => each === asked) ?? "mid";
await show(root, scene);
await wait(400);
document.body.dataset["mock"] = "ready";
