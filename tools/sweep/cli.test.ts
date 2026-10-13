import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CASUAL_REFERENCE_ID, DEFAULT_MAX_DAYS } from "../../src/lab/targets";
import {
  DEFAULT_MEASURE_IDS,
  DEFAULT_SAMPLES,
  DEFAULT_SEED,
  DEFAULT_TOP,
  DEFAULT_TRAJECTORIES,
} from "./sweep";
import { executeSweep, parseSweepArgs } from "./cli";

describe("sweep command", () => {
  it("defaults to the casual dad and the registered measures", () => {
    const parsed = parseSweepArgs([]);
    expect(parsed).toEqual({
      kind: "run",
      policyId: CASUAL_REFERENCE_ID,
      measureIds: [...DEFAULT_MEASURE_IDS],
      seed: DEFAULT_SEED,
      trajectories: DEFAULT_TRAJECTORIES,
      samples: DEFAULT_SAMPLES,
      top: DEFAULT_TOP,
      days: DEFAULT_MAX_DAYS,
      outDir: "reports",
    });
  });

  it("reads flags and rejects a bad one", () => {
    expect(
      parseSweepArgs([
        "--policy",
        "tap-only",
        "--measure",
        "finishDay",
        "--measure",
        "singleShare",
        "--seed",
        "0",
        "--morris",
        "2",
        "--sobol",
        "4",
        "--top",
        "1",
        "--days",
        "3",
      ]),
    ).toMatchObject({
      kind: "run",
      policyId: "tap-only",
      measureIds: ["finishDay", "singleShare"],
      seed: 0,
      trajectories: 2,
      samples: 4,
      top: 1,
      days: 3,
    });
    expect(parseSweepArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseSweepArgs(["--morris", "0"]).kind).toBe("error");
    expect(parseSweepArgs(["--seed", "-1"]).kind).toBe("error");
    expect(parseSweepArgs(["--policy"]).kind).toBe("error");
    expect(parseSweepArgs(["--policy", "a", "--policy", "b"]).kind).toBe(
      "error",
    );
    expect(parseSweepArgs(["--nope"]).kind).toBe("error");
  });

  it("writes two identical reports for one short policy", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "sweep-"));
    const parsed = parseSweepArgs([
      "--policy",
      "five-min-a-day",
      "--measure",
      "singleShare",
      "--days",
      "1",
      "--morris",
      "1",
      "--sobol",
      "2",
      "--top",
      "1",
      "--seed",
      "1",
      "--out",
      outDir,
    ]);
    expect(parsed.kind).toBe("run");
    if (parsed.kind !== "run") {
      return;
    }
    const first = await executeSweep(parsed);
    const second = await executeSweep(parsed);
    expect(second.markdown).toBe(first.markdown);
    expect(first.markdown).toContain("| Knob | S1 | ST |");
    expect(first.markdown).toContain("five-min-a-day");
    expect(first.markdown).toContain("Single option");
    expect(readFileSync(path.join(outDir, "sweep.md"), "utf8")).toBe(
      first.markdown,
    );
  });

  it("fails on an unknown policy", async () => {
    const parsed = parseSweepArgs([
      "--policy",
      "no-such-dad",
      "--days",
      "1",
      "--morris",
      "1",
      "--sobol",
      "1",
      "--top",
      "1",
    ]);
    expect(parsed.kind).toBe("run");
    if (parsed.kind !== "run") {
      return;
    }
    await expect(executeSweep(parsed)).rejects.toThrow(/no-such-dad/);
  });

  it("fails on an unknown measure", async () => {
    const parsed = parseSweepArgs([
      "--measure",
      "no-such-measure",
      "--days",
      "1",
      "--morris",
      "1",
      "--sobol",
      "1",
      "--top",
      "1",
    ]);
    expect(parsed.kind).toBe("run");
    if (parsed.kind !== "run") {
      return;
    }
    await expect(executeSweep(parsed)).rejects.toThrow(/no-such-measure/);
  });

  it("prints help under node before it plays a run", () => {
    const result = spawnSync(
      process.execPath,
      ["--import", "./tools/lab-register.mjs", "tools/sweep/cli.ts", "--help"],
      { encoding: "utf8", cwd: path.resolve(".") },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--morris");
    expect(result.stdout).toContain("--sobol");
    expect(result.stdout).toContain("sweep.md");
    expect(result.stdout).toContain("longestDeadStretch");
  });
});
