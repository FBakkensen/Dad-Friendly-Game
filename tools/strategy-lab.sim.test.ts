import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeLab, parseLabArgs } from "./strategy-lab";

describe("strategy lab, the gate's run", () => {
  it("the gate's run plays the whole slice: casual-2x10 seed 1 finishes on day 17.5 (#675)", async () => {
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
    // The Foundry's roof is the slice's end, not the Warehouse's on day 5.5.
    expect(row?.split(" | ").at(-2)).toBe("17.50");
    expect(ledger).toContain(
      "| The Light Tower | The Warehouse | The Foundry |",
    );
  }, 120_000);
});
