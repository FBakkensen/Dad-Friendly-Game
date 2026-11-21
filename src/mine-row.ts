import { el, hide, mark, setAttr, write } from "./board-dom";
import type { FrameState } from "./frame-state";
import { paintSteps, stepper } from "./job-steps";
import type { MineLevelId } from "./mine-levels";
import { pileWords, type StageRow } from "./mine-view";
import type { BuyAmount } from "./tiers";

/**
 * A stage's row on the mine (#660, #680): its name and what it moves now of
 * what it can move over the band, who works with what, the pile after it,
 * and its workers between − and +. The one-level mine has one for each
 * stage under the keys; with two levels each level has its drilling and
 * haulage rows on the level, and Hoisting its one row under the keys. A tap
 * on its words opens the stage's list (#661).
 */

/** Positions a part of the overlay at an art px row of the scene. */
export function atArt(target: HTMLElement, row: number): void {
  target.style.setProperty("--at", String(row));
}

export type RowParts = {
  readonly root: HTMLElement;
  /** What the row is called where it is said in words: "Drilling", "Topsoil drilling". */
  readonly title: string;
  readonly info: HTMLButtonElement;
  readonly lamp: HTMLElement;
  readonly now: HTMLElement;
  readonly can: HTMLElement;
  readonly sum: HTMLElement;
  readonly pile: HTMLElement;
  readonly bandCan: HTMLElement;
  readonly bandNow: HTMLElement;
  readonly count: HTMLElement;
  readonly unit: HTMLElement;
  readonly minus: HTMLButtonElement;
  readonly plus: HTMLButtonElement;
};

/**
 * How a row is headed: its stage's name, or (with two levels) a level's
 * name with the stage's word before the rate ("TOPSOIL drilling 1,300 of
 * 1,300/s").
 */
export type RowHead = {
  readonly name: string;
  readonly lead: string | undefined;
  readonly title: string;
  /** With two levels, the level a drilling or haulage row is on: a tap opens that level's list. */
  readonly level?: MineLevelId;
};

export function buildRow(
  state: FrameState,
  row: StageRow,
  head: RowHead = { name: row.name, lead: undefined, title: row.name },
): RowParts {
  const root = el("div", "mine-stage");
  root.dataset["stage"] = row.stage;
  // A tap on the row's words opens the stage's list (#661), a level's row its level's (#680).
  const info = el("button", "mine-stage-info");
  info.type = "button";
  info.addEventListener("click", () => {
    state.openStage(row.stage, head.level);
  });
  const band = el("span", "mine-band");
  const bandCan = el("i", "mine-band-can");
  const bandNow = el("i", "mine-band-now");
  band.append(bandCan, bandNow);
  const top = el("span", "mine-stage-head");
  const now = el("b", "board-num");
  const can = el("i", "board-num");
  const rate = el("span", "mine-stage-rate");
  if (head.lead !== undefined) {
    rate.append(`${head.lead} `);
  }
  rate.append(now, " of ", can);
  top.append(el("span", "mine-stage-name", head.name), rate);
  const sum = el("span", "mine-stage-sum");
  // The pile after the stage (#703), inside the words, so a tap on it opens the list too.
  const pile = el("span", "mine-stage-pile");
  const lamp = el("i", "frame-lamp");
  info.append(band, top, sum, pile, lamp);
  const minus = stepper("−", row.job, "free");
  const plus = stepper("+", row.job, "place");
  const count = el("b", "board-num");
  const unit = el("small", "");
  const workers = el("span", "mine-stage-count");
  workers.append(count, unit);
  root.append(info, minus, workers, plus);
  return {
    root,
    title: head.title,
    info,
    lamp,
    now,
    can,
    sum,
    pile,
    bandCan,
    bandNow,
    count,
    unit,
    minus,
    plus,
  };
}

/**
 * The fullest form of the row's sum that fits its line. A sum too long for
 * one line in every form (the third state's words) takes two lines, in
 * its full words.
 */
function writeSum(target: HTMLElement, forms: readonly string[]): void {
  mark(target, "wrap", false);
  for (const form of forms) {
    write(target, form);
    if (target.scrollWidth <= target.clientWidth + 1) {
      return;
    }
  }
  mark(target, "wrap", true);
  write(target, forms[0] ?? "");
}

/**
 * Paints a row. `pile` says whether the row shows its pile in its words:
 * with two levels a level's piles are under its gallery instead.
 */
export function paintRow(
  parts: RowParts,
  row: StageRow,
  look: {
    readonly amount: BuyAmount;
    readonly lamp: boolean;
    readonly pile: boolean;
  },
): void {
  setAttr(parts.lamp, "data-lamp", look.lamp ? "green" : "dark");
  const pile =
    row.pile === undefined || !look.pile ? undefined : pileWords(row.pile);
  setAttr(
    parts.info,
    "aria-label",
    `${parts.title}: ${row.now}/s of ${row.can}.${pile === undefined ? "" : ` ${pile}.`} Opens its list.`,
  );
  write(parts.now, row.now);
  write(parts.can, row.can);
  writeSum(parts.sum, row.sum);
  hide(parts.pile, pile === undefined);
  mark(parts.pile, "full", row.pile?.full === true);
  write(parts.pile, pile ?? "");
  parts.bandCan.style.width = `${String(Math.round(row.band.can * 1000) / 10)}%`;
  parts.bandNow.style.width = `${String(Math.round(row.band.now * 1000) / 10)}%`;
  write(parts.count, String(row.workers));
  write(parts.unit, row.workers === 1 ? "worker" : "workers");
  paintSteps(parts, { ...row, name: parts.title }, look.amount);
}
