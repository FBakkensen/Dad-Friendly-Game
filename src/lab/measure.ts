import type { Action } from "../economy/actions";

/**
 * One moment on the table. Official fields use payback. `byValue` is the
 * same moment scored by stones of income per stone of cost, so the earlier
 * diagnosis can be read beside the official numbers.
 */
export type DecisionSample = {
  /** Milliseconds from the start of the run. */
  readonly atMs: number;
  /** Moves whose payback is within `LIVE_RATIO` of the best. */
  readonly liveCount: number;
  /** How many of those live moves the pocket can pay for. */
  readonly affordableLive: number;
  readonly bestId: string;
  readonly bestKind: Action["kind"] | "";
  /** Seconds until the pocket can pay the best payback move. 0 if it can. */
  readonly waitToAffordSec: number;
  /** Crew stones a second, before the whole-stone floor. */
  readonly crewPerSec: number;
  readonly pocket: number;
  /** Share of output by source. Includes `tending` and `tap` when they pay. */
  readonly outputShare: Readonly<Record<string, number>>;
  /** Kinds on the table at this moment. */
  readonly optionKinds: readonly Action["kind"][];
  readonly byValue: {
    readonly liveCount: number;
    readonly affordableLive: number;
    readonly bestId: string;
    readonly waitToAffordSec: number;
    /** Best move's income per second, per stone of cost. */
    readonly perStone: number;
  };
  /** Day the mountain emptied, when the run finished. Same on every sample. */
  readonly finishDay?: number;
  /**
   * The optimizer's finish day, stamped by a tournament when this row is
   * compared. Regret is `finishDay / optimizerFinishDay`.
   */
  readonly optimizerFinishDay?: number;
  /**
   * A casual dad's finish day, stamped when this row is an extreme.
   * The win is how much sooner `finishDay` is.
   */
  readonly casualFinishDay?: number;
};

export type MeasureValue = number | readonly string[];

export type Measure = {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly why: string;
  readonly sample?: (sample: DecisionSample) => number;
  readonly aggregate: (samples: readonly DecisionSample[]) => MeasureValue;
};

/** Every move kind. A new kind has to be added here or the check fails. */
export const MOVE_KINDS = [
  "buyTier",
  "buyUpgrade",
  "buyBoost",
  "promote",
  "station",
  "send",
  "recall",
  "fixTrouble",
] as const satisfies readonly Action["kind"][];

export type ScoreMethod = "payback" | "value";

type MeasureSpec = {
  readonly id: string;
  readonly label: string;
  readonly unit: string;
  readonly why: string;
  readonly sample?: (sample: DecisionSample) => number;
  readonly aggregate: (samples: readonly DecisionSample[]) => MeasureValue;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, file: string, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${file} ${field} must be a non-empty string`);
  }
  if (field === "id" && /\s/.test(value)) {
    throw new Error(`${file} id must be one word`);
  }
  if (field === "why" && (value.includes("\n") || !value.includes(" "))) {
    throw new Error(`${file} why must be one line`);
  }
  return value;
}

/** Checks the shape `defineMeasure` and the loader both require. */
function asMeasure(value: unknown, file: string): Measure {
  if (!isRecord(value)) {
    throw new Error(`${file} default export is not a measure`);
  }
  const id = requiredText(value.id, file, "id");
  const label = requiredText(value.label, file, "label");
  const unit = requiredText(value.unit, file, "unit");
  const why = requiredText(value.why, file, "why");
  if (typeof value.aggregate !== "function") {
    throw new Error(`${file} aggregate must be a function`);
  }
  if (value.sample !== undefined && typeof value.sample !== "function") {
    throw new Error(`${file} sample must be a function`);
  }
  const aggregate = value.aggregate as Measure["aggregate"];
  const measure: Measure = {
    id,
    label,
    unit,
    why,
    aggregate,
    ...(typeof value.sample === "function"
      ? { sample: value.sample as (sample: DecisionSample) => number }
      : {}),
  };
  return measure;
}

/** What a measure file default-exports. */
export function defineMeasure(spec: MeasureSpec): Measure {
  return asMeasure(spec, spec.id);
}

/** Reads a measure module. The loader passes the module namespace. */
export function parseMeasureExport(loaded: unknown, filename: string): Measure {
  if (!isRecord(loaded) || !("default" in loaded)) {
    throw new Error(`${filename} has no default export`);
  }
  return asMeasure(loaded.default, filename);
}

/** One column of results, keyed by measure id. */
export function resultsOf(
  measures: readonly Measure[],
  samples: readonly DecisionSample[],
): ReadonlyMap<string, MeasureValue> {
  return new Map(
    measures.map((measure) => [measure.id, measure.aggregate(samples)]),
  );
}
