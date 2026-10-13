import { describe, expect, it } from "vitest";
import {
  APP_VERSION,
  EVENT_RING_LIMIT,
  EventRing,
  FIELD_LOG_COPY_COUNT,
  formatFieldLog,
  snapshot,
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

describe("snapshot", () => {
  it("names the build, the time, and a fresh mountain in JSON-safe numbers", () => {
    const mountain = createMountain();
    const rates = effectiveRates(mountain, AT);
    const shot = snapshot(mountain, rates, AT, APP_VERSION);

    expect(shot).toEqual({
      version: APP_VERSION,
      at: new Date(AT).toISOString(),
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
    // Two kids run the cart (1 each); a drill needs 3 (#140), so both drills idle.
    expect(shot.idle).toEqual({ cart: 0, drill: 2, borer: 0, machine: 0 });
    expect(shot.relics).toEqual(["lantern"]);
    expect(shot.upgrades.tap).toBe(2);
    expect(shot.upgrades.boots).toBe(0);
    expect(shot.boosts).toEqual([
      { id: "sharper", endsAt: new Date(AT + 60_000).toISOString() },
    ]);
    expect(shot.legacy).toBe(3);
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
  it("keeps the last 200 events and copies the newest slice", () => {
    const ring = new EventRing();
    for (let i = 0; i < EVENT_RING_LIMIT + 1; i += 1) {
      ring.push({ at: "t", code: "n", data: { i } });
    }

    const kept = ring.last(EVENT_RING_LIMIT);
    expect(kept).toHaveLength(EVENT_RING_LIMIT);
    expect(kept[0]?.data["i"]).toBe(1);
    expect(kept.at(-1)?.data["i"]).toBe(EVENT_RING_LIMIT);

    const copied = ring.last(FIELD_LOG_COPY_COUNT);
    expect(copied).toHaveLength(FIELD_LOG_COPY_COUNT);
    expect(copied[0]?.data["i"]).toBe(
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
