import { el, hide, mark } from "./board-dom";
import type { Move } from "./economy/actions";
import type { FrameState } from "./frame-state";
import type { Mountain } from "./mountain";
import type { BuyAmount } from "./tiers";
import { JOB_IDS, freeWorkers, type JobId } from "./workforce";

/**
 * A job's − and + (#659, #660): the workforce sheet has them on every job,
 * and the mine on each stage's row, beside what the workers run. Both follow
 * the amount key, and a + with no free worker shows the note instead.
 */

/** How many a − or + moves at this amount: one, up to ten, or all there are. */
function moveCount(amount: BuyAmount, there: number): number {
  return amount === "one" ? 1 : amount === "ten" ? 10 : Math.max(1, there);
}

function workerMove(
  mountain: Mountain,
  amount: BuyAmount,
  job: JobId,
  way: "place" | "free",
): Extract<Move, { kind: "placeWorker" | "freeWorker" }> {
  return way === "place"
    ? {
        kind: "placeWorker",
        job,
        count: moveCount(amount, freeWorkers(mountain)),
      }
    : { kind: "freeWorker", job, count: moveCount(amount, mountain.jobs[job]) };
}

/** A − or + for a job. */
export function stepper(
  sign: string,
  job: JobId,
  way: "place" | "free",
): HTMLButtonElement {
  const key = el("button", "frame-step", sign);
  key.type = "button";
  key.dataset["job"] = job;
  key.dataset["way"] = way;
  return key;
}

/** Lights the − and + that can move a worker, and says what they move. */
export function paintSteps(
  steps: {
    readonly minus: HTMLButtonElement;
    readonly plus: HTMLButtonElement;
  },
  row: {
    readonly name: string;
    readonly canPlace: boolean;
    readonly canFree: boolean;
  },
  amount: BuyAmount,
): void {
  mark(steps.plus, "can", row.canPlace);
  mark(steps.minus, "can", row.canFree);
  const job = row.name.toLowerCase();
  const many =
    amount === "one"
      ? "a worker"
      : amount === "ten"
        ? "up to 10 workers"
        : "every worker";
  steps.plus.setAttribute("aria-label", `Put ${many} on ${job}`);
  steps.minus.setAttribute("aria-label", `Take ${many} off ${job}`);
}

/**
 * Moves workers on a tap of any − or + inside `root`. A + with no free
 * worker shows `note` and moves nobody; any other move takes it down.
 */
export function listenSteps(
  root: HTMLElement,
  state: FrameState,
  note: HTMLElement,
): void {
  root.addEventListener("click", (event) => {
    const key = (event.target as Element).closest<HTMLElement>("[data-way]");
    const job = JOB_IDS.find((id) => id === key?.dataset["job"]);
    if (key === null || job === undefined) {
      return;
    }
    const way = key.dataset["way"] === "place" ? "place" : "free";
    const mountain = state.mountain();
    if (way === "place" && freeWorkers(mountain) === 0) {
      hide(note, false);
      return;
    }
    hide(note, true);
    void state.progress.dispatch(
      workerMove(mountain, state.amount(), job, way),
    );
  });
}
