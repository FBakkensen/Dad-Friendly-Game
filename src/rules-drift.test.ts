import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EVENT_RING_LIMIT,
  FIELD_EVENT_DATA_KEYS,
  FIELD_LOG_DATA_KEYS_MAX,
  FIELD_LOG_TEXT_MAX,
  snapshot,
  type FieldLogDocument,
} from "./field-log";
import { ARCHIVE_REASONS } from "./cloud-save";
import { DEVICE_ID_MAX } from "./device-id";
import { createMountain } from "./mountain";
import { SAVE_VERSION, type SaveDocument } from "./persist";
import { effectiveRates } from "./rates";

/**
 * Fast guard (no emulator): firestore.rules must take the envelope this
 * version writes (#558) and the field log. The game map is the client's to
 * read, so a new game field needs no rules change. The emulator test
 * (npm run test:rules) checks the writes themselves.
 */
const rules = readFileSync(resolve(process.cwd(), "firestore.rules"), "utf8");

const listedKeys = (pattern: RegExp): string[] =>
  (pattern.exec(rules)?.[1] ?? "")
    .split(",")
    .map((key) => key.trim().replace(/'/g, ""));

/** The body of one `match` block. */
const block = (path: string): string => {
  const start = rules.indexOf(`match ${path} {`);
  return start < 0 ? "" : rules.slice(start, rules.indexOf("\n    }", start));
};

describe("firestore.rules match the game", () => {
  it("allows exactly the save's envelope (#558)", () => {
    // Required<SaveDocument>: a new envelope field fails typecheck here until
    // it is listed, and then this test fails until firestore.rules takes it.
    const everyField: Required<SaveDocument> & { savedAt: unknown } = {
      version: SAVE_VERSION,
      lastSeen: 1,
      startedAt: 1,
      rev: 1,
      deviceId: "device-0001",
      deviceLabel: "Chrome on Android",
      game: {},
      savedAt: 1,
    };
    const game = listedKeys(
      /function isGame\(data\) \{\s*return data\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/,
    );
    expect(game.sort()).toEqual(Object.keys(everyField).sort());
    expect(rules).toContain(`data.version >= ${String(SAVE_VERSION)}`);
    expect(rules).toContain(`value.size() <= ${String(DEVICE_ID_MAX)}`);
    expect(rules).toContain("data.game is map");
  });

  it("requires a rev that moves by one, a later or equal version and run, and a server timestamp", () => {
    const games = block("/games/{userId}");
    expect(games).toContain("request.resource.data.rev == 1");
    expect(games).toContain(
      "request.resource.data.rev == resource.data.get('rev', 0) + 1",
    );
    expect(games).toContain(
      "request.resource.data.version >= resource.data.version",
    );
    expect(games).toContain(
      "gameStart(request.resource.data) >= gameStart(resource.data)",
    );
    expect(games).toContain("allow delete: if false");
    expect(rules).toContain("data.savedAt == request.time");
  });

  it("keeps the saves from before version 8 read-only (#558)", () => {
    for (const path of [
      "/saves/{userId}",
      "/saveArchive/{userId}/copies/{copyId}",
    ]) {
      const old = block(path);
      expect(old).toContain("allow read: if isOwner(userId)");
      expect(old).toContain("allow write: if false");
      expect(old).not.toContain("allow create");
      expect(old).not.toContain("allow update");
    }
  });

  it("allows exactly the field log document (#142)", () => {
    const keys = listedKeys;
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
    expect(
      keys(
        /function isFieldLog\(data\) \{\s*return data\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/,
      ).sort(),
    ).toEqual(Object.keys(doc).sort());
    expect(keys(/eventData\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/).sort()).toEqual(
      [...FIELD_EVENT_DATA_KEYS].sort(),
    );
    expect(rules).toContain(`events.size() <= ${String(EVENT_RING_LIMIT)}`);
    expect(rules).toContain(
      `eventData.size() <= ${String(FIELD_LOG_DATA_KEYS_MAX)}`,
    );
    expect(rules).toContain(`value.size() <= ${String(FIELD_LOG_TEXT_MAX)}`);
    const account = block("/fieldLogs/{userId}");
    expect(account).toContain("allow read: if isOwner(userId)");
    expect(account).toContain("isFieldLog(request.resource.data)");
    expect(account).toContain("allow delete: if false");
    const device = block("/fieldLogs/{userId}/devices/{deviceId}");
    expect(device).toContain("allow read: if isOwner(userId)");
    expect(device).toContain("isFieldLog(request.resource.data)");
    expect(device).toContain(`deviceId.size() <= ${String(DEVICE_ID_MAX)}`);
    expect(device).toContain("allow delete: if false");
  });

  it("takes every reason a copy is archived for (#480, #558)", () => {
    const match = /data\.reason in \[([^\]]*)\]/.exec(rules);
    const listedReasons = (match?.[1] ?? "")
      .split(",")
      .map((id) => id.trim().replace(/'/g, ""));
    expect(listedReasons.sort()).toEqual([...ARCHIVE_REASONS].sort());
  });
});
