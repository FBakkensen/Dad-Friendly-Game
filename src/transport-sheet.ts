import { el, hide, mark, setAttr, write } from "./board-dom";
import { paintAmountKey } from "./buys-amount";
import { vehicleKeys } from "./city-view";
import { vehicleBuyMove } from "./economy/actions";
import type { FrameState } from "./frame-state";
import { dropNote, listenSteps, paintSteps, stepper } from "./job-steps";
import { buildKeyFace, paintMachineKey, type KeyParts } from "./mine-site";
import type { Mountain } from "./mountain";
import type { BuyAmount } from "./tiers";
import { VEHICLE_IDS, type RunId, type VehicleId } from "./transport";
import {
  transportSheetView,
  type TransportRunRow,
  type TransportSheetView,
} from "./transport-view";
import { NO_FREE_WORKER } from "./workforce-view";

/**
 * Global Transport sheet (#768; spec, "What he sees"): sibling to the
 * Workforce sheet over the frame, opened from the top controls strip.
 * Shows drivers (− / +), running fleet summary, buy keys (+Wagon, +Truck),
 * the Part 1 even-share rule line, and the open single-good physical runs.
 * The game runs on behind it.
 */

export type TransportSheet = {
  readonly root: HTMLElement;
  readonly open: () => void;
  readonly close: () => void;
  readonly paint: (mountain: Mountain) => void;
};

type HeadParts = {
  readonly root: HTMLElement;
  readonly drivers: HTMLElement;
  readonly rate: HTMLElement;
  readonly fleet: HTMLElement;
  readonly rule: HTMLElement;
  readonly amount: HTMLButtonElement;
  readonly minus: HTMLButtonElement;
  readonly count: HTMLElement;
  readonly plus: HTMLButtonElement;
  readonly keys: ReadonlyMap<VehicleId, KeyParts>;
  readonly hint: HTMLElement;
};

type RunParts = {
  readonly root: HTMLElement;
  readonly route: HTMLElement;
  readonly good: HTMLElement;
  readonly rate: HTMLElement;
  readonly share: HTMLElement;
  readonly badge: HTMLElement;
  readonly source: HTMLElement;
  readonly dest: HTMLElement;
  readonly track: HTMLElement;
  readonly fill: HTMLElement;
};

function buildVehicleKey(state: FrameState, id: VehicleId): KeyParts {
  const parts = buildKeyFace("transport-key", () => {
    const offer = vehicleKeys(state.mountain(), state.amount()).find(
      (each) => each.id === id,
    );
    if (offer !== undefined && offer.can) {
      void state.progress.dispatch(vehicleBuyMove(offer.id, offer.count));
    }
  });
  parts.root.dataset["vehicle"] = id;
  parts.root.hidden = true;
  return parts;
}

function buildHead(state: FrameState): HeadParts {
  const root = el("div", "transport-head");
  const top = el("div", "transport-head-top");
  const drivers = el("span", "transport-drivers");
  const rate = el("b", "transport-rate board-num");
  const amount = el("button", "frame-amount");
  amount.type = "button";
  amount.addEventListener("click", () => {
    state.advanceAmount();
  });
  top.append(drivers, rate, amount);

  const fleet = el("p", "transport-fleet");

  const controls = el("div", "transport-controls");
  const minus = stepper("−", "driving", "free");
  const count = el("b", "transport-driver-count board-num");
  const plus = stepper("+", "driving", "place");
  const keys = new Map(
    VEHICLE_IDS.map((id) => [id, buildVehicleKey(state, id)] as const),
  );
  const hint = el("div", "transport-hint");
  hint.hidden = true;
  controls.append(
    minus,
    count,
    plus,
    ...[...keys.values()].map((key) => key.root),
    hint,
  );

  const rule = el("p", "transport-rule");
  root.append(top, fleet, controls, rule);
  return {
    root,
    drivers,
    rate,
    fleet,
    rule,
    amount,
    minus,
    count,
    plus,
    keys,
    hint,
  };
}

function paintHead(
  parts: HeadParts,
  view: TransportSheetView,
  amount: BuyAmount,
): void {
  write(parts.drivers, view.drivers);
  write(parts.rate, view.totalRate);
  write(parts.fleet, view.fleet);
  write(parts.rule, view.rule);
  paintAmountKey(parts.amount, parts.amount, amount);
  write(parts.count, String(view.steps.count));
  paintSteps(parts, view.steps, amount);
  for (const [id, target] of parts.keys) {
    const key = view.keys.find((each) => each.id === id);
    hide(target.root, key === undefined);
    if (key !== undefined) {
      paintMachineKey(target, key, key.good);
    }
  }
  hide(parts.hint, view.hint === undefined);
  write(parts.hint, view.hint ?? "");
}

function buildRunRow(row: TransportRunRow): RunParts {
  const root = el("div", "transport-run");
  root.dataset["run"] = row.id;
  const top = el("div", "transport-run-top");
  const route = el("span", "transport-run-route");
  const good = el("span", "transport-run-good");
  const badge = el("span", "transport-run-badge");
  const rate = el("b", "transport-run-rate board-num");
  top.append(route, good, badge, rate);

  const meta = el("div", "transport-run-meta");
  const source = el("span", "transport-run-source");
  const dest = el("span", "transport-run-dest");
  const share = el("span", "transport-run-share");
  meta.append(source, dest, share);

  const track = el("span", "transport-run-track");
  const fill = el("i", "transport-run-fill");
  track.append(fill);

  root.append(top, meta, track);
  return { root, route, good, rate, share, badge, source, dest, track, fill };
}

function paintRunRow(parts: RunParts, row: TransportRunRow): void {
  setAttr(parts.root, "data-status", row.status);
  write(parts.route, row.route);
  write(parts.good, row.good);
  write(parts.rate, row.rateText);
  write(parts.share, row.shareText);
  write(parts.badge, row.statusText);
  hide(parts.badge, row.statusText === "");
  write(parts.source, row.sourceText);
  write(parts.dest, row.destText);
  hide(parts.dest, row.destText === "");
  hide(parts.track, row.destFill === undefined);
  mark(parts.track, "full", row.destFull);
  parts.fill.style.width = `${String(Math.round((row.destFill ?? 0) * 1000) / 10)}%`;
}

export function createTransportSheet(state: FrameState): TransportSheet {
  const root = el("section", "frame-sheet transport-sheet");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Transport");
  root.hidden = true;
  const box = el("div", "frame-sheet-box transport-sheet-box");
  const head = buildHead(state);
  const note = el("p", "frame-sheet-note", NO_FREE_WORKER);
  note.hidden = true;

  const runsWrap = el("div", "transport-runs");
  const runsHead = el("h3", "frame-jobs-site", "Open runs");
  const runsList = el("div", "transport-runs-list");
  runsWrap.append(runsHead, runsList);
  const runRows = new Map<RunId, RunParts>();
  let shownRuns = "";

  const close = el("button", "frame-sheet-close", "Close");
  close.type = "button";
  box.append(
    el("h2", "frame-sheet-title", "Transport"),
    head.root,
    note,
    runsWrap,
    close,
  );
  root.append(box);

  const shut = (): void => {
    dropNote(note);
    hide(root, true);
  };
  close.addEventListener("click", shut);
  listenSteps(head.root, state, note);

  return {
    root,
    open: () => {
      hide(root, false);
    },
    close: shut,
    paint: (mountain) => {
      const amount = state.amount();
      const view = transportSheetView(mountain, amount);
      paintHead(head, view, amount);
      if (view.steps.canPlace) {
        dropNote(note);
      }
      const key = view.runs.map((run) => run.id).join(",");
      if (key !== shownRuns) {
        shownRuns = key;
        runRows.clear();
        runsList.replaceChildren();
        for (const run of view.runs) {
          const parts = buildRunRow(run);
          runRows.set(run.id, parts);
          runsList.append(parts.root);
        }
      }
      for (const run of view.runs) {
        const parts = runRows.get(run.id);
        if (parts !== undefined) {
          paintRunRow(parts, run);
        }
      }
    },
  };
}
