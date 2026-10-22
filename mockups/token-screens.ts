import { formatCompact, formatCount } from "../src/format.ts";
import {
  buyPriceWords,
  crewPostsShort,
  formatClock,
} from "../src/screen-words.ts";
import { tierById, tierCost, type TierId } from "../src/tiers.ts";
import { upgradeById, upgradeCost } from "../src/upgrades.ts";

/**
 * M10-2 token mocks. Not the game. Prices come from the same cost curves
 * the mountain uses. Rate lines are the board measured in docs/ui-audit.md.
 */

export type TokenView = {
  readonly phase: string;
  readonly control: string;
};

const POCKET = 80_000_000;
const STONES_LEFT = 110_000_000;
/** Helpers plus kids on that measured board. */
const WORKERS = 84;
const FREE_WORKERS = 2;

const TEN_MINUTES = 10 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

type CrewCard = {
  readonly id: TierId;
  readonly owned: number;
  readonly rate: string;
};

const CREW: readonly CrewCard[] = [
  { id: "helper", owned: 80, rate: "+2.5 · 203/s" },
  { id: "cart", owned: 24, rate: "+15 · 367/s" },
  { id: "drill", owned: 8, rate: "+198 · 1,588/s" },
  { id: "borer", owned: 3, rate: "+505 · 1,517/s" },
  { id: "machine", owned: 2, rate: "+3,850 · 7,700/s" },
  { id: "kid", owned: 4, rate: "+1.1 · 4/s" },
];

function priced(cost: number | undefined, name: string): number {
  if (cost === undefined) {
    throw new Error(`${name} has no next price`);
  }
  return cost;
}

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

function pressed(view: TokenView, control: string): string {
  return view.phase === "press" && view.control === control
    ? " is-pressed"
    : "";
}

function drillPrice(): string {
  return formatCompact(tierCost(tierById("drill"), 8));
}

const SWATCHES = [
  { role: "page", text: "page 13.43:1" },
  { role: "card", text: "card 12.60:1" },
  { role: "ink", text: "ink 13.43:1" },
  { role: "quiet", text: "quiet 8.96:1" },
  { role: "gold", text: "gold 11.17:1" },
  { role: "on-gold", text: "on gold 11.91:1" },
  { role: "danger", text: "danger 5.08:1" },
  { role: "disabled", text: "disabled 9.52:1" },
  { role: "edge", text: "edge 4.71:1" },
] as const;

function hit(
  view: TokenView,
  control: string,
  className: string,
  label: string,
  action: string,
  extra = "",
): string {
  return `<button type="button" class="tok-hit ${className}${pressed(view, control)}" data-tap="${escapeHtml(tap(action))}"${extra}>${label}</button>`;
}

export function renderTokenSheet(view: TokenView): string {
  const buy = buyPriceWords(priced(upgradeCost(upgradeById("tap"), 3), "tap"));
  const workers = crewPostsShort(WORKERS, FREE_WORKERS);
  const next = `Next: a drill · ${drillPrice()}`;
  const running = `Running · ${formatClock(TEN_MINUTES)}`;
  const kinds = [
    ["buy", "tok-primary", "Buy", "A primary buy."],
    ["tend", "tok-secondary", "Tend", "A secondary tend."],
    ["shelf", "tok-outline", "Shelf", "An outline shelf."],
    ["pass", "tok-danger", "Pass", "A danger pass, said once and plainly."],
  ] as const;
  const row = (caption: string, forcePressed: boolean): string => {
    const buttons = kinds
      .map(([control, kind, label, action]) => {
        const down =
          forcePressed || pressed(view, control) !== "" ? " is-pressed" : "";
        return `<button type="button" class="tok-hit ${kind}${down}" data-tap="${escapeHtml(tap(action))}">${label}</button>`;
      })
      .join("");
    return `<div class="tok-button-row"><span class="tok-row-label">${caption}</span>${buttons}</div>`;
  };
  const swatches = SWATCHES.map(
    (swatch) =>
      `<li class="tok-swatch tok-swatch-${swatch.role}">${escapeHtml(swatch.text)}</li>`,
  ).join("");
  return `<section class="tok-screen tok-sheet">
    <h1 class="tok-title">Tokens</h1>
    <div class="tok-scale">
      <p class="tok-32">+2.5 · 203/s</p>
      <div class="tok-scale-rest">
        <p class="tok-24">${escapeHtml(buy)}</p>
        <p class="tok-20">${escapeHtml(workers)}</p>
        <p class="tok-16">${escapeHtml(running)}</p>
        <p class="tok-14">${escapeHtml(next)}</p>
      </div>
    </div>
    <div class="tok-meta">
      <div class="tok-spaces">
        <span class="tok-space"><i class="tok-space-4"></i>4</span>
        <span class="tok-space"><i class="tok-space-8"></i>8</span>
        <span class="tok-space"><i class="tok-space-16"></i>16</span>
        <span class="tok-space"><i class="tok-space-24"></i>24</span>
      </div>
      <div class="tok-radii">
        <span class="tok-radius tok-radius-control">12</span>
        <span class="tok-radius tok-radius-sheet">20</span>
        <span class="tok-badge">×8</span>
      </div>
    </div>
    <ul class="tok-colors">${swatches}</ul>
    <div class="tok-buttons">
      ${row("Rest", false)}
      ${row("Pressed", true)}
    </div>
    <article class="card tok-sample">
      <span class="tok-chip">Clay 40</span>
      <span class="tok-timer">${escapeHtml(running)}</span>
      <span class="tok-badge">×8</span>
      <p class="tok-notice">Your Iron rails are fitted. Carts now 12/s.</p>
    </article>
  </section>`;
}

function crewButton(view: TokenView, card: CrewCard): string {
  const tier = tierById(card.id);
  const cost = tierCost(tier, card.owned);
  const price = formatCompact(cost);
  const affordable = cost <= POCKET;
  const next = card.id === "drill";
  const word = tier.shortName.toLowerCase();
  const action = affordable
    ? `Buys the next ${word} for ${price}.`
    : `${price} is more than the pocket holds, so the next ${word} waits.`;
  const kind = next ? "tok-primary" : "tok-secondary";
  const needs =
    next && tier.staff > 0
      ? `<span>Needs ${String(tier.staff)} workers</span>`
      : "";
  return `<button type="button" class="card tok-hit tok-crew ${kind}${pressed(view, card.id)}" data-tier="${card.id}" data-tap="${escapeHtml(tap(action))}"${affordable ? "" : " disabled"}><span class="tok-name">${escapeHtml(tier.shortName)} <span class="tok-badge">×${escapeHtml(formatCompact(card.owned))}</span></span><span>${escapeHtml(price)}</span><span>${escapeHtml(card.rate)}</span>${needs}</button>`;
}

export function renderMountainTokens(view: TokenView): string {
  const next = `Next: a drill · ${drillPrice()}`;
  const icons = (
    [
      ["workshop", "Workshop", "/src/assets/relics/hammer.png"],
      ["engineers", "Engineers", "/src/assets/helper-miner.png"],
      ["upgrades", "Upgrades", "/src/assets/upgrades-icon.png"],
    ] as const
  )
    .map(
      ([control, label, art]) =>
        `<button type="button" class="tok-hit tok-icon tok-secondary${pressed(view, control)}" data-tap="${escapeHtml(tap(`Opens ${label}. One tap from the mountain.`))}"><img src="${art}" alt="" /><span>${label}</span></button>`,
    )
    .join("");
  const cards = CREW.map((card) => crewButton(view, card)).join("");
  return `<section class="tok-screen tok-mountain-screen">
    <header class="tok-header">
      <p class="tok-stones">${escapeHtml(formatCount(STONES_LEFT))} stones left</p>
      <div class="tok-icons">${icons}</div>
    </header>
    <button type="button" class="tok-hit tok-mountain${pressed(view, "mountain")}" data-tap="${escapeHtml(tap("One swing at the rock."))}"><img src="/src/assets/mountain.png" alt="" /><span>${escapeHtml(formatCount(POCKET))} stones</span></button>
    <div class="tok-facts">
      <p class="tok-crew-rate">Your crew mines 11.3K stones/s</p>
      <p class="tok-next">${escapeHtml(next)}</p>
    </div>
    <button type="button" class="tok-hit tok-posts tok-secondary${pressed(view, "posts")}" data-tap="${escapeHtml(tap("Where the workers are opens under the line."))}">${escapeHtml(crewPostsShort(WORKERS, FREE_WORKERS))}</button>
    <div class="tok-grid">${cards}</div>
    <p class="tok-save">Saved on this device</p>
  </section>`;
}

export function renderUpgradesTokens(view: TokenView): string {
  const arms = buyPriceWords(
    priced(upgradeCost(upgradeById("tap"), 3), "Strong arms"),
  );
  const roads = buyPriceWords(
    priced(upgradeCost(upgradeById("drillSyn"), 0), "Cart roads"),
  );
  const crews = buyPriceWords(
    priced(upgradeCost(upgradeById("borerSyn"), 0), "Drill crews"),
  );
  const tracks = buyPriceWords(
    priced(upgradeCost(upgradeById("machineSyn"), 0), "Borer tracks"),
  );
  const sharper = `Running · ${formatClock(TEN_MINUTES)}`;
  const overtime = `Running · ${formatClock(THIRTY_MINUTES)}`;
  const actions = (
    [
      [
        "sharper",
        "tok-secondary",
        "Sharper picks",
        sharper,
        "Sharper picks keeps running.",
      ],
      [
        "overtime",
        "tok-secondary",
        "Overtime",
        overtime,
        "Overtime keeps running.",
      ],
      ["arms", "tok-primary", "Strong arms", arms, "Buys Strong arms."],
      ["roads", "tok-primary", "Cart roads", roads, "Buys Cart roads."],
      ["crews", "tok-primary", "Drill crews", crews, "Buys Drill crews."],
      ["tracks", "tok-primary", "Borer tracks", tracks, "Buys Borer tracks."],
    ] as const
  )
    .map(
      ([control, kind, name, label, action]) =>
        `<button type="button" class="tok-hit tok-action ${kind}${pressed(view, control)}" data-upgrade="${control}" data-tap="${escapeHtml(tap(action))}"><span>${escapeHtml(name)}</span><span>${escapeHtml(label)}</span></button>`,
    )
    .join("");
  return `<section class="card tok-screen tok-upgrades" role="dialog" aria-labelledby="upgrades-tokens-title">
    <header class="tok-up-head">
      <h1 id="upgrades-tokens-title" class="tok-up-title">Upgrades</h1>
      ${hit(view, "close", "tok-close tok-secondary", "×", "The sheet closes back to the mountain.", ` aria-label="Back to the mountain"`)}
    </header>
    <div class="tok-read">
      <p class="tok-pocket">You have ${escapeHtml(formatCount(POCKET))} stones.</p>
      <p>Strong arms · level 3 of 10 · now 1,410</p>
      <p>Cart roads · drills would 24%</p>
      <p>Drill crews · borers would 8%</p>
      <p>Borer tracks · the Great Machine would 3%</p>
      <p>Sharper picks · 1,410 a tap</p>
      <p>Overtime · 22.7K/s</p>
      <p class="tok-quiet">Owned · Better boots, Steady hands, Helping hands</p>
      <p class="tok-quiet">Grandfather's pick · Found. Your taps bite a little deeper.</p>
      <p class="tok-quiet">Old miner's lamp · Found. Golden veins linger longer in its light.</p>
    </div>
    <div class="tok-actions">${actions}</div>
  </section>`;
}
