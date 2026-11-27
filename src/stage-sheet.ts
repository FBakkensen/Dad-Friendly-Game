import { el, hide, setAttr, write } from "./board-dom";
import { paintAmountKey } from "./buys-amount";
import type { FrameState } from "./frame-state";
import { STAGES, type Stage } from "./line";
import type { MineLevelId } from "./mine-levels";
import { buildMachineKey, paintMachineKey, type KeyParts } from "./mine-site";
import type { Mountain } from "./mountain";
import {
  stageList,
  type ListMachine,
  type ListPart,
  type StageList,
} from "./stage-list-view";
import "./stage-sheet.css";

/**
 * A stage's list (#661, #780): a sheet over the frame, in the workforce's
 * form, opened by a tap on a stage's row in the mine. Its head has what the
 * stage moves of what it can move, with the row's band, a line for each part
 * of who works with what, and the amount key; under it are the stage's
 * machines with their marks and keys. Lasting upgrades live in the City's
 * Research Lab. It paints the pure view (stage-list-view) and changes the
 * game only through `progress.dispatch`.
 */

export type StageSheet = {
  readonly root: HTMLElement;
  /** With two levels, `level` is the level whose row was tapped: the sheet is that level's list (#680). */
  readonly open: (stage: Stage, level?: MineLevelId) => void;
  readonly close: () => void;
  readonly paint: (mountain: Mountain) => void;
};

/** A row's words: its name, then its lines. The workforce's workers row uses it too. */
export function rowText(): {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly line: HTMLElement;
  readonly why: HTMLElement;
} {
  const root = el("span", "stage-row-text");
  const name = el("b", "stage-row-name");
  const line = el("span", "stage-row-line");
  const why = el("small", "stage-row-why");
  root.append(name, line, why);
  return { root, name, line, why };
}

type MachineParts = {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly line: HTMLElement;
  readonly why: HTMLElement;
  readonly key: KeyParts;
};

/** A kind of machine's row: what he owns, its next mark, and its key in the mine keys' form. */
function buildMachineRow(
  state: FrameState,
  stage: Stage,
  machine: ListMachine,
  now: () => number,
): MachineParts {
  const root = el("div", "stage-row");
  root.dataset["machine"] = machine.id;
  const text = rowText();
  const key = buildMachineKey(
    state,
    "mine-key stage-key",
    () =>
      stageList(state.mountain(), stage, state.amount(), now()).machines.find(
        (each) => each.id === machine.id,
      )?.key,
  );
  root.append(text.root, key.root);
  return { ...text, root, key };
}

function paintMachineRow(parts: MachineParts, machine: ListMachine): void {
  write(parts.name, machine.name);
  write(parts.line, machine.owned);
  write(parts.why, machine.mark ?? "");
  paintMachineKey(parts.key, machine.key, machine.key.good);
}

/** One stage's rows in the sheet: its machines. */
type StagePage = {
  readonly root: HTMLElement;
  readonly paint: (view: StageList) => void;
};

function buildPage(
  state: FrameState,
  stage: Stage,
  now: () => number,
): StagePage {
  const root = el("div", "frame-jobs stage-page");
  root.dataset["stage"] = stage;
  const first = stageList(state.mountain(), stage, state.amount(), now());
  const machines = first.machines.map((machine) =>
    buildMachineRow(state, stage, machine, now),
  );
  const machineBox = el("div", "stage-rows");
  machineBox.append(...machines.map((row) => row.root));
  root.append(machineBox);
  return {
    root,
    paint: (view) => {
      for (const [index, machine] of view.machines.entries()) {
        const parts = machines[index];
        if (parts !== undefined) {
          paintMachineRow(parts, machine);
        }
      }
    },
  };
}

/** The head's numbers: what the stage moves of what it can, its band, and a line for each part. */
type MovesParts = {
  readonly root: HTMLElement;
  readonly now: HTMLElement;
  readonly can: HTMLElement;
  readonly bandCan: HTMLElement;
  readonly bandNow: HTMLElement;
  readonly parts: HTMLElement;
};

function buildMoves(): MovesParts {
  const root = el("div", "stage-moves");
  // A named group, so a screen reader hears the row in one sentence.
  root.setAttribute("role", "group");
  const total = el("p", "stage-total");
  const now = el("b", "board-num");
  const can = el("span", "board-num");
  total.append(el("span", "stage-total-word", "Moves"), now, " of ", can);
  const band = el("span", "mine-band stage-band");
  const bandCan = el("i", "mine-band-can");
  const bandNow = el("i", "mine-band-now");
  band.append(bandCan, bandNow);
  const parts = el("div", "stage-parts");
  root.append(band, total, parts);
  return { root, now, can, bandCan, bandNow, parts };
}

function partLine(part: ListPart): HTMLElement {
  const line = el("p", "stage-part");
  line.append(
    el("span", "stage-part-name", part.name),
    el("span", "stage-part-detail", part.detail),
    el("span", "stage-part-moves board-num", part.moves),
  );
  return line;
}

function paintMoves(parts: MovesParts, view: StageList): void {
  write(parts.now, view.now);
  write(parts.can, view.can);
  setAttr(parts.root, "aria-label", view.sentence);
  parts.bandCan.style.width = `${String(Math.round(view.band.can * 1000) / 10)}%`;
  parts.bandNow.style.width = `${String(Math.round(view.band.now * 1000) / 10)}%`;
  const words = view.parts
    .map((part) => `${part.name}|${part.detail}|${part.moves}`)
    .join("\n");
  if (parts.parts.dataset["words"] !== words) {
    parts.parts.dataset["words"] = words;
    parts.parts.replaceChildren(...view.parts.map(partLine));
  }
}

export function createStageSheet(
  state: FrameState,
  now: () => number,
): StageSheet {
  const root = el("section", "frame-sheet stage-sheet");
  root.setAttribute("role", "dialog");
  root.hidden = true;
  const box = el("div", "frame-sheet-box");
  const title = el("h2", "frame-sheet-title");
  const amount = el("button", "frame-amount");
  amount.type = "button";
  amount.addEventListener("click", () => {
    state.advanceAmount();
  });
  const top = el("div", "stage-top");
  top.append(title, amount);
  const moves = buildMoves();
  const pages = new Map(
    STAGES.map((stage) => [stage, buildPage(state, stage, now)]),
  );
  const close = el("button", "frame-sheet-close", "Close");
  close.type = "button";
  box.append(
    top,
    moves.root,
    ...[...pages.values()].map((page) => page.root),
    close,
  );
  root.append(box);
  let open: Stage | undefined;
  let level: MineLevelId | undefined;
  const shut = (): void => {
    open = undefined;
    hide(root, true);
  };
  close.addEventListener("click", shut);
  const paint = (mountain: Mountain): void => {
    if (open === undefined) {
      return;
    }
    const view = stageList(mountain, open, state.amount(), now(), level);
    write(title, view.name);
    setAttr(root, "aria-label", view.name);
    paintMoves(moves, view);
    paintAmountKey(amount, amount, state.amount());
    for (const [stage, page] of pages) {
      hide(page.root, stage !== open);
      if (stage === open) {
        page.paint(view);
      }
    }
  };
  return {
    root,
    open: (stage, at) => {
      open = stage;
      level = at;
      hide(root, false);
      paint(state.mountain());
    },
    close: shut,
    paint,
  };
}
