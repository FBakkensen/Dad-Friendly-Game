import type { PolicyRow } from "./tournament";
import type { Target } from "./targets";

/**
 * One check per target. The test and `npm run lab` both call this, so a new
 * entry in `targets.ts` is a new guardrail with no other edit.
 */
export type GuardrailCheck = {
  readonly targetId: string;
  readonly measure: string;
  readonly pass: boolean;
  readonly detail: string;
  /** Printed, and left out of the strict exit. M9-7 turns these strict. */
  readonly reportOnly?: boolean;
};

/** One line per target. A target that covers no row in this run holds. */
export function guardrailChecks(
  targets: readonly Target[],
  rows: readonly PolicyRow[],
): readonly GuardrailCheck[] {
  return targets.map((target) => checkOne(target, rows));
}

/**
 * `0` always, unless `strict` and something missed. Misses are warnings
 * either way, so a report-only run can print them and stay green.
 */
export function guardrailExit(
  checks: readonly GuardrailCheck[],
  strict: boolean,
  warn: (line: string) => void,
): number {
  let missed = 0;
  for (const check of checks) {
    if (check.pass) {
      continue;
    }
    if (check.reportOnly !== true) {
      missed += 1;
    }
    warn(check.detail);
  }
  if (strict && missed > 0) {
    return 1;
  }
  return 0;
}

/** `LAB_STRICT=1` turns a miss into a failing exit. Otherwise the miss is a warning. */
export function labStatusCode(
  checks: readonly GuardrailCheck[],
  env: { readonly LAB_STRICT?: string },
  warn: (line: string) => void,
): number {
  return guardrailExit(checks, env.LAB_STRICT === "1", warn);
}

function checkOne(target: Target, rows: readonly PolicyRow[]): GuardrailCheck {
  const hits: { readonly label: string; readonly pass: boolean }[] = [];
  for (const row of rows) {
    for (const cell of row.cells) {
      for (const judgement of cell.judgements) {
        if (judgement.targetId !== target.id) {
          continue;
        }
        hits.push({ label: row.label, pass: judgement.pass });
      }
    }
  }
  if (hits.length === 0) {
    return {
      targetId: target.id,
      measure: target.measure,
      pass: true,
      detail: `${target.id} covers no row in this run.`,
    };
  }
  const missed = hits.filter((hit) => !hit.pass);
  if (missed.length === 0) {
    return {
      targetId: target.id,
      measure: target.measure,
      pass: true,
      reportOnly: target.reportOnly === true,
      detail: `${target.id} holds.`,
    };
  }
  const who = missed.map((hit) => hit.label).join(", ");
  return {
    targetId: target.id,
    measure: target.measure,
    pass: false,
    reportOnly: target.reportOnly === true,
    detail: `${target.id} misses for ${who}.`,
  };
}
