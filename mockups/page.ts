import { formatCount } from "../src/format.ts";
import {
  BENCH_BUSY,
  BENCH_BUSY_ASIDE,
  BENCH_FREE,
  BENCH_FREE_ASIDE,
  CRAFT_DONE,
  CRAFT_DONE_BUTTON,
  LAYER_ADVICE,
  LAYER_ARRIVAL,
  LAYER_DIG,
  LAYER_EVOCATIVE,
  MOCK_MATERIALS,
  MOCK_RECIPES,
  RECIPE_ON_BENCH,
  RECIPE_WAITING,
  UNFOUND_HINT,
  WORKSHOP_TITLE,
  craftPriceWords,
  fieldLogClose,
} from "../src/screen-words.ts";

/**
 * Static M9-2 mock (#193). Not the game screen. M9-8 builds that from these
 * sheets once Flemming approves them.
 */

const SCENES = ["workshop", "layer", "mountain", "craft-done"] as const;
const PHASES = ["rest", "press", "float", "hammer", "busy"] as const;

type MockScene = (typeof SCENES)[number];
type MockPhase = (typeof PHASES)[number];

export type MockView = {
  readonly scene: MockScene;
  readonly phase: MockPhase;
  readonly control: string;
  readonly shot: boolean;
};

const ORE = "/src/assets/ore-lump.png";
const HAMMER = "/src/assets/relics/hammer.png";
const MOUNTAIN = "/src/assets/mountain.png";
const LANTERN = "/src/assets/relics/lantern.png";
const CART = "/src/assets/mine-cart.png";

/** Just inside the Granite: 10M mined of the 240M mountain. */
const STONES_LEFT = formatCount(230_000_000);
/** Enough in the pocket to start the 4.2M rails. */
const POCKET = formatCount(6_400_000);

const TIERS = [
  { name: "Worker", art: "/src/assets/helper-miner.png", rate: "1/s" },
  { name: "Cart", art: CART, rate: "10/s" },
  { name: "Drill", art: "/src/assets/steam-drill.png", rate: "60/s" },
] as const;

const BACK_TAP =
  "Presses in, then the sheet closes back to the mountain. No materials move. No hammer. Silent until unmuted.";
const DIG_TAP =
  "Presses in, then the card closes and the dig goes on. Silent until unmuted.";
const DONE_TAP = "Presses in, then the notice closes. Silent until unmuted.";
const ON_BENCH_TAP =
  "Presses in. The rails are already underway, so the hammer stays quiet. Silent until unmuted.";
const WAITING_TAP =
  "Presses in, but the bench is already making Iron rails, so this one waits its turn. Silent until unmuted.";

function isScene(value: string): value is MockScene {
  return (SCENES as readonly string[]).includes(value);
}

function isPhase(value: string): value is MockPhase {
  return (PHASES as readonly string[]).includes(value);
}

export function parseMockView(search: string): MockView {
  const params = new URLSearchParams(search);
  const scene = params.get("scene") ?? "workshop";
  const phase = params.get("phase") ?? "rest";
  if (!isScene(scene)) {
    throw new Error(`Unknown mock scene ${scene}`);
  }
  if (!isPhase(phase)) {
    throw new Error(`Unknown mock phase ${phase}`);
  }
  return {
    scene,
    phase,
    control: params.get("control") ?? "",
    shot: params.get("shot") === "1",
  };
}

/** Spelled-out craft tap: press-in, materials float, a short hammer tap. */
export function craftTap(materials: readonly string[]): string {
  const first = materials[0];
  if (first === undefined) {
    throw new Error("A craft needs a material");
  }
  const rest = materials.slice(1);
  const list =
    rest.length === 0
      ? first
      : `${materials.slice(0, -1).join(", ")} and ${rest[rest.length - 1] ?? ""}`;
  const verb = materials.length === 1 ? "floats" : "float";
  return `Presses in. ${list} ${verb} from the material line to the bench. A short hammer tap plays on the bench. Silent until unmuted.`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function oreIcon(id: "clay" | "iron"): string {
  return `<img class="mat mat-${id}" src="${ORE}" alt="" />`;
}

function materialLine(): string {
  const parts = MOCK_MATERIALS.map(
    (material) =>
      `${oreIcon(material.id)}<span class="label">${escapeHtml(material.text)}</span>`,
  );
  return `<p class="materials">${parts.join('<span class="label dot">·</span>')}</p>`;
}

function pressClass(view: MockView, control: string): string {
  return view.phase === "press" && view.control === control
    ? " is-pressed"
    : "";
}

function renderWorkshop(view: MockView): string {
  const busy = view.phase === "busy";
  const benchLine = busy ? BENCH_BUSY : BENCH_FREE;
  const aside = busy ? BENCH_BUSY_ASIDE : BENCH_FREE_ASIDE;
  const bar = busy
    ? `<div class="bar" role="img" aria-label="${escapeHtml(BENCH_BUSY)}"><span></span></div>`
    : "";
  const cards = MOCK_RECIPES.map((recipe) => {
    const onBench = busy && recipe.id === "rails";
    const label = busy
      ? onBench
        ? RECIPE_ON_BENCH
        : RECIPE_WAITING
      : craftPriceWords(recipe.stones);
    const tap = busy
      ? onBench
        ? ON_BENCH_TAP
        : WAITING_TAP
      : craftTap(recipe.materials.map((material) => material.text));
    const cost = `${recipe.materials
      .map(
        (material) =>
          `${oreIcon(material.id)}<span class="label">${escapeHtml(material.text)}</span>`,
      )
      .join(
        '<span class="label dot">·</span>',
      )}<span class="label dot">·</span><span class="label">${escapeHtml(recipe.time)}</span>`;
    return `<article class="recipe card">
      <h2 class="label">${escapeHtml(recipe.name)}</h2>
      <p class="label effect">${escapeHtml(recipe.effect)}</p>
      <p class="cost">${cost}</p>
      <button type="button" class="craft${pressClass(view, recipe.id)}" data-craft="${recipe.id}" data-tap="${escapeHtml(tap)}"${busy ? " disabled" : ""}>${escapeHtml(label)}</button>
    </article>`;
  }).join("");
  const chips =
    view.phase === "float"
      ? MOCK_RECIPES.filter(
          (recipe) => view.control === "" || view.control === recipe.id,
        )
          .map((recipe) =>
            recipe.materials
              .map(
                (material) =>
                  `<span class="float-chip card">${oreIcon(material.id)}<span class="label">${escapeHtml(material.text)}</span></span>`,
              )
              .join(""),
          )
          .join("")
      : "";
  return `<section class="workshop card">
    <h1 class="label">${escapeHtml(WORKSHOP_TITLE)}</h1>
    ${materialLine()}
    <div class="bench">
      <p class="label">${escapeHtml(benchLine)}</p>
      <p class="label aside">${escapeHtml(aside)}</p>
      ${bar}
      <img class="hammer" src="${HAMMER}" alt="" />
    </div>
    <div class="recipes">
      ${cards}
      <article class="recipe card is-hidden-recipe">
        <img class="shade" src="${ORE}" alt="" />
        <p class="label hint">${escapeHtml(UNFOUND_HINT)}</p>
      </article>
    </div>
    <button type="button" class="back${pressClass(view, "back")}" data-tap="${escapeHtml(BACK_TAP)}">${escapeHtml(fieldLogClose)}</button>
    <div class="floats">${chips}</div>
  </section>`;
}

function renderMountain(): string {
  const tiers = TIERS.map(
    (tier) => `<div class="tier card">
      <img src="${tier.art}" alt="" />
      <span class="label">${escapeHtml(tier.name)}</span>
      <span class="label">${escapeHtml(tier.rate)}</span>
    </div>`,
  ).join("");
  return `<section class="mountain-screen">
    <header class="top">
      <img class="lantern" src="${LANTERN}" alt="" />
      <p class="label stones">${escapeHtml(STONES_LEFT)} stones left</p>
    </header>
    <img class="peak" src="${MOUNTAIN}" alt="" />
    <div class="pocket-row">
      <p class="label pocket">${escapeHtml(POCKET)} stones</p>
      <img class="mini" src="/src/assets/upgrades-icon.png" alt="" />
      <img class="mini" src="/src/assets/helper-miner.png" alt="" />
    </div>
    ${materialLine()}
    <div class="tiers">${tiers}</div>
  </section>`;
}

function renderLayer(view: MockView): string {
  return `${renderMountain()}
  <div class="overlay">
    <div class="scrim"></div>
    <article class="card layer-card">
      <img class="layer-art" src="${MOUNTAIN}" alt="" />
      <h1 class="label">${escapeHtml(LAYER_ARRIVAL)}</h1>
      <p class="label">${escapeHtml(LAYER_EVOCATIVE)}</p>
      <p class="label advice">${escapeHtml(LAYER_ADVICE)}</p>
      <button type="button" class="go${pressClass(view, "dig")}" data-tap="${escapeHtml(DIG_TAP)}">${escapeHtml(LAYER_DIG)}</button>
    </article>
  </div>`;
}

function renderCraftDone(view: MockView): string {
  return `${renderMountain()}
  <div class="overlay">
    <div class="scrim"></div>
    <article class="card notice-card">
      <img class="notice-art" src="${CART}" alt="" />
      <p class="label">${escapeHtml(CRAFT_DONE)}</p>
      <button type="button" class="go${pressClass(view, "done")}" data-tap="${escapeHtml(DONE_TAP)}">${escapeHtml(CRAFT_DONE_BUTTON)}</button>
    </article>
  </div>`;
}

export function renderMock(view: MockView): string {
  switch (view.scene) {
    case "workshop":
      return renderWorkshop(view);
    case "layer":
      return renderLayer(view);
    case "mountain":
      return renderMountain();
    case "craft-done":
      return renderCraftDone(view);
    default: {
      const never: never = view.scene;
      return never;
    }
  }
}

function mount(root: HTMLElement, view: MockView): void {
  const classes = [`scene-${view.scene}`, `phase-${view.phase}`];
  if (view.shot) {
    classes.push("shot");
  }
  if (view.control !== "") {
    classes.push(`control-${view.control}`);
  }
  root.className = classes.join(" ");
  root.dataset.scene = view.scene;
  root.dataset.phase = view.phase;
  root.innerHTML = renderMock(view);
  root.dataset.ready = "1";
}

const root = document.querySelector("#mock");
if (root instanceof HTMLElement) {
  mount(root, parseMockView(window.location.search));
}
