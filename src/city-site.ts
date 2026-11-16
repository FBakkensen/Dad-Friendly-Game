import stoneUrl from "./assets/board/res-stone.png";
import { el, hide, mark, setAttr, write } from "./board-dom";
import { vehicleBuyMove, type Move } from "./economy/actions";
import {
  CITY_FOOT,
  PLOT_SPANS,
  drawCity,
  loadCitySprites,
  paintCityGround,
} from "./city-scene";
import {
  cityScene,
  plots,
  projectCard,
  transportPlate,
  vehicleHint,
  vehicleKeys,
  type CityScene,
  type OrderKey,
  type ProjectCard,
  type VehicleKey,
} from "./city-view";
import type { FrameState } from "./frame-state";
import { listenSteps, paintSteps, stepper } from "./job-steps";
import type { Mountain } from "./mountain";
import { priceIcon } from "./price-icons";
import { runScene } from "./scene-paint";
import type { BuyAmount } from "./tiers";
import { VEHICLE_IDS, type VehicleId } from "./transport";
import { NO_FREE_WORKER } from "./workforce-view";
import "./city.css";

/**
 * The city on slice 1's frame (#662; spec, The city): the transport plate on
 * top, the skyline with its plots and the building in hand rising, and the
 * project's card under it with the order key and the builders. It paints the
 * pure views (city-view) and changes the game only through
 * `progress.dispatch`. There is no hire key here: hiring is in the frame.
 */

export type CitySite = {
  readonly root: HTMLElement;
  readonly paint: (mountain: Mountain, shown: boolean, now?: number) => void;
};

type Steps = {
  readonly minus: HTMLButtonElement;
  readonly plus: HTMLButtonElement;
};

function steps(job: "driving" | "building"): Steps {
  return {
    minus: stepper("−", job, "free"),
    plus: stepper("+", job, "place"),
  };
}

/** One vehicle's key: its face, and its price with its good's icon and its driver. */
type KeyParts = {
  readonly key: HTMLButtonElement;
  readonly face: HTMLElement;
  readonly price: HTMLElement;
  readonly icon: HTMLImageElement;
  readonly staff: HTMLElement;
};

type PlateParts = {
  readonly root: HTMLElement;
  readonly drivers: HTMLElement;
  readonly state: HTMLElement;
  readonly fleet: HTMLElement;
  readonly steps: Steps;
  readonly keys: Readonly<Record<VehicleId, KeyParts>>;
  /** The dark cell in the trucks' key's place while the Warehouse is in hand (#754). */
  readonly hint: HTMLElement;
};

/** A key for `id`, hidden until the view offers it; a tap buys what the view offers. */
function buildVehicleKey(state: FrameState, id: VehicleId): KeyParts {
  const key = el("button", "city-key");
  key.type = "button";
  key.dataset["vehicle"] = id;
  key.hidden = true;
  const face = el("span", "mine-key-face");
  const price = el("span", "board-num");
  const staff = el("span", "mine-key-staff");
  const icon = el("img", "mine-key-icon");
  icon.alt = "";
  const small = el("span", "mine-key-small");
  small.append(price, icon, staff);
  key.append(face, small);
  key.addEventListener("click", () => {
    const offer = vehicleKeys(state.mountain(), state.amount()).find(
      (each) => each.id === id,
    );
    if (offer !== undefined && offer.can) {
      void state.progress.dispatch(vehicleBuyMove(offer.id, offer.count));
    }
  });
  return { key, face, price, icon, staff };
}

function buildPlate(state: FrameState): PlateParts {
  const root = el("div", "city-plate");
  const head = el("div", "city-plate-head");
  const drivers = el("span", "city-drivers");
  const now = el("span", "city-state");
  head.append(el("b", "city-plate-name", "Transport"), drivers, now);
  const fleet = el("p", "city-fleet");
  const row = el("div", "city-plate-keys");
  const driving = steps("driving");
  const keys = Object.fromEntries(
    VEHICLE_IDS.map((id) => [id, buildVehicleKey(state, id)]),
  ) as Record<VehicleId, KeyParts>;
  const hint = el("div", "city-hint");
  hint.hidden = true;
  row.append(
    driving.minus,
    driving.plus,
    ...VEHICLE_IDS.map((id) => keys[id].key),
    hint,
  );
  root.append(head, fleet, row);
  return {
    root,
    drivers,
    state: now,
    fleet,
    steps: driving,
    keys,
    hint,
  };
}

function paintVehicleKey(parts: KeyParts, key: VehicleKey | undefined): void {
  hide(parts.key, key === undefined);
  if (key === undefined) {
    return;
  }
  write(parts.face, key.face);
  write(parts.price, key.price);
  write(parts.staff, ` · ${key.staff}`);
  const src = priceIcon(key.good) ?? stoneUrl;
  if (parts.icon.getAttribute("src") !== src) {
    parts.icon.src = src;
  }
  mark(parts.key, "can", key.can);
  setAttr(parts.key, "aria-label", key.label);
}

function paintPlate(
  parts: PlateParts,
  mountain: Mountain,
  amount: BuyAmount,
): void {
  const plate = transportPlate(mountain);
  write(parts.drivers, plate.drivers);
  write(parts.state, plate.state);
  write(parts.fleet, plate.fleet);
  paintSteps(parts.steps, plate.steps, amount);
  const offered = vehicleKeys(mountain, amount);
  for (const id of VEHICLE_IDS) {
    paintVehicleKey(
      parts.keys[id],
      offered.find((key) => key.id === id),
    );
  }
  const hint = vehicleHint(mountain);
  hide(parts.hint, hint === undefined);
  write(parts.hint, hint ?? "");
}

type TagParts = { readonly name: HTMLElement; readonly state: HTMLElement };

function buildTags(): {
  readonly root: HTMLElement;
  readonly tags: TagParts[];
} {
  const root = el("div", "city-tags");
  const tags = PLOT_SPANS.map((span) => {
    const tag = el("div", "city-tag");
    tag.style.setProperty("--x", String(span.x));
    tag.style.setProperty("--w", String(span.w));
    const name = el("b", "");
    const state = el("small", "");
    tag.append(name, state);
    root.append(tag);
    return { name, state };
  });
  return { root, tags };
}

/** Taps on the order key closer than this are one tap. */
const SAME_TAP_MS = 500;

/** The order's moves: place, hold and resume. */
const ORDER_MOVES: Readonly<
  Record<
    OrderKey["kind"],
    Extract<Move, { kind: "placeOrder" | "holdOrder" | "resumeOrder" }>
  >
> = {
  place: { kind: "placeOrder" },
  hold: { kind: "holdOrder" },
  resume: { kind: "resumeOrder" },
};

type CardParts = {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly steps: HTMLElement;
  readonly bars: HTMLElement;
  readonly planning: HTMLElement;
  readonly key: HTMLButtonElement;
  readonly title: HTMLElement;
  readonly lines: readonly HTMLElement[];
  readonly builders: Steps;
  readonly crew: HTMLElement;
  readonly completion: HTMLElement;
};

function buildOrderKey(state: FrameState): {
  readonly key: HTMLButtonElement;
  readonly title: HTMLElement;
  readonly lines: readonly HTMLElement[];
} {
  const key = el("button", "city-order");
  key.type = "button";
  const title = el("b", "");
  const lines = [el("small", ""), el("small", ""), el("small", "")];
  key.append(title, ...lines);
  // A second tap of a double tap would undo the first (place, then hold), so
  // a tap this soon after the last one is taken as the same tap.
  let last = -Infinity;
  key.addEventListener("click", () => {
    const at = performance.now();
    if (at - last < SAME_TAP_MS) {
      return;
    }
    last = at;
    const card = projectCard(state.mountain());
    if (card.kind === "project") {
      void state.progress.dispatch(ORDER_MOVES[card.key.kind]);
    }
  });
  return { key, title, lines };
}

function buildCard(state: FrameState): CardParts {
  const root = el("div", "city-card");
  const head = el("div", "city-card-head");
  const name = el("b", "city-card-name");
  const stepNames = el("span", "city-steps");
  head.append(name, stepNames);
  const body = el("div", "city-card-body");
  const bars = el("div", "city-bars");
  const planning = el("p", "city-planning");
  const order = buildOrderKey(state);
  body.append(bars, planning, order.key);
  const crewRow = el("div", "city-crew");
  const builders = steps("building");
  const crew = el("span", "city-crew-line");
  crewRow.append(builders.minus, builders.plus, crew);
  const completion = el("p", "city-completion");
  root.append(head, body, crewRow, completion);
  return {
    root,
    name,
    steps: stepNames,
    bars,
    planning,
    ...order,
    builders,
    crew,
    completion,
  };
}

function paintBars(
  target: HTMLElement,
  card: ProjectCard & { kind: "project" },
): void {
  if (target.childElementCount !== card.bars.length) {
    target.replaceChildren(
      ...card.bars.map(() => {
        const row = el("div", "city-bar");
        const icon = el("img", "city-bar-icon");
        icon.alt = "";
        const words = el("span", "city-bar-line");
        const track = el("i", "city-bar-track");
        track.append(el("u", ""));
        row.append(icon, words, track);
        return row;
      }),
    );
  }
  card.bars.forEach((bar, at) => {
    const row = target.children[at];
    if (row instanceof HTMLElement && row.dataset["good"] !== bar.good) {
      row.dataset["good"] = bar.good;
      const icon = row.querySelector<HTMLImageElement>(".city-bar-icon");
      if (icon != null) {
        icon.src = priceIcon(bar.good) ?? stoneUrl;
      }
    }
    const words = row?.querySelector<HTMLElement>(".city-bar-line");
    const fill = row?.querySelector<HTMLElement>("u");
    if (words != null && fill != null) {
      write(words, bar.line);
      fill.style.width = `${String(Math.round(bar.share * 1000) / 10)}%`;
    }
  });
}

function paintStepNames(target: HTMLElement, card: ProjectCard): void {
  if (target.childElementCount !== card.steps.length) {
    target.replaceChildren(...card.steps.map(() => el("span", "")));
  }
  card.steps.forEach((step, at) => {
    const span = target.children[at];
    if (span instanceof HTMLElement) {
      write(span, `${step.name}${step.pip === "done" ? " ✓" : ""}`);
      span.dataset["pip"] = step.pip;
    }
  });
}

function paintOrderKey(parts: CardParts, key: OrderKey): void {
  write(parts.title, key.title);
  key.lines.forEach((line, at) => {
    const target = parts.lines[at];
    if (target !== undefined) {
      write(target, line);
    }
  });
  mark(parts.key, "can", key.can);
  mark(parts.key, "run", key.run);
  parts.key.dataset["order"] = key.kind;
  setAttr(parts.key, "aria-label", key.label);
}

function paintCard(
  parts: CardParts,
  card: ProjectCard,
  amount: BuyAmount,
): void {
  write(parts.name, card.name);
  paintStepNames(parts.steps, card);
  write(parts.crew, card.builders.line);
  paintSteps(parts.builders, card.builders, amount);
  const project = card.kind === "project";
  hide(parts.bars, !project);
  hide(parts.key, !project);
  hide(parts.completion, !project);
  hide(parts.planning, project);
  if (!project) {
    write(parts.planning, card.line);
    return;
  }
  paintBars(parts.bars, card);
  paintOrderKey(parts, card.key);
  write(parts.completion, card.completion);
}

/** The city's canvas: its ground once a height, then its moving parts. */
function runCanvas(
  canvas: HTMLCanvasElement,
  shown: () => boolean,
  scene: () => CityScene,
  signal: AbortSignal | undefined,
): void {
  const sprites = loadCitySprites();
  runScene(
    canvas,
    {
      shown,
      ground: paintCityGround,
      draw: (c, clock) => {
        drawCity(c, sprites, scene(), c.canvas.height, clock);
      },
    },
    signal,
  );
}

export function createCitySite(
  state: FrameState,
  signal?: AbortSignal,
): CitySite {
  const root = el("section", "city");
  root.setAttribute("aria-label", "The city");
  root.style.setProperty("--city-card", String(CITY_FOOT.card));
  root.style.setProperty("--city-tags", String(CITY_FOOT.tags));
  const canvas = el("canvas", "city-canvas");
  canvas.setAttribute("aria-hidden", "true");
  const plate = buildPlate(state);
  const tags = buildTags();
  const note = el("p", "city-note", NO_FREE_WORKER);
  note.hidden = true;
  const card = buildCard(state);
  // Under the transport plate, over the sky: never over the plots' names (#715).
  plate.root.append(note);
  root.append(canvas, plate.root, tags.root, card.root);
  listenSteps(root, state, note);
  let scene = cityScene(state.mountain());
  let visible = false;
  runCanvas(
    canvas,
    () => visible,
    () => scene,
    signal,
  );
  return {
    root,
    paint: (mountain, shown, now) => {
      visible = shown;
      hide(root, !shown);
      if (!shown) {
        hide(note, true);
        return;
      }
      scene = cityScene(mountain, now);
      const amount = state.amount();
      paintPlate(plate, mountain, amount);
      plots(mountain).forEach((plot, at) => {
        const tag = tags.tags[at];
        if (tag !== undefined) {
          write(tag.name, plot.name);
          write(tag.state, plot.state);
        }
      });
      const view = projectCard(mountain, now);
      if (view.builders.canPlace || transportPlate(mountain).steps.canPlace) {
        hide(note, true);
      }
      paintCard(card, view, amount);
    },
  };
}
