import { formatCompact, formatCount } from "../src/format.ts";
import { staffForBuy, staffNeeded } from "../src/engineers.ts";
import { createMountain, type Mountain } from "../src/mountain.ts";
import { effectiveRates } from "../src/rates.ts";
import { layerOf } from "../src/layers.ts";
import { nextRelic } from "../src/relics.ts";
import { MOUNTAIN_STONES } from "../src/scale.ts";
import { boostCost, BOOSTS } from "../src/boosts.ts";
import {
  buyPriceWords,
  crewPostLabel,
  crewPostsShort,
  crewPostsWords,
  formatClock,
  formatSpeed,
  layerCardWords,
  workerWords,
} from "../src/screen-words.ts";
import { owned, tierById, tierCost, TIERS, type TierId } from "../src/tiers.ts";
import {
  upgradeById,
  upgradeCost,
  upgradeLevel,
  type UpgradeId,
} from "../src/upgrades.ts";

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
  cart: "/src/assets/mine-cart.png",
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

/** A real mid-game mountain. Every number on direction B is read from this. */
export function boardB(): Mountain {
  return {
    ...createMountain(),
    remaining: MOUNTAIN_STONES - 12_000_000,
    pocket: 2_500_000,
    helpers: 18,
    carts: 5,
    drills: 2,
    borers: 0,
    machines: 0,
    kids: 0,
    staffed: 2,
    upgrades: { tap: 2, boots: 1 },
  };
}

/**
 * Ownership milestones from docs/design-intent.md. Not in the game yet.
 * The line is a preview of that rule, using the drills this board owns.
 */
const MILESTONE_MARKS = [10, 25, 50] as const;

function milestonePreview(
  ownedCount: number,
  plural: string,
): string | undefined {
  const mark = MILESTONE_MARKS.find((step) => ownedCount < step);
  if (mark === undefined) {
    return undefined;
  }
  return `Preview · ${String(ownedCount)} of ${String(mark)} ${plural}: at ${String(mark)}, every ${plural.replace(/s$/, "")} digs twice as fast.`;
}

const DOES: Record<TierId, string> = {
  helper: "Another pair of hands on the rock.",
  cart: "Hauls what the crew already cut.",
  drill: "Bites the wall while you rest.",
  borer: "Chews a tunnel you can walk from.",
  machine: "The big one, with a crew of its own.",
  kid: "Mines, and teaches the others a little.",
};

const UPGRADE_DOES: Partial<Record<UpgradeId, string>> = {
  tap: "Each tap takes a little more.",
  boots: "The workers pick up their feet.",
  steady: "Time away pays a little more.",
  cartSyn: "Each worker makes carts 1% faster.",
  drillSyn: "Drills make the borers a little quicker.",
  borerSyn: "Borers make the machine a little quicker.",
  machineSyn: "The machine makes the whole crew a little quicker.",
};

const BOOST_DOES = {
  sharper: "A short push while you are here.",
  overtime: "Twice as fast, then they rest.",
} as const;

const MOUNTAIN_BUYS: readonly TierId[] = ["cart", "drill"];

function crewArt(id: TierId): string {
  switch (id) {
    case "cart":
      return ART.cart;
    case "drill":
      return ART.drill;
    case "borer":
      return ART.borer;
    case "kid":
      return ART.kid;
    case "helper":
    case "machine":
      return ART.worker;
    default: {
      const never: never = id;
      return never;
    }
  }
}

function spareWorkers(mountain: Mountain): number {
  const rates = effectiveRates(mountain);
  let free = mountain.helpers + mountain.kids;
  for (const tier of [...TIERS].reverse()) {
    const staff = staffNeeded(mountain, tier);
    if (staff === 0) {
      continue;
    }
    free -= rates.running[tier.id] * staff;
  }
  return free;
}

function postsLine(mountain: Mountain): string {
  const rates = effectiveRates(mountain);
  const posts = TIERS.flatMap((tier) => {
    const label = crewPostLabel(tier.id);
    const staff = staffNeeded(mountain, tier);
    if (label === undefined || staff === 0) {
      return [];
    }
    return [{ label, workers: rates.running[tier.id] * staff }];
  });
  return crewPostsWords(
    mountain.helpers + mountain.kids,
    spareWorkers(mountain),
    posts,
  );
}

function needsLine(mountain: Mountain, id: TierId): string | undefined {
  const staff = staffForBuy(mountain, tierById(id));
  if (staff <= 0) {
    return undefined;
  }
  return `Needs ${formatCompact(staff)} ${workerWords(staff)}`;
}

function eachLine(mountain: Mountain, id: TierId): string {
  const speed = effectiveRates(mountain).tierSpeed[id];
  return `+${formatSpeed(speed)}/s each`;
}

function oneMore(mountain: Mountain, id: UpgradeId): Mountain {
  return {
    ...mountain,
    upgrades: { ...mountain.upgrades, [id]: upgradeLevel(mountain, id) + 1 },
  };
}

/** What one more level changes, as two real readings. Not a forecast of the night. */
function upgradeSpan(mountain: Mountain, id: UpgradeId): string {
  const before = effectiveRates(mountain);
  const after = effectiveRates(oneMore(mountain, id));
  if (id === "tap") {
    return `Tap ${formatCount(before.tapYield)} to ${formatCount(after.tapYield)}`;
  }
  if (id === "boots") {
    return `Workers ${formatSpeed(before.tierSpeed.helper)}/s to ${formatSpeed(after.tierSpeed.helper)}/s`;
  }
  const target = upgradeById(id).synergy?.to;
  if (target !== undefined) {
    return `${tierById(target).shortName} ${formatSpeed(before.tierSpeed[target])}/s to ${formatSpeed(after.tierSpeed[target])}/s each`;
  }
  return `Away ${formatSpeed(before.awayPay)} to ${formatSpeed(after.awayPay)}`;
}

function buyCard(
  view: DirectionView,
  control: string,
  name: string,
  price: string,
  affordable: boolean,
  lines: readonly string[],
  action: string,
  art?: string,
): string {
  const body = affordable
    ? lines
        .filter((line) => line !== "")
        .map((line, index) => {
          const className = line.startsWith("Preview")
            ? "dir-preview"
            : index === 0
              ? "dir-gain"
              : "";
          const attr = className === "" ? "" : ` class="${className}"`;
          return `<span${attr}>${escapeHtml(line)}</span>`;
        })
        .join("")
    : "";
  const picture = art === undefined ? "" : icon(art);
  return `<button type="button" class="tok-hit tok-secondary dir-buycard${down(view, control)}" data-tier="${control}" data-tap="${escapeHtml(tap(action))}"${affordable ? "" : " disabled"}><span class="dir-buy-top">${picture}<span class="dir-name">${escapeHtml(name)}</span><span class="dir-price">${escapeHtml(price)}</span></span>${body}</button>`;
}

function mountainCards(
  view: DirectionView,
  mountain: Mountain,
  withStory: boolean,
): string {
  return MOUNTAIN_BUYS.map((id) => {
    const tier = tierById(id);
    const cost = tierCost(tier, owned(mountain, tier));
    const price = buyPriceWords(cost);
    const affordable = mountain.pocket >= cost;
    const needs = needsLine(mountain, id);
    const why = DOES[id];
    const preview =
      withStory && id === "drill"
        ? milestonePreview(owned(mountain, tier), "drills")
        : undefined;
    const gain = eachLine(mountain, id);
    const lines = withStory
      ? [
          needs === undefined ? gain : `${gain} · ${needs}`,
          why,
          ...(preview === undefined ? [] : [preview]),
        ]
      : [gain, ...(needs === undefined ? [] : [needs])];
    return buyCard(
      view,
      id,
      tier.shortName,
      price,
      affordable,
      lines,
      affordable
        ? `Buys one ${tier.shortName.toLowerCase()} for ${formatCompact(cost)}. ${why}`
        : `${formatCompact(cost)} is more than the pocket holds, so this one waits.`,
      crewArt(id),
    );
  }).join("");
}

/** Pocket, rate, layer, and the one crew line. Read-only, so it sits up top. */
function readout(mountain: Mountain, extra = ""): string {
  const rates = effectiveRates(mountain);
  const layer = layerOf(mountain);
  const words = layerCardWords(layer.id);
  const band =
    words === undefined
      ? ""
      : `<p class="dir-band"><span class="dir-name">${escapeHtml(layer.name)}</span> · ${escapeHtml(words.advice)}</p>`;
  return `<header class="dir-read">
    <p class="dir-hero-num">${escapeHtml(formatCount(mountain.pocket))}</p>
    <p class="dir-rate">${escapeHtml(formatCompact(rates.crewPerSecond))} stones/s</p>
    ${band}
    <p class="dir-posts">${escapeHtml(postsLine(mountain))}</p>
    <p class="dir-quiet">One pool of hands. Every machine draws on it.</p>
    ${extra}
  </header>`;
}

function mountainButton(view: DirectionView): string {
  return `<button type="button" class="tok-hit tok-secondary dir-picture dir-picture-b${down(view, "mountain")}" data-tap="${escapeHtml(tap("One swing at the rock. The crew keeps going if you don't."))}">${icon(ART.mountain)}</button>`;
}

/**
 * Strip: the two buys stay on screen, short, under the rock.
 * The story lines sit with the read-only header so the buttons stay one row.
 */
function renderMountainB(view: DirectionView): string {
  const mountain = boardB();
  const drill = milestonePreview(mountain.drills, "drills") ?? "";
  const story = `<p class="dir-quiet">${escapeHtml(DOES.cart)} ${escapeHtml(DOES.drill)}</p><p class="dir-preview">${escapeHtml(drill)}</p>`;
  return `<section class="card tok-screen dir dir-b dir-b-strip">
    ${readout(mountain, story)}
    ${mountainButton(view)}
    <div class="dir-buys">${mountainCards(view, mountain, false)}</div>
    <nav class="dir-tabs">${tools(view)}</nav>
  </section>`;
}

/** Sheet, closed. The rock fills the lower middle. Buys is one bottom button. */
function renderMountainBSheet(view: DirectionView): string {
  const mountain = boardB();
  const buys = btn(
    view,
    "buys",
    "tok-secondary dir-tool",
    `${icon(ART.cart)}<span>Buys</span>`,
    "Opens the buys over the lower screen.",
  );
  return `<section class="card tok-screen dir dir-b dir-b-reach">
    ${readout(mountain)}
    ${mountainButton(view)}
    <nav class="dir-tabs dir-tabs-4">${buys}${tools(view)}</nav>
  </section>`;
}

/** Sheet, open. The cards cover the bottom. They do not push the rock's place. */
function renderMountainBOpen(view: DirectionView): string {
  const mountain = boardB();
  return `<section class="card tok-screen dir dir-b dir-b-open">
    ${readout(mountain)}
    <div class="dir-peek">${icon(ART.mountain)}</div>
    <div class="dir-buys">${mountainCards(view, mountain, true)}</div>
    ${btn(view, "close", "tok-secondary dir-buy", "Back to the mountain", "The sheet closes and the rock is the tap again.")}
  </section>`;
}

function renderUpgradesB(view: DirectionView): string {
  const mountain = boardB();
  const rates = effectiveRates(mountain);
  const pricing = {
    crewPerSecond: rates.crewPerSecond,
    tapYield: rates.tapYield,
  };
  const armsCost = upgradeCost(
    upgradeById("tap"),
    upgradeLevel(mountain, "tap"),
  );
  const hands = upgradeById("cartSyn");
  const handsCost = upgradeCost(hands, upgradeLevel(mountain, "cartSyn"));
  const handsWhy = UPGRADE_DOES.cartSyn ?? hands.perLevel;
  const tease =
    nextRelic(mountain)?.tease ?? "Deeper on, the walls start to glitter.";
  const cards = [
    buyCard(
      view,
      "arms",
      "Strong arms",
      buyPriceWords(priced(armsCost, "Strong arms")),
      armsCost !== undefined && mountain.pocket >= armsCost,
      [upgradeSpan(mountain, "tap"), UPGRADE_DOES.tap ?? ""],
      `Buys Strong arms. ${upgradeSpan(mountain, "tap")}`,
      ART.upgrades,
    ),
    ...BOOSTS.map((boost) => {
      const cost = boostCost(boost, pricing);
      return buyCard(
        view,
        boost.id,
        boost.name,
        buyPriceWords(cost),
        mountain.pocket >= cost,
        [boost.effect, BOOST_DOES[boost.id]],
        `${boost.name}. ${boost.effect}`,
        boost.id === "sharper" ? ART.stone : ART.worker,
      );
    }),
    buyCard(
      view,
      "hands",
      hands.name,
      buyPriceWords(priced(handsCost, hands.name)),
      handsCost !== undefined && mountain.pocket >= handsCost,
      [upgradeSpan(mountain, "cartSyn"), handsWhy],
      `Buys ${hands.name}. ${handsWhy}`,
      ART.workshop,
    ),
  ].join("");
  return `<section class="card tok-screen dir dir-b dir-sheet">
    <header class="dir-read">
      <p class="dir-hero-num">${escapeHtml(formatCount(mountain.pocket))}</p>
      <p class="dir-rate">${escapeHtml(formatCompact(rates.crewPerSecond))} stones/s</p>
      <p class="dir-quiet dir-center">${escapeHtml(tease)}</p>
    </header>
    <div class="dir-buys">${cards}</div>
    ${btn(view, "close", "tok-secondary dir-buy", "Back to the mountain", "The sheet closes back to the mountain.")}
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
  which: "a" | "b" | "b-sheet" | "b-open" | "c",
  view: DirectionView,
): string {
  switch (which) {
    case "a":
      return renderMountainA(view);
    case "b":
      return renderMountainB(view);
    case "b-sheet":
      return renderMountainBSheet(view);
    case "b-open":
      return renderMountainBOpen(view);
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
