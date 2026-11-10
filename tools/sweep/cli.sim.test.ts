// Long economy sims: the sim project (npm run gate -- full), not the fast tier.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeSweep, parseSweepArgs } from "./cli";
import { KNOBS, type Knob } from "./knobs";

/**
 * Three real knobs, one each of price, output and hardness. The full list
 * grows with every layer and tier (56 knobs is 57 Morris runs a sweep), and
 * that pushed this test past its budget in the deploy's coverage step (#447).
 * `knobs.test.ts` checks every knob; this test checks the command end to end.
 */
const FEW_KNOBS: readonly Knob[] = (
  ["price", "output", "hardness"] as const
).map((group) => {
  const knob = KNOBS.find((candidate) => candidate.group === group);
  if (knob === undefined) {
    throw new Error(`No ${group} knob.`);
  }
  return knob;
});

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
    const first = await executeSweep(parsed, { knobs: FEW_KNOBS });
    const second = await executeSweep(parsed, { knobs: FEW_KNOBS });
    expect(second.markdown).toBe(first.markdown);
    expect(first.markdown).toContain("| Knob | S1 | ST |");
    expect(first.markdown).toContain("five-min-a-day");
    expect(first.markdown).toContain("Single option");
    for (const knob of FEW_KNOBS) {
      expect(first.markdown).toContain(knob.label);
    }
    const unswept = KNOBS.find((knob) => !FEW_KNOBS.includes(knob));
    expect(unswept).toBeDefined();
    expect(first.markdown).not.toContain(`| ${unswept?.factor ?? ""} |`);
    expect(readFileSync(path.join(outDir, "sweep.md"), "utf8")).toBe(
      first.markdown,
    );
  });
});
