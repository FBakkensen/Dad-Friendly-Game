import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CI_SEEDS,
  DEFAULT_MAX_DAYS,
  LOCAL_SEEDS,
  TARGETS,
} from "../src/lab/targets";
import {
  LEDGER_PATH,
  executeLab,
  ledgerVerdict,
  parseLabArgs,
  seedsFromCount,
} from "./strategy-lab";

describe("strategy lab command", () => {
  it("defaults to the seed count and the day cap in targets.ts", () => {
    const parsed = parseLabArgs([]);
    expect(parsed).toEqual({
      kind: "run",
      policyIds: [],
      seeds: LOCAL_SEEDS,
      days: DEFAULT_MAX_DAYS,
      outDir: "reports",
      factors: {},
      ledger: "off",
    });
    expect(seedsFromCount(LOCAL_SEEDS)).toHaveLength(LOCAL_SEEDS);
    expect(seedsFromCount(CI_SEEDS)).toHaveLength(CI_SEEDS);
    expect(seedsFromCount(LOCAL_SEEDS)[0]).toBe(1);
    expect(seedsFromCount(LOCAL_SEEDS).at(-1)).toBe(LOCAL_SEEDS);
    expect(parseLabArgs(["--ci"])).toMatchObject({
      kind: "run",
      seeds: CI_SEEDS,
    });
    expect(parseLabArgs(["--ci", "--seeds", "1"])).toMatchObject({
      kind: "run",
      seeds: 1,
    });
  });

  it("reads flags and rejects a bad one", () => {
    expect(
      parseLabArgs(["--policy", "tap-only", "--seeds", "1", "--days", "4"]),
    ).toMatchObject({
      kind: "run",
      policyIds: ["tap-only"],
      seeds: 1,
      days: 4,
    });
    expect(parseLabArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseLabArgs(["--seeds", "0"]).kind).toBe("error");
    expect(parseLabArgs(["--policy"]).kind).toBe("error");
    expect(parseLabArgs(["--nope"]).kind).toBe("error");
  });

  it("reads sweep factors for every run, and rejects a bad pair (#534)", () => {
    expect(
      parseLabArgs(["--factors", "line.off=0,layer.3.cart.hardness=0.8"]),
    ).toMatchObject({
      kind: "run",
      factors: { "line.off": 0, "layer.3.cart.hardness": 0.8 },
    });
    expect(
      parseLabArgs(["--factors", "a=.5,b=1e-3", "--factors", "c=2"]),
    ).toMatchObject({ factors: { a: 0.5, b: 0.001, c: 2 } });
    expect(
      parseLabArgs(["--factors", "recipe.iron-rails.cost=0.5"]),
    ).toMatchObject({ factors: { "recipe.iron-rails.cost": 0.5 } });
    expect(parseLabArgs(["--factors"]).kind).toBe("error");
    expect(parseLabArgs(["--factors", "line.off"]).kind).toBe("error");
    expect(parseLabArgs(["--factors", "line.off=x"]).kind).toBe("error");
  });

  it("checks or writes the pacing ledger only on the gate's run (#554)", () => {
    expect(parseLabArgs(["--ci", "--ledger", "check"])).toMatchObject({
      kind: "run",
      ledger: "check",
    });
    expect(parseLabArgs(["--ci", "--ledger", "write"])).toMatchObject({
      ledger: "write",
    });
    expect(parseLabArgs(["--ci", "--ledger", "maybe"]).kind).toBe("error");
    expect(parseLabArgs(["--ledger", "check"]).kind).toBe("error");
    expect(
      parseLabArgs(["--ci", "--ledger", "check", "--policy", "tap-only"]).kind,
    ).toBe("error");
    expect(
      parseLabArgs(["--ci", "--ledger", "check", "--factors", "line.off=0"])
        .kind,
    ).toBe("error");
    expect(
      parseLabArgs(["--ci", "--ledger", "check", "--days", "4"]).kind,
    ).toBe("error");
  });

  it("passes a matching ledger, and fails a moved or missing one with the diff (#554)", () => {
    const committed = "# Pacing ledger\n\n| alpha | 1 | 5.00 |\n";
    expect(ledgerVerdict(committed, committed).code).toBe(0);
    const moved = ledgerVerdict(
      committed,
      "# Pacing ledger\n\n| alpha | 1 | 5.25 |\n",
    );
    expect(moved.code).toBe(1);
    expect(moved.lines).toEqual(
      expect.arrayContaining([
        "- | alpha | 1 | 5.00 |",
        "+ | alpha | 1 | 5.25 |",
      ]),
    );
    expect(moved.lines.join("\n")).toContain("npm run lab:ledger");
    const missing = ledgerVerdict(undefined, committed);
    expect(missing.code).toBe(1);
    expect(missing.lines[0]).toContain(LEDGER_PATH);
  });

  it("writes a markdown and json report for one short policy", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "strategy-lab-"));
    const parsed = parseLabArgs([
      "--policy",
      "five-min-a-day",
      "--seeds",
      "1",
      "--days",
      "1",
      "--out",
      outDir,
    ]);
    expect(parsed.kind).toBe("run");
    if (parsed.kind !== "run") {
      return;
    }
    const { markdown, checks } = await executeLab(parsed);
    expect(checks.map((check) => check.targetId)).toEqual(
      TARGETS.map((target) => target.id),
    );
    expect(markdown).toContain("Five minutes a day");
    expect(markdown).toContain("Finish day");
    expect(markdown).not.toContain("Casual, two 10-minute sittings");
    const written = readFileSync(path.join(outDir, "strategy-lab.md"), "utf8");
    expect(written).toBe(markdown);
    const json = JSON.parse(
      readFileSync(path.join(outDir, "strategy-lab.json"), "utf8"),
    ) as { readonly rows: readonly { readonly id: string }[] };
    expect(json.rows.map((row) => row.id)).toEqual(["five-min-a-day"]);
    const ledger = readFileSync(path.join(outDir, "pacing-ledger.md"), "utf8");
    expect(ledger).toContain("| five-min-a-day | 1 |");
  });

  it("plays the line under --factors line.off=0 and says so in the report (#534)", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "strategy-lab-"));
    const parsed = parseLabArgs([
      "--policy",
      "five-min-a-day",
      "--seeds",
      "1",
      "--days",
      "1",
      "--factors",
      "line.off=0",
      "--out",
      outDir,
    ]);
    expect(parsed.kind).toBe("run");
    if (parsed.kind !== "run") {
      return;
    }
    const { markdown } = await executeLab(parsed);
    expect(markdown).toContain("Factors: line.off=0");
    expect(markdown).toContain("Longest run on one narrow stage");
    const json = JSON.parse(
      readFileSync(path.join(outDir, "strategy-lab.json"), "utf8"),
    ) as {
      readonly rows: readonly {
        readonly cells: Readonly<Record<string, { readonly value: unknown }>>;
      }[];
    };
    // One day of five minutes plays at least one sitting on the line.
    expect(json.rows[0]?.cells["narrowRun"]?.value).toBeGreaterThanOrEqual(1);
  });

  it("fails on an unknown policy id", async () => {
    const parsed = parseLabArgs(["--policy", "no-such-dad", "--days", "1"]);
    expect(parsed.kind).toBe("run");
    if (parsed.kind !== "run") {
      return;
    }
    await expect(executeLab(parsed)).rejects.toThrow(/no-such-dad/);
  });

  it("prints help under node before it plays a run", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "./tools/lab-register.mjs",
        "tools/strategy-lab.ts",
        "--help",
      ],
      { encoding: "utf8", cwd: path.resolve(".") },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--seeds");
    expect(result.stdout).toContain("--ci");
    expect(result.stdout).toContain("--policy");
    expect(result.stdout).toContain("strategy-lab.md");
  });
});
