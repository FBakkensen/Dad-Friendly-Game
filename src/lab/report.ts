import type { MeasureValue, ScoreMethod } from "./measure";
import {
  CASUAL_REFERENCE_ID,
  OPTIMIZER_REFERENCE_ID,
  REPORT_DEAD_HOURS,
  REPORT_FRACTION_DIGITS,
} from "./targets";
import type {
  Cell,
  DeadStretchNote,
  Judgement,
  PolicyRow,
  TimelineRow,
  TournamentResult,
} from "./tournament";

const PASS_OPEN = '<span style="color:#0b7a32">';
const FAIL_OPEN = '<span style="color:#b42318">';
const CLOSE = "</span>";
const SUGGESTION =
  "Suggestion only: nothing here is written back into the game.";

/** A number, a list, or a word when the run did not produce a finite figure. */
export function formatMeasure(value: MeasureValue, unit: string): string {
  if (typeof value !== "number") {
    return value.length === 0 ? "none" : value.join(", ");
  }
  if (Number.isNaN(value)) {
    return "n/a";
  }
  if (!Number.isFinite(value)) {
    if (unit === "days") {
      return "unfinished";
    }
    return value < 0 ? "-∞" : "∞";
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(REPORT_FRACTION_DIGITS);
}

type Miss = {
  readonly row: PolicyRow;
  readonly cell: Cell;
  readonly judgement: Judgement;
};

/** What missed, grouped by guardrail. A clean run says the guardrails hold. */
export function labSuggestions(result: TournamentResult): readonly string[] {
  const notes: string[] = [];
  const misses = new Map<string, Miss[]>();
  for (const row of result.rows) {
    for (const cell of row.cells) {
      for (const judgement of cell.judgements) {
        if (judgement.pass) {
          continue;
        }
        const group = misses.get(judgement.targetId) ?? [];
        group.push({ row, cell, judgement });
        misses.set(judgement.targetId, group);
      }
    }
  }
  for (const group of misses.values()) {
    notes.push(missText(group));
  }
  for (const column of result.columns) {
    const named = result.rows.filter((row) => {
      const cell = row.cells.find((item) => item.measureId === column.id);
      return (
        cell !== undefined && Array.isArray(cell.value) && cell.value.length > 0
      );
    });
    const sample = named[0]?.cells.find((item) => item.measureId === column.id);
    if (sample === undefined) {
      continue;
    }
    notes.push(listText(column.label, sample.why, named.length));
  }
  for (const stretch of result.deadStretches) {
    notes.push(stretchText(stretch));
  }
  if (notes.length === 0) {
    return [`Every guardrail in this run holds. ${SUGGESTION}`];
  }
  return notes;
}

/** Markdown a person can read. Numbers come from the result; the shape does not. */
export function renderReport(result: TournamentResult): string {
  const lines = [
    "# Strategy lab",
    "",
    "One row per player type, one column per measure. Pass and fail read the guardrails in `src/lab/targets.ts`. Shares are fractions.",
    "",
    finishLine(result),
    "",
    table(result),
    "",
    legend(result),
    "",
    ...timelineSection(result),
    ...listSection(result),
    ...stretchSection(result),
    ...suggestionSection(result),
  ];
  return `${lines.join("\n").trim()}\n`;
}

/** The same report as data. Non-finite numbers are `"Infinity"` or null. */
export function reportJson(result: TournamentResult): unknown {
  return {
    seeds: result.seeds,
    days: result.days,
    optimizerReferenceId: OPTIMIZER_REFERENCE_ID,
    casualReferenceId: CASUAL_REFERENCE_ID,
    optimizerFinishDay: jsonNumber(result.optimizerFinishDay),
    casualFinishDay: jsonNumber(result.casualFinishDay),
    columns: result.columns,
    rows: result.rows.map((row) => ({
      id: row.id,
      label: row.label,
      kind: row.kind,
      finishDay: jsonNumber(row.finishDay),
      cells: Object.fromEntries(
        row.cells.map((cell) => [
          cell.measureId,
          {
            value: jsonMeasure(cell.value),
            pass: passOf(cell),
            targets: cell.judgements.map((judgement) => judgement.targetId),
          },
        ]),
      ),
    })),
    timelines: result.timelines,
    deadStretches: result.deadStretches.map((stretch) => ({
      ...stretch,
      nextPaybackRatio: jsonNumber(stretch.nextPaybackRatio),
    })),
    suggestions: labSuggestions(result),
  };
}

function finishLine(result: TournamentResult): string {
  const seeds =
    result.seeds.length === 0
      ? "none"
      : result.seeds.map((seed) => String(seed)).join(", ");
  return [
    `Seeds: ${seeds}.`,
    `Days played: ${String(result.days)}.`,
    `Optimizer finish day (${OPTIMIZER_REFERENCE_ID}): ${namedDay(result.optimizerFinishDay)}.`,
    `Casual finish day (${CASUAL_REFERENCE_ID}): ${namedDay(result.casualFinishDay)}.`,
    "Regret reads the optimizer finish day. Extreme win reads the casual finish day.",
  ].join(" ");
}

function namedDay(day: number | undefined): string {
  if (day === undefined) {
    return "not in this run";
  }
  return formatMeasure(day, "days");
}

function table(result: TournamentResult): string {
  const headers = [
    "Policy",
    "Kind",
    ...result.columns.map((column) => column.label),
  ];
  const rule = headers.map(() => "---");
  const body = result.rows.map((row) =>
    [
      row.label,
      row.kind,
      ...result.columns.map((column) => {
        const cell = row.cells.find((item) => item.measureId === column.id);
        return cell === undefined ? "" : cellText(cell);
      }),
    ]
      .map(tableCell)
      .join(" | "),
  );
  return [
    `| ${headers.join(" | ")} |`,
    `| ${rule.join(" | ")} |`,
    ...body.map((line) => `| ${line} |`),
  ].join("\n");
}

function cellText(cell: Cell): string {
  if (cell.judgements.length === 0) {
    return formatMeasure(cell.value, cell.unit);
  }
  const first = cell.judgements[0];
  if (first === undefined) {
    return formatMeasure(cell.value, cell.unit);
  }
  if (cell.judgements.length > 1) {
    return cell.judgements
      .map((judgement) =>
        coloured(
          `${judgement.targetId} ${formatMeasure(judgement.value, cell.unit)} ${word(judgement.pass)}`,
          judgement.pass,
        ),
      )
      .join(", ");
  }
  return coloured(
    `${formatMeasure(first.value, cell.unit)} ${word(first.pass)}`,
    first.pass,
  );
}

function word(pass: boolean): string {
  return pass ? "pass" : "fail";
}

function coloured(text: string, pass: boolean): string {
  return `${pass ? PASS_OPEN : FAIL_OPEN}${text}${CLOSE}`;
}

function tableCell(text: string): string {
  return text.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function legend(result: TournamentResult): string {
  const lines = [
    "## Measures",
    "",
    "| Measure | Unit | Question |",
    "| --- | --- | --- |",
  ];
  for (const column of result.columns) {
    lines.push(
      `| ${tableCell(column.label)} | ${tableCell(column.unit)} | ${tableCell(column.why)} |`,
    );
  }
  return lines.join("\n");
}

function timelineSection(result: TournamentResult): readonly string[] {
  const intro = [
    "## Timelines",
    "",
    "Per hour of the first seed, for each casual player type and the optimizer. The table above is every seed.",
    "",
  ];
  if (result.timelines.length === 0) {
    return [...intro, "No casual or optimizer samples on the first seed.", ""];
  }
  const lines = [...intro];
  let current = "";
  for (const row of result.timelines) {
    if (row.policyId !== current) {
      if (current !== "") {
        lines.push("");
      }
      current = row.policyId;
      lines.push(`### ${row.label}`, "", timelineHeader(row.seed));
    }
    lines.push(timelineLine(row));
  }
  lines.push("");
  return lines;
}

function timelineHeader(seed: number): string {
  return [
    `Seed ${String(seed)}.`,
    "",
    "| Hour | Day | Live options | Best move | Crew/s | Pocket |",
    "| --- | --- | --- | --- | --- | --- |",
  ].join("\n");
}

function timelineLine(row: TimelineRow): string {
  return `| ${[
    String(row.hour),
    formatMeasure(row.day, "days"),
    formatMeasure(row.live, "options"),
    tableCell(row.bestId === "" ? "none" : row.bestId),
    formatMeasure(row.crewPerSec, "stones"),
    formatMeasure(row.pocket, "stones"),
  ].join(" | ")} |`;
}

function listSection(result: TournamentResult): readonly string[] {
  const columns = result.columns.filter((column) =>
    result.rows.some((row) => {
      const cell = row.cells.find((item) => item.measureId === column.id);
      return cell !== undefined && typeof cell.value !== "number";
    }),
  );
  if (columns.length === 0) {
    return [];
  }
  const lines: string[] = [];
  for (const column of columns) {
    lines.push(`## ${column.label}`, "", column.why, "");
    lines.push("| Policy | Kinds |", "| --- | --- |");
    for (const row of result.rows) {
      const cell = row.cells.find((item) => item.measureId === column.id);
      const shown =
        cell === undefined ? "" : formatMeasure(cell.value, cell.unit);
      lines.push(`| ${tableCell(row.label)} | ${tableCell(shown)} |`);
    }
    lines.push("");
  }
  return lines;
}

function stretchSection(result: TournamentResult): readonly string[] {
  const hours = formatMeasure(REPORT_DEAD_HOURS, "hours");
  const intro = [
    "## Dead stretches",
    "",
    `Waits longer than ${hours} hours on the spends this dad weighs. Every live option on that table needs at least one session of saving. Payback is the official clock. Value per stone sits beside it.`,
    "",
  ];
  if (result.deadStretches.length === 0) {
    return [...intro, `No dead stretch longer than ${hours} hours.`, ""];
  }
  const lines = [
    ...intro,
    "| Policy | Seed | Score | Start day | Hours | Saving for | Next payback |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const stretch of result.deadStretches) {
    lines.push(
      `| ${[
        tableCell(stretch.label),
        String(stretch.seed),
        scoreName(stretch.score),
        formatMeasure(stretch.startDay, "days"),
        formatMeasure(stretch.hours, "hours"),
        tableCell(stretch.savingFor === "" ? "none" : stretch.savingFor),
        paybackText(stretch.nextPaybackRatio),
      ].join(" | ")} |`,
    );
  }
  lines.push("");
  return lines;
}

function paybackText(ratio: number): string {
  if (!Number.isFinite(ratio)) {
    return "no second buy";
  }
  return `${formatMeasure(ratio, "ratio")}×`;
}

function suggestionSection(result: TournamentResult): readonly string[] {
  const lines = [
    "## Suggestions",
    "",
    "The lab names what missed. It does not change a number in the game.",
    "",
  ];
  for (const note of labSuggestions(result)) {
    lines.push(`- ${note}`);
  }
  lines.push("");
  return lines;
}

function missText(group: readonly Miss[]): string {
  const first = group[0];
  if (first === undefined) {
    return SUGGESTION;
  }
  const who = group.map((item) => item.row.label).join(", ");
  const values = group.map((item) => item.judgement.value);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const shown =
    low === high
      ? formatMeasure(low, first.cell.unit)
      : `${formatMeasure(low, first.cell.unit)}–${formatMeasure(high, first.cell.unit)}`;
  return [
    `${first.judgement.targetId} misses for ${who}.`,
    `${first.cell.label} is ${shown} ${first.cell.unit}; the bound is ${boundText(first.judgement, first.cell.unit)}.`,
    first.judgement.why,
    SUGGESTION,
  ].join(" ");
}

function boundText(judgement: Judgement, unit: string): string {
  if (judgement.op === "between") {
    const [low, high] = judgement.limit;
    return `${formatMeasure(low, unit)} to ${formatMeasure(high, unit)}`;
  }
  const word = judgement.op === "lte" ? "at most" : "at least";
  return `${word} ${formatMeasure(judgement.limit, unit)}`;
}

function listText(label: string, why: string, players: number): string {
  const noun = players === 1 ? "player type" : "player types";
  return `${label} names unused kinds for ${String(players)} ${noun}. ${why} ${SUGGESTION}`;
}

function scoreName(score: ScoreMethod): string {
  return score === "value" ? "value per stone" : "payback";
}

function stretchText(stretch: DeadStretchNote): string {
  const saving = stretch.savingFor === "" ? "nothing named" : stretch.savingFor;
  const ratio = Number.isFinite(stretch.nextPaybackRatio)
    ? `${formatMeasure(stretch.nextPaybackRatio, "ratio")} times the best`
    : "no second buy on the table";
  return [
    `${stretch.label}, seed ${String(stretch.seed)}, ${scoreName(stretch.score)} waits from day ${formatMeasure(stretch.startDay, "days")}, saving for ${saving}, for ${formatMeasure(stretch.hours, "hours")} hours.`,
    `The next payback is ${ratio}.`,
    SUGGESTION,
  ].join(" ");
}

function passOf(cell: Cell): boolean | null {
  if (cell.judgements.length === 0) {
    return null;
  }
  return cell.judgements.every((judgement) => judgement.pass);
}

function jsonNumber(
  value: number | undefined,
): number | "Infinity" | "-Infinity" | null {
  if (value === undefined || Number.isNaN(value)) {
    return null;
  }
  if (!Number.isFinite(value)) {
    return value < 0 ? "-Infinity" : "Infinity";
  }
  return value;
}

function jsonMeasure(
  value: MeasureValue,
): number | string | readonly string[] | null {
  if (typeof value !== "number") {
    return value;
  }
  return jsonNumber(value);
}
