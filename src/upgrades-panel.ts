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
import stoneUrl from "./assets/stone.png";
import upgradesIconUrl from "./assets/upgrades-icon.png";
import { setAffordGlow } from "./afford-glow";
import { HOW_IT_WORKS } from "./how-it-works";
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
  UPGRADES_INTRO,
  UPGRADES_MORE,
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
import { markAllSeen, showsDot } from "./teach";
import {
  clearNewCard,
  createHowCard,
  createInfoButton,
  markNewCard,
  setTeachDot,
} from "./teach-ui";
import {
  anyHiddenRow,
  boostRowId,
  boostShown,
  shownRows,
  upgradeRowId,
  upgradeShown,
  type RevealRowId,
} from "./upgrade-reveal";
import {
  UPGRADES,
  buyUpgrade,
  upgradeCost,
  upgradeLevel,
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
    // Rows he has had in front of him stay, even after the pocket dips.
    progress.applyMutation((current) =>
      markAllSeen(current, shownRows(current)),
    );
    requestRender();
  });
  const upgradesSheet = document.createElement("div");
  upgradesSheet.className = "upgrades-dialog";
  upgradesSheet.setAttribute("role", "dialog");
  upgradesSheet.setAttribute("aria-modal", "true");
  upgradesSheet.setAttribute("aria-labelledby", "upgrades-title");
  upgradesSheet.hidden = true;
  const upgradesCard = document.createElement("div");
  upgradesCard.className = "upgrades-card sheet-frame";
  const upgradesTitle = document.createElement("h2");
  upgradesTitle.id = "upgrades-title";
  upgradesTitle.className = "label";
  upgradesTitle.textContent = "Upgrades";
  // The same head as the Workshop: title left, "i" right (#282).
  let howOpen = false;
  const info = createInfoButton("Upgrades and boosts", () => {
    howOpen = true;
    requestRender();
  });
  const upgradesHead = document.createElement("div");
  upgradesHead.className = "workshop-head upgrades-head";
  const headTools = document.createElement("div");
  headTools.className = "workshop-head-tools";
  headTools.append(info);
  upgradesHead.append(upgradesTitle, headTools);
  const HOW_ART: Readonly<Record<string, string>> = {
    "upgrades-icon": upgradesIconUrl,
    "helper-miner": workerUrl,
    pick: pickUrl,
    stone: stoneUrl,
  };
  const howCards = (["upgrades", "boosts"] as const).map((system) => {
    const copy = HOW_IT_WORKS[system];
    const made = createHowCard(
      `How it works · ${copy.title}`,
      copy.steps.map(
        ([art, text]) => [HOW_ART[art] ?? stoneUrl, text] as const,
      ),
      "Back to Upgrades",
      () => {
        howOpen = false;
        requestRender();
        info.focus();
      },
    );
    made.dataset["how"] = system;
    return made;
  });
  // One way back, under the boosts card.
  const firstBack = howCards[0]?.querySelector("button");
  if (firstBack) {
    firstBack.hidden = true;
  }
  const howHost = document.createElement("div");
  howHost.className = "upgrades-how";
  howHost.hidden = true;
  howHost.append(...howCards);
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
        markAllSeen(
          buyBoost({
            mountain: current,
            id: boost.id,
            now: at,
            pricing: effectiveRates(current),
          }),
          shownRows(current),
        ),
      );
    });
    item.append(sheetIcon(BOOST_ICON[boost.id]), body);
    boostList.append(item);
    return { boost, effect, buy, item, id: boostRowId(boost) };
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
      progress.applyMutation((current) =>
        markAllSeen(buyUpgrade(current, upgrade.id), shownRows(current)),
      );
    });
    item.append(sheetIcon(UPGRADE_ICON[upgrade.id]), body);
    upgradeList.append(item);
    return {
      upgrade,
      title,
      effect,
      why,
      levelChip,
      item,
      buy,
      id: upgradeRowId(upgrade),
    };
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
    howOpen = false;
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
  const intro = document.createElement("p");
  intro.className = "teach-intro upgrades-intro";
  intro.textContent = UPGRADES_INTRO;
  intro.hidden = true;
  // The same hint card as the Workshop's dark sketch.
  const more = document.createElement("div");
  more.className = `upgrades-more ${SHEET_CARD} ${SHEET_LOCKED}`;
  const moreArt = sheetIcon(stoneUrl);
  moreArt.classList.add("shade");
  const moreBody = document.createElement("div");
  moreBody.className = SHEET_CARD_BODY;
  const moreLine = document.createElement("p");
  moreLine.className = `label hint ${SHEET_CARD_LINE} ${SHEET_CARD_QUIET}`;
  moreLine.textContent = UPGRADES_MORE;
  moreBody.append(moreLine);
  more.append(moreArt, moreBody);
  more.hidden = true;
  let newShown: RevealRowId | undefined;
  upgradesScroll.append(
    intro,
    boostHeading,
    boostList,
    lastingHeading,
    upgradeList,
    foundHeading,
    foundList,
    more,
  );
  upgradesHost.append(upgradesScroll);
  upgradesCard.append(
    upgradesHead,
    upgradesPocket,
    howHost,
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
    // The New card: the first row he has not bought yet, one he can
    // afford now if there is one. It goes to the top of the sheet.
    const fresh = [
      ...boostRows.map((row) => ({
        id: row.id,
        cost: boostCost(row.boost, pricing),
      })),
      ...upgradeRows.map((row) => ({
        id: row.id,
        cost: upgradeCost(row.upgrade, upgradeLevel(current, row.upgrade.id)),
      })),
    ].filter((row) => showsDot(current, row.id));
    const newId = (
      fresh.find(
        (row) => row.cost !== undefined && current.pocket >= row.cost,
      ) ?? fresh[0]
    )?.id;
    let boostsShowing = false;
    for (const { boost, effect, buy, item } of boostRows) {
      item.hidden = !boostShown(current, boost);
      boostsShowing ||= !item.hidden;
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
    let upgradesShowing = false;
    for (const {
      upgrade,
      title,
      effect,
      why,
      levelChip,
      item,
      buy,
    } of upgradeRows) {
      // Locked and far-off rows stay hidden until their owned count opens them (#250).
      item.hidden = !upgradeShown(current, upgrade);
      upgradesShowing ||= !item.hidden;
      const level = upgradeLevel(current, upgrade.id);
      const cost = upgradeCost(upgrade, level);
      const affordable =
        !item.hidden && cost !== undefined && current.pocket >= cost;
      anyAffordable ||= affordable;
      const dear = cost !== undefined && !affordable;
      item.classList.toggle("is-ready", affordable);
      item.classList.toggle("is-dear", dear);
      item.classList.toggle(SHEET_READY, affordable);
      item.classList.toggle(SHEET_DEAR, dear);
      title.textContent = upgrade.name;
      if (upgrade.maxLevel > 1) {
        levelChip.hidden = false;
        levelChip.textContent = `Lv ${String(level)}/${String(upgrade.maxLevel)}`;
      }
      effect.textContent = upgradeEffectLine(upgrade, current, at);
      why.textContent = UPGRADE_WHY[upgrade.id];
      buy.disabled = !view.ready || !affordable;
      buy.textContent =
        cost === undefined
          ? upgrade.maxLevel === 1
            ? "Owned"
            : "All levels bought"
          : buyPriceWords(cost);
    }
    boostHeading.hidden = !boostsShowing;
    boostList.hidden = !boostsShowing;
    lastingHeading.hidden = !upgradesShowing;
    upgradeList.hidden = !upgradesShowing;
    more.hidden = !anyHiddenRow(current);
    for (const row of [...boostRows, ...upgradeRows]) {
      if (row.id === newId) {
        markNewCard(row.item, row.buy, row.buy.textContent);
      } else {
        clearNewCard(row.item);
      }
    }
    intro.hidden = newId === undefined;
    if (newId !== newShown) {
      newShown = newId;
      const newUpgrade = upgradeRows.find((row) => row.id === newId);
      const newBoost = boostRows.find((row) => row.id === newId);
      upgradeList.append(...upgradeRows.map((row) => row.item));
      boostList.append(...boostRows.map((row) => row.item));
      if (newUpgrade !== undefined) {
        upgradeList.prepend(newUpgrade.item);
        upgradesScroll.append(
          intro,
          lastingHeading,
          upgradeList,
          boostHeading,
          boostList,
          foundHeading,
          foundList,
          more,
        );
      } else {
        if (newBoost !== undefined) {
          boostList.prepend(newBoost.item);
        }
        upgradesScroll.append(
          intro,
          boostHeading,
          boostList,
          lastingHeading,
          upgradeList,
          foundHeading,
          foundList,
          more,
        );
      }
    }
    setTeachDot(
      upgradesButton,
      [...boostRows, ...upgradeRows].some((row) => showsDot(current, row.id)),
    );
    let anyFound = false;
    for (const { id, item } of foundRows) {
      const found = hasLostTool(current, id);
      item.hidden = !found;
      anyFound ||= found;
    }
    foundHeading.hidden = !anyFound;
    foundList.hidden = !anyFound;
    upgradesPocket.textContent = `You have ${formatCount(current.pocket)} stones.`;
    setAffordGlow(upgradesButton, anyAffordable && view.ready);
    upgradesButton.setAttribute(
      "aria-label",
      anyAffordable ? "Upgrades, one is affordable" : "Upgrades",
    );
    howHost.hidden = !howOpen;
    upgradesHost.hidden = howOpen;
    upgradesPocket.hidden = howOpen;
    const wasOpen = !upgradesSheet.hidden;
    upgradesSheet.hidden = !upgradesOpen;
    if (upgradesOpen && !wasOpen) {
      upgradesClose.focus();
    }
  };
  return { button: upgradesButton, sheet: upgradesSheet, render };
}
