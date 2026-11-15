import { stillRequired, type Site } from "./city";
import type { Mountain } from "./mountain";
import { GOOD_IDS, addedStock, type GoodId, type Stock } from "./stock";

/**
 * The building site and the builders (slice 1, rule 7.8, #690). Transport
 * brings a project's goods to its site, the site holds a set amount, and
 * the builders build them in. A step is done when what it requires is built
 * in. The site and its numbers are the prototype's (call 34): if Flemming
 * turns them over, a step is done when its goods arrive again, and this
 * module is what goes.
 */

/** What a building site holds, in goods: what a horse wagon carries in twenty seconds. */
export const SITE_HOLDS = 500;

/** Goods a second one builder builds in: a little less than a horse wagon carries. */
const BUILDER_BUILDS = 20;

/** Goods a second the builders build in, at full output. Nothing lifts a builder. */
export function buildRate(mountain: Pick<Mountain, "jobs">): number {
  return mountain.jobs.building * BUILDER_BUILDS;
}

/** What is on the site, in all goods. */
export function onSiteTotal(site: Site): number {
  return GOOD_IDS.reduce((sum, good) => sum + site.onSite[good], 0);
}

/**
 * Up to `capacity` goods split evenly between the goods in `wants`, each at
 * most its want. What one good cannot use goes to the others.
 */
function shareOut(
  capacity: number,
  wants: Readonly<Partial<Record<GoodId, number>>>,
): Partial<Record<GoodId, number>> {
  const goods = GOOD_IDS.filter((good) => (wants[good] ?? 0) > 0).sort(
    (a, b) => (wants[a] ?? 0) - (wants[b] ?? 0),
  );
  const out: Partial<Record<GoodId, number>> = {};
  let left = capacity;
  for (const [index, good] of goods.entries()) {
    const even = Math.floor(left / (goods.length - index));
    const amount = Math.min(wants[good] ?? 0, even);
    out[good] = amount;
    left -= amount;
  }
  return out;
}

/** Goods in all. */
export function goodsTotal(goods: Partial<Stock>): number {
  return GOOD_IDS.reduce((sum, good) => sum + (goods[good] ?? 0), 0);
}

/**
 * Seconds the builders take at `build` a second to build in what is on the
 * site and what the step still requires to arrive: 0 with nothing left,
 * Infinity with nobody building.
 */
export function buildSeconds(site: Site, build: number): number {
  const work = onSiteTotal(site) + goodsTotal(stillRequired(site));
  return work === 0 ? 0 : build > 0 ? work / build : Infinity;
}

/** What the step in hand did in some seconds: goods brought and built in, and whether it is done. */
export type StepWork = {
  readonly seconds: number;
  readonly delivered: Partial<Stock>;
  readonly built: Partial<Stock>;
  readonly done: boolean;
};

/**
 * Seconds until the step in hand is built in, at `carry` goods a second
 * brought and `build` built in, or Infinity when the pocket does not hold
 * what it still requires or nobody builds. The builders keep pace with
 * transport, or transport keeps pace with them once the site is full.
 */
function finishSeconds(
  site: Site,
  can: number,
  carry: number,
  build: number,
): number {
  const bring = goodsTotal(stillRequired(site));
  if (can < bring) {
    return Infinity;
  }
  const brought = bring === 0 ? 0 : carry > 0 ? bring / carry : Infinity;
  return Math.max(buildSeconds(site, build), brought);
}

/**
 * The step in hand over up to `seconds` (#690): transport brings what the
 * pocket holds of what it still requires, at `carry` a second, never more
 * than the site has room for as the builders make it; the builders build in
 * what is on the site at `build` a second. When the step is built in within
 * `seconds`, it says when, and the rest of the time is the next step's.
 * Exact for one good: with several, transport and the builders split evenly.
 */
export function stepWork(
  site: Site,
  stock: Stock,
  carry: number,
  build: number,
  seconds: number,
): StepWork {
  const toBring = stillRequired(site);
  const wants: Partial<Record<GoodId, number>> = {};
  for (const good of GOOD_IDS) {
    wants[good] = Math.min(toBring[good], stock[good]);
  }
  const can = goodsTotal(wants);
  const finish = finishSeconds(site, can, carry, build);
  if (finish <= seconds) {
    return {
      seconds: finish,
      delivered: toBring,
      built: addedStock(site.onSite, toBring),
      done: true,
    };
  }
  const held = onSiteTotal(site);
  const room = SITE_HOLDS - held + build * seconds;
  const brought = Math.floor(Math.min(carry * seconds, room, can) + 1e-9);
  const delivered = shareOut(brought, wants);
  const builds = Math.floor(Math.min(build * seconds, held + brought) + 1e-9);
  return {
    seconds,
    delivered,
    built: shareOut(builds, addedStock(site.onSite, delivered)),
    done: false,
  };
}
