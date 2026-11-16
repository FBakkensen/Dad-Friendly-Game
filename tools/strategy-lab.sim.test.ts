import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { executeLab, parseLabArgs } from "./strategy-lab";

describe("strategy lab, the gate's run", () => {
  it("the gate's run plays the fresh mine with part 2: casual-2x10 seed 1 finishes on day 6.5", async () => {
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
    // The Warehouse's roof is part 2's end, not part 1's Light Tower on day 2.
    expect(row?.split(" | ").at(-2)).toBe("6.50");
    expect(ledger).toContain("| The Light Tower | The Warehouse |");
  }, 120_000);
});
