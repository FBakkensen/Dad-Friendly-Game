import { formatCompact, formatCount } from "../src/format.ts";
import {
  buyPriceWords,
  crewPostsShort,
  formatClock,
} from "../src/screen-words.ts";
import { tierById, tierCost } from "../src/tiers.ts";
import { upgradeById, upgradeCost } from "../src/upgrades.ts";

/**
 * Three mountain directions for the M10-2 exploration. Same save, same
 * tokens, different hierarchy. Not the game.
 */

export type DirectionView = {
  readonly phase: string;
  readonly control: string;
};

const POCKET = 80_000_000;
const STONES_LEFT = 110_000_000;
const TEN_MINUTES = 10 * 60 * 1000;
const THIRTY_MINUTES = 30 * 60 * 1000;

const ART = {
  mountain: "/src/assets/mountain.png",
  worker: "/src/assets/helper-miner.png",
  drill: "/src/assets/steam-drill.png",
  borer: "/src/assets/tunnel-borer.png",
  kid: "/src/assets/kid-helper.png",
  workshop: "/src/assets/relics/hammer.png",
  engineers: "/src/assets/helper-miner.png",
  upgrades: "/src/assets/upgrades-icon.png",
  lantern: "/src/assets/relics/lantern.png",
  stone: "/src/assets/stone.png",
} as const;

function priced(cost: number | undefined, name: string): number {
  if (cost === undefined) {
    throw new Error(`${name} has no next price`);
  }
  return cost;
}

const DRILL = formatCompact(tierCost(tierById("drill"), 8));
const KID = formatCompact(tierCost(tierById("kid"), 4));
const BORER = formatCompact(tierCost(tierById("borer"), 3));
const MACHINE = formatCompact(tierCost(tierById("machine"), 2));
const ARMS = buyPriceWords(priced(upgradeCost(upgradeById("tap"), 3), "arms"));
const ROADS = buyPriceWords(
  priced(upgradeCost(upgradeById("drillSyn"), 0), "roads"),
);
const CREWS = buyPriceWords(
  priced(upgradeCost(upgradeById("borerSyn"), 0), "crews"),
);
const TRACKS = buyPriceWords(
  priced(upgradeCost(upgradeById("machineSyn"), 0), "tracks"),
);
const SHARPER = `Running · ${formatClock(TEN_MINUTES)}`;
const OVERTIME = `Running · ${formatClock(THIRTY_MINUTES)}`;
const POCKET_WORDS = formatCount(POCKET);
const LEFT_WORDS = formatCount(STONES_LEFT);
const CREW_LINE = crewPostsShort(84, 2);
const DRILL_BUY = buyPriceWords(tierCost(tierById("drill"), 8));

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

function down(view: DirectionView, control: string): string {
  return view.phase === "press" && view.control === control
    ? " is-pressed"
    : "";
}

function btn(
  view: DirectionView,
  control: string,
  className: string,
  inner: string,
  action: string,
): string {
  return `<button type="button" class="tok-hit ${className}${down(view, control)}" data-tap="${escapeHtml(tap(action))}">${inner}</button>`;
}

function icon(src: string): string {
  return `<img src="${src}" alt="" />`;
}

function tools(view: DirectionView): string {
  const items = [
    ["workshop", "Workshop", ART.workshop, "Opens the workshop."],
    ["engineers", "Engineers", ART.engineers, "Opens the engineers."],
    ["upgrades", "Upgrades", ART.upgrades, "Opens upgrades and boosts."],
  ] as const;
  return items
    .map(([control, label, src, action]) =>
      btn(
        view,
        control,
        "tok-secondary dir-tool",
        `${icon(src)}<span>${label}</span>`,
        action,
      ),
    )
    .join("");
}

function renderMountainA(view: DirectionView): string {
  return `<section class="tok-screen dir dir-a">
    <div class="dir-copy">
      <p class="dir-quiet">${escapeHtml(LEFT_WORDS)} stones left</p>
      <p class="dir-hero-num">${escapeHtml(POCKET_WORDS)}</p>
      <p class="dir-gold">stones in the pocket</p>
      <p class="dir-rate">11.3K stones/s · +2.5 · 203/s</p>
      <p class="dir-quiet">${escapeHtml(CREW_LINE)} · Needs 3 for the drill</p>
    </div>
    <button type="button" class="tok-hit tok-secondary dir-picture dir-picture-a${down(view, "mountain")}" data-tap="${escapeHtml(tap("One swing at the rock."))}">${icon(ART.mountain)}</button>
    <div class="dir-actions">
      <p class="dir-next">Next: a drill · ${escapeHtml(DRILL)}</p>
      ${btn(view, "drill", "tok-primary dir-buy", `<span>Drill ×8</span><span>${escapeHtml(DRILL_BUY)}</span>`, `Buys the next drill for ${DRILL}.`)}
      <div class="card dir-dock">${tools(view)}</div>
    </div>
  </section>`;
}

function renderUpgradesA(view: DirectionView): string {
  return `<section class="card tok-screen dir dir-a dir-sheet">
    <div class="dir-copy">
      <p class="dir-kicker">Upgrades</p>
      <p class="dir-hero-num">${escapeHtml(POCKET_WORDS)}</p>
      <p class="dir-gold">stones to spend</p>
      <p>Strong arms · level 3 of 10 · now 1,410</p>
      <p class="dir-quiet">Owned · Better boots, Steady hands, Helping hands</p>
      <p class="dir-quiet">Grandfather's pick is home. The lamp is too.</p>
    </div>
    <div class="dir-actions">
      <div class="dir-dock dir-pair">
        ${btn(view, "sharper", "tok-secondary dir-buy", `<span>Sharper picks</span><span>${escapeHtml(SHARPER)}</span>`, "Sharper picks keeps running.")}
        ${btn(view, "overtime", "tok-secondary dir-buy", `<span>Overtime</span><span>${escapeHtml(OVERTIME)}</span>`, "Overtime keeps running.")}
      </div>
      ${btn(view, "arms", "tok-primary dir-buy", `<span>Strong arms</span><span>${escapeHtml(ARMS)}</span>`, "Buys Strong arms.")}
      <div class="dir-dock dir-pair">
        ${btn(view, "roads", "tok-secondary dir-buy", `<span>Cart roads</span><span>${escapeHtml(ROADS)}</span>`, "Buys Cart roads.")}
        ${btn(view, "crews", "tok-secondary dir-buy", `<span>Drill crews</span><span>${escapeHtml(CREWS)}</span>`, "Buys Drill crews.")}
      </div>
      ${btn(view, "tracks", "tok-secondary dir-buy", `<span>Borer tracks</span><span>${escapeHtml(TRACKS)}</span>`, "Buys Borer tracks.")}
      ${btn(view, "close", "tok-secondary dir-buy", "Back to the mountain", "The sheet closes back to the mountain.")}
    </div>
  </section>`;
}

function stripButton(
  view: DirectionView,
  control: string,
  primary: boolean,
  src: string,
  name: string,
  price: string,
): string {
  const kind = primary ? "tok-primary" : "tok-secondary";
  return btn(
    view,
    control,
    `${kind} dir-chip`,
    `${icon(src)}<span>${escapeHtml(name)}</span><span class="dir-num">${escapeHtml(price)}</span>`,
    `Buys the next ${name.toLowerCase()} for ${price}.`,
  );
}

function renderMountainB(view: DirectionView): string {
  return `<section class="tok-screen dir dir-b">
    <header class="card dir-float">
      <p class="dir-hero-b">${escapeHtml(POCKET_WORDS)}</p>
      <p class="dir-quiet">11.3K/s · ${escapeHtml(LEFT_WORDS)} left · +2.5 · 203/s</p>
    </header>
    <button type="button" class="tok-hit tok-secondary dir-picture dir-picture-b${down(view, "mountain")}" data-tap="${escapeHtml(tap("One swing at the rock."))}">${icon(ART.mountain)}</button>
    <div class="dir-strip">
      ${stripButton(view, "kid", false, ART.kid, "Kid", KID)}
      ${stripButton(view, "drill", true, ART.drill, "Drill", DRILL)}
      ${stripButton(view, "borer", false, ART.borer, "Borer", BORER)}
    </div>
    <p class="dir-quiet dir-center">${escapeHtml(CREW_LINE)} · Needs 3 for the drill</p>
    <nav class="dir-tabs">${tools(view)}</nav>
  </section>`;
}

function row(
  view: DirectionView,
  control: string,
  primary: boolean,
  src: string,
  name: string,
  price: string,
  action: string,
): string {
  const kind = primary ? "tok-primary" : "tok-secondary";
  return btn(
    view,
    control,
    `${kind} dir-row`,
    `${icon(src)}<span>${escapeHtml(name)}</span><span class="dir-num">${escapeHtml(price)}</span>`,
    action,
  );
}

function renderUpgradesB(view: DirectionView): string {
  return `<section class="card tok-screen dir dir-b dir-sheet">
    <header class="dir-float">
      <p class="dir-kicker">Upgrades</p>
      <p class="dir-hero-b">${escapeHtml(POCKET_WORDS)} stones</p>
    </header>
    <div class="dir-rows">
      ${row(view, "sharper", false, ART.stone, "Sharper picks", SHARPER, "Sharper picks keeps running.")}
      ${row(view, "overtime", false, ART.worker, "Overtime", OVERTIME, "Overtime keeps running.")}
      ${row(view, "roads", false, ART.workshop, "Cart roads", ROADS, "Buys Cart roads.")}
      ${row(view, "crews", false, ART.drill, "Drill crews", CREWS, "Buys Drill crews.")}
      ${row(view, "tracks", false, ART.borer, "Borer tracks", TRACKS, "Buys Borer tracks.")}
      ${row(view, "arms", true, ART.upgrades, "Strong arms", ARMS, "Buys Strong arms.")}
    </div>
    ${btn(view, "close", "tok-secondary dir-buy", "Back to the mountain", "The sheet closes back to the mountain.")}
    <p class="dir-quiet">Grandfather's pick is home. The lamp is too.</p>
  </section>`;
}

function renderMountainC(view: DirectionView): string {
  return `<section class="tok-screen dir dir-c">
    <figure class="card dir-frame">
      <div class="dir-frame-top">
        ${icon(ART.lantern)}
        <p class="dir-quiet">${escapeHtml(LEFT_WORDS)} stones left</p>
      </div>
      <button type="button" class="tok-hit tok-secondary dir-picture${down(view, "mountain")}" data-tap="${escapeHtml(tap("One swing at the rock."))}">${icon(ART.mountain)}</button>
      <figcaption class="dir-caption">
        <p class="dir-hero-b">${escapeHtml(POCKET_WORDS)}</p>
        <p class="dir-quiet">stones · 11.3K/s</p>
      </figcaption>
    </figure>
    <div class="dir-portraits">
      <article class="card dir-portrait dir-subject">
        ${icon(ART.drill)}
        <p>Drill ×8</p>
        <p class="dir-num">${escapeHtml(DRILL)}</p>
      </article>
      <article class="card dir-portrait">
        ${icon(ART.worker)}
        <p>${escapeHtml(CREW_LINE)}</p>
        <p class="dir-quiet">+2.5 · 203/s</p>
      </article>
    </div>
    <p class="dir-next">Next: a drill · ${escapeHtml(DRILL)} · Needs 3 workers</p>
    ${btn(view, "buy", "tok-primary dir-buy", escapeHtml(DRILL_BUY), `Buys the next drill for ${DRILL}.`)}
    <p class="dir-quiet dir-center">The machine waits at ${escapeHtml(MACHINE)}.</p>
    <nav class="dir-tabs">${tools(view)}</nav>
  </section>`;
}

function renderUpgradesC(view: DirectionView): string {
  return `<section class="tok-screen dir dir-c dir-sheet">
    <figure class="card dir-frame dir-frame-short">
      <div class="dir-frame-top">
        ${icon(ART.lantern)}
        <p class="dir-kicker">Upgrades</p>
      </div>
      <figcaption class="dir-caption">
        <p class="dir-hero-b">${escapeHtml(POCKET_WORDS)}</p>
        <p class="dir-quiet">stones to spend · now 1,410 a tap</p>
      </figcaption>
    </figure>
    <div class="dir-portraits">
      ${btn(view, "sharper", "tok-secondary dir-portrait-btn", `${icon(ART.stone)}<span>Sharper picks</span><span class="dir-num">${escapeHtml(SHARPER)}</span>`, "Sharper picks keeps running.")}
      ${btn(view, "arms", "tok-primary dir-portrait-btn", `${icon(ART.upgrades)}<span>Strong arms</span><span class="dir-num">${escapeHtml(ARMS)}</span>`, "Buys Strong arms.")}
    </div>
    <div class="dir-shelf">
      ${btn(view, "overtime", "tok-secondary dir-chip", `${icon(ART.worker)}<span>Overtime</span><span class="dir-num">${escapeHtml(OVERTIME)}</span>`, "Overtime keeps running.")}
      ${btn(view, "roads", "tok-secondary dir-chip", `${icon(ART.workshop)}<span>Roads</span><span class="dir-num">${escapeHtml(ROADS)}</span>`, "Buys Cart roads.")}
      ${btn(view, "crews", "tok-secondary dir-chip", `${icon(ART.drill)}<span>Crews</span><span class="dir-num">${escapeHtml(CREWS)}</span>`, "Buys Drill crews.")}
    </div>
    ${btn(view, "tracks", "tok-secondary dir-buy", `<span>Borer tracks</span><span>${escapeHtml(TRACKS)}</span>`, "Buys Borer tracks.")}
    ${btn(view, "close", "tok-secondary dir-buy", "Back to the mountain", "The sheet closes back to the mountain.")}
    <p class="dir-quiet dir-center">Grandfather's pick is home. The lamp is too.</p>
  </section>`;
}

export function renderMountainDirection(
  which: "a" | "b" | "c",
  view: DirectionView,
): string {
  switch (which) {
    case "a":
      return renderMountainA(view);
    case "b":
      return renderMountainB(view);
    case "c":
      return renderMountainC(view);
    default: {
      const never: never = which;
      return never;
    }
  }
}

export function renderUpgradesDirection(
  which: "a" | "b" | "c",
  view: DirectionView,
): string {
  switch (which) {
    case "a":
      return renderUpgradesA(view);
    case "b":
      return renderUpgradesB(view);
    case "c":
      return renderUpgradesC(view);
    default: {
      const never: never = which;
      return never;
    }
  }
}
