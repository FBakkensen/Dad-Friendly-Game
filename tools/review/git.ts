import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/**
 * The reviewer's only shell command (#583). Claude Code's prefix rules
 * cannot keep git's own options out (`git grep -iO<program>` runs a
 * program, `--output` writes a file), so the review job allows only this
 * wrapper. It takes a few fixed subcommands and builds git's arguments
 * itself: patterns go after `-e`, revisions after `--end-of-options`, and
 * paths after `--`, so nothing the reviewer types reaches git as an option.
 * The job runs it from the PR's base commit, like the prompt.
 */

export type Range = { base: string; head: string };

export type GitCall =
  { kind: "run"; args: string[] } | { kind: "refuse"; message: string };

const MAX_LOG = 200;

/** A revision the reviewer may name: a sha, a ref, `HEAD~2`, `abc:path`. */
const REVISION = /^[A-Za-z0-9_][A-Za-z0-9_./~^@{}:-]*$/;

const SAFE = ["--no-pager", "-c", "core.quotePath=false"];
const QUIET = ["--no-color", "--no-ext-diff", "--no-textconv"];

function refuse(message: string): GitCall {
  return { kind: "refuse", message };
}

function run(...args: string[]): GitCall {
  return { kind: "run", args: [...SAFE, ...args] };
}

/** Splits the leading flags from the rest; `--` ends the flags. */
function takeFlags(
  args: readonly string[],
  known: readonly string[],
): { flags: Set<string>; rest: string[] } | string {
  const flags = new Set<string>();
  let at = 0;
  for (; at < args.length; at++) {
    const arg = args[at] ?? "";
    if (arg === "--") {
      at++;
      break;
    }
    if (!arg.startsWith("-")) break;
    if (!known.includes(arg)) return `unknown option ${arg}`;
    flags.add(arg);
  }
  return { flags, rest: args.slice(at) };
}

function diff(range: Range, args: readonly string[]): GitCall {
  const parsed = takeFlags(args, ["--stat", "--name-only"]);
  if (typeof parsed === "string") return refuse(parsed);
  return run(
    "diff",
    ...QUIET,
    ...parsed.flags,
    `${range.base}...${range.head}`,
    "--",
    ...parsed.rest,
  );
}

function log(range: Range, args: readonly string[]): GitCall {
  const parsed = takeFlags(args, ["--patch", "--branch"]);
  if (typeof parsed === "string") return refuse(parsed);
  const span = parsed.flags.has("--branch")
    ? [`${range.base}..${range.head}`]
    : [range.head];
  const patch = parsed.flags.has("--patch") ? ["--patch", ...QUIET] : [];
  return run(
    "log",
    `--max-count=${String(MAX_LOG)}`,
    "--format=%h %ad %s",
    "--date=short",
    ...patch,
    "--end-of-options",
    ...span,
    "--",
    ...parsed.rest,
  );
}

function show(args: readonly string[]): GitCall {
  const [revision, ...extra] = args;
  if (revision === undefined || extra.length > 0)
    return refuse("show takes one revision, such as HEAD~1 or <sha>:<path>");
  if (!REVISION.test(revision)) return refuse(`not a revision: ${revision}`);
  return run("show", ...QUIET, "--end-of-options", revision);
}

function grep(args: readonly string[]): GitCall {
  const parsed = takeFlags(args, ["-i", "-w"]);
  if (typeof parsed === "string") return refuse(parsed);
  const [pattern, ...paths] = parsed.rest;
  if (pattern === undefined) return refuse("grep needs a pattern");
  const flags = ["-i", "-w"].filter((flag) => parsed.flags.has(flag));
  return run(
    "grep",
    "-n",
    "-I",
    "--no-color",
    ...flags,
    "-e",
    pattern,
    "--",
    ...paths,
  );
}

function lsFiles(args: readonly string[]): GitCall {
  return run("ls-files", "--", ...args.filter((arg) => arg !== "--"));
}

export function gitCall(range: Range, args: readonly string[]): GitCall {
  const [command, ...rest] = args;
  switch (command) {
    case "diff":
      return diff(range, rest);
    case "log":
      return log(range, rest);
    case "show":
      return show(rest);
    case "grep":
      return grep(rest);
    case "ls-files":
      return lsFiles(rest);
    default:
      return refuse(HELP);
  }
}

const HELP = `review-git: the reviewer's read-only git.
  review-git diff [--stat|--name-only] [path...]   the PR's change
  review-git log [--patch] [--branch] [path...]    history (--branch: only the PR's commits)
  review-git show <revision>                        a commit, or <revision>:<path>
  review-git grep [-i] [-w] <pattern> [path...]     search the PR's tree
  review-git ls-files [path...]                     list files`;

function main(args: readonly string[]): void {
  const base = process.env.REVIEW_BASE;
  const head = process.env.REVIEW_HEAD;
  if (!base || !head) {
    console.error("review-git: REVIEW_BASE and REVIEW_HEAD must be set");
    process.exit(2);
  }
  const call = gitCall({ base, head }, args);
  if (call.kind === "refuse") {
    console.error(call.message);
    process.exit(2);
  }
  try {
    execFileSync("git", call.args, {
      stdio: "inherit",
      env: { ...process.env, GIT_PAGER: "cat", PAGER: "cat" },
    });
  } catch (error) {
    const status = (error as { status?: number | null }).status;
    process.exit(typeof status === "number" ? status : 1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv.slice(2));
