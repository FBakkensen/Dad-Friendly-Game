import { nextBuilding } from "./city";
import { tierOnSale } from "./crew";
import type { Mountain } from "./mountain";
import { STAGES, type Stage } from "./line";
import { mineMoves } from "./mine-piles";
import { canPay } from "./stock";
import { installable, stationOpen } from "./factory";
import { recipeById } from "./workshop";
import { makerPrice, makersOpen } from "./makers";
import { partTwoOn } from "./part-switch";
import { MAX_STOCKYARD_LEVEL, expandPrice, stockyardOpen } from "./stockyard";
import { TIERS, tierQuote } from "./tiers";
import { VEHICLES, vehicleOpen, vehiclePrice } from "./transport";
import { upgradeShown } from "./upgrade-reveal";
import { UPGRADES, upgradePrice, upgradeStage, type Upgrade } from "./upgrades";

/**
 * What Next and the lamps count on slice 1's frame (#659; spec, "What Next
 * and the lamps count"). Pure: it reads the mountain and never writes it.
 * Next never names a buy: it counts what he can afford on each site, and
 * points only at a building nobody has ordered.
 */

/** The sites of slice 1 so far, in the site bar's order (spec, Four sites). */
export const SITES = ["mine", "refinery", "factory", "city"] as const;

export type SiteId = (typeof SITES)[number];

export const SITE_NAMES: Readonly<Record<SiteId, string>> = {
  mine: "Mine",
  refinery: "Refinery",
  factory: "Factory",
  city: "City",
};

/**
 * Whether a site is in the site bar (#671): the mine and the city from the
 * first evening, the refinery with the Light Tower once part 2 is live, and
 * the factory with the shaft once part 3 is (#681; spec, While a part is
 * the end of the game).
 */
export function siteOpen(
  mountain: Pick<Mountain, "operational" | "granite">,
  site: SiteId,
): boolean {
  switch (site) {
    case "refinery":
      return partTwoOn() && makersOpen(mountain);
    case "factory":
      return stationOpen(mountain);
    default:
      return true;
  }
}

/** The open sites, in the bar's order. */
export function openSites(
  mountain: Pick<Mountain, "operational" | "granite">,
): readonly SiteId[] {
  return SITES.filter((site) => siteOpen(mountain, site));
}

function upgradeAffordable(mountain: Mountain, upgrade: Upgrade): boolean {
  const price = upgradePrice(mountain, upgrade.id);
  return (
    price !== undefined &&
    upgradeShown(mountain, upgrade) &&
    canPay(mountain.stock, price)
  );
}

/**
 * What a stage's list holds that he can afford now (#661): its machines at
 * ×1, and the upgrades shown in it. A stage's row has a green lamp while it
 * is not zero.
 */
export function stageCount(mountain: Mountain, stage: Stage): number {
  const machines = TIERS.filter(
    (tier) =>
      tier.stage === stage &&
      tierOnSale(mountain, tier) &&
      tierQuote(mountain, tier, "one").cost <= mountain.stock.stones,
  ).length;
  const upgrades = UPGRADES.filter(
    (upgrade) =>
      upgradeStage(upgrade) === stage && upgradeAffordable(mountain, upgrade),
  ).length;
  return machines + upgrades;
}

/** The refinery's buys he can afford now: a kiln, and the next stockyard level (#671). */
function refineryCount(mountain: Mountain): number {
  if (!siteOpen(mountain, "refinery")) {
    return 0;
  }
  const kiln = canPay(mountain.stock, makerPrice(mountain, "kiln")) ? 1 : 0;
  const level =
    stockyardOpen(mountain) &&
    mountain.stockyard < MAX_STOCKYARD_LEVEL &&
    canPay(mountain.stock, expandPrice(mountain))
      ? 1
      : 0;
  return kiln + level;
}

/**
 * Every buy on each site he can afford now. The mine counts what its
 * stages' lists hold; the refinery a kiln and a stockyard level; the city
 * counts its vehicles. The factory counts none: a work order costs nothing
 * to place, transport brings what it requires (#681). Hiring is not
 * counted: a worker is nearly always affordable.
 */
export function siteCounts(mountain: Mountain): Record<SiteId, number> {
  const mine = STAGES.reduce(
    (sum, stage) => sum + stageCount(mountain, stage),
    0,
  );
  const vehicles = VEHICLES.filter(
    (vehicle) =>
      vehicleOpen(mountain, vehicle.id) &&
      canPay(mountain.stock, vehiclePrice(mountain, vehicle.id)),
  ).length;
  return {
    mine,
    refinery: refineryCount(mountain),
    factory: 0,
    city: vehicles,
  };
}

/** The worker's upgrades he can afford now (Work boots and the like). */
export function workforceCount(mountain: Mountain): number {
  return UPGRADES.filter(
    (upgrade) =>
      upgradeStage(upgrade) === undefined &&
      upgradeAffordable(mountain, upgrade),
  ).length;
}

/** One count on Next's line: a site's, or the workforce's. */
type NextCount = {
  readonly where: SiteId | "workforce";
  readonly name: string;
  readonly count: number;
};

/** What Next says. */
export type NextView =
  /** A building nobody has ordered: one of the two things Next points at. */
  | {
      readonly kind: "order";
      readonly head: string;
      readonly line: string;
      readonly ready: number;
    }
  /** A work order done and waiting to be installed (#681): the other. */
  | {
      readonly kind: "install";
      readonly head: string;
      readonly line: string;
      readonly ready: number;
    }
  /** What is affordable, counted where it is, never named. */
  | {
      readonly kind: "affordable";
      readonly head: string;
      readonly counts: readonly NextCount[];
      readonly line: string;
      readonly ready: number;
    }
  /** Nothing to buy on the sites: the line runs, or it stands. */
  | {
      readonly kind: "nothing";
      readonly line: string;
      readonly then: string;
      readonly ready: 0;
    };

/** The spec's proposal, approved by Flemming on 15 Nov 2026 (#659). */
export const NOTHING_TO_BUY = "Nothing to buy on the sites yet.";
export const PRODUCTION_RUNS = "Production is running.";
export const LINE_STANDS = "The line stands.";

/** "iron rails", "a blasting charge": the done work order, as Next says it. */
function installWords(mountain: Mountain): string {
  const { station } = mountain;
  /* v8 ignore next 3 -- asked only while a work order is done */
  if (station.kind !== "done") {
    return "";
  }
  return recipeById(station.blueprint).name.toLowerCase();
}

/** What Next says for this mountain. */
export function nextView(mountain: Mountain): NextView {
  const sites = siteCounts(mountain);
  const counts: NextCount[] = [
    ...openSites(mountain).map((where): NextCount => ({
      where,
      name: SITE_NAMES[where],
      count: sites[where],
    })),
    {
      where: "workforce" as const,
      name: "Workforce",
      count: workforceCount(mountain),
    },
  ].filter((entry) => entry.count > 0);
  const ready = counts.reduce((sum, entry) => sum + entry.count, 0);
  const next = nextBuilding(mountain);
  if (mountain.project.kind === "unordered" && next !== undefined) {
    return {
      kind: "order",
      head: `Next · ${SITE_NAMES.city}`,
      line: `Order ${next.name.replace(/^The /, "the ")}`,
      ready: ready + 1,
    };
  }
  if (installable(mountain) && siteOpen(mountain, "factory")) {
    return {
      kind: "install",
      head: `Next · ${SITE_NAMES.factory}`,
      line: `Install ${installWords(mountain)}`,
      ready: ready + 1,
    };
  }
  if (ready > 0) {
    return {
      kind: "affordable",
      head: "Affordable now",
      counts,
      line: counts
        .map((entry) => `${entry.name} ${String(entry.count)}`)
        .join(" · "),
      ready,
    };
  }
  return {
    kind: "nothing",
    line: NOTHING_TO_BUY,
    then: mineMoves(mountain) ? PRODUCTION_RUNS : LINE_STANDS,
    ready: 0,
  };
}

/** A site tab's lamp: green for something to afford, amber for something running, else dark. */
export type Lamp = "green" | "amber" | "dark";

export function siteLamp(mountain: Mountain, site: SiteId): Lamp {
  if (siteCounts(mountain)[site] > 0) {
    return "green";
  }
  if (site === "factory") {
    // Something to do: a work order done waits to be installed (#681).
    return installable(mountain)
      ? "green"
      : mountain.station.kind === "delivering"
        ? "amber"
        : "dark";
  }
  return site === "city" && mountain.project.kind === "delivering"
    ? "amber"
    : "dark";
}
