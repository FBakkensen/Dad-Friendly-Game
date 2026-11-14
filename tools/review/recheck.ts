import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * The re-check of a PR after a push (#585). Each Claude review carries a
 * hidden marker with the commit it reviewed. On a push, the job finds the
 * last one: if the PR's own change is the same as then (only `main` was
 * merged in), the earlier result is kept with no model call; otherwise the
 * reviewer looks only at what changed since, with the review threads and
 * their replies as data. The job runs this file from the PR's base commit.
 */

const MARKER = /<!-- claude-review reviewed=([0-9a-f]{40}) -->/;

/** The line every posted review carries, naming the commit it reviewed. */
export function reviewedMarker(head: string): string {
  return `<!-- claude-review reviewed=${head} -->`;
}

export type Posted = { body: string; at: string };

/** The commit the latest marked review covered, if any. */
export function lastReviewed(posts: readonly Posted[]): string | undefined {
  let found: { sha: string; at: string } | undefined;
  for (const post of posts) {
    const sha = MARKER.exec(post.body)?.[1];
    if (sha !== undefined && (found === undefined || post.at >= found.at))
      found = { sha, at: post.at };
  }
  return found?.sha;
}

/**
 * A diff with what a merge of `main` moves and nothing else: blob ids and
 * hunk positions dropped.
 */
export function changeShape(diff: string): string {
  return diff
    .split("\n")
    .filter((line) => !line.startsWith("index "))
    .map((line) => (line.startsWith("@@") ? "@@" : line))
    .join("\n");
}

export type Thread = {
  isResolved: boolean;
  path: string;
  line: number | null;
  comments: { author: string; body: string }[];
};

/** The review threads from the GraphQL answer the workflow saves. */
export function threadsOf(answer: unknown): Thread[] {
  const nodes = (
    answer as {
      data?: {
        repository?: {
          pullRequest?: { reviewThreads?: { nodes?: unknown[] } };
        };
      };
    }
  ).data?.repository?.pullRequest?.reviewThreads?.nodes;
  if (!Array.isArray(nodes)) return [];
  return nodes.map((node) => {
    const n = node as {
      isResolved?: boolean;
      path?: string;
      line?: number | null;
      comments?: { nodes?: { author?: { login?: string }; body?: string }[] };
    };
    return {
      isResolved: n.isResolved === true,
      path: n.path ?? "",
      line: n.line ?? null,
      comments: (n.comments?.nodes ?? []).map((c) => ({
        author: c.author?.login ?? "someone",
        body: c.body ?? "",
      })),
    };
  });
}

/** The threads as Markdown for the reviewer: open ones first, replies kept. */
export function threadsText(threads: readonly Thread[]): string {
  if (threads.length === 0) return "";
  const sorted = [...threads].sort(
    (a, b) => Number(a.isResolved) - Number(b.isResolved),
  );
  return sorted
    .map((thread) => {
      const where =
        thread.line === null
          ? thread.path
          : `${thread.path}:${String(thread.line)}`;
      const state = thread.isResolved ? "resolved" : "open";
      const said = thread.comments
        .map((c) => `**${c.author}:** ${c.body.trim()}`)
        .join("\n\n");
      return `### ${where} (${state})\n\n${said}`;
    })
    .join("\n\n");
}

// The command line, for the workflow.

function prChange(base: string, commit: string): string {
  return execFileSync(
    "git",
    [
      "-c",
      "core.quotePath=false",
      "diff",
      "--no-color",
      "--no-ext-diff",
      "--no-textconv",
      `${base}...${commit}`,
    ],
    { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 },
  );
}

function option(args: readonly string[], name: string): string {
  const at = args.indexOf(`--${name}`);
  const value = at >= 0 ? args[at + 1] : undefined;
  if (value === undefined) throw new Error(`missing --${name}`);
  return value;
}

function lines(text: string): Posted[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Posted);
}

const HELP = `Usage:
  node tools/review/recheck.ts last < posts.jsonl
  node tools/review/recheck.ts same --base <sha> --last <sha> --head <sha>
  node tools/review/recheck.ts threads --in <graphql.json> --out <file>

last prints the commit the latest marked review covered, from {"body","at"} lines, or nothing.
same exits 0 when the PR's own change at --head is the one reviewed at --last, else 1.
threads writes the review threads as Markdown (an empty file when there are none).`;

function main(args: readonly string[]): void {
  const [command] = args;
  if (command === "last") {
    const sha = lastReviewed(lines(readFileSync(0, "utf8")));
    if (sha !== undefined) console.log(sha);
  } else if (command === "same") {
    const base = option(args, "base");
    const before = changeShape(prChange(base, option(args, "last")));
    const now = changeShape(prChange(base, option(args, "head")));
    process.exit(before === now ? 0 : 1);
  } else if (command === "threads") {
    const answer: unknown = JSON.parse(
      readFileSync(option(args, "in"), "utf8"),
    );
    writeFileSync(option(args, "out"), threadsText(threadsOf(answer)));
  } else {
    console.log(HELP);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv.slice(2));
