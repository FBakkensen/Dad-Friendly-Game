import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/**
 * Builds the prompt for the `claude-review` job (#572, #582): which lenses a
 * PR needs, from the paths it changes, and the PR's own words as data. The
 * job runs this file from the PR's base commit, with the lens texts in
 * `.github/review/`, so a PR cannot edit the review it gets. The thread's
 * own reviewer reads the same lenses (ship-sitting skill).
 */

/** The lenses, most important first: the order the review reads them in. */
const LENSES = ["guards", "save", "code", "game", "spec"] as const;
export type Lens = (typeof LENSES)[number];

const BINARY =
  /\.(png|gif|jpe?g|webp|ico|svg|mp3|ogg|wav|woff2?|ttf|pdf|zip)$/i;

const GUARDS: readonly RegExp[] = [
  /^\.github\//,
  /^\.claude\//,
  /^CLAUDE\.md$/,
  /^tools\/review\//,
  /^scripts\/(gate|signoff|changed|function-limits|knip-strict|check-cycles|token-check|visual-check|test-rules|mockup-check)\./,
  /^scripts\/visual\//,
  /^src\/(gate|signoff|function-limits|token-check)\.ts$/,
  /^src\/lab\/(targets|guardrails)\.ts$/,
  /^tools\/journeys\//,
  /(^|\/)vitest\.config\.ts$/,
  // A skipped or loosened test is a weaker guard.
  /\.test\.ts$/,
  /\/__snapshots__\//,
  /^(vite\.config\.ts|eslint\.config\.js|knip\.json|package(-lock)?\.json)$/,
  /(^|\/)tsconfig\.json$/,
  /^\.prettier(rc\.json|ignore)$/,
];

const SAVE: readonly RegExp[] = [
  /^src\/[^/]*save[^/]*\.ts$/,
  /^src\/(persist|phone-backup|cloud-writer|progress-store|server-read|tab-writer|tab-lease|log)\.ts$/,
  // The write path: per-dig and hide saves, and the boot that wires them.
  /^src\/(store-(actions|session|context)|boot|main|mountain-screen)\.ts$/,
  /^firestore\.rules$/,
  /^firebase\.json$/,
  /^public\/sw\.js$/,
  /^rules-test\//,
];

const CODE: readonly RegExp[] = [
  /^src\/.*\.(ts|css)$/,
  /^tools\//,
  /^scripts\//,
  /^public\/.*\.js$/,
  /^index\.html$/,
];

const GAME: readonly RegExp[] = [
  /^src\/(economy|lab)\//,
  /^src\/(tiers|rates|scale|milestones|line|boosts|expeditions|engineers|gold-rush|upgrades|workshop|hazards|veins|mountain|crew-rate|pacing|legacy|relics|haulage)\.ts$/,
  /^src\/[^/]*words\.ts$/,
];

const SPEC: readonly RegExp[] = [/^docs\//, /^mockups\//, /^README\.md$/];

const RULES: Readonly<Record<Lens, readonly RegExp[]>> = {
  guards: GUARDS,
  save: SAVE,
  code: CODE,
  game: GAME,
  spec: SPEC,
};

function lensesOf(path: string): Set<Lens> {
  const found = new Set<Lens>();
  if (BINARY.test(path)) return found;
  for (const lens of LENSES) {
    if (RULES[lens].some((rule) => rule.test(path))) found.add(lens);
  }
  // A test of the rules is the save lens's business, not the code lens's.
  if (path.startsWith("rules-test/")) found.delete("code");
  if (found.size === 0) found.add("code");
  return found;
}

/** The lenses a change needs, most important first. Art alone needs none. */
export function lensesFor(paths: readonly string[]): Lens[] {
  const found = new Set<Lens>();
  for (const path of paths) for (const lens of lensesOf(path)) found.add(lens);
  return LENSES.filter((lens) => found.has(lens));
}

/** The issues a PR body closes (`Fixes #N` and GitHub's other keywords), once each. */
export function issuesFixed(body: string): number[] {
  const found: number[] = [];
  for (const match of body.matchAll(
    /\b(?:fix(?:e[sd])?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi,
  )) {
    const number = Number(match[1]);
    if (!found.includes(number)) found.push(number);
  }
  return found;
}

export type LensTexts = {
  prompt: string;
  lens: Readonly<Record<Lens, string>>;
};

export type Intent = {
  title: string;
  body: string;
  issues: readonly { number: number; body: string }[];
};

export type ReviewPlan =
  | { kind: "review"; lenses: Lens[]; prompt: string }
  | { kind: "skip"; reason: string };

const MAX_PART = 20_000;

/**
 * The author's text, cut to size, unable to close the block it sits in: the
 * tag's name is changed wherever it appears, which (unlike removing it)
 * cannot join two halves into a new one.
 */
function asData(text: string): string {
  const safe = text.replaceAll(/pr-intent/gi, "pr_intent");
  return safe.length <= MAX_PART
    ? safe
    : `${safe.slice(0, MAX_PART)}\n[cut after ${String(MAX_PART)} characters]`;
}

function intentBlock(intent: Intent): string {
  const parts = [
    `## PR title\n\n${asData(intent.title)}`,
    `## PR body\n\n${asData(intent.body)}`,
  ];
  for (const issue of intent.issues)
    parts.push(`## Issue #${String(issue.number)}\n\n${asData(issue.body)}`);
  if (intent.issues.length === 0) parts.push("The PR names no issue it fixes.");
  return `<pr-intent>\n${parts.join("\n\n")}\n</pr-intent>\n`;
}

export function planReview(input: {
  paths: readonly string[];
  base: string;
  head: string;
  pr: number;
  intent: Intent;
  texts: LensTexts;
}): ReviewPlan {
  const lenses = lensesFor(input.paths);
  if (lenses.length === 0) {
    return {
      kind: "skip",
      reason:
        "This PR changes only art or other binary files, so there is nothing for a text review to judge.",
    };
  }
  const body = input.texts.prompt
    .replaceAll("{{PR}}", String(input.pr))
    .replaceAll("{{BASE}}", input.base)
    .replaceAll("{{HEAD}}", input.head)
    .replaceAll("{{LENSES}}", lenses.join(", "))
    .replaceAll(
      "{{LENS_TEXTS}}",
      lenses.map((lens) => input.texts.lens[lens].trim()).join("\n\n"),
    );
  return {
    kind: "review",
    lenses,
    prompt: `${body.trimEnd()}\n\n${intentBlock(input.intent)}`,
  };
}

// The command line, for the workflow and the thread's own reviewer.

const REVIEW_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../.github/review",
);

function readTexts(): LensTexts {
  const read = (name: string) =>
    readFileSync(join(REVIEW_DIR, `${name}.md`), "utf8");
  const lens = Object.fromEntries(
    LENSES.map((name) => [name, read(name)]),
  ) as Record<Lens, string>;
  return { prompt: read("prompt"), lens };
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** The intent folder the workflow writes: `title.txt`, `body.md`, `issue-<n>.md`. */
function readIntent(dir: string): Intent {
  const read = (name: string) => readFileSync(join(dir, name), "utf8");
  const issues = readdirSync(dir)
    .map((name) => /^issue-(\d+)\.md$/.exec(name))
    .filter((match) => match !== null)
    .map((match) => ({ number: Number(match[1]), body: read(match[0]) }))
    .sort((a, b) => a.number - b.number);
  return { title: read("title.txt").trim(), body: read("body.md"), issues };
}

function option(args: readonly string[], name: string): string {
  const at = args.indexOf(`--${name}`);
  const value = at >= 0 ? args[at + 1] : undefined;
  if (value === undefined) throw new Error(`missing --${name}`);
  return value;
}

const HELP = `Usage:
  git diff --name-only origin/main...HEAD | node tools/review/prompt.ts lenses
  node tools/review/prompt.ts issues < pr-body.md
  node tools/review/prompt.ts build --paths <file> --intent <dir> --base <sha> --head <sha> --pr <n> --out <file>

lenses prints the lenses a change needs, or "none". Their texts are .github/review/<lens>.md.
issues prints the issues a PR body closes, one per line.
build writes the review prompt to --out and prints {"kind":"review","lenses":[...]} or {"kind":"skip","reason":...}.`;

function main(args: readonly string[]): void {
  const stdin = () => readFileSync(0, "utf8");
  const [command] = args;
  if (command === "lenses") {
    const lenses = lensesFor(lines(stdin()));
    console.log(lenses.length > 0 ? lenses.join(", ") : "none");
  } else if (command === "issues") {
    for (const number of issuesFixed(stdin())) console.log(number);
  } else if (command === "build") {
    const plan = planReview({
      paths: lines(readFileSync(option(args, "paths"), "utf8")),
      base: option(args, "base"),
      head: option(args, "head"),
      pr: Number(option(args, "pr")),
      intent: readIntent(option(args, "intent")),
      texts: readTexts(),
    });
    if (plan.kind === "review") writeFileSync(option(args, "out"), plan.prompt);
    console.log(
      JSON.stringify(
        plan.kind === "review" ? { kind: "review", lenses: plan.lenses } : plan,
      ),
    );
  } else {
    console.log(HELP);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv.slice(2));
