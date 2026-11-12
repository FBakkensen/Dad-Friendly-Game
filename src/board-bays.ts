import drillUrl from "./assets/board/drill-run.png";
import tarpUrl from "./assets/board/mach-borer-tarp.png";
import borerUrl from "./assets/board/mach-borer.png";
import cartUrl from "./assets/board/mach-cart.png";
import machineUrl from "./assets/board/mach-machine.png";
import { el, fitsWidth, frameX, hide, mark, setAttr, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import { controlKey, type ControlRef } from "./board-interaction";
import type { BoardNote } from "./board-note";
import { skin } from "./board-skin";
import { pressOnBoard } from "./card-tap";
import { measurable, onFontsSettled } from "./fit-cache";
import { reducedMotion } from "./float-text";
import { formatCompact, formatCount } from "./format";
import type { TroubleTier } from "./hazards";
import { layerOf } from "./layers";
import {
  bayLamp,
  flapDigits,
  type BayLamp,
  type BayView,
} from "./machine-bays";
import { milestoneLine } from "./milestones";
import {
  formatSpeed,
  layerCardWords,
  troubleAria,
  troubleShout,
  TROUBLE_FIXED,
  workerWords,
} from "./screen-words";
import { lockAria, lockRateLine, lockShortLine } from "./tier-lock-words";
import { tierById, type MachineId } from "./tiers";
import { watchFixHold } from "./trouble-tap";

/*
 * The machine bays (#372): the band tag and three bay buttons, each with its lamp, icon, name,
 * sub-line, flap counter and price. machine-bays.ts decides what each bay shows; this draws it
 * and passes taps on. Fixed places are in board.css (art px x --art); sprite frames are inline
 * background-position-x in CSS px, one art px = 2 CSS px, written only when they change.
 */

export interface MachineBays {
  readonly root: HTMLElement;
  readonly bays: readonly HTMLButtonElement[];
  render(views: readonly BayView[] | undefined, band: string): void;
  tick(dt: number): void;
}

/** The bays before the save is in: their art shows, nothing from the save does. */
const START: readonly MachineId[] = ["cart", "drill", "borer"];
/** One lamp frame in CSS px: 20 art px at 2 px each. */
const LAMP_PX = 40;
const LAMP_FRAME: Readonly<Record<BayLamp, number>> = {
  off: 0,
  amber: 1,
  green: 2,
  red: 3,
};
/** One drill frame in CSS px: 32 art px at 2 px each. */
const DRILL_PX = 64;
const DRILL_FRAMES = 4;
const DRILL_STEP_S = 0.18;
/** Slack for float sums such as 0.1 + 0.08, so a step lands when it is due. */
const DRILL_EPSILON = 1e-9;
/** Before the save is in: a disabled button needs a name, and this is no news. */
const LOADING = "Loading your save...";

/** The band tag: the layer's name, and its short advice without the full stop. */
export function bandWords(mountain: { readonly remaining: number }): string {
  const layer = layerOf(mountain);
  const line = layerCardWords(layer.id)?.line;
  return line === undefined
    ? layer.name
    : `${layer.name} · ${line.replace(/\.$/, "")}`;
}

/**
 * A bay's sub-line fit options, longest first. An open bay always has three, so the bays'
 * patterns line up: the milestone (or the hands line when the tier has none), gain and hands,
 * then the gain alone.
 */
export function bayLines(view: BayView): readonly string[] {
  switch (view.kind) {
    case "locked": {
      const short = lockShortLine(view.lock);
      const line = lockRateLine(view.lock);
      // Lined up with an open bay's three: the full line twice, then the short one.
      return short === undefined ? [line] : [line, line, short];
    }
    case "trouble":
      return [`${troubleShout(view.trouble)} · Hold to fix`];
    case "open": {
      const gain = `+${formatSpeed(view.gain)}/s`;
      const hands = `${gain} · ${formatCount(view.staff)} ${workerWords(view.staff)}`;
      return [
        milestoneLine(view.tier, view.count, formatCompact) ?? hands,
        hands,
        gain,
      ];
    }
  }
}

/**
 * One wording for all bays: the first index at which every bay's option (its last, when it
 * has fewer) fits, else the last index.
 */
export function sharedPattern(
  options: readonly (readonly string[])[],
  fits: (bay: number, text: string) => boolean,
): readonly string[] {
  const depth = Math.max(1, ...options.map((o) => o.length));
  const at = (i: number): readonly string[] =>
    options.map((o) => o[Math.min(i, o.length - 1)] ?? "");
  for (let i = 0; i < depth; i++) {
    const pattern = at(i);
    if (pattern.every((text, bay) => fits(bay, text))) {
      return pattern;
    }
  }
  return at(depth - 1);
}

type IconKey = "cart" | "drill" | "borer" | "tarp" | "machine";

const ICON_URL: Readonly<Record<Exclude<IconKey, "drill">, string>> = {
  cart: cartUrl,
  borer: borerUrl,
  tarp: tarpUrl,
  machine: machineUrl,
};

/** The borer stays under its tarp until the first one arrives. */
function iconKey(tier: MachineId, count: number): IconKey {
  if (tier === "borer") {
    return count > 0 ? "borer" : "tarp";
  }
  return tier;
}

function makeIcon(key: IconKey): HTMLElement {
  if (key === "drill") {
    const sprite = el("i", "board-bay-icon");
    sprite.style.backgroundImage = `url(${drillUrl})`;
    sprite.setAttribute("aria-hidden", "true");
    return sprite;
  }
  const img = el("img", "board-bay-icon");
  img.src = ICON_URL[key];
  img.alt = "";
  img.draggable = false;
  return img;
}

function priceLegend(view: BayView): string {
  if (view.kind === "locked") {
    return "Locked";
  }
  return view.count > 0 ? "Next" : "First";
}

function bayAria(view: BayView): string {
  const tier = tierById(view.tier);
  switch (view.kind) {
    case "trouble":
      return troubleAria(view.trouble, tier);
    case "locked":
      return `${lockAria(tier, view.lock)} Opens Buys`;
    case "open":
      return `${tier.name}: ${formatCount(view.count)} owned. Next ${formatCount(view.price)} stones, +${formatSpeed(view.gain)} stones a second, needs ${formatCount(view.staff)} ${workerWords(view.staff)}. Opens Buys`;
  }
}

interface Bay {
  readonly button: HTMLButtonElement;
  readonly lamp: HTMLElement;
  readonly name: HTMLElement;
  readonly sub: HTMLElement;
  readonly flap: HTMLElement;
  readonly legend: HTMLElement;
  readonly tag: HTMLElement;
  readonly price: HTMLElement;
  icon: HTMLElement;
  iconKey: IconKey;
  digits: HTMLSpanElement[];
  /** The flap text shown, as flapDigits gives it ("" before the save is in). */
  shown: string;
  /** The view drawn; undefined until the save is in. */
  view: BayView | undefined;
}

/** Rebuilds the flap's slices and digit windows for `n` flaps. */
function buildFlap(bay: Bay, n: number): void {
  const parts: HTMLElement[] = [el("i", "board-flap-l")];
  for (let k = 1; k < n; k++) {
    parts.push(el("i", "board-flap-m"));
  }
  parts.push(el("i", "board-flap-r"));
  bay.digits = [];
  for (let k = 0; k < n; k++) {
    const digit = el("span", "board-flap-d");
    digit.style.setProperty("--k", String(k));
    digit.addEventListener("animationend", () => {
      digit.classList.remove("is-flipping");
    });
    bay.digits.push(digit);
  }
  bay.flap.replaceChildren(...parts, ...bay.digits);
}

/** Writes the flaps; changed digits flip when `animate`. */
function showFlap(bay: Bay, text: string, animate: boolean): void {
  const n = Math.max(2, text.length);
  if (bay.digits.length !== n) {
    buildFlap(bay, n);
  }
  mark(bay.button, "is-three", n === 3);
  const before = bay.shown.padStart(n, " ").slice(-n);
  const now = text.padStart(n, " ");
  bay.digits.forEach((digit, k) => {
    const c = now[k] === " " ? "" : (now[k] ?? "");
    const changed = before[k] !== now[k];
    write(digit, c);
    if (changed && animate) {
      digit.classList.remove("is-flipping");
      // Restart the keyframe on a digit still mid-flip.
      void digit.offsetWidth;
      digit.classList.add("is-flipping");
    } else if (!animate) {
      digit.classList.remove("is-flipping");
    }
  });
  bay.shown = text;
}

/** A bay's control on the board, and the host of its thanks after a fix. */
const bayControl = (i: number): ControlRef => ({
  layer: "board",
  id: `bay:${String(i)}`,
});

/** The running drill's frame and the time towards its next one. */
interface Drill {
  /** A bay icon, the drill showing its current frame. */
  icon(key: IconKey): HTMLElement;
  /** Swaps the bay's icon when the art it should show changed. */
  place(bay: Bay, key: IconKey): void;
  /** Steps the drill a frame every DRILL_STEP_S while drills are owned and work. */
  tick(bays: readonly Bay[], dt: number): void;
}

function createDrill(): Drill {
  let frame = 0;
  let clock = 0;
  const icon = (key: IconKey): HTMLElement => {
    const made = makeIcon(key);
    if (key === "drill") {
      frameX(made, frame, DRILL_PX);
    }
    return made;
  };
  return {
    icon,
    place(bay, key) {
      if (bay.iconKey === key) {
        return;
      }
      const made = icon(key);
      bay.icon.replaceWith(made);
      bay.icon = made;
      bay.iconKey = key;
    },
    tick(bays, dt) {
      if (!(dt > 0) || reducedMotion()) {
        return;
      }
      const bay = bays.find((b) => b.view?.tier === "drill");
      const view = bay?.view;
      if (bay === undefined || view === undefined) {
        return;
      }
      if (view.kind === "trouble" || !(view.count > 0)) {
        return;
      }
      clock += dt;
      const steps = Math.floor(clock / DRILL_STEP_S + DRILL_EPSILON);
      if (steps < 1) {
        return;
      }
      clock = Math.max(0, clock - steps * DRILL_STEP_S);
      frame = (frame + steps) % DRILL_FRAMES;
      frameX(bay.icon, frame, DRILL_PX);
    },
  };
}

/** One bay's button and its parts, showing the start art for `tier`. */
function buildBay(tier: MachineId, i: number, drill: Drill): Bay {
  const button = el("button", "board-bay");
  button.type = "button";
  button.style.setProperty("--i", String(i));
  button.dataset.tier = tier;

  const lamp = el("i", "board-lamp");
  lamp.setAttribute("aria-hidden", "true");
  const key = iconKey(tier, 0);
  const icon = drill.icon(key);
  const text = el("span", "board-bay-text");
  const name = el("span", "board-bay-name");
  const sub = el("span", "board-bay-sub");
  text.append(name, sub);
  const flap = el("span", "board-flap board-num");
  flap.setAttribute("aria-hidden", "true");
  const priceCol = el("span", "board-bay-price");
  const legend = el("span", "board-bay-price-lg board-lg");
  const tag = el("span", "board-bay-tag board-num");
  skin(tag, "tag");
  const price = el("span", "board-bay-tag-text");
  tag.append(price);
  priceCol.append(legend, tag);
  button.append(lamp, icon, text, flap, priceCol);

  const bay: Bay = {
    button,
    lamp,
    name,
    sub,
    flap,
    legend,
    tag,
    price,
    icon,
    iconKey: key,
    digits: [],
    shown: "",
    view: undefined,
  };
  buildFlap(bay, 2);
  return bay;
}

/** How a troubled bay was helped: a tap, or a hold. */
type TroubleHelp = "press" | "hold";

interface BayWiring {
  readonly board: BoardHost;
  readonly onOpen: (from: HTMLElement) => void;
  readonly onTrouble: (tier: TroubleTier, how: TroubleHelp) => boolean;
  /** Bay `i` fixed its trouble. */
  readonly fixed: (i: number) => void;
}

/**
 * A bay's taps, through the board: a calm bay opens Buys, a troubled one presses its fix, and
 * a hold fixes it. A trouble press is not a spend, so neither the settle nor a hold stops it.
 */
function wireBayTaps(
  bay: Bay,
  i: number,
  { board, onOpen, onTrouble, fixed }: BayWiring,
): void {
  const troubled = (): TroubleTier | undefined =>
    bay.view?.kind === "trouble" ? bay.view.tier : undefined;
  const help = (tier: TroubleTier, how: TroubleHelp): void => {
    if (onTrouble(tier, how)) {
      fixed(i);
    }
  };
  const hold = watchFixHold(bay.button, {
    tier: troubled,
    fix: (tier) => {
      help(tier, "hold");
    },
  });
  const control = bayControl(i);
  pressOnBoard(
    bay.button,
    board,
    // The click that ends a hold that fixed is not a tap, and nothing opens before the save is in.
    () => (hold.heldFix() || bay.view === undefined ? undefined : control),
    (decision) => {
      if (decision !== "act") {
        return;
      }
      const tier = troubled();
      if (tier === undefined) {
        onOpen(bay.button);
      } else {
        help(tier, "press");
      }
    },
    { intent: () => (troubled() === undefined ? "act" : "trouble") },
  );
}

/**
 * The thanks after a bay's fix, shown on the board note at that bay while the board thanks it.
 * Only a thanks starting or ending moves the note: a note a tap put away stays away, and a note
 * that took the thanks' place stays up when the thanks ends. Returns what a fix calls.
 */
function createBayThanks(
  board: BoardHost,
  note: BoardNote,
  buttons: readonly HTMLElement[],
): (i: number) => void {
  // One body a bay, so one bay's thanks ending never hides another's.
  const bodies = buttons.map(() => el("p", "board-thanks", TROUBLE_FIXED));
  const shown = new Set<number>();
  board.subscribe(() => {
    const thanks = board.view().thanks;
    buttons.forEach((button, i) => {
      const body = bodies[i];
      const now = thanks.has(controlKey(bayControl(i)));
      if (body === undefined || now === shown.has(i)) {
        return;
      }
      if (now) {
        shown.add(i);
        note.show(button, body);
      } else {
        shown.delete(i);
        note.hideIf(body);
      }
    });
  });
  return (i) => {
    // A fix starts its thanks again, so it shows even while an earlier thanks runs.
    shown.delete(i);
    board.send({
      kind: "result",
      control: bayControl(i),
      at: board.clock(),
      outcome: "fixed",
    });
  };
}

/** Draws a bay before the save is in: its start art, dark and disabled. */
function paintLoading(bay: Bay, i: number, drill: Drill): void {
  bay.view = undefined;
  const tier = START[i] ?? "cart";
  setAttr(bay.button, "data-tier", tier);
  drill.place(bay, iconKey(tier, 0));
  setAttr(bay.button, "data-trouble", undefined);
  if (!bay.button.disabled) {
    bay.button.disabled = true;
  }
  setAttr(bay.button, "aria-label", LOADING);
  frameX(bay.lamp, LAMP_FRAME.off, LAMP_PX);
  write(bay.name, "");
  write(bay.sub, "");
  write(bay.legend, "");
  write(bay.price, "");
  hide(bay.tag, true);
  showFlap(bay, "", false);
}

/** Draws a bay's view, all but its words; its flaps flip when the same tier counts on. */
function paintBay(bay: Bay, view: BayView, drill: Drill): void {
  const animate =
    bay.view !== undefined && bay.view.tier === view.tier && !reducedMotion();
  bay.view = view;
  setAttr(bay.button, "data-tier", view.tier);
  setAttr(
    bay.button,
    "data-trouble",
    view.kind === "trouble" ? view.trouble : undefined,
  );
  if (bay.button.disabled) {
    bay.button.disabled = false;
  }
  setAttr(bay.button, "aria-label", bayAria(view));
  drill.place(bay, iconKey(view.tier, view.count));
  frameX(bay.lamp, LAMP_FRAME[bayLamp(view)], LAMP_PX);
  showFlap(bay, flapDigits(view.count), animate);
  write(bay.legend, priceLegend(view));
  const locked = view.kind === "locked";
  hide(bay.tag, locked);
  write(bay.price, locked ? "" : formatCompact(view.price));
}

type Drawn = readonly (readonly [Bay, BayView])[];

/** The bays' names and sub-lines, fitted to their boxes. */
interface BayFit {
  fit(drawn: Drawn): void;
  /** Nothing is drawn with the save in: the next fit measures afresh. */
  reset(): void;
}

/**
 * Keeps the words last fitted, so a frame with the same words and widths measures nothing. A
 * fit is kept only when every box was measured on the page with a width. The fonts settling
 * fit the bays last drawn again.
 */
function createBayFit(fits: (el: HTMLElement) => boolean): BayFit {
  let fittedNames = "";
  let fittedSubs = "";
  let lastDrawn: Drawn = [];

  const fitNames = (drawn: Drawn, widths: string): void => {
    const nameKey = `${drawn.map(([, view]) => view.tier).join("|")}#${widths}`;
    if (nameKey === fittedNames) {
      return;
    }
    for (const [bay, view] of drawn) {
      const tier = tierById(view.tier);
      bay.name.textContent = tier.name;
      if (!fits(bay.name)) {
        bay.name.textContent = tier.shortName;
      }
    }
    fittedNames = drawn.every(([bay]) => measurable(bay.name)) ? nameKey : "";
  };

  const fitSubs = (drawn: Drawn, widths: string): void => {
    const options = drawn.map(([, view]) => bayLines(view));
    const subKey = `${options.map((o) => o.join("\n")).join("\n#\n")}#${widths}`;
    if (subKey === fittedSubs) {
      return;
    }
    const pattern = sharedPattern(options, (b, text) => {
      const sub = drawn[b]?.[0].sub;
      if (sub === undefined) {
        return true;
      }
      sub.textContent = text;
      return fits(sub);
    });
    drawn.forEach(([bay], b) => {
      write(bay.sub, pattern[b] ?? "");
    });
    fittedSubs = drawn.every(([bay]) => measurable(bay.sub)) ? subKey : "";
  };

  const fit = (drawn: Drawn): void => {
    lastDrawn = drawn;
    const widths = drawn
      .map(([bay]) => (bay.digits.length === 3 ? "3" : "2"))
      .join("");
    fitNames(drawn, widths);
    fitSubs(drawn, widths);
  };

  // Words fitted with fallback metrics may not fit in the board's own fonts.
  onFontsSettled(() => {
    fittedNames = "";
    fittedSubs = "";
    if (lastDrawn.length > 0) {
      fit(lastDrawn);
    }
  });

  return {
    fit,
    reset() {
      lastDrawn = [];
      fittedNames = "";
      fittedSubs = "";
    },
  };
}

/**
 * The machine bays. Each bay's element is built once and kept: the hold-to-fix listeners live
 * as long as the board, so a render never rebuilds a bay.
 */
export function createMachineBays({
  board,
  note,
  onOpen,
  onTrouble,
  fits = fitsWidth,
}: {
  board: BoardHost;
  /** Where a fix's thanks shows. */
  note: BoardNote;
  /** A tap on a bay with no trouble: the bay is where Buys opened from. */
  onOpen: (from: HTMLElement) => void;
  /** A tap or a hold on a troubled bay; true when the trouble is gone. */
  onTrouble: (tier: TroubleTier, how: TroubleHelp) => boolean;
  fits?: (el: HTMLElement) => boolean;
}): MachineBays {
  const root = el("section", "board-bays");

  const bandRow = el("div", "board-band-row");
  const band = el("div", "board-band");
  skin(band, "tag");
  const bandText = el("span", "board-lg");
  band.append(bandText);
  bandRow.append(band);

  const area = el("div", "board-bays-area");
  const drill = createDrill();
  const bays = START.map((tier, i) => buildBay(tier, i, drill));
  area.append(...bays.map((bay) => bay.button));
  const fixed = createBayThanks(
    board,
    note,
    bays.map((bay) => bay.button),
  );
  bays.forEach((bay, i) => {
    wireBayTaps(bay, i, { board, onOpen, onTrouble, fixed });
  });

  root.append(bandRow, area);
  skin(root, "frame");

  const wording = createBayFit(fits);

  const render = (
    views: readonly BayView[] | undefined,
    words: string,
  ): void => {
    write(bandText, views === undefined ? "" : words);
    const drawn: (readonly [Bay, BayView])[] = [];
    bays.forEach((bay, i) => {
      const view = views?.[i];
      if (view === undefined) {
        paintLoading(bay, i, drill);
        return;
      }
      paintBay(bay, view, drill);
      drawn.push([bay, view]);
    });
    if (drawn.length === 0) {
      wording.reset();
      return;
    }
    wording.fit(drawn);
  };

  render(undefined, "");
  return {
    root,
    bays: bays.map((bay) => bay.button),
    render,
    tick: (dt) => {
      drill.tick(bays, dt);
    },
  };
}
