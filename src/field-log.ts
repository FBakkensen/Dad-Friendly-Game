import { BOOSTS, type BoostId } from "./boosts";
import type { Mountain } from "./mountain";
import type { Rates } from "./rates";
import { foundRelics, type RelicId } from "./relics";
import { minedOut } from "./scale";
import { TIERS, owned, type TierId } from "./tiers";
import { UPGRADES, upgradeLevel, type UpgradeId } from "./upgrades";

/**
 * A snapshot and a short event ring Flemming and Grok Bot can read without
 * screenshots. The ring is not a mountain save field. Signed-in games copy it
 * to `fieldLogs/{uid}`. Nothing here is personal (no email, display name, or uid).
 */

/** Named in every snapshot. The package is not published, so this is the stamp. */
export const APP_VERSION = "0.0.0";

/** How many events the ring remembers. */
export const EVENT_RING_LIMIT = 200;

/** How many events "Copy field log" includes. */
export const FIELD_LOG_COPY_COUNT = 50;

/** Signed-in cloud copies go up at most this often, plus on hide and a new run. */
export const FIELD_LOG_WRITE_GAP_MS = 5 * 60 * 1000;

/**
 * Firestore document ceiling for `fieldLogs/{uid}`. Rules cap every string and
 * the event list so a document cannot reach this (see `maxFieldLogDocumentBytes`).
 */
export const FIELD_LOG_MAX_BYTES = 50 * 1024;

/** Longest string the field-log rules allow (ISO-8601 is 24). */
export const FIELD_LOG_TEXT_MAX = 24;

/** Keys one event's `data` map may hold. Mirrored in `firestore.rules`. */
export const FIELD_EVENT_DATA_KEYS = [
  "count",
  "endsAt",
  "id",
  "ms",
  "source",
  "stones",
] as const;

/** At most this many of those keys on one event. The game uses one or two. */
export const FIELD_LOG_DATA_KEYS_MAX = 2;

export type FieldEventData = Partial<{
  id: string;
  count: number;
  endsAt: string;
  ms: number;
  stones: number;
  source: string;
}>;

export type FieldEvent = {
  readonly at: string;
  readonly code: string;
  readonly data: FieldEventData;
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

/** The `fieldLogs/{uid}` document. `updatedAt` is epoch milliseconds. */
export type FieldLogDocument = {
  readonly snapshot: FieldSnapshot;
  readonly events: readonly FieldEvent[];
  readonly updatedAt: number;
};

export type FieldLogWriteReason = "interval" | "hide" | "reset";

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

  /** Drops every event. Start over and passing the mine begin from empty. */
  clear(): void {
    this.#events.length = 0;
  }

  /** Oldest first. Fewer than `count` returns everything. Non-positive returns none. */
  last(count: number): readonly FieldEvent[] {
    if (count < 1) {
      return [];
    }
    return this.#events.slice(-count);
  }
}

/**
 * Whether a signed-in field log should be written now.
 * An unchanged log never writes. A change waits out the gap, unless the page
 * is hiding or the run just reset.
 */
export function shouldWriteFieldLog({
  changed,
  lastWrittenAt,
  now,
  reason,
  gapMs = FIELD_LOG_WRITE_GAP_MS,
}: {
  changed: boolean;
  lastWrittenAt: number | undefined;
  now: number;
  reason: FieldLogWriteReason;
  gapMs?: number;
}): boolean {
  if (!changed) {
    return false;
  }
  if (reason === "hide" || reason === "reset") {
    return true;
  }
  if (lastWrittenAt === undefined) {
    return true;
  }
  return now - lastWrittenAt >= gapMs;
}

/**
 * Identity of a log for "did anything change", ignoring the snapshot clock.
 * `snapshot.at` moves every call; pocket, crew, and events are the signal.
 */
export function fieldLogFingerprint(log: {
  readonly snapshot: FieldSnapshot;
  readonly events: readonly FieldEvent[];
}): string {
  return JSON.stringify({
    snapshot: { ...log.snapshot, at: "" },
    events: log.events,
  });
}

const utf8 = (value: string): number =>
  new TextEncoder().encode(value).length + 1;

/**
 * Bytes Firestore charges for a document, from the public storage-size rules.
 * A map value is a document body: field names, values, and 32 extra bytes,
 * without a path. An array is the sum of its values.
 */
export function storedDocumentBytes(
  pathParts: readonly string[],
  data: Readonly<Record<string, unknown>>,
): number {
  const name = pathParts.reduce((sum, part) => sum + utf8(part), 0) + 16;
  return name + 32 + mapFieldsSize(data);
}

function mapFieldsSize(data: Readonly<Record<string, unknown>>): number {
  let size = 0;
  for (const [key, inner] of Object.entries(data)) {
    size += utf8(key) + valueSize(inner);
  }
  return size;
}

function valueSize(value: unknown): number {
  if (typeof value === "string") {
    return utf8(value);
  }
  if (typeof value === "number") {
    return 8;
  }
  if (typeof value === "boolean") {
    return 1;
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (sum: number, item: unknown) => sum + valueSize(item),
      0,
    );
  }
  if (typeof value === "object" && value !== null) {
    return 32 + mapFieldsSize(value as Record<string, unknown>);
  }
  throw new Error("unsupported field log value");
}

/** Bytes `fieldLogs/{uid}` would use. The uid is padded to the Auth maximum. */
export function fieldLogDocumentBytes(
  log: FieldLogDocument,
  uidLength = 128,
): number {
  return storedDocumentBytes(["fieldLogs", "u".repeat(uidLength)], {
    snapshot: log.snapshot,
    events: [...log.events],
    updatedAt: log.updatedAt,
  });
}

export function fieldLogWithinBudget(log: FieldLogDocument): boolean {
  return fieldLogDocumentBytes(log) < FIELD_LOG_MAX_BYTES;
}

const maxText = (): string => "x".repeat(FIELD_LOG_TEXT_MAX);

/** Largest document the rules still allow. Must stay under {@link FIELD_LOG_MAX_BYTES}. */
export function maxFieldLogDocumentBytes(): number {
  const crew = {
    helper: 1,
    cart: 1,
    drill: 1,
    borer: 1,
    machine: 1,
    kid: 1,
  };
  const idle = { cart: 1, drill: 1, borer: 1, machine: 1 };
  const upgrades = {
    tap: 10,
    boots: 1,
    steady: 1,
    cartSyn: 1,
    drillSyn: 1,
    borerSyn: 1,
    machineSyn: 1,
  };
  const log: FieldLogDocument = {
    snapshot: {
      version: maxText(),
      at: maxText(),
      mined: 100_000_000,
      left: 100_000_000,
      pocket: 100_000_000,
      crew,
      crewSpeed: 100_000_000,
      tapYield: 100_000_000,
      idle,
      relics: ["lantern", "shield", "hammer", "heart", "crown", "mantle"],
      upgrades,
      boosts: [
        { id: "overtime", endsAt: maxText() },
        { id: "sharper", endsAt: maxText() },
      ],
      legacy: 1000,
    },
    events: Array.from({ length: EVENT_RING_LIMIT }, () => ({
      at: maxText(),
      code: maxText(),
      data: { endsAt: maxText(), source: maxText() },
    })),
    updatedAt: 1,
  };
  return fieldLogDocumentBytes(log);
}
