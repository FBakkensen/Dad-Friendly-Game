import { formatCompact } from "../src/format.ts";
import { formatClock } from "../src/screen-words.ts";
import { tierById, tierCost, type TierId } from "../src/tiers.ts";

/**
 * M10-3 component mocks (#235). Not the game. One card, three buttons,
 * chips, timers, a notice, a dot badge, an info button, and How it works.
 * Every size and colour comes from src/tokens.css.
 */

export type PartsView = {
  readonly phase: string;
  readonly control: string;
};

const POCKET = 2_000_000;

const ART = {
  helper: "/src/assets/helper-miner.png",
  cart: "/src/assets/mine-cart.png",
  drill: "/src/assets/steam-drill.png",
  borer: "/src/assets/tunnel-borer.png",
  machine: "/src/assets/great-machine.png",
  kid: "/src/assets/kid-helper.png",
  pick: "/src/assets/pick.png",
  boot: "/src/assets/boot-tile.png",
  gold: "/src/assets/gold-nugget.png",
  ore: "/src/assets/ore-lump.png",
  hammer: "/src/assets/relics/hammer.png",
  lantern: "/src/assets/relics/lantern.png",
  upgrades: "/src/assets/upgrades-icon.png",
  mountain: "/src/assets/mountain.png",
  map: "/src/assets/worn-map.png",
} as const;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tap(action: string): string {
  return `Presses in. ${action} Silent until unmuted.`;
}

function pressed(view: PartsView, control: string): string {
  return view.phase === "press" && view.control === control
    ? " is-pressed"
    : "";
}

function icon(src: string, extra = ""): string {
  return `<img class="kit-icon${extra}" src="${src}" alt="" />`;
}

type CardState = "ready" | "dear" | "locked";

type CardSpec = {
  readonly id: TierId;
  readonly owned: number;
  readonly adds: string;
  readonly why: string;
  readonly state: CardState;
  readonly unlock?: string;
};

const CARDS: readonly CardSpec[] = [
  {
    id: "cart",
    owned: 12,
    adds: "+15/s each",
    why: "Hauls the loose rock away.",
    state: "ready",
  },
  {
    id: "drill",
    owned: 8,
    adds: "+198/s each",
    why: "Bites straight into granite.",
    state: "dear",
  },
  {
    id: "borer",
    owned: 0,
    adds: "",
    why: "",
    state: "locked",
    unlock: "Opens deeper in the mountain.",
  },
];

/** The one card. Icon left, then name and price, the gain, the crew it needs, why. */
function kitCard(view: PartsView, spec: CardSpec): string {
  const tier = tierById(spec.id);
  const name = tier.shortName;
  const art = ART[spec.id];
  if (spec.state === "locked") {
    return `<button type="button" class="card kit-card is-locked" data-card="${spec.id}" data-tap="${escapeHtml(tap(`Nothing to buy yet. ${spec.unlock ?? ""}`))}" disabled>
      ${icon(art, " is-shade")}
      <span class="kit-card-body">
        <span class="kit-card-head"><span class="kit-card-title">Not found yet</span></span>
        <span class="kit-card-line">${escapeHtml(spec.unlock ?? "")}</span>
      </span>
    </button>`;
  }
  const price = formatCompact(tierCost(tier, spec.owned));
  const dear = spec.state === "dear";
  const action = dear
    ? `${price} is more than the pocket holds, so the ${name.toLowerCase()} waits.`
    : `Buys one more ${name.toLowerCase()} for ${price}.`;
  const needs =
    tier.staff > 0
      ? ` · Needs ${String(tier.staff)} ${tier.staff === 1 ? "worker" : "workers"}`
      : "";
  return `<button type="button" class="card kit-card${dear ? " is-dear" : ""}${pressed(view, spec.id)}" data-card="${spec.id}" data-tap="${escapeHtml(tap(action))}"${dear ? " disabled" : ""}>
    ${icon(art)}
    <span class="kit-card-body">
      <span class="kit-card-head"><span class="kit-card-title">${escapeHtml(name)} <span class="kit-count">×${escapeHtml(formatCompact(spec.owned))}</span></span><span class="kit-card-price">${escapeHtml(price)}</span></span>
      <span class="kit-card-line">${escapeHtml(spec.adds)}${escapeHtml(needs)}</span>
      <span class="kit-card-line kit-quiet">${escapeHtml(spec.why)}</span>
    </span>
  </button>`;
}

export function renderPartsCards(view: PartsView): string {
  const cards = CARDS.map((spec) => kitCard(view, spec)).join("");
  return `<section class="kit-screen">
    <h1 class="kit-title">Card</h1>
    <p class="kit-caption">Ready · Not enough stones yet · Locked</p>
    <p class="kit-caption">Pocket ${escapeHtml(formatCompact(POCKET))} stones</p>
    <div class="kit-stack">${cards}</div>
  </section>`;
}

type TimerSpec = {
  readonly id: string;
  readonly name: string;
  readonly art: string;
  readonly times: string;
  readonly ms: number;
};

const TIMERS: readonly TimerSpec[] = [
  {
    id: "picks",
    name: "Sharper picks",
    art: ART.pick,
    times: "×2",
    ms: 299_000,
  },
  { id: "boots", name: "Quick boots", art: ART.boot, times: "×3", ms: 62_000 },
  { id: "vein", name: "Golden vein", art: ART.gold, times: "×7", ms: 18_000 },
  {
    id: "lamp",
    name: "Miner's lamp",
    art: ART.lantern,
    times: "×2",
    ms: 1_800_000,
  },
  { id: "crew", name: "Overtime", art: ART.helper, times: "×2", ms: 540_000 },
  {
    id: "drill",
    name: "Drill rush",
    art: ART.drill,
    times: "×4",
    ms: 3_725_000,
  },
];

function timerChip(view: PartsView, timer: TimerSpec): string {
  const left = formatClock(timer.ms);
  return `<button type="button" class="kit-timer${pressed(view, timer.id)}" data-timer="${timer.id}" data-tap="${escapeHtml(tap(`Shows the name, ${timer.name}, ${timer.times} for ${left}.`))}" aria-label="${escapeHtml(`${timer.name} ${timer.times} ${left}`)}">${icon(timer.art)}<span class="kit-timer-times">${escapeHtml(timer.times)}</span><span class="kit-timer-left">${escapeHtml(left)}</span></button>`;
}

function barButton(
  view: PartsView,
  id: string,
  art: string,
  label: string,
  state: "dot" | "plain" | "locked",
): string {
  const locked = state === "locked";
  const action = locked
    ? `${label} is not open yet, so nothing opens.`
    : `Opens ${label}.`;
  const dot =
    state === "dot"
      ? `<span class="kit-dot" aria-label="Something new"></span>`
      : "";
  return `<button type="button" class="kit-btn kit-secondary kit-bar${locked ? " is-off" : ""}${pressed(view, id)}" data-bar="${id}" data-tap="${escapeHtml(tap(action))}"${locked ? " disabled" : ""}>${icon(art)}<span>${escapeHtml(label)}</span>${dot}</button>`;
}

export function renderPartsControls(view: PartsView): string {
  const buttons = (
    [
      ["primary", "kit-primary", "Buy", "The main move on a screen."],
      ["secondary", "kit-secondary", "Tend", "A second move."],
      ["outline", "kit-outline", "Back", "Goes back, quietly."],
    ] as const
  )
    .map(
      ([id, kind, label, action]) =>
        `<button type="button" class="kit-btn ${kind}${pressed(view, id)}" data-kind="${id}" data-tap="${escapeHtml(tap(action))}">${label}</button>`,
    )
    .join("");
  const off = (["kit-primary", "kit-secondary", "kit-outline"] as const)
    .map(
      (kind) =>
        `<button type="button" class="kit-btn ${kind}" data-tap="${escapeHtml(tap("Nothing happens yet."))}" disabled>Not yet</button>`,
    )
    .join("");
  const chips = [
    [ART.ore, "Clay 40"],
    [ART.ore, "Iron 12"],
    [ART.helper, "84 workers · 2 free"],
  ]
    .map(
      ([art, text]) =>
        `<span class="kit-chip">${icon(art ?? "")}<span>${escapeHtml(text ?? "")}</span></span>`,
    )
    .join("");
  const timers = TIMERS.map((timer) => timerChip(view, timer)).join("");
  return `<section class="kit-screen">
    <h1 class="kit-title">Buttons, chips and timers</h1>
    <div class="kit-row3">${buttons}</div>
    <div class="kit-row3">${off}</div>
    <div class="kit-chips">${chips}</div>
    <div class="kit-timers">${timers}</div>
    <p class="card kit-notice" role="status">${icon(ART.cart)}<span>Your Iron rails are fitted. Carts now haul 12/s.</span></p>
    <div class="kit-bar-row">
      ${barButton(view, "workshop", ART.hammer, "Workshop", "dot")}
      ${barButton(view, "upgrades", ART.upgrades, "Upgrades", "plain")}
      ${barButton(view, "engineers", ART.map, "Engineers", "locked")}
      <button type="button" class="kit-btn kit-outline kit-info${pressed(view, "info")}" data-info="1" data-tap="${escapeHtml(tap("Opens How it works."))}" aria-label="How it works">i</button>
    </div>
  </section>`;
}

const STEPS = [
  [ART.pick, "Tap the mountain to dig stones."],
  [ART.helper, "Hire workers. They dig while you rest."],
  [ART.cart, "Carts, drills and borers each need workers to run."],
  [ART.hammer, "Craft at the Workshop with the ore you find."],
  [ART.lantern, "Timers boost your digging. They all show on top."],
] as const;

export function renderPartsHow(view: PartsView): string {
  const steps = STEPS.map(
    ([art, text]) =>
      `<li class="kit-step">${icon(art)}<span>${escapeHtml(text)}</span></li>`,
  ).join("");
  return `<section class="kit-screen kit-how-host">
    <article class="card kit-how" role="dialog" aria-labelledby="kit-how-title">
      <header class="kit-how-head">${icon(ART.mountain, " is-big")}<h1 id="kit-how-title" class="kit-title">How it works</h1></header>
      <ul class="kit-steps">${steps}</ul>
      <p class="kit-quiet">Take it slow. The mountain waits for you.</p>
      <button type="button" class="kit-btn kit-primary kit-wide${pressed(view, "got")}" data-tap="${escapeHtml(tap("The card closes back to the mountain."))}">Back to digging</button>
    </article>
  </section>`;
}
