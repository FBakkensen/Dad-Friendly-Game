import { describe, expect, it } from "vitest";
import {
  APP_VERSION,
  EVENT_RING_LIMIT,
  EventRing,
  FIELD_EVENT_DATA_KEYS,
  FIELD_LOG_COPY_COUNT,
  FIELD_LOG_DATA_KEYS_MAX,
  FIELD_LOG_MAX_BYTES,
  FIELD_LOG_TEXT_MAX,
  FIELD_LOG_WRITE_GAP_MS,
  fieldEntry,
  fieldErrorId,
  fieldLogDocumentBytes,
  fieldLogFingerprint,
  fieldLogWithinBudget,
  formatFieldLog,
  FIELD_STONES_CAP,
  maxFieldLogDocumentBytes,
  shouldWriteFieldLog,
  snapshot,
  storedDocumentBytes,
  type FieldEventData,
  type FieldSnapshot,
} from "./field-log";
import { MOUNTAIN_STONES, createMountain, type Mountain } from "./mountain";
import { effectiveRates } from "./rates";

const AT = Date.UTC(2026, 0, 2, 3, 4, 5);

function personalKeys(value: unknown, keys: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      personalKeys(item, keys);
    }
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, inner] of Object.entries(value)) {
      keys.add(key);
      personalKeys(inner, keys);
    }
  }
}

describe("fieldErrorId", () => {
  it("keeps a short server error and caps a long one", () => {
    expect(fieldErrorId("permission-denied")).toBe("permission-denied");
    expect(fieldErrorId("  maximum of 1000 expressions reached  ")).toBe(
      "maximum of 1000 expressi",
    );
    expect(fieldErrorId("   ")).toBe("unavailable");
  });
});

describe("snapshot", () => {
  it("names the build, the time, and a fresh mountain in JSON-safe numbers", () => {
    const mountain = createMountain();
    const rates = effectiveRates(mountain, AT);
    const shot = snapshot(mountain, rates, AT, APP_VERSION);

    expect(shot).toEqual({
      version: APP_VERSION,
      at: new Date(AT).toISOString(),
      deviceId: "",
      rev: 0,
      mined: 0,
      left: MOUNTAIN_STONES,
      pocket: 0,
      crew: {
        helper: 0,
        cart: 0,
        drill: 0,
        borer: 0,
        machine: 0,
        kid: 0,
      },
      crewSpeed: rates.crewPerSecond,
      tapYield: rates.tapYield,
      idle: { cart: 0, drill: 0, borer: 0, machine: 0 },
      relics: [],
      upgrades: {
        tap: 0,
        boots: 0,
        steady: 0,
        cartSyn: 0,
        drillSyn: 0,
        borerSyn: 0,
        machineSyn: 0,
      },
      boosts: [],
      legacy: 0,
      engineers: [],
      expeditions: [],
    });
    expect(JSON.parse(JSON.stringify(shot))).toEqual(shot);
  });

  it("counts the crew, idle machines, relics, upgrades, running boosts, and legacy", () => {
    const mountain: Mountain = {
      ...createMountain(),
      remaining: MOUNTAIN_STONES - 1_000_000,
      pocket: 1234,
      helpers: 0,
      carts: 1,
      drills: 2,
      kids: 2,
      upgrades: { tap: 2 },
      boosts: { sharper: AT + 60_000, overtime: AT - 1 },
      legacy: 3,
      engineers: [{ name: "Ada", rank: 1, trips: 3, post: "borer" }],
      expeditions: [
        {
          engineer: "Ada",
          tunnel: "old-shaft",
          sentAt: AT,
          returnsAt: AT + 60_000,
          home: "borer",
          find: { kind: "quiet" },
        },
      ],
    };
    const rates = effectiveRates(mountain, AT);
    const shot = snapshot(mountain, rates, AT, "test-build");

    expect(shot.version).toBe("test-build");
    expect(shot.mined).toBe(1_000_000);
    expect(shot.left).toBe(mountain.remaining);
    expect(shot.pocket).toBe(1234);
    expect(shot.crew).toEqual({
      helper: 0,
      cart: 1,
      drill: 2,
      borer: 0,
      machine: 0,
      kid: 2,
    });
    expect(shot.crewSpeed).toBe(rates.crewPerSecond);
    expect(shot.tapYield).toBe(rates.tapYield);
    // Two kids run both drills (1 each since #252), so the cart idles.
    expect(shot.idle).toEqual({ cart: 1, drill: 0, borer: 0, machine: 0 });
    expect(shot.relics).toEqual(["lantern"]);
    expect(shot.upgrades.tap).toBe(2);
    expect(shot.upgrades.boots).toBe(0);
    expect(shot.boosts).toEqual([
      { id: "sharper", endsAt: new Date(AT + 60_000).toISOString() },
    ]);
    expect(shot.legacy).toBe(3);
    expect(shot.engineers).toEqual([{ name: "Ada", rank: 1, post: "borer" }]);
    expect(shot.expeditions).toEqual([
      {
        engineer: "Ada",
        tunnel: "old-shaft",
        returnsAt: new Date(AT + 60_000).toISOString(),
      },
    ]);
  });

  it("carries no email, display name, or uid", () => {
    const shot: FieldSnapshot = snapshot(
      createMountain(),
      effectiveRates(createMountain()),
      AT,
      APP_VERSION,
    );
    const keys = new Set<string>();
    personalKeys(shot, keys);
    for (const banned of ["email", "label", "uid", "displayName"]) {
      expect(keys.has(banned)).toBe(false);
    }
    expect(JSON.stringify(shot)).not.toContain("@");
  });
});

describe("EventRing", () => {
  it("keeps a deep-band haul whole and clamps only past the cap", () => {
    const ring = new EventRing();
    ring.push({
      at: "x",
      code: "away.report",
      data: { stones: 1_600_000_000 },
    });
    ring.push({ at: "x", code: "away.report", data: { stones: 2e15 } });
    ring.push({ at: "x", code: "vein.tap", data: { stones: 5 } });
    expect(ring.last(3).map((e) => e.data.stones)).toEqual([
      1_600_000_000,
      FIELD_STONES_CAP,
      5,
    ]);
  });

  it("keeps the last 200 events and copies the newest slice", () => {
    const ring = new EventRing();
    for (let i = 0; i < EVENT_RING_LIMIT + 1; i += 1) {
      ring.push({ at: "t", code: "n", data: { count: i } });
    }

    const kept = ring.last(EVENT_RING_LIMIT);
    expect(kept).toHaveLength(EVENT_RING_LIMIT);
    expect(kept[0]?.data.count).toBe(1);
    expect(kept.at(-1)?.data.count).toBe(EVENT_RING_LIMIT);

    const copied = ring.last(FIELD_LOG_COPY_COUNT);
    expect(copied).toHaveLength(FIELD_LOG_COPY_COUNT);
    expect(copied[0]?.data.count).toBe(
      EVENT_RING_LIMIT + 1 - FIELD_LOG_COPY_COUNT,
    );
    expect(ring.last(10_000)).toHaveLength(EVENT_RING_LIMIT);
    expect(ring.last(0)).toEqual([]);
    expect(ring.last(-3)).toEqual([]);
  });

  it("drops the oldest when a short ring overflows", () => {
    const ring = new EventRing(2);
    ring.push({ at: "a", code: "one", data: {} });
    ring.push({ at: "b", code: "two", data: {} });
    expect(ring.last(2).map((event) => event.code)).toEqual(["one", "two"]);
    ring.push({ at: "c", code: "three", data: {} });
    expect(ring.last(2).map((event) => event.code)).toEqual(["two", "three"]);
  });

  it("clears back to empty", () => {
    const ring = new EventRing(2);
    ring.push({ at: "a", code: "one", data: {} });
    ring.clear();
    expect(ring.last(10)).toEqual([]);
    ring.push({ at: "b", code: "two", data: {} });
    expect(ring.last(10).map((event) => event.code)).toEqual(["two"]);
  });

  it("keeps a mark: the events since it, while the whole ring stays", () => {
    const ring = new EventRing(3);
    const codes = (events: readonly { code: string }[]) =>
      events.map((event) => event.code);
    ring.push({ at: "a", code: "one", data: {} });
    expect(codes(ring.sinceMark())).toEqual(["one"]);
    ring.mark();
    expect(ring.sinceMark()).toEqual([]);
    ring.push({ at: "b", code: "two", data: {} });
    ring.push({ at: "c", code: "three", data: {} });
    expect(codes(ring.sinceMark())).toEqual(["two", "three"]);
    expect(codes(ring.last(3))).toEqual(["one", "two", "three"]);
    // The oldest falls off: the mark moves with the events, not their places.
    ring.push({ at: "d", code: "four", data: {} });
    ring.push({ at: "e", code: "five", data: {} });
    expect(codes(ring.sinceMark())).toEqual(["three", "four", "five"]);
    ring.mark();
    ring.clear();
    ring.push({ at: "f", code: "six", data: {} });
    expect(codes(ring.sinceMark())).toEqual(["six"]);
  });
});

describe("formatFieldLog", () => {
  it("pretty-prints the snapshot and only the events it was given", () => {
    const mountain = createMountain();
    const log = formatFieldLog({
      snapshot: snapshot(
        mountain,
        effectiveRates(mountain, AT),
        AT,
        APP_VERSION,
      ),
      events: [
        {
          at: new Date(AT).toISOString(),
          code: "tier.buy",
          data: { id: "helper", count: 1 },
        },
      ],
    });

    expect(log.startsWith("{\n")).toBe(true);
    expect(log).toContain('\n  "snapshot"');
    const parsed = JSON.parse(log) as {
      snapshot: { version: string };
      events: { code: string }[];
    };
    expect(parsed.snapshot.version).toBe(APP_VERSION);
    expect(parsed.events).toEqual([
      {
        at: new Date(AT).toISOString(),
        code: "tier.buy",
        data: { id: "helper", count: 1 },
      },
    ]);
  });
});

describe("field log cloud copy", () => {
  it("names exactly the data keys the rules allow", () => {
    const sample: Required<FieldEventData> = {
      id: "helper",
      count: 1,
      endsAt: new Date(AT).toISOString(),
      ms: 1,
      stones: 1,
      source: "write",
    };
    expect(Object.keys(sample).sort()).toEqual(
      [...FIELD_EVENT_DATA_KEYS].sort(),
    );
    expect(FIELD_LOG_DATA_KEYS_MAX).toBe(2);
    expect(sample.endsAt.length).toBeLessThanOrEqual(FIELD_LOG_TEXT_MAX);
  });

  it("ignores the snapshot clock when deciding the log changed", () => {
    const mountain = createMountain();
    const shot = snapshot(
      mountain,
      effectiveRates(mountain, AT),
      AT,
      APP_VERSION,
    );
    const same = fieldLogFingerprint({ snapshot: shot, events: [] });
    expect(
      fieldLogFingerprint({
        snapshot: { ...shot, at: "other" },
        events: [],
      }),
    ).toBe(same);
    expect(
      fieldLogFingerprint({
        snapshot: { ...shot, pocket: 1 },
        events: [],
      }),
    ).not.toBe(same);
    expect(
      fieldLogFingerprint({
        snapshot: shot,
        events: [{ at: "t", code: "vein.tap", data: { stones: 1 } }],
      }),
    ).not.toBe(same);
  });

  it("writes a change at once, then only after the gap, and always on hide or reset", () => {
    expect(
      shouldWriteFieldLog({
        changed: false,
        lastWrittenAt: undefined,
        now: 0,
        reason: "hide",
      }),
    ).toBe(false);
    expect(
      shouldWriteFieldLog({
        changed: false,
        lastWrittenAt: 0,
        now: FIELD_LOG_WRITE_GAP_MS,
        reason: "interval",
      }),
    ).toBe(false);
    expect(
      shouldWriteFieldLog({
        changed: true,
        lastWrittenAt: undefined,
        now: 0,
        reason: "interval",
      }),
    ).toBe(true);
    expect(
      shouldWriteFieldLog({
        changed: true,
        lastWrittenAt: 0,
        now: FIELD_LOG_WRITE_GAP_MS - 1,
        reason: "interval",
      }),
    ).toBe(false);
    expect(
      shouldWriteFieldLog({
        changed: true,
        lastWrittenAt: 0,
        now: FIELD_LOG_WRITE_GAP_MS,
        reason: "interval",
      }),
    ).toBe(true);
    expect(
      shouldWriteFieldLog({
        changed: true,
        lastWrittenAt: 1_000,
        now: 0,
        reason: "interval",
        gapMs: 500,
      }),
    ).toBe(false);
    expect(
      shouldWriteFieldLog({
        changed: true,
        lastWrittenAt: 1_000,
        now: 1_000,
        reason: "hide",
      }),
    ).toBe(true);
    expect(
      shouldWriteFieldLog({
        changed: true,
        lastWrittenAt: 1_000,
        now: 1_000,
        reason: "reset",
      }),
    ).toBe(true);
  });

  it("matches the Firestore size example and stays under 50 KB at the cap", () => {
    expect(
      storedDocumentBytes(["users", "jeff", "tasks", "my_task_id"], {
        type: "Personal",
        done: false,
        priority: 1,
        description: "Learn Cloud Firestore",
      }),
    ).toBe(147);
    expect(maxFieldLogDocumentBytes()).toBeLessThan(FIELD_LOG_MAX_BYTES);

    const mountain = createMountain();
    const full = {
      snapshot: snapshot(
        mountain,
        effectiveRates(mountain, AT),
        AT,
        APP_VERSION,
      ),
      events: Array.from({ length: EVENT_RING_LIMIT }, (_, index) => ({
        at: new Date(AT).toISOString(),
        code: "tier.buy",
        data: { id: "helper", count: index },
      })),
      updatedAt: AT,
    };
    expect(fieldLogWithinBudget(full)).toBe(true);
    expect(fieldLogDocumentBytes(full, 28)).toBeLessThan(
      fieldLogDocumentBytes(full),
    );
    expect(() =>
      storedDocumentBytes(["fieldLogs", "dad"], { bad: undefined }),
    ).toThrow(/unsupported/);
  });
});

describe("fieldEntry", () => {
  it("maps each move event to today's ring entry", () => {
    expect(fieldEntry({ kind: "tierBought", id: "cart", count: 3 })).toEqual({
      code: "tier.buy",
      data: { id: "cart", count: 3 },
    });
    expect(fieldEntry({ kind: "upgradeBought", id: "tap", level: 2 })).toEqual({
      code: "upgrade.buy",
      data: { id: "tap", count: 2 },
    });
    expect(
      fieldEntry({ kind: "boostStarted", id: "sharper", endsAt: AT }),
    ).toEqual({
      code: "boost.start",
      data: { id: "sharper", endsAt: "2026-01-02T03:04:05.000Z" },
    });
    expect(fieldEntry({ kind: "craftStarted", recipe: "iron-rails" })).toEqual({
      code: "craft.start",
      data: { id: "iron-rails" },
    });
    expect(fieldEntry({ kind: "promoted", name: "Nils", crew: 2 })).toEqual({
      code: "engineer.promote",
      data: { id: "Nils", count: 2 },
    });
    expect(
      fieldEntry({ kind: "sent", name: "Ada", tunnel: "side-seam" }),
    ).toEqual({
      code: "expedition.send",
      data: { id: "Ada", source: "side-seam" },
    });
    expect(
      fieldEntry({ kind: "recalled", name: "Ada", tunnel: "old-shaft" }),
    ).toEqual({
      code: "expedition.recall",
      data: { id: "Ada", source: "old-shaft" },
    });
    expect(
      fieldEntry({ kind: "stationed", name: "Ada", post: "camp" }),
    ).toEqual({
      code: "engineer.station",
      data: { id: "Ada", source: "camp" },
    });
    expect(fieldEntry({ kind: "veinTapped", stones: 60 })).toEqual({
      code: "vein.tap",
      data: { stones: 60 },
    });
  });
});
