import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseMeasureExport } from "../src/lab/measure";
import { parsePolicyExport } from "../src/lab/policy";
import { renderReport, reportJson } from "../src/lab/report";
import { discover } from "../src/lab/registry";
import { runTournament } from "../src/lab/tournament";
import {
  DEFAULT_MAX_DAYS,
  MONTE_CARLO_SEEDS,
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
  npm run lab -- --policy <id> [--policy <id>]
  npm run lab -- --seeds <n> --days <n> --out <dir>

Seeds default to ${String(MONTE_CARLO_SEEDS)} (1 through that count) and days to ${String(DEFAULT_MAX_DAYS)}.
--policy limits the rows. The columns are still every registered measure.
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
  let seeds = MONTE_CARLO_SEEDS;
  let days = DEFAULT_MAX_DAYS;
  let outDir = defaults?.outDir ?? "reports";
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
    if (arg === "--policy") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-") || value.trim() === "") {
        return { kind: "error", message: "--policy needs a player-type id." };
      }
      policyIds.push(value);
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
  return { kind: "run", policyIds, seeds, days, outDir };
}

export async function executeLab(
  args: Extract<LabArgs, { kind: "run" }>,
  dirs?: { readonly policies: string; readonly measures: string },
): Promise<{ readonly markdown: string; readonly elapsedMs: number }> {
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
  const result = runTournament({
    policies,
    measures,
    targets: TARGETS,
    seeds: seedsFromCount(args.seeds),
    days: args.days,
  });
  const elapsedMs = performance.now() - started;
  const markdown = renderReport(result);
  const outDir = path.resolve(args.outDir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "strategy-lab.md"), markdown);
  writeFileSync(
    path.join(outDir, "strategy-lab.json"),
    `${JSON.stringify(reportJson(result), null, 2)}\n`,
  );
  return { markdown, elapsedMs };
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
    const { elapsedMs } = await executeLab(parsed);
    const seconds = (elapsedMs / 1000).toFixed(1);
    console.log(
      `Wrote ${path.join(parsed.outDir, "strategy-lab.md")} and ${path.join(parsed.outDir, "strategy-lab.json")} in ${seconds}s.`,
    );
    return 0;
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
