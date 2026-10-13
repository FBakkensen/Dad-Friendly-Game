import type { Knob } from "./knobs";
import type { SweepResult } from "./sweep";

/** Markdown for `reports/sweep.md`. One Sobol table per measure. */
export function renderSweep(input: {
  readonly policyId: string;
  readonly days: number;
  readonly knobs: readonly Knob[];
  readonly result: SweepResult;
}): string {
  const { result } = input;
  const lines: string[] = [
    "# Sensitivity sweep",
    "",
    `Policy \`${input.policyId}\`, ${count(input.days, "day", "days")}, one run on seed ${String(result.seed)}.`,
    `Morris: ${count(result.trajectories, "trajectory", "trajectories")} on ${String(result.levels)} levels (${count(result.morrisEvaluations, "run", "runs")}).`,
    `Sobol: N=${String(result.samples)} on ${count(result.kept.length, "knob", "knobs")} (${count(result.sobolEvaluations, "run", "runs")}), Saltelli design, scrambled Sobol sequence.`,
    "",
    "Multipliers. 1 is today's economy. S1 is the first-order index. ST is the total index.",
    "A flat measure shows zeros. A run that did not finish a number shows n/a.",
    "",
    "## Knobs",
    "",
    "| Knob | Factor | Low | High |",
    "| --- | --- | --- | --- |",
  ];
  for (const knob of input.knobs) {
    lines.push(
      `| ${knob.label} | ${knob.factor} | ${knob.low.toFixed(2)} | ${knob.high.toFixed(2)} |`,
    );
  }
  lines.push(
    "",
    "## Morris screening",
    "",
    "Ranked by score: μ* on each measure, divided by that measure's largest μ*, then summed.",
    "",
  );
  const header = ["Rank", "Knob", "Score"];
  for (const output of result.outputs) {
    header.push(`μ* ${output.label}`, "σ");
  }
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`| ${header.map(() => "---").join(" | ")} |`);
  result.morris.forEach((row, index) => {
    const cells = [String(index + 1), row.label, formatCell(row.score)];
    for (let output = 0; output < result.outputs.length; output += 1) {
      cells.push(formatCell(row.muStar[output] ?? Number.NaN));
      cells.push(formatCell(row.sigma[output] ?? Number.NaN));
    }
    lines.push(`| ${cells.join(" | ")} |`);
  });
  result.outputs.forEach((output, index) => {
    lines.push(
      "",
      `## Sobol — ${output.label} (${output.unit})`,
      "",
      "| Knob | S1 | ST |",
      "| --- | --- | --- |",
    );
    for (const row of result.sobol) {
      lines.push(
        `| ${row.label} | ${formatCell(row.s1[index] ?? Number.NaN)} | ${formatCell(row.st[index] ?? Number.NaN)} |`,
      );
    }
  });
  lines.push("");
  return lines.join("\n");
}

function count(value: number, one: string, many: string): string {
  return `${String(value)} ${value === 1 ? one : many}`;
}

function formatCell(value: number): string {
  if (value === Number.POSITIVE_INFINITY) {
    return "inf";
  }
  if (!Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(3);
}
