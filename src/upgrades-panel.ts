import bootUrl from "./assets/boot-tile.png";
import workerUrl from "./assets/helper-miner.png";
import cartUrl from "./assets/mine-cart.png";
import pickUrl from "./assets/pick.png";
import hammerUrl from "./assets/relics/hammer.png";
import lanternUrl from "./assets/relics/lantern.png";
import shieldUrl from "./assets/relics/shield.png";
import drillUrl from "./assets/steam-drill.png";
import borerUrl from "./assets/tunnel-borer.png";
import mapUrl from "./assets/worn-map.png";
import { BOOSTS, boostCost, boostLeft, buyBoost, type BoostId } from "./boosts";
import { buyOnTap } from "./card-tap";
import { shortEffectName, writeChip } from "./effect-row";
import { formatCount } from "./format";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { effectiveRates } from "./rates";
import { LOST_TOOLS, hasLostTool, type LostToolId } from "./lost-tools";
import {
  BROUGHT_HOME,
  FOUND_LABEL,
  formatClock,
  lostToolWords,
  boostOutcome,
  buyPriceWords,
  upgradeEffectLine,
} from "./screen-words";
import {
  SHEET_CARD,
  SHEET_CARD_BODY,
  SHEET_CARD_ICON,
  SHEET_CARD_LINE,
  SHEET_CARD_PRICE,
  SHEET_CARD_QUIET,
  SHEET_CARD_TITLE,
  SHEET_DEAR,
  SHEET_HOST,
  SHEET_LOCKED,
  SHEET_READY,
  SHEET_SCROLL,
} from "./sheet-card";
import {
  UPGRADES,
  buyUpgrade,
  upgradeCost,
  upgradeLevel,
  upgradeUnlocked,
  type UpgradeId,
} from "./upgrades";

const UPGRADE_ICON: Record<UpgradeId, string> = {
  tap: hammerUrl,
  boots: bootUrl,
  steady: shieldUrl,
  cartSyn: workerUrl,
  drillSyn: cartUrl,
  borerSyn: drillUrl,
  machineSyn: borerUrl,
};

const BOOST_ICON: Record<BoostId, string> = {
  sharper: pickUrl,
  overtime: workerUrl,
};

const BOOST_WHY: Record<BoostId, string> = {
  sharper: "A short push while you are here.",
  overtime: "Twice as fast, then they rest.",
};

const UPGRADE_WHY: Record<UpgradeId, string> = {
  tap: "Each tap takes a little more.",
  boots: "The workers pick up their feet.",
  steady: "Time away pays a little more.",
  cartSyn: "Each worker makes carts 1% faster.",
  drillSyn: "Each cart makes the drills a little quicker.",
  borerSyn: "Each drill makes the borers a little quicker.",
  machineSyn: "Each borer makes the machine a little quicker.",
};

function sheetWhy(): HTMLParagraphElement {
  const why = document.createElement("p");
  why.className = `upgrade-why ${SHEET_CARD_LINE} ${SHEET_CARD_QUIET}`;
  return why;
}

function sheetHeading(title: HTMLElement, chip?: HTMLElement): HTMLDivElement {
  const heading = document.createElement("div");
  heading.className = "sheet-card-heading";
  heading.append(title);
  if (chip !== undefined) {
    heading.append(chip);
  }
  return heading;
}

const TOOL_ICON: Record<LostToolId, string> = {
  pick: hammerUrl,
  lamp: lanternUrl,
  map: mapUrl,
  boots: bootUrl,
};

function sheetIcon(src: string): HTMLImageElement {
  const icon = document.createElement("img");
  icon.className = SHEET_CARD_ICON;
  icon.src = src;
  icon.alt = "";
  icon.width = 32;
  icon.height = 32;
  icon.draggable = false;
  return icon;
}

/**
 * The Upgrades button (beside the pocket) and its sheet: quick boosts and
 * lasting upgrades. Also keeps the running-boost chips on the mountain current.
 */
export function createUpgradesPanel({
  progress,
  getView,
  now,
  upgradesUrl,
  chipFor,
  requestRender,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  now: () => number;
  upgradesUrl: string;
  /** Countdown chips on the mountain, one per boost. */
  chipFor: ReadonlyMap<BoostId, HTMLElement>;
  /** Asks the whole screen to re-render (open/close changes the page). */
  requestRender: () => void;
}): { button: HTMLButtonElement; sheet: HTMLDivElement; render: () => void } {
  // Upgrades: one compact button beside the pocket (they're bought with it),
  // opening a sheet so the main screen keeps its no-scroll budget.
  const upgradesButton = document.createElement("button");
  upgradesButton.type = "button";
  upgradesButton.className = "upgrades-button";
  upgradesButton.setAttribute("aria-label", "Upgrades");
  upgradesButton.setAttribute("aria-haspopup", "dialog");
  const upgradesIcon = document.createElement("img");
  upgradesIcon.src = upgradesUrl;
  upgradesIcon.alt = "";
  upgradesIcon.width = 32;
  upgradesIcon.height = 32;
  upgradesIcon.draggable = false;
  const upgradesLabel = document.createElement("span");
  upgradesLabel.className = "thumb-label";
  upgradesLabel.textContent = "Upgrades";
  upgradesButton.append(upgradesIcon, upgradesLabel);
  let upgradesOpen = false;
  upgradesButton.addEventListener("click", () => {
    upgradesOpen = true;
    requestRender();
  });
  const upgradesSheet = document.createElement("div");
  upgradesSheet.className = "upgrades-dialog";
  upgradesSheet.setAttribute("role", "dialog");
  upgradesSheet.setAttribute("aria-modal", "true");
  upgradesSheet.setAttribute("aria-labelledby", "upgrades-title");
  upgradesSheet.hidden = true;
  const upgradesCard = document.createElement("div");
  upgradesCard.className = "upgrades-card";
  const upgradesTitle = document.createElement("h2");
  upgradesTitle.id = "upgrades-title";
  upgradesTitle.className = "sheet-kicker";
  upgradesTitle.textContent = "Upgrades";
  const upgradesPocket = document.createElement("p");
  upgradesPocket.className = "upgrades-pocket";
  const boostHeading = document.createElement("h3");
  boostHeading.className = "upgrades-heading";
  boostHeading.textContent = "Quick boosts";
  const boostList = document.createElement("ul");
  boostList.className = "upgrade-list boost-list";
  const boostRows = BOOSTS.map((boost) => {
    const item = document.createElement("li");
    item.className = `upgrade boost ${SHEET_CARD}`;
    item.dataset["boost"] = boost.id;
    const title = document.createElement("p");
    title.className = `upgrade-name ${SHEET_CARD_TITLE}`;
    title.textContent = boost.name;
    const effect = document.createElement("p");
    effect.className = `upgrade-effect ${SHEET_CARD_LINE}`;
    effect.textContent = boost.effect;
    const buy = document.createElement("button");
    buy.type = "button";
    buy.className = `upgrade-buy ${SHEET_CARD_PRICE}`;
    const why = sheetWhy();
    why.textContent = BOOST_WHY[boost.id];
    const body = document.createElement("div");
    body.className = SHEET_CARD_BODY;
    body.append(sheetHeading(title), buy, effect, why);
    buyOnTap(item, buy, () => {
      if (!getView().ready) {
        return;
      }
      const at = now();
      progress.applyMutation((current) =>
        buyBoost({
          mountain: current,
          id: boost.id,
          now: at,
          pricing: effectiveRates(current),
        }),
      );
    });
    item.append(sheetIcon(BOOST_ICON[boost.id]), body);
    boostList.append(item);
    return { boost, effect, buy };
  });
  const lastingHeading = document.createElement("h3");
  lastingHeading.className = "upgrades-heading";
  lastingHeading.textContent = "Lasting upgrades";
  const upgradeList = document.createElement("ul");
  upgradeList.className = "upgrade-list";
  const upgradeRows = UPGRADES.map((upgrade) => {
    const item = document.createElement("li");
    item.className = `upgrade ${SHEET_CARD}`;
    item.dataset["upgrade"] = upgrade.id;
    const title = document.createElement("p");
    title.className = `upgrade-name ${SHEET_CARD_TITLE}`;
    const effect = document.createElement("p");
    effect.className = `upgrade-effect ${SHEET_CARD_LINE}`;
    effect.textContent = upgrade.perLevel;
    const buy = document.createElement("button");
    buy.type = "button";
    buy.className = `upgrade-buy ${SHEET_CARD_PRICE}`;
    const levelChip = document.createElement("span");
    levelChip.className = "sheet-level";
    levelChip.hidden = upgrade.maxLevel <= 1;
    const why = sheetWhy();
    const body = document.createElement("div");
    body.className = SHEET_CARD_BODY;
    body.append(sheetHeading(title, levelChip), buy, effect, why);
    buyOnTap(item, buy, () => {
      if (!getView().ready) {
        return;
      }
      progress.applyMutation((current) => buyUpgrade(current, upgrade.id));
    });
    item.append(sheetIcon(UPGRADE_ICON[upgrade.id]), body);
    upgradeList.append(item);
    return { upgrade, title, effect, why, levelChip, item, buy };
  });
  const foundHeading = document.createElement("h3");
  foundHeading.className = "upgrades-heading found-heading";
  foundHeading.textContent = BROUGHT_HOME;
  foundHeading.hidden = true;
  const foundList = document.createElement("ul");
  foundList.className = "upgrade-list found-list";
  foundList.hidden = true;
  const foundRows = LOST_TOOLS.map((id) => {
    const words = lostToolWords(id);
    const item = document.createElement("li");
    item.className = `upgrade found-tool ${SHEET_CARD}`;
    item.dataset["tool"] = id;
    item.hidden = true;
    const title = document.createElement("p");
    title.className = `upgrade-name ${SHEET_CARD_TITLE}`;
    title.textContent = words.name;
    const effect = document.createElement("p");
    effect.className = `upgrade-effect ${SHEET_CARD_LINE} ${SHEET_CARD_QUIET}`;
    effect.textContent = words.line;
    const status = document.createElement("p");
    status.className = `upgrade-now ${SHEET_CARD_PRICE}`;
    status.textContent = FOUND_LABEL;
    const body = document.createElement("div");
    body.className = SHEET_CARD_BODY;
    body.append(title, status, effect);
    item.append(sheetIcon(TOOL_ICON[id]), body);
    foundList.append(item);
    return { id, item };
  });
  const upgradesClose = document.createElement("button");
  upgradesClose.type = "button";
  upgradesClose.className = "upgrades-close";
  upgradesClose.textContent = "Back to the mountain";
  const closeUpgrades = (): void => {
    upgradesOpen = false;
    requestRender();
    upgradesButton.focus();
  };
  upgradesClose.addEventListener("click", closeUpgrades);
  upgradesSheet.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeUpgrades();
    }
  });
  const upgradesHost = document.createElement("div");
  upgradesHost.className = SHEET_HOST;
  const upgradesScroll = document.createElement("div");
  upgradesScroll.className = `upgrades-scroll ${SHEET_SCROLL}`;
  upgradesScroll.append(
    boostHeading,
    boostList,
    lastingHeading,
    upgradeList,
    foundHeading,
    foundList,
  );
  upgradesHost.append(upgradesScroll);
  upgradesCard.append(
    upgradesTitle,
    upgradesPocket,
    upgradesHost,
    upgradesClose,
  );
  upgradesSheet.append(upgradesCard);

  const render = (): void => {
    const view = getView();
    const current = view.mountain;
    const at = now();
    // Price from the unboosted crew. The line shows what buying pays right now.
    const pricing = effectiveRates(current);
    const live = effectiveRates(current, at);
    let anyAffordable = false;
    for (const { boost, effect, buy } of boostRows) {
      const left = boostLeft(current, boost.id, at);
      const cost = boostCost(boost, pricing);
      // Overtime shares the crew with axle grease and a blasting charge.
      // The line shows the crew you would actually have, the strongest
      // timer, so a second ×2 does not pretend to make it ×4.
      const shown =
        boost.id === "overtime"
          ? effectiveRates(
              left > 0
                ? current
                : {
                    ...current,
                    boosts: {
                      ...current.boosts,
                      overtime: at + boost.durationMs,
                    },
                  },
              at,
            )
          : live;
      effect.textContent = boostOutcome(
        boost.id,
        boost.effect,
        boost.multiplier,
        shown,
        boost.id === "overtime" || left > 0,
      );
      const affordable = left === 0 && current.pocket >= cost;
      anyAffordable ||= affordable;
      buy.disabled = !view.ready || !affordable;
      buy.textContent =
        left > 0 ? `Running · ${formatClock(left)}` : buyPriceWords(cost);
      const row = buy.closest(".upgrade");
      row?.classList.toggle("is-ready", affordable);
      row?.classList.toggle("is-dear", left === 0 && !affordable);
      row?.classList.toggle(SHEET_READY, affordable);
      row?.classList.toggle(SHEET_DEAR, left === 0 && !affordable);
      const chip = chipFor.get(boost.id);
      if (chip !== undefined) {
        writeChip(chip, {
          short: shortEffectName(boost.name),
          full: boost.name,
          multiplier: boost.multiplier,
          leftMs: left,
          active: left > 0,
        });
      }
    }
    for (const {
      upgrade,
      title,
      effect,
      why,
      levelChip,
      item,
      buy,
    } of upgradeRows) {
      const level = upgradeLevel(current, upgrade.id);
      const cost = upgradeCost(upgrade, level);
      const unlocked = upgradeUnlocked(current, upgrade);
      const affordable =
        unlocked && cost !== undefined && current.pocket >= cost;
      anyAffordable ||= affordable;
      const dear = unlocked && cost !== undefined && !affordable;
      item.classList.toggle("is-locked", !unlocked);
      item.classList.toggle("is-ready", affordable);
      item.classList.toggle("is-dear", dear);
      item.classList.toggle(SHEET_LOCKED, !unlocked);
      item.classList.toggle(SHEET_READY, affordable);
      item.classList.toggle(SHEET_DEAR, dear);
      title.textContent = upgrade.name;
      if (upgrade.maxLevel > 1) {
        levelChip.hidden = false;
        levelChip.textContent = `Lv ${String(level)}/${String(upgrade.maxLevel)}`;
      }
      effect.textContent = unlocked
        ? upgradeEffectLine(upgrade, current, at)
        : "";
      effect.hidden = !unlocked;
      why.textContent = unlocked ? UPGRADE_WHY[upgrade.id] : "";
      why.hidden = !unlocked;
      buy.disabled = !view.ready || !affordable;
      buy.textContent = !unlocked
        ? "Locked"
        : cost === undefined
          ? upgrade.maxLevel === 1
            ? "Owned"
            : "All levels bought"
          : buyPriceWords(cost);
    }
    let anyFound = false;
    for (const { id, item } of foundRows) {
      const found = hasLostTool(current, id);
      item.hidden = !found;
      anyFound ||= found;
    }
    foundHeading.hidden = !anyFound;
    foundList.hidden = !anyFound;
    upgradesPocket.textContent = `You have ${formatCount(current.pocket)} stones.`;
    upgradesButton.classList.toggle(
      "upgrades-ready",
      anyAffordable && view.ready,
    );
    upgradesButton.setAttribute(
      "aria-label",
      anyAffordable ? "Upgrades, one is affordable" : "Upgrades",
    );
    const wasOpen = !upgradesSheet.hidden;
    upgradesSheet.hidden = !upgradesOpen;
    if (upgradesOpen && !wasOpen) {
      upgradesClose.focus();
    }
  };
  return { button: upgradesButton, sheet: upgradesSheet, render };
}
