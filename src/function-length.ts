/**
 * The function-length ratchet (#408): no function in non-test src grows past
 * FUNCTION_LIMIT lines, and the large ones that already did may only shrink.
 * scripts/function-length.mjs feeds this module the files and the ceiling list.
 */
import ts from "typescript";

/** The most lines a function may have without a ceiling. */
export const FUNCTION_LIMIT = 150;

/** One function-like node: its id, its first line, and how many lines it spans. */
export interface FunctionSpan {
  readonly id: string;
  readonly line: number;
  readonly lines: number;
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
  const lineOf = (position: number): number =>
    file.getLineAndCharacterOfPosition(position).line + 1;
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
    const first = lineOf(node.getStart(file));
    spans.push({
      id: `${path}#${own.join(">")}`,
      line: first,
      lines: lineOf(node.getEnd()) - first + 1,
    });
    const inner = { count: 0 };
    ts.forEachChild(node, (child) => {
      visit(child, own, inner);
    });
  };
  visit(file, [], { count: 0 });
  return spans;
}

/** The ceiling list: a function id and the most lines it may have. */
export type Ceilings = Readonly<Record<string, number>>;

/** One way a measurement and the ceiling list disagree. */
export type LengthProblem =
  | { readonly kind: "too-long"; readonly id: string; readonly lines: number }
  | {
      readonly kind: "grew";
      readonly id: string;
      readonly lines: number;
      readonly ceiling: number;
    }
  | {
      readonly kind: "lower";
      readonly id: string;
      readonly lines: number;
      readonly ceiling: number;
    }
  | { readonly kind: "remove"; readonly id: string; readonly ceiling: number }
  | {
      readonly kind: "raised";
      readonly id: string;
      readonly ceiling: number;
      readonly was: number;
    }
  | { readonly kind: "added"; readonly id: string; readonly ceiling: number };

const KIND_ORDER: readonly LengthProblem["kind"][] = [
  "too-long",
  "grew",
  "lower",
  "remove",
  "raised",
  "added",
];

/**
 * Every disagreement between the measured functions and the ceiling list, sorted by id then
 * kind. A ceiling must match its function's length exactly, so the list only ever shrinks.
 * Against `base` (the list on origin/main), a ceiling may not rise and none may be added.
 * Two functions with one id (the same name in sibling blocks) count as the longer.
 */
export function judgeLengths({
  spans,
  ceilings,
  base,
}: {
  readonly spans: readonly FunctionSpan[];
  readonly ceilings: Ceilings;
  readonly base: Ceilings | undefined;
}): readonly LengthProblem[] {
  const longest = new Map<string, number>();
  for (const { id, lines } of spans) {
    longest.set(id, Math.max(lines, longest.get(id) ?? 0));
  }
  const problems: LengthProblem[] = [];
  for (const [id, lines] of longest) {
    const ceiling = ceilings[id];
    if (lines <= FUNCTION_LIMIT) continue;
    if (ceiling === undefined) {
      problems.push({ kind: "too-long", id, lines });
    } else if (lines > ceiling) {
      problems.push({ kind: "grew", id, lines, ceiling });
    } else if (lines < ceiling) {
      problems.push({ kind: "lower", id, lines, ceiling });
    }
  }
  for (const [id, ceiling] of Object.entries(ceilings)) {
    if ((longest.get(id) ?? 0) <= FUNCTION_LIMIT) {
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
export function problemLine(problem: LengthProblem): string {
  const { id } = problem;
  switch (problem.kind) {
    case "too-long":
      return `${id} is ${String(problem.lines)} lines; the limit is ${String(FUNCTION_LIMIT)}. Split it.`;
    case "grew":
      return `${id} grew to ${String(problem.lines)} lines; its ceiling is ${String(problem.ceiling)}. Split it.`;
    case "lower":
      return `${id} is ${String(problem.lines)} lines; lower its ceiling from ${String(problem.ceiling)} to ${String(problem.lines)}.`;
    case "remove":
      return `${id} is gone or under ${String(FUNCTION_LIMIT)} lines; remove its ceiling.`;
    case "raised":
      return `${id}'s ceiling rose from ${String(problem.was)} to ${String(problem.ceiling)}; ceilings only go down.`;
    case "added":
      return `${id} has a new ceiling; new functions stay under ${String(FUNCTION_LIMIT)} lines.`;
  }
}
