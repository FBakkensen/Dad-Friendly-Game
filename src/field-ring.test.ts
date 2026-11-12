import { describe, expect, it } from "vitest";
import { EVENT_RING_LIMIT, type FieldEvent } from "./field-log";
import {
  FIELD_RING_KEY,
  keepEvents,
  mergeEvents,
  readKeptEvents,
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

const at = (second: number): string =>
  new Date(Date.UTC(2026, 10, 11, 21, 0, second)).toISOString();
const event = (second: number, code: string, data = {}): FieldEvent => ({
  at: at(second),
  code,
  data,
});

describe("field ring", () => {
  it("keeps the events and reads them back", () => {
    const storage = memory();
    expect(readKeptEvents(storage)).toEqual([]);
    const events = [
      event(1, "vein.tap", { stones: 5 }),
      event(2, "run.start-over"),
    ];
    expect(keepEvents(storage, events)).toBe(true);
    expect(readKeptEvents(storage)).toEqual(events);
  });

  it("folds another tab's events in, each once and in time order", () => {
    const storage = memory();
    keepEvents(storage, [event(1, "a"), event(3, "c")]);
    keepEvents(storage, [event(1, "a"), event(2, "b"), event(4, "d")]);
    expect(readKeptEvents(storage).map((kept) => kept.code)).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });

  it("keeps only the newest ring's worth", () => {
    const many = Array.from({ length: EVENT_RING_LIMIT + 5 }, (_, i) =>
      event(i, "n", { count: i }),
    );
    const merged = mergeEvents([], many);
    expect(merged).toHaveLength(EVENT_RING_LIMIT);
    expect(merged[0]?.data.count).toBe(5);
  });

  it("reads a broken copy as empty and drops a bad event", () => {
    const storage = memory();
    storage.setItem(FIELD_RING_KEY, "{not json");
    expect(readKeptEvents(storage)).toEqual([]);
    storage.setItem(FIELD_RING_KEY, JSON.stringify({ events: "no" }));
    expect(readKeptEvents(storage)).toEqual([]);
    storage.setItem(FIELD_RING_KEY, JSON.stringify(null));
    expect(readKeptEvents(storage)).toEqual([]);
    storage.setItem(
      FIELD_RING_KEY,
      JSON.stringify({
        events: [
          event(1, "ok", { id: "lantern", stones: 3 }),
          { at: at(2), code: "bad", data: { id: 4 } },
          { at: at(3), code: "bad", data: { other: 1 } },
          { at: at(4), code: "bad", data: [] },
          { at: 5, code: "bad", data: {} },
          null,
        ],
      }),
    );
    expect(readKeptEvents(storage).map((kept) => kept.code)).toEqual(["ok"]);
  });

  it("says so when storage refuses the copy", () => {
    const storage = memory();
    storage.setItem = () => {
      throw new Error("quota");
    };
    expect(keepEvents(storage, [event(1, "a")])).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readKeptEvents(throwing)).toEqual([]);
  });
});
