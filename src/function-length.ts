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
