import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeLab, parseLabArgs } from "./strategy-lab";

describe("strategy lab, the gate's run", () => {
  it("the gate's run plays the whole slice: casual-2x10 seed 1 finishes on day 20.00 (#772)", async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), "strategy-lab-"));
    const parsed = parseLabArgs([
      "--policy",
      "casual-2x10",
      "--seeds",
      "1",
      "--out",
      outDir,
    ]);
    expect(parsed).toMatchObject({ kind: "run", factors: {} });
    if (parsed.kind !== "run") {
      return;
    }
    const { ledger } = await executeLab(parsed);
    const row = ledger
      .split("\n")
      .find((line) => line.startsWith("| casual-2x10 | 1 |"));
    // The Research Lab's roof is Part 2's end (day 20.00), not The Foundry's (day 15.00).
    expect(row?.split(" | ").at(-2)).toBe("20.00");
    expect(ledger).toContain(
      "| The Light Tower | The Warehouse | The Foundry | The Research Lab |",
    );
  }, 120_000);
});
