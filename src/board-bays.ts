import drillUrl from "./assets/board/drill-run.png";
import tarpUrl from "./assets/board/mach-borer-tarp.png";
import borerUrl from "./assets/board/mach-borer.png";
import cartUrl from "./assets/board/mach-cart.png";
import machineUrl from "./assets/board/mach-machine.png";
import { skin } from "./board-skin";
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
  workerWords,
} from "./screen-words";
import { lockAria, lockRateLine } from "./tier-lock-words";
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

const defaultFits = (el: HTMLElement): boolean =>
  el.scrollWidth <= el.clientWidth + 1;

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
    case "locked":
      return [lockRateLine(tierById(view.tier), view.lock)];
    case "trouble":
      return [`${troubleShout(view.trouble)} · Hold to fix`];
    case "open": {
      const gain = `+${formatSpeed(view.gain)}/s`;
      const hands = `${gain} · ${formatCount(view.staff)} ${view.staff === 1 ? "hand" : "hands"}`;
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

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const made = document.createElement(tag);
  made.className = className;
  return made;
}

/** Text that is written only when it changes. */
function write(target: HTMLElement, text: string): void {
  if (target.textContent !== text) {
    target.textContent = text;
  }
}

function setAttr(
  target: HTMLElement,
  name: string,
  value: string | undefined,
): void {
  if (value === undefined) {
    if (target.hasAttribute(name)) {
      target.removeAttribute(name);
    }
  } else if (target.getAttribute(name) !== value) {
    target.setAttribute(name, value);
  }
}

function frameX(target: HTMLElement, n: number, framePx: number): void {
  const next = `${String(-n * framePx)}px`;
  if (target.style.backgroundPositionX !== next) {
    target.style.backgroundPositionX = next;
  }
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
  if (bay.button.classList.contains("is-three") !== (n === 3)) {
    bay.button.classList.toggle("is-three", n === 3);
  }
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

/**
 * The machine bays. Each bay's element is built once and kept: the hold-to-fix listeners live
 * as long as the board, so a render never rebuilds a bay.
 */
export function createMachineBays({
  onOpen,
  onPress,
  onFix,
  fits = defaultFits,
}: {
  onOpen: () => void;
  onPress: (tier: TroubleTier, bay: HTMLElement) => void;
  onFix: (tier: TroubleTier, bay: HTMLElement) => void;
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

  let drillFrame = 0;
  let drillClock = 0;

  const placeIcon = (bay: Bay, key: IconKey): void => {
    if (bay.iconKey === key) {
      return;
    }
    const icon = makeIcon(key);
    bay.icon.replaceWith(icon);
    bay.icon = icon;
    bay.iconKey = key;
    if (key === "drill") {
      frameX(icon, drillFrame, DRILL_PX);
    }
  };

  const bays: Bay[] = START.map((tier, i) => {
    const button = el("button", "board-bay");
    button.type = "button";
    button.style.setProperty("--i", String(i));
    button.dataset.tier = tier;

    const lamp = el("i", "board-lamp");
    lamp.setAttribute("aria-hidden", "true");
    const key = iconKey(tier, 0);
    const icon = makeIcon(key);
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
    area.append(button);

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
    if (key === "drill") {
      frameX(icon, drillFrame, DRILL_PX);
    }
    buildFlap(bay, 2);

    const hold = watchFixHold(button, {
      tier: () => (bay.view?.kind === "trouble" ? bay.view.tier : undefined),
      fix: (troubled) => {
        onFix(troubled, button);
      },
    });
    button.addEventListener("click", () => {
      if (hold.heldFix()) {
        return;
      }
      const view = bay.view;
      if (view === undefined) {
        return;
      }
      if (view.kind === "trouble") {
        onPress(view.tier, button);
        return;
      }
      onOpen();
    });
    return bay;
  });

  root.append(bandRow, area);
  skin(root, "frame");

  /**
   * The words last fitted, so a frame with the same words and widths measures nothing. A fit is
   * kept only when every box was measured on the page with a width.
   */
  let fittedNames = "";
  let fittedSubs = "";
  /** The bays last drawn with the save in, to fit again when the fonts arrive. */
  let lastDrawn: readonly (readonly [Bay, BayView])[] = [];

  const loading = (bay: Bay, i: number): void => {
    bay.view = undefined;
    const tier = START[i] ?? "cart";
    setAttr(bay.button, "data-tier", tier);
    placeIcon(bay, iconKey(tier, 0));
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
    if (!bay.tag.hidden) {
      bay.tag.hidden = true;
    }
    showFlap(bay, "", false);
  };

  const draw = (bay: Bay, view: BayView): void => {
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
    placeIcon(bay, iconKey(view.tier, view.count));
    frameX(bay.lamp, LAMP_FRAME[bayLamp(view)], LAMP_PX);
    showFlap(bay, flapDigits(view.count), animate);
    write(bay.legend, priceLegend(view));
    const locked = view.kind === "locked";
    if (bay.tag.hidden !== locked) {
      bay.tag.hidden = locked;
    }
    write(bay.price, locked ? "" : formatCompact(view.price));
  };

  const fitWords = (drawn: readonly (readonly [Bay, BayView])[]): void => {
    const widths = drawn.map(([bay]) => (bay.digits.length === 3 ? "3" : "2"));
    const names = drawn.map(([, view]) => view.tier).join("|");
    const nameKey = `${names}#${widths.join("")}`;
    if (nameKey !== fittedNames) {
      for (const [bay, view] of drawn) {
        const tier = tierById(view.tier);
        bay.name.textContent = tier.name;
        if (!fits(bay.name)) {
          bay.name.textContent = tier.shortName;
        }
      }
      fittedNames = drawn.every(([bay]) => measurable(bay.name)) ? nameKey : "";
    }
    const options = drawn.map(([, view]) => bayLines(view));
    const subKey = `${options.map((o) => o.join("\n")).join("\n#\n")}#${widths.join("")}`;
    if (subKey !== fittedSubs) {
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
    }
  };

  // Words fitted with fallback metrics may not fit in the board's own fonts.
  onFontsSettled(() => {
    fittedNames = "";
    fittedSubs = "";
    if (lastDrawn.length > 0) {
      fitWords(lastDrawn);
    }
  });

  const render = (
    views: readonly BayView[] | undefined,
    words: string,
  ): void => {
    write(bandText, views === undefined ? "" : words);
    const drawn: (readonly [Bay, BayView])[] = [];
    bays.forEach((bay, i) => {
      const view = views?.[i];
      if (view === undefined) {
        loading(bay, i);
        return;
      }
      draw(bay, view);
      drawn.push([bay, view]);
    });
    lastDrawn = drawn;
    if (drawn.length === 0) {
      fittedNames = "";
      fittedSubs = "";
      return;
    }
    fitWords(drawn);
  };

  const tick = (dt: number): void => {
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
    drillClock += dt;
    const steps = Math.floor(drillClock / DRILL_STEP_S + DRILL_EPSILON);
    if (steps < 1) {
      return;
    }
    drillClock = Math.max(0, drillClock - steps * DRILL_STEP_S);
    drillFrame = (drillFrame + steps) % DRILL_FRAMES;
    frameX(bay.icon, drillFrame, DRILL_PX);
  };

  render(undefined, "");
  return {
    root,
    bays: bays.map((bay) => bay.button),
    render,
    tick,
  };
}
