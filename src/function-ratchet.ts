/**
 * The function ratchet (#408, #418): no function in non-test src passes a measure's limit
 * (150 lines, or a cognitive complexity of 15), and the ones that already did may only come
 * down. scripts/function-ratchet.mjs feeds this module the files, the complexity reports and
 * the ceiling lists.
 */
import ts from "typescript";

/** What the ratchet holds functions to: a limit, how to name a value, and what to do. */
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

/** A ceiling list: a function id and the most of a measure it may have. */
export type Ceilings = Readonly<Record<string, number>>;

/** One function's value under a measure. */
export interface MeasuredValue {
  readonly id: string;
  readonly value: number;
}

/** One way the measured values and a ceiling list disagree. */
export type CeilingProblem =
  | { readonly kind: "over"; readonly id: string; readonly value: number }
  | {
      readonly kind: "grew";
      readonly id: string;
      readonly value: number;
      readonly ceiling: number;
    }
  | {
      readonly kind: "lower";
      readonly id: string;
      readonly value: number;
      readonly ceiling: number;
    }
  | { readonly kind: "remove"; readonly id: string; readonly ceiling: number }
  | {
      readonly kind: "raised";
      readonly id: string;
      readonly ceiling: number;
      readonly was: number;
    }
  | { readonly kind: "added"; readonly id: string; readonly ceiling: number }
  | {
      readonly kind: "anonymous";
      readonly id: string;
      readonly ceiling: number;
    };

const KIND_ORDER: readonly CeilingProblem["kind"][] = [
  "over",
  "grew",
  "lower",
  "remove",
  "raised",
  "added",
  "anonymous",
];

/**
 * Every disagreement between the measured values and a ceiling list, sorted by id then kind.
 * A ceiling must match its function's value exactly, so the list only ever comes down.
 * Against `base` (the list on origin/main), a ceiling may not rise and none may be added.
 * Two functions with one id (the same name in sibling blocks) count as the higher.
 */
export function judgeCeilings({
  values,
  ceilings,
  base,
  measure,
}: {
  readonly values: readonly MeasuredValue[];
  readonly ceilings: Ceilings;
  readonly base: Ceilings | undefined;
  readonly measure: Measure;
}): readonly CeilingProblem[] {
  const highest = new Map<string, number>();
  for (const { id, value } of values) {
    highest.set(id, Math.max(value, highest.get(id) ?? 0));
  }
  const problems: CeilingProblem[] = [];
  for (const [id, value] of highest) {
    const ceiling = ceilings[id];
    if (value <= measure.limit) continue;
    if (ceiling === undefined) {
      problems.push({ kind: "over", id, value });
    } else if (value > ceiling) {
      problems.push({ kind: "grew", id, value, ceiling });
    } else if (value < ceiling) {
      problems.push({ kind: "lower", id, value, ceiling });
    }
  }
  for (const [id, ceiling] of Object.entries(ceilings)) {
    // "(anonymous N)" is a position, not a name: it moves when a sibling callback is added.
    if (id.includes("(anonymous ")) {
      problems.push({ kind: "anonymous", id, ceiling });
    }
    if ((highest.get(id) ?? 0) <= measure.limit) {
      problems.push({ kind: "remove", id, ceiling });
    }
    if (base === undefined) continue;
    const was = base[id];
    if (was === undefined) {
      problems.push({ kind: "added", id, ceiling });
    } else if (ceiling > was) {
      problems.push({ kind: "raised", id, ceiling, was });
    }
  }
  return problems.sort((a, b) =>
    a.id === b.id
      ? KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
      : a.id < b.id
        ? -1
        : 1,
  );
}

/** One line telling the author what to do about a problem. */
export function problemLine(problem: CeilingProblem, measure: Measure): string {
  const { id } = problem;
  const { unit, limit, fix } = measure;
  switch (problem.kind) {
    case "over":
      return `${id} is ${unit(problem.value)}; the limit is ${unit(limit)}. ${fix}`;
    case "grew":
      return `${id} grew to ${unit(problem.value)}; its ceiling is ${unit(problem.ceiling)}. ${fix}`;
    case "lower":
      return `${id} is ${unit(problem.value)}; lower its ceiling from ${String(problem.ceiling)} to ${String(problem.value)}.`;
    case "remove":
      return `${id} is gone or within the limit; remove its ceiling.`;
    case "raised":
      return `${id}'s ceiling rose from ${String(problem.was)} to ${String(problem.ceiling)}; ceilings only go down.`;
    case "added":
      return `${id} has a new ceiling; new functions stay within the limit.`;
    case "anonymous":
      return `${id} has no name to hold a ceiling; name it, or bring it within the limit.`;
  }
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

/** The ceiling list's text. Throws on anything but ids mapped to positive whole numbers. */
export function parseCeilings(text: string): Ceilings {
  const value: unknown = JSON.parse(text);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("The ceiling list must be an object of function ids.");
  }
  const ceilings: Record<string, number> = {};
  for (const [id, lines] of Object.entries(value)) {
    if (typeof lines !== "number" || !Number.isInteger(lines) || lines < 1) {
      throw new Error(`The ceiling for ${id} must be a positive whole number.`);
    }
    ceilings[id] = lines;
  }
  return ceilings;
}

/** What `git show <base>:<list>` gave: the list's text, or git's error message. */
export type ShowOutcome =
  | { readonly kind: "shown"; readonly text: string }
  | { readonly kind: "failed"; readonly message: string };

/**
 * The base's ceiling list, or undefined when the base has no list yet (the PR that adds it).
 * Any other git failure, or a list that does not parse, throws: a check that could not read
 * its base must fail, never compare nothing. Run git with LC_ALL=C so the messages match.
 */
export function baseFromShow(outcome: ShowOutcome): Ceilings | undefined {
  if (outcome.kind === "shown") {
    return parseCeilings(outcome.text);
  }
  if (
    /does not exist in '|exists on disk, but not in '/.test(outcome.message)
  ) {
    return undefined;
  }
  throw new Error(`Cannot read the base's ceiling list: ${outcome.message}`);
}
