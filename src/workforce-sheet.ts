import { el, hide, mark, write } from "./board-dom";
import { paintAmountKey } from "./buys-amount";
import { tierBuyMove } from "./economy/actions";
import type { FrameState } from "./frame-state";
import { hireKey } from "./frame-view";
import type { Mountain } from "./mountain";
import type { BuyAmount } from "./tiers";
import { listenSteps, paintSteps, stepper } from "./job-steps";
import { rowText, upgradeRows } from "./stage-sheet";
import { workersList } from "./stage-list-view";
import type { JobId } from "./workforce";
import type { SiteId } from "./next-view";
import {
  NO_FREE_WORKER,
  jobSites,
  workforceView,
  type JobRow,
} from "./workforce-view";

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

type RowParts = {
  readonly root: HTMLElement;
  readonly note: HTMLElement;
  readonly count: HTMLElement;
  readonly minus: HTMLButtonElement;
  readonly plus: HTMLButtonElement;
};

function buildRow(row: {
  readonly job: JobId;
  readonly name: string;
}): RowParts {
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
  paintSteps(parts, row, amount);
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
    state.advanceAmount();
  });
  const hire = el("button", "frame-sheet-hire");
  hire.type = "button";
  hire.addEventListener("click", () => {
    const key = hireKey(state.mountain(), state.amount());
    void state.progress.dispatch(tierBuyMove("helper", key.count));
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
  paintAmountKey(parts.amount, parts.amount, amount);
  const key = hireKey(mountain, amount);
  write(
    parts.hire,
    `${key.count === 1 ? "Hire" : `Hire ${String(key.count)}`} · ${key.price}`,
  );
  mark(parts.hire, "can", key.can);
}

/**
 * The jobs, grouped by site, built once for every site; a site's group
 * shows while it is open, so the refinery joins when it opens (#671).
 */
function buildJobs(): {
  readonly root: HTMLElement;
  readonly rows: ReadonlyMap<JobId, RowParts>;
  readonly sites: ReadonlyMap<SiteId, HTMLElement>;
} {
  const root = el("div", "frame-jobs");
  const rows = new Map<JobId, RowParts>();
  const sites = new Map<SiteId, HTMLElement>();
  for (const group of jobSites()) {
    const box = el("div", "frame-jobs-group");
    box.dataset["site"] = group.site;
    box.append(el("h3", "frame-jobs-site", group.name));
    for (const job of group.jobs) {
      const parts = buildRow(job);
      rows.set(job.job, parts);
      box.append(parts.root);
    }
    sites.set(group.site, box);
    root.append(box);
  }
  return { root, rows, sites };
}

/**
 * The workers' own upgrades and marks (#661), under the jobs: Work boots,
 * and the workers' next mark.
 */
function buildWorkers(
  state: FrameState,
  now: () => number,
): {
  readonly root: HTMLElement;
  readonly paint: (mountain: Mountain) => void;
} {
  const root = el("div", "frame-workers-own");
  const row = el("div", "stage-row");
  const { root: text, name, line: owned, why: mark } = rowText();
  row.append(text);
  const upgrades = upgradeRows(state);
  root.append(el("h3", "frame-jobs-site", "The workers"), row, upgrades.root);
  return {
    root,
    paint: (mountain) => {
      const view = workersList(mountain, now());
      write(name, view.name);
      write(owned, view.owned);
      write(mark, view.mark ?? "");
      upgrades.paint(view.upgrades);
    },
  };
}

export function createWorkforceSheet(
  state: FrameState,
  now: () => number = Date.now,
): WorkforceSheet {
  const root = el("section", "frame-sheet");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Workforce");
  root.hidden = true;
  const box = el("div", "frame-sheet-box");
  const head = buildHead(state);
  const note = el("p", "frame-sheet-note", NO_FREE_WORKER);
  note.hidden = true;
  const jobs = buildJobs();
  const workers = buildWorkers(state, now);
  jobs.root.append(workers.root);
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
  listenSteps(jobs.root, state, note);
  return {
    root,
    open: () => {
      hide(root, false);
    },
    close: shut,
    paint: (mountain) => {
      paintHead(head, mountain, state.amount());
      workers.paint(mountain);
      const view = workforceView(mountain);
      // A hire, or a worker taken off another job, answers the note.
      if (view.free > 0) {
        hide(note, true);
      }
      for (const [site, box] of jobs.sites) {
        hide(box, !view.groups.some((group) => group.site === site));
      }
      for (const row of view.groups.flatMap((group) => group.rows)) {
        const parts = jobs.rows.get(row.job);
        if (parts !== undefined) {
          paintRow(parts, row, state.amount());
        }
      }
    },
  };
}
