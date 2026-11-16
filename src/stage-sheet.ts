import stoneUrl from "./assets/board/res-stone.png";
import { el, hide, mark, setAttr, write } from "./board-dom";
import { paintAmountKey } from "./buys-amount";
import type { FrameState } from "./frame-state";
import { STAGES, type Stage } from "./line";
import { buildMachineKey, paintMachineKey, type KeyParts } from "./mine-site";
import type { Mountain } from "./mountain";
import {
  stageList,
  type ListMachine,
  type ListPart,
  type ListUpgrade,
  type StageList,
} from "./stage-list-view";
import type { UpgradeId } from "./upgrades";
import "./stage-sheet.css";

/**
 * A stage's list (#661; spec, "What the prototype does not show"): a sheet
 * over the frame, in the workforce's form, opened by a tap on a stage's row
 * in the mine. Its head has what the stage moves of what it can move, with
 * the row's band, a line for each part of who works with what, and the
 * amount key; under it are the stage's machines with their marks and keys,
 * and the upgrades that lift them. It paints the pure view (stage-list-view)
 * and changes the game only through `progress.dispatch`.
 */

export type StageSheet = {
  readonly root: HTMLElement;
  readonly open: (stage: Stage) => void;
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

type UpgradeParts = {
  readonly root: HTMLElement;
  readonly name: HTMLElement;
  readonly line: HTMLElement;
  readonly why: HTMLElement;
  readonly key: HTMLButtonElement;
  readonly price: HTMLElement;
  readonly owned: HTMLElement;
  /** The row as last painted: a tap buys at the price on its key (#367). */
  shown: ListUpgrade | undefined;
};

/**
 * An upgrade's row: its name, what it does in numbers, its second line, and
 * a key with its price, or "Owned". The workforce's workers use it too.
 */
function buildUpgradeRow(state: FrameState, id: UpgradeId): UpgradeParts {
  const root = el("div", "stage-row");
  root.dataset["upgrade"] = id;
  const text = rowText();
  const key = el("button", "stage-buy");
  key.type = "button";
  const price = el("span", "board-num");
  const stone = el("img", "mine-key-icon");
  stone.src = stoneUrl;
  stone.alt = "";
  key.append(price, stone);
  const owned = el("span", "stage-owned", "Owned");
  root.append(text.root, key, owned);
  const parts: UpgradeParts = {
    ...text,
    root,
    key,
    price,
    owned,
    shown: undefined,
  };
  key.addEventListener("click", () => {
    const row = parts.shown;
    if (row?.can === true && row.shownPrice !== undefined) {
      void state.progress.dispatch({
        kind: "buyUpgrade",
        id,
        price: row.shownPrice,
      });
    }
  });
  return parts;
}

function paintUpgradeRow(parts: UpgradeParts, row: ListUpgrade): void {
  parts.shown = row;
  write(parts.name, row.name);
  write(parts.line, row.effect);
  write(parts.why, row.why);
  hide(parts.key, row.owned);
  hide(parts.owned, !row.owned);
  write(parts.price, row.price);
  mark(parts.key, "can", row.can);
  setAttr(parts.key, "aria-label", row.label);
}

/**
 * Upgrade rows that follow the view: a row is added when its upgrade opens,
 * and the rest are painted in place.
 */
export function upgradeRows(state: FrameState): {
  readonly root: HTMLElement;
  readonly paint: (rows: readonly ListUpgrade[]) => void;
} {
  const root = el("div", "stage-rows");
  const built = new Map<UpgradeId, UpgradeParts>();
  return {
    root,
    paint: (rows) => {
      const ids = rows.map((row) => row.id);
      if (ids.join() !== [...built.keys()].join()) {
        built.clear();
        for (const id of ids) {
          built.set(id, buildUpgradeRow(state, id));
        }
        root.replaceChildren(...[...built.values()].map((row) => row.root));
      }
      hide(root, rows.length === 0);
      for (const row of rows) {
        const parts = built.get(row.id);
        if (parts !== undefined) {
          paintUpgradeRow(parts, row);
        }
      }
    },
  };
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

/** One stage's rows in the sheet: its machines and its upgrades. */
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
  const upgrades = upgradeRows(state);
  const upgradeHead = el("h3", "frame-jobs-site", "Upgrades");
  root.append(machineBox, upgradeHead, upgrades.root);
  return {
    root,
    paint: (view) => {
      for (const [index, machine] of view.machines.entries()) {
        const parts = machines[index];
        if (parts !== undefined) {
          paintMachineRow(parts, machine);
        }
      }
      upgrades.paint(view.upgrades);
      hide(upgradeHead, view.upgrades.length === 0);
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
  const shut = (): void => {
    open = undefined;
    hide(root, true);
  };
  close.addEventListener("click", shut);
  const paint = (mountain: Mountain): void => {
    if (open === undefined) {
      return;
    }
    const view = stageList(mountain, open, state.amount(), now());
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
    open: (stage) => {
      open = stage;
      hide(root, false);
      paint(state.mountain());
    },
    close: shut,
    paint,
  };
}
