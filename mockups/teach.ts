import { chipTime, formatCompact } from "../src/format.ts";

/**
 * M11-2 teaching mock (#240), the hybrid pattern Flemming picked. Not the game.
 *
 * Big systems (the Workshop, crystal, the kid tier): a red dot on the bar
 * button and one "New" note above the bar, styled like the bar. The note
 * opens the sheet straight away; there is no pop-up in between.
 * Small systems (an upgrade, a boost, one new clay craft): the dot only.
 *
 * Inside the sheet: a one-line intro, then the new card first, lit and
 * tagged New, with one big first-action button the dad can afford now.
 * After the first use the same card shows the payoff, and the tag and the
 * dot go away. The dot stays until that first use. One note at a time.
 *
 * Every size and colour is a token from src/tokens.css.
 */

const TEACH_STEPS = ["note", "sheet", "payoff", "how", "dot"] as const;
type TeachStep = (typeof TEACH_STEPS)[number];

const ART = {
  helper: "/src/assets/helper-miner.png",
  pick: "/src/assets/pick.png",
  ore: "/src/assets/ore-lump.png",
  stone: "/src/assets/stone.png",
  hammer: "/src/assets/relics/hammer.png",
  lantern: "/src/assets/relics/lantern.png",
  upgrades: "/src/assets/upgrades-icon.png",
  mountain: "/src/assets/mountain.png",
  map: "/src/assets/worn-map.png",
  cart: "/src/assets/mine-cart.png",
} as const;

/** The Topsoil dad: 712K stones, 4 clay, a crew of 1,762/s. */
const POCKET = 712_000;
const CREW_PER_SEC = 1_762;
const TWENTY_MIN = 20 * 60 * 1000;

const NOTE = "New · The Workshop is open";
const INTRO = "Turn your clay into gear for the crew.";
const ACTION = `Craft Blasting charge · 4 clay · ${formatCompact(100_000)}`;
const PAYOFF = `+${formatCompact(CREW_PER_SEC)}/s now · Crew ×2 for 20 min`;

type SheetCard = {
  readonly id: string;
  readonly art: string;
  readonly name: string;
  readonly price: string;
  readonly line: string;
  readonly dear?: boolean;
};

const CHARGE: SheetCard = {
  id: "charge",
  art: ART.ore,
  name: "Blasting charge",
  price: `${formatCompact(100_000)} · 4 clay`,
  line: "Crew ×2 for 20 min · 10 min to make",
};

const OTHERS: readonly SheetCard[] = [
  {
    id: "props",
    art: ART.stone,
    name: "Sturdy props",
    price: `${formatCompact(250_000)} · 10 clay · 4 iron`,
    line: "Trouble comes less often",
    dear: true,
  },
  {
    id: "rails",
    art: ART.cart,
    name: "Iron rails",
    price: `${formatCompact(500_000)} · 4 iron`,
    line: "Carts haul 25% more",
    dear: true,
  },
];

const HOW: readonly (readonly [string, string])[] = [
  [ART.hammer, "Pick a recipe. The bench makes one at a time."],
  [ART.ore, "Each costs ore you dig, and some take stones."],
  [ART.lantern, "Timers like the charge show on top while they run."],
  [ART.cart, "Cancel any time. Gear not started comes back in full."],
];

const RUNNING = [
  { art: ART.pick, times: "×2", ms: 299_000, name: "Sharper picks" },
  { art: ART.helper, times: "×2", ms: 1_740_000, name: "Overtime" },
] as const;

function esc(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function tap(action: string): string {
  return `Presses in. ${action} Silent until unmuted.`;
}

function icon(src: string, extra = ""): string {
  return `<img class="kit-icon${extra}" src="${src}" alt="" />`;
}

function timers(step: TeachStep): string {
  const running: {
    art: string;
    times: string;
    ms: number;
    name: string;
    fresh?: boolean;
  }[] = [...RUNNING];
  if (step === "payoff") {
    running.push({
      art: ART.ore,
      times: "×2",
      ms: TWENTY_MIN,
      name: "Blasting charge",
      fresh: true,
    });
  }
  return `<div class="kit-timers">${running
    .map((timer) => {
      const left = chipTime(timer.ms);
      return `<button type="button" class="kit-timer${timer.fresh === true ? " is-fresh" : ""}" data-tap="${esc(tap(`Shows the name, ${timer.name}, ${timer.times} for ${left}.`))}" aria-label="${esc(`${timer.name} ${timer.times} ${left}`)}">${icon(timer.art)}<span class="kit-timer-times">${esc(timer.times)}</span><span class="kit-timer-left">${esc(left)}</span></button>`;
    })
    .join("")}</div>`;
}

/** The red dot sits on the Workshop until the first craft, or on Upgrades for the small example. */
function bar(step: TeachStep): string {
  const dotOn =
    step === "note" || step === "sheet" || step === "how"
      ? "workshop"
      : step === "dot"
        ? "upgrades"
        : "";
  const items = [
    ["buys", ART.cart, "Buys"],
    ["workshop", ART.hammer, "Workshop"],
    ["engineers", ART.map, "Engineers"],
    ["upgrades", ART.upgrades, "Upgrades"],
  ] as const;
  return `<nav class="teach-bar">${items
    .map(([id, art, label]) => {
      const dot = id === dotOn;
      return `<button type="button" class="kit-btn kit-secondary kit-bar" data-bar="${id}" data-tap="${esc(tap(`Opens ${label}.`))}">${icon(art)}<span>${esc(label)}</span>${dot ? `<span class="teach-dot" aria-label="Something new"></span>` : ""}</button>`;
    })
    .join("")}</nav>`;
}

function plainCard(spec: SheetCard): string {
  const action =
    spec.dear === true
      ? `Not enough yet, so ${spec.name} waits.`
      : `Starts ${spec.name} for ${spec.price}.`;
  return `<button type="button" class="card kit-card${spec.dear === true ? " is-dear" : ""}" data-card="${spec.id}" data-tap="${esc(tap(action))}"${spec.dear === true ? " disabled" : ""}>
    ${icon(spec.art)}
    <span class="kit-card-body">
      <span class="kit-card-head"><span class="kit-card-title">${esc(spec.name)}</span></span>
      <span class="kit-card-price teach-price">${esc(spec.price)}</span>
      <span class="kit-card-line">${esc(spec.line)}</span>
    </span>
  </button>`;
}

/**
 * The new card. Lit and tagged New, with the one big first-action button.
 * The whole card is the tap target too: a tap anywhere starts the same craft.
 * After the first use it keeps its place and shows the payoff instead.
 */
function newCard(done: boolean): string {
  const head = `<span class="kit-card-head"><span class="kit-card-title">${esc(CHARGE.name)}</span>${done ? "" : `<span class="teach-tag">New</span>`}</span>`;
  if (done) {
    return `<div class="card kit-card is-done" data-card="charge" data-tap="${esc(tap("Shows the charge is already working."))}">
      ${icon(CHARGE.art)}
      <span class="kit-card-body">${head}
        <span class="kit-card-price teach-price">${esc(CHARGE.price)}</span>
        <span class="kit-card-line teach-payoff-line">${esc(PAYOFF)}</span>
      </span>
    </div>`;
  }
  const action = `Starts a Blasting charge for ${CHARGE.price}. The hammer taps, then the tag and the dot go away.`;
  return `<div class="card kit-card is-new" data-card="charge" data-tap="${esc(tap(action))}">
    <div class="teach-new-top">
      ${icon(CHARGE.art)}
      <span class="kit-card-body">${head}
        <span class="kit-card-price teach-price">${esc(CHARGE.price)}</span>
        <span class="kit-card-line">${esc(CHARGE.line)}</span>
      </span>
    </div>
    <button type="button" class="kit-btn kit-primary kit-wide" data-tap="${esc(tap(action))}">${esc(ACTION)}</button>
  </div>`;
}

function sheet(done: boolean): string {
  return `<section class="card teach-sheet" role="dialog" aria-label="Workshop">
    <header class="teach-sheet-head"><h2 class="kit-title">Workshop</h2><button type="button" class="kit-btn kit-outline kit-info" data-info="1" data-tap="${esc(tap("Opens How it works for the Workshop."))}" aria-label="How it works">i</button></header>
    ${done ? "" : `<p class="teach-intro">${esc(INTRO)}</p>`}
    <div class="kit-stack">${newCard(done)}${OTHERS.map(plainCard).join("")}</div>
  </section>`;
}

function how(): string {
  return `<section class="card teach-sheet" role="dialog" aria-label="How it works">
    <header class="teach-sheet-head"><h2 class="kit-title">How it works · Workshop</h2></header>
    <ul class="kit-steps">${HOW.map(([art, text]) => `<li class="kit-step">${icon(art)}<span>${esc(text)}</span></li>`).join("")}</ul>
    <button type="button" class="kit-btn kit-outline kit-wide" data-tap="${esc(tap("Back to the Workshop list."))}">Back to the Workshop</button>
  </section>`;
}

/** One line, styled like the bar: same face and colours, a gold edge, one soft pulse. */
function note(): string {
  return `<button type="button" class="kit-btn kit-secondary teach-note" data-tap="${esc(tap("Opens the Workshop with the new card on top."))}">${icon(ART.hammer)}<span>${esc(NOTE)}</span></button>`;
}

function rock(): string {
  return `<img class="teach-rock" src="${ART.mountain}" alt="" />`;
}

function frame(step: TeachStep, middle: string, below = ""): string {
  return `<section class="kit-screen teach-screen">
    <p class="card teach-pocket">${icon(ART.stone)}<span>${esc(formatCompact(POCKET))} stones</span></p>
    ${timers(step)}
    <div class="teach-middle">${middle}</div>
    ${below}
    ${bar(step)}
  </section>`;
}

/** `control` names the step: note, sheet, payoff, how, or dot. */
export function renderTeach(control: string): string {
  const step = TEACH_STEPS.find((id) => id === control);
  switch (step) {
    case "note":
      return frame(step, rock(), note());
    case "sheet":
      return frame(step, sheet(false));
    case "payoff":
      return frame(step, sheet(true));
    case "how":
      return frame(step, how());
    case "dot":
      return frame(step, rock());
    case undefined:
      throw new Error(`Unknown teach step ${control}`);
  }
}
