import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
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
import { discover } from "../src/lab/registry";
import { runTournament } from "../src/lab/tournament";
import {
  CI_SEEDS,
  DEFAULT_MAX_DAYS,
  LOCAL_SEEDS,
  TARGETS,
} from "../src/lab/targets";

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

Seeds default to ${String(LOCAL_SEEDS)} (1 through that count). --ci uses ${String(CI_SEEDS)}.
--seeds wins over both. Days default to ${String(DEFAULT_MAX_DAYS)}.
--policy limits the rows. The columns are still every registered measure.
--factors holds sweep factors for every run (line.off=0 plays the line, #534).
A missed guardrail is a warning unless LAB_STRICT=1, which exits 1.
Reports land in reports/strategy-lab.md and reports/strategy-lab.json.`;

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
    if (arg === "--factors") {
      const parsed = parseFactors(argv[index + 1]);
      if (parsed === undefined) {
        return {
          kind: "error",
          message: "--factors needs id=number pairs, split by commas.",
        };
      }
      factors = parsed;
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
  return {
    kind: "run",
    policyIds,
    seeds: seeds ?? (ci ? CI_SEEDS : LOCAL_SEEDS),
    days,
    outDir,
    factors,
  };
}

/** `a=1,b.c=0.8` as a factor map, or undefined when a pair is not id=number. */
function parseFactors(
  text: string | undefined,
): Readonly<Record<string, number>> | undefined {
  if (text === undefined || text.trim() === "") {
    return undefined;
  }
  const factors: Record<string, number> = {};
  for (const pair of text.split(",")) {
    const match = /^([\w.]+)=(-?\d+(?:\.\d+)?)$/.exec(pair.trim());
    if (match?.[1] === undefined || match[2] === undefined) {
      return undefined;
    }
    factors[match[1]] = Number(match[2]);
  }
  return factors;
}

export async function executeLab(
  args: Extract<LabArgs, { kind: "run" }>,
  dirs?: { readonly policies: string; readonly measures: string },
): Promise<{
  readonly markdown: string;
  readonly elapsedMs: number;
  readonly checks: readonly GuardrailCheck[];
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
  // The run, the report and the checks all read the factors (#534).
  const { result, markdown, json } = withFactors(args.factors, () => {
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
  return { markdown, elapsedMs, checks };
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
    const { elapsedMs, checks } = await executeLab(parsed);
    const seconds = (elapsedMs / 1000).toFixed(1);
    console.log(
      `Wrote ${path.join(parsed.outDir, "strategy-lab.md")} and ${path.join(parsed.outDir, "strategy-lab.json")} in ${seconds}s.`,
    );
    return labStatusCode(checks, process.env, (line) => {
      console.warn(line);
    });
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
