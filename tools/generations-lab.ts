/**
 * Kid runs for the main player types (M13, #253), played with the game's
 * own stretch (src/scale.ts).
 *   npm run lab:generations -- --seeds 20 [--runs 6] [--policy casual-2x10]
 * Prints finish days per run (seed mean), the per-type run-length rule, and
 * any machine a run never bought. With LAB_STRICT=1, a miss on either fails.
 * --ci plays the CI seed count. --runs defaults to KID_RUNS_CI (8): every run must
 * finish later than the one before.
 * Each policy and seed plays in its own process, one per core (LAB_JOBS sets
 * the count). The runs of one seed stay in order: each starts from the last.
 */
import { fork, type ChildProcess } from "node:child_process";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import casual from "../src/lab/policies/casual-2x10";
import checker from "../src/lab/policies/checker-6x3";
import evening from "../src/lab/policies/evening-1x20";
import marathon from "../src/lab/policies/marathon";
import optimizer from "../src/lab/policies/optimizer";
import {
  eachRunLonger,
  rootModelDays,
  linearModelDays,
  runGenerations,
  type GenerationRun,
} from "../src/lab/generations";
import { LEGACY_STEP } from "../src/rates";
import {
  CI_SEEDS,
  KID_RUN_MAX_DAYS,
  KID_RUNS_CI,
  LOCAL_SEEDS,
} from "../src/lab/targets";
import { kidStretch } from "../src/scale";
import { withFactors } from "../src/economy/factors";
import { parseFactors } from "./lab-factors";
import { inOrder } from "./lab-pool";

const POLICIES = [casual, checker, evening, marathon, optimizer];

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

const runCount = Number(arg("runs") ?? String(KID_RUNS_CI));
const seeds = Number(
  arg("seeds") ?? (process.argv.includes("--ci") ? CI_SEEDS : LOCAL_SEEDS),
);
const misses: string[] = [];
const only = arg("policy");
// --factors price.machine=0.8,growth.machine=1.1 holds sweep factors for every run.
const factorsArg = arg("factors");
const parsedFactors = parseFactors(factorsArg);
if (factorsArg !== undefined && parsedFactors === undefined) {
  console.error("--factors needs id=number pairs, split by commas.");
  process.exit(1);
}
const factors = parsedFactors ?? {};

/** Children still playing, so a failed job can stop the rest. */
const children = new Set<ChildProcess>();

/** One seed of one policy, played in a child process. */
function playInChild(
  policyId: string,
  seed: number,
): Promise<readonly GenerationRun[]> {
  return new Promise((resolve, reject) => {
    let runs: readonly GenerationRun[] | undefined;
    const child = fork(
      fileURLToPath(import.meta.url),
      [...process.argv.slice(2), "--job", `${policyId}:${String(seed)}`],
      { serialization: "advanced" },
    );
    children.add(child);
    child.on("message", (message) => {
      runs = message as readonly GenerationRun[];
    });
    child.on("error", reject);
    // "close" comes after the last message is read; "exit" may come first.
    child.on("close", (code, signal) => {
      children.delete(child);
      if (code === 0 && runs !== undefined) {
        resolve(runs);
      } else {
        reject(
          new Error(
            `${policyId} seed ${String(seed)} exited ${String(code ?? signal)}`,
          ),
        );
      }
    });
  });
}

const job = arg("job");
if (job === undefined) {
  await report();
} else {
  const [policyId, seed = ""] = job.split(":");
  const policy = POLICIES.find((p) => p.id === policyId);
  if (policy === undefined) {
    throw new Error(`no policy ${String(policyId)}`);
  }
  const runs = runGenerations({
    policy,
    seed: Number(seed),
    runs: runCount,
    maxDays: KID_RUN_MAX_DAYS,
    factors,
  });
  // Disconnect once the runs are sent, so the parent has them before the exit.
  process.send?.(runs, (error: Error | null) => {
    if (error === null) {
      process.disconnect?.();
    } else {
      process.exitCode = 1;
    }
  });
}

async function report(): Promise<void> {
  const ks = Array.from({ length: runCount }, (_, i) =>
    withFactors(factors, () => kidStretch(i)),
  );
  const mean = (values: readonly number[]) =>
    values.reduce((sum, value) => sum + value, 0) / values.length;

  const lines = [
    `ks: ${ks.map((k) => k.toFixed(2)).join(" / ")}, seeds 1-${String(seeds)}`,
    "",
    "| Policy | " +
      ks.map((_, i) => `Run ${String(i + 1)}`).join(" | ") +
      " | Run-length rule | Never bought |",
    "|---|" + ks.map(() => "---|").join("") + "---|---|",
  ];
  const firstDays: number[] = [];
  const chosen = POLICIES.filter((p) => only === undefined || p.id === only);
  const played = await inOrder(
    chosen.flatMap((policy) =>
      Array.from(
        { length: seeds },
        (_, i) => () => playInChild(policy.id, i + 1),
      ),
    ),
    Number(process.env.LAB_JOBS ?? availableParallelism()),
  ).catch((error: unknown) => {
    // One failed job fails the lab. Stop the others rather than leave them running.
    for (const child of children) child.kill();
    throw error;
  });
  for (const [at, policy] of chosen.entries()) {
    const perSeed = played.slice(at * seeds, (at + 1) * seeds);
    const days = ks.map((_, run) => {
      const finished = perSeed.map((runs) => runs[run]?.finishDay);
      return finished.every((day) => day !== undefined)
        ? mean(finished)
        : undefined;
    });
    if (days[0] !== undefined) firstDays.push(days[0]);
    const unbought = perSeed.flatMap((runs) =>
      runs.flatMap((run) =>
        run.unbought.map((id) => `run ${String(run.run)}: ${id}`),
      ),
    );
    const lengthOk = eachRunLonger(days);
    if (!lengthOk) misses.push(`${policy.label}: run-length rule`);
    if (unbought.length > 0)
      misses.push(
        `${policy.label}: never bought ${[...new Set(unbought)].join(", ")}`,
      );
    lines.push(
      `| ${policy.label} | ${days.map((day) => (day === undefined ? "unfinished" : day.toFixed(2))).join(" | ")} | ${lengthOk ? "pass" : "miss"} | ${[...new Set(unbought)].join(", ") || "none"} |`,
    );
  }
  const first = firstDays.length === 0 ? 0 : mean(firstDays);
  lines.push(
    "",
    `Models from the mean run 1 (${first.toFixed(2)} days): ` +
      ks
        .map((k, i) => {
          const bonus = 1 + LEGACY_STEP * i;
          return `run ${String(i + 1)} linear ${linearModelDays(first, k, bonus).toFixed(2)}, root ${rootModelDays(first, k, bonus).toFixed(2)}`;
        })
        .join("; "),
  );
  console.log(lines.join("\n"));
  for (const miss of misses) console.log(`miss: ${miss}`);
  if (misses.length > 0 && process.env.LAB_STRICT === "1") process.exitCode = 1;
}
