import {
  ENGINEER_NAMES,
  MAX_ENGINEERS,
  promote,
  promoteCost,
  station,
  type Engineer,
} from "./engineers";
import { TUNNELS, recall, send } from "./expeditions";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import {
  ENGINEER_STATIONS,
  PROMOTE_CREW_FULL,
  PROMOTE_NEEDS_WORKER,
  expeditionChip,
  postWords,
  promoteConfirm,
  promotePriceWords,
  rankHint,
  rankLabel,
  recallConfirm,
  tendingWords,
  tunnelLock,
  tunnelOffer,
} from "./screen-words";

/**
 * Engineers button (pocket row, from the first engineer) and its sheet:
 * lamps for rank, a post, and the three tunnels. A running expedition is a
 * countdown chip on the mountain and a Recall confirm in the sheet.
 */
export function createEngineersPanel({
  progress,
  getView,
  requestRender,
  iconUrl,
  chipHost,
  now = Date.now,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  requestRender: () => void;
  /** Existing worker portrait. A lamp sits on it; no new art. */
  iconUrl: string;
  /** Mountain corner. Chips sit with the boost countdowns, out of the flow. */
  chipHost: HTMLElement;
  now?: () => number;
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
  /** Row whose recall confirm is open. A post button recalls without this. */
  let recalling: number | undefined;
  const chips = Array.from({ length: MAX_ENGINEERS }, () => {
    const chip = document.createElement("p");
    chip.className = "expedition-chip";
    chip.hidden = true;
    chipHost.append(chip);
    return chip;
  });
  button.addEventListener("click", () => {
    open = true;
    confirming = false;
    recalling = undefined;
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
    const tunnels = document.createElement("div");
    tunnels.className = "engineer-tunnels";
    const tunnelChoices = TUNNELS.map((spec) => {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "engineer-tunnel";
      choice.dataset["tunnel"] = spec.id;
      choice.textContent = tunnelOffer(spec.id);
      choice.disabled = true;
      choice.addEventListener("click", () => {
        progress.applyMutation((current) =>
          send(current, index, spec.id, now()),
        );
      });
      tunnels.append(choice);
      return { button: choice, id: spec.id };
    });
    const lock = document.createElement("p");
    lock.className = "engineer-lock";
    lock.id = `engineer-lock-${String(index)}`;
    tunnels.append(lock);
    const recallButton = document.createElement("button");
    recallButton.type = "button";
    recallButton.className = "engineer-recall";
    recallButton.textContent = "Recall";
    recallButton.hidden = true;
    recallButton.addEventListener("click", () => {
      recalling = index;
      confirming = false;
      requestRender();
    });
    const recallBox = document.createElement("div");
    recallBox.className = "recall-confirm";
    recallBox.hidden = true;
    const recallLine = document.createElement("p");
    recallLine.className = "recall-line";
    const recallActions = document.createElement("div");
    recallActions.className = "recall-actions";
    const recallNo = document.createElement("button");
    recallNo.type = "button";
    recallNo.className = "recall-no";
    recallNo.textContent = "Not yet";
    const recallYes = document.createElement("button");
    recallYes.type = "button";
    recallYes.className = "recall-yes";
    recallYes.textContent = "Recall";
    recallNo.addEventListener("click", () => {
      recalling = undefined;
      requestRender();
    });
    recallYes.addEventListener("click", () => {
      recalling = undefined;
      progress.applyMutation((current) => recall(current, index));
    });
    recallActions.append(recallNo, recallYes);
    recallBox.append(recallLine, recallActions);
    item.append(head, tend, hint, posts, tunnels, recallButton, recallBox);
    list.append(item);
    return {
      item,
      name,
      lamps,
      lamp,
      post,
      tend,
      hint,
      stations,
      tunnels,
      tunnelChoices,
      lock,
      recallButton,
      recallBox,
      recallLine,
    };
  });

  const promoteButton = document.createElement("button");
  promoteButton.type = "button";
  promoteButton.className = "engineer-promote";
  promoteButton.addEventListener("click", () => {
    if (!getView().ready || !canPromote(getView())) {
      return;
    }
    confirming = true;
    recalling = undefined;
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
    recalling = undefined;
    requestRender();
    button.focus();
  };
  close.addEventListener("click", closeSheet);
  sheet.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    if (confirming || recalling !== undefined) {
      confirming = false;
      recalling = undefined;
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
      recalling = undefined;
    }
    const recalled = recalling === undefined ? undefined : engineers[recalling];
    if (recalled !== undefined && recalled.post !== "tunnel") {
      recalling = undefined;
    }
    button.hidden = engineers.length === 0;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    for (const [index, row] of rows.entries()) {
      const engineer = engineers[index];
      row.item.hidden = engineer === undefined;
      if (engineer === undefined) {
        continue;
      }
      paintEngineer(row, engineer, view.ready, {
        expeditions: current.expeditions,
        now: now(),
        recalling: recalling === index,
      });
    }
    const trips = current.expeditions ?? [];
    for (const [index, chip] of chips.entries()) {
      const trip = trips[index];
      if (trip === undefined) {
        chip.hidden = true;
        chip.textContent = "";
        continue;
      }
      chip.hidden = false;
      chip.textContent = expeditionChip(trip.engineer, trip.returnsAt - now());
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
    tunnels: HTMLDivElement;
    tunnelChoices: readonly {
      button: HTMLButtonElement;
      id: (typeof TUNNELS)[number]["id"];
    }[];
    lock: HTMLParagraphElement;
    recallButton: HTMLButtonElement;
    recallBox: HTMLDivElement;
    recallLine: HTMLParagraphElement;
  },
  engineer: Engineer,
  ready: boolean,
  trip: {
    expeditions: ProgressSnapshot["mountain"]["expeditions"];
    now: number;
    recalling: boolean;
  },
): void {
  row.item.dataset["name"] = engineer.name;
  row.name.textContent = engineer.name;
  row.lamps.setAttribute("aria-label", rankLabel(engineer.rank));
  for (const [index, lamp] of row.lamp.entries()) {
    lamp.hidden = index > engineer.rank;
  }
  row.post.textContent = postWords(engineer.post);
  const away = (trip.expeditions ?? []).find(
    (candidate) => candidate.engineer === engineer.name,
  );
  const bonus = away === undefined ? tendingWords(engineer) : undefined;
  row.tend.hidden = bonus === undefined && away === undefined;
  row.tend.textContent =
    away === undefined
      ? (bonus ?? "")
      : expeditionChip(engineer.name, away.returnsAt - trip.now);
  const hint = rankHint(engineer);
  row.hint.hidden = hint === undefined;
  row.hint.textContent = hint ?? "";
  const inTunnel = engineer.post === "tunnel";
  row.tunnels.hidden = inTunnel;
  const reason = tunnelLock(engineer.rank, "deep-dark");
  row.lock.hidden = reason === undefined;
  row.lock.textContent = reason ?? "";
  for (const choice of row.tunnelChoices) {
    const locked = tunnelLock(engineer.rank, choice.id) !== undefined;
    choice.button.disabled = !ready || locked;
    if (locked) {
      choice.button.setAttribute("aria-describedby", row.lock.id);
    } else {
      choice.button.removeAttribute("aria-describedby");
    }
  }
  row.recallButton.hidden = !inTunnel || trip.recalling;
  row.recallButton.disabled = !ready;
  row.recallBox.hidden = !trip.recalling;
  if (trip.recalling) {
    row.recallLine.textContent = recallConfirm(engineer.name);
  }
  for (const choice of row.stations) {
    const post = choice.dataset["post"];
    choice.disabled = !ready;
    choice.setAttribute(
      "aria-pressed",
      post === engineer.post ? "true" : "false",
    );
  }
}
