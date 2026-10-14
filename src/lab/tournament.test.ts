import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defineMeasure,
  parseMeasureExport,
  type DecisionSample,
  type MeasureContext,
} from "./measure";
import { neverBest } from "./measures/typeEverBest";
import liveMedian from "./measures/liveMedian";
import { readFinishDay } from "./measures/finishDay";
import { plainPolicy, type PlainSpec } from "./plain";
import { parsePolicyExport, type Policy } from "./policy";
import { discover } from "./registry";
import {
  formatMeasure,
  labSuggestions,
  renderReport,
  reportJson,
} from "./report";
import dominantShare from "./measures/dominantShare";
import extremeWinMeasure from "./measures/extremeWin";
import featureShare from "./measures/featureShare";
import singleShare from "./measures/singleShare";
import {
  judgeTournament,
  runTournament,
  type PolicySeedRun,
  type TournamentResult,
} from "./tournament";
import {
  BORER_SOURCE,
  CASUAL_REFERENCE_ID,
  DEAD_STRETCH,
  HOUR_MS,
  OPTIMIZER_REFERENCE_ID,
  TARGETS,
  TENDING_SOURCE,
  meetsTarget,
  type Target,
} from "./targets";

function dad(spec: Pick<PlainSpec, "id" | "label" | "kind">): Policy {
  return plainPolicy({
    ...spec,
    sessionsPerDay: 1,
    minutesPerSession: 1,
    tapsPerSecond: 0,
    promote: "never",
    promoteCap: 0,
    explore: "never",
    tend: "never",
    trouble: "never",
    workers: "never",
    boosts: "never",
  });
}

function decision(over: {
  readonly atMs?: number;
  readonly liveCount?: number;
  readonly affordableLive?: number;
  readonly bestId?: string;
  readonly bestKind?: DecisionSample["bestKind"];
  readonly waitToAffordSec?: number;
  readonly optionKinds?: DecisionSample["optionKinds"];
  readonly finishDay?: number;
  readonly nextPaybackRatio?: number;
  readonly outputShare?: DecisionSample["outputShare"];
}): DecisionSample {
  const liveCount = over.liveCount ?? 1;
  return {
    atMs: over.atMs ?? 0,
    liveCount,
    affordableLive: over.affordableLive ?? 0,
    bestId: over.bestId ?? "buyTier:helper",
    bestKind: over.bestKind ?? "buyTier",
    waitToAffordSec: over.waitToAffordSec ?? DEAD_STRETCH.minWaitSec,
    crewPerSec: 1,
    pocket: 0,
    outputShare: over.outputShare ?? {},
    optionKinds: over.optionKinds ?? ["buyTier"],
    byValue: {
      liveCount,
      affordableLive: over.affordableLive ?? 0,
      bestId: over.bestId ?? "buyTier:helper",
      waitToAffordSec: over.waitToAffordSec ?? DEAD_STRETCH.minWaitSec,
      perStone: 1,
    },
    nextPaybackRatio: over.nextPaybackRatio ?? 1,
    stretch: {
      payback: {
        liveCount,
        affordableLive: over.affordableLive ?? 0,
        waitToAffordSec: over.waitToAffordSec ?? DEAD_STRETCH.minWaitSec,
        bestId: over.bestId ?? "buyTier:helper",
      },
      value: {
        liveCount,
        affordableLive: over.affordableLive ?? 0,
        waitToAffordSec: over.waitToAffordSec ?? DEAD_STRETCH.minWaitSec,
        bestId: over.bestId ?? "buyTier:helper",
      },
      nextPaybackRatio: over.nextPaybackRatio ?? 1,
    },
    ...(over.finishDay === undefined ? {} : { finishDay: over.finishDay }),
  };
}

function run(
  policy: Policy,
  seed: number,
  samples: readonly DecisionSample[],
): PolicySeedRun {
  return { policy, seed, samples };
}

function judge(input: {
  readonly policies: readonly Policy[];
  readonly measures: readonly ReturnType<typeof defineMeasure>[];
  readonly targets?: readonly Target[];
  readonly seeds?: readonly number[];
  readonly runs: readonly PolicySeedRun[];
}): TournamentResult {
  return judgeTournament({
    policies: input.policies,
    measures: input.measures,
    targets: input.targets ?? [],
    seeds: input.seeds ?? [1],
    days: 1,
    runs: input.runs,
  });
}

function structure(markdown: string): string {
  return markdown.replace(/\d+(?:\.\d+)?/g, "#");
}

describe("tournament", () => {
  it("averages seeds and passes both finish days into the measure context", () => {
    const casual = dad({
      id: CASUAL_REFERENCE_ID,
      label: "Plain dad",
      kind: "casual",
    });
    const optimizer = dad({
      id: OPTIMIZER_REFERENCE_ID,
      label: "Smart dad",
      kind: "optimizer",
    });
    const seen: MeasureContext[] = [];
    const probe = defineMeasure({
      id: "probe",
      label: "Probe",
      unit: "days",
      why: "Records the finish days the tournament hands over.",
      aggregate: (samples, context) => {
        seen.push(context ?? {});
        return readFinishDay(samples);
      },
    });
    const result = judge({
      policies: [casual, optimizer],
      measures: [probe],
      seeds: [1, 2],
      runs: [
        run(casual, 1, [decision({ finishDay: 4 })]),
        run(casual, 2, [decision({ finishDay: 8 })]),
        run(optimizer, 1, [decision({ finishDay: 5 })]),
        run(optimizer, 2, [decision({ finishDay: 5 })]),
      ],
    });
    expect(result.casualFinishDay).toBe(6);
    expect(result.optimizerFinishDay).toBe(5);
    expect(seen.length).toBeGreaterThan(0);
    for (const context of seen) {
      expect(context.casualFinishDay).toBe(6);
      expect(context.optimizerFinishDay).toBe(5);
    }
    const plain = result.rows.find((row) => row.id === CASUAL_REFERENCE_ID);
    expect(plain?.finishDay).toBe(6);
    expect(plain?.cells[0]?.value).toBe(6);
  });

  it("pools list measures across seeds", () => {
    const policy = dad({ id: "alpha", label: "Alpha", kind: "extreme" });
    const kinds = defineMeasure({
      id: "kinds",
      label: "Never the best",
      unit: "kinds",
      why: "A kind that never wins is a rule this dad never gets to use.",
      aggregate: (samples) => neverBest(samples),
    });
    const result = judge({
      policies: [policy],
      measures: [kinds],
      targets: [
        {
          id: "kinds-cap",
          measure: "kinds",
          scope: { kind: "all" },
          op: "lte",
          value: 1,
          why: "A list has no numeric bound, so this target adds no cell.",
        },
      ],
      seeds: [1, 2],
      runs: [
        run(policy, 1, [
          decision({
            optionKinds: ["buyTier", "buyUpgrade"],
            bestKind: "buyTier",
          }),
        ]),
        run(policy, 2, [
          decision({
            optionKinds: ["buyTier", "buyUpgrade"],
            bestKind: "buyUpgrade",
          }),
        ]),
      ],
    });
    expect(result.rows[0]?.cells[0]?.value).toEqual([]);
    expect(result.rows[0]?.cells[0]?.judgements).toEqual([]);
  });

  it("judges an after-hour target on the samples that hour keeps", () => {
    const policy = dad({ id: "alpha", label: "Alpha", kind: "casual" });
    const result = judge({
      policies: [policy],
      measures: [liveMedian],
      targets: [
        {
          id: "later",
          measure: "liveMedian",
          scope: { kind: "afterHour", hour: 1 },
          op: "gte",
          value: 2,
          why: "After the first hour the typical moment should be a real choice.",
        },
      ],
      runs: [
        run(policy, 1, [
          decision({ atMs: 0, liveCount: 1 }),
          decision({ atMs: HOUR_MS, liveCount: 9 }),
        ]),
      ],
    });
    const cell = result.rows[0]?.cells[0];
    expect(cell?.value).toBe(9);
    expect(cell?.judgements[0]?.pass).toBe(true);
  });

  it("leaves an after-hour target off the kinds it does not name", () => {
    const casual = dad({ id: "alpha", label: "Alpha", kind: "casual" });
    const extreme = dad({ id: "beta", label: "Beta", kind: "extreme" });
    const result = judge({
      policies: [casual, extreme],
      measures: [liveMedian],
      targets: [
        {
          id: "later",
          measure: "liveMedian",
          scope: { kind: "afterHour", hour: 1, kinds: ["casual"] },
          op: "gte",
          value: 2,
          why: "After the first hour the typical moment should be a real choice.",
        },
      ],
      runs: [
        run(casual, 1, [decision({ atMs: HOUR_MS, liveCount: 3 })]),
        run(extreme, 1, [decision({ atMs: HOUR_MS, liveCount: 1 })]),
      ],
    });
    expect(result.rows[0]?.cells[0]?.judgements).toHaveLength(1);
    expect(result.rows[1]?.cells[0]?.judgements).toEqual([]);
  });

  it("colours a new target and leaves an uncovered measure as a bare number", () => {
    const policy = dad({ id: "alpha", label: "Alpha", kind: "extreme" });
    const other = dad({ id: "beta", label: "Beta", kind: "extreme" });
    const bonus = defineMeasure({
      id: "bonusShare",
      label: "Bonus",
      unit: "count",
      why: "A fixture so one new file shows up in the results.",
      aggregate: (samples) => samples.length,
    });
    const plain = defineMeasure({
      id: "plainCount",
      label: "Plain count",
      unit: "count",
      why: "A measure with no guardrail stays a bare number.",
      aggregate: () => 3,
    });
    const result = judge({
      policies: [policy, other],
      measures: [bonus, plain],
      targets: [
        {
          id: "fixture-bonus",
          measure: "bonusShare",
          scope: { kind: "policies", ids: ["alpha"] },
          op: "gte",
          value: 1,
          why: "The fixture measure should show up as a pass or fail cell.",
        },
      ],
      runs: [
        run(policy, 1, [decision({})]),
        run(other, 1, [decision({}), decision({ atMs: 1 })]),
      ],
    });
    const alpha = result.rows[0]?.cells[0];
    const beta = result.rows[1]?.cells[0];
    expect(alpha?.value).toBe(1);
    expect(alpha?.judgements[0]?.pass).toBe(true);
    expect(beta?.judgements).toEqual([]);
    const markdown = renderReport(result);
    expect(markdown).toContain("Alpha");
    expect(markdown).toContain("Beta");
    expect(markdown).toContain("Bonus");
    expect(markdown).toContain("pass");
    expect(markdown).toContain("Plain count");
    const json = reportJson(result) as {
      readonly rows: readonly {
        readonly id: string;
        readonly cells: Readonly<
          Record<string, { readonly pass: boolean | null }>
        >;
      }[];
    };
    expect(json.rows[0]?.cells["bonusShare"]?.pass).toBe(true);
    expect(json.rows[0]?.cells["plainCount"]?.pass).toBeNull();
    expect(json.rows[1]?.cells["bonusShare"]?.pass).toBeNull();
  });

  it("names a long wait, what the dad is saving for, and the next payback", () => {
    const policy = dad({ id: "alpha", label: "Alpha", kind: "extreme" });
    const waiting = {
      affordableLive: 0,
      waitToAffordSec: DEAD_STRETCH.minWaitSec,
      bestId: "buyTier:machine",
      nextPaybackRatio: 4,
    };
    const result = judge({
      policies: [policy],
      measures: [],
      runs: [
        run(policy, 1, [
          decision({ atMs: 0, ...waiting }),
          decision({ atMs: HOUR_MS + HOUR_MS + HOUR_MS, ...waiting }),
        ]),
      ],
    });
    const note = {
      policyId: "alpha",
      label: "Alpha",
      seed: 1,
      startDay: 1,
      hours: 3,
      savingFor: "buyTier:machine",
      nextPaybackRatio: 4,
    };
    expect(result.deadStretches).toEqual([
      { ...note, score: "payback" },
      { ...note, score: "value" },
    ]);
    const markdown = renderReport(result);
    expect(markdown).toContain("buyTier:machine");
    expect(markdown).toContain("4×");
    expect(markdown).toContain("saving for buyTier:machine");
  });

  it("timelines the first seed of casual and optimizer only", () => {
    const casual = dad({ id: "alpha", label: "Alpha", kind: "casual" });
    const optimizer = dad({ id: "beta", label: "Beta", kind: "optimizer" });
    const extreme = dad({ id: "gamma", label: "Gamma", kind: "extreme" });
    const result = judge({
      policies: [casual, optimizer, extreme],
      measures: [],
      seeds: [1, 2],
      runs: [
        run(casual, 1, [
          decision({ atMs: 0, bestId: "seed-one", liveCount: 2 }),
          decision({ atMs: HOUR_MS, bestId: "later", liveCount: 4 }),
        ]),
        run(casual, 2, [decision({ bestId: "seed-two" })]),
        run(optimizer, 1, [decision({ bestId: "smart" })]),
        run(extreme, 1, [decision({ bestId: "edge" })]),
      ],
    });
    expect(result.timelines.map((row) => row.bestId)).toEqual([
      "seed-one",
      "later",
      "smart",
    ]);
    expect(renderReport(result)).toContain("## Timelines");
    expect(renderReport(result)).not.toContain("seed-two");
    expect(renderReport(result)).not.toContain("edge");
  });

  it("suggests the miss and does not retune; a clean run says the guardrails hold", () => {
    const policy = dad({ id: "alpha", label: "Alpha", kind: "extreme" });
    const count = defineMeasure({
      id: "count",
      label: "Count",
      unit: "count",
      why: "One sample is already more than the cap in this fixture.",
      aggregate: (samples) => samples.length,
    });
    const missed = judge({
      policies: [policy],
      measures: [count],
      targets: [
        {
          id: "count-cap",
          measure: "count",
          scope: { kind: "all" },
          op: "lte",
          value: 0,
          why: "A dad with a sample still has a moment to look at.",
        },
      ],
      runs: [run(policy, 1, [decision({})])],
    });
    const notes = labSuggestions(missed).join("\n");
    expect(notes).toContain("count-cap");
    expect(notes).toContain("written back into the game");
    expect(notes).not.toContain("change the target");
    expect(renderReport(missed)).toContain("fail");
    const clean = judge({
      policies: [policy],
      measures: [count],
      runs: [run(policy, 1, [])],
    });
    expect(labSuggestions(clean).join("\n")).toContain(
      "Every guardrail in this run holds",
    );
  });

  it("applies a kind scope and a source scope to the samples they name", () => {
    const casual = dad({ id: "alpha", label: "Alpha", kind: "casual" });
    const extreme = dad({ id: "beta", label: "Beta", kind: "extreme" });
    const count = defineMeasure({
      id: "count",
      label: "Count",
      unit: "count",
      why: "How many moments the scope still keeps.",
      aggregate: (samples) => samples.length,
    });
    const result = judge({
      policies: [casual, extreme],
      measures: [count],
      targets: [
        {
          id: "extremes-only",
          measure: "count",
          scope: { kind: "policyKinds", kinds: ["extreme"] },
          op: "lte",
          value: 0,
          why: "An extreme with a sample is past this fixture cap.",
        },
        {
          id: "from-borer",
          measure: "count",
          scope: { kind: "fromSource", source: "borer" },
          op: "gte",
          value: 1,
          why: "Once the borer is in the output, a sample should remain.",
        },
      ],
      runs: [
        run(casual, 1, [
          decision({ outputShare: { helper: 1 } }),
          decision({ atMs: 1, outputShare: { borer: 1 } }),
        ]),
        run(extreme, 1, [decision({ outputShare: { borer: 1 } })]),
      ],
    });
    const casualCell = result.rows[0]?.cells[0];
    const extremeCell = result.rows[1]?.cells[0];
    expect(casualCell?.judgements.map((item) => item.targetId)).toEqual([
      "from-borer",
    ]);
    expect(casualCell?.judgements[0]?.value).toBe(1);
    expect(casualCell?.judgements[0]?.pass).toBe(true);
    expect(extremeCell?.judgements.map((item) => item.pass)).toEqual([
      false,
      true,
    ]);
    expect(renderReport(result)).toContain("extremes-only");
    expect(renderReport(result)).toContain("from-borer");
    const band = judge({
      policies: [extreme],
      measures: [count],
      targets: [
        {
          id: "count-band",
          measure: "count",
          scope: { kind: "all" },
          op: "between",
          value: [2, 4],
          why: "The count should sit in a band.",
        },
      ],
      runs: [run(extreme, 1, [decision({})])],
    });
    expect(labSuggestions(band).join("\n")).toContain("2 to 4");
  });

  it("omits a reference finish day when that player type was not run", () => {
    const policy = dad({ id: "alpha", label: "Alpha", kind: "extreme" });
    const result = judge({
      policies: [policy],
      measures: [],
      seeds: [],
      runs: [],
    });
    expect(result.casualFinishDay).toBeUndefined();
    expect(result.optimizerFinishDay).toBeUndefined();
    const markdown = renderReport(result);
    expect(markdown).toContain("not in this run");
    expect(markdown).toContain("Optimizer finish day");
    expect(markdown).toContain("Casual finish day");
    const json = reportJson(result) as {
      readonly optimizerFinishDay: number | "Infinity" | null;
      readonly casualFinishDay: number | "Infinity" | null;
    };
    expect(json.optimizerFinishDay).toBeNull();
    expect(json.casualFinishDay).toBeNull();
    expect(formatMeasure(0.078493, "share")).toBe("0.078");
    expect(formatMeasure(Number.POSITIVE_INFINITY, "share")).toBe("∞");
    expect(formatMeasure(Number.NEGATIVE_INFINITY, "days")).toBe("unfinished");
  });

  it("keeps the sign when an unfinished extreme does not win", () => {
    const casual = dad({
      id: CASUAL_REFERENCE_ID,
      label: "Plain dad",
      kind: "casual",
    });
    const extreme = dad({ id: "alpha", label: "Alpha", kind: "extreme" });
    const result = judge({
      policies: [casual, extreme],
      measures: [extremeWinMeasure],
      runs: [
        run(casual, 1, [decision({ finishDay: 5 })]),
        run(extreme, 1, [decision({})]),
      ],
    });
    const cell = result.rows[1]?.cells[0];
    expect(cell?.value).toBe(Number.NEGATIVE_INFINITY);
    expect(formatMeasure(cell?.value ?? 0, "share")).toBe("-∞");
    const json = reportJson(result) as {
      readonly rows: readonly {
        readonly cells: Readonly<Record<string, { readonly value: unknown }>>;
      }[];
    };
    expect(json.rows[1]?.cells["extremeWin"]?.value).toBe("-Infinity");
  });

  it("snapshots the report structure without the numbers", () => {
    const casual = dad({ id: "alpha", label: "Alpha", kind: "casual" });
    const count = defineMeasure({
      id: "count",
      label: "Count",
      unit: "count",
      why: "How many moments the dad looked at the table.",
      aggregate: (samples) => samples.length,
    });
    const kinds = defineMeasure({
      id: "kinds",
      label: "Never the best",
      unit: "kinds",
      why: "A kind that never wins is a rule this dad never gets to use.",
      aggregate: (samples) => neverBest(samples),
    });
    const waiting = {
      affordableLive: 0,
      waitToAffordSec: DEAD_STRETCH.minWaitSec,
      bestId: "buyTier:machine",
      nextPaybackRatio: 4,
      optionKinds: ["buyTier", "buyUpgrade"] as const,
      bestKind: "buyTier" as const,
    };
    const result = judge({
      policies: [casual],
      measures: [count, kinds],
      targets: [
        {
          id: "count-cap",
          measure: "count",
          scope: { kind: "all" },
          op: "lte",
          value: 0,
          why: "A dad with a sample still has a moment to look at.",
        },
      ],
      runs: [
        run(casual, 1, [
          decision({ atMs: 0, ...waiting }),
          decision({ atMs: HOUR_MS + HOUR_MS + HOUR_MS, ...waiting }),
        ]),
      ],
    });
    expect(structure(renderReport(result))).toMatchSnapshot();
    const json = JSON.stringify(reportJson(result));
    expect(json).toContain('"suggestions"');
    expect(json).toContain('"deadStretches"');
    expect(json).toContain('"timelines"');
  });

  it("keeps single-share and dominant-share off the extremes", () => {
    const casual = dad({ id: "alpha", label: "Alpha", kind: "casual" });
    const extreme = dad({ id: "beta", label: "Beta", kind: "extreme" });
    const result = judge({
      policies: [casual, extreme],
      measures: [singleShare, dominantShare],
      targets: TARGETS.filter(
        (target) =>
          target.measure === "singleShare" ||
          target.measure === "dominantShare",
      ),
      runs: [
        run(casual, 1, [decision({ atMs: HOUR_MS, liveCount: 1 })]),
        run(extreme, 1, [decision({ atMs: HOUR_MS, liveCount: 1 })]),
      ],
    });
    expect(
      result.rows[0]?.cells.flatMap((cell) =>
        cell.judgements.map((judgement) => judgement.targetId),
      ),
    ).toEqual(["single-share", "dominant-share"]);
    expect(
      result.rows[1]?.cells.every((cell) => cell.judgements.length === 0),
    ).toBe(true);
  });

  it("marks tending n/a when no sample owns a borer, and still judges one that does", () => {
    const tending = TARGETS.find(
      (target) => target.id === "tending-from-borer",
    );
    expect(tending).toBeDefined();
    if (tending === undefined) {
      return;
    }
    const plain = dad({ id: "alpha", label: "Alpha", kind: "extreme" });
    const owner = dad({ id: "beta", label: "Beta", kind: "casual" });
    const shared = {
      measures: [featureShare],
      targets: [tending],
    };
    const absent = judge({
      ...shared,
      policies: [plain],
      runs: [run(plain, 1, [decision({ outputShare: { helper: 1 } })])],
    });
    const absentCell = absent.rows[0]?.cells[0];
    expect(absentCell?.value).toBeNaN();
    expect(absentCell?.judgements).toEqual([]);
    expect(renderReport(absent)).toContain("| Alpha | extreme | n/a |");
    const low = judge({
      ...shared,
      policies: [owner],
      runs: [run(owner, 1, [decision({ outputShare: { [BORER_SOURCE]: 1 } })])],
    });
    const lowCell = low.rows[0]?.cells[0];
    expect(lowCell?.judgements[0]?.value).toBe(0);
    expect(lowCell?.judgements[0]?.pass).toBe(meetsTarget(tending, 0));
    const mixed = judge({
      ...shared,
      policies: [owner],
      seeds: [1, 2],
      runs: [
        run(owner, 1, [decision({ outputShare: { helper: 1 } })]),
        run(owner, 2, [
          decision({
            outputShare: { [BORER_SOURCE]: 0.4, [TENDING_SOURCE]: 0.2 },
          }),
        ]),
      ],
    });
    const mixedCell = mixed.rows[0]?.cells[0];
    expect(mixedCell?.judgements[0]?.value).toBeCloseTo(0.2, 5);
    expect(mixedCell?.judgements[0]?.pass).toBe(meetsTarget(tending, 0.2));
  });

  it("does not name a policy or a measure, and does not read the disk", () => {
    for (const file of ["tournament.ts", "report.ts"]) {
      const source = readFileSync(path.resolve("src/lab", file), "utf8");
      expect(source.includes("casual-2x10")).toBe(false);
      expect(source.includes("tap-only")).toBe(false);
      expect(source.includes('"regret"')).toBe(false);
      expect(source.includes('"finishDay"')).toBe(false);
      expect(source.includes("node:fs")).toBe(false);
    }
  });

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
});
