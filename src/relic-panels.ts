import { formatCount } from "./format";
import { MOUNTAIN_STONES } from "./mountain";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import {
  RELICS,
  depthHint,
  foundRelics,
  hasRelic,
  nextRelic,
  type Relic,
  type RelicId,
} from "./relics";
import { TIERS, owned } from "./tiers";

/** The relic shelf, a found relic's detail card, the relic-found card and the Legend finale. */
export function createRelicPanels({
  progress,
  getView,
  relicArt,
  requestRender,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  relicArt: Readonly<Record<RelicId, string>>;
  requestRender: () => void;
}) {
  const shelfButton = document.createElement("button");
  shelfButton.type = "button";
  shelfButton.className = "relic-shelf";
  const shelfSlots = RELICS.map((relic) => {
    const slot = document.createElement("img");
    slot.className = "shelf-slot";
    slot.src = relicArt[relic.id];
    slot.alt = "";
    slot.width = 32;
    slot.height = 32;
    slot.draggable = false;
    shelfButton.append(slot);
    return slot;
  });
  shelfButton.addEventListener("click", () => {
    shelfOpen = true;
    requestRender();
  });

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
    const art = document.createElement("img");
    art.alt = "";
    art.width = 48;
    art.height = 48;
    art.draggable = false;
    const words = document.createElement("div");
    const name = document.createElement("p");
    name.className = "shelf-name";
    const detail = document.createElement("p");
    detail.className = "shelf-detail";
    const hint = document.createElement("p");
    hint.className = "shelf-hint";
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
    shelfButton.focus();
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
    "Guidance, Protection, Building, Patience, Wisdom and Heroism: every relic of fatherhood is yours. One day you'll pass the mine to your kid.";
  const legendContinue = document.createElement("button");
  legendContinue.type = "button";
  legendContinue.className = "reveal-continue";
  legendContinue.textContent = "Stand proud on the mountain";
  legendContinue.addEventListener("click", () => {
    legendOpen = false;
    renderLegend();
  });
  legendCard.append(
    legendKicker,
    legendTitle,
    legendShelf,
    legendStats,
    legendCheer,
    legendContinue,
  );
  legend.append(legendCard);

  const renderShelf = (): void => {
    const found = foundRelics(getView().mountain).length;
    shelfButton.setAttribute(
      "aria-label",
      `Relic shelf, ${String(found)} of ${String(RELICS.length)} found`,
    );
    const guided = hasRelic(getView().mountain, "lantern");
    const next = nextRelic(getView().mountain);
    const hint = depthHint(getView().mountain);
    for (const [index, relic] of RELICS.entries()) {
      const has = hasRelic(getView().mountain, relic.id);
      const slot = shelfSlots[index];
      const row = shelfRows[index];
      if (slot === undefined || row === undefined) {
        continue;
      }
      slot.dataset["found"] = String(has);
      row.row.dataset["found"] = String(has);
      row.art.src = relicArt[relic.id];
      row.name.textContent = relic.name;
      row.detail.textContent = has
        ? `The virtue of ${relic.virtue}. Your power: ${relic.boost}`
        : relic.tease;
      if (has) {
        row.row.tabIndex = 0;
        row.row.setAttribute("role", "button");
        row.row.setAttribute("aria-label", `${relic.name}: see your power`);
      } else {
        row.row.removeAttribute("tabindex");
        row.row.removeAttribute("role");
        row.row.removeAttribute("aria-label");
      }
      const isNext = guided && relic === next && hint !== undefined;
      row.hint.hidden = !isNext;
      row.hint.textContent = isNext ? `Next · ${hint}` : "";
    }
    const detailWasOpen = !detail.hidden;
    detail.hidden = !shelfOpen || detailRelic === undefined;
    if (detailRelic !== undefined && !detail.hidden) {
      detailArt.src = relicArt[detailRelic.id];
      detailTitle.textContent = detailRelic.name;
      detailVirtue.textContent = `The virtue of ${detailRelic.virtue}.`;
      detailBoost.textContent = `Your power: ${detailRelic.boost}`;
      if (!detailWasOpen) {
        detailBack.focus();
      }
    }
    const wasOpen = !shelf.hidden;
    shelf.hidden = !shelfOpen;
    if (shelfOpen && !wasOpen) {
      shelfClose.focus();
    }
  };

  const renderReveal = (): void => {
    const relic = getView().away === undefined ? getView().revealed : undefined;
    const wasOpen = !reveal.hidden;
    reveal.hidden = relic === undefined;
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
    const wasOpen = !legend.hidden;
    legend.hidden = !legendOpen || getView().revealed !== undefined;
    if (legend.hidden) {
      return;
    }
    const crewSize = TIERS.reduce(
      (total, tier) => total + owned(getView().mountain, tier),
      0,
    );
    legendStats.textContent = `${formatCount(MOUNTAIN_STONES)} stones moved. Six relics found. A crew of ${formatCount(crewSize)} beside you.`;
    if (!wasOpen) {
      legendContinue.focus();
    }
  };

  const render = (): void => {
    renderReveal();
    renderLegend();
    renderShelf();
  };

  return { shelfButton, shelf, detail, reveal, legend, render };
}
