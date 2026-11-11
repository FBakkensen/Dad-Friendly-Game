import { cardLine, createBoardCard } from "./board-card";
import { el, frameX, hide, mark, setAttr, write } from "./board-dom";
import type { BoardHost } from "./board-host";
import { LAMP_FRAME, LAMP_PX } from "./board-row";
import { skin } from "./board-skin";
import { minedOut } from "./mountain";
import type {
  ProgressStore,
  SaveConflictView,
  SaveSide,
} from "./progress-store";
import { saveCardLines } from "./save-sheet-copy";
import {
  SAVE_CONFLICT_BODY,
  SAVE_CONFLICT_CONFIRM,
  SAVE_CONFLICT_ERROR,
  SAVE_CONFLICT_OTHER,
  SAVE_CONFLICT_PHONE,
  SAVE_CONFLICT_PLAY,
  SAVE_CONFLICT_TITLE,
} from "./screen-words";

type Pick = "local" | "remote";

/** The key of one split: a new one pre-selects again and leaves the confirm. */
function splitKey(conflict: SaveConflictView): string {
  return [
    conflict.local.rev,
    conflict.remote.rev,
    minedOut(conflict.local.mountain),
    minedOut(conflict.remote.mountain),
  ].join(":");
}

/** The side with more stones mined; the phone on a tie. */
function preselect(conflict: SaveConflictView): Pick {
  return minedOut(conflict.remote.mountain) > minedOut(conflict.local.mountain)
    ? "remote"
    : "local";
}

/**
 * The save conflict (#464), on the board card shell: the two sides as inset plates, the selected
 * one lit, then Play this one and its confirm, a new screen that settles again. So a double tap
 * on Play this one never commits a save choice.
 */
export function createSaveConflictPanel({
  progress,
  now,
  board,
  requestRender,
}: {
  progress: ProgressStore;
  now: () => number;
  board: BoardHost;
  requestRender: () => void;
}) {
  const card = createBoardCard({
    name: "conflict",
    hook: "save-conflict",
    titleId: "save-conflict-title",
    board,
  });
  write(card.title, SAVE_CONFLICT_TITLE);
  const body = cardLine("save-conflict-body");
  write(body, SAVE_CONFLICT_BODY);

  const pair = el("div", "board-card-pair save-pair");
  const phone = sideButton("phone", SAVE_CONFLICT_PHONE);
  const other = sideButton("other", SAVE_CONFLICT_OTHER);
  pair.append(phone.button, other.button);
  const error = cardLine("save-conflict-error");
  error.hidden = true;
  card.body.append(body, pair, error);

  let selected: Pick = "local";
  let confirming = false;
  let seen = "";

  const choose = (side: Pick): void => {
    selected = side;
    confirming = false;
    requestRender();
  };
  card.press(phone.button, "phone", () => {
    choose("local");
  });
  card.press(other.button, "other", () => {
    choose("remote");
  });

  const play = card.plate(
    SAVE_CONFLICT_PLAY,
    "play",
    "save-conflict-play",
    () => {
      confirming = true;
      // The confirm is a new screen: its plate settles before a finger can commit.
      card.page();
      requestRender();
    },
  );
  const confirm = el("div", "save-conflict-confirm");
  confirm.hidden = true;
  const ask = cardLine("save-conflict-ask");
  write(ask, SAVE_CONFLICT_CONFIRM);
  confirm.append(ask);
  card.foot.append(confirm);
  // One choice at a time: a second press while the first saves never chooses again.
  let committing = false;
  const commit = card.plate(
    SAVE_CONFLICT_PLAY,
    "commit",
    "save-conflict-commit",
    () => {
      if (committing) {
        return;
      }
      committing = true;
      void progress.chooseSave(selected).finally(() => {
        committing = false;
      });
    },
    confirm,
  );
  /** The confirm shows or hides; the keyboard's focus on Play this one moves to its commit. */
  const showConfirm = (on: boolean): void => {
    const focused = play.ownerDocument.activeElement === play;
    hide(play, on);
    hide(confirm, !on);
    if (on && focused) {
      commit.focus({ preventScroll: true });
    }
  };

  const render = (
    conflict: SaveConflictView | undefined,
    elsewhere: boolean,
  ): void => {
    if (conflict === undefined) {
      seen = "";
      confirming = false;
    } else {
      const key = splitKey(conflict);
      if (key !== seen) {
        seen = key;
        confirming = false;
        selected = preselect(conflict);
      }
      fill(phone, conflict.local, selected === "local", now());
      fill(other, conflict.remote, selected === "remote", now());
      hide(error, conflict.error === undefined);
      write(error, conflict.error === undefined ? "" : SAVE_CONFLICT_ERROR);
      showConfirm(confirming);
    }
    card.show(conflict !== undefined && !elsewhere, play);
  };

  return { root: card.root, render };
}

/** One side: an inset plate with its lamp, its heading and six lines. */
function sideButton(side: "phone" | "other", heading: string) {
  const button = el("button", "save-card");
  button.type = "button";
  button.dataset["side"] = side;
  const lamp = el("i", "board-lamp");
  lamp.setAttribute("aria-hidden", "true");
  const title = el("span", "board-card-line title");
  write(title, heading);
  const lines = {
    device: line(),
    depth: line(),
    pocket: line(),
    machines: line(),
    crew: line(),
    played: line(),
  };
  button.append(lamp, title, ...Object.values(lines));
  skin(button, "inset");
  return { button, lamp, heading, ...lines };
}

function line(): HTMLSpanElement {
  return el("span", "board-card-line");
}

function fill(
  card: ReturnType<typeof sideButton>,
  side: SaveSide,
  selected: boolean,
  now: number,
): void {
  const lines = saveCardLines(side.mountain, side.lastSeen, now);
  const words = [
    side.deviceLabel,
    lines.depth,
    lines.pocket,
    lines.machines,
    lines.crew,
    lines.played,
  ] as const;
  const [device, depth, pocket, machines, crew, played] = words;
  write(card.device, device);
  write(card.depth, depth);
  write(card.pocket, pocket);
  write(card.machines, machines);
  write(card.crew, crew);
  write(card.played, played);
  // A long line ellipsizes; the button still says every word.
  setAttr(card.button, "aria-label", [card.heading, ...words].join(", "));
  mark(card.button, "is-selected", selected);
  setAttr(card.button, "aria-pressed", selected ? "true" : "false");
  frameX(card.lamp, LAMP_FRAME[selected ? "green" : "off"], LAMP_PX);
}
