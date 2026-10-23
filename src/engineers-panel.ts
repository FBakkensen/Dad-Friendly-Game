import {
  ENGINEER_NAMES,
  MAX_ENGINEERS,
  promote,
  promoteCost,
  station,
  type Engineer,
  type EngineerPost,
} from "./engineers";
import { KEEPSAKES, TUNNELS, recall, send, type TunnelId } from "./expeditions";
import type { Mountain } from "./mountain";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { tendingGain } from "./rates";
import { owned, tierById } from "./tiers";
import {
  NONE_BUILT,
  BROUGHT_HOME,
  CALL_BACK,
  ENGINEER_SHEET_SUB,
  ENGINEER_SHEET_TITLE,
  KEEP_EXPLORING,
  PROMOTE_BUTTON,
  PROMOTE_CREW_FULL,
  PROMOTE_NEEDS_WORKER,
  PROMOTE_TITLE,
  PROMOTE_WHY,
  SEND_EXPLORING,
  TEND_MACHINE,
  TEND_POSTS,
  broughtHomeNames,
  broughtHomeToast,
  callBackLabel,
  dutyLine,
  dutySentence,
  expeditionChip,
  exploreAside,
  exploreBenefit,
  exploreCheer,
  exploreTitle,
  homeCheer,
  promoteCheer,
  promoteConfirm,
  promoteNeeds,
  promoteOffer,
  stonesPerSecond,
  keepsakeWords,
  keepsakesBroughtHome,
  rankHint,
  rankLabel,
  recallConfirm,
  stationCheer,
  tendBenefit,
  tendTitle,
  tripDetail,
  tripTitle,
  tunnelLock,
  type TendPost,
} from "./screen-words";

const PRESS_MS = 160;
const GLOW_MS = 900;
const TOAST_MS = 2200;

/**
 * Engineers sheet. One open card (portrait, rank, a sentence) and, once the
 * crew grows, one-line rows for the rest. Tend and Send exploring open a
 * choice list. A tunnel shows the walk home, and a post still calls the
 * party back first.
 */
export function createEngineersPanel({
  progress,
  getView,
  requestRender,
  iconUrl,
  badgeUrl,
  chipHost,
  now = Date.now,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  requestRender: () => void;
  /** Existing worker portrait. A badge uses the machine art. No new art. */
  iconUrl: string;
  badgeUrl: Readonly<Record<Exclude<TendPost, "camp">, string>>;
  /** Mountain corner. Chips sit with the boost countdowns, out of the flow. */
  chipHost: HTMLElement;
  now?: () => number;
}): { button: HTMLButtonElement; sheet: HTMLDivElement; render: () => void } {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "engineers-button";
  button.setAttribute("aria-label", "Engineers");
  button.setAttribute("aria-haspopup", "dialog");
  const icon = document.createElement("img");
  icon.src = iconUrl;
  icon.alt = "";
  icon.width = 32;
  icon.height = 32;
  icon.draggable = false;
  const label = document.createElement("span");
  label.className = "thumb-label";
  label.textContent = "Engineers";
  button.append(icon, label);

  let open = false;
  let confirming = false;
  /** Row whose recall confirm is open. */
  let recalling: number | undefined;
  /** Which card is the big one. The rest are one line. */
  let expanded = 0;
  let menu:
    { readonly index: number; readonly kind: "tend" | "explore" } | undefined;
  let lit: number | undefined;
  let toastText = "";
  let toastOn = false;
  let toastStory = false;
  let pressedKey = "";
  let pressTimer: ReturnType<typeof setTimeout> | undefined;
  let glowTimer: ReturnType<typeof setTimeout> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

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
    menu = undefined;
    expanded = 0;
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
  const head = document.createElement("header");
  head.className = "engineers-head";
  const titles = document.createElement("div");
  const title = document.createElement("h2");
  title.id = "engineers-title";
  title.textContent = ENGINEER_SHEET_TITLE;
  const sub = document.createElement("p");
  sub.className = "engineers-sub";
  sub.textContent = ENGINEER_SHEET_SUB;
  titles.append(title, sub);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "engineers-close";
  close.textContent = "×";
  close.setAttribute("aria-label", "Back to the mountain");
  head.append(titles, close);

  const list = document.createElement("ul");
  list.className = "engineer-list";

  const arm = (key: string, target: HTMLButtonElement): void => {
    target.addEventListener("pointerdown", () => {
      if (target.disabled) {
        return;
      }
      pressedKey = key;
      requestRender();
      if (pressTimer !== undefined) {
        clearTimeout(pressTimer);
      }
      pressTimer = setTimeout(() => {
        pressedKey = "";
        pressTimer = undefined;
        requestRender();
      }, PRESS_MS);
    });
  };

  const cheer = (text: string, story = false): void => {
    toastText = text;
    toastOn = true;
    toastStory = story;
    if (toastTimer !== undefined) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      toastOn = false;
      toastStory = false;
      toastTimer = undefined;
      requestRender();
    }, TOAST_MS);
  };

  const glow = (index: number): void => {
    lit = index;
    if (glowTimer !== undefined) {
      clearTimeout(glowTimer);
    }
    glowTimer = setTimeout(() => {
      lit = undefined;
      glowTimer = undefined;
      requestRender();
    }, GLOW_MS);
  };

  const rows = Array.from({ length: MAX_ENGINEERS }, (_, index) => {
    const item = document.createElement("li");
    item.className = "engineer";
    item.hidden = true;

    const openCard = document.createElement("div");
    openCard.className = "engineer-open";
    const top = document.createElement("div");
    top.className = "engineer-top";
    const face = document.createElement("div");
    face.className = "engineer-face";
    const portrait = document.createElement("img");
    portrait.className = "engineer-portrait";
    portrait.src = iconUrl;
    portrait.alt = "";
    portrait.draggable = false;
    const badge = document.createElement("img");
    badge.className = "engineer-badge";
    badge.alt = "";
    badge.draggable = false;
    const badgeLamp = document.createElement("span");
    badgeLamp.className = "engineer-badge-lamp";
    badgeLamp.setAttribute("aria-hidden", "true");
    face.append(portrait, badge, badgeLamp);
    const who = document.createElement("div");
    const name = document.createElement("p");
    name.className = "engineer-name";
    const rank = document.createElement("p");
    rank.className = "engineer-rank";
    const lamps = document.createElement("span");
    lamps.className = "engineer-lamps";
    lamps.setAttribute("role", "img");
    const lamp = [0, 1, 2].map(() => {
      const one = document.createElement("span");
      one.className = "lamp";
      lamps.append(one);
      return one;
    });
    const rankWord = document.createElement("span");
    rankWord.className = "engineer-rank-word";
    const hint = document.createElement("span");
    hint.className = "engineer-hint";
    rank.append(lamps, rankWord, hint);
    who.append(name, rank);
    top.append(face, who);

    const doing = document.createElement("p");
    doing.className = "engineer-doing";
    const brought = document.createElement("button");
    brought.type = "button";
    brought.className = "engineer-brought";
    brought.hidden = true;
    const broughtTitle = document.createElement("span");
    broughtTitle.className = "engineer-brought-title";
    broughtTitle.textContent = BROUGHT_HOME;
    const broughtNames = document.createElement("span");
    broughtNames.className = "engineer-brought-names";
    const broughtStories = document.createElement("span");
    broughtStories.className = "engineer-brought-stories";
    const broughtStory = KEEPSAKES.map(() => {
      const slot = document.createElement("span");
      slot.className = "engineer-brought-story";
      slot.hidden = true;
      broughtStories.append(slot);
      return slot;
    });
    brought.append(broughtTitle, broughtNames, broughtStories);
    brought.addEventListener("click", () => {
      const ids = keepsakesBroughtHome(getView().mountain.finds);
      if (ids.length === 0) {
        return;
      }
      cheer(broughtHomeToast(ids), true);
      requestRender();
    });
    const trip = document.createElement("div");
    trip.className = "engineer-trip";
    const mouth = document.createElement("div");
    mouth.className = "engineer-tunnel";
    const walker = document.createElement("img");
    walker.className = "engineer-walker";
    walker.src = iconUrl;
    walker.alt = "";
    walker.draggable = false;
    mouth.append(walker);
    const tripWords = document.createElement("div");
    const tripHeading = document.createElement("p");
    tripHeading.className = "engineer-trip-title";
    const tripWhen = document.createElement("p");
    tripWhen.className = "engineer-trip-detail";
    tripWords.append(tripHeading, tripWhen);
    trip.append(mouth, tripWords);

    const acts = document.createElement("div");
    acts.className = "engineer-acts";
    const tend = document.createElement("button");
    tend.type = "button";
    tend.className = "engineer-act engineer-tend";
    tend.textContent = TEND_MACHINE;
    const explore = document.createElement("button");
    explore.type = "button";
    explore.className = "engineer-act engineer-explore";
    explore.textContent = SEND_EXPLORING;
    const recallButton = document.createElement("button");
    recallButton.type = "button";
    recallButton.className = "engineer-act engineer-recall";
    recallButton.textContent = CALL_BACK;
    acts.append(tend, explore, recallButton);
    arm(`${String(index)}:tend`, tend);
    arm(`${String(index)}:explore`, explore);
    arm(`${String(index)}:recall`, recallButton);

    const choices = document.createElement("div");
    choices.className = "engineer-choices";
    const tendList = document.createElement("div");
    tendList.className = "engineer-menu";
    tendList.dataset["menu"] = "tend";
    const stations = TEND_POSTS.map((post) => {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "engineer-choice";
      choice.dataset["post"] = post;
      const mark = document.createElement("img");
      mark.alt = "";
      mark.draggable = false;
      mark.src = post === "camp" ? iconUrl : badgeUrl[post];
      const copy = document.createElement("span");
      copy.className = "engineer-choice-copy";
      const label = document.createElement("span");
      label.className = "engineer-choice-title";
      const benefit = document.createElement("span");
      benefit.className = "engineer-choice-benefit";
      copy.append(label, benefit);
      choice.append(mark, copy);
      arm(`${String(index)}:post:${post}`, choice);
      choice.addEventListener("click", () => {
        const view = getView();
        const engineer = view.mountain.engineers?.[index];
        if (!view.ready || engineer === undefined) {
          return;
        }
        menu = undefined;
        if (engineer.post === post) {
          requestRender();
          return;
        }
        const gain =
          post === "camp"
            ? undefined
            : stonesPerSecond(
                tendingGain(view.mountain, index, post, now(), view.trouble),
              );
        cheer(stationCheer(engineer.name, post, gain), gain !== undefined);
        glow(index);
        // From a tunnel, the post calls the party back first (no find, no
        // trip), so no expedition is left without its engineer.
        progress.applyMutation((current) =>
          station(recall(current, index), index, post),
        );
      });
      tendList.append(choice);
      return { choice, label, benefit, post };
    });

    const exploreList = document.createElement("div");
    exploreList.className = "engineer-menu";
    exploreList.dataset["menu"] = "explore";
    const tunnelChoices = TUNNELS.map((spec) => {
      const choice = document.createElement("button");
      choice.type = "button";
      choice.className = "engineer-choice engineer-tunnel-choice";
      choice.dataset["tunnel"] = spec.id;
      const mark = document.createElement("span");
      mark.className = "engineer-choice-lamp";
      mark.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      copy.className = "engineer-choice-copy";
      const label = document.createElement("span");
      label.className = "engineer-choice-title";
      label.textContent = exploreTitle(spec.id);
      const benefit = document.createElement("span");
      benefit.className = "engineer-choice-benefit";
      copy.append(label, benefit);
      choice.append(mark, copy);
      arm(`${String(index)}:tunnel:${spec.id}`, choice);
      choice.addEventListener("click", () => {
        const view = getView();
        const engineer = view.mountain.engineers?.[index];
        if (
          !view.ready ||
          engineer === undefined ||
          tunnelLock(engineer.rank, spec.id) !== undefined
        ) {
          return;
        }
        menu = undefined;
        cheer(exploreCheer(engineer.name));
        glow(index);
        progress.applyMutation((current) =>
          send(current, index, spec.id, now()),
        );
      });
      exploreList.append(choice);
      return { choice, benefit, id: spec.id };
    });
    const aside = document.createElement("p");
    aside.className = "engineer-aside";
    exploreList.append(aside);
    choices.append(tendList, exploreList);

    tend.addEventListener("click", () => {
      menu =
        menu?.index === index && menu.kind === "tend"
          ? undefined
          : { index, kind: "tend" };
      requestRender();
    });
    explore.addEventListener("click", () => {
      menu =
        menu?.index === index && menu.kind === "explore"
          ? undefined
          : { index, kind: "explore" };
      requestRender();
    });
    recallButton.addEventListener("click", () => {
      recalling = index;
      confirming = false;
      menu = undefined;
      requestRender();
    });

    openCard.append(top, doing, brought, trip, acts, choices);

    const mini = document.createElement("button");
    mini.type = "button";
    mini.className = "engineer-mini";
    const miniFace = document.createElement("img");
    miniFace.className = "engineer-portrait";
    miniFace.src = iconUrl;
    miniFace.alt = "";
    miniFace.draggable = false;
    const miniName = document.createElement("span");
    miniName.className = "engineer-name";
    const miniLamps = document.createElement("span");
    miniLamps.className = "engineer-lamps";
    miniLamps.setAttribute("aria-hidden", "true");
    const miniLamp = [0, 1, 2].map(() => {
      const one = document.createElement("span");
      one.className = "lamp";
      miniLamps.append(one);
      return one;
    });
    const duty = document.createElement("span");
    duty.className = "engineer-duty";
    const more = document.createElement("span");
    more.className = "engineer-more";
    more.textContent = "›";
    more.setAttribute("aria-hidden", "true");
    mini.append(miniFace, miniName, miniLamps, duty, more);
    mini.addEventListener("click", () => {
      expanded = index;
      menu = undefined;
      requestRender();
    });

    item.append(openCard, mini);
    list.append(item);
    return {
      item,
      openCard,
      face,
      name,
      lamps,
      lamp,
      rankWord,
      hint,
      doing,
      brought,
      broughtNames,
      broughtStories,
      broughtStory,
      trip,
      tripHeading,
      tripWhen,
      tend,
      explore,
      recallButton,
      choices,
      tendList,
      stations,
      exploreList,
      tunnelChoices,
      aside,
      badge,
      badgeLamp,
      mini,
      miniName,
      miniLamp,
      duty,
    };
  });

  const promoteRow = document.createElement("div");
  promoteRow.className = "engineer-promote-row";
  const promoteMark = document.createElement("span");
  promoteMark.className = "engineer-promote-mark";
  promoteMark.textContent = "★";
  promoteMark.setAttribute("aria-hidden", "true");
  const promoteCopy = document.createElement("p");
  promoteCopy.className = "engineer-promote-copy";
  const promoteTitle = document.createElement("span");
  promoteTitle.className = "engineer-promote-title";
  promoteTitle.textContent = PROMOTE_TITLE;
  const promoteWhy = document.createElement("span");
  promoteWhy.className = "engineer-promote-why";
  promoteCopy.append(promoteTitle, promoteWhy);
  const promoteButton = document.createElement("button");
  promoteButton.type = "button";
  promoteButton.className = "engineer-act engineer-promote";
  promoteButton.textContent = PROMOTE_BUTTON;
  arm("promote", promoteButton);
  promoteButton.addEventListener("click", () => {
    if (!getView().ready || !canPromote(getView())) {
      return;
    }
    confirming = true;
    recalling = undefined;
    menu = undefined;
    requestRender();
  });
  promoteRow.append(promoteMark, promoteCopy, promoteButton);

  const modal = document.createElement("div");
  modal.className = "engineer-modal";
  modal.hidden = true;
  const confirm = document.createElement("div");
  confirm.className = "engineer-confirm";
  confirm.hidden = true;
  const confirmLine = document.createElement("p");
  confirmLine.className = "engineer-confirm-line";
  const confirmActions = document.createElement("div");
  confirmActions.className = "engineer-confirm-actions";
  const confirmNo = document.createElement("button");
  confirmNo.type = "button";
  confirmNo.className = "engineer-act engineer-confirm-no";
  confirmNo.textContent = "Not yet";
  const confirmYes = document.createElement("button");
  confirmYes.type = "button";
  confirmYes.className = "engineer-act engineer-confirm-yes";
  confirmYes.textContent = "Step up";
  confirmNo.addEventListener("click", () => {
    confirming = false;
    requestRender();
  });
  confirmYes.addEventListener("click", () => {
    const view = getView();
    confirming = false;
    menu = undefined;
    const beforeCount = view.mountain.engineers?.length ?? 0;
    // Price and a free worker can change while the confirm sits open.
    if (canPromote(view)) {
      progress.applyMutation((current) => promote(current));
    }
    const name = getView().mountain.engineers?.[beforeCount]?.name;
    if (name !== undefined) {
      expanded = beforeCount;
      cheer(promoteCheer(name));
      glow(beforeCount);
    }
    requestRender();
  });
  confirmActions.append(confirmNo, confirmYes);
  confirm.append(confirmLine, confirmActions);

  const recallBox = document.createElement("div");
  recallBox.className = "recall-confirm";
  recallBox.hidden = true;
  const recallLine = document.createElement("p");
  recallLine.className = "recall-line";
  const recallActions = document.createElement("div");
  recallActions.className = "recall-actions";
  const recallNo = document.createElement("button");
  recallNo.type = "button";
  recallNo.className = "engineer-act recall-no";
  recallNo.textContent = KEEP_EXPLORING;
  const recallYes = document.createElement("button");
  recallYes.type = "button";
  recallYes.className = "engineer-act recall-yes";
  recallYes.textContent = CALL_BACK;
  recallNo.addEventListener("click", () => {
    recalling = undefined;
    requestRender();
  });
  recallYes.addEventListener("click", () => {
    const index = recalling;
    const view = getView();
    const engineer =
      index === undefined ? undefined : view.mountain.engineers?.[index];
    recalling = undefined;
    if (index === undefined || engineer === undefined || !view.ready) {
      requestRender();
      return;
    }
    cheer(homeCheer(engineer.name));
    glow(index);
    progress.applyMutation((current) => {
      const next = recall(current, index);
      const hand = next.engineers?.[index];
      // A tunnel with no expedition has no home post to restore.
      if (hand !== undefined && hand.post === "tunnel") {
        return station(next, index, "camp");
      }
      return next;
    });
  });
  recallActions.append(recallNo, recallYes);
  recallBox.append(recallLine, recallActions);
  modal.append(confirm, recallBox);

  const toast = document.createElement("p");
  toast.className = "engineer-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");
  toast.hidden = true;

  const closeSheet = (): void => {
    open = false;
    confirming = false;
    recalling = undefined;
    menu = undefined;
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

  card.append(head, list, promoteRow);
  sheet.append(card, modal, toast);

  const render = (): void => {
    const view = getView();
    const current = view.mountain;
    const engineers = current.engineers ?? [];
    if (engineers.length === 0) {
      open = false;
      confirming = false;
      recalling = undefined;
      menu = undefined;
    }
    if (expanded >= engineers.length) {
      expanded = 0;
    }
    const recalled = recalling === undefined ? undefined : engineers[recalling];
    if (recalled !== undefined && recalled.post !== "tunnel") {
      recalling = undefined;
    }
    button.hidden = false;
    // No hand on the crew: the click would open and this render would shut it.
    button.disabled = engineers.length === 0;
    button.setAttribute("aria-expanded", open ? "true" : "false");
    sheet.classList.toggle("is-choosing", menu !== undefined);
    sheet.classList.toggle("is-packed", engineers.length >= 3);
    for (const [index, row] of rows.entries()) {
      const engineer = engineers[index];
      row.item.hidden = engineer === undefined;
      if (engineer === undefined) {
        continue;
      }
      paintEngineer(row, engineer, index, view.ready, {
        expanded: expanded === index,
        menu: menu?.index === index ? menu.kind : undefined,
        lit: lit === index,
        pressedKey,
        expeditions: current.expeditions,
        now: now(),
        badgeUrl,
        keepsakes: keepsakesBroughtHome(current.finds),
        mountain: current,
        trouble: view.trouble,
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
    const cost = promoteCost(current);
    if (!affordable) {
      confirming = false;
    }
    promoteRow.classList.toggle("is-blocked", !affordable);
    promoteButton.hidden = confirming;
    promoteButton.disabled = !view.ready || !affordable;
    promoteButton.classList.toggle("is-pressed", pressedKey === "promote");
    promoteButton.textContent =
      next === undefined ? PROMOTE_BUTTON : promoteOffer(cost);
    promoteWhy.textContent =
      next === undefined
        ? PROMOTE_CREW_FULL
        : current.helpers < 1
          ? PROMOTE_NEEDS_WORKER
          : current.pocket < cost
            ? promoteNeeds(cost)
            : PROMOTE_WHY;
    modal.hidden = !confirming && recalling === undefined;
    confirm.hidden = !confirming;
    if (confirming && next !== undefined) {
      confirmLine.textContent = promoteConfirm(next);
    }
    const recallEngineer =
      recalling === undefined ? undefined : engineers[recalling];
    recallBox.hidden = recallEngineer === undefined;
    if (recallEngineer !== undefined) {
      recallLine.textContent = recallConfirm(recallEngineer.name);
    }
    toast.hidden = !toastOn;
    toast.classList.toggle("is-shown", toastOn);
    toast.classList.toggle("is-story", toastOn && toastStory);
    toast.textContent = toastOn ? toastText : "";
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

type EngineerRow = {
  item: HTMLLIElement;
  openCard: HTMLDivElement;
  face: HTMLDivElement;
  name: HTMLParagraphElement;
  lamps: HTMLSpanElement;
  lamp: readonly HTMLSpanElement[];
  rankWord: HTMLSpanElement;
  hint: HTMLSpanElement;
  doing: HTMLParagraphElement;
  brought: HTMLButtonElement;
  broughtNames: HTMLSpanElement;
  broughtStories: HTMLSpanElement;
  broughtStory: readonly HTMLSpanElement[];
  trip: HTMLDivElement;
  tripHeading: HTMLParagraphElement;
  tripWhen: HTMLParagraphElement;
  tend: HTMLButtonElement;
  explore: HTMLButtonElement;
  recallButton: HTMLButtonElement;
  choices: HTMLDivElement;
  tendList: HTMLDivElement;
  stations: readonly {
    choice: HTMLButtonElement;
    label: HTMLSpanElement;
    benefit: HTMLSpanElement;
    post: TendPost;
  }[];
  exploreList: HTMLDivElement;
  tunnelChoices: readonly {
    choice: HTMLButtonElement;
    benefit: HTMLSpanElement;
    id: TunnelId;
  }[];
  aside: HTMLParagraphElement;
  badge: HTMLImageElement;
  badgeLamp: HTMLSpanElement;
  mini: HTMLButtonElement;
  miniName: HTMLSpanElement;
  miniLamp: readonly HTMLSpanElement[];
  duty: HTMLSpanElement;
};

function paintEngineer(
  row: EngineerRow,
  engineer: Engineer,
  index: number,
  ready: boolean,
  ui: {
    expanded: boolean;
    menu: "tend" | "explore" | undefined;
    lit: boolean;
    pressedKey: string;
    expeditions: Mountain["expeditions"];
    now: number;
    badgeUrl: Readonly<Record<Exclude<TendPost, "camp">, string>>;
    keepsakes: ReturnType<typeof keepsakesBroughtHome>;
    mountain: Mountain;
    trouble: ProgressSnapshot["trouble"];
  },
): void {
  row.item.dataset["name"] = engineer.name;
  row.item.classList.toggle("is-open", ui.expanded);
  row.item.classList.toggle("is-mini", !ui.expanded);
  row.item.classList.toggle("is-lit", ui.lit);
  row.openCard.hidden = !ui.expanded;
  row.mini.hidden = ui.expanded;
  row.name.textContent = engineer.name;
  row.miniName.textContent = engineer.name;
  row.lamps.setAttribute("aria-label", rankLabel(engineer.rank));
  for (const [lampIndex, lamp] of row.lamp.entries()) {
    lamp.classList.toggle("on", lampIndex <= engineer.rank);
  }
  for (const [lampIndex, lamp] of row.miniLamp.entries()) {
    lamp.classList.toggle("on", lampIndex <= engineer.rank);
  }
  row.rankWord.textContent = rankLabel(engineer.rank);
  const hint = rankHint(engineer);
  row.hint.hidden = hint === undefined;
  row.hint.textContent = hint ?? "";
  const away = (ui.expeditions ?? []).find(
    (candidate) => candidate.engineer === engineer.name,
  );
  const inTunnel = engineer.post === "tunnel";
  row.doing.hidden = inTunnel;
  const gainText = (post: TendPost): string | undefined =>
    post === "camp"
      ? undefined
      : owned(ui.mountain, tierById(post)) === 0
        ? NONE_BUILT
        : stonesPerSecond(
            tendingGain(ui.mountain, index, post, ui.now, ui.trouble),
          );
  const posted = machinePost(engineer.post);
  row.doing.textContent = dutySentence(
    engineer,
    posted === undefined ? undefined : gainText(posted),
  );
  const keepsakes = ui.keepsakes;
  row.brought.hidden = !ui.expanded || keepsakes.length === 0;
  if (keepsakes.length > 0) {
    row.broughtNames.textContent = broughtHomeNames(keepsakes);
  }
  for (const [slotIndex, slot] of row.broughtStory.entries()) {
    const id = keepsakes[slotIndex];
    slot.hidden = id === undefined;
    if (id !== undefined) {
      const words = keepsakeWords(id);
      slot.textContent = `${words.name}. ${words.story}`;
    }
  }
  row.trip.hidden = !inTunnel;
  if (inTunnel) {
    row.tripHeading.textContent =
      away === undefined
        ? dutySentence(engineer)
        : tripTitle(engineer.name, away.tunnel);
    row.tripWhen.textContent =
      away === undefined
        ? ""
        : tripDetail(engineer.name, away.returnsAt - ui.now);
  }
  row.duty.textContent = dutyLine(
    engineer,
    away === undefined
      ? undefined
      : { tunnel: away.tunnel, leftMs: away.returnsAt - ui.now },
  );
  const machine = machinePost(engineer.post);
  row.face.dataset["badge"] = engineer.post;
  row.badge.hidden = machine === undefined;
  row.badgeLamp.hidden = machine !== undefined;
  if (machine !== undefined) {
    row.badge.src = ui.badgeUrl[machine];
  }
  row.tend.classList.toggle(
    "is-pressed",
    ui.pressedKey === `${String(index)}:tend`,
  );
  row.tend.setAttribute("aria-pressed", ui.menu === "tend" ? "true" : "false");
  row.tend.disabled = !ready;
  row.explore.hidden = inTunnel;
  row.explore.disabled = !ready;
  row.explore.classList.toggle(
    "is-pressed",
    ui.pressedKey === `${String(index)}:explore`,
  );
  row.explore.setAttribute(
    "aria-pressed",
    ui.menu === "explore" ? "true" : "false",
  );
  row.recallButton.hidden = !inTunnel;
  row.recallButton.disabled = !ready;
  row.recallButton.textContent = callBackLabel(engineer.name);
  row.recallButton.classList.toggle(
    "is-pressed",
    ui.pressedKey === `${String(index)}:recall`,
  );
  const showTend = ui.expanded && ui.menu === "tend";
  const showExplore = ui.expanded && ui.menu === "explore" && !inTunnel;
  row.choices.hidden = !showTend && !showExplore;
  row.tendList.hidden = !showTend;
  row.exploreList.hidden = !showExplore;
  for (const station of row.stations) {
    const here = engineer.post === station.post;
    station.label.textContent = tendTitle(station.post, here);
    station.benefit.textContent = tendBenefit(
      station.post,
      engineer.name,
      gainText(station.post),
    );
    station.choice.classList.toggle("is-current", here);
    station.choice.disabled = !ready;
    station.choice.setAttribute("aria-pressed", here ? "true" : "false");
    station.choice.classList.toggle(
      "is-pressed",
      ui.pressedKey === `${String(index)}:post:${station.post}`,
    );
  }
  row.aside.textContent = exploreAside(engineer.name, engineer.post);
  for (const choice of row.tunnelChoices) {
    const reason = tunnelLock(engineer.rank, choice.id);
    const locked = reason !== undefined;
    choice.choice.disabled = !ready || locked;
    choice.choice.classList.toggle("is-locked", locked);
    choice.benefit.textContent = reason ?? exploreBenefit(choice.id);
    choice.choice.classList.toggle(
      "is-pressed",
      ui.pressedKey === `${String(index)}:tunnel:${choice.id}`,
    );
  }
}

function machinePost(
  post: EngineerPost,
): Exclude<TendPost, "camp"> | undefined {
  switch (post) {
    case "cart":
    case "drill":
    case "borer":
    case "machine":
      return post;
    case "camp":
    case "tunnel":
      return undefined;
  }
}
