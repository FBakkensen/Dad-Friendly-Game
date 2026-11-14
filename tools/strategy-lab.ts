import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withFactors } from "../src/economy/factors";
import { parseMeasureExport } from "../src/lab/measure";
import { parsePolicyExport } from "../src/lab/policy";
import {
  guardrailChecks,
  labStatusCode,
  type GuardrailCheck,
} from "../src/lab/guardrails";
import { renderReport, reportJson } from "../src/lab/report";
import { ledgerDiff, renderLedger } from "../src/lab/ledger";
import { discover } from "../src/lab/registry";
import { runTournament } from "../src/lab/tournament";
import { parseFactors } from "./lab-factors";
import {
  CI_SEEDS,
  DEFAULT_MAX_DAYS,
  LOCAL_SEEDS,
  TARGETS,
} from "../src/lab/targets";

/** The committed pacing ledger (#554), from the repo root. */
export const LEDGER_PATH = "docs/pacing-ledger.md";

export type LedgerMode = "off" | "check" | "write";

/**
 * Loads the policy and measure registries and writes the strategy-lab
 * report. Not part of the game bundle. `node:fs` stays in this file;
 * the tournament never reads the disk.
 */

const HELP = `Run every registered player type and write the strategy lab report.

Usage:
  npm run lab
  npm run lab -- --ci
  npm run lab -- --policy <id> [--policy <id>]
  npm run lab -- --seeds <n> --days <n> --out <dir>
  npm run lab -- --factors line.off=0,layer.3.cart.hardness=0.8
  npm run lab -- --ci --ledger check
  npm run lab:ledger

Seeds default to ${String(LOCAL_SEEDS)} (1 through that count). --ci uses ${String(CI_SEEDS)}.
--seeds wins over both. Days default to ${String(DEFAULT_MAX_DAYS)}.
--policy limits the rows. The columns are still every registered measure.
--factors holds sweep factors for every run (line.off=0 plays the line, #534).
A missed guardrail is a warning unless LAB_STRICT=1, which exits 1.
--ledger check fails when the run's pacing ledger differs from ${LEDGER_PATH};
--ledger write (npm run lab:ledger) writes it. Both need the gate's run: --ci,
every player type, no factors and the default days.
Reports land in reports/strategy-lab.md, reports/strategy-lab.json and
reports/pacing-ledger.md.`;

export type LabArgs =
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "run";
      readonly policyIds: readonly string[];
      readonly seeds: number;
      readonly days: number;
      readonly outDir: string;
      readonly factors: Readonly<Record<string, number>>;
      readonly ledger: LedgerMode;
    };

export function seedsFromCount(count: number): readonly number[] {
  const seeds: number[] = [];
  for (let seed = 1; seed <= count; seed += 1) {
    seeds.push(seed);
  }
  return seeds;
}

export function parseLabArgs(
  argv: readonly string[],
  defaults?: { readonly outDir?: string },
): LabArgs {
  const policyIds: string[] = [];
  let seeds: number | undefined;
  let ci = false;
  let days = DEFAULT_MAX_DAYS;
  let outDir = defaults?.outDir ?? "reports";
  let factors: Readonly<Record<string, number>> = {};
  let ledger: LedgerMode = "off";
  let index = 0;
  while (index < argv.length) {
    const arg = argv[index];
    if (arg === undefined) {
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { kind: "help" };
    }
    if (arg === "--ci") {
      ci = true;
      index += 1;
      continue;
    }
    if (arg === "--policy") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-") || value.trim() === "") {
        return { kind: "error", message: "--policy needs a player-type id." };
      }
      policyIds.push(value);
      index += 2;
      continue;
    }
    if (arg === "--ledger") {
      const value = argv[index + 1];
      if (value !== "check" && value !== "write") {
        return { kind: "error", message: "--ledger needs check or write." };
      }
      ledger = value;
      index += 2;
      continue;
    }
    if (arg === "--factors") {
      const parsed = parseFactors(argv[index + 1]);
      if (parsed === undefined) {
        return {
          kind: "error",
          message: "--factors needs id=number pairs, split by commas.",
        };
      }
      // A second --factors adds to the first.
      factors = { ...factors, ...parsed };
      index += 2;
      continue;
    }
    if (arg === "--seeds" || arg === "--days" || arg === "--out") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-") || value.trim() === "") {
        return { kind: "error", message: `${arg} needs a value.` };
      }
      if (arg === "--out") {
        outDir = value;
      } else {
        const parsed = positiveInt(value);
        if (parsed === undefined) {
          return {
            kind: "error",
            message: `${arg} must be a whole number, 1 or more.`,
          };
        }
        if (arg === "--seeds") {
          seeds = parsed;
        } else {
          days = parsed;
        }
      }
      index += 2;
      continue;
    }
    return { kind: "error", message: `Unknown argument ${arg}.` };
  }
  const run = {
    kind: "run",
    policyIds,
    seeds: seeds ?? (ci ? CI_SEEDS : LOCAL_SEEDS),
    days,
    outDir,
    factors,
    ledger,
  } as const;
  if (ledger !== "off" && !gateRun(run)) {
    return {
      kind: "error",
      message:
        "--ledger reads the gate's run only: --ci, every player type, no factors and the default days.",
    };
  }
  return run;
}

/** The run the gate's lab step plays: the only one the committed ledger records. */
function gateRun(args: Extract<LabArgs, { kind: "run" }>): boolean {
  return (
    args.seeds === CI_SEEDS &&
    args.policyIds.length === 0 &&
    Object.keys(args.factors).length === 0 &&
    args.days === DEFAULT_MAX_DAYS
  );
}

/**
 * The gate's verdict on a fresh ledger against the committed one: 0 when they
 * match; 1 with the moved rows and how to write it again when they differ.
 */
export function ledgerVerdict(
  committed: string | undefined,
  fresh: string,
): { readonly code: 0 | 1; readonly lines: readonly string[] } {
  const again =
    "If the move is meant, write it again with npm run lab:ledger, commit it, and say why in the PR.";
  if (committed === undefined) {
    return {
      code: 1,
      lines: [`No pacing ledger at ${LEDGER_PATH}.`, again],
    };
  }
  if (committed === fresh) {
    return { code: 0, lines: [`The pace matches ${LEDGER_PATH}.`] };
  }
  const diff = ledgerDiff(committed, fresh);
  if (diff.length === 0) {
    return {
      code: 1,
      lines: [
        `${LEDGER_PATH} holds this run's lines, but not as the lab writes them (order or blank lines).`,
        again,
      ],
    };
  }
  return {
    code: 1,
    lines: [
      `The pace moved: this run's ledger differs from ${LEDGER_PATH}.`,
      ...diff,
      again,
    ],
  };
}

export async function executeLab(
  args: Extract<LabArgs, { kind: "run" }>,
  dirs?: { readonly policies: string; readonly measures: string },
): Promise<{
  readonly markdown: string;
  readonly elapsedMs: number;
  readonly checks: readonly GuardrailCheck[];
  readonly ledger: string;
}> {
  const root = repoRoot();
  const policiesDir = dirs?.policies ?? path.join(root, "src/lab/policies");
  const measuresDir = dirs?.measures ?? path.join(root, "src/lab/measures");
  const loaded = await discover(policiesDir, parsePolicyExport);
  const policies =
    args.policyIds.length === 0
      ? loaded
      : loaded.filter((policy) => args.policyIds.includes(policy.id));
  const missing = args.policyIds.filter(
    (id) => !loaded.some((policy) => policy.id === id),
  );
  if (missing.length > 0) {
    throw new Error(`Unknown policy "${missing.join(", ")}".`);
  }
  const measures = await discover(measuresDir, parseMeasureExport, {
    targets: TARGETS,
  });
  const started = performance.now();
  // The run and the report read the factors (#534); the checks read none.
  const { result, markdown, json, ledger } = withFactors(args.factors, () => {
    const played = runTournament({
      policies,
      measures,
      targets: TARGETS,
      seeds: seedsFromCount(args.seeds),
      days: args.days,
    });
    return {
      result: played,
      markdown: withFactorLine(renderReport(played), args.factors),
      json: reportJson(played),
      ledger: renderLedger(played.ledger),
    };
  });
  const elapsedMs = performance.now() - started;
  const checks = guardrailChecks(TARGETS, result.rows);
  const outDir = path.resolve(args.outDir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "strategy-lab.md"), markdown);
  writeFileSync(
    path.join(outDir, "strategy-lab.json"),
    `${JSON.stringify(json, null, 2)}\n`,
  );
  writeFileSync(path.join(outDir, "pacing-ledger.md"), ledger);
  return { markdown, elapsedMs, checks, ledger };
}

/** Checks or writes the committed ledger. 0 unless a check finds the pace moved. */
function settleLedger(mode: LedgerMode, ledger: string): number {
  const file = path.join(repoRoot(), LEDGER_PATH);
  if (mode === "write") {
    writeFileSync(file, ledger);
    console.log(`Wrote ${LEDGER_PATH}.`);
    return 0;
  }
  if (mode === "off") {
    return 0;
  }
  const committed = existsSync(file) ? readFileSync(file, "utf8") : undefined;
  const verdict = ledgerVerdict(committed, ledger);
  const print = verdict.code === 0 ? console.log : console.error;
  for (const line of verdict.lines) {
    print(line);
  }
  return verdict.code;
}

/** Names the factors under the report's title, so a swept report says so. */
function withFactorLine(
  markdown: string,
  factors: Readonly<Record<string, number>>,
): string {
  const pairs = Object.entries(factors).map(
    ([id, value]) => `${id}=${String(value)}`,
  );
  if (pairs.length === 0) {
    return markdown;
  }
  const [title = "", ...rest] = markdown.split("\n");
  return [title, "", `Factors: ${pairs.join(", ")}`, ...rest].join("\n");
}

function positiveInt(text: string): number | undefined {
  if (!/^[1-9]\d*$/.test(text)) {
    return undefined;
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value)) {
    return undefined;
  }
  return value;
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  const href = import.meta.url;
  try {
    return pathToFileURL(realpathSync(entry)).href === href;
  } catch {
    return pathToFileURL(entry).href === href;
  }
}

async function main(): Promise<number> {
  const parsed = parseLabArgs(process.argv.slice(2));
  if (parsed.kind === "help") {
    console.log(HELP);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(parsed.message);
    console.error(HELP);
    return 1;
  }
  try {
    const { elapsedMs, checks, ledger } = await executeLab(parsed);
    const seconds = (elapsedMs / 1000).toFixed(1);
    console.log(
      `Wrote ${path.join(parsed.outDir, "strategy-lab.md")} and ${path.join(parsed.outDir, "strategy-lab.json")} in ${seconds}s.`,
    );
    const status = labStatusCode(checks, process.env, (line) => {
      console.warn(line);
    });
    return Math.max(status, settleLedger(parsed.ledger, ledger));
  } catch (error: unknown) {
    console.error(
      error instanceof Error ? error.message : "strategy lab failed",
    );
    return 1;
  }
}

if (isDirectRun()) {
  void main().then(
    (code) => {
      process.exit(code);
    },
    (error: unknown) => {
      console.error(
        error instanceof Error ? error.message : "strategy lab failed",
      );
      process.exit(1);
    },
  );
}
