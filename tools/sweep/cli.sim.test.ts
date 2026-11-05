// Long economy sims: the sim project (npm run gate -- full), not the fast tier.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeSweep, parseSweepArgs } from "./cli";

describe("sweep command", { timeout: 120_000 }, () => {
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
});
