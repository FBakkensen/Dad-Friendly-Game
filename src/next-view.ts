import { nextBuilding } from "./city";
import { tierLock } from "./crew";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { canPay } from "./stock";
import { TIERS, tierInPlay, tierQuote, tierShown } from "./tiers";
import { VEHICLES, vehiclePrice } from "./transport";
import { upgradeShown } from "./upgrade-reveal";
import { UPGRADES, upgradePrice, type Upgrade } from "./upgrades";

/**
 * What Next and the lamps count on slice 1's frame (#659; spec, "What Next
 * and the lamps count"). Pure: it reads the mountain and never writes it.
 * Next never names a buy: it counts what he can afford on each site, and
 * points only at a building nobody has ordered.
 */

/** The sites open in part 1, in the site bar's order. */
export const SITES = ["mine", "city"] as const;

export type SiteId = (typeof SITES)[number];

export const SITE_NAMES: Readonly<Record<SiteId, string>> = {
  mine: "Mine",
  city: "City",
};

/** The worker's own upgrades: counted for the workforce, not for a site. */
const WORKER_UPGRADES: ReadonlySet<Upgrade["id"]> = new Set(["boots"]);

function upgradeAffordable(mountain: Mountain, upgrade: Upgrade): boolean {
  const price = upgradePrice(mountain, upgrade.id);
  return (
    price !== undefined &&
    upgradeShown(mountain, upgrade) &&
    canPay(mountain.stock, price)
  );
}

/** The machines of the line he can buy now: in play, open and affordable. */
function machinesAffordable(mountain: Mountain): number {
  return TIERS.filter(
    (tier) =>
      tier.id !== "helper" &&
      tierInPlay(tier) &&
      tierShown(mountain, tier) &&
      tierLock(mountain, tier) === undefined &&
      tierQuote(mountain, tier, "one").cost <= mountain.stock.stones,
  ).length;
}

/**
 * Every buy on each site he can afford now. The mine counts its machines
 * and the upgrades in its stages' lists; the city counts its vehicles.
 * Hiring is not counted: a worker is nearly always affordable.
 */
export function siteCounts(mountain: Mountain): Record<SiteId, number> {
  const upgrades = UPGRADES.filter(
    (upgrade) =>
      !WORKER_UPGRADES.has(upgrade.id) && upgradeAffordable(mountain, upgrade),
  ).length;
  const vehicles = VEHICLES.filter((vehicle) =>
    canPay(mountain.stock, vehiclePrice(mountain, vehicle.id)),
  ).length;
  return { mine: machinesAffordable(mountain) + upgrades, city: vehicles };
}

/** The worker's upgrades he can afford now (Better boots and the like). */
export function workforceCount(mountain: Mountain): number {
  return UPGRADES.filter(
    (upgrade) =>
      WORKER_UPGRADES.has(upgrade.id) && upgradeAffordable(mountain, upgrade),
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
  /** A building nobody has ordered: the one thing Next points at in part 1. */
  | {
      readonly kind: "order";
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

/** What Next says for this mountain. */
export function nextView(mountain: Mountain): NextView {
  const sites = siteCounts(mountain);
  const counts: NextCount[] = [
    ...SITES.map((where): NextCount => ({
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
    then:
      effectiveRates(mountain).crewPerSecond > 0
        ? PRODUCTION_RUNS
        : LINE_STANDS,
    ready: 0,
  };
}

/** A site tab's lamp: green for something to afford, amber for something running, else dark. */
export type Lamp = "green" | "amber" | "dark";

export function siteLamp(mountain: Mountain, site: SiteId): Lamp {
  if (siteCounts(mountain)[site] > 0) {
    return "green";
  }
  return site === "city" && mountain.project.kind === "delivering"
    ? "amber"
    : "dark";
}
