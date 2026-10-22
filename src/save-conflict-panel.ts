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
  SAVE_CONFLICT_OTHER,
  SAVE_CONFLICT_PHONE,
  SAVE_CONFLICT_PLAY,
  SAVE_CONFLICT_TITLE,
} from "./screen-words";

/** Bottom sheet for a real save split. Same markup as the mock. */
export function createSaveConflictPanel({
  progress,
  now,
  requestRender,
}: {
  progress: ProgressStore;
  now: () => number;
  requestRender: () => void;
}) {
  const root = document.createElement("div");
  root.className = "save-conflict";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  root.setAttribute("aria-labelledby", "save-conflict-title");

  const scrim = document.createElement("div");
  scrim.className = "scrim";
  const sheet = document.createElement("section");
  sheet.className = "sheet card save-conflict-sheet";

  const title = document.createElement("h2");
  title.id = "save-conflict-title";
  title.className = "label";
  title.textContent = SAVE_CONFLICT_TITLE;
  const body = document.createElement("p");
  body.className = "label save-conflict-body";
  body.textContent = SAVE_CONFLICT_BODY;

  const pair = document.createElement("div");
  pair.className = "save-pair";
  const phone = cardButton("phone", SAVE_CONFLICT_PHONE);
  const other = cardButton("other", SAVE_CONFLICT_OTHER);
  pair.append(phone.button, other.button);

  const error = document.createElement("p");
  error.className = "label save-conflict-error";
  error.hidden = true;

  const play = document.createElement("button");
  play.type = "button";
  play.className = "go save-conflict-play";
  play.textContent = SAVE_CONFLICT_PLAY;

  const confirm = document.createElement("div");
  confirm.className = "save-conflict-confirm";
  confirm.hidden = true;
  const confirmLine = document.createElement("p");
  confirmLine.className = "label";
  confirmLine.textContent = SAVE_CONFLICT_CONFIRM;
  const commit = document.createElement("button");
  commit.type = "button";
  commit.className = "go save-conflict-commit";
  commit.textContent = SAVE_CONFLICT_PLAY;
  confirm.append(confirmLine, commit);

  sheet.append(title, body, pair, error, play, confirm);
  root.append(scrim, sheet);

  let selected: "local" | "remote" = "local";
  let confirming = false;
  let seen = "";

  phone.button.addEventListener("click", () => {
    selected = "local";
    confirming = false;
    requestRender();
  });
  other.button.addEventListener("click", () => {
    selected = "remote";
    confirming = false;
    requestRender();
  });
  play.addEventListener("click", () => {
    confirming = true;
    requestRender();
  });
  commit.addEventListener("click", () => {
    void progress.chooseSave(selected);
  });

  const render = (
    conflict: SaveConflictView | undefined,
    elsewhere: boolean,
  ): void => {
    const show = conflict !== undefined && !elsewhere;
    root.hidden = !show;
    if (conflict === undefined) {
      seen = "";
      confirming = false;
      return;
    }
    const key = `${String(conflict.local.rev)}:${String(conflict.remote.rev)}:${String(minedOut(conflict.local.mountain))}:${String(minedOut(conflict.remote.mountain))}`;
    if (key !== seen) {
      seen = key;
      confirming = false;
      selected =
        minedOut(conflict.remote.mountain) > minedOut(conflict.local.mountain)
          ? "remote"
          : "local";
    }
    fill(phone, conflict.local, selected === "local", now());
    fill(other, conflict.remote, selected === "remote", now());
    error.hidden = conflict.error === undefined;
    error.textContent = conflict.error ?? "";
    play.hidden = confirming;
    confirm.hidden = !confirming;
    if (show && root.dataset["shown"] !== "1") {
      root.dataset["shown"] = "1";
      play.focus();
    } else if (!show) {
      delete root.dataset["shown"];
    }
  };

  return { root, render };
}

function cardButton(side: "phone" | "other", heading: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "save-card card";
  button.dataset["side"] = side;
  const title = document.createElement("span");
  title.className = "label title";
  title.textContent = heading;
  const device = line();
  const depth = line();
  const pocket = line();
  const machines = line();
  const crew = line();
  const played = line();
  button.append(title, device, depth, pocket, machines, crew, played);
  return { button, device, depth, pocket, machines, crew, played };
}

function line(): HTMLSpanElement {
  const span = document.createElement("span");
  span.className = "label";
  return span;
}

function fill(
  card: ReturnType<typeof cardButton>,
  side: SaveSide,
  selected: boolean,
  now: number,
): void {
  const lines = saveCardLines(side.mountain, side.lastSeen, now);
  card.device.textContent = side.deviceLabel;
  card.depth.textContent = lines.depth;
  card.pocket.textContent = lines.pocket;
  card.machines.textContent = lines.machines;
  card.crew.textContent = lines.crew;
  card.played.textContent = lines.played;
  card.button.classList.toggle("is-selected", selected);
  card.button.setAttribute("aria-pressed", selected ? "true" : "false");
}
