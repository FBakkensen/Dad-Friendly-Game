/**
 * The function limits (#408, #418, #422): no function in non-test src passes a measure's
 * limit (150 lines, or a cognitive complexity of 15). There are no exceptions.
 * scripts/function-limits.mjs feeds this module the files and the complexity reports.
 */
import { ESLint } from "eslint";
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";
import ts from "typescript";

/** What a function is held to: a limit, how to name a value, and what to do. */
export interface Measure {
  readonly limit: number;
  readonly unit: (value: number) => string;
  readonly fix: string;
}

/** Lines from a function's first line to its last. */
export const LINES: Measure = {
  limit: 150,
  unit: (value) => `${String(value)} lines`,
  fix: "Split it.",
};

/** Cognitive complexity, as eslint-plugin-sonarjs scores it. */
export const COMPLEXITY: Measure = {
  limit: 15,
  unit: (value) => `complexity ${String(value)}`,
  fix: "Simplify it.",
};

/** From a function's first token to the start of its body, 1-based as ESLint counts. */
interface Head {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
}

/**
 * One function-like node: its id, its first line, how many lines it spans, and its head
 * (undefined for a function with no body, such as an overload).
 */
export interface FunctionSpan {
  readonly id: string;
  readonly line: number;
  readonly lines: number;
  readonly head: Head | undefined;
}

type FunctionLike =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.GetAccessorDeclaration
  | ts.SetAccessorDeclaration
  | ts.ConstructorDeclaration;

function isFunctionLike(node: ts.Node): node is FunctionLike {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

/** The class a member belongs to, as a `C.` prefix, or nothing outside a class. */
function classPrefix(node: ts.Node, file: ts.SourceFile): string {
  const owner = node.parent;
  return ts.isClassLike(owner) && owner.name !== undefined
    ? `${owner.name.getText(file)}.`
    : "";
}

/** A function's own name, or undefined when it has none to be called by. */
function ownName(node: FunctionLike, file: ts.SourceFile): string | undefined {
  if (ts.isConstructorDeclaration(node)) {
    return `${classPrefix(node, file)}constructor`;
  }
  if (!ts.isArrowFunction(node) && node.name !== undefined) {
    return `${classPrefix(node, file)}${node.name.getText(file)}`;
  }
  const { parent } = node;
  if (
    (ts.isVariableDeclaration(parent) || ts.isPropertyAssignment(parent)) &&
    ts.isIdentifier(parent.name)
  ) {
    return parent.name.text;
  }
  if (ts.isPropertyDeclaration(parent)) {
    return `${classPrefix(parent, file)}${parent.name.getText(file)}`;
  }
  return undefined;
}

/**
 * Every function-like node in one source file, nested ones included, in source order. An id
 * is the path, then the chain of enclosing function names and its own, joined by `>`. A
 * function with no name is `(anonymous N)`, counted under its nearest enclosing function, so
 * an unrelated function added elsewhere never renumbers it. Never throws: a file that does
 * not parse cleanly is measured as far as it goes.
 */
export function measureFunctions(
  path: string,
  source: string,
): readonly FunctionSpan[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const spans: FunctionSpan[] = [];
  const at = (position: number): { line: number; column: number } => {
    const { line, character } = file.getLineAndCharacterOfPosition(position);
    return { line: line + 1, column: character + 1 };
  };
  const lineOf = (position: number): number => at(position).line;
  const visit = (
    node: ts.Node,
    chain: readonly string[],
    anonymous: { count: number },
  ): void => {
    if (!isFunctionLike(node)) {
      ts.forEachChild(node, (child) => {
        visit(child, chain, anonymous);
      });
      return;
    }
    anonymous.count += ownName(node, file) === undefined ? 1 : 0;
    const name =
      ownName(node, file) ?? `(anonymous ${String(anonymous.count)})`;
    const own = [...chain, name];
    const start = at(node.getStart(file));
    const body =
      node.body === undefined ? undefined : at(node.body.getStart(file));
    spans.push({
      id: `${path}#${own.join(">")}`,
      line: start.line,
      lines: lineOf(node.getEnd()) - start.line + 1,
      head:
        body === undefined
          ? undefined
          : {
              line: start.line,
              column: start.column,
              endLine: body.line,
              endColumn: body.column,
            },
    });
    const inner = { count: 0 };
    ts.forEachChild(node, (child) => {
      visit(child, own, inner);
    });
  };
  visit(file, [], { count: 0 });
  return spans;
}

/** One function's value under a measure. */
export interface MeasuredValue {
  readonly id: string;
  readonly value: number;
}

/**
 * Every function over the measure's limit, sorted by id. Two functions with one id (the same
 * name in sibling blocks) count once, at the higher value.
 */
export function overLimit(
  values: readonly MeasuredValue[],
  measure: Measure,
): readonly MeasuredValue[] {
  const highest = new Map<string, number>();
  for (const { id, value } of values) {
    highest.set(id, Math.max(value, highest.get(id) ?? 0));
  }
  return [...highest]
    .filter(([, value]) => value > measure.limit)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, value]) => ({ id, value }));
}

/** One line telling the author what to do about a function over the limit. */
export function overLine(over: MeasuredValue, measure: Measure): string {
  const { unit, limit, fix } = measure;
  return `${over.id} is ${unit(over.value)}; the limit is ${unit(limit)}. ${fix}`;
}

/** One ESLint report: where it points, and its message. */
export interface Report {
  readonly line: number;
  readonly column: number;
  readonly ruleId: string | null;
  readonly message: string;
}

/** The one rule the complexity run loads. */
const COMPLEXITY_RULE = "sonarjs/cognitive-complexity";

const SCORE = /Cognitive Complexity from (\d+) to/;

function holds(head: Head, line: number, column: number): boolean {
  const afterStart =
    line > head.line || (line === head.line && column >= head.column);
  const beforeBody =
    line < head.endLine || (line === head.endLine && column < head.endColumn);
  return afterStart && beforeBody;
}

/**
 * Each `sonarjs/cognitive-complexity` report as a function's value. The plugin reports at a
 * function's head (its name, or an arrow's "=>"), so a report belongs to the function whose
 * head holds it, the innermost one when heads nest (an arrow in a default parameter). Throws
 * on a report from any other rule, one no head holds, or a message with no score, so a plugin
 * change or a stray comment fails loudly.
 */
export function complexityValues(
  spans: readonly FunctionSpan[],
  reports: readonly Report[],
): readonly MeasuredValue[] {
  return reports.map(({ line, column, ruleId, message }) => {
    if (ruleId !== COMPLEXITY_RULE) {
      throw new Error(
        `The complexity run expects only the complexity rule, but got ${ruleId ?? "no rule"} at ${String(line)}:${String(column)}: ${message}`,
      );
    }
    const score = SCORE.exec(message)?.[1];
    if (score === undefined) {
      throw new Error(`No complexity score in the report: ${message}`);
    }
    const owner = spans
      .filter(
        (span) => span.head !== undefined && holds(span.head, line, column),
      )
      .at(-1);
    if (owner === undefined) {
      throw new Error(
        `A complexity report at ${String(line)}:${String(column)} names no function.`,
      );
    }
    return { id: owner.id, value: Number(score) };
  });
}

/** The files the ratchet measures: TypeScript under src/, but no tests or test harnesses. */
export function isMeasured(path: string): boolean {
  return (
    path.startsWith("src/") &&
    path.endsWith(".ts") &&
    !path.endsWith(".test.ts") &&
    !path.endsWith(".harness.ts")
  );
}

/**
 * The ESLint run that scores cognitive complexity: the plugin with a limit of 0, so every
 * function reports its score. No type information is needed, so it takes seconds, not a full
 * lint. The scored code's own eslint-disable comments can neither hide a score nor name rules
 * this run does not load.
 */
export function complexityLinter(): ESLint {
  return new ESLint({
    overrideConfigFile: true,
    allowInlineConfig: false,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        languageOptions: { parser: tseslint.parser },
        plugins: { sonarjs },
        rules: { "sonarjs/cognitive-complexity": ["error", 0] },
      },
    ],
  });
}
