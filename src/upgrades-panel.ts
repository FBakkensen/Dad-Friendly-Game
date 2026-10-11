import { BOOSTS, boostCost, boostLeft, buyBoost, type BoostId } from "./boosts";
import { formatCount } from "./format";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { effectiveRates } from "./rates";
import { formatClock, unlockWords, upgradeNow } from "./screen-words";
import {
  UPGRADES,
  buyUpgrade,
  upgradeCost,
  upgradeLevel,
  upgradeUnlocked,
} from "./upgrades";

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
  upgradesButton.append(upgradesIcon);
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
  upgradesTitle.textContent = "Upgrades";
  const upgradesPocket = document.createElement("p");
  upgradesPocket.className = "upgrades-pocket";
  const boostHeading = document.createElement("h3");
  boostHeading.className = "upgrades-heading";
  boostHeading.textContent = "Quick boosts";
  const boostList = document.createElement("ul");
  boostList.className = "upgrade-list";
  const boostRows = BOOSTS.map((boost) => {
    const item = document.createElement("li");
    item.className = "upgrade boost";
    item.dataset["boost"] = boost.id;
    const title = document.createElement("p");
    title.className = "upgrade-name";
    title.textContent = boost.name;
    const effect = document.createElement("p");
    effect.className = "upgrade-effect";
    effect.textContent = boost.effect;
    const buy = document.createElement("button");
    buy.type = "button";
    buy.className = "upgrade-buy";
    buy.addEventListener("click", () => {
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
    item.append(title, effect, buy);
    boostList.append(item);
    return { boost, buy };
  });
  const lastingHeading = document.createElement("h3");
  lastingHeading.className = "upgrades-heading";
  lastingHeading.textContent = "Lasting upgrades";
  const upgradeList = document.createElement("ul");
  upgradeList.className = "upgrade-list";
  const upgradeRows = UPGRADES.map((upgrade) => {
    const item = document.createElement("li");
    item.className = "upgrade";
    item.dataset["upgrade"] = upgrade.id;
    const title = document.createElement("p");
    title.className = "upgrade-name";
    const effect = document.createElement("p");
    effect.className = "upgrade-effect";
    effect.textContent = upgrade.perLevel;
    const now = document.createElement("p");
    now.className = "upgrade-now";
    const buy = document.createElement("button");
    buy.type = "button";
    buy.className = "upgrade-buy";
    buy.addEventListener("click", () => {
      if (!getView().ready) {
        return;
      }
      progress.applyMutation((current) => buyUpgrade(current, upgrade.id));
    });
    item.append(title, effect, now, buy);
    upgradeList.append(item);
    return { upgrade, title, now, buy };
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
  upgradesCard.append(
    upgradesTitle,
    upgradesPocket,
    boostHeading,
    boostList,
    lastingHeading,
    upgradeList,
    upgradesClose,
  );
  upgradesSheet.append(upgradesCard);

  const render = (): void => {
    const view = getView();
    const current = view.mountain;
    const at = now();
    let anyAffordable = false;
    for (const { boost, buy } of boostRows) {
      const left = boostLeft(current, boost.id, at);
      const cost = boostCost(boost, effectiveRates(current));
      const affordable = left === 0 && current.pocket >= cost;
      anyAffordable ||= affordable;
      buy.disabled = !view.ready || !affordable;
      buy.textContent =
        left > 0
          ? `Running · ${formatClock(left)} left`
          : `Buy for ${formatCount(cost)} stones`;
      const chip = chipFor.get(boost.id);
      if (chip !== undefined) {
        chip.hidden = left === 0;
        chip.textContent = `${boost.name} ×${String(boost.multiplier)} · ${formatClock(left)}`;
      }
    }
    for (const { upgrade, title, now, buy } of upgradeRows) {
      const level = upgradeLevel(current, upgrade.id);
      const cost = upgradeCost(upgrade, level);
      const unlocked = upgradeUnlocked(current, upgrade);
      const affordable =
        unlocked && cost !== undefined && current.pocket >= cost;
      anyAffordable ||= affordable;
      title.textContent =
        upgrade.maxLevel === 1
          ? upgrade.name
          : `${upgrade.name} · level ${String(level)} of ${String(upgrade.maxLevel)}`;
      now.textContent = upgradeNow(upgrade, current, at);
      buy.disabled = !view.ready || !affordable;
      buy.textContent = !unlocked
        ? unlockWords(upgrade)
        : cost === undefined
          ? upgrade.maxLevel === 1
            ? "Owned"
            : "All levels bought"
          : `Buy for ${formatCount(cost)} stones`;
    }
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
