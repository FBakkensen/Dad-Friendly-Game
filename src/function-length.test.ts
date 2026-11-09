import { describe, expect, it } from "vitest";
import { measureFunctions } from "./function-length";

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
