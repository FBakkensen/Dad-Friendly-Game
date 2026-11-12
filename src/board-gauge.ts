import sheetUrl from "./assets/board/gauge-output-sheet.png";
import { skin } from "./board-skin";
import type { CrewCounts } from "./crew-count";
import { reducedMotion } from "./float-text";
import { formatCompact, formatCount } from "./format";
import {
  gaugeAngle,
  gaugeRange,
  gaugeReading,
  gaugeUnitText,
  needleFrame,
  needleKick,
  needleStep,
  NEEDLE_REST,
  type Needle,
} from "./output-gauge";
import { workerWords } from "./screen-words";

export interface OutputGauge {
  readonly root: HTMLElement;
  set(rate: number): void;
  kick(by: number): void;
  tick(dt: number): void;
}

export interface CrewPlate {
  readonly root: HTMLElement;
  set(counts: CrewCounts): void;
}

/** One sheet frame in CSS px: 104 art px at 2 px each. */
const FACE_PX = 208;
/** Columns in gauge-output-sheet.png. */
const FACE_COLS = 11;
/** The longest step one tick takes, so a tab back from hours away moves the needle once, gently. */
const MAX_STEP_S = 0.1;
/** One lamp frame in CSS px: 20 art px at 2 px each. */
const LAMP_PX = 40;
const LAMP_AMBER = 1;

/**
 * The dial's marks and the unit, centred on these points in art px. The 5 and the 10 are the
 * mockup's. The 0 stands above the needle at rest, a little round the dial from its tick,
 * and the 15 level with it (#507): on the tick's own line the resting needle lay over the 0.
 */
export const GAUGE_MARKS: readonly (readonly [string, number, number])[] = [
  ["0", 29.5, 65.5],
  ["5", 32.5, 32.5],
  ["10", 71.5, 32.5],
  ["15", 72, 65.5],
];
/** The unit's plate is 7 art px tall: centred on a half, its edges are on the art grid. */
const UNIT_AT = [52, 36.5] as const;

/** Positions are art-pixel counts in custom properties; board.css multiplies by --art. */
const at = (el: HTMLElement, left: number, top: number): void => {
  el.style.setProperty("--at", String(left));
  el.style.setProperty("--y", String(top));
};

function span(className: string, text = ""): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

/** The output dial: a damped needle on 5° frames, its unit, and a five-figure counter. */
export function createOutputGauge(): OutputGauge {
  const root = document.createElement("div");
  root.className = "board-gauge";
  root.setAttribute("role", "img");

  const face = span("board-gauge-face");
  face.style.backgroundImage = `url(${sheetUrl})`;
  root.append(face);

  for (const [mark, left, top] of GAUGE_MARKS) {
    const el = span("board-gauge-mark board-num", mark);
    at(el, left, top);
    root.append(el);
  }
  const unit = span("board-gauge-unit board-num");
  at(unit, ...UNIT_AT);

  // The counter's window, stretched from its art to hold five characters at 20px (#507).
  const counter = span("board-gauge-counter");
  skin(counter, "counter");

  const read = span("board-gauge-read board-num");
  const legend = span("board-gauge-legend", "Stones a second");
  root.append(unit, counter, read, legend);

  let needle: Needle = NEEDLE_REST;
  let target = NEEDLE_REST.angle;
  let frame = -1;

  const paint = (): void => {
    const next = needleFrame(needle.angle);
    if (next === frame) {
      return;
    }
    frame = next;
    const col = next % FACE_COLS;
    const row = Math.floor(next / FACE_COLS);
    face.style.backgroundPosition = `${String(-col * FACE_PX)}px ${String(-row * FACE_PX)}px`;
  };

  const set = (rate: number): void => {
    const clean = Number.isNaN(rate) ? 0 : rate;
    const k = gaugeRange(clean);
    target = gaugeAngle(clean, k);
    unit.textContent = gaugeUnitText(k);
    read.textContent = gaugeReading(clean);
    root.setAttribute(
      "aria-label",
      `Output: ${formatCount(clean)} stones a second`,
    );
  };

  const kick = (by: number): void => {
    needle = needleKick(needle, by);
  };

  const tick = (dt: number): void => {
    needle = reducedMotion()
      ? { angle: target, velocity: 0 }
      : needleStep(needle, target, Math.min(MAX_STEP_S, Math.max(0, dt)));
    paint();
  };

  set(0);
  paint();
  return { root, set, kick, tick };
}

/** The crew plate: the whole crew, a lamp that is amber while anyone is free, and how many. */
export function createCrewPlate(): CrewPlate {
  const root = document.createElement("div");
  root.className = "board-crew";
  root.setAttribute("role", "img");
  skin(root, "frame");

  const n = span("board-crew-n board-num");
  const lamp = document.createElement("i");
  lamp.className = "board-lamp";
  const freeText = span("board-lg board-crew-free");
  root.append(span("board-lg board-crew-legend", "Crew"), n, lamp, freeText);

  const set = ({ crew, free }: CrewCounts): void => {
    const figure = formatCompact(crew);
    n.textContent = figure;
    n.classList.toggle("is-long", figure.length >= 4 && figure.length <= 5);
    n.classList.toggle("is-longer", figure.length >= 6);
    const freeFigure = formatCompact(free);
    freeText.textContent = `${freeFigure} free`;
    freeText.classList.toggle("is-long", freeFigure.length >= 5);
    lamp.style.backgroundPositionX = `${String(free > 0 ? -LAMP_AMBER * LAMP_PX : 0)}px`;
    root.classList.toggle("is-none", free < 1);
    root.setAttribute(
      "aria-label",
      `Crew: ${formatCount(crew)} ${workerWords(crew)}, ${formatCount(free)} free`,
    );
  };

  set({ crew: 0, spare: 0, free: 0 });
  return { root, set };
}
