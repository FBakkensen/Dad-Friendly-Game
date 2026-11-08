/**
 * The pure half of `npm run gate` (scripts/gate.mjs): the steps of each tier,
 * the order they may run in, and the one line each prints.
 *
 *   npm run gate -- fast   the edit loop: typecheck, lint and tests on changes
 *   npm run gate -- full   everything, before every push (`npm run check`)
 */

export type Tier = "fast" | "full";

const TIERS: readonly Tier[] = ["fast", "full"];

export interface Step {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly tiers: readonly Tier[];
  /** Names of steps that must pass before this one starts. */
  readonly after: readonly string[];
  /** Added to the gate's own environment for this step. */
  readonly env: Readonly<Record<string, string>>;
}

export type Outcome =
  | { readonly kind: "passed"; readonly seconds: number }
  | {
      readonly kind: "failed";
      readonly seconds: number;
      readonly code: number;
    }
  | { readonly kind: "skipped"; readonly because: string };

const CODE = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/;
const BUILT = /^(?:dist|coverage|node_modules|\.gate)\//;

/**
 * Paths come from git (repo-relative, `/`-separated) and may repeat. Deleted
 * files are the caller's to drop: this module does not touch the disk.
 */
export function changedCode(paths: readonly string[]): readonly string[] {
  return [
    ...new Set(paths.filter((path) => CODE.test(path) && !BUILT.test(path))),
  ].sort();
}

/** Splits `git ... --name-only -z` output. */
export function splitGitPaths(output: string): readonly string[] {
  return output.split("\0").filter((path) => path !== "");
}

const BIN = "node_modules/.bin";
/** Git-ignored home of the step logs and the incremental typecheck state. */
export const GATE_DIR = ".gate";
const STATIC = [
  "env",
  "typecheck",
  "typecheck:tools",
  "lint",
  "cycles",
  "format",
  "knip",
  "tokens",
];

/**
 * The browser checks and the lab start once the tests are done: ten Chrome
 * pages beside the coverage run starve the long sims past their timeouts.
 */
const AFTER_TESTS = [...STATIC, "coverage"];

function tsc(project: string, name: string): readonly string[] {
  return [
    "--noEmit",
    "--incremental",
    "--tsBuildInfoFile",
    `${GATE_DIR}/${name}.tsbuildinfo`,
    "-p",
    project,
  ];
}

/**
 * Where the strategy lab starts: both commands, their loader, and the policy
 * and measure folders it discovers at run time.
 */
export const LAB_ENTRIES: readonly string[] = [
  "tools/strategy-lab.ts",
  "tools/generations-lab.ts",
  "tools/lab-register.mjs",
  "tools/lab-hooks.mjs",
];
export const LAB_DIRS: readonly string[] = [
  "src/lab/policies",
  "src/lab/measures",
];

/** Relative specifiers a source file imports, re-exports, or loads lazily. */
export function relativeImports(source: string): readonly string[] {
  return [
    ...source.matchAll(
      /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["'](\.{1,2}\/[^"']+)["']/g,
    ),
  ].map((match) => String(match[1]));
}

/** `/`-separated join that resolves `.` and `..`; repo paths only. */
function joinPath(file: string, spec: string): string {
  const parts = file.split("/").slice(0, -1);
  for (const part of spec.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

/**
 * Every file reachable from `entries` through relative imports. `read` gives
 * a file's source, or undefined when there is no such file.
 */
export function importClosure(
  entries: readonly string[],
  read: (path: string) => string | undefined,
): ReadonlySet<string> {
  const seen = new Set<string>();
  const queue = [...entries];
  for (let file = queue.shift(); file !== undefined; file = queue.shift()) {
    const source = read(file);
    if (source === undefined || seen.has(file)) continue;
    seen.add(file);
    for (const spec of relativeImports(source)) {
      const base = joinPath(file, spec);
      const found = [
        base,
        `${base}.ts`,
        `${base}.mjs`,
        `${base}/index.ts`,
      ].find((path) => read(path) !== undefined);
      if (found !== undefined) queue.push(found);
    }
  }
  return seen;
}

/** True when a changed file is one the strategy lab runs. */
export function economyChanged(
  changed: readonly string[],
  closure: ReadonlySet<string>,
): boolean {
  return changed.some((path) => closure.has(path));
}

const LAB = ["--import", "./tools/lab-register.mjs"];

/**
 * Every step either tier can run. `changed` is the code changed since
 * origin/main: the fast tier lints and tests it, and with none only
 * typechecks. `economy` adds the strict strategy lab to the full tier.
 */
export function gateSteps(
  changed: readonly string[],
  { economy }: { readonly economy: boolean },
): readonly Step[] {
  const both: readonly Tier[] = ["fast", "full"];
  const full: readonly Tier[] = ["full"];
  const step = (
    name: string,
    command: string,
    args: readonly string[],
    tiers: readonly Tier[],
    after: readonly string[] = [],
    env: Readonly<Record<string, string>> = {},
  ): Step => ({ name, command, args, tiers, after, env });
  // CI ran these on every PR (~18 min). Now only when the lab's code changed.
  const lab: readonly Step[] = economy
    ? [
        step(
          "lab",
          "node",
          [...LAB, "tools/strategy-lab.ts", "--ci"],
          full,
          AFTER_TESTS,
          { LAB_STRICT: "1" },
        ),
        step(
          "lab:generations",
          "node",
          [...LAB, "tools/generations-lab.ts", "--ci"],
          full,
          AFTER_TESTS,
          { LAB_STRICT: "1" },
        ),
      ]
    : [];
  const onChanges: readonly Step[] =
    changed.length === 0
      ? []
      : [
          step(
            "lint:changed",
            `${BIN}/eslint`,
            ["--cache", "--max-warnings", "0", ...changed],
            ["fast"],
          ),
          step(
            "test:related",
            `${BIN}/vitest`,
            // unit only: the sim project's long economy runs are the full tier's.
            [
              "related",
              "--run",
              "--passWithNoTests",
              "--project",
              "unit",
              ...changed,
            ],
            ["fast"],
          ),
        ];
  return [
    step("env", "node", ["scripts/env-report.mjs", "--strict"], full),
    step("typecheck", `${BIN}/tsc`, tsc("tsconfig.json", "app"), both),
    step(
      "typecheck:tools",
      `${BIN}/tsc`,
      tsc("tools/tsconfig.json", "tools"),
      both,
    ),
    ...onChanges,
    step(
      "lint",
      `${BIN}/eslint`,
      [".", "--cache", "--max-warnings", "0"],
      full,
    ),
    step("cycles", "node", ["scripts/check-cycles.mjs"], full),
    step("format", `${BIN}/prettier`, ["--check", "."], full),
    step("knip", "node", ["scripts/knip-strict.js"], full),
    step("tokens", "node", ["scripts/token-check.mjs"], full),
    step("coverage", `${BIN}/vitest`, ["run", "--coverage"], full),
    step("rules", "node", ["scripts/test-rules.mjs"], full, STATIC),
    step("visual", "node", ["scripts/visual-check.mjs"], full, AFTER_TESTS),
    step("mockups", "node", ["scripts/mockup-check.mjs"], full, AFTER_TESTS),
    ...lab,
  ];
}

export type Parsed =
  | { readonly kind: "tier"; readonly tier: Tier }
  | { readonly kind: "help" }
  | { readonly kind: "invalid"; readonly message: string };

export const USAGE = `npm run gate -- <fast|full>
  fast  typecheck, plus lint and vitest related on the code changed since origin/main
  full  every check (npm run check)
Logs go to ${GATE_DIR}/logs/. A failed step prints its log tail.`;

export function parseArgs(args: readonly string[]): Parsed {
  if (args.includes("--help") || args.includes("-h")) return { kind: "help" };
  const [first, ...rest] = args;
  if (first === undefined) {
    return { kind: "invalid", message: "Pick a tier: fast or full." };
  }
  if (rest.length > 0) {
    return { kind: "invalid", message: `Unexpected: ${rest.join(" ")}` };
  }
  const tier = TIERS.find((name) => name === first);
  return tier === undefined
    ? { kind: "invalid", message: `Unknown tier: ${first}` }
    : { kind: "tier", tier };
}

export type Plan =
  | { readonly kind: "ok"; readonly steps: readonly Step[] }
  | { readonly kind: "invalid"; readonly message: string };

/**
 * The tier's steps, in table order. A dependency outside the tier, a repeated
 * name, or a cycle is a mistake in the table, not something to run around.
 */
export function planTier(tier: Tier, all: readonly Step[]): Plan {
  const steps = all.filter((step) => step.tiers.includes(tier));
  const names = new Set<string>();
  for (const step of steps) {
    if (names.has(step.name)) {
      return { kind: "invalid", message: `Two steps named ${step.name}.` };
    }
    names.add(step.name);
  }
  for (const step of steps) {
    const missing = step.after.find((name) => !names.has(name));
    if (missing !== undefined) {
      return {
        kind: "invalid",
        message: `${step.name} waits on ${missing}, which is not in the ${tier} tier.`,
      };
    }
  }
  // Peel off steps whose dependencies are all peeled; what is left is a cycle.
  const peeled = new Set<string>();
  let left = steps;
  while (left.length > 0) {
    const ready = left.filter((step) =>
      step.after.every((name) => peeled.has(name)),
    );
    if (ready.length === 0) {
      const loop = left.map((step) => step.name).join(", ");
      return { kind: "invalid", message: `${loop} wait on each other.` };
    }
    for (const step of ready) peeled.add(step.name);
    left = left.filter((step) => !peeled.has(step.name));
  }
  return { kind: "ok", steps };
}

export interface Moves {
  readonly start: readonly Step[];
  readonly skip: readonly {
    readonly step: Step;
    readonly because: string;
  }[];
}

/**
 * What to do next: start every waiting step whose dependencies all passed,
 * and skip every waiting step with a dependency that failed or was skipped.
 */
export function nextMoves(
  steps: readonly Step[],
  outcomes: ReadonlyMap<string, Outcome>,
  running: ReadonlySet<string>,
): Moves {
  const start: Step[] = [];
  const skip: { step: Step; because: string }[] = [];
  for (const step of steps) {
    if (outcomes.has(step.name) || running.has(step.name)) continue;
    const blocked = step.after.find((name) => {
      const kind = outcomes.get(name)?.kind;
      return kind === "failed" || kind === "skipped";
    });
    if (blocked !== undefined) {
      skip.push({ step, because: blocked });
    } else if (
      step.after.every((name) => outcomes.get(name)?.kind === "passed")
    ) {
      start.push(step);
    }
  }
  return { start, skip };
}

const LABEL = { passed: "ok", failed: "FAIL", skipped: "skip" } as const;

/** `ok    typecheck        4.1s`; `width` lines the names up. */
export function summaryLine(
  name: string,
  outcome: Outcome,
  width: number,
): string {
  const head = `${LABEL[outcome.kind].padEnd(6)}${name.padEnd(width + 2)}`;
  switch (outcome.kind) {
    case "passed":
      return `${head}${outcome.seconds.toFixed(1)}s`;
    case "failed":
      return `${head}${outcome.seconds.toFixed(1)}s  exit ${String(outcome.code)}`;
    case "skipped":
      return `${head}blocked by ${outcome.because}`;
  }
}

export function exitCode(outcomes: Iterable<Outcome>): 0 | 1 {
  for (const outcome of outcomes) if (outcome.kind !== "passed") return 1;
  return 0;
}

export function totalLine(
  tier: Tier,
  outcomes: Iterable<Outcome>,
  seconds: number,
): string {
  const list = [...outcomes];
  const failed = list.filter((outcome) => outcome.kind === "failed").length;
  const skipped = list.filter((outcome) => outcome.kind === "skipped").length;
  const time = `${seconds.toFixed(1)}s`;
  if (failed === 0 && skipped === 0) {
    return `gate ${tier}: ${String(list.length)} passed in ${time}`;
  }
  const parts = [`${String(failed)} failed`];
  if (skipped > 0) parts.push(`${String(skipped)} skipped`);
  return `gate ${tier}: ${parts.join(", ")} in ${time}`;
}

/** The last `lines` non-blank-trailing lines of a log. */
export function logTail(text: string, lines = 40): string {
  const all = text.replace(/\s+$/, "").split("\n");
  return all.slice(Math.max(0, all.length - lines)).join("\n");
}
