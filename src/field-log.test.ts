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
import { createMountain, type Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { NO_UPGRADES } from "./upgrades";

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
      pocket: 0,
      // Every tier and every machine by id, the line's included (#559).
      crew: {
        helper: createMountain().owned.helper,
        cart: 0,
        hoist: 0,
        drill: 0,
        borer: 0,
        train: 0,
        machine: 0,
        kid: 0,
      },
      crewSpeed: rates.crewPerSecond,
      idle: { cart: 0, hoist: 0, drill: 0, borer: 0, train: 0, machine: 0 },
      upgrades: {
        boots: 0,
        cartSyn: 0,
        drillSyn: 0,
        borerSyn: 0,
        machineSyn: 0,
      },
      engineers: [],
      expeditions: [],
    });
    expect(JSON.parse(JSON.stringify(shot))).toEqual(shot);
  });

  it("counts the crew, idle machines and upgrades, and keeps no legacy, mined or left (#729, #740)", () => {
    const mountain: Mountain = {
      ...createMountain(),
      stock: { ...createMountain().stock, stones: 1234 },
      owned: {
        ...createMountain().owned,
        helper: 0,
        cart: 1,
        drill: 2,
        kid: 2,
      },
      upgrades: { ...NO_UPGRADES, boots: 1 },
      engineers: [{ name: "Ada", rank: 1, trips: 3, post: "borer" }],
      expeditions: [
        {
          engineer: "Ada",
          tunnel: "old-shaft",
          sentAt: AT,
          returnsAt: AT + 60_000,
          find: { kind: "quiet" },
        },
      ],
    };
    const rates = effectiveRates(mountain, AT);
    const shot = snapshot(mountain, rates, AT, "test-build");

    expect(shot.version).toBe("test-build");
    expect(shot.pocket).toBe(1234);
    expect(shot.crew).toEqual({
      helper: 0,
      cart: 1,
      hoist: 0,
      train: 0,
      drill: 2,
      borer: 0,
      machine: 0,
      kid: 2,
    });
    expect(shot.crewSpeed).toBe(rates.crewPerSecond);
    // The one worker on drilling runs one drill, and nobody hauls, so the
    // cart and the other drill stand idle.
    expect(shot.idle).toEqual({
      cart: 1,
      hoist: 0,
      drill: 1,
      borer: 0,
      train: 0,
      machine: 0,
    });
    expect(shot.upgrades.boots).toBe(1);
    expect(shot.upgrades.cartSyn).toBe(0);
    expect(shot).not.toHaveProperty("legacy");
    expect(shot).not.toHaveProperty("mined");
    expect(shot).not.toHaveProperty("left");
    // Away on the trip below, so the log reads the saved post.
    expect(shot.engineers).toEqual([{ name: "Ada", rank: 1, post: "tunnel" }]);
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
    ring.push({ at: "x", code: "away.report", data: { stones: 5 } });
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

  it("restores kept events behind the mark, capped at its length", () => {
    const ring = new EventRing(2);
    ring.push({ at: "a", code: "one", data: {} });
    const before = ring.pushes;
    ring.restore([
      { at: "b", code: "two", data: {} },
      { at: "c", code: "three", data: {} },
      { at: "d", code: "four", data: {} },
    ]);
    expect(ring.pushes).toBeGreaterThan(before);
    expect(ring.last(10).map((event) => event.code)).toEqual(["three", "four"]);
    expect(ring.sinceMark()).toEqual([]);
    ring.push({ at: "e", code: "five", data: {} });
    expect(ring.sinceMark().map((event) => event.code)).toEqual(["five"]);
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
    ring.push({ at: "f", code: "six", data: {} });
    expect(codes(ring.sinceMark())).toEqual(["six"]);
    expect(codes(ring.last(3))).toEqual(["four", "five", "six"]);
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
        events: [{ at: "t", code: "away.report", data: { stones: 1 } }],
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
    expect(
      fieldEntry({ kind: "upgradeBought", id: "boots", level: 1 }),
    ).toEqual({
      code: "upgrade.buy",
      data: { id: "boots", count: 1 },
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
  });

  it("maps part 2's kilns and stockyard levels (#667)", () => {
    expect(fieldEntry({ kind: "makerBought", id: "kiln", count: 3 })).toEqual({
      code: "maker.buy",
      data: { id: "kiln", count: 3 },
    });
    expect(fieldEntry({ kind: "stockyardExpanded", level: 2 })).toEqual({
      code: "stockyard.expand",
      data: { count: 2 },
    });
  });

  it("maps a fresh mine's orders and wagons (#654)", () => {
    expect(
      fieldEntry({ kind: "vehicleBought", id: "horseWagon", count: 2 }),
    ).toEqual({ code: "vehicle.buy", data: { id: "horseWagon", count: 2 } });
    for (const [kind, code] of [
      ["orderPlaced", "order.place"],
      ["orderHeld", "order.hold"],
      ["orderResumed", "order.resume"],
    ] as const) {
      expect(fieldEntry({ kind, building: "lightTower" })).toEqual({
        code,
        data: { id: "lightTower" },
      });
    }
  });
});
