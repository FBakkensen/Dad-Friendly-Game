import clayUrl from "./assets/board/res-clay.png";
import ironUrl from "./assets/board/res-iron.png";
import stoneUrl from "./assets/board/res-stone.png";
import { el, hide, icon, mark, setAttr, write } from "./board-dom";
import type { BlueprintId } from "./factory";
import {
  drawFactory,
  loadFactorySprites,
  paintBench,
  paintBlueprintIcon,
  type FactoryScene,
} from "./factory-scene";
import {
  factoryView,
  type Bin,
  type BlueprintCard,
  type FactoryView,
  type StationView,
} from "./factory-view";
import type { FrameState } from "./frame-state";
import type { Mountain } from "./mountain";
import { runScene } from "./scene-paint";
import type { GoodId } from "./stock";
import "./factory.css";

/**
 * The factory on slice 1's frame (#681; spec, The factory): the bench seen
 * from above on its canvas, the head with what is installed, a bin for each
 * material, the station with the work order on it, and the blueprints under
 * it. A drag up onto the station places a work order, and so does a tap.
 * It paints the pure view (factory-view) and changes the game only through
 * `progress.dispatch`. The factory takes no workers in slice 1, so it has
 * no − and +.
 */

export type FactorySite = {
  readonly root: HTMLElement;
  readonly paint: (mountain: Mountain, shown: boolean, now?: number) => void;
};

const GOOD_ICONS: Readonly<Partial<Record<GoodId, string>>> = {
  stones: stoneUrl,
  clay: clayUrl,
  iron: ironUrl,
};

type HeadParts = {
  readonly root: HTMLElement;
  readonly installed: HTMLElement;
  readonly timers: HTMLElement;
};

function buildHead(): HeadParts {
  const root = el("div", "factory-head");
  const installed = el("p", "factory-installed");
  const timers = el("p", "factory-timers");
  root.append(installed, timers);
  return { root, installed, timers };
}

function paintHead(parts: HeadParts, view: FactoryView): void {
  write(parts.installed, view.installed);
  hide(parts.timers, view.timers.length === 0);
  write(parts.timers, view.timers.join(" · "));
}

function paintBins(labels: readonly HTMLElement[], bins: readonly Bin[]): void {
  for (const [at, label] of labels.entries()) {
    const bin = bins[at];
    write(label, bin?.text ?? "");
    setAttr(label, "data-good", bin?.good);
  }
}

type StationParts = {
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly line: HTMLElement;
  readonly goods: HTMLElement;
  readonly percent: HTMLElement;
  readonly keys: HTMLElement;
  readonly install: HTMLButtonElement;
  readonly cancel: HTMLButtonElement;
  readonly cancelVerb: HTMLElement;
  readonly cancelWhat: HTMLElement;
};

function buildStation(state: FrameState): StationParts {
  const root = el("div", "factory-station");
  root.setAttribute("aria-label", "The station");
  const title = el("p", "factory-station-title");
  const line = el("p", "factory-station-line");
  const goods = el("div", "factory-goods");
  const percent = el("p", "factory-percent board-num");
  const keys = el("div", "factory-keys");
  const install = el("button", "factory-install");
  install.type = "button";
  const cancel = el("button", "factory-cancel");
  cancel.type = "button";
  const cancelVerb = el("b", "");
  const cancelWhat = el("small", "");
  cancel.append(cancelVerb, cancelWhat);
  keys.append(install, cancel);
  root.append(title, line, goods, percent, keys);
  install.addEventListener("click", () => {
    const station = factoryView(state.mountain()).station;
    if (station.kind === "done" && station.installable) {
      void state.progress.dispatch({ kind: "installWorkOrder" });
    }
  });
  cancel.addEventListener("click", () => {
    if (state.mountain().station.kind !== "idle") {
      void state.progress.dispatch({ kind: "cancelWorkOrder" });
    }
  });
  return {
    root,
    title,
    line,
    goods,
    percent,
    keys,
    install,
    cancel,
    cancelVerb,
    cancelWhat,
  };
}

function paintGoods(target: HTMLElement, view: StationView): void {
  const lines = view.kind === "delivering" ? view.goods : [];
  while (target.children.length > lines.length) {
    target.lastElementChild?.remove();
  }
  while (target.children.length < lines.length) {
    target.append(el("p", "factory-good"));
  }
  for (const [at, good] of lines.entries()) {
    const row = target.children[at] as HTMLElement;
    write(row, good.text);
    setAttr(row, "data-good", good.good);
    mark(row, "in", good.share >= 1);
  }
}

function paintStation(parts: StationParts, view: StationView): void {
  setAttr(parts.root, "data-station", view.kind);
  write(parts.title, view.title);
  write(parts.line, view.line);
  paintGoods(parts.goods, view);
  hide(parts.percent, view.kind !== "delivering");
  write(parts.percent, view.kind === "delivering" ? view.percent : "");
  hide(parts.keys, view.kind === "idle");
  hide(parts.install, view.kind !== "done" || !view.installable);
  write(parts.install, view.kind === "done" ? view.install : "");
  setAttr(
    parts.install,
    "aria-label",
    view.kind === "done"
      ? `${view.install} the ${view.title.replace(/: complete$/, "").toLowerCase()}`
      : undefined,
  );
  // "Cancel" on the key, and what it does under it.
  const [verb = "", what = ""] =
    view.kind === "idle" ? [] : view.cancel.split(" · ");
  write(parts.cancelVerb, verb);
  write(parts.cancelWhat, what);
  setAttr(
    parts.cancel,
    "aria-label",
    view.kind === "idle" ? undefined : `${verb} the work order: ${what}`,
  );
}

type CardParts = {
  readonly root: HTMLButtonElement;
  readonly level: HTMLElement;
  readonly effect: HTMLElement;
  readonly requires: HTMLElement;
};

function buildCard(id: BlueprintId, name: string): CardParts {
  const root = el("button", "factory-card");
  root.type = "button";
  root.dataset["blueprint"] = id;
  const drawing = el("canvas", "factory-card-icon");
  drawing.width = 24;
  drawing.height = 24;
  drawing.setAttribute("aria-hidden", "true");
  const c = drawing.getContext("2d");
  if (c !== null) {
    paintBlueprintIcon(c, id);
  }
  const level = el("span", "factory-card-level board-num");
  const effect = el("span", "factory-card-effect");
  const requires = el("span", "factory-card-requires");
  root.append(
    drawing,
    level,
    el("b", "factory-card-name", name),
    effect,
    requires,
  );
  return { root, level, effect, requires };
}

function paintRequires(target: HTMLElement, card: BlueprintCard): void {
  const key =
    card.line === ""
      ? card.requires
          .map((r) => `${r.good}:${r.text}:${String(r.short)}`)
          .join(",")
      : card.line;
  if (target.dataset["key"] === key) {
    return;
  }
  target.dataset["key"] = key;
  if (card.line !== "") {
    target.replaceChildren(card.line);
    return;
  }
  target.replaceChildren(
    ...card.requires.map((need) => {
      const part = el(
        "span",
        need.short ? "factory-need short" : "factory-need",
      );
      part.append(need.text);
      const url = GOOD_ICONS[need.good];
      if (url !== undefined) {
        part.append(icon(url, "factory-need-icon"));
      }
      return part;
    }),
  );
}

function paintCard(parts: CardParts, card: BlueprintCard): void {
  write(parts.level, card.level);
  hide(parts.level, card.level === "");
  write(parts.effect, card.effect);
  paintRequires(parts.requires, card);
  setAttr(parts.root, "data-state", card.state);
  setAttr(parts.root, "aria-label", card.label);
  setAttr(
    parts.root,
    "aria-disabled",
    card.state === "open" ? undefined : "true",
  );
}

/**
 * How much the board is scaled on screen: a phone narrower than the board
 * zooms it, and the finger moves in screen px.
 */
function boardScale(card: HTMLElement): number {
  const shown = card.getBoundingClientRect().width;
  return card.offsetWidth > 0 && shown > 0 ? shown / card.offsetWidth : 1;
}

/**
 * The copy of a card that follows the finger: a picture of it, not a second
 * button, with its drawing painted again (a clone's canvas is blank).
 */
function ghostOf(card: HTMLElement, id: BlueprintId): HTMLElement {
  const ghost = card.cloneNode(true) as HTMLElement;
  ghost.classList.add("factory-ghost");
  ghost.removeAttribute("data-blueprint");
  ghost.removeAttribute("aria-label");
  ghost.removeAttribute("aria-disabled");
  ghost.setAttribute("aria-hidden", "true");
  const drawing = ghost.querySelector("canvas");
  const c = drawing?.getContext("2d") ?? null;
  if (c !== null) {
    paintBlueprintIcon(c, id);
  }
  return ghost;
}

/** How far a finger moves before a press is a drag, in px. */
const DRAG_FROM = 10;

/**
 * A blueprint dragged up onto the station places its work order. The strip
 * scrolls sideways itself (`touch-action: pan-x`), so only an upward drag
 * is taken; a copy of the card follows the finger, over the strip's clip.
 */
function listenDrag(
  site: HTMLElement,
  station: HTMLElement,
  card: HTMLButtonElement,
  place: () => void,
): void {
  const blueprint = card.dataset["blueprint"] as BlueprintId;
  let start: { x: number; y: number; id: number } | undefined;
  let ghost: HTMLElement | undefined;
  let scale = 1;
  let moved = false;
  const drop = (): void => {
    ghost?.remove();
    ghost = undefined;
    start = undefined;
  };
  card.addEventListener("pointerdown", (event) => {
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    moved = false;
  });
  card.addEventListener("pointermove", (event) => {
    if (start === undefined || event.pointerId !== start.id) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    // A press that moved is no tap, whichever way it went.
    moved ||= Math.hypot(dx, dy) >= DRAG_FROM;
    if (ghost === undefined) {
      if (-dy < DRAG_FROM || Math.abs(dx) > -dy) {
        return;
      }
      if (card.dataset["state"] !== "open") {
        return;
      }
      card.setPointerCapture(event.pointerId);
      scale = boardScale(card);
      ghost = ghostOf(card, blueprint);
      const box = card.getBoundingClientRect();
      const home = site.getBoundingClientRect();
      ghost.style.left = `${String((box.left - home.left) / scale)}px`;
      ghost.style.top = `${String((box.top - home.top) / scale)}px`;
      ghost.style.width = `${String(box.width / scale)}px`;
      site.append(ghost);
    }
    ghost.style.transform = `translate(${String(dx / scale)}px, ${String(dy / scale)}px) rotate(-3deg)`;
  });
  card.addEventListener("pointerup", (event) => {
    if (ghost !== undefined) {
      const box = station.getBoundingClientRect();
      if (
        event.clientX >= box.left &&
        event.clientX <= box.right &&
        event.clientY >= box.top &&
        event.clientY <= box.bottom
      ) {
        place();
      }
    }
    drop();
  });
  card.addEventListener("pointercancel", drop);
  card.addEventListener("click", () => {
    // A drag or a scroll that ended is not also a tap.
    if (moved) {
      moved = false;
      return;
    }
    place();
  });
}

function buildStrip(
  state: FrameState,
  site: HTMLElement,
  station: HTMLElement,
): { readonly root: HTMLElement; readonly cards: readonly CardParts[] } {
  const root = el("div", "factory-strip");
  root.setAttribute("aria-label", "Blueprints");
  const cards = factoryView(state.mountain()).blueprints.map((blueprint) => {
    const parts = buildCard(blueprint.id, blueprint.name);
    listenDrag(site, station, parts.root, () => {
      const now = factoryView(state.mountain()).blueprints.find(
        (each) => each.id === blueprint.id,
      );
      if (now?.state === "open") {
        void state.progress.dispatch({
          kind: "placeWorkOrder",
          blueprint: blueprint.id,
        });
      }
    });
    root.append(parts.root);
    return parts;
  });
  return { root, cards };
}

/** What the canvas draws, from the view and the stock. */
function sceneOf(mountain: Mountain, view: FactoryView): FactoryScene {
  const station = view.station;
  return {
    clay: Math.floor(mountain.stock.clay),
    iron: Math.floor(mountain.stock.iron),
    order:
      station.kind === "idle"
        ? undefined
        : {
            blueprint: station.blueprint,
            share: station.kind === "done" ? 1 : station.share,
          },
  };
}

export function createFactorySite(
  state: FrameState,
  signal?: AbortSignal,
): FactorySite {
  const root = el("section", "factory");
  root.setAttribute("aria-label", "The factory");
  const canvas = el("canvas", "factory-canvas");
  canvas.setAttribute("aria-hidden", "true");
  const head = buildHead();
  const labels = [el("p", "factory-bin"), el("p", "factory-bin")];
  const station = buildStation(state);
  const strip = buildStrip(state, root, station.root);
  root.append(canvas, head.root, ...labels, station.root, strip.root);
  let scene: FactoryScene = { clay: 0, iron: 0, order: undefined };
  let visible = false;
  const sprites = loadFactorySprites();
  runScene(
    canvas,
    {
      shown: () => visible,
      ground: paintBench,
      draw: (c, clock) => {
        drawFactory(c, sprites, scene, canvas.height, clock);
      },
    },
    signal,
  );
  return {
    root,
    paint: (mountain, shown, now) => {
      visible = shown;
      hide(root, !shown);
      if (!shown) {
        return;
      }
      const view = factoryView(mountain, now);
      scene = sceneOf(mountain, view);
      paintHead(head, view);
      paintBins(labels, view.bins);
      paintStation(station, view.station);
      for (const [at, parts] of strip.cards.entries()) {
        const card = view.blueprints[at];
        if (card !== undefined) {
          paintCard(parts, card);
        }
      }
    },
  };
}
