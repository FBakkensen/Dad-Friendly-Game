/**
 * The field log's events kept on this device (#479), so a reload, a crash or
 * a new run never empties what Copy field log and this device's cloud field log can show.
 * One copy per account on the device (the guest is one too), as the phone
 * backup is, so one player's evening never lands in another's log. Each write
 * folds in what another tab kept, so tabs never overwrite each other.
 */
import {
  EVENT_RING_LIMIT,
  FIELD_EVENT_DATA_KEYS,
  FIELD_LOG_DATA_KEYS_MAX,
  FIELD_LOG_TEXT_MAX,
  FIELD_STONES_CAP,
  type FieldEvent,
  type FieldEventData,
} from "./field-log";

/** Whose events a copy holds: a signed-in uid, or the guest. */
export type RingScope =
  | { readonly kind: "guest" }
  | { readonly kind: "account"; readonly uid: string };

/** The field ring's key prefix, new with the version 8 save (#558). */
const FIELD_RING_PREFIX = "dad-friendly-game-log";

export function fieldRingKey(scope: RingScope): string {
  return scope.kind === "guest"
    ? `${FIELD_RING_PREFIX}:guest`
    : `${FIELD_RING_PREFIX}:${scope.uid}`;
}

export function sameScope(left: RingScope, right: RingScope): boolean {
  return fieldRingKey(left) === fieldRingKey(right);
}

const STRING_KEYS: ReadonlySet<string> = new Set(["id", "endsAt", "source"]);
/** The field-log rules' ceiling on an event's `count`. */
const MAX_COUNT = 1_000_000;
const DATA_KEYS: ReadonlySet<string> = new Set(FIELD_EVENT_DATA_KEYS);

const shortText = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length >= 1 &&
  value.length <= FIELD_LOG_TEXT_MAX;

/** One data field as the field-log rules would take it, or undefined. */
function dataField(key: string, field: unknown): string | number | undefined {
  if (!DATA_KEYS.has(key)) {
    return undefined;
  }
  if (STRING_KEYS.has(key)) {
    return shortText(field) ? field : undefined;
  }
  if (typeof field !== "number" || !Number.isFinite(field) || field < 0) {
    return undefined;
  }
  if (key === "count") {
    return Number.isInteger(field) && field <= MAX_COUNT ? field : undefined;
  }
  if (key === "ms") {
    return Number.isInteger(field) ? field : undefined;
  }
  return Math.min(field, FIELD_STONES_CAP);
}

function parseData(value: unknown): FieldEventData | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > FIELD_LOG_DATA_KEYS_MAX) {
    return undefined;
  }
  const data: Record<string, string | number> = {};
  for (const [key, field] of entries) {
    const kept = dataField(key, field);
    if (kept === undefined) {
      return undefined;
    }
    data[key] = kept;
  }
  return data;
}

function parseEvent(value: unknown): FieldEvent | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { at, code, data } = value as Record<string, unknown>;
  const parsed = parseData(data);
  const isoAt = typeof at === "string" && at.length >= 20 && at.length <= 24;
  if (!isoAt || !shortText(code) || parsed === undefined) {
    return undefined;
  }
  return { at, code, data: parsed };
}

/**
 * The kept events, oldest first. A missing or broken copy is empty, and an
 * event the field-log rules would refuse is dropped, so one bad event from an
 * older build cannot stop every later cloud write.
 */
export function readKeptEvents(
  storage: Pick<Storage, "getItem">,
  scope: RingScope,
): FieldEvent[] {
  try {
    const raw = storage.getItem(fieldRingKey(scope));
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    const list: unknown =
      typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, unknown>)["events"]
        : undefined;
    if (!Array.isArray(list)) {
      return [];
    }
    return list
      .map(parseEvent)
      .filter((event): event is FieldEvent => event !== undefined)
      .slice(-EVENT_RING_LIMIT);
  } catch {
    return [];
  }
}

const eventKey = (event: FieldEvent): string =>
  `${event.at}|${event.code}|${JSON.stringify(event.data)}`;

/**
 * Both lists as one, oldest first, the newest `limit` kept. An event in both
 * is one event: two events alike to the millisecond are kept once.
 */
export function mergeEvents(
  kept: readonly FieldEvent[],
  mine: readonly FieldEvent[],
  limit = EVENT_RING_LIMIT,
): FieldEvent[] {
  const seen = new Set<string>();
  const all: FieldEvent[] = [];
  for (const event of [...kept, ...mine]) {
    const key = eventKey(event);
    if (!seen.has(key)) {
      seen.add(key);
      all.push(event);
    }
  }
  // Stable: events of one moment keep the order they were recorded in.
  all.sort((left, right) =>
    left.at < right.at ? -1 : left.at > right.at ? 1 : 0,
  );
  return all.slice(-limit);
}

/** This tab's events with what the device kept for `scope`, oldest first. */
export function withKept(
  storage: Pick<Storage, "getItem">,
  scope: RingScope,
  mine: readonly FieldEvent[],
): FieldEvent[] {
  return mergeEvents(readKeptEvents(storage, scope), mine);
}

/** Folds this tab's events into the device's copy for `scope`. False when storage refused it. */
export function keepEvents(
  storage: Pick<Storage, "getItem" | "setItem">,
  scope: RingScope,
  mine: readonly FieldEvent[],
): boolean {
  try {
    const events = withKept(storage, scope, mine);
    storage.setItem(fieldRingKey(scope), JSON.stringify({ events }));
    return true;
  } catch {
    return false;
  }
}
