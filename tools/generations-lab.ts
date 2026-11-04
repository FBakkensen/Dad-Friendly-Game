/**
 * Kid runs 1-4 for the main player types (M13, #253). Lab-only.
 *   npm run lab:generations -- --ks 1,1.78,2.79,4.05 --seeds 20 [--policy casual-2x10]
 * Prints finish days per run (seed mean), the two report-only targets, and
 * any machine a run never bought. Never fails on a target: they need
 * Flemming's OK before they become strict.
 */
import casual from "../src/lab/policies/casual-2x10";
import checker from "../src/lab/policies/checker-6x3";
import evening from "../src/lab/policies/evening-1x20";
import marathon from "../src/lab/policies/marathon";
import optimizer from "../src/lab/policies/optimizer";
import {
  eachRunLonger,
  noRunPastCap,
  rootModelDays,
  linearModelDays,
  runGenerations,
} from "../src/lab/generations";
import { LEGACY_STEP } from "../src/rates";

const POLICIES = [casual, checker, evening, marathon, optimizer];

function arg(name: string): string | undefined {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? undefined : process.argv[at + 1];
}

const ks = (arg("ks") ?? "1,1,1,1").split(",").map(Number);
const seeds = Number(arg("seeds") ?? "3");
const only = arg("policy");
const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const lines = [
  `ks: ${ks.join(" / ")}, seeds 1-${String(seeds)}`,
  "",
  "| Policy | " +
    ks.map((_, i) => `Run ${String(i + 1)}`).join(" | ") +
    " | Longer each run | No run past 7.5 | Never bought |",
  "|---|" + ks.map(() => "---|").join("") + "---|---|---|",
];
const firstDays: number[] = [];
for (const policy of POLICIES.filter(
  (p) => only === undefined || p.id === only,
)) {
  const perSeed = Array.from({ length: seeds }, (_, i) =>
    runGenerations({ policy, seed: i + 1, ks }),
  );
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
  lines.push(
    `| ${policy.label} | ${days.map((day) => (day === undefined ? "unfinished" : day.toFixed(2))).join(" | ")} | ${eachRunLonger(days) ? "yes" : "no"} | ${noRunPastCap(days) ? "yes" : "no"} | ${[...new Set(unbought)].join(", ") || "none"} |`,
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
