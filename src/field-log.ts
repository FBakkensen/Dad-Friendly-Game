import { BOOSTS, type BoostId } from "./boosts";
import type { Mountain } from "./mountain";
import type { Rates } from "./rates";
import { foundRelics, type RelicId } from "./relics";
import { minedOut } from "./scale";
import { TIERS, owned, type TierId } from "./tiers";
import { UPGRADES, upgradeLevel, type UpgradeId } from "./upgrades";

/**
 * A snapshot and a short event ring Flemming and Grok Bot can read without
 * screenshots. Session memory only: nothing here is a save field, and nothing
 * here is personal (no email, display name, or uid).
 */

/** Named in every snapshot. The package is not published, so this is the stamp. */
export const APP_VERSION = "0.0.0";

/** How many events the ring remembers. */
export const EVENT_RING_LIMIT = 200;

/** How many events "Copy field log" includes. */
export const FIELD_LOG_COPY_COUNT = 50;

export type FieldEvent = {
  readonly at: string;
  readonly code: string;
  readonly data: Readonly<Record<string, string | number>>;
};

export type FieldSnapshot = {
  readonly version: string;
  /** ISO-8601 time of the snapshot. */
  readonly at: string;
  readonly mined: number;
  readonly left: number;
  readonly pocket: number;
  readonly crew: Readonly<Record<TierId, number>>;
  readonly crewSpeed: number;
  readonly tapYield: number;
  /** Owned machines with nobody to run them, per tier. */
  readonly idle: Readonly<Record<string, number>>;
  readonly relics: readonly RelicId[];
  readonly upgrades: Readonly<Record<UpgradeId, number>>;
  /** Boosts still running, with ISO end times. */
  readonly boosts: readonly {
    readonly id: BoostId;
    readonly endsAt: string;
  }[];
  readonly legacy: number;
};

export type FieldLog = {
  readonly snapshot: FieldSnapshot;
  readonly events: readonly FieldEvent[];
};

/** JSON-safe picture of the mountain right now. */
export function snapshot(
  mountain: Mountain,
  rates: Rates,
  now: number,
  version: string,
): FieldSnapshot {
  const crew = Object.fromEntries(
    TIERS.map((tier) => [tier.id, owned(mountain, tier)]),
  ) as Record<TierId, number>;
  const idle: Record<string, number> = {};
  for (const tier of TIERS) {
    if (tier.staff === 0) {
      continue;
    }
    idle[tier.id] = owned(mountain, tier) - rates.running[tier.id];
  }
  const upgrades = Object.fromEntries(
    UPGRADES.map((upgrade) => [upgrade.id, upgradeLevel(mountain, upgrade.id)]),
  ) as Record<UpgradeId, number>;
  const boosts: { id: BoostId; endsAt: string }[] = [];
  for (const boost of BOOSTS) {
    const endsAt = mountain.boosts?.[boost.id];
    if (endsAt === undefined || endsAt <= now) {
      continue;
    }
    boosts.push({ id: boost.id, endsAt: new Date(endsAt).toISOString() });
  }
  return {
    version,
    at: new Date(now).toISOString(),
    mined: minedOut(mountain),
    left: mountain.remaining,
    pocket: mountain.pocket,
    crew,
    crewSpeed: rates.crewPerSecond,
    tapYield: rates.tapYield,
    idle,
    relics: foundRelics(mountain).map((relic) => relic.id),
    upgrades,
    boosts,
    legacy: mountain.legacy ?? 0,
  };
}

/** Pretty JSON of a snapshot plus the events the menu copies. */
export function formatFieldLog(log: FieldLog): string {
  return JSON.stringify(log, null, 2);
}

/** Keeps the last `limit` events (200 unless a test asks for fewer). */
export class EventRing {
  readonly #events: FieldEvent[] = [];
  readonly #limit: number;

  constructor(limit = EVENT_RING_LIMIT) {
    this.#limit = limit;
  }

  push(event: FieldEvent): void {
    this.#events.push(event);
    const extra = this.#events.length - this.#limit;
    if (extra > 0) {
      this.#events.splice(0, extra);
    }
  }

  /** Oldest first. Fewer than `count` returns everything. Non-positive returns none. */
  last(count: number): readonly FieldEvent[] {
    if (count < 1) {
      return [];
    }
    return this.#events.slice(-count);
  }
}
