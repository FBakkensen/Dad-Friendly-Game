/**
 * Flags raw colours, raw px sizes, and tap targets under `--target-min`
 * on CSS lines added since the base. CSS already on that base is the
 * allow-list: those lines are context, not additions. `src/tokens.css`
 * is where the raw values live.
 */

export type TokenFinding = {
  readonly file: string;
  readonly text: string;
  readonly kind: "raw-colour" | "raw-size" | "tap-target";
};

const RAW_PX = /(?<![\w.-])(?:\d+\.\d+|\d+)px\b/i;
const RAW_FUNCTION_COLOUR = /\b(?:rgba?|hsla?)\(/i;
const RAW_HEX = /#[0-9a-fA-F]{3,8}(?![\w-])/g;

const MIN_PROPS = new Set([
  "min-width",
  "min-height",
  "min-inline-size",
  "min-block-size",
]);
const BOX_PROPS = new Set(["width", "height", "inline-size", "block-size"]);

type Len = { readonly k: "px" | "num" | "unknown"; readonly n: number };

const UNKNOWN: Len = { k: "unknown", n: 0 };

type Frame = { readonly kind: "at" | "style"; readonly header: string };

type CssState = {
  inComment: boolean;
  mode: "prelude" | "body";
  frames: Frame[];
  prelude: string;
  decl: string;
  inValue: boolean;
  declAdded: boolean;
};

export function findingsInDiff(
  diff: string,
  tokensCss: string,
): TokenFinding[] {
  const lengths = tokenLengths(tokensCss);
  const target = lengths.get("--target-min") ?? 48;
  const lookup = (name: string) => lengths.get(name);
  const findings: TokenFinding[] = [];
  let file: string | undefined;
  let state = freshState();

  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) {
      const next = line.slice(6).trim();
      file = checkedCss(next) ? next : undefined;
      state = freshState();
      continue;
    }
    if (file === undefined || isDiffHeader(line) || line.startsWith("-")) {
      continue;
    }
    if (!line.startsWith("+") && !line.startsWith(" ")) {
      continue;
    }
    consumeLine({
      state,
      codeLine: line.slice(1).replace(/\r/g, ""),
      added: line.startsWith("+"),
      file,
      lookup,
      target,
      findings,
    });
  }
  return findings;
}

/** Px lengths named in a tokens file. Aliases follow `var()` and `calc()`. */
export function tokenLengths(css: string): ReadonlyMap<string, number> {
  const raw = new Map<string, string>();
  for (const match of css.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    const name = match[1];
    const value = match[2];
    if (name === undefined || value === undefined) {
      continue;
    }
    raw.set(name, value.trim());
  }
  const resolved = new Map<string, number>();
  const resolving = new Set<string>();
  const lookup = (name: string): number | undefined => {
    const cached = resolved.get(name);
    if (cached !== undefined) {
      return cached;
    }
    if (resolving.has(name)) {
      return undefined;
    }
    const value = raw.get(name);
    if (value === undefined) {
      return undefined;
    }
    resolving.add(name);
    const px = definitePx(value, lookup);
    resolving.delete(name);
    if (px === undefined) {
      return undefined;
    }
    resolved.set(name, px);
    return px;
  };
  for (const name of raw.keys()) {
    lookup(name);
  }
  return resolved;
}

function checkedCss(file: string): boolean {
  return (
    file.startsWith("src/") &&
    file.endsWith(".css") &&
    !file.endsWith("/tokens.css")
  );
}

function isDiffHeader(line: string): boolean {
  return (
    line.startsWith("--- ") ||
    line.startsWith("@@") ||
    line.startsWith("diff ") ||
    line.startsWith("index ") ||
    line.startsWith("\\") ||
    line.startsWith("new file") ||
    line.startsWith("deleted file") ||
    line.startsWith("similarity ") ||
    line.startsWith("rename ") ||
    line.startsWith("old mode") ||
    line.startsWith("new mode")
  );
}

function freshState(): CssState {
  return {
    inComment: false,
    mode: "prelude",
    frames: [],
    prelude: "",
    decl: "",
    inValue: false,
    declAdded: false,
  };
}

function consumeLine(input: {
  state: CssState;
  codeLine: string;
  added: boolean;
  file: string;
  lookup: (name: string) => number | undefined;
  target: number;
  findings: TokenFinding[];
}): void {
  const { state, added, file, lookup, target, findings } = input;
  const stripped = stripComments(input.codeLine, state.inComment);
  state.inComment = stripped.inComment;
  const code = stripped.code;
  const continuing =
    (state.mode === "prelude" ? state.prelude : state.decl).length > 0 &&
    code.length > 0;
  let preludeAdded = "";
  let valueAdded = "";
  const stream = `${continuing ? "\n" : ""}${code}`;
  for (let index = 0; index < stream.length; index += 1) {
    const ch = stream[index] ?? "";
    const fromDiff = continuing ? index > 0 && added : added;
    const bucket = takeChar(state, ch, fromDiff, {
      file,
      lookup,
      target,
      findings,
    });
    if (fromDiff && bucket === "prelude") {
      preludeAdded += ch;
    }
    if (fromDiff && bucket === "value") {
      valueAdded += ch;
    }
  }
  if (!added) {
    return;
  }
  const text = input.codeLine.trim();
  if (text.length === 0) {
    return;
  }
  if (RAW_PX.test(preludeAdded) || RAW_PX.test(valueAdded)) {
    findings.push({ file, text, kind: "raw-size" });
  }
  if (hasRawColour(valueAdded)) {
    findings.push({ file, text, kind: "raw-colour" });
  }
}

type Bucket = "prelude" | "value" | "other";

function takeChar(
  state: CssState,
  ch: string,
  added: boolean,
  report: {
    file: string;
    lookup: (name: string) => number | undefined;
    target: number;
    findings: TokenFinding[];
  },
): Bucket {
  if (state.mode === "prelude") {
    if (ch === "}") {
      state.frames.pop();
      state.prelude = "";
      state.mode = modeAfterPop(state.frames);
      return "other";
    }
    if (ch === "{") {
      pushFrame(state, state.prelude.trim());
      state.prelude = "";
      return "other";
    }
    state.prelude += ch;
    return "prelude";
  }
  if (ch === "{") {
    pushFrame(state, state.decl.trim());
    state.decl = "";
    state.inValue = false;
    state.declAdded = false;
    return "other";
  }
  if (ch === "}" || ch === ";") {
    if (state.declAdded) {
      inspectDeclaration(state, report);
    }
    state.decl = "";
    state.inValue = false;
    state.declAdded = false;
    if (ch === "}") {
      state.frames.pop();
      state.mode = modeAfterPop(state.frames);
    }
    return "other";
  }
  if (ch === ":" && !state.inValue) {
    state.inValue = true;
    state.decl += ch;
    if (added) {
      state.declAdded = true;
    }
    return "other";
  }
  state.decl += ch;
  if (added) {
    state.declAdded = true;
  }
  return state.inValue ? "value" : "other";
}

function pushFrame(state: CssState, header: string): void {
  if (opensRuleList(header)) {
    state.frames.push({ kind: "at", header });
    state.mode = "prelude";
    return;
  }
  state.frames.push({ kind: "style", header });
  state.mode = "body";
}

function modeAfterPop(frames: readonly Frame[]): "prelude" | "body" {
  const top = frames[frames.length - 1];
  return top?.kind === "style" ? "body" : "prelude";
}

function opensRuleList(header: string): boolean {
  return (
    /^@[\w-]*keyframes\b/i.test(header) ||
    /^@(?:media|supports|container|layer|scope)\b/i.test(header)
  );
}

function inspectDeclaration(
  state: CssState,
  report: {
    file: string;
    lookup: (name: string) => number | undefined;
    target: number;
    findings: TokenFinding[];
  },
): void {
  const parsed = splitDeclaration(state.decl);
  if (parsed === undefined) {
    return;
  }
  if (insideKeyframes(state.frames)) {
    return;
  }
  const top = state.frames[state.frames.length - 1];
  if (top?.kind !== "style") {
    return;
  }
  if (!isUndersized(parsed.value, report.lookup, report.target)) {
    return;
  }
  const subjects = selectorSubjects(top.header);
  const pseudoOnly =
    subjects.length > 0 &&
    subjects.every((subject) => isPseudoElement(subject));
  const control = subjects.some((subject) => isControl(subject));
  const floor = MIN_PROPS.has(parsed.prop);
  const box = BOX_PROPS.has(parsed.prop);
  if ((floor && !pseudoOnly) || (box && control)) {
    report.findings.push({
      file: report.file,
      text: state.decl.replace(/\s+/g, " ").trim(),
      kind: "tap-target",
    });
  }
}

function splitDeclaration(
  decl: string,
): { readonly prop: string; readonly value: string } | undefined {
  const colon = decl.indexOf(":");
  if (colon <= 0) {
    return undefined;
  }
  const prop = decl.slice(0, colon).trim().toLowerCase();
  const value = decl.slice(colon + 1).trim();
  if (prop.length === 0 || value.length === 0 || prop.startsWith("--")) {
    return undefined;
  }
  return { prop, value };
}

function insideKeyframes(frames: readonly Frame[]): boolean {
  return frames.some(
    (frame) => frame.kind === "at" && /keyframes/i.test(frame.header),
  );
}

function selectorSubjects(selector: string): string[] {
  return selector.split(",").map((part) => {
    const bits = part
      .trim()
      .split(/\s*(?:>|\+|~)\s*|\s+/)
      .filter((bit) => bit.length > 0);
    return bits[bits.length - 1] ?? "";
  });
}

function isPseudoElement(compound: string): boolean {
  return /::?(?:before|after|placeholder|selection)\b/i.test(compound);
}

function isControl(compound: string): boolean {
  if (isPseudoElement(compound)) {
    return false;
  }
  if (/\[role\s*=\s*["']?(?:button|link|tab|menuitem)\b/i.test(compound)) {
    return true;
  }
  if (/(?:^|[.#])[\w-]*button\b/i.test(compound)) {
    return true;
  }
  if (/(?:^|[.#])[\w-]*-(?:buy|close|open|tap)\b/i.test(compound)) {
    return true;
  }
  if (/^(?:button|input|select|textarea|summary)\b/i.test(compound)) {
    return true;
  }
  return /^a(?![\w-])/i.test(compound);
}

function hasRawColour(value: string): boolean {
  if (RAW_FUNCTION_COLOUR.test(value)) {
    return true;
  }
  RAW_HEX.lastIndex = 0;
  return RAW_HEX.test(value);
}

function isUndersized(
  value: string,
  lookup: (name: string) => number | undefined,
  target: number,
): boolean {
  const px = definitePx(value, lookup);
  if (px !== undefined) {
    return px > 0 && px < target;
  }
  const minArgs = topLevelCall(value, "min");
  if (minArgs !== undefined) {
    return minArgs.some((arg) => {
      const argPx = definitePx(arg, lookup);
      return argPx !== undefined && argPx > 0 && argPx < target;
    });
  }
  const clampArgs = topLevelCall(value, "clamp");
  const max = clampArgs?.[2];
  if (max === undefined) {
    return false;
  }
  const maxPx = definitePx(max, lookup);
  return maxPx !== undefined && maxPx > 0 && maxPx < target;
}

function topLevelCall(value: string, name: string): string[] | undefined {
  const trimmed = value.replace(/!important\s*$/i, "").trim();
  const prefix = new RegExp(`^${name}\\s*\\(`, "i").exec(trimmed);
  if (prefix === null || !trimmed.endsWith(")")) {
    return undefined;
  }
  const inner = trimmed.slice(prefix[0].length, -1);
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < inner.length; index += 1) {
    const ch = inner[index];
    if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    } else if (ch === "," && depth === 0) {
      args.push(inner.slice(start, index).trim());
      start = index + 1;
    }
  }
  args.push(inner.slice(start).trim());
  return args;
}

function definitePx(
  value: string,
  lookup: (name: string) => number | undefined,
): number | undefined {
  const cleaned = value.replace(/!important\s*$/i, "").trim();
  if (cleaned.length === 0) {
    return undefined;
  }
  const parser = new LengthParser(cleaned, lookup);
  const len = parser.parseExpression();
  if (len === undefined || !parser.finished() || len.k !== "px") {
    return undefined;
  }
  return len.n;
}

class LengthParser {
  private index = 0;
  private readonly source: string;
  private readonly lookup: (name: string) => number | undefined;

  constructor(source: string, lookup: (name: string) => number | undefined) {
    this.source = source;
    this.lookup = lookup;
  }

  finished(): boolean {
    this.skip();
    return this.index >= this.source.length;
  }

  parseExpression(): Len | undefined {
    let left = this.parseTerm();
    if (left === undefined) {
      return undefined;
    }
    for (;;) {
      this.skip();
      const op = this.peek();
      if (op !== "+" && op !== "-") {
        return left;
      }
      this.index += 1;
      const right = this.parseTerm();
      if (right === undefined) {
        return undefined;
      }
      left = op === "+" ? addLen(left, right) : subLen(left, right);
    }
  }

  private parseTerm(): Len | undefined {
    let left = this.parseUnary();
    if (left === undefined) {
      return undefined;
    }
    for (;;) {
      this.skip();
      const op = this.peek();
      if (op !== "*" && op !== "/") {
        return left;
      }
      this.index += 1;
      const right = this.parseUnary();
      if (right === undefined) {
        return undefined;
      }
      if (op === "*") {
        left = mulLen(left, right);
        continue;
      }
      const next = divLen(left, right);
      if (next === undefined) {
        return undefined;
      }
      left = next;
    }
  }

  private parseUnary(): Len | undefined {
    this.skip();
    const sign = this.peek();
    if (sign === "+" || sign === "-") {
      this.index += 1;
      const inner = this.parseUnary();
      if (inner === undefined) {
        return undefined;
      }
      return sign === "-" ? mulLen(inner, { k: "num", n: -1 }) : inner;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Len | undefined {
    this.skip();
    if (this.peek() === "(") {
      this.index += 1;
      const inner = this.parseExpression();
      this.skip();
      if (inner === undefined || this.peek() !== ")") {
        return undefined;
      }
      this.index += 1;
      return inner;
    }
    const ident = this.readIdent();
    if (ident !== undefined) {
      this.skip();
      if (this.peek() !== "(") {
        return undefined;
      }
      return this.parseFunction(ident);
    }
    const number = this.readNumber();
    if (number === undefined) {
      return undefined;
    }
    const unit = this.readIdent();
    if (unit === undefined) {
      return number === 0 ? { k: "px", n: 0 } : { k: "num", n: number };
    }
    if (unit.toLowerCase() === "px") {
      return { k: "px", n: number };
    }
    return UNKNOWN;
  }

  private parseFunction(name: string): Len | undefined {
    this.index += 1;
    const lower = name.toLowerCase();
    if (lower === "var") {
      return this.parseVar();
    }
    if (lower === "calc") {
      const inner = this.parseExpression();
      if (inner === undefined || !this.eat(")")) {
        return undefined;
      }
      return inner;
    }
    const args = this.parseArgs();
    if (args === undefined) {
      return undefined;
    }
    if (lower === "min" || lower === "max") {
      if (args.some((arg) => arg.k !== "px")) {
        return UNKNOWN;
      }
      const nums = args.map((arg) => arg.n);
      const n = lower === "min" ? Math.min(...nums) : Math.max(...nums);
      return { k: "px", n };
    }
    if (lower === "clamp") {
      const lo = args[0];
      const mid = args[1];
      const hi = args[2];
      if (
        args.length !== 3 ||
        lo?.k !== "px" ||
        mid?.k !== "px" ||
        hi?.k !== "px"
      ) {
        return UNKNOWN;
      }
      return { k: "px", n: Math.min(Math.max(mid.n, lo.n), hi.n) };
    }
    return undefined;
  }

  private parseVar(): Len | undefined {
    this.skip();
    const name = this.readIdent();
    if (name === undefined || !name.startsWith("--")) {
      return undefined;
    }
    this.skip();
    let fallback: Len | undefined;
    if (this.peek() === ",") {
      this.index += 1;
      fallback = this.parseExpression();
      if (fallback === undefined) {
        return undefined;
      }
    }
    if (!this.eat(")")) {
      return undefined;
    }
    const resolved = this.lookup(name);
    if (resolved !== undefined) {
      return { k: "px", n: resolved };
    }
    return fallback;
  }

  private parseArgs(): Len[] | undefined {
    const args: Len[] = [];
    for (;;) {
      const arg = this.parseExpression();
      if (arg === undefined) {
        return undefined;
      }
      args.push(arg);
      this.skip();
      if (this.peek() === ",") {
        this.index += 1;
        continue;
      }
      if (this.peek() === ")") {
        this.index += 1;
        return args;
      }
      return undefined;
    }
  }

  private eat(ch: string): boolean {
    this.skip();
    if (this.peek() !== ch) {
      return false;
    }
    this.index += 1;
    return true;
  }

  private skip(): void {
    while (
      this.index < this.source.length &&
      /\s/.test(this.source[this.index] ?? "")
    ) {
      this.index += 1;
    }
  }

  private peek(): string {
    this.skip();
    return this.source[this.index] ?? "";
  }

  private readNumber(): number | undefined {
    const match = /^[+-]?(?:\d+\.\d+|\.\d+|\d+)/.exec(
      this.source.slice(this.index),
    );
    const raw = match?.[0];
    if (raw === undefined) {
      return undefined;
    }
    this.index += raw.length;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }

  private readIdent(): string | undefined {
    const match = /^(?:--[\w-]+|[a-zA-Z_][\w-]*)/.exec(
      this.source.slice(this.index),
    );
    const raw = match?.[0];
    if (raw === undefined) {
      return undefined;
    }
    this.index += raw.length;
    return raw;
  }
}

function addLen(left: Len, right: Len): Len {
  if (left.k === "unknown" || right.k === "unknown") {
    return UNKNOWN;
  }
  if (left.k === right.k) {
    return { k: left.k, n: left.n + right.n };
  }
  return UNKNOWN;
}

function subLen(left: Len, right: Len): Len {
  return addLen(left, mulLen(right, { k: "num", n: -1 }));
}

function mulLen(left: Len, right: Len): Len {
  if (left.k === "unknown" || right.k === "unknown") {
    return UNKNOWN;
  }
  if (left.k === "num" && right.k === "num") {
    return { k: "num", n: left.n * right.n };
  }
  if (left.k === "num" && right.k === "px") {
    return { k: "px", n: left.n * right.n };
  }
  if (left.k === "px" && right.k === "num") {
    return { k: "px", n: left.n * right.n };
  }
  return UNKNOWN;
}

function divLen(left: Len, right: Len): Len | undefined {
  if (left.k === "unknown" || right.k === "unknown") {
    return UNKNOWN;
  }
  if (right.n === 0) {
    return undefined;
  }
  if (left.k === "px" && right.k === "num") {
    return { k: "px", n: left.n / right.n };
  }
  if (left.k === "num" && right.k === "num") {
    return { k: "num", n: left.n / right.n };
  }
  return UNKNOWN;
}

function stripComments(
  line: string,
  inComment: boolean,
): { readonly code: string; readonly inComment: boolean } {
  let code = "";
  let index = 0;
  while (index < line.length) {
    if (inComment) {
      const end = line.indexOf("*/", index);
      if (end === -1) {
        return { code, inComment: true };
      }
      inComment = false;
      index = end + 2;
      continue;
    }
    const start = line.indexOf("/*", index);
    if (start === -1) {
      code += line.slice(index);
      break;
    }
    code += line.slice(index, start);
    const end = line.indexOf("*/", start + 2);
    if (end === -1) {
      return { code, inComment: true };
    }
    index = end + 2;
  }
  return { code, inComment };
}
