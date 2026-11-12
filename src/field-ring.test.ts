import { describe, expect, it } from "vitest";
import {
  EVENT_RING_LIMIT,
  FIELD_STONES_CAP,
  type FieldEvent,
} from "./field-log";
import {
  fieldRingKey,
  keepEvents,
  mergeEvents,
  readKeptEvents,
  sameScope,
  type RingScope,
} from "./field-ring";

const memory = (): Storage => {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => {
      data.clear();
    },
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
};

const guest: RingScope = { kind: "guest" };
const dad: RingScope = { kind: "account", uid: "dad-uid" };
const at = (second: number): string =>
  new Date(Date.UTC(2026, 10, 11, 21, 0, second)).toISOString();
const event = (second: number, code: string, data = {}): FieldEvent => ({
  at: at(second),
  code,
  data,
});
const codes = (events: readonly FieldEvent[]): string[] =>
  events.map((kept) => kept.code);

describe("field ring", () => {
  it("keeps the events per account and reads them back", () => {
    const storage = memory();
    expect(readKeptEvents(storage, dad)).toEqual([]);
    const events = [
      event(1, "vein.tap", { stones: 5 }),
      event(2, "run.start-over"),
    ];
    expect(keepEvents(storage, dad, events)).toBe(true);
    expect(readKeptEvents(storage, dad)).toEqual(events);
    expect(readKeptEvents(storage, guest)).toEqual([]);
    expect(fieldRingKey(guest)).not.toBe(fieldRingKey(dad));
    expect(sameScope(dad, { kind: "account", uid: "dad-uid" })).toBe(true);
    expect(sameScope(dad, guest)).toBe(false);
  });

  it("folds another tab's events in, each once and in time order", () => {
    const storage = memory();
    keepEvents(storage, guest, [event(1, "a"), event(3, "c")]);
    keepEvents(storage, guest, [event(1, "a"), event(2, "b"), event(4, "d")]);
    expect(codes(readKeptEvents(storage, guest))).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps only the newest ring's worth", () => {
    const many = Array.from({ length: EVENT_RING_LIMIT + 5 }, (_, i) =>
      event(i % 60, "n", { count: i }),
    );
    const merged = mergeEvents([], many);
    expect(merged).toHaveLength(EVENT_RING_LIMIT);
  });

  it("reads a broken copy as empty", () => {
    const storage = memory();
    const key = fieldRingKey(guest);
    storage.setItem(key, "{not json");
    expect(readKeptEvents(storage, guest)).toEqual([]);
    storage.setItem(key, JSON.stringify({ events: "no" }));
    expect(readKeptEvents(storage, guest)).toEqual([]);
    storage.setItem(key, JSON.stringify(null));
    expect(readKeptEvents(storage, guest)).toEqual([]);
  });

  it("drops an event the field-log rules would refuse, and caps stones", () => {
    const storage = memory();
    storage.setItem(
      fieldRingKey(guest),
      JSON.stringify({
        events: [
          event(1, "ok", { id: "lantern", stones: 3 }),
          event(2, "deep", { stones: 2 * FIELD_STONES_CAP }),
          event(3, "bad", { id: 4 }),
          event(4, "bad", { other: 1 }),
          event(5, "bad", []),
          event(6, "bad", { id: "a", count: 1, ms: 2 }),
          event(7, "bad", { id: "x".repeat(25) }),
          event(8, "bad", { count: 1.5 }),
          event(9, "bad", { stones: -1 }),
          event(11, "bad", { count: 1_000_001 }),
          event(10, "x".repeat(25)),
          { at: "soon", code: "bad", data: {} },
          { at: 5, code: "bad", data: {} },
          null,
        ],
      }),
    );
    const kept = readKeptEvents(storage, guest);
    expect(codes(kept)).toEqual(["ok", "deep"]);
    expect(kept[1]?.data.stones).toBe(FIELD_STONES_CAP);
  });

  it("says so when storage refuses the copy", () => {
    const storage = memory();
    storage.setItem = () => {
      throw new Error("quota");
    };
    expect(keepEvents(storage, guest, [event(1, "a")])).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readKeptEvents(throwing, guest)).toEqual([]);
  });
});
