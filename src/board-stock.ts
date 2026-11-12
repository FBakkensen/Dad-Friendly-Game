import dec1Url from "./assets/board/odo-dec-1.png";
import dec2Url from "./assets/board/odo-dec-2.png";
import dec3Url from "./assets/board/odo-dec-3.png";
import dotUrl from "./assets/board/odo-dot.png";
import odometerUrl from "./assets/board/odometer.png";
import dialUrl from "./assets/board/dial-boost-sheet.png";
import { dialFrame, type CrewBoost } from "./crew-boost";
import { multiplierMark } from "./effect-row";
import { chipTime, formatCompact } from "./format";
import { odometerFace } from "./odometer";

export interface Odometer {
  readonly root: HTMLElement;
  set(pocket: number): void;
  spend(amount: number): void;
}

/** Each drum's left edge and width, in art px. */
export const ODO_DRUMS: readonly (readonly [number, number])[] = [
  [13, 15],
  [32, 15],
  [52, 16],
  [72, 15],
  [92, 15],
];
/** Where the point sits after drum 0..3, in art px. */
export const ODO_DOT_LEFT = [28, 48, 68, 88] as const;
const DEC_FACES = [
  { n: 1, url: dec1Url, left: 32 },
  { n: 2, url: dec2Url, left: 52 },
  { n: 3, url: dec3Url, left: 72 },
] as const;

const ROLL_MS = 160;
const SPEND_MS = 1900;

/** Positions are art-pixel counts in custom properties; board.css multiplies by --art. */
const at = (el: HTMLElement, left: number): void => {
  el.style.setProperty("--at", String(left));
};

function reducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function image(url: string, className: string): HTMLImageElement {
  const img = document.createElement("img");
  img.src = url;
  img.alt = "";
  img.className = className;
  return img;
}

function span(className: string, text = ""): HTMLSpanElement {
  const el = document.createElement("span");
  el.className = className;
  el.textContent = text;
  return el;
}

/** Five drums that roll on hard steps, the STONES legend, and the spend mark. */
export function createOdometer(): Odometer {
  const root = document.createElement("div");
  root.className = "board-odo";
  root.setAttribute("role", "img");

  root.append(image(odometerUrl, "board-odo-body"));

  const drums = ODO_DRUMS.map(([left, width]) => {
    const drum = span("board-drum board-num");
    at(drum, left);
    drum.style.setProperty("--w", String(width));
    drum.append(span("board-drum-face"));
    return drum;
  });
  root.append(...drums);

  const decs = DEC_FACES.map(({ n, url, left }) => {
    const img = image(url, `board-odo-dec odo-dec-${String(n)}`);
    at(img, left);
    img.hidden = true;
    return img;
  });
  root.append(...decs);

  const dot = image(dotUrl, "board-odo-dot");
  dot.hidden = true;
  root.append(dot);

  const legend = document.createElement("div");
  legend.className = "board-odo-legend";
  const spendMark = span("board-lg board-num board-spend");
  legend.append(span("board-lg", "Stones"), spendMark);
  root.append(legend);

  const rolling = new Set<HTMLElement>();
  let painted = false;

  const roll = (drum: HTMLElement, text: string): void => {
    const current = drum.lastElementChild as HTMLElement;
    if (current.textContent === text) {
      return;
    }
    if (
      !painted ||
      rolling.has(drum) ||
      reducedMotion() ||
      typeof current.animate !== "function"
    ) {
      current.textContent = text;
      return;
    }
    const next = span("board-drum-face", text);
    next.style.top = "calc(var(--art) * 24)";
    drum.append(next);
    rolling.add(drum);
    const frames = [
      { transform: "translateY(0)" },
      { transform: `translateY(calc(var(--art) * -24))` },
    ];
    const options: KeyframeAnimationOptions = {
      duration: ROLL_MS,
      easing: "steps(4)",
      fill: "forwards",
    };
    current.animate(frames, options);
    next.animate(frames, options).onfinish = () => {
      current.remove();
      for (const a of next.getAnimations()) {
        a.cancel();
      }
      next.style.top = "0";
      rolling.delete(drum);
    };
  };

  const set = (pocket: number): void => {
    const face = odometerFace(pocket);
    const dotLeft = face.point === -1 ? undefined : ODO_DOT_LEFT[face.point];
    dot.hidden = dotLeft === undefined;
    if (dotLeft !== undefined) {
      at(dot, dotLeft);
    }
    for (const n of [1, 2, 3]) {
      const on = face.point >= 0 && n > face.point;
      const dec = decs[n - 1];
      if (dec) {
        dec.hidden = !on;
      }
      drums[n]?.classList.toggle("is-decimal", on);
    }
    drums.forEach((drum, i) => {
      roll(drum, face.drums[i] ?? "0");
    });
    painted = true;
    root.setAttribute("aria-label", `Stones ${face.words}`);
  };

  let spendTimer: ReturnType<typeof setTimeout> | undefined;
  const spend = (amount: number): void => {
    const whole = Math.max(0, Math.floor(amount));
    spendMark.textContent = `−${whole < 10_000 ? whole.toLocaleString("en-US") : formatCompact(whole)}`;
    legend.classList.add("is-spending");
    clearTimeout(spendTimer);
    spendTimer = setTimeout(() => {
      spendMark.textContent = "";
      legend.classList.remove("is-spending");
    }, SPEND_MS);
  };

  set(0);
  painted = false;
  return { root, set, spend };
}

export interface BoostDial {
  readonly root: HTMLButtonElement;
  set(boost: CrewBoost): void;
}

/** One dial frame in CSS px: 44 art px at 2 px each. */
const DIAL_FRAME_PX = 88;

/** The crew timer the crew runs at: legend beside a 31-frame dial. */
export function createBoostDial({ onOpen }: { onOpen: () => void }): BoostDial {
  const root = document.createElement("button");
  root.type = "button";
  root.className = "board-dial";

  const name = span("board-lg board-dial-name");
  const mul = span("board-dial-mul board-num");
  const left = span("board-dial-left board-num");
  const word = span("board-lg board-dial-word");
  const text = document.createElement("span");
  text.className = "board-dial-text";
  text.append(name, mul, left, word);

  const sprite = span("board-dial-sprite");
  sprite.style.backgroundImage = `url(${dialUrl})`;
  root.append(text, sprite);
  root.addEventListener("click", onOpen);

  const set = (boost: CrewBoost): void => {
    const running = boost.kind === "running";
    const clock = running ? chipTime(boost.leftMs) : "rested";
    const mark = multiplierMark(running ? boost.multiplier : 1);
    // At rest the dial is the crew's pace, so the crew plate keeps the one CREW label (#508).
    name.textContent = running ? boost.name : "Pace";
    mul.textContent = mark;
    left.textContent = clock;
    word.textContent = running ? "left" : "";
    sprite.style.backgroundPositionX = `${String(-dialFrame(boost) * DIAL_FRAME_PX)}px`;
    root.setAttribute(
      "aria-label",
      running
        ? `${boost.name}, pace ${mark}, ${clock} left`
        : `Pace ${mark}, rested`,
    );
  };
  set({ kind: "rested" });
  return { root, set };
}
