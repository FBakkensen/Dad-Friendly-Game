import dec1Url from "./assets/board/odo-dec-1.png";
import dec2Url from "./assets/board/odo-dec-2.png";
import dec3Url from "./assets/board/odo-dec-3.png";
import dotUrl from "./assets/board/odo-dot.png";
import odometerUrl from "./assets/board/odometer.png";
import { formatCompact } from "./format";
import { odometerFace } from "./odometer";

export interface Odometer {
  readonly root: HTMLElement;
  set(pocket: number): void;
  spend(amount: number): void;
}

/** Drum left edge and width, in art px. */
const DRUMS: readonly (readonly [number, number])[] = [
  [13, 15],
  [32, 15],
  [52, 16],
  [72, 15],
  [92, 15],
];
/** Where the point sits after drum 0..3, in art px. */
const DOT_LEFT = [28, 48, 68, 88] as const;
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

  const drums = DRUMS.map(([left, width]) => {
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
    const dotLeft = face.point === -1 ? undefined : DOT_LEFT[face.point];
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
  return { root, set, spend };
}
