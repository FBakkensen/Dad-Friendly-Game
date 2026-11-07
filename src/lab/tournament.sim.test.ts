// Long economy sims: the sim project (npm run gate -- full), not the fast tier.
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMeasureExport } from "./measure";
import { parsePolicyExport } from "./policy";
import { discover } from "./registry";
import { renderReport } from "./report";
import { runTournament } from "./tournament";
import { CASUAL_REFERENCE_ID, OPTIMIZER_REFERENCE_ID } from "./targets";

describe("tournament", () => {
  it("adds a row and a column when fixture files are included", async () => {
    const policies = [
      ...(await discover(path.resolve("src/lab/policies"), parsePolicyExport)),
      ...(await discover(
        path.resolve("src/lab/fixtures/extra"),
        parsePolicyExport,
      )),
    ].filter((policy) =>
      new Set<string>([
        CASUAL_REFERENCE_ID,
        OPTIMIZER_REFERENCE_ID,
        "extra-dad",
      ]).has(policy.id),
    );
    const measures = [
      ...(await discover(path.resolve("src/lab/measures"), parseMeasureExport)),
      ...(await discover(
        path.resolve("src/lab/fixtures/measures"),
        parseMeasureExport,
      )),
    ];
    const result = runTournament({
      policies,
      measures,
      targets: [
        {
          id: "fixture-bonus",
          measure: "bonusShare",
          scope: { kind: "policies", ids: ["extra-dad"] },
          op: "gte",
          value: 1,
          why: "The fixture measure should show up as a pass or fail cell.",
        },
      ],
      seeds: [1],
      days: 1,
    });
    expect(result.rows.map((row) => row.id).sort()).toEqual(
      [CASUAL_REFERENCE_ID, OPTIMIZER_REFERENCE_ID, "extra-dad"].sort(),
    );
    expect(result.columns.map((column) => column.id)).toContain("bonusShare");
    expect(result.columns).toHaveLength(measures.length);
    const markdown = renderReport(result);
    expect(markdown).toContain("Fixture dad");
    expect(markdown).toContain("Bonus");
    const extra = result.rows.find((row) => row.id === "extra-dad");
    expect(
      extra?.cells.find((cell) => cell.measureId === "bonusShare")
        ?.judgements[0]?.pass,
    ).toBe(true);
    expect(markdown).toContain("pass");
    const casual = result.rows.find((row) => row.id === CASUAL_REFERENCE_ID);
    expect(
      casual?.cells.find((cell) => cell.measureId === "bonusShare")?.judgements,
    ).toEqual([]);
    expect(result.optimizerFinishDay).toEqual(expect.any(Number));
    expect(result.casualFinishDay).toEqual(expect.any(Number));
    expect(markdown).toContain("Optimizer finish day");
    expect(markdown).toContain("Casual finish day");
  }, 30_000);

  it("logs each sitting's buys and its opening table", async () => {
    const policies = (
      await discover(path.resolve("src/lab/policies"), parsePolicyExport)
    ).filter((policy) => policy.id === "checkin-4x2");
    const measures = (
      await discover(path.resolve("src/lab/measures"), parseMeasureExport)
    ).filter((measure) =>
      ["zeroBuySittings", "buysPerSitting", "bestOpenShare"].includes(
        measure.id,
      ),
    );
    const result = runTournament({
      policies,
      measures,
      targets: [],
      seeds: [1],
      days: 1,
    });
    const cell = (id: string) =>
      result.rows[0]?.cells.find((item) => item.measureId === id)?.value;
    // Day one is a shopping spree: every check-in buys, many things each.
    expect(cell("zeroBuySittings")).toBe(0);
    expect(cell("buysPerSitting")).toBeGreaterThanOrEqual(5);
    expect(cell("bestOpenShare")).toEqual(expect.any(Number));
  }, 30_000);
});
