// @vitest-environment node
import { describe, expect, it } from "vitest";
import { withFactors } from "../../src/economy/factors.ts";
import { PLAY_FACTORS } from "../../src/part-switch.ts";
import { readSave } from "../../src/persist.ts";
import { phoneBackupKey } from "../../src/phone-backup.ts";
import * as f from "./fixtures.ts";

/** Any fixed clock: every save takes its own `now`. */
const FIXED = 1_700_000_000_000;

/** Every slice 1 save the browser scripts and the journeys seed. */
const SLICE_SAVES = Object.entries(f).filter(
  (entry): entry is [string, (now: number) => f.SeedSave] =>
    entry[0].startsWith("slice") && typeof entry[1] === "function",
);

describe("fixtures values", () => {
  it("exports the save key", () => {
    expect(f.SAVE_KEY).toBe("dad-friendly-game");
  });

  it("stores a value as it is, and a later build's save reads newer", () => {
    expect(f.seedJson({})).toBe("{}");
    expect(readSave(JSON.parse(f.seedJson(f.newerSave(FIXED))))).toEqual({
      kind: "newer",
      version: 11,
    });
  });
});

describe("slice 1's play saves (#659)", () => {
  it("seeds the dev account's phone backup, which the game reads", () => {
    expect(f.DEV_BACKUP_KEY).toBe(phoneBackupKey(f.DEV_UID));
  });

  it("holds every slice save the scripts play", () => {
    expect(SLICE_SAVES.length).toBeGreaterThanOrEqual(14);
  });

  it.each(SLICE_SAVES)(
    "%s is a version 10 save of the dev account that the game reads, as it plays",
    (_name, build) => {
      const stored = build(FIXED) as { uid?: unknown; save?: unknown };
      expect(stored.uid).toBe(f.DEV_UID);
      const read = withFactors(PLAY_FACTORS, () => readSave(stored.save));
      expect(read.kind).toBe("ok");
    },
  );

  it("plays a slice save as a guest's: the document inside the backup", () => {
    const backup = f.sliceBusySave(FIXED);
    expect(f.asGuest(backup)).toBe(backup["save"]);
    expect(() => f.asGuest(f.newerSave(FIXED))).toThrow(/Not a phone backup/);
  });
});
