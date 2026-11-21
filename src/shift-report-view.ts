import { ROOF, buildingById, type Building } from "./city";
import { formatCompact, shiftDuration } from "./format";
import { BAY_ORDER, GOOD_NAMES, GOOD_WORDS, STEP_NAMES } from "./frame-view";
import type { AwayReport, NightReport } from "./mountain";
import { percent } from "./screen-words";
import { GOOD_IDS, type Stock } from "./stock";

/**
 * The shift report after unattended time in a fresh mine (#663; spec, "The
 * cards", rule 4, rule 7.12, call 48): how long he was away and the night
 * shift output, a bar of how much of the night the mine produced, what came
 * in, what transport delivered, and the steps built in. The prototype's
 * lines (`proto.src.html`, `away`). It says what happened, never why the
 * mine stood or what to buy. Pure: it reads the report and writes nothing.
 */

/** The bar: the share of the night the mine produced, and its two labels. */
type ShiftBar = {
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
  /** "Brick full at 3 h 20 min": each stockpile that filled, and when (#671). */
  readonly marks: readonly string[];
  /** A full stockyard stood the mine: a second key goes to the stockyard (#671). */
  readonly toStockyard: boolean;
  readonly key: "Resume";
};

/** The second key's words, beside Resume, when the stockyard stood the mine. */
export const TO_STOCKYARD = "To the stockyard";

/** The building whose roof went on and lit the night, if one did. */
function litBy(night: NightReport): Building | undefined {
  const roof = night.steps.find((step) => step.step === ROOF);
  return roof !== undefined && night.payTo !== night.payFrom
    ? buildingById(roof.building)
    : undefined;
}

function head(report: AwayReport): string {
  const night = report.night;
  const away = `Unattended ${shiftDuration(report.awayMs)}.`;
  const lit = litBy(night);
  if (lit === undefined) {
    return `${away} Night shift output: ${percent(night.payFrom)}.`;
  }
  const roof = lit.name.replace(/^The /, "the ");
  return `${away} Night shift output ${percent(night.payFrom)}, and ${percent(night.payTo)} from ${roof}'s roof.`;
}

/**
 * The prototype's "early": production stopped under 98.5% of the night. The
 * bar shows the idle time and the clock line names why, only then.
 */
function early(report: AwayReport): boolean {
  return report.night.producedMs < Math.max(1, report.awayMs) * 0.985;
}

/** The prototype's bar: the share produced, and its idle time when early. */
function bar(report: AwayReport): ShiftBar {
  const awayMs = Math.max(1, report.awayMs);
  const producedMs = report.night.producedMs;
  const produced = Math.max(3, Math.round((100 * producedMs) / awayMs)) / 100;
  return early(report)
    ? {
        produced,
        left: `production ${shiftDuration(producedMs)}`,
        right: `idle ${shiftDuration(awayMs - producedMs)}`,
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

/** The stockyard stood the mine before the night was over (part 2, #671). */
function yardStopped(report: AwayReport): boolean {
  return report.night.stop === "stockyard" && early(report);
}

function lines(report: AwayReport): readonly string[] {
  const night = report.night;
  const produced = goodsList(night.produced);
  const delivered = goodsList(night.delivered);
  return [
    produced.length > 0 ? `Produced: ${produced.join(", ")}.` : "No output.",
    ...(delivered.length > 0
      ? [`Transport delivered to orders: ${delivered.join(", ")}.`]
      : []),
    ...stepLines(night),
    ...(night.stop === "clock" && early(report)
      ? ["A night shift runs 8 h. Production stopped after that."]
      : []),
    ...(yardStopped(report) ? ["Stockyard full: production stopped."] : []),
  ];
}

/** "Brick full at 3 h 20 min", brick, stone, then cut stone, as the stockyard's bays stand. */
const MARK_ORDER = [...BAY_ORDER, "cutStone"] as const;

function marks(night: NightReport): readonly string[] {
  return MARK_ORDER.flatMap((good) => {
    const at = night.fullAtMs?.[good];
    return at === undefined
      ? []
      : [`${GOOD_NAMES[good]} full at ${shiftDuration(at)}`];
  });
}

/** The shift report of a fresh night. */
export function shiftReport(report: AwayReport): ShiftReport {
  return {
    title: "Shift report",
    head: head(report),
    bar: bar(report),
    lines: lines(report),
    marks: marks(report.night),
    toStockyard: yardStopped(report),
    key: "Resume",
  };
}
