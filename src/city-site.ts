import stoneUrl from "./assets/board/res-stone.png";
import { el, hide, mark, setAttr, write } from "./board-dom";
import { vehicleBuyMove, type Move } from "./economy/actions";
import {
  CITY_FOOT,
  drawCity,
  loadCitySprites,
  paintCityGround,
  plotSpans,
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
} from "./city-view";
import type { FrameState } from "./frame-state";
import { listenSteps, paintSteps, stepper } from "./job-steps";
import { buildKeyFace, paintMachineKey, type KeyParts } from "./mine-site";
import type { Mountain } from "./mountain";
import { slice2Part1On } from "./part-switch";
import { priceIcon } from "./price-icons";
import { researchDoorView, type ResearchDoorView } from "./research-view";
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

type PlateParts = {
  readonly root: HTMLElement;
  readonly drivers: HTMLElement;
  readonly state: HTMLElement;
  readonly fleet: HTMLElement;
  readonly steps: Steps;
  /** A key for each vehicle, in the order they open. */
  readonly keys: ReadonlyMap<VehicleId, KeyParts>;
  /** The dark cell in the trucks' key's place while the Warehouse is in hand (#754). */
  readonly hint: HTMLElement;
};

/** A key for `id` in the mine keys' form, hidden until the view offers it; a tap buys what the view offers. */
function buildVehicleKey(state: FrameState, id: VehicleId): KeyParts {
  const parts = buildKeyFace("city-key", () => {
    const offer = vehicleKeys(state.mountain(), state.amount()).find(
      (each) => each.id === id,
    );
    if (offer !== undefined && offer.can) {
      void state.progress.dispatch(vehicleBuyMove(offer.id, offer.count));
    }
  });
  parts.root.dataset["vehicle"] = id;
  parts.root.hidden = true;
  return parts;
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
  const keys = new Map(
    VEHICLE_IDS.map((id) => [id, buildVehicleKey(state, id)] as const),
  );
  const hint = el("div", "city-hint");
  hint.hidden = true;
  row.append(
    driving.minus,
    driving.plus,
    ...[...keys.values()].map((key) => key.root),
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
  for (const [id, target] of parts.keys) {
    const key = offered.find((each) => each.id === id);
    hide(target.root, key === undefined);
    if (key !== undefined) {
      paintMachineKey(target, key, key.good);
    }
  }
  const hint = vehicleHint(mountain);
  hide(parts.hint, hint === undefined);
  write(parts.hint, hint ?? "");
}

type TagParts = {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly state: HTMLElement;
};

function buildTags(): {
  readonly root: HTMLElement;
  readonly tags: TagParts[];
} {
  return { root: el("div", "city-tags"), tags: [] };
}

function syncTags(
  container: { readonly root: HTMLElement; readonly tags: TagParts[] },
  count: number,
): void {
  while (container.tags.length < count) {
    const tag = el("div", "city-tag");
    const name = el("b", "");
    const state = el("small", "");
    tag.append(name, state);
    container.root.append(tag);
    container.tags.push({ root: tag, name, state });
  }
  while (container.tags.length > count) {
    container.tags.pop()?.root.remove();
  }
}

type ResearchDoorParts = {
  readonly root: HTMLButtonElement;
  readonly lamp: HTMLElement;
  readonly counts: HTMLElement;
  readonly status: HTMLElement;
};

function buildResearchDoor(state: FrameState): ResearchDoorParts {
  const root = el("button", "city-research-door");
  root.type = "button";
  root.hidden = true;
  const info = el("span", "city-research-info");
  const head = el("span", "city-research-head");
  const lamp = el("i", "frame-lamp");
  const counts = el("span", "city-research-counts board-num");
  head.append(el("b", "city-research-name", "Research Lab"), counts, lamp);
  const status = el("span", "city-research-status");
  info.append(head, status);
  const open = el("span", "city-research-open", "Research");
  root.append(info, open);
  root.addEventListener("click", () => {
    state.openResearch();
  });
  return { root, lamp, counts, status };
}

function paintResearchDoor(
  parts: ResearchDoorParts,
  door: ResearchDoorView,
): void {
  hide(parts.root, !door.open);
  if (!door.open) {
    return;
  }
  write(parts.counts, `${String(door.doneCount)}/${String(door.totalCount)}`);
  write(parts.status, door.status);
  setAttr(parts.lamp, "data-lamp", door.lamp);
  mark(parts.root, "ready", door.lamp === "green");
  setAttr(parts.root, "aria-label", door.label);
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
  target.dataset["bars"] = String(card.bars.length);
  if (target.childElementCount !== card.bars.length) {
    target.replaceChildren(
      ...card.bars.map(() => {
        const row = el("div", "city-bar");
        const icon = el("img", "city-bar-icon");
        icon.alt = "";
        const words = el("span", "city-bar-line");
        const track = el("i", "city-bar-track");
        track.append(el("u", ""));
        const site = el("small", "city-bar-site");
        site.hidden = true;
        row.append(icon, words, track, site);
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
    const site = row?.querySelector<HTMLElement>(".city-bar-site");
    if (words != null && fill != null) {
      write(words, bar.line);
      fill.style.width = `${String(Math.round(bar.share * 1000) / 10)}%`;
    }
    if (site != null) {
      hide(site, bar.onSite === undefined);
      write(site, bar.onSite ?? "");
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

/** The city's canvas: its ground once a height and card height, then its moving parts. */
function runCanvas(
  canvas: HTMLCanvasElement,
  shown: () => boolean,
  scene: () => CityScene,
  cardHeight: () => number,
  signal: AbortSignal | undefined,
): void {
  const sprites = loadCitySprites();
  runScene(
    canvas,
    {
      shown,
      ground: (c, height) => {
        paintCityGround(c, height, cardHeight());
      },
      layout: cardHeight,
      draw: (c, clock) => {
        drawCity(c, sprites, scene(), c.canvas.height, clock, cardHeight());
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
  const door = buildResearchDoor(state);
  const tags = buildTags();
  const note = el("p", "city-note", NO_FREE_WORKER);
  note.hidden = true;
  const card = buildCard(state);
  // Under the transport plate, over the sky: never over the plots' names (#715).
  plate.root.append(note);
  root.append(canvas, plate.root, door.root, tags.root, card.root);
  listenSteps(root, state, note);
  let scene = cityScene(state.mountain());
  let cardHeight: number = CITY_FOOT.card;
  let visible = false;
  runCanvas(
    canvas,
    () => visible,
    () => scene,
    () => cardHeight,
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
      const slice2 = slice2Part1On();
      hide(plate.root, slice2);
      if (slice2 && note.parentElement !== root) {
        root.append(note);
      } else if (!slice2 && note.parentElement !== plate.root) {
        plate.root.append(note);
      }
      const doorView = researchDoorView(mountain);
      paintResearchDoor(door, doorView);
      mark(root, "has-research-door", doorView.open);
      const view = projectCard(mountain, now);
      const threeBars = view.kind === "project" && view.bars.length >= 3;
      cardHeight = threeBars ? CITY_FOOT.cardThree : CITY_FOOT.card;
      root.style.setProperty("--city-card", String(cardHeight));
      mark(root, "three-bars", threeBars);
      scene = cityScene(mountain, now);
      const amount = state.amount();
      if (!slice2) {
        paintPlate(plate, mountain, amount);
      }
      const shownPlots = plots(mountain);
      const spans = plotSpans(shownPlots.length);
      syncTags(tags, shownPlots.length);
      tags.tags.forEach((tag, at) => {
        const plot = shownPlots[at];
        const span = spans[at];
        if (plot !== undefined && span !== undefined) {
          tag.root.style.setProperty("--x", String(span.x));
          tag.root.style.setProperty("--w", String(span.w));
          write(tag.name, plot.name);
          write(tag.state, plot.state);
        }
      });
      if (
        view.builders.canPlace ||
        (!slice2 && transportPlate(mountain).steps.canPlace)
      ) {
        hide(note, true);
      }
      paintCard(card, view, amount);
    },
  };
}
