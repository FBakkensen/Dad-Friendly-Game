import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  guardrailChecks,
  guardrailExit,
  labStatusCode,
  type GuardrailCheck,
} from "./guardrails";
import { parseMeasureExport } from "./measure";
import { discover } from "./registry";
import type { PolicyRow } from "./tournament";
import { meetsTarget, TARGETS, type Target } from "./targets";

const labDir = path.resolve("src/lab");

/** 0 and 1 are counts and indexes. Anything else is a threshold and belongs in targets.ts. */
const ALLOWED_LITERALS = new Set(["0", "1"]);

function disallowedLiterals(source: string): string[] {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/.*$/gm, " ")
    .replace(/"(?:\\.|[^"\\])*"/g, " ")
    .replace(/'(?:\\.|[^'\\])*'/g, " ");
  const found: string[] = [];
  const pattern = /(?:^|[^\w.])(-?\d[\d_]*(?:\.\d[\d_]*)?(?:e[+-]?\d+)?)/g;
  for (const match of stripped.matchAll(pattern)) {
    const literal = match[1];
    if (literal !== undefined && !ALLOWED_LITERALS.has(literal)) {
      found.push(literal);
    }
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...sourceFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      found.push(full);
    }
  }
  return found;
}

function judgementFor(
  target: Target,
  pass: boolean,
): PolicyRow["cells"][number]["judgements"][number] {
  const shared = {
    targetId: target.id,
    why: target.why,
    value: 0,
    pass,
  };
  if (target.op === "between") {
    return { ...shared, op: target.op, limit: target.value };
  }
  return { ...shared, op: target.op, limit: target.value };
}

function rowFor(targets: readonly Target[], pass: boolean): PolicyRow {
  return {
    id: "alpha",
    label: "Alpha",
    kind: "casual",
    finishDay: 1,
    cells: targets.map((target) => ({
      measureId: target.measure,
      label: target.measure,
      unit: "count",
      why: target.why,
      value: 0,
      judgements: [judgementFor(target, pass)],
    })),
  };
}

describe("guardrails", () => {
  it("adds a check when a target is added and reads no threshold of its own", () => {
    const extra: Target = {
      id: "fixture-extra",
      measure: "finishDay",
      scope: { kind: "all" },
      op: "lte",
      value: 1,
      why: "A fixture bound used only to prove a new entry adds a check.",
    };
    const longer = [...TARGETS, extra];
    const rows = [rowFor(longer, true)];
    expect(
      guardrailChecks(TARGETS, rows).map((check) => check.targetId),
    ).toEqual(TARGETS.map((target) => target.id));
    expect(
      guardrailChecks(longer, rows).map((check) => check.targetId),
    ).toEqual(longer.map((target) => target.id));
    const missed = guardrailChecks(longer, [rowFor(longer, false)]);
    expect(missed.every((check) => check.pass)).toBe(false);
    expect(missed.map((check) => check.targetId)).toContain("fixture-extra");
  });

  it("warns on a miss, and fails only when LAB_STRICT is set", () => {
    const broken: readonly GuardrailCheck[] = [
      {
        targetId: "fixture-extra",
        measure: "finishDay",
        pass: false,
        detail: "fixture-extra misses for Alpha.",
      },
    ];
    const warnings: string[] = [];
    const warn = (line: string) => {
      warnings.push(line);
    };
    expect(guardrailExit(broken, false, warn)).toBe(0);
    expect(warnings).toEqual(["fixture-extra misses for Alpha."]);
    expect(guardrailExit(broken, true, () => undefined)).toBe(1);
    expect(labStatusCode(broken, {}, () => undefined)).toBe(0);
    expect(labStatusCode(broken, { LAB_STRICT: "1" }, () => undefined)).toBe(1);
    const held: GuardrailCheck = {
      targetId: "fixture-extra",
      measure: "finishDay",
      pass: true,
      detail: "fixture-extra holds.",
    };
    expect(labStatusCode([held], { LAB_STRICT: "1" }, () => undefined)).toBe(0);
  });
});

describe("targets", () => {
  it("gives every guardrail one line of why and a known comparison", () => {
    const ids = new Set<string>();
    for (const target of TARGETS) {
      expect(ids.has(target.id)).toBe(false);
      ids.add(target.id);
      expect(target.why.includes("\n")).toBe(false);
      expect(target.why.includes(" ")).toBe(true);
      if (target.op === "between") {
        expect(meetsTarget(target, target.value[0])).toBe(true);
        expect(meetsTarget(target, target.value[1])).toBe(true);
        expect(meetsTarget(target, target.value[0] - target.value[1])).toBe(
          false,
        );
      } else if (target.op === "lte") {
        expect(meetsTarget(target, target.value)).toBe(true);
        expect(
          meetsTarget(target, target.value + target.value + target.value),
        ).toBe(false);
      } else {
        expect(meetsTarget(target, target.value)).toBe(true);
        expect(meetsTarget(target, target.value - target.value)).toBe(false);
      }
    }
  });

  it("fails when a target names an unknown measure", async () => {
    const measuresDir = path.join(labDir, "measures");
    await expect(
      discover(measuresDir, parseMeasureExport, {
        targets: [...TARGETS, { id: "ghost", measure: "not-a-measure" }],
      }),
    ).rejects.toThrow(/not-a-measure/);
  });

  it("rejects a numeric threshold outside targets.ts", () => {
    expect(disallowedLiterals("const limit = 0.5;")).toEqual(["0.5"]);
    expect(disallowedLiterals("const n = 0 + 1;")).toEqual([]);
    const hits: string[] = [];
    for (const file of sourceFiles(labDir)) {
      if (path.basename(file) === "targets.ts") {
        continue;
      }
      const literals = disallowedLiterals(readFileSync(file, "utf8"));
      if (literals.length > 0) {
        hits.push(`${path.relative(labDir, file)}: ${literals.join(", ")}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
