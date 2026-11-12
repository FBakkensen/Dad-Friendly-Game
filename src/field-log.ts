import { BOOSTS, type BoostId } from "./boosts";
import { DEVICE_ID_MAX } from "./device-id";
import type { MoveEvent } from "./economy/actions";
import { ENGINEER_NAMES, onDuty } from "./engineers";
import type { Mountain } from "./mountain";
import type { Rates } from "./rates";
import { foundRelics, type RelicId } from "./relics";
import { minedOut } from "./scale";
import { TIERS, owned, type TierId } from "./tiers";
import { UPGRADES, upgradeLevel, type UpgradeId } from "./upgrades";

/** Most stones one event or the pocket may carry; the rules cap both here. */
export const FIELD_STONES_CAP = 1_000_000_000_000_000;

/**
 * A snapshot and a short event ring Flemming and Grok Bot can read without
 * screenshots. The ring is not a mountain save field. Signed-in games copy it
 * to this device's `fieldLogs/{uid}/devices/{deviceId}` (#485). Nothing here is personal (no email, display name, or uid).
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
 * Firestore document ceiling for a device's field log. Rules cap every string and
 * the event list so a document cannot reach this (see `maxFieldLogDocumentBytes`).
 */
export const FIELD_LOG_MAX_BYTES = 50 * 1024;

/** Longest string the field-log rules allow (ISO-8601 is 24). */
export const FIELD_LOG_TEXT_MAX = 24;

/** A server error short enough for one field-log `id`. */
export function fieldErrorId(message: string): string {
  const compact = message.trim().slice(0, FIELD_LOG_TEXT_MAX);
  return compact.length > 0 ? compact : "unavailable";
}

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
  /** This browser. Empty on a guest snapshot built without one. */
  readonly deviceId: string;
  /** High-water save rev. 0 until a v7 document exists. */
  readonly rev: number;
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
  /** Name, rank (0 apprentice, 1 journeyman, 2 master), and post. */
  readonly engineers: readonly {
    readonly name: string;
    readonly rank: number;
    readonly post: string;
  }[];
  /** Parties still out, with an ISO return time. */
  readonly expeditions: readonly {
    readonly engineer: string;
    readonly tunnel: string;
    readonly returnsAt: string;
  }[];
};

export type FieldLog = {
  readonly snapshot: FieldSnapshot;
  readonly events: readonly FieldEvent[];
};

/** A device's field log document (`fieldLogs/{uid}/devices/{deviceId}`). `updatedAt` is epoch milliseconds. */
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
  stamp: { readonly deviceId?: string; readonly rev?: number } = {},
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
    const endsAt = mountain.boosts[boost.id];
    if (endsAt === 0 || endsAt <= now) {
      continue;
    }
    boosts.push({ id: boost.id, endsAt: new Date(endsAt).toISOString() });
  }
  // The log keeps the saved post: "tunnel" while away.
  const engineers = onDuty(mountain).map((engineer) => ({
    name: engineer.name,
    rank: engineer.rank,
    post: engineer.post,
  }));
  const expeditions = mountain.expeditions.map((trip) => ({
    engineer: trip.engineer,
    tunnel: trip.tunnel,
    returnsAt: new Date(trip.returnsAt).toISOString(),
  }));
  return {
    version,
    at: new Date(now).toISOString(),
    deviceId: stamp.deviceId ?? "",
    rev: stamp.rev ?? 0,
    // Depth in run-1 stones, whole, as the rules want (a kid run digs fractions).
    mined: Math.floor(minedOut(mountain)),
    left: Math.ceil(mountain.remaining),
    pocket: Math.min(mountain.pocket, FIELD_STONES_CAP),
    crew,
    crewSpeed: rates.crewPerSecond,
    tapYield: rates.tapYield,
    idle,
    relics: foundRelics(mountain).map((relic) => relic.id),
    upgrades,
    boosts,
    legacy: mountain.legacy,
    engineers,
    expeditions,
  };
}

/** The ring entry for one thing a dispatched move did (#413). The store adds `at`. */
export function fieldEntry(event: MoveEvent): Omit<FieldEvent, "at"> {
  switch (event.kind) {
    case "tierBought":
      return { code: "tier.buy", data: { id: event.id, count: event.count } };
    case "upgradeBought":
      return {
        code: "upgrade.buy",
        data: { id: event.id, count: event.level },
      };
    case "boostStarted":
      return {
        code: "boost.start",
        data: { id: event.id, endsAt: new Date(event.endsAt).toISOString() },
      };
    case "craftStarted":
      return { code: "craft.start", data: { id: event.recipe } };
    case "promoted":
      return {
        code: "engineer.promote",
        data: { id: event.name, count: event.crew },
      };
    case "sent":
      return {
        code: "expedition.send",
        data: { id: event.name, source: event.tunnel },
      };
    case "recalled":
      return {
        code: "expedition.recall",
        data: { id: event.name, source: event.tunnel },
      };
    case "stationed":
      return {
        code: "engineer.station",
        data: { id: event.name, source: event.post },
      };
    case "veinTapped":
      return { code: "vein.tap", data: { stones: event.stones } };
    case "quickVeinTapped":
      return {
        code: "vein.tap",
        data: { stones: event.stones, source: "rush" },
      };
    case "rushLanded":
      return { code: "rush.land", data: { stones: event.stones } };
    /* v8 ignore next 3 -- exhaustiveness guard, unreachable */
    default: {
      const unexpected: never = event;
      return unexpected;
    }
  }
}

/** Pretty JSON of a snapshot plus the events the menu copies. */
export function formatFieldLog(log: FieldLog): string {
  return JSON.stringify(log, null, 2);
}

/** Keeps the last `limit` events (200 unless a test asks for fewer). */
export class EventRing {
  readonly #events: FieldEvent[] = [];
  readonly #limit: number;
  /** Where the events since the last `mark` begin. */
  #from = 0;
  #pushes = 0;

  constructor(limit = EVENT_RING_LIMIT) {
    this.#limit = limit;
  }

  push(event: FieldEvent): void {
    // A deep-band haul can pass 240M; only past the rules' cap does it clamp.
    const stones = event.data.stones;
    this.#events.push(
      stones === undefined || stones <= FIELD_STONES_CAP
        ? event
        : { ...event, data: { ...event.data, stones: FIELD_STONES_CAP } },
    );
    this.#pushes += 1;
    const extra = this.#events.length - this.#limit;
    if (extra > 0) {
      this.#events.splice(0, extra);
      this.#from = Math.max(0, this.#from - extra);
    }
  }

  /**
   * Puts back events kept on this device (#479): a reload goes on from them.
   * Tonight starts after them, as it did from an empty ring.
   */
  restore(events: readonly FieldEvent[]): void {
    this.#events.length = 0;
    this.#from = 0;
    for (const event of events.slice(-this.#limit)) {
      this.push(event);
    }
    this.#pushes += 1;
    this.mark();
  }

  /** Grows on every change, so a copy kept elsewhere knows when it is behind. */
  get pushes(): number {
    return this.#pushes;
  }

  /** Marks the end of the ring: `sinceMark` gives only the events pushed after this. */
  mark(): void {
    this.#from = this.#events.length;
  }

  /** The events pushed since the last `mark`, oldest first. */
  sinceMark(): readonly FieldEvent[] {
    return this.#events.slice(this.#from);
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

/**
 * Bytes this device's `fieldLogs/{uid}/devices/{deviceId}` would use (#485).
 * The uid is padded to the Auth maximum, the device id to its own.
 */
export function fieldLogDocumentBytes(
  log: FieldLogDocument,
  uidLength = 128,
): number {
  const path = [
    "fieldLogs",
    "u".repeat(uidLength),
    "devices",
    "d".repeat(DEVICE_ID_MAX),
  ];
  return storedDocumentBytes(path, {
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
      deviceId: "x".repeat(FIELD_LOG_TEXT_MAX),
      rev: 1_000_000,
      engineers: ENGINEER_NAMES.map((name) => ({
        name,
        rank: 2,
        post: "machine",
      })),
      expeditions: ENGINEER_NAMES.map((name) => ({
        engineer: name,
        tunnel: "side-seam",
        returnsAt: maxText(),
      })),
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
