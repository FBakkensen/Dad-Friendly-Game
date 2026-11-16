import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defineMeasure, parseMeasureExport, resultsOf } from "./measure";
import casual from "./fresh-policies/casual-2x10";
import {
  definePolicy,
  isPolicy,
  parsePolicyExport,
  type Policy,
} from "./policy";
import { assertKnownMeasures, discover, isDiscoveredFile } from "./registry";
import { runPolicy } from "./run";
import { MS_PER_SECOND, TARGETS } from "./targets";

const labDir = path.resolve("src/lab");
const measuresDir = path.join(labDir, "measures");
const bonusDir = path.join(labDir, "fixtures", "measures");
const duplicateDir = path.join(labDir, "fixtures", "duplicates");
const brokenDir = path.join(labDir, "fixtures", "broken");

describe("registry", () => {
  it("loads a fixture folder and shows the extra measure in the results", async () => {
    const registered = await discover(measuresDir, parseMeasureExport, {
      targets: TARGETS,
    });
    const extra = await discover(bonusDir, parseMeasureExport);
    expect(extra.map((measure) => measure.id)).toEqual(["bonusShare"]);
    expect(registered.some((measure) => measure.id === "bonusShare")).toBe(
      false,
    );
    const results = resultsOf(
      [...registered, ...extra],
      [
        {
          atMs: 0,
          liveCount: 1,
          affordableLive: 1,
          bestId: "buyTier:helper",
          bestKind: "buyTier",
          waitToAffordSec: 0,
          crewPerSec: 0,
          pocket: 0,
          outputShare: {},
          optionKinds: ["buyTier"],
          byValue: {
            liveCount: 1,
            affordableLive: 1,
            bestId: "buyTier:helper",
            waitToAffordSec: 0,
            perStone: 0,
          },
          nextPaybackRatio: 1,
          stretch: {
            payback: {
              liveCount: 1,
              affordableLive: 1,
              waitToAffordSec: 0,
              bestId: "buyTier:helper",
            },
            value: {
              liveCount: 1,
              affordableLive: 1,
              waitToAffordSec: 0,
              bestId: "buyTier:helper",
            },
            nextPaybackRatio: 1,
          },
        },
        {
          atMs: 1,
          liveCount: 3,
          affordableLive: 0,
          bestId: "buyTier:cart",
          bestKind: "buyTier",
          waitToAffordSec: 1,
          crewPerSec: 0,
          pocket: 0,
          outputShare: {},
          optionKinds: ["buyTier"],
          byValue: {
            liveCount: 3,
            affordableLive: 0,
            bestId: "buyTier:cart",
            waitToAffordSec: 1,
            perStone: 0,
          },
          nextPaybackRatio: 1,
          stretch: {
            payback: {
              liveCount: 3,
              affordableLive: 0,
              waitToAffordSec: 1,
              bestId: "buyTier:cart",
            },
            value: {
              liveCount: 3,
              affordableLive: 0,
              waitToAffordSec: 1,
              bestId: "buyTier:cart",
            },
            nextPaybackRatio: 1,
          },
        },
      ],
    );
    expect(results.get("bonusShare")).toBe(2);
    expect(results.has("singleShare")).toBe(true);
  });

  it("fails loudly on a duplicate id", async () => {
    await expect(discover(duplicateDir, parseMeasureExport)).rejects.toThrow(
      /Duplicate id "same"/,
    );
  });

  it("fails loudly when a file is not a measure", async () => {
    await expect(discover(brokenDir, parseMeasureExport)).rejects.toThrow(
      /nope\.ts/,
    );
  });

  it("skips test files and accepts an empty folder", async () => {
    expect(isDiscoveredFile("bonus-share.ts")).toBe(true);
    expect(isDiscoveredFile("decoy.test.ts")).toBe(false);
    expect(isDiscoveredFile("notes.md")).toBe(false);
    const empty = mkdtempSync(path.join(tmpdir(), "lab-empty-"));
    await expect(discover(empty, parseMeasureExport)).resolves.toEqual([]);
  });

  it("rejects a bad export, a blank why, and an unknown target", () => {
    expect(() => parseMeasureExport({}, "x.ts")).toThrow(/default export/);
    expect(() => parseMeasureExport({ default: "nope" }, "x.ts")).toThrow(
      /not a measure/,
    );
    expect(() =>
      defineMeasure({
        id: "bare",
        label: "Bare",
        unit: "count",
        why: "nope",
        aggregate: () => 0,
      }),
    ).toThrow(/one line/);
    expect(() => {
      assertKnownMeasures([{ id: "ghost", measure: "missing" }], []);
    }).toThrow(/missing/);
    expect(() => {
      assertKnownMeasures(
        [{ id: "known", measure: "count" }],
        [{ id: "count" }],
      );
    }).not.toThrow();
  });

  it("is the only lab file that reads the filesystem", () => {
    const readers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) {
          continue;
        }
        const text = readFileSync(full, "utf8");
        if (text.includes("node:fs") || text.includes('from "node:fs"')) {
          readers.push(path.relative(labDir, full));
        }
      }
    };
    walk(labDir);
    expect(readers).toEqual(["registry.ts"]);
    const world = readFileSync(path.join(labDir, "world.ts"), "utf8");
    expect(world.includes("registry")).toBe(false);
  });
});

describe("policy registry", () => {
  it("runs a player type that exists only as a file in the folder", async () => {
    const dir = path.join(labDir, "fixtures", "extra");
    const names = readdirSync(dir).filter(isDiscoveredFile).sort();
    const policies = await discover(dir, parsePolicyExport);
    expect(readdirSync(dir).some((name) => name.endsWith(".test.ts"))).toBe(
      true,
    );
    expect(policies).toHaveLength(names.length);
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      const run = runPolicy({ policy, seed: 1, maxLiveSeconds: 1 });
      expect(run.world.clock).toBe(MS_PER_SECOND);
    }
  });

  it("fails loudly when two policies share an id", async () => {
    await expect(
      discover(path.join(labDir, "fixtures", "duplicate"), parsePolicyExport),
    ).rejects.toThrow(/Duplicate id "same-dad"/);
  });

  it("fails loudly when a policy file is not a policy", async () => {
    await expect(
      discover(path.join(labDir, "fixtures", "bad"), parsePolicyExport),
    ).rejects.toThrow(/nope\.ts/);
  });

  it("loads every policy file through the same loader as measures", async () => {
    const dir = path.join(labDir, "fresh-policies");
    const policies = await discover(dir, parsePolicyExport);
    const names = readdirSync(dir)
      .filter(isDiscoveredFile)
      .sort((left, right) => left.localeCompare(right));
    expect(policies.map((policy) => policy.id)).toEqual(
      names.map((name) => name.replace(/\.ts$/, "")),
    );
    expect(policies.some((policy) => policy.kind === "optimizer")).toBe(true);
  });

  it("rejects a default export that is not a player type", () => {
    expect(isPolicy(casual)).toBe(true);
    for (const bad of [null, "casual", [], { ...casual, fresh: undefined }]) {
      expect(isPolicy(bad)).toBe(false);
    }
    for (const id of ["", "-bad", "a--b", "trail-", "NO"]) {
      expect(isPolicy({ ...casual, id })).toBe(false);
    }
    expect(isPolicy({ ...casual, label: "" })).toBe(false);
    expect(isPolicy({ ...casual, kind: "dad" })).toBe(false);
    expect(isPolicy({ ...casual, params: null })).toBe(false);
    expect(isPolicy({ ...casual, schedule: null })).toBe(false);
    expect(
      isPolicy({ ...casual, schedule: { ...casual.schedule, gapMs: 0 } }),
    ).toBe(false);
    expect(
      isPolicy({ ...casual, params: { ...casual.params, sessionsPerDay: 0 } }),
    ).toBe(false);
    expect(
      isPolicy({ ...casual, params: { ...casual.params, hoardK: -1 } }),
    ).toBe(false);
    expect(
      isPolicy({ ...casual, params: { ...casual.params, trouble: "later" } }),
    ).toBe(false);
    // The fresh mine's habits: well formed, or the type is refused.
    for (const fresh of [
      "idle",
      { moves: "idle" },
      { moves: "often", hold: "never", upgrades: false },
      { moves: "once", hold: "sometimes", upgrades: false },
      { moves: "once", hold: "never", upgrades: "yes" },
    ]) {
      expect(isPolicy({ ...casual, fresh })).toBe(false);
    }
    expect(() => {
      parsePolicyExport(null, "x.ts");
    }).toThrow(/default export/);
    expect(() => {
      parsePolicyExport({}, "x.ts");
    }).toThrow(/default export/);
    expect(() => {
      parsePolicyExport({ default: { id: "nope" } }, "x.ts");
    }).toThrow(/not a policy/);
    expect(() => {
      definePolicy({ ...casual, id: "Bad" });
    }).toThrow('Invalid policy "Bad"');
    expect(() =>
      definePolicy({ ...casual, id: 4 } as unknown as Policy),
    ).toThrow('Invalid policy "?"');
  });
});
