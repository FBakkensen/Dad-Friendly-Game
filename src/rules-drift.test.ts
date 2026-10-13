import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BOOSTS } from "./boosts";
import type { Mountain } from "./mountain";
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
    };
    const match = /mountain\.keys\(\)\.hasOnly\(\[([^\]]*)\]\)/.exec(rules);
    const allowed = (match?.[1] ?? "")
      .split(",")
      .map((key) => key.trim().replace(/'/g, ""));
    expect(allowed.sort()).toEqual(Object.keys(everyField).sort());
    expect(rules).toContain("mountain.staffed == true");
    expect(rules).toContain("mountain.staffed == 1");
    expect(rules).toContain("mountain.staffed == 2");
  });
});
