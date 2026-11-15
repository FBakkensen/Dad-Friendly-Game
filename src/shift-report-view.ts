import { ROOF, buildingById, type Building } from "./city";
import { formatCompact } from "./format";
import { STEP_NAMES } from "./frame-view";
import type { AwayReport, NightReport } from "./mountain";
import { GOOD_IDS, type GoodId, type Stock } from "./stock";

/**
 * The shift report after unattended time in a fresh mine (#663; spec, "The
 * cards", rule 4, rule 7.12, call 48): how long he was away and the night
 * shift output, a bar of how much of the night the mine produced, what came
 * in, what transport delivered, and the steps built in. The prototype's
 * lines (`proto.src.html`, `away`). It says what happened, never why the
 * mine stood or what to buy. Pure: it reads the report and writes nothing.
 */

/** The bar: the share of the night the mine produced, and its two labels. */
export type ShiftBar = {
  /** 0..1 of the night; never under 0.03, so the bar keeps a sliver. */
  readonly produced: number;
  /** "production 8 h", or "production, no downtime". */
  readonly left: string;
  /** "idle 1 h", or "" when it produced all night. */
  readonly right: string;
};

export type ShiftReport = {
  readonly title: "Shift report";
  /** "Unattended 9 h. Night shift output: 30%." */
  readonly head: string;
  readonly bar: ShiftBar;
  readonly lines: readonly string[];
  readonly key: "Resume";
};

/** A fresh night's away report: the only one with a shift report. */
export type NightAwayReport = AwayReport & { readonly night: NightReport };

/** A good as the report says it: "stone". */
const GOOD_WORDS: Readonly<Record<GoodId, string>> = {
  stones: "stone",
  clay: "clay",
  iron: "iron",
  crystal: "crystal",
  heartstone: "heartstone",
};

/** The prototype's `dur`: "45 s" under 90 s, "12 min" under 90 min, then "9 h" or "1 h 30 min". */
function duration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 90) {
    return `${String(seconds)} s`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) {
    return `${String(minutes)} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours)} h${rest === 0 ? "" : ` ${String(rest)} min`}`;
}

/** A share as the cards say it: "30%". */
export const percent = (share: number): string =>
  `${String(Math.round(share * 100))}%`;

/** The building whose roof went on and lit the night, if one did. */
function litBy(night: NightReport): Building | undefined {
  const roof = night.steps.find((step) => step.step === ROOF);
  return roof !== undefined && night.payTo !== night.payFrom
    ? buildingById(roof.building)
    : undefined;
}

function head(report: NightAwayReport): string {
  const night = report.night;
  const away = `Unattended ${duration(report.awayMs)}.`;
  const lit = litBy(night);
  if (lit === undefined) {
    return `${away} Night shift output: ${percent(night.payFrom)}.`;
  }
  const roof = lit.name.replace(/^The /, "the ");
  return `${away} Night shift output ${percent(night.payFrom)}, and ${percent(night.payTo)} from ${roof}'s roof.`;
}

/** The prototype's bar: "early" is under 98.5% of the night. */
function bar(report: NightAwayReport): ShiftBar {
  const awayMs = Math.max(1, report.awayMs);
  const producedMs = report.night.producedMs;
  const produced = Math.max(3, Math.round((100 * producedMs) / awayMs)) / 100;
  return producedMs < awayMs * 0.985
    ? {
        produced,
        left: `production ${duration(producedMs)}`,
        right: `idle ${duration(awayMs - producedMs)}`,
      }
    : { produced, left: "production, no downtime", right: "" };
}

/** "9,720 stone", each good with at least one, joined. */
function goodsList(goods: Partial<Stock>): readonly string[] {
  return GOOD_IDS.filter((good) => (goods[good] ?? 0) >= 1).map(
    (good) => `${formatCompact(goods[good] ?? 0)} ${GOOD_WORDS[good]}`,
  );
}

/** A line for each step built in; the roof's says the building is operational. */
function stepLines(night: NightReport): readonly string[] {
  return night.steps.map(({ building, step }) => {
    const name = buildingById(building).name;
    if (step !== ROOF) {
      return `${name}: ${STEP_NAMES[step].toLowerCase()} complete.`;
    }
    return night.payTo === night.payFrom
      ? `${name}: operational.`
      : `${name}: operational. Night shift output ${percent(night.payTo)}, up from ${percent(night.payFrom)}.`;
  });
}

function lines(report: NightAwayReport): readonly string[] {
  const night = report.night;
  const produced = goodsList({ stones: report.mined });
  const delivered = goodsList(night.delivered);
  return [
    produced.length > 0 ? `Produced: ${produced.join(", ")}.` : "No output.",
    ...(delivered.length > 0
      ? [`Transport delivered to orders: ${delivered.join(", ")}.`]
      : []),
    ...stepLines(night),
    ...(night.stop === "clock"
      ? ["A night shift runs 8 h. Production stopped after that."]
      : []),
  ];
}

/** The shift report of a fresh night. */
export function shiftReport(report: NightAwayReport): ShiftReport {
  return {
    title: "Shift report",
    head: head(report),
    bar: bar(report),
    lines: lines(report),
    key: "Resume",
  };
}
