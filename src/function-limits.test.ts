import { describe, expect, it } from "vitest";
import {
  COMPLEXITY,
  LINES,
  complexityLinter,
  complexityValues,
  isMeasured,
  measureFunctions,
  overLimit,
  overLine,
} from "./function-limits";

const ids = (source: string): readonly string[] =>
  measureFunctions("p.ts", source).map((span) => span.id);

describe("measureFunctions", () => {
  it("measures declarations, arrows, methods and constructors with their line counts", () => {
    const source = [
      "function a() {", // 1
      "  return 1;",
      "}", // 3
      "const b = () => {", // 4
      "  return 2;",
      "};", // 6
      "class C {", // 7
      "  constructor() {}", // 8
      "  m() {", // 9
      "    return 3;",
      "  }", // 11
      "  get g() { return 4; }", // 12
      "}",
    ].join("\n");
    expect(
      measureFunctions("p.ts", source).map(({ id, line, lines }) => [
        id,
        line,
        lines,
      ]),
    ).toEqual([
      ["p.ts#a", 1, 3],
      ["p.ts#b", 4, 3],
      ["p.ts#C.constructor", 8, 1],
      ["p.ts#C.m", 9, 3],
      ["p.ts#C.g", 12, 1],
    ]);
  });

  it("names nested functions by their chain", () => {
    expect(
      ids("function outer() { const inner = () => { return () => 1; }; }"),
    ).toEqual([
      "p.ts#outer",
      "p.ts#outer>inner",
      "p.ts#outer>inner>(anonymous 1)",
    ]);
  });

  it("names a function assigned to a property, and a property function", () => {
    expect(
      ids(
        "const o = { run: () => 1, go() { return 2; } }; o.x = function () {};",
      ),
    ).toEqual(["p.ts#run", "p.ts#go", "p.ts#(anonymous 1)"]);
  });

  it("names class property arrows and setters by their class, and members of an unnamed class by themselves", () => {
    expect(
      ids(
        "class K { run = () => 1; set v(x: number) {} }\nconst Q = class { m() {} };",
      ),
    ).toEqual(["p.ts#K.run", "p.ts#K.v", "p.ts#m"]);
  });

  it("keeps anonymous ids stable when an unrelated named function is added", () => {
    const outer = "function outer() { list.map(() => 1); }";
    expect(ids(`function z() {}\n${outer}`).slice(1)).toEqual(ids(outer));
  });

  it("numbers callbacks passed as arguments under their parent", () => {
    expect(
      ids("function f() { list.map(() => 1); list.map(() => 2); }"),
    ).toEqual(["p.ts#f", "p.ts#f>(anonymous 1)", "p.ts#f>(anonymous 2)"]);
  });

  it("measures what it can in a file with a syntax error and never throws", () => {
    expect(() =>
      ids("function ok() { return 1; }\nfunction broken( {"),
    ).not.toThrow();
    expect(ids("function ok() { return 1; }\nfunction broken( {")).toContain(
      "p.ts#ok",
    );
  });
});

describe("overLimit", () => {
  /** A function of exactly `lines` lines, as source. */
  const longFunction = (name: string, lines: number): string =>
    [
      `export function ${name}(): number {`,
      ...Array.from({ length: lines - 3 }, (_, i) => `  void ${String(i)};`),
      "  return 0;",
      "}",
    ].join("\n");

  it("fails a 151-line function and passes a 150-line one, with no exceptions (#422)", () => {
    const spans = measureFunctions(
      "src/a.ts",
      `${longFunction("long", 151)}\n${longFunction("fits", 150)}`,
    );
    const values = spans.map((span) => ({ id: span.id, value: span.lines }));
    expect(values).toEqual([
      { id: "src/a.ts#long", value: 151 },
      { id: "src/a.ts#fits", value: 150 },
    ]);
    expect(
      overLimit(values, LINES).map((over) => overLine(over, LINES)),
    ).toEqual([
      "src/a.ts#long is 151 lines; the limit is 150 lines. Split it.",
    ]);
  });

  /** A function whose cognitive complexity is `ifs`: one point per top-level if. */
  const branchy = (name: string, ifs: number): string =>
    [
      `export function ${name}(x: number): number {`,
      ...Array.from(
        { length: ifs },
        (_, i) => `  if (x === ${String(i)}) return ${String(i)};`,
      ),
      "  return -1;",
      "}",
    ].join("\n");

  it("fails a complexity-16 function and passes a complexity-15 one, scored as the gate scores (#422)", async () => {
    const source = `${branchy("tangled", 16)}\n${branchy("fits", 15)}`;
    const [result] = await complexityLinter().lintText(source, {
      filePath: "src/b.ts",
    });
    const values = complexityValues(
      measureFunctions("src/b.ts", source),
      result?.messages ?? [],
    );
    expect(values).toEqual([
      { id: "src/b.ts#tangled", value: 16 },
      { id: "src/b.ts#fits", value: 15 },
    ]);
    expect(
      overLimit(values, COMPLEXITY).map((over) => overLine(over, COMPLEXITY)),
    ).toEqual([
      "src/b.ts#tangled is complexity 16; the limit is complexity 15. Simplify it.",
    ]);
  });

  it("names a function once, at its highest value, sorted by id", () => {
    expect(
      overLimit(
        [
          { id: "src/b.ts#f", value: 160 },
          { id: "src/a.ts#g", value: 151 },
          { id: "src/b.ts#f", value: 170 },
          { id: "src/a.ts#h", value: 20 },
        ],
        LINES,
      ),
    ).toEqual([
      { id: "src/a.ts#g", value: 151 },
      { id: "src/b.ts#f", value: 170 },
    ]);
    expect(overLimit([], LINES)).toEqual([]);
  });
});

describe("function heads", () => {
  it("runs from a function's first token to the start of its body", () => {
    const source = [
      "function a(x: number) {", // the body opens at column 23
      "  return x;",
      "}",
      "const b = (",
      "  y: number,",
      ") => y;",
      "class C { m() {} }",
    ].join("\n");
    expect(
      measureFunctions("p.ts", source).map(({ id, head }) => [id, head]),
    ).toEqual([
      ["p.ts#a", { line: 1, column: 1, endLine: 1, endColumn: 23 }],
      ["p.ts#b", { line: 4, column: 11, endLine: 6, endColumn: 6 }],
      ["p.ts#C.m", { line: 7, column: 11, endLine: 7, endColumn: 15 }],
    ]);
  });
});

describe("isMeasured", () => {
  it("measures non-test src files and skips tests and harnesses", () => {
    const measured = [
      "src/a.ts",
      "src/lab/x.ts",
      "src/a.test.ts",
      "src/a.sim.test.ts",
      "src/mountain-screen.harness.ts",
      "src/latest.ts",
      "scripts/a.mjs",
      "docs/a.md",
      "src/a.css",
    ].filter(isMeasured);
    expect(measured).toEqual(["src/a.ts", "src/lab/x.ts", "src/latest.ts"]);
  });
});

describe("complexityValues", () => {
  // The positions eslint-plugin-sonarjs reports at (probed): a declaration's or a method's
  // name, and an arrow's "=>".
  const source = [
    "function a(x: number) {", // 1: "a" at column 10
    "  return x ? 1 : 2;",
    "}",
    "const b = (", // 4
    "  y: number,",
    ") => {", // 6: "=>" at column 3
    "  return [y].map((z) => (z ? 1 : 2));", // 7: the inner "=>" at column 22
    "};",
    "class C { m(q: boolean) { return q ? 1 : 2; } }", // 9: "m" at column 11
  ].join("\n");
  const spans = measureFunctions("p.ts", source);
  const report = (line: number, column: number, score: number) => ({
    line,
    column,
    ruleId: "sonarjs/cognitive-complexity",
    message: `Refactor this function to reduce its Cognitive Complexity from ${String(score)} to the 0 allowed.`,
  });

  it("gives each report to the function whose head holds it, nested ones included", () => {
    expect(
      complexityValues(spans, [
        report(1, 10, 1),
        report(6, 3, 6),
        report(7, 22, 1),
        report(9, 11, 2),
      ]),
    ).toEqual([
      { id: "p.ts#a", value: 1 },
      { id: "p.ts#b", value: 6 },
      { id: "p.ts#b>(anonymous 1)", value: 1 },
      { id: "p.ts#C.m", value: 2 },
    ]);
  });

  it("gives a report in a default parameter's arrow to that arrow, not its parent", () => {
    // "=>" of the default value at column 21, inside f's own head.
    const inner = measureFunctions(
      "q.ts",
      "function f(cb = () => (1 ? 2 : 3)) {}",
    );
    expect(complexityValues(inner, [report(1, 21, 1)])).toEqual([
      { id: "q.ts#f>(anonymous 1)", value: 1 },
    ]);
  });

  it("throws on a report outside every head, or a message with no score", () => {
    expect(() => complexityValues(spans, [report(2, 3, 4)])).toThrow(
      /no function/,
    );
    expect(() =>
      complexityValues(spans, [
        {
          line: 1,
          column: 10,
          ruleId: "sonarjs/cognitive-complexity",
          message: "Something else entirely.",
        },
      ]),
    ).toThrow(/score/);
  });

  it("throws on a report from any other rule, such as a disable comment for an unknown rule", () => {
    expect(() =>
      complexityValues(spans, [
        {
          line: 1,
          column: 10,
          ruleId: "@typescript-eslint/no-explicit-any",
          message:
            "Definition for rule '@typescript-eslint/no-explicit-any' was not found.",
        },
      ]),
    ).toThrow(/only the complexity rule/);
    expect(() =>
      complexityValues(spans, [
        { line: 1, column: 1, ruleId: null, message: "Parsing error." },
      ]),
    ).toThrow(/only the complexity rule/);
  });
});
