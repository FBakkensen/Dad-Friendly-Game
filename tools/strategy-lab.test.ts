import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_MAX_DAYS, MONTE_CARLO_SEEDS } from "../src/lab/targets";
import { executeLab, parseLabArgs, seedsFromCount } from "./strategy-lab";

describe("strategy lab command", () => {
  it("defaults to the seed count and the day cap in targets.ts", () => {
    const parsed = parseLabArgs([]);
    expect(parsed).toEqual({
      kind: "run",
      policyIds: [],
      seeds: MONTE_CARLO_SEEDS,
      days: DEFAULT_MAX_DAYS,
      outDir: "reports",
    });
    expect(seedsFromCount(MONTE_CARLO_SEEDS)).toHaveLength(MONTE_CARLO_SEEDS);
    expect(seedsFromCount(3)).toEqual([1, 2, 3]);
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
    const { markdown } = await executeLab(parsed);
    expect(markdown).toContain("Five minutes a day");
    expect(markdown).toContain("Finish day");
    expect(markdown).not.toContain("Casual, two 10-minute sittings");
    const written = readFileSync(path.join(outDir, "strategy-lab.md"), "utf8");
    expect(written).toBe(markdown);
    const json = JSON.parse(
      readFileSync(path.join(outDir, "strategy-lab.json"), "utf8"),
    ) as { readonly rows: readonly { readonly id: string }[] };
    expect(json.rows.map((row) => row.id)).toEqual(["five-min-a-day"]);
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
    expect(result.stdout).toContain("--policy");
    expect(result.stdout).toContain("strategy-lab.md");
  });
});
