/**
 * The pure half of `npm run gate` (scripts/gate.mjs): the steps of each tier,
 * the order they may run in, and the one line each prints.
 *
 *   npm run gate -- fast   the edit loop: typecheck, lint and tests on changes
 *   npm run gate -- merge  the quick whole-tree checks, run by merge-check.yml on
 *                          each PR merged with main (#617)
 *   npm run gate -- full   everything, before the PR (`npm run check`)
 *   npm run gate -- signoff  the signoff status on HEAD (src/signoff.ts)
 */

export type Tier = "fast" | "merge" | "full";

const TIERS: readonly Tier[] = ["fast", "merge", "full"];

export interface Step {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly tiers: readonly Tier[];
  /** Names of steps that must pass before this one starts. */
  readonly after: readonly string[];
  /** Added to the gate's own environment for this step. */
  readonly env: Readonly<Record<string, string>>;
  /**
   * A heavy step fills every core: two at once starve each other, and the visual check's
   * timing checks then fail under the load (#403). Heavy steps take turns.
   */
  readonly lane: "shared" | "heavy";
  /** Deterministic, and skipped when the same inputs passed before (`reusedOutcome`). */
  readonly reusable: boolean;
}

export type Outcome =
  | { readonly kind: "passed"; readonly seconds: number }
  | {
      readonly kind: "failed";
      readonly seconds: number;
      readonly code: number;
    }
  | { readonly kind: "skipped"; readonly because: string }
  /** Not run: the same inputs passed on `sha`, so this run would prove the same (#403). */
  | { readonly kind: "reused"; readonly sha: string };

/** A green run of a reusable step: the fingerprint of its inputs, and the commit it ran on. */
export interface PassRecord {
  readonly key: string;
  readonly sha: string;
}

/** A record file's text, or undefined for anything that is not a whole record. */
export function parsePass(text: string | undefined): PassRecord | undefined {
  if (text === undefined) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof value !== "object" || value === null) return undefined;
  const { key, sha } = value as Record<string, unknown>;
  return typeof key === "string" && typeof sha === "string"
    ? { key, sha }
    : undefined;
}

/**
 * The canonical text of a reusable step's inputs, hashed by the runner into its key: the
 * step's command, args and env, every file it reads (sorted by path), the lock file and the
 * Node version. Any byte of any of them changes the text.
 */
export function reuseInputs({
  step,
  files,
  lock,
  node,
}: {
  readonly step: Step;
  readonly files: readonly (readonly [path: string, content: string])[];
  readonly lock: string;
  readonly node: string;
}): string {
  const contents = new Map(files);
  return JSON.stringify({
    command: step.command,
    args: step.args,
    env: Object.keys(step.env)
      .sort()
      .map((name) => [name, step.env[name]]),
    files: [...contents.keys()]
      .sort()
      .map((path) => [path, contents.get(path)]),
    lock,
    node,
  });
}

/**
 * What a reusable step's run does to its record. Only a green run whose inputs were the same
 * when it finished as when it started earns one: an edit mid-run means the pass covered a mix
 * of old and new, and a later run must not reuse it.
 */
export function recordMove({
  passed,
  before,
  after,
}: {
  readonly passed: boolean;
  readonly before: string;
  readonly after: string;
}): "write" | "delete" {
  return passed && before === after ? "write" : "delete";
}

/** Reused when the step may be and its inputs match a recorded green run; else undefined. */
export function reusedOutcome(
  step: Step,
  key: string,
  record: PassRecord | undefined,
): Outcome | undefined {
  return step.reusable && record?.key === key
    ? { kind: "reused", sha: record.sha }
    : undefined;
}

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

/**
 * Every changed path of any kind, once, sorted, without build output: what the fast tier
 * checks the format of. Deleted files are the caller's to drop.
 */
export function touchedFiles(paths: readonly string[]): readonly string[] {
  return [...new Set(paths.filter((path) => !BUILT.test(path)))].sort();
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
  "functions",
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
 * and measure folders it discovers at run time. The committed pacing ledger
 * (#554) is an input too: the `lab` step checks its run against it, so a
 * changed ledger runs the lab again and is never reused.
 */
export const LAB_ENTRIES: readonly string[] = [
  "tools/strategy-lab.ts",
  "tools/generations-lab.ts",
  "tools/lab-register.mjs",
  "tools/lab-hooks.mjs",
  "docs/pacing-ledger.md",
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
 * The steps that fill every core, in the order they take turns: visual first (#403). The
 * journeys' Chrome on a jumping clock is heavy too, and its timing must not starve (#552).
 */
const HEAVY: ReadonlySet<string> = new Set([
  "visual",
  "journeys",
  "lab",
  "lab:generations",
]);

/** The seeded labs: the same inputs give the same result, so a green run can stand (#403). */
const REUSABLE: ReadonlySet<string> = new Set(["lab", "lab:generations"]);

/**
 * Every step either tier can run. `changed` is the code changed since
 * origin/main: the fast tier lints and tests it, and with none only
 * typechecks. `economy` adds the strict strategy lab to the full tier.
 */
export function gateSteps(
  changed: readonly string[],
  {
    economy,
    touched = [],
  }: {
    readonly economy: boolean;
    /** Every file changed since origin/main, of any kind: the fast tier checks their format. */
    readonly touched?: readonly string[];
  },
): readonly Step[] {
  const both: readonly Tier[] = ["fast", "merge", "full"];
  const full: readonly Tier[] = ["full"];
  // The checks that catch two green PRs breaking each other once merged (#617): a renamed
  // export, a broken import, a test of one PR against the other's code. The browsers, the
  // emulator and the labs stay in the full tier, which deploy-hosting runs on main.
  const whole: readonly Tier[] = ["merge", "full"];
  const step = (
    name: string,
    command: string,
    args: readonly string[],
    tiers: readonly Tier[],
    after: readonly string[] = [],
    env: Readonly<Record<string, string>> = {},
  ): Step => ({
    name,
    command,
    args,
    tiers,
    after,
    env,
    lane: HEAVY.has(name) ? "heavy" : "shared",
    reusable: REUSABLE.has(name),
  });
  // CI ran these on every PR (~18 min). Now only when the lab's code changed.
  const lab: readonly Step[] = economy
    ? [
        step(
          "lab",
          "node",
          [...LAB, "tools/strategy-lab.ts", "--ci", "--ledger", "check"],
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
  // A prettier miss once cost a whole full run; the fast tier catches it in seconds.
  const formatChanged: readonly Step[] =
    touched.length === 0
      ? []
      : [
          step(
            "format:changed",
            `${BIN}/prettier`,
            ["--check", "--ignore-unknown", ...touched],
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
    // No function passes 150 lines or complexity 15, with no exceptions (#408, #422).
    step("functions", "node", ["scripts/function-limits.mjs"], both),
    ...onChanges,
    ...formatChanged,
    step(
      "lint",
      `${BIN}/eslint`,
      [".", "--cache", "--max-warnings", "0"],
      whole,
    ),
    step("cycles", "node", ["scripts/check-cycles.mjs"], whole),
    step("format", `${BIN}/prettier`, ["--check", "."], whole),
    step("knip", "node", ["scripts/knip-strict.js"], whole),
    step("tokens", "node", ["scripts/token-check.mjs"], whole),
    // Unit only: the sim project's long economy runs are the full tier's.
    step("test:unit", `${BIN}/vitest`, ["run", "--project", "unit"], ["merge"]),
    step("coverage", `${BIN}/vitest`, ["run", "--coverage"], full),
    step("rules", "node", ["scripts/test-rules.mjs"], full, STATIC),
    step("visual", "node", ["scripts/visual-check.mjs"], full, AFTER_TESTS),
    // Gameplay journeys in a real browser, read against the rules (#552). A failure keeps a
    // trace in .gate/journeys/.
    step(
      "journeys",
      `${BIN}/playwright`,
      ["test", "-c", "tools/journeys"],
      full,
      AFTER_TESTS,
    ),
    step("mockups", "node", ["scripts/mockup-check.mjs"], full, AFTER_TESTS),
    ...lab,
  ];
}

export type Parsed =
  | { readonly kind: "tier"; readonly tier: Tier }
  | { readonly kind: "signoff" }
  | { readonly kind: "help" }
  | { readonly kind: "invalid"; readonly message: string };

export const USAGE = `npm run gate -- <fast|merge|full|signoff>
  fast     typecheck, plus lint and vitest related on the code changed since origin/main
  merge    the quick whole-tree checks and the unit tests (merge-check.yml runs it on each PR merged with main)
  full     every check (npm run check)
  signoff  post the signoff status on HEAD after a green full run on it
Logs go to ${GATE_DIR}/logs/. A failed step prints its log tail.`;

export function parseArgs(args: readonly string[]): Parsed {
  if (args.includes("--help") || args.includes("-h")) return { kind: "help" };
  const [first, ...rest] = args;
  if (first === undefined) {
    return { kind: "invalid", message: "Pick a tier: fast, merge or full." };
  }
  if (rest.length > 0) {
    return { kind: "invalid", message: `Unexpected: ${rest.join(" ")}` };
  }
  if (first === "signoff") return { kind: "signoff" };
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
  // One heavy step at a time: busy while one runs, or once this move starts one.
  let heavyBusy = steps.some(
    (step) => step.lane === "heavy" && running.has(step.name),
  );
  for (const step of steps) {
    if (outcomes.has(step.name) || running.has(step.name)) continue;
    const blocked = step.after.find((name) => {
      const kind = outcomes.get(name)?.kind;
      return kind === "failed" || kind === "skipped";
    });
    if (blocked !== undefined) {
      skip.push({ step, because: blocked });
    } else if (
      step.after.every((name) => {
        const kind = outcomes.get(name)?.kind;
        return kind === "passed" || kind === "reused";
      }) &&
      !(step.lane === "heavy" && heavyBusy)
    ) {
      start.push(step);
      heavyBusy ||= step.lane === "heavy";
    }
  }
  return { start, skip };
}

const LABEL = {
  passed: "ok",
  failed: "FAIL",
  skipped: "skip",
  reused: "ok",
} as const;

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
    case "reused":
      return `${head}reused (same inputs passed on ${outcome.sha.slice(0, 7)})`;
  }
}

export function exitCode(outcomes: Iterable<Outcome>): 0 | 1 {
  for (const outcome of outcomes) {
    if (outcome.kind !== "passed" && outcome.kind !== "reused") return 1;
  }
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
    const reused = list.filter((outcome) => outcome.kind === "reused").length;
    const note = reused === 0 ? "" : ` (${String(reused)} reused)`;
    return `gate ${tier}: ${String(list.length)} passed${note} in ${time}`;
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
