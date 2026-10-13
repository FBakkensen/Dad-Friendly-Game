import {
  ENGINEER_NAMES,
  MAX_ENGINEERS,
  promote,
  promoteCost,
  station,
  type Engineer,
} from "./engineers";
import { recall } from "./expeditions";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import {
  ENGINEER_STATIONS,
  PROMOTE_CREW_FULL,
  PROMOTE_NEEDS_WORKER,
  postWords,
  promoteConfirm,
  promotePriceWords,
  rankHint,
  rankLabel,
  tendingWords,
} from "./screen-words";

/**
 * Engineers button (pocket row, from the first engineer) and its sheet:
 * lamps for rank, a post, and where to send them. Side tunnels come later.
 */
export function createEngineersPanel({
  progress,
  getView,
  requestRender,
  iconUrl,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  requestRender: () => void;
  /** Existing worker portrait. A lamp sits on it; no new art. */
  iconUrl: string;
}): { button: HTMLButtonElement; sheet: HTMLDivElement; render: () => void } {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "engineers-button";
  button.setAttribute("aria-label", "Engineers");
  button.setAttribute("aria-haspopup", "dialog");
  button.hidden = true;
  const icon = document.createElement("img");
  icon.src = iconUrl;
  icon.alt = "";
  icon.width = 32;
  icon.height = 32;
  icon.draggable = false;
  button.append(icon);
  let open = false;
  let confirming = false;
  button.addEventListener("click", () => {
    open = true;
    confirming = false;
    requestRender();
  });

  const sheet = document.createElement("div");
  sheet.className = "engineers-dialog";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "engineers-title");
  sheet.hidden = true;
  const card = document.createElement("div");
  card.className = "engineers-card";
  const title = document.createElement("h2");
  title.id = "engineers-title";
  title.textContent = "Engineers";
  const list = document.createElement("ul");
  list.className = "engineer-list";

  const rows = Array.from({ length: MAX_ENGINEERS }, (_, index) => {
    const item = document.createElement("li");
    item.className = "engineer";
    item.hidden = true;
    const head = document.createElement("div");
    head.className = "engineer-head";
    const name = document.createElement("p");
    name.className = "engineer-name";
    const lamps = document.createElement("span");
    lamps.className = "engineer-lamps";
    lamps.setAttribute("role", "img");
    const lamp = [0, 1, 2].map(() => {
      const one = document.createElement("span");
      one.className = "lamp";
      lamps.append(one);
      return one;
    });
    const post = document.createElement("p");
    post.className = "engineer-post";
    head.append(name, lamps, post);
    const tend = document.createElement("p");
    tend.className = "engineer-tend";
    const hint = document.createElement("p");
    hint.className = "engineer-hint";
    const posts = document.createElement("div");
    posts.className = "engineer-posts";
    const stations = ENGINEER_STATIONS.map((stationPost) => {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "engineer-station";
      choice.dataset["post"] = stationPost.post;
      choice.textContent = stationPost.label;
      choice.addEventListener("click", () => {
        if (!getView().ready) {
          return;
        }
        // From a tunnel, a post button calls the party back first (no find,
        // no trip), so no expedition is left without its engineer.
        progress.applyMutation((current) =>
          station(recall(current, index), index, stationPost.post),
        );
      });
      posts.append(choice);
      return choice;
    });
    item.append(head, tend, hint, posts);
    list.append(item);
    return { item, name, lamps, lamp, post, tend, hint, stations };
  });

  const promoteButton = document.createElement("button");
  promoteButton.type = "button";
  promoteButton.className = "engineer-promote";
  promoteButton.addEventListener("click", () => {
    if (!getView().ready || !canPromote(getView())) {
      return;
    }
    confirming = true;
    requestRender();
  });
  const confirm = document.createElement("div");
  confirm.className = "engineer-confirm";
  confirm.hidden = true;
  const confirmLine = document.createElement("p");
  confirmLine.className = "engineer-confirm-line";
  const confirmActions = document.createElement("div");
  confirmActions.className = "engineer-confirm-actions";
  const confirmNo = document.createElement("button");
  confirmNo.type = "button";
  confirmNo.className = "engineer-confirm-no";
  confirmNo.textContent = "Not yet";
  const confirmYes = document.createElement("button");
  confirmYes.type = "button";
  confirmYes.className = "engineer-confirm-yes";
  confirmYes.textContent = "Step up";
  confirmNo.addEventListener("click", () => {
    confirming = false;
    requestRender();
  });
  confirmYes.addEventListener("click", () => {
    if (!getView().ready) {
      return;
    }
    confirming = false;
    progress.applyMutation((current) => promote(current));
  });
  confirmActions.append(confirmNo, confirmYes);
  confirm.append(confirmLine, confirmActions);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "engineers-close";
  close.textContent = "Back to the mountain";
  const closeSheet = (): void => {
    open = false;
    confirming = false;
    requestRender();
    button.focus();
  };
  close.addEventListener("click", closeSheet);
  sheet.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (confirming) {
      confirming = false;
      requestRender();
      return;
    }
    closeSheet();
  });
  card.append(title, list, promoteButton, confirm, close);
  sheet.append(card);

  const render = (): void => {
    const view = getView();
    const current = view.mountain;
    const engineers = current.engineers ?? [];
    if (engineers.length === 0) {
      open = false;
      confirming = false;
    }
    button.hidden = engineers.length === 0;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    for (const [index, row] of rows.entries()) {
      const engineer = engineers[index];
      row.item.hidden = engineer === undefined;
      if (engineer === undefined) {
        continue;
      }
      paintEngineer(row, engineer, view.ready);
    }
    const next = nextEngineerName(engineers);
    const affordable = canPromote(view);
    if (!affordable) {
      confirming = false;
    }
    promoteButton.hidden = confirming;
    promoteButton.disabled = !view.ready || !affordable;
    promoteButton.textContent =
      next === undefined
        ? PROMOTE_CREW_FULL
        : current.helpers < 1
          ? PROMOTE_NEEDS_WORKER
          : promotePriceWords(promoteCost(current));
    confirm.hidden = !confirming;
    if (confirming && next !== undefined) {
      confirmLine.textContent = promoteConfirm(next);
    }
    const wasOpen = !sheet.hidden;
    sheet.hidden = !open;
    if (open && !wasOpen) {
      close.focus();
    }
  };

  return { button, sheet, render };
}

function canPromote(view: ProgressSnapshot): boolean {
  const current = view.mountain;
  const engineers = current.engineers ?? [];
  return (
    view.ready &&
    nextEngineerName(engineers) !== undefined &&
    current.helpers >= 1 &&
    current.pocket >= promoteCost(current)
  );
}

function nextEngineerName(engineers: readonly Engineer[]): string | undefined {
  return ENGINEER_NAMES.find((name) =>
    engineers.every((engineer) => engineer.name !== name),
  );
}

function paintEngineer(
  row: {
    item: HTMLLIElement;
    name: HTMLParagraphElement;
    lamps: HTMLSpanElement;
    lamp: readonly HTMLSpanElement[];
    post: HTMLParagraphElement;
    tend: HTMLParagraphElement;
    hint: HTMLParagraphElement;
    stations: readonly HTMLButtonElement[];
  },
  engineer: Engineer,
  ready: boolean,
): void {
  row.item.dataset["name"] = engineer.name;
  row.name.textContent = engineer.name;
  row.lamps.setAttribute("aria-label", rankLabel(engineer.rank));
  for (const [index, lamp] of row.lamp.entries()) {
    lamp.hidden = index > engineer.rank;
  }
  row.post.textContent = postWords(engineer.post);
  const bonus = tendingWords(engineer);
  row.tend.hidden = bonus === undefined;
  row.tend.textContent = bonus ?? "";
  const hint = rankHint(engineer);
  row.hint.hidden = hint === undefined;
  row.hint.textContent = hint ?? "";
  for (const choice of row.stations) {
    const post = choice.dataset["post"];
    choice.disabled = !ready;
    choice.setAttribute(
      "aria-pressed",
      post === engineer.post ? "true" : "false",
    );
  }
}
