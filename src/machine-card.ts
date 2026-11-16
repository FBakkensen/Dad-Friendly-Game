import { el, hide, mark, setAttr, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import { forgetAll, pressOnBoard, type PressTracker } from "./card-tap";
import { graniteBuyMove, tierBuyMove } from "./economy/actions";
import { cardShell } from "./frame-cards";
import type { FrameState } from "./frame-state";
import {
  MACHINE_CARD_STAYS,
  NOT_NOW,
  levelHasLine,
  machineCardTitle,
} from "./mine-level-view";
import {
  MINE_LEVEL_IDS,
  graniteOpen,
  levelMachines,
  type LevelMachineId,
  type MineLevelId,
} from "./mine-levels";
import { paintIcon } from "./mine-site";
import { LEVEL_NAMES, machineKey, type MachineKey } from "./mine-view";
import type { Mountain } from "./mountain";
import { tierById } from "./tiers";

export type MachineCard = {
  readonly root: HTMLElement;
  readonly open: (id: LevelMachineId) => void;
  readonly close: () => void;
  readonly paint: (mountain: Mountain) => void;
};

/** A drilling or haulage machine at the amount key's amount, and its kind as a level machine. */
type Offered = { readonly key: MachineKey; readonly id: LevelMachineId };

/** The machine's key as the key he tapped reads it, on the same clock: the card's rate is the key's. */
function offered(
  state: FrameState,
  id: LevelMachineId,
  now: () => number,
): Offered {
  const tier = tierById(id);
  const stage = tier.stage === "face" ? "face" : "haul";
  return {
    key: machineKey(state.mountain(), stage, tier, state.amount(), now()),
    id,
  };
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
  const { root, box, title, body } = cardShell("machine-card");
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
  box.append(row, notNow);
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
 * The machine card (ruling 5; spec, The mine, With two levels): with two
 * levels a tap on a drilling or haulage machine's key, on the mine or in a
 * stage's list, asks which level that machine is for. It shows the machine's key, that it stays on its level, what each
 * level has of its kind, a key for each level and "Not now". A level's key
 * buys at the amount key's amount: the Topsoil's as the mine's keys do, the
 * Granite's as `buyGraniteMachine`. It opens over the frame as a stage's
 * list does, from `FrameState`, and the game runs on behind it. It is a card
 * on the board's tap model (`machine`): its keys settle as it opens.
 */
export function createMachineCard(
  state: FrameState,
  board: BoardHost,
  now: () => number,
): MachineCard {
  const parts = buildMachineCard();
  let open: LevelMachineId | undefined;
  const trackers: PressTracker[] = [];
  const forget = forgetAll(trackers);
  const close = (): void => {
    if (open === undefined) {
      return;
    }
    open = undefined;
    hide(parts.root, true);
    forget();
    board.send({
      kind: "close",
      overlay: "machine",
      at: board.clock(),
      by: "program",
    });
  };
  const paint = (mountain: Mountain): void => {
    if (open === undefined) {
      return;
    }
    if (!graniteOpen(mountain)) {
      close();
      return;
    }
    paintMachine(parts, mountain, offered(state, open, now));
  };
  const buy = (level: MineLevelId): void => {
    const machine = open === undefined ? undefined : offered(state, open, now);
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
  };
  // Its keys press through the board, as the frame's other cards do: the second tap of a
  // double tap on a mine key, landing as the card opens under the finger, does nothing.
  const press = (target: HTMLElement, id: string, act: () => void): void => {
    trackers.push(
      pressOnBoard(target, board, { layer: "machine", id }, (decision) => {
        if (decision === "act") {
          act();
        }
      }),
    );
  };
  for (const [level, button] of parts.levels) {
    press(button, `level:${level}`, () => {
      buy(level);
    });
  }
  press(parts.notNow, "not-now", close);
  return {
    root: parts.root,
    open: (id) => {
      const opening = open === undefined;
      open = id;
      hide(parts.root, false);
      if (opening) {
        forget();
        board.send({ kind: "open", overlay: "machine", at: board.clock() });
      }
      paint(state.mountain());
      if (!parts.root.hidden) {
        parts.notNow.focus({ preventScroll: true });
      }
    },
    close,
    paint,
  };
}
