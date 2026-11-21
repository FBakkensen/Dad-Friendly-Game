import { stillRequired, type Site } from "./city";
import { factor } from "./economy/factors";
import type { Mountain } from "./mountain";
import { slice2Part1On } from "./part-switch";
import { flowWhole } from "./piles";
import { GOOD_IDS, addedStock, type GoodId, type Stock } from "./stock";

/**
 * The building site and the builders (slice 1, rule 7.8, #690). Transport
 * brings a project's goods to its site, the site holds a set amount, and
 * the builders build them in. A step is done when what it requires is built
 * in. The site and its numbers are the prototype's (call 34): if Flemming
 * turns them over, a step is done when its goods arrive again, and this
 * module is what goes.
 */

/**
 * What a building site holds, in goods (Slice 1). The lab (#655) left it at
 * 500: no measure moved with it, and lowering a cap a save may hold needs a
 * version.
 */
export const SITE_HOLDS = 500;

/**
 * Per-good building site buffer cap (Slice 2, #766, rule 4.2): each good on
 * site gets its own cap so one delivered good never chokes another.
 */
export const SITE_GOOD_CAP = 500;

/** Room left on the building site for `good` under per-good SITE_GOOD_CAP. */
export function siteGoodRoom(site: Site, good: GoodId): number {
  return Math.min(
    stillRequired(site)[good],
    Math.max(0, SITE_GOOD_CAP - site.onSite[good]),
  );
}

/** Goods a second one builder builds in (Slice 1): a little less than a horse wagon carries (#655). */
const BUILDER_BUILDS = 8;

/**
 * Goods a second one builder builds in (Slice 2 Part 1, #767 / #757):
 * rebalanced alongside trucks so trucks never require 50 builders apiece.
 */
const SLICE_2_BUILDER_BUILDS = 50;

/** Goods a second the builders build in, at full output. Nothing lifts a builder. */
export function buildRate(mountain: Pick<Mountain, "jobs">): number {
  const perBuilder = slice2Part1On()
    ? SLICE_2_BUILDER_BUILDS * factor("builder.rate")
    : BUILDER_BUILDS;
  return mountain.jobs.building * perBuilder;
}

/** What is on the site, in all goods. */
export function onSiteTotal(site: Site): number {
  return GOOD_IDS.reduce((sum, good) => sum + site.onSite[good], 0);
}

/** Stateless integer mix for uncorrelated, deterministic tie-breaking across ticks. */
function aperiodicShift(tieOffset: number, count: number): number {
  if (tieOffset === 0 || count <= 1) {
    return 0;
  }
  let x = (tieOffset | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) % count;
}

/**
 * Up to `capacity` whole units split evenly (water-filling) across `keys`,
 * each at most its want. What one key cannot use goes to the others. Any
 * indivisible remainder is distributed in `keys` order shifted by `tieOffset`.
 */
export function shareOutKeys<K extends string>(
  capacity: number,
  keys: readonly K[],
  wants: Readonly<Partial<Record<K, number>>>,
  tieOffset = 0,
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  let left = Math.max(0, Math.floor(capacity));
  let pool = keys.filter((key) => Math.floor(wants[key] ?? 0) > 0);
  while (left > 0 && pool.length > 0) {
    const share = Math.floor(left / pool.length);
    const capped = pool.filter((key) => Math.floor(wants[key] ?? 0) <= share);
    if (capped.length === 0) {
      break;
    }
    for (const key of capped) {
      const amount = Math.floor(wants[key] ?? 0);
      out[key] = amount;
      left -= amount;
    }
    pool = pool.filter((key) => out[key] === undefined);
  }
  if (left > 0 && pool.length > 0) {
    const base = Math.floor(left / pool.length);
    const rem = left - base * pool.length;
    const shift = aperiodicShift(tieOffset, pool.length);
    for (const [index, key] of pool.entries()) {
      const rank = (index - shift + pool.length) % pool.length;
      out[key] = base + (rank < rem ? 1 : 0);
    }
  }
  return out;
}

/**
 * Up to `capacity` goods split evenly between the goods in `wants`, each at
 * most its want. What one good cannot use goes to the others.
 */
export function shareOut(
  capacity: number,
  wants: Readonly<Partial<Record<GoodId, number>>>,
): Partial<Record<GoodId, number>> {
  const cap = Math.max(0, Math.floor(capacity));
  const active = GOOD_IDS.filter((good) => (wants[good] ?? 0) > 0).sort(
    (a, b) => (wants[a] ?? 0) - (wants[b] ?? 0),
  );
  const out: Partial<Record<GoodId, number>> = {};
  let left = cap;
  for (const [index, good] of active.entries()) {
    const even = Math.floor(left / (active.length - index));
    const amount = Math.min(Math.floor(wants[good] ?? 0), even);
    out[good] = amount;
    left -= amount;
  }
  return out;
}

/**
 * Splits `available` whole units proportionally to `weights` (each capped at its
 * weight) using largest-remainder integer rounding, breaking ties in `keys`
 * order shifted by `tieOffset`. Guarantees exact conservation
 * (`sum === min(available, sum(weights))`).
 */
export function shareProportional<K extends string>(
  available: number,
  keys: readonly K[],
  weights: Readonly<Partial<Record<K, number>>>,
  tieOffset = 0,
): Partial<Record<K, number>> {
  const avail = Math.max(0, Math.floor(available));
  const entries = keys
    .map((key) => ({ key, weight: Math.max(0, Math.floor(weights[key] ?? 0)) }))
    .filter((entry) => entry.weight > 0);
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (avail <= 0 || total <= 0) {
    return {};
  }
  if (avail >= total) {
    return Object.fromEntries(
      entries.map((entry) => [entry.key, entry.weight]),
    ) as Partial<Record<K, number>>;
  }
  const count = entries.length;
  const shift = aperiodicShift(tieOffset, count);
  const parts = entries.map((entry, idx) => {
    const exact = (avail * entry.weight) / total;
    const base = Math.min(entry.weight, Math.floor(exact));
    const order = (idx - shift + count) % count;
    return {
      key: entry.key,
      weight: entry.weight,
      base,
      frac: exact - base,
      order,
    };
  });
  let left = avail - parts.reduce((sum, part) => sum + part.base, 0);
  const byRem = [...parts].sort((a, b) => b.frac - a.frac || a.order - b.order);
  for (const part of byRem) {
    if (left <= 0) {
      break;
    }
    if (part.base < part.weight) {
      part.base += 1;
      left -= 1;
    }
  }
  return Object.fromEntries(
    parts.map((part) => [part.key, part.base]),
  ) as Partial<Record<K, number>>;
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
 * what is on the site at `build` a second. The pocket, transport, the site
 * and the builders are a chain of stages and piles (`piles`, #703). When the
 * step is built in within `seconds`, it says when, and the rest of the time
 * is the next step's. Exact for one good: with several, transport and the
 * builders split evenly.
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
  const flow = flowWhole(
    {
      source: can,
      rates: [carry, build],
      piles: [{ held: onSiteTotal(site), holds: SITE_HOLDS }],
    },
    seconds,
  );
  const [brought = 0, builds = 0] = flow.moved;
  const delivered = shareOut(brought, wants);
  return {
    seconds,
    delivered,
    built: shareOut(builds, addedStock(site.onSite, delivered)),
    done: false,
  };
}

/**
 * Per-good City delivery and builder work over a stretch (Slice 2, rule 4.2):
 * applies up to `desiredDelivery[good]` (already bounded by stock and
 * `stillRequired`) alongside up to `buildCapacity` whole goods built in via
 * `shareOut`, guaranteeing `0 <= onSite[good] + delivered[good] - built[good] <= SITE_GOOD_CAP`.
 */
export function applyCityWork(
  site: Site,
  desiredDelivery: Readonly<Partial<Stock>>,
  buildCapacity: number,
): {
  readonly delivered: Partial<Stock>;
  readonly built: Partial<Stock>;
} {
  const toBring = stillRequired(site);
  const capped: Partial<Record<GoodId, number>> = {};
  for (const good of GOOD_IDS) {
    const want = Math.max(0, Math.floor(desiredDelivery[good] ?? 0));
    if (want > 0) {
      capped[good] = Math.min(want, toBring[good]);
    }
  }
  const cap = Math.max(0, Math.floor(buildCapacity));
  const firstBuilt = shareOut(cap, addedStock(site.onSite, capped));
  const delivered: Partial<Record<GoodId, number>> = {};
  for (const good of GOOD_IDS) {
    const want = capped[good] ?? 0;
    if (want > 0) {
      const room = Math.max(
        0,
        SITE_GOOD_CAP - site.onSite[good] + (firstBuilt[good] ?? 0),
      );
      const amount = Math.min(want, room);
      if (amount > 0) {
        delivered[good] = amount;
      }
    }
  }
  const built = shareOut(cap, addedStock(site.onSite, delivered));
  return { delivered, built };
}
