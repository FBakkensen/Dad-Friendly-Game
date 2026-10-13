import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defineMeasure, parseMeasureExport, resultsOf } from "./measure";
import { assertKnownMeasures, discover, isDiscoveredFile } from "./registry";
import { TARGETS } from "./targets";

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
