import { el, hide, mark, setAttr, write } from "./board-dom";
import { AMOUNT_WORDS, amountAria, nextAmount } from "./buys-amount";
import type { Move } from "./economy/actions";
import { hireMove, type FrameState } from "./frame-state";
import { hireKey } from "./frame-view";
import type { Mountain } from "./mountain";
import type { BuyAmount } from "./tiers";
import { JOB_IDS, freeWorkers, type JobId } from "./workforce";
import { NO_FREE_WORKER, workforceView, type JobRow } from "./workforce-view";

/**
 * The workforce (#659; spec, "The workforce"): a sheet over the frame, opened
 * from the count of workers on every site. Its head says the workers and the
 * free ones and has the second hire key and the amount key. Its jobs are
 * grouped by site, each with what its workers run and its count between −
 * and +. The game runs on behind it.
 */

export type WorkforceSheet = {
  readonly root: HTMLElement;
  readonly open: () => void;
  readonly close: () => void;
  readonly paint: (mountain: Mountain) => void;
};

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

type RowParts = {
  readonly root: HTMLElement;
  readonly note: HTMLElement;
  readonly count: HTMLElement;
  readonly minus: HTMLButtonElement;
  readonly plus: HTMLButtonElement;
};

function stepper(
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

function buildRow(row: JobRow): RowParts {
  const root = el("div", "frame-job");
  root.dataset["job"] = row.job;
  const note = el("span", "frame-job-note");
  const count = el("b", "frame-job-count board-num");
  const minus = stepper("−", row.job, "free");
  const plus = stepper("+", row.job, "place");
  root.append(el("span", "frame-job-name", row.name), note, minus, count, plus);
  return { root, note, count, minus, plus };
}

function paintRow(parts: RowParts, row: JobRow, amount: BuyAmount): void {
  write(parts.note, row.note);
  write(parts.count, String(row.count));
  mark(parts.plus, "can", row.canPlace);
  mark(parts.minus, "can", row.canFree);
  const job = row.name.toLowerCase();
  const many =
    amount === "one"
      ? "a worker"
      : amount === "ten"
        ? "up to 10 workers"
        : "every worker";
  parts.plus.setAttribute("aria-label", `Put ${many} on ${job}`);
  parts.minus.setAttribute("aria-label", `Take ${many} off ${job}`);
}

type HeadParts = {
  readonly root: HTMLElement;
  readonly workers: HTMLElement;
  readonly free: HTMLElement;
  readonly amount: HTMLButtonElement;
  readonly hire: HTMLButtonElement;
};

function buildHead(state: FrameState): HeadParts {
  const root = el("div", "frame-sheet-head");
  const counts = el("span", "frame-sheet-counts");
  const workers = el("b", "board-num");
  const free = el("b", "board-num");
  counts.append(workers, " workers · ", free, " free");
  const amount = el("button", "frame-amount");
  amount.type = "button";
  amount.addEventListener("click", () => {
    state.setAmount(nextAmount(state.amount()));
  });
  const hire = el("button", "frame-sheet-hire");
  hire.type = "button";
  hire.addEventListener("click", () => {
    const key = hireKey(state.mountain(), state.amount());
    void state.progress.dispatch(hireMove(key.count));
  });
  root.append(counts, amount, hire);
  return { root, workers, free, amount, hire };
}

function paintHead(
  parts: HeadParts,
  mountain: Mountain,
  amount: BuyAmount,
): void {
  const view = workforceView(mountain);
  write(parts.workers, String(view.owned));
  write(parts.free, String(view.free));
  write(parts.amount, AMOUNT_WORDS[amount].face);
  setAttr(parts.amount, "aria-label", amountAria(amount));
  const key = hireKey(mountain, amount);
  write(
    parts.hire,
    `${key.count === 1 ? "Hire" : `Hire ${key.count}`} · ${key.price}`,
  );
  mark(parts.hire, "can", key.can);
}

/** The jobs, grouped by site, built once from the view's open jobs. */
function buildJobs(mountain: Mountain): {
  readonly root: HTMLElement;
  readonly rows: ReadonlyMap<JobId, RowParts>;
} {
  const root = el("div", "frame-jobs");
  const rows = new Map<JobId, RowParts>();
  for (const group of workforceView(mountain).groups) {
    root.append(el("h3", "frame-jobs-site", group.name));
    for (const row of group.rows) {
      const parts = buildRow(row);
      rows.set(row.job, parts);
      root.append(parts.root);
    }
  }
  return { root, rows };
}

export function createWorkforceSheet(state: FrameState): WorkforceSheet {
  const root = el("section", "frame-sheet");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Workforce");
  root.hidden = true;
  const box = el("div", "frame-sheet-box");
  const head = buildHead(state);
  const note = el("p", "frame-sheet-note", NO_FREE_WORKER);
  note.hidden = true;
  const jobs = buildJobs(state.mountain());
  const close = el("button", "frame-sheet-close", "Close");
  close.type = "button";
  box.append(
    el("h2", "frame-sheet-title", "Workforce"),
    head.root,
    note,
    jobs.root,
    close,
  );
  root.append(box);
  const shut = (): void => {
    hide(note, true);
    hide(root, true);
  };
  close.addEventListener("click", shut);
  jobs.root.addEventListener("click", (event) => {
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
  return {
    root,
    open: () => {
      hide(root, false);
    },
    close: shut,
    paint: (mountain) => {
      paintHead(head, mountain, state.amount());
      const view = workforceView(mountain);
      for (const row of view.groups.flatMap((group) => group.rows)) {
        const parts = jobs.rows.get(row.job);
        if (parts !== undefined) {
          paintRow(parts, row, state.amount());
        }
      }
    },
  };
}
