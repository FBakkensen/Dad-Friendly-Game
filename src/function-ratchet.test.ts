import { describe, expect, it } from "vitest";
import {
  COMPLEXITY,
  LINES,
  baseFromShow,
  complexityValues,
  isMeasured,
  judgeCeilings,
  measureFunctions,
  parseCeilings,
  problemLine,
} from "./function-ratchet";

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

describe("judgeCeilings", () => {
  const span = (id: string, value: number) => ({ id, value });
  const lines = (
    values: readonly { id: string; value: number }[],
    ceilings: Readonly<Record<string, number>>,
    base?: Readonly<Record<string, number>>,
  ) =>
    judgeCeilings({ values, ceilings, base, measure: LINES }).map((problem) =>
      problemLine(problem, LINES),
    );

  it("passes a function of exactly 150 lines, and one at its ceiling", () => {
    expect(
      lines([span("src/a.ts#f", 150), span("src/a.ts#g", 200)], {
        "src/a.ts#g": 200,
      }),
    ).toEqual([]);
  });

  it("fails a function over 150 lines with no ceiling", () => {
    expect(lines([span("src/a.ts#f", 151)], {})).toEqual([
      "src/a.ts#f is 151 lines; the limit is 150 lines. Split it.",
    ]);
  });

  it("fails a function that grew past its ceiling", () => {
    expect(lines([span("src/a.ts#f", 210)], { "src/a.ts#f": 200 })).toEqual([
      "src/a.ts#f grew to 210 lines; its ceiling is 200 lines. Split it.",
    ]);
  });

  it("asks for a ceiling above the function's length to come down", () => {
    expect(lines([span("src/a.ts#f", 180)], { "src/a.ts#f": 200 })).toEqual([
      "src/a.ts#f is 180 lines; lower its ceiling from 200 to 180.",
    ]);
  });

  it("asks for the ceiling of a function now gone or under the limit to go", () => {
    expect(
      lines([span("src/a.ts#g", 120)], {
        "src/a.ts#f": 200,
        "src/a.ts#g": 160,
      }),
    ).toEqual([
      "src/a.ts#f is gone or within the limit; remove its ceiling.",
      "src/a.ts#g is gone or within the limit; remove its ceiling.",
    ]);
  });

  it("refuses a ceiling that rose, or one that is new, against the base", () => {
    expect(
      lines(
        [span("src/a.ts#f", 210), span("src/a.ts#n", 170)],
        { "src/a.ts#f": 210, "src/a.ts#n": 170 },
        { "src/a.ts#f": 200 },
      ),
    ).toEqual([
      "src/a.ts#f's ceiling rose from 200 to 210; ceilings only go down.",
      "src/a.ts#n has a new ceiling; new functions stay within the limit.",
    ]);
  });

  it("a renamed long function fails as too long, and its old ceiling must go", () => {
    expect(
      lines(
        [span("src/a.ts#renamed", 200)],
        { "src/a.ts#f": 200 },
        {
          "src/a.ts#f": 200,
        },
      ),
    ).toEqual([
      "src/a.ts#f is gone or within the limit; remove its ceiling.",
      "src/a.ts#renamed is 200 lines; the limit is 150 lines. Split it.",
    ]);
  });

  it("counts two functions with one id as the longer", () => {
    expect(
      lines([span("src/a.ts#f", 200), span("src/a.ts#f", 160)], {
        "src/a.ts#f": 200,
      }),
    ).toEqual([]);
  });

  it("lists every problem of one id, the length first", () => {
    expect(
      lines(
        [span("src/a.ts#f", 100)],
        { "src/a.ts#f": 210 },
        { "src/a.ts#f": 200 },
      ),
    ).toEqual([
      "src/a.ts#f is gone or within the limit; remove its ceiling.",
      "src/a.ts#f's ceiling rose from 200 to 210; ceilings only go down.",
    ]);
  });

  it("refuses a ceiling for an anonymous function, whose id moves when code around it changes", () => {
    expect(
      lines([span("src/a.ts#f>(anonymous 5)", 351)], {
        "src/a.ts#f>(anonymous 5)": 351,
      }),
    ).toEqual([
      "src/a.ts#f>(anonymous 5) has no name to hold a ceiling; name it, or bring it within the limit.",
    ]);
  });

  it("with no base, ceilings are not compared", () => {
    expect(lines([span("src/a.ts#f", 210)], { "src/a.ts#f": 210 })).toEqual([]);
  });
});

describe("the complexity measure", () => {
  it("judges complexity by the same rules, with its own limit and words", () => {
    const problems = judgeCeilings({
      values: [
        { id: "src/a.ts#f", value: 20 },
        { id: "src/a.ts#g", value: 15 },
      ],
      ceilings: {},
      base: undefined,
      measure: COMPLEXITY,
    });
    expect(problems.map((problem) => problemLine(problem, COMPLEXITY))).toEqual(
      ["src/a.ts#f is complexity 20; the limit is complexity 15. Simplify it."],
    );
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

describe("parseCeilings", () => {
  it("reads an object of positive whole line counts", () => {
    expect(parseCeilings('{"src/a.ts#f": 200}')).toEqual({ "src/a.ts#f": 200 });
  });

  it("throws on anything else, so a broken list never lets a function through", () => {
    for (const text of [
      "[]",
      "null",
      '{"a":0}',
      '{"a":1.5}',
      '{"a":"2"}',
      "nope",
    ]) {
      expect(() => parseCeilings(text)).toThrow();
    }
  });
});

describe("baseFromShow", () => {
  it("reads the base's list when git showed it", () => {
    expect(
      baseFromShow({ kind: "shown", text: '{"src/a.ts#f": 200}' }),
    ).toEqual({
      "src/a.ts#f": 200,
    });
  });

  it("has no base when the base has no list yet", () => {
    for (const message of [
      "fatal: path 'scripts/function-ceilings.json' does not exist in 'origin/main'",
      "fatal: path 'scripts/function-ceilings.json' exists on disk, but not in 'HEAD'",
    ]) {
      expect(baseFromShow({ kind: "failed", message })).toBeUndefined();
    }
  });

  it("throws on any other git failure or a corrupt list, so nothing slips through", () => {
    expect(() =>
      baseFromShow({
        kind: "failed",
        message: "fatal: invalid object name 'origin/main'.",
      }),
    ).toThrow(/invalid object name/);
    expect(() => baseFromShow({ kind: "shown", text: "{not json" })).toThrow();
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
        { line: 1, column: 10, message: "Something else entirely." },
      ]),
    ).toThrow(/score/);
  });
});
