import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BOOSTS } from "./boosts";
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
});
