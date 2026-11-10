import { cardUp, showCard } from "./card-state";
import { shownStones } from "./scale";
import { KEEPSAKES } from "./expeditions";
import {
  SHEET_CARD,
  SHEET_CARD_BODY,
  SHEET_CARD_ICON,
  SHEET_CARD_LINE,
  SHEET_CARD_TITLE,
  SHEET_LOCKED,
  SHEET_READY,
} from "./sheet-card";
import { formatCount } from "./format";
import { MOUNTAIN_STONES } from "./mountain";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import {
  RELICS,
  depthHint,
  hasRelic,
  nextRelic,
  type Relic,
  type RelicId,
} from "./relics";
import type { Mountain } from "./mountain";
import { KEEPSAKES_TITLE, keepsakeWords } from "./screen-words";
import { TIERS, owned } from "./tiers";

/**
 * The words for one relic, shared by the shelf rows and the board's relic
 * plate so they never disagree. The hint is the guided next relic's only.
 */
export function relicNote(
  mountain: Mountain,
  relic: Relic,
): {
  readonly title: string;
  readonly line: string;
  readonly hint: string | undefined;
} {
  const hint = depthHint(mountain);
  const isNext =
    hasRelic(mountain, "lantern") &&
    relic === nextRelic(mountain) &&
    hint !== undefined;
  return {
    title: relic.name,
    line: hasRelic(mountain, relic.id)
      ? `The virtue of ${relic.virtue}. Your power: ${relic.boost}`
      : relic.tease,
    hint: isNext ? `Next · ${hint}` : undefined,
  };
}

/** The relic shelf, a found relic's detail card, the relic-found card and the Legend finale. */
export function createRelicPanels({
  progress,
  getView,
  relicArt,
  keepsakeUrl,
  onPassTheMine,
  onShelfClosed,
  requestRender,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  relicArt: Readonly<Record<RelicId, string>>;
  /** Existing treasure icon until PixelLab art is asked for. */
  keepsakeUrl: string;
  /** Opens "Pass the mine to your kid" (M6) from the Legend card. */
  onPassTheMine: () => void;
  /** Where focus goes back to when the shelf closes: the door that opened it. */
  onShelfClosed: () => void;
  requestRender: () => void;
}) {
  const openShelf = (): void => {
    shelfOpen = true;
    requestRender();
  };

  const shelf = document.createElement("div");
  shelf.className = "shelf-dialog";
  shelf.setAttribute("role", "dialog");
  shelf.setAttribute("aria-modal", "true");
  shelf.setAttribute("aria-labelledby", "shelf-title");
  shelf.hidden = true;
  const shelfCard = document.createElement("div");
  shelfCard.className = "shelf-card";
  const shelfTitle = document.createElement("h2");
  shelfTitle.id = "shelf-title";
  shelfTitle.textContent = "Legendary Relics of Fatherhood";
  const shelfList = document.createElement("ul");
  shelfList.className = "shelf-list";
  const shelfRows = RELICS.map(() => {
    const row = document.createElement("li");
    row.className = `shelf-row ${SHEET_CARD}`;
    const art = document.createElement("img");
    art.className = SHEET_CARD_ICON;
    art.alt = "";
    art.width = 48;
    art.height = 48;
    art.draggable = false;
    const words = document.createElement("div");
    words.className = SHEET_CARD_BODY;
    const name = document.createElement("p");
    name.className = `shelf-name ${SHEET_CARD_TITLE}`;
    const detail = document.createElement("p");
    detail.className = `shelf-detail ${SHEET_CARD_LINE}`;
    const hint = document.createElement("p");
    hint.className = `shelf-hint ${SHEET_CARD_LINE}`;
    words.append(name, detail, hint);
    row.append(art, words);
    shelfList.append(row);
    return { row, art, name, detail, hint };
  });
  // Found relics open a detail card with their power.
  for (const [index, { row }] of shelfRows.entries()) {
    const open = (): void => {
      const relic = RELICS[index];
      if (relic !== undefined && hasRelic(getView().mountain, relic.id)) {
        detailRelic = relic;
        requestRender();
      }
    };
    row.addEventListener("click", open);
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  }
  let detailRelic: Relic | undefined;
  const detail = document.createElement("div");
  detail.className = "relic-reveal relic-detail";
  detail.setAttribute("role", "dialog");
  detail.setAttribute("aria-modal", "true");
  detail.setAttribute("aria-labelledby", "relic-detail-title");
  detail.hidden = true;
  const detailCard = document.createElement("div");
  detailCard.className = "reveal-card";
  const detailKicker = document.createElement("p");
  detailKicker.className = "reveal-kicker";
  detailKicker.textContent = "A Legendary Relic of Fatherhood";
  const detailArt = document.createElement("img");
  detailArt.className = "reveal-art";
  detailArt.alt = "";
  detailArt.width = 64;
  detailArt.height = 64;
  detailArt.draggable = false;
  const detailTitle = document.createElement("h2");
  detailTitle.id = "relic-detail-title";
  const detailVirtue = document.createElement("p");
  detailVirtue.className = "reveal-virtue";
  const detailBoost = document.createElement("p");
  detailBoost.className = "relic-boost";
  const keepsakes = document.createElement("div");
  keepsakes.className = "keepsakes";
  keepsakes.hidden = true;
  const keepsakesTitle = document.createElement("p");
  keepsakesTitle.className = "keepsakes-title";
  keepsakesTitle.textContent = KEEPSAKES_TITLE;
  const keepsakeList = document.createElement("ul");
  keepsakeList.className = "keepsake-list";
  const keepsakeRows = KEEPSAKES.map((id) => {
    const words = keepsakeWords(id);
    const item = document.createElement("li");
    item.dataset["keepsake"] = id;
    item.hidden = true;
    const art = document.createElement("img");
    art.src = keepsakeUrl;
    art.alt = "";
    art.width = 28;
    art.height = 28;
    art.draggable = false;
    const name = document.createElement("p");
    name.className = "keepsake-name";
    name.textContent = words.name;
    const story = document.createElement("p");
    story.className = "keepsake-story";
    story.textContent = words.story;
    item.append(art, name, story);
    keepsakeList.append(item);
    return { id, item };
  });
  keepsakes.append(keepsakesTitle, keepsakeList);
  const detailBack = document.createElement("button");
  detailBack.type = "button";
  detailBack.className = "reveal-continue";
  detailBack.textContent = "Back to the shelf";
  detailBack.addEventListener("click", () => {
    detailRelic = undefined;
    requestRender();
  });
  detailCard.append(
    detailKicker,
    detailArt,
    detailTitle,
    detailVirtue,
    detailBoost,
    keepsakes,
    detailBack,
  );
  detail.append(detailCard);
  const shelfClose = document.createElement("button");
  shelfClose.type = "button";
  shelfClose.className = "shelf-close";
  shelfClose.textContent = "Back to the mountain";
  shelfClose.addEventListener("click", () => {
    shelfOpen = false;
    requestRender();
    onShelfClosed();
  });
  shelfCard.append(shelfTitle, shelfList, shelfClose);
  shelf.append(shelfCard);
  let shelfOpen = false;

  const reveal = document.createElement("div");
  reveal.className = "relic-reveal";
  reveal.setAttribute("role", "dialog");
  reveal.setAttribute("aria-modal", "true");
  reveal.setAttribute("aria-labelledby", "relic-reveal-title");
  reveal.hidden = true;
  const revealCard = document.createElement("div");
  revealCard.className = "reveal-card";
  const revealKicker = document.createElement("p");
  revealKicker.className = "reveal-kicker";
  revealKicker.textContent = "A Legendary Relic of Fatherhood";
  const revealArt = document.createElement("img");
  revealArt.className = "reveal-art";
  revealArt.alt = "";
  revealArt.width = 64;
  revealArt.height = 64;
  revealArt.draggable = false;
  const revealTitle = document.createElement("h2");
  revealTitle.id = "relic-reveal-title";
  const revealVirtue = document.createElement("p");
  revealVirtue.className = "reveal-virtue";
  const revealPower = document.createElement("p");
  revealPower.className = "reveal-power";
  const revealBoost = document.createElement("p");
  revealBoost.className = "relic-boost";
  const revealContinue = document.createElement("button");
  revealContinue.type = "button";
  revealContinue.className = "reveal-continue";
  revealContinue.textContent = "Carry it with pride";
  revealContinue.addEventListener("click", () => {
    // Closing the Mantle's card opens the finale, once per run.
    legendOpen = getView().revealed?.id === "mantle";
    progress.dismissReveal();
  });
  revealCard.append(
    revealKicker,
    revealArt,
    revealTitle,
    revealVirtue,
    revealPower,
    revealBoost,
    revealContinue,
  );
  reveal.append(revealCard);

  // Mantle of the Hero: the finale, shown after its reveal (#103).
  let legendOpen = false;
  const legend = document.createElement("div");
  legend.className = "relic-reveal legend";
  legend.setAttribute("role", "dialog");
  legend.setAttribute("aria-modal", "true");
  legend.setAttribute("aria-labelledby", "legend-title");
  legend.hidden = true;
  const legendCard = document.createElement("div");
  legendCard.className = "reveal-card legend-card";
  const legendKicker = document.createElement("p");
  legendKicker.className = "reveal-kicker";
  legendKicker.textContent = "The bottom of the mountain";
  const legendTitle = document.createElement("h2");
  legendTitle.id = "legend-title";
  legendTitle.textContent = "You became a Legend";
  const legendShelf = document.createElement("div");
  legendShelf.className = "legend-shelf";
  for (const relic of RELICS) {
    const art = document.createElement("img");
    art.src = relicArt[relic.id];
    art.alt = relic.name;
    art.width = 40;
    art.height = 40;
    art.draggable = false;
    legendShelf.append(art);
  }
  const legendStats = document.createElement("p");
  legendStats.className = "legend-stats";
  const legendCheer = document.createElement("p");
  legendCheer.className = "reveal-power";
  legendCheer.textContent =
    "Guidance, Protection, Building, Patience, Wisdom and Heroism: every relic of fatherhood is yours. Now you can pass the mine to your kid.";
  const legendContinue = document.createElement("button");
  legendContinue.type = "button";
  legendContinue.className = "reveal-continue";
  legendContinue.textContent = "Stand proud";
  legendContinue.addEventListener("click", () => {
    legendOpen = false;
    renderLegend();
  });
  const legendPass = document.createElement("button");
  legendPass.type = "button";
  legendPass.className = "legend-pass";
  legendPass.textContent = "Pass to your kid";
  legendPass.addEventListener("click", () => {
    legendOpen = false;
    onPassTheMine();
  });
  // Side by side, so the finale still fits a short phone.
  const legendActions = document.createElement("div");
  legendActions.className = "legend-actions";
  legendActions.append(legendContinue, legendPass);
  legendCard.append(
    legendKicker,
    legendTitle,
    legendShelf,
    legendStats,
    legendCheer,
    legendActions,
  );
  legend.append(legendCard);

  const renderShelf = (): void => {
    for (const [index, relic] of RELICS.entries()) {
      const has = hasRelic(getView().mountain, relic.id);
      const row = shelfRows[index];
      if (row === undefined) {
        continue;
      }
      row.row.dataset["found"] = String(has);
      row.row.classList.toggle(SHEET_READY, has);
      row.row.classList.toggle(SHEET_LOCKED, !has);
      row.art.src = relicArt[relic.id];
      const words = relicNote(getView().mountain, relic);
      row.name.textContent = words.title;
      row.detail.textContent = words.line;
      if (has) {
        row.row.tabIndex = 0;
        row.row.setAttribute("role", "button");
        row.row.setAttribute("aria-label", `${relic.name}: see your power`);
      } else {
        row.row.removeAttribute("tabindex");
        row.row.removeAttribute("role");
        row.row.removeAttribute("aria-label");
      }
      row.hint.hidden = words.hint === undefined;
      row.hint.textContent = words.hint ?? "";
    }
    const detailWasOpen = cardUp(detail);
    showCard(detail, shelfOpen && detailRelic !== undefined);
    if (detailRelic !== undefined && cardUp(detail)) {
      detailArt.src = relicArt[detailRelic.id];
      detailTitle.textContent = detailRelic.name;
      detailVirtue.textContent = `The virtue of ${detailRelic.virtue}.`;
      detailBoost.textContent = `Your power: ${detailRelic.boost}`;
      const shelf = getView().mountain.finds ?? [];
      let anyKeepsake = false;
      for (const { id, item } of keepsakeRows) {
        const found = shelf.includes(id);
        item.hidden = !found;
        anyKeepsake ||= found;
      }
      keepsakes.hidden = !anyKeepsake;
      if (!detailWasOpen) {
        detailBack.focus();
      }
    }
    const wasOpen = cardUp(shelf);
    showCard(shelf, shelfOpen);
    if (shelfOpen && !wasOpen) {
      shelfClose.focus({ preventScroll: true });
    }
  };

  const renderReveal = (): void => {
    const relic = getView().away === undefined ? getView().revealed : undefined;
    const wasOpen = cardUp(reveal);
    showCard(reveal, relic !== undefined);
    if (relic === undefined) {
      return;
    }
    revealArt.src = relicArt[relic.id];
    revealTitle.textContent = `You found the ${relic.name}`;
    revealVirtue.textContent = `The virtue of ${relic.virtue}.`;
    revealPower.textContent = relic.power;
    revealBoost.textContent = `Your power: ${relic.boost}`;
    if (!wasOpen) {
      revealContinue.focus();
    }
  };

  const renderLegend = (): void => {
    const wasOpen = cardUp(legend);
    showCard(legend, legendOpen && getView().revealed === undefined);
    if (!cardUp(legend)) {
      return;
    }
    const crewSize = TIERS.reduce(
      (total, tier) => total + owned(getView().mountain, tier),
      0,
    );
    legendStats.textContent = `${formatCount(shownStones(getView().mountain, MOUNTAIN_STONES))} stones moved. Six relics found. A crew of ${formatCount(crewSize)} beside you.`;
    if (!wasOpen) {
      legendContinue.focus();
    }
  };

  const render = (): void => {
    renderReveal();
    renderLegend();
    renderShelf();
  };

  return { openShelf, shelf, detail, reveal, legend, render };
}
