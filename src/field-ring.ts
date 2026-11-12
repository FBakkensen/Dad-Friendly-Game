/**
 * The field log's events kept on this device (#479), so a reload, a crash or a
 * new run never empties what Copy field log and `fieldLogs/{uid}` can show.
 * One copy per device, shared by its tabs: each write folds in what another
 * tab kept, so neither overwrites the other.
 */
import {
  EVENT_RING_LIMIT,
  FIELD_EVENT_DATA_KEYS,
  type FieldEvent,
  type FieldEventData,
} from "./field-log";

export const FIELD_RING_KEY = "dad-friendly-field-log";

const STRING_KEYS: ReadonlySet<string> = new Set(["id", "endsAt", "source"]);
const DATA_KEYS: ReadonlySet<string> = new Set(FIELD_EVENT_DATA_KEYS);

function parseData(value: unknown): FieldEventData | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const data: Record<string, string | number> = {};
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    const wanted = STRING_KEYS.has(key) ? "string" : "number";
    if (
      !DATA_KEYS.has(key) ||
      (typeof field !== "string" && typeof field !== "number") ||
      typeof field !== wanted
    ) {
      return undefined;
    }
    data[key] = field;
  }
  return data;
}

function parseEvent(value: unknown): FieldEvent | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const { at, code, data } = value as Record<string, unknown>;
  const parsed = parseData(data);
  if (
    typeof at !== "string" ||
    typeof code !== "string" ||
    parsed === undefined
  ) {
    return undefined;
  }
  return { at, code, data: parsed };
}

/** The kept events, oldest first. A missing or broken copy is empty; a bad event is dropped. */
export function readKeptEvents(
  storage: Pick<Storage, "getItem">,
): FieldEvent[] {
  try {
    const raw = storage.getItem(FIELD_RING_KEY);
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

/** Both lists as one, oldest first, each event once, the newest `limit` kept. */
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

/** Folds this tab's events into the device's copy. False when storage refused it. */
export function keepEvents(
  storage: Pick<Storage, "getItem" | "setItem">,
  mine: readonly FieldEvent[],
): boolean {
  try {
    const events = mergeEvents(readKeptEvents(storage), mine);
    storage.setItem(FIELD_RING_KEY, JSON.stringify({ events }));
    return true;
  } catch {
    return false;
  }
}
