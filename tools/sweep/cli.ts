import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseMeasureExport } from "../../src/lab/measure";
import { parsePolicyExport } from "../../src/lab/policy";
import { discover } from "../../src/lab/registry";
import { CASUAL_REFERENCE_ID, DEFAULT_MAX_DAYS } from "../../src/lab/targets";
import { KNOBS } from "./knobs";
import { scorePolicy } from "./play";
import { renderSweep } from "./report";
import {
  DEFAULT_MEASURE_IDS,
  DEFAULT_SAMPLES,
  DEFAULT_SEED,
  DEFAULT_TOP,
  DEFAULT_TRAJECTORIES,
  sweepModel,
  type SweepOutput,
} from "./sweep";

/**
 * Morris screening, then Sobol on the top knobs. Writes reports/sweep.md.
 * Not part of `npm run check`. The tournament runner stays untouched.
 */

const HELP = `Screen economy knobs, then estimate S1 and ST for the top ones.

Usage:
  npm run lab:sweep
  npm run lab:sweep -- --seed 1 --morris 4 --sobol 16 --top 4
  npm run lab:sweep -- --policy casual-2x10 --days 30 --measure finishDay

Default measures: ${DEFAULT_MEASURE_IDS.join(", ")}.
Default policy: ${CASUAL_REFERENCE_ID}. Seed ${String(DEFAULT_SEED)}. Morris ${String(DEFAULT_TRAJECTORIES)} trajectories. Sobol N=${String(DEFAULT_SAMPLES)}. Top ${String(DEFAULT_TOP)}. Days ${String(DEFAULT_MAX_DAYS)}.
One player type. The report is reports/sweep.md. This command is not part of npm run check.`;

export type SweepArgs =
  | { readonly kind: "help" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "run";
      readonly policyId: string;
      readonly measureIds: readonly string[];
      readonly seed: number;
      readonly trajectories: number;
      readonly samples: number;
      readonly top: number;
      readonly days: number;
      readonly outDir: string;
    };

export function parseSweepArgs(
  argv: readonly string[],
  defaults?: { readonly outDir?: string },
): SweepArgs {
  let policyId = CASUAL_REFERENCE_ID;
  let sawPolicy = false;
  const measureIds: string[] = [];
  let seed = DEFAULT_SEED;
  let trajectories = DEFAULT_TRAJECTORIES;
  let samples = DEFAULT_SAMPLES;
  let top = DEFAULT_TOP;
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
      const value = readValue(argv, index, arg);
      if (typeof value !== "string") {
        return value;
      }
      if (sawPolicy) {
        return { kind: "error", message: "--policy takes one player type." };
      }
      sawPolicy = true;
      policyId = value;
      index += 2;
      continue;
    }
    if (arg === "--measure") {
      const value = readValue(argv, index, arg);
      if (typeof value !== "string") {
        return value;
      }
      measureIds.push(value);
      index += 2;
      continue;
    }
    if (arg === "--out") {
      const value = readValue(argv, index, arg);
      if (typeof value !== "string") {
        return value;
      }
      outDir = value;
      index += 2;
      continue;
    }
    if (
      arg === "--seed" ||
      arg === "--morris" ||
      arg === "--sobol" ||
      arg === "--top" ||
      arg === "--days"
    ) {
      const value = readValue(argv, index, arg);
      if (typeof value !== "string") {
        return value;
      }
      const parsed =
        arg === "--seed" ? wholeNumber(value, true) : wholeNumber(value, false);
      if (parsed === undefined) {
        return {
          kind: "error",
          message:
            arg === "--seed"
              ? "--seed must be a whole number, 0 or more."
              : `${arg} must be a whole number, 1 or more.`,
        };
      }
      if (arg === "--seed") {
        seed = parsed;
      } else if (arg === "--morris") {
        trajectories = parsed;
      } else if (arg === "--sobol") {
        samples = parsed;
      } else if (arg === "--top") {
        top = parsed;
      } else {
        days = parsed;
      }
      index += 2;
      continue;
    }
    return { kind: "error", message: `Unknown argument ${arg}.` };
  }
  return {
    kind: "run",
    policyId,
    measureIds: measureIds.length === 0 ? DEFAULT_MEASURE_IDS : measureIds,
    seed,
    trajectories,
    samples,
    top,
    days,
    outDir,
  };
}

export async function executeSweep(
  args: Extract<SweepArgs, { kind: "run" }>,
  dirs?: { readonly policies: string; readonly measures: string },
): Promise<{ readonly markdown: string; readonly elapsedMs: number }> {
  const root = repoRoot();
  const policiesDir = dirs?.policies ?? path.join(root, "src/lab/policies");
  const measuresDir = dirs?.measures ?? path.join(root, "src/lab/measures");
  const policies = await discover(policiesDir, parsePolicyExport);
  const policy = policies.find((candidate) => candidate.id === args.policyId);
  if (policy === undefined) {
    throw new Error(`Unknown policy "${args.policyId}".`);
  }
  const loaded = await discover(measuresDir, parseMeasureExport);
  const missing = args.measureIds.filter(
    (id) => !loaded.some((measure) => measure.id === id),
  );
  if (missing.length > 0) {
    throw new Error(`Unknown measure "${missing.join(", ")}".`);
  }
  const measures = args.measureIds.map((id) => {
    const measure = loaded.find((candidate) => candidate.id === id);
    if (measure === undefined) {
      throw new Error(`Unknown measure "${id}".`);
    }
    return measure;
  });
  const outputs: SweepOutput[] = measures.map((measure) => ({
    id: measure.id,
    label: measure.label,
    unit: measure.unit,
  }));
  const started = performance.now();
  const result = sweepModel({
    knobs: KNOBS,
    outputs,
    seed: args.seed,
    trajectories: args.trajectories,
    samples: args.samples,
    top: args.top,
    evaluate: (multipliers) =>
      scorePolicy({
        policy,
        measures,
        seed: args.seed,
        days: args.days,
        multipliers,
      }),
  });
  const elapsedMs = performance.now() - started;
  const markdown = renderSweep({
    policyId: policy.id,
    days: args.days,
    knobs: KNOBS,
    result,
  });
  const outDir = path.resolve(args.outDir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "sweep.md"), markdown);
  return { markdown, elapsedMs };
}

function readValue(
  argv: readonly string[],
  index: number,
  flag: string,
): string | { readonly kind: "error"; readonly message: string } {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith("-") || value.trim() === "") {
    return { kind: "error", message: `${flag} needs a value.` };
  }
  return value;
}

function wholeNumber(text: string, allowZero: boolean): number | undefined {
  const pattern = allowZero ? /^(?:0|[1-9]\d*)$/ : /^[1-9]\d*$/;
  if (!pattern.test(text)) {
    return undefined;
  }
  const value = Number(text);
  if (!Number.isSafeInteger(value)) {
    return undefined;
  }
  return value;
}

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (entry === undefined) {
    return false;
  }
  try {
    return pathToFileURL(realpathSync(entry)).href === import.meta.url;
  } catch {
    return pathToFileURL(entry).href === import.meta.url;
  }
}

async function main(): Promise<number> {
  const parsed = parseSweepArgs(process.argv.slice(2));
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
    const { elapsedMs } = await executeSweep(parsed);
    const seconds = (elapsedMs / 1000).toFixed(1);
    console.log(
      `Wrote ${path.join(parsed.outDir, "sweep.md")} in ${seconds}s.`,
    );
    return 0;
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : "sweep failed");
    return 1;
  }
}

if (isDirectRun()) {
  void main().then(
    (code) => {
      process.exit(code);
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : "sweep failed");
      process.exit(1);
    },
  );
}
