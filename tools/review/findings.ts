import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { reviewedMarker } from "./recheck.ts";

/**
 * Turns the reviewer's structured answer into one PR review (#584): each
 * finding is a thread on its line, or on its file when GitHub would refuse
 * the line (it takes only lines inside the diff's hunks). A finding in a
 * file the PR does not touch goes in the review body. The thread that wrote
 * the code answers every thread and resolves it before the merge
 * (ship-sitting). The job runs this file from the PR's base commit.
 */

const SEVERITIES = [
  "critical",
  "important",
  "minor",
  "pre-existing",
  "needs-flemming",
] as const;
export type Severity = (typeof SEVERITIES)[number];

export type Finding = {
  severity: Severity;
  path: string;
  line: number;
  title: string;
  body: string;
};

export type Answer = { summary: string; findings: Finding[] };

/** The shape `claude -p --json-schema` holds the reviewer to. */
export const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "findings"],
  properties: {
    summary: {
      type: "string",
      description:
        "One or two sentences on what you checked, and the verdict in plain words.",
    },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "path", "line", "title", "body"],
        properties: {
          severity: { type: "string", enum: [...SEVERITIES] },
          path: {
            type: "string",
            description: "Repo-relative path of the file the finding is in.",
          },
          line: {
            type: "integer",
            description:
              "The line in the PR's version of the file, or 0 for the whole file.",
          },
          title: { type: "string", description: "What is wrong, in one line." },
          body: {
            type: "string",
            description:
              "The input or state that makes it fail, and the fix. Markdown.",
          },
        },
      },
    },
  },
} as const;

const LABEL: Readonly<Record<Severity, string>> = {
  critical: "Critical",
  important: "Important",
  minor: "Minor",
  "pre-existing": "Pre-existing",
  "needs-flemming": "Needs Flemming",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asFinding(value: unknown): Finding | undefined {
  if (!isRecord(value)) return undefined;
  const { severity, path, line, title, body } = value;
  if (!SEVERITIES.includes(severity as Severity)) return undefined;
  if (typeof path !== "string" || path.length === 0) return undefined;
  if (typeof line !== "number" || !Number.isInteger(line)) return undefined;
  if (typeof title !== "string" || typeof body !== "string") return undefined;
  return {
    severity: severity as Severity,
    path: path.replace(/^\.\//, ""),
    line: Math.max(0, line),
    title,
    body,
  };
}

/** The reviewer's answer, or undefined when it is not one. */
export function parseAnswer(value: unknown): Answer | undefined {
  if (!isRecord(value) || typeof value.summary !== "string") return undefined;
  if (!Array.isArray(value.findings)) return undefined;
  const findings = value.findings.map(asFinding);
  if (findings.some((finding) => finding === undefined)) return undefined;
  const sorted = [...(findings as Finding[])].sort(
    (a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity),
  );
  return { summary: value.summary, findings: sorted };
}

/** A path from a `--- a/x` or `+++ b/x` line: no prefix, tab or quotes. */
function headerPath(text: string): string {
  const raw = text.slice(4).replace(/\t$/, "");
  const bare = /^"(.*)"$/.exec(raw)?.[1] ?? raw;
  return bare === "/dev/null" ? bare : bare.replace(/^[ab]\//, "");
}

type ParsedDiff = {
  /** The new-side lines each hunk shows, by the file's new path. */
  lines: Map<string, Set<number>>;
  /** The files a comment may name: new paths, and deleted files' old ones. */
  touched: Set<string>;
};

function parseDiff(diff: string): ParsedDiff {
  const parsed: ParsedDiff = { lines: new Map(), touched: new Set() };
  let lines: Set<number> | undefined;
  let header = false;
  let old = "";
  let next = 0;
  for (const text of diff.split("\n")) {
    if (text.startsWith("diff --git ")) {
      lines = undefined;
      header = true;
    } else if (header && text.startsWith("--- ")) {
      old = headerPath(text);
    } else if (header && text.startsWith("+++ ")) {
      const path = headerPath(text);
      lines = new Set();
      if (path !== "/dev/null") parsed.lines.set(path, lines);
      parsed.touched.add(path === "/dev/null" ? old : path);
    } else if (text.startsWith("@@")) {
      header = false;
      next = Number(/\+(\d+)/.exec(text)?.[1] ?? 0);
    } else if (!header && lines && /^[+ ]/.test(text)) {
      lines.add(next++);
    }
  }
  return parsed;
}

/** Each file in a unified diff, with the new-side lines its hunks show. */
export function commentableLines(diff: string): Map<string, Set<number>> {
  return parseDiff(diff).lines;
}

const ASK =
  "_Fix it and name the commit, or reply with why not; then resolve this thread._";

function findingText(finding: Finding): string {
  return `**${LABEL[finding.severity]}**: ${finding.title}\n\n${finding.body.trim()}`;
}

function threadText(finding: Finding, onFile: boolean): string {
  const where =
    onFile && finding.line > 0
      ? `\n\n(Line ${String(finding.line)}, outside the diff's hunks.)`
      : "";
  return `${findingText(finding)}${where}\n\n${ASK}`;
}

export type ReviewPost = {
  review: {
    commit_id: string;
    event: "COMMENT";
    body: string;
    comments: { path: string; line: number; side: "RIGHT"; body: string }[];
  };
  fileComments: {
    commit_id: string;
    path: string;
    subject_type: "file";
    body: string;
  }[];
  /** Every finding in one Markdown comment, if GitHub refuses the review. */
  fallback: string;
};

export type Header = {
  lenses: string;
  head: string;
  cost: number;
  runUrl: string;
  /** On a re-check (#585), the commit the last review covered. */
  since?: string;
};

function counts(findings: readonly Finding[]): string {
  if (findings.length === 0) return "No findings.";
  const parts = SEVERITIES.map((severity) => {
    const n = findings.filter((f) => f.severity === severity).length;
    return n > 0 ? `${String(n)} ${LABEL[severity]}` : "";
  }).filter((part) => part.length > 0);
  return `Findings: ${parts.join(", ")}.`;
}

function footer(header: Header): string {
  return `---\n_Opus 5.5 via \`claude -p\`, paid from the monthly API credit: $${header.cost.toFixed(2)}. ([run](${header.runUrl}))_`;
}

function heading(header: Header): string {
  const at = `at commit ${header.head.slice(0, 7)}`;
  const what =
    header.since === undefined
      ? `Reviewed as: ${header.lenses}, ${at}.`
      : `Re-checked the changes since ${header.since.slice(0, 7)} as: ${header.lenses}, ${at}.`;
  return `${reviewedMarker(header.head)}\n## Claude review\n\n${what}`;
}

export function reviewPost(
  answer: Answer,
  diff: string,
  header: Header,
): ReviewPost {
  const { lines, touched } = parseDiff(diff);
  const comments: ReviewPost["review"]["comments"] = [];
  const fileComments: ReviewPost["fileComments"] = [];
  const outside: Finding[] = [];
  for (const finding of answer.findings) {
    if (lines.get(finding.path)?.has(finding.line)) {
      comments.push({
        path: finding.path,
        line: finding.line,
        side: "RIGHT",
        body: threadText(finding, false),
      });
    } else if (touched.has(finding.path)) {
      fileComments.push({
        commit_id: header.head,
        path: finding.path,
        subject_type: "file",
        body: threadText(finding, true),
      });
    } else {
      outside.push(finding);
    }
  }
  const top = `${heading(header)}\n\n${answer.summary.trim()}\n\n${counts(answer.findings)}`;
  const elsewhere =
    outside.length === 0
      ? ""
      : `\n\n### Outside this PR's files\n\nAnswer these in a PR comment.\n\n${outside
          .map((f) => `- \`${f.path}:${String(f.line)}\`: ${findingText(f)}`)
          .join("\n\n")}`;
  const all = answer.findings
    .map((f) => `- \`${f.path}:${String(f.line)}\`: ${findingText(f)}`)
    .join("\n\n");
  return {
    review: {
      commit_id: header.head,
      event: "COMMENT",
      body: `${top}${elsewhere}\n\n${footer(header)}\n`,
      comments,
    },
    fileComments,
    fallback: `${top}${all.length > 0 ? `\n\n${all}` : ""}\n\n${footer(header)}\n`,
  };
}

// The command line, for the workflow.

function option(args: readonly string[], name: string): string {
  const at = args.indexOf(`--${name}`);
  const value = at >= 0 ? args[at + 1] : undefined;
  if (value === undefined) throw new Error(`missing --${name}`);
  return value;
}

const HELP = `Usage:
  node tools/review/findings.ts schema
  node tools/review/findings.ts post --answer <review.json> --diff <file> --head <sha> --lenses <text> --cost <usd> --run <url> --out <dir>

schema prints the JSON Schema for claude -p --json-schema.
With --since <sha>, the review is headed as a re-check of the changes since that commit.
post reads claude's JSON output and writes <dir>/review.json, <dir>/file-<n>.json and <dir>/fallback.md.
It exits 3 when the output holds no valid answer.`;

function post(args: readonly string[]): void {
  const output: unknown = JSON.parse(
    readFileSync(option(args, "answer"), "utf8"),
  );
  const answer = parseAnswer(
    isRecord(output) ? output.structured_output : undefined,
  );
  if (answer === undefined) {
    console.error("no valid answer in the review output");
    process.exit(3);
  }
  const out = option(args, "out");
  const result = reviewPost(
    answer,
    readFileSync(option(args, "diff"), "utf8"),
    {
      head: option(args, "head"),
      lenses: option(args, "lenses"),
      cost: Number(option(args, "cost")),
      runUrl: option(args, "run"),
      ...(args.includes("--since") ? { since: option(args, "since") } : {}),
    },
  );
  writeFileSync(join(out, "review.json"), JSON.stringify(result.review));
  result.fileComments.forEach((comment, n) => {
    writeFileSync(join(out, `file-${String(n)}.json`), JSON.stringify(comment));
  });
  writeFileSync(join(out, "fallback.md"), result.fallback);
  console.log(
    JSON.stringify({
      threads: result.review.comments.length + result.fileComments.length,
      findings: answer.findings.length,
    }),
  );
}

function main(args: readonly string[]): void {
  const [command] = args;
  if (command === "schema") console.log(JSON.stringify(ANSWER_SCHEMA));
  else if (command === "post") post(args);
  else console.log(HELP);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv.slice(2));
