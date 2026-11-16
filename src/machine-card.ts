import { el, hide, mark, setAttr, write } from "./board-dom";
import { graniteBuyMove, tierBuyMove } from "./economy/actions";
import type { FrameState } from "./frame-state";
import {
  LEVEL_NAMES,
  MACHINE_CARD_STAYS,
  NOT_NOW,
  levelHasLine,
  machineCardTitle,
} from "./mine-level-view";
import {
  LEVEL_MACHINE_IDS,
  MINE_LEVEL_IDS,
  graniteOpen,
  levelMachines,
  type LevelMachineId,
  type MineLevelId,
} from "./mine-levels";
import { paintIcon } from "./mine-site";
import { machineKeys, type MachineKey } from "./mine-view";
import type { Mountain } from "./mountain";
import type { LevelStage } from "./workforce";

export type MachineCard = {
  readonly root: HTMLElement;
  readonly open: (stage: LevelStage) => void;
  readonly close: () => void;
  readonly paint: (mountain: Mountain) => void;
};

/** A drilling or haulage machine at the amount key's amount, and its kind as a level machine. */
type Offered = { readonly key: MachineKey; readonly id: LevelMachineId };

function offered(state: FrameState, stage: LevelStage): Offered | undefined {
  const key = machineKeys(state.mountain(), state.amount()).find(
    (each) => each.stage === stage,
  );
  const id = LEVEL_MACHINE_IDS.find((each) => each === key?.id);
  return key === undefined || id === undefined ? undefined : { key, id };
}

type MachineParts = {
  readonly root: HTMLElement;
  readonly title: HTMLElement;
  readonly face: HTMLElement;
  readonly price: HTMLElement;
  readonly icon: HTMLImageElement;
  readonly staff: HTMLElement;
  readonly has: ReadonlyMap<MineLevelId, HTMLElement>;
  readonly levels: ReadonlyMap<MineLevelId, HTMLButtonElement>;
  readonly notNow: HTMLButtonElement;
};

function buildMachineCard(): MachineParts {
  const root = el("section", "machine-card");
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "machine-card-title");
  root.hidden = true;
  const box = el("div", "machine-card-box");
  const title = el("h2", "machine-card-title");
  title.id = "machine-card-title";
  // The machine as its key says it: what it is and moves, its price and the workers it takes.
  const machine = el("p", "machine-card-machine");
  const face = el("span", "mine-key-face");
  const price = el("span", "board-num");
  const icon = el("img", "mine-key-icon");
  icon.alt = "";
  const staff = el("span", "mine-key-staff");
  const small = el("span", "mine-key-small");
  small.append(price, icon, staff);
  machine.append(face, small);
  const body = el("div", "machine-card-body");
  const has = new Map(
    MINE_LEVEL_IDS.map((level) => [level, el("span", "machine-card-has")]),
  );
  const levelLines = el("p", "machine-card-line is-quiet");
  levelLines.append(...has.values());
  body.append(
    machine,
    el("p", "machine-card-line", MACHINE_CARD_STAYS),
    levelLines,
  );
  // One key for each level, drawn alike: neither is the answer.
  const levels = new Map(
    MINE_LEVEL_IDS.map((level) => {
      const key = el("button", "machine-card-level", LEVEL_NAMES[level]);
      key.type = "button";
      key.dataset["level"] = level;
      return [level, key];
    }),
  );
  const row = el("div", "machine-card-levels");
  row.append(...levels.values());
  const notNow = el("button", "machine-card-not-now", NOT_NOW);
  notNow.type = "button";
  box.append(title, body, row, notNow);
  root.append(box);
  return { root, title, face, price, icon, staff, has, levels, notNow };
}

function paintMachine(
  parts: MachineParts,
  mountain: Mountain,
  { key, id }: Offered,
): void {
  write(parts.title, machineCardTitle(id));
  write(parts.face, key.face);
  write(parts.price, key.price);
  paintIcon(parts.icon, key.good);
  write(parts.staff, ` · ${key.staff}`);
  for (const [level, line] of parts.has) {
    write(line, levelHasLine(level, id, levelMachines(mountain, level)[id]));
  }
  for (const [level, button] of parts.levels) {
    mark(button, "can", key.can);
    setAttr(button, "aria-label", `${LEVEL_NAMES[level]}: ${key.label}`);
  }
}

/**
 * The machine card (ruling 5; spec, The mine, With two levels): a tap on
 * drilling's or haulage's key with two levels asks which level the machine
 * is for. It shows the machine's key, that it stays on its level, what each
 * level has of its kind, a key for each level and "Not now". A level's key
 * buys at the amount key's amount: the Topsoil's as the mine's keys do, the
 * Granite's as `buyGraniteMachine`. It opens over the frame as a stage's
 * list does, from `FrameState`, and the game runs on behind it.
 */
export function createMachineCard(state: FrameState): MachineCard {
  const parts = buildMachineCard();
  let open: LevelStage | undefined;
  const close = (): void => {
    open = undefined;
    hide(parts.root, true);
  };
  const paint = (mountain: Mountain): void => {
    if (open === undefined) {
      return;
    }
    const machine = graniteOpen(mountain) ? offered(state, open) : undefined;
    if (machine === undefined) {
      close();
      return;
    }
    paintMachine(parts, mountain, machine);
  };
  for (const [level, button] of parts.levels) {
    button.addEventListener("click", () => {
      const machine = open === undefined ? undefined : offered(state, open);
      if (machine === undefined || !machine.key.can) {
        return;
      }
      const { id, key } = machine;
      void state.progress.dispatch(
        level === "granite"
          ? graniteBuyMove(id, key.count)
          : tierBuyMove(id, key.count),
      );
      close();
    });
  }
  parts.notNow.addEventListener("click", close);
  return {
    root: parts.root,
    open: (stage) => {
      open = stage;
      hide(parts.root, false);
      paint(state.mountain());
      if (!parts.root.hidden) {
        parts.notNow.focus({ preventScroll: true });
      }
    },
    close,
    paint,
  };
}
