import stoneUrl from "./assets/board/res-stone.png";
import { el, hide, mark, setAttr, write } from "./board-dom";
import { paintAmountKey } from "./buys-amount";
import { tierBuyMove } from "./economy/actions";
import type { FrameState } from "./frame-state";
import { STAGES, type Stage } from "./line";
import type { Mountain } from "./mountain";
import {
  stageList,
  type ListMachine,
  type ListUpgrade,
  type StageList,
} from "./stage-list-view";
import { upgradePrice, type UpgradeId } from "./upgrades";
import "./stage-sheet.css";

/**
 * A stage's list (#661; spec, "What the prototype does not show"): a sheet
 * over the frame, in the workforce's form, opened by a tap on a stage's row
 * in the mine. Its head says the row in one sentence and has the amount key;
 * under it are the stage's machines with their marks and keys, and the
 * upgrades that lift them. It paints the pure view (stage-list-view) and
 * changes the game only through `progress.dispatch`.
 */

export type StageSheet = {
  readonly root: HTMLElement;
  readonly open: (stage: Stage) => void;
  readonly close: () => void;
  readonly paint: (mountain: Mountain, now?: number) => void;
};

function stoneIcon(): HTMLImageElement {
  const stone = el("img", "mine-key-icon");
  stone.src = stoneUrl;
  stone.alt = "";
  return stone;
}

/** A row's words: its name, then its lines. */
function rowText(): {
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
};

/**
 * An upgrade's row: its name, what it does in numbers, its second line, and
 * a key with its price, or "Owned". The workforce's workers use it too.
 */
export function buildUpgradeRow(
  state: FrameState,
  id: UpgradeId,
): UpgradeParts {
  const root = el("div", "stage-row");
  root.dataset["upgrade"] = id;
  const text = rowText();
  const key = el("button", "stage-buy");
  key.type = "button";
  const price = el("span", "board-num");
  key.append(price, stoneIcon());
  const owned = el("span", "stage-owned", "Owned");
  key.addEventListener("click", () => {
    const shown = upgradePrice(state.mountain(), id);
    if (shown !== undefined && key.classList.contains("can")) {
      void state.progress.dispatch({ kind: "buyUpgrade", id, price: shown });
    }
  });
  root.append(text.root, key, owned);
  return { ...text, root, key, price, owned };
}

export function paintUpgradeRow(parts: UpgradeParts, row: ListUpgrade): void {
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
  readonly key: HTMLButtonElement;
  readonly face: HTMLElement;
  readonly price: HTMLElement;
  readonly staff: HTMLElement;
};

/** A kind of machine's row: what he owns, its next mark, and its key in the mine keys' form. */
function buildMachineRow(
  state: FrameState,
  stage: Stage,
  machine: ListMachine,
): MachineParts {
  const root = el("div", "stage-row");
  root.dataset["machine"] = machine.id;
  const text = rowText();
  const key = el("button", "mine-key stage-key");
  key.type = "button";
  const face = el("span", "mine-key-face");
  const price = el("span", "board-num");
  const staff = el("span", "mine-key-staff");
  const small = el("span", "mine-key-small");
  small.append(price, stoneIcon(), staff);
  key.append(face, small);
  key.addEventListener("click", () => {
    const view = stageList(state.mountain(), stage, state.amount());
    const found = view.machines.find((each) => each.id === machine.id);
    if (found !== undefined && found.key.can) {
      void state.progress.dispatch(tierBuyMove(found.id, found.key.count));
    }
  });
  root.append(text.root, key);
  return { ...text, root, key, face, price, staff };
}

function paintMachineRow(parts: MachineParts, machine: ListMachine): void {
  write(parts.name, machine.name);
  write(parts.line, machine.owned);
  write(parts.why, machine.mark ?? "");
  write(parts.face, machine.key.face);
  write(parts.price, machine.key.price);
  write(parts.staff, ` · ${machine.key.staff}`);
  mark(parts.key, "can", machine.key.can);
  setAttr(parts.key, "aria-label", machine.key.label);
}

/** One stage's rows in the sheet: its machines and its upgrades. */
type StagePage = {
  readonly root: HTMLElement;
  readonly paint: (view: StageList) => void;
};

function buildPage(state: FrameState, stage: Stage): StagePage {
  const root = el("div", "frame-jobs stage-page");
  root.dataset["stage"] = stage;
  const first = stageList(state.mountain(), stage, state.amount());
  const machines = first.machines.map((machine) =>
    buildMachineRow(state, stage, machine),
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

export function createStageSheet(state: FrameState): StageSheet {
  const root = el("section", "frame-sheet stage-sheet");
  root.setAttribute("role", "dialog");
  root.hidden = true;
  const box = el("div", "frame-sheet-box");
  const title = el("h2", "frame-sheet-title");
  const head = el("div", "frame-sheet-head");
  const sentence = el("p", "stage-sentence");
  const amount = el("button", "frame-amount");
  amount.type = "button";
  amount.addEventListener("click", () => {
    state.advanceAmount();
  });
  head.append(sentence, amount);
  const pages = new Map(
    STAGES.map((stage) => [stage, buildPage(state, stage)]),
  );
  const close = el("button", "frame-sheet-close", "Close");
  close.type = "button";
  box.append(
    title,
    head,
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
  const paint = (mountain: Mountain, now?: number): void => {
    if (open === undefined) {
      return;
    }
    const view = stageList(mountain, open, state.amount(), now);
    write(title, view.name);
    setAttr(root, "aria-label", view.name);
    write(sentence, view.sentence);
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
