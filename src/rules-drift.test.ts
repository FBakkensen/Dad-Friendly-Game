import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BOOSTS } from "./boosts";
import {
  ENGINEER_NAMES,
  ENGINEER_POSTS,
  MAX_ENGINEERS,
  MAX_ENGINEER_TRIPS,
} from "./engineers";
import {
  FIND_IDS,
  MAX_EXPEDITION_MS,
  MAX_EXPEDITIONS,
  TUNNELS,
} from "./expeditions";
import {
  EVENT_RING_LIMIT,
  FIELD_EVENT_DATA_KEYS,
  FIELD_LOG_DATA_KEYS_MAX,
  FIELD_LOG_TEXT_MAX,
  snapshot,
  type FieldLogDocument,
} from "./field-log";
import { createMountain, type Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import { UPGRADES } from "./upgrades";

/**
 * Fast guard (no emulator): firestore.rules must list every upgrade and boost
 * the game saves, with the same top level. The emulator test (npm run
 * test:rules) checks the writes themselves.
 */
const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

const listed = (field: string): string[] => {
  const match = new RegExp(
    String.raw`mountain\.${field}\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)`,
  ).exec(rules);
  return (match?.[1] ?? "").split(",").map((id) => id.trim().replace(/'/g, ""));
};

describe("firestore.rules match the game", () => {
  it("allows every upgrade id, up to its max level", () => {
    expect(listed("upgrades").sort()).toEqual(
      UPGRADES.map((upgrade) => upgrade.id).sort(),
    );
    for (const upgrade of UPGRADES) {
      expect(rules).toContain(
        `mountain.upgrades.${upgrade.id} <= ${String(upgrade.maxLevel)}`,
      );
    }
  });

  it("allows every boost id", () => {
    expect(listed("boosts").sort()).toEqual(
      BOOSTS.map((boost) => boost.id).sort(),
    );
  });

  it("allows exactly the mountain's save fields (#118)", () => {
    // Required<Mountain>: a new save field fails typecheck here until it's
    // listed, and then this test fails until firestore.rules allows it.
    const everyField: Required<Mountain> = {
      remaining: 0,
      pocket: 0,
      helpers: 0,
      carts: 0,
      drills: 0,
      borers: 0,
      machines: 0,
      kids: 0,
      upgrades: {},
      boosts: {},
      startedAt: 0,
      staffed: 2,
      legacy: 0,
      engineers: [{ name: "Ada", rank: 1, trips: 3, post: "tunnel" }],
      expeditions: [
        {
          engineer: "Ada",
          tunnel: "side-seam",
          sentAt: 1,
          returnsAt: 1 + 10 * 60_000,
          home: "borer",
          find: { kind: "quiet" },
        },
      ],
      finds: ["pick"],
      materials: { clay: 0, iron: 0, crystal: 0, heartstone: 0 },
      bench: {
        recipe: "iron-rails",
        startedAt: 1,
        endsAt: 1 + 60_000,
      },
      crafted: { "iron-rails": 1 },
      recipes: ["iron-rails"],
      chargeUntil: 1,
    };
    const match = /mountain\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/.exec(rules);
    const allowed = (match?.[1] ?? "")
      .split(",")
      .map((key) => key.trim().replace(/'/g, ""));
    // Materials, the bench, crafted gear, and recipes sit beside the mountain
    // in a v6 document. The mountain key list cannot grow (#195).
    const beside = ["materials", "bench", "crafted", "recipes", "chargeUntil"];
    expect(allowed.sort()).toEqual(
      Object.keys(everyField)
        .filter((key) => !beside.includes(key))
        .sort(),
    );
    expect(rules).toContain(
      "hasOnlyAllowedFields(['version', 'mountain', 'lastSeen', 'workshop'])",
    );
    expect(rules).toContain("mountain.staffed == true");
    expect(rules).toContain("mountain.staffed == 1");
    expect(rules).toContain("mountain.staffed == 2");
  });

  it("allows engineers from the closed list, and nothing past the caps (#144)", () => {
    for (const name of ENGINEER_NAMES) {
      expect(rules).toContain(`'${name}'`);
    }
    for (const post of ENGINEER_POSTS) {
      expect(rules).toContain(`'${post}'`);
    }
    expect(rules).toContain(`engineers.size() <= ${String(MAX_ENGINEERS)}`);
    expect(rules).toContain(`engineer.trips <= ${String(MAX_ENGINEER_TRIPS)}`);
    expect(rules).toContain("engineer.trips >= 9 ? 2");
  });

  it("allows expeditions and finds from the closed lists (#146)", () => {
    for (const tunnel of TUNNELS) {
      expect(rules).toContain(`'${tunnel.id}'`);
    }
    expect(rules).toContain(`expeditions.size() <= ${String(MAX_EXPEDITIONS)}`);
    expect(rules).toContain(`finds.size() <= ${String(FIND_IDS.length)}`);
    expect(rules).toContain("trip.returnsAt > trip.sentAt");
    expect(rules).toContain(String(MAX_EXPEDITION_MS));
  });

  it("accepts a v6 workshop map beside the mountain (#195)", () => {
    expect(rules).toContain("data.version == 6");
    expect(rules).toContain("data.workshop is map");
    expect(rules).toContain(
      "hasOnlyAllowedFields(['version', 'mountain', 'lastSeen', 'workshop'])",
    );
  });

  it("allows exactly the field log document (#142)", () => {
    const keys = (pattern: RegExp): string[] => {
      const match = pattern.exec(rules);
      return (match?.[1] ?? "")
        .split(",")
        .map((key) => key.trim().replace(/'/g, ""));
    };
    const shot = snapshot(
      createMountain(),
      effectiveRates(createMountain(), 1),
      1,
      "0.0.0",
    );
    const doc: FieldLogDocument = { snapshot: shot, events: [], updatedAt: 1 };
    expect(keys(/shot\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/).sort()).toEqual(
      Object.keys(shot).sort(),
    );
    expect(keys(/data\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/).sort()).toEqual(
      Object.keys(doc).sort(),
    );
    expect(keys(/eventData\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/).sort()).toEqual(
      [...FIELD_EVENT_DATA_KEYS].sort(),
    );
    expect(rules).toContain(`events.size() <= ${String(EVENT_RING_LIMIT)}`);
    expect(rules).toContain(
      `eventData.size() <= ${String(FIELD_LOG_DATA_KEYS_MAX)}`,
    );
    expect(rules).toContain(`value.size() <= ${String(FIELD_LOG_TEXT_MAX)}`);
    const block =
      /match \/fieldLogs\/\{userId\} \{([\s\S]*?)\n {4}\}/.exec(rules)?.[1] ??
      "";
    expect(block).toContain("allow read: if isOwner(userId)");
    expect(block).toContain("isFieldLog(request.resource.data)");
    expect(block).toContain("allow delete: if false");
  });
});
