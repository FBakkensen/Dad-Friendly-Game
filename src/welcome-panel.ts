import { cardUp, showCard } from "./card-state";
import oreArt from "./assets/ore-lump.png";
import { formatCount, formatDuration } from "./format";
import { layerOf } from "./layers";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import {
  AWAY_CHEER,
  AWAY_MATERIALS_USE,
  ENGINEER_WELCOME,
  awayMaterialsWords,
  awayCheerWords,
  awayStretchWords,
  cameBack,
  layerWelcomeWords,
  rushHeldWords,
  workerWords,
} from "./screen-words";

/** The welcome-back card: what the crew mined while you were away, and helpers who joined. */
export function createWelcomePanel({
  progress,
  getView,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
}) {
  const welcome = document.createElement("div");
  welcome.className = "welcome-back";
  welcome.setAttribute("role", "dialog");
  welcome.setAttribute("aria-modal", "true");
  welcome.setAttribute("aria-labelledby", "welcome-back-title");
  welcome.hidden = true;
  const welcomeCard = document.createElement("div");
  welcomeCard.className = "welcome-card";
  const welcomeTitle = document.createElement("h2");
  welcomeTitle.id = "welcome-back-title";
  welcomeTitle.textContent = "While you were away";
  const welcomeMined = document.createElement("p");
  welcomeMined.className = "welcome-mined";
  const welcomeDetail = document.createElement("p");
  welcomeDetail.className = "welcome-detail";
  // The stones an hour away held for the Gold rush (#468).
  const welcomeRush = document.createElement("p");
  welcomeRush.className = "welcome-rush";
  welcomeRush.hidden = true;
  // Ore that came up while away (#247), and what it is for.
  const welcomeOre = document.createElement("div");
  welcomeOre.className = "welcome-ore";
  welcomeOre.hidden = true;
  const welcomeOreArt = document.createElement("img");
  welcomeOreArt.className = "welcome-ore-art";
  welcomeOreArt.src = oreArt;
  welcomeOreArt.alt = "";
  const welcomeOreText = document.createElement("span");
  welcomeOreText.className = "welcome-ore-text";
  const welcomeOreLine = document.createElement("span");
  welcomeOreLine.className = "welcome-ore-line";
  const welcomeOreUse = document.createElement("span");
  welcomeOreUse.className = "welcome-ore-use";
  welcomeOreUse.textContent = AWAY_MATERIALS_USE;
  welcomeOreText.append(welcomeOreLine, welcomeOreUse);
  welcomeOre.append(welcomeOreArt, welcomeOreText);
  const welcomeCheer = document.createElement("p");
  welcomeCheer.className = "welcome-cheer";
  welcomeCheer.textContent = AWAY_CHEER;
  // One-time note for saves from before machines needed helpers (#89).
  const welcomeCrew = document.createElement("p");
  welcomeCrew.className = "welcome-crew";
  const welcomeEngineer = document.createElement("p");
  welcomeEngineer.className = "welcome-engineer";
  welcomeEngineer.hidden = true;
  const welcomeReturns = document.createElement("div");
  welcomeReturns.className = "welcome-returns";
  welcomeReturns.hidden = true;
  const welcomeLayers = document.createElement("div");
  welcomeLayers.className = "welcome-layers";
  welcomeLayers.hidden = true;
  const welcomeCrafts = document.createElement("div");
  welcomeCrafts.className = "welcome-crafts";
  welcomeCrafts.hidden = true;
  const welcomeContinue = document.createElement("button");
  welcomeContinue.type = "button";
  welcomeContinue.className = "welcome-continue";
  welcomeContinue.textContent = "Back to the mountain";
  welcomeContinue.addEventListener("click", () => {
    progress.dismissAway();
  });
  welcomeCard.append(
    welcomeTitle,
    welcomeMined,
    welcomeDetail,
    welcomeRush,
    welcomeOre,
    welcomeCheer,
    welcomeCrew,
    welcomeEngineer,
    welcomeReturns,
    welcomeLayers,
    welcomeCrafts,
    welcomeContinue,
  );
  welcome.append(welcomeCard);

  const renderWelcome = (): void => {
    const view = getView();
    const report = view.away;
    const joined = view.crewJoined;
    const steppedUp = view.engineerJoined === true;
    const lines = view.homecomings.map((home) =>
      cameBack(home.engineer, home.tunnel, home.find),
    );
    fillLines(welcomeReturns, "welcome-return", lines);
    welcome.classList.toggle("is-homecoming", lines.length > 0);
    const layerLines = view.layersArrived.flatMap((layer) => {
      const line = layerWelcomeWords(layer.id);
      return line === undefined ? [] : [line];
    });
    fillLines(welcomeLayers, "welcome-layer", layerLines);
    fillLines(
      welcomeCrafts,
      "welcome-craft",
      view.craftsFitted.map((fitted) => fitted.line),
    );
    const wasOpen = cardUp(welcome);
    const news = joined !== undefined || steppedUp || lines.length > 0;
    showCard(welcome, report !== undefined || news);
    welcomeCrew.hidden = joined === undefined;
    welcomeCrew.textContent =
      joined === undefined
        ? ""
        : // Alone, the title already says "Your crew grew".
          `${report === undefined ? "" : "Your crew grew: "}${formatCount(joined)} ${workerWords(joined)} joined to run your machines.`;
    const showEngineerLine =
      steppedUp && (report !== undefined || joined !== undefined);
    welcomeEngineer.hidden = !showEngineerLine;
    welcomeEngineer.textContent = showEngineerLine ? ENGINEER_WELCOME : "";
    welcomeTitle.textContent =
      report !== undefined
        ? "While you were away"
        : joined !== undefined
          ? "Your crew grew"
          : steppedUp
            ? ENGINEER_WELCOME
            : lines.length > 0
              ? "Welcome home"
              : "While you were away";
    writeRushLine(welcomeRush, report?.heldForRush ?? 0);
    welcomeMined.hidden = report === undefined;
    welcomeDetail.hidden = report === undefined;
    welcomeCheer.hidden = report === undefined;
    const oreLine =
      report === undefined ? undefined : awayMaterialsWords(report.materials);
    welcomeOre.hidden = oreLine === undefined;
    welcomeOreLine.textContent = oreLine ?? "";
    if (report === undefined) {
      if (news && !wasOpen) {
        welcomeContinue.focus();
      }
      return;
    }
    welcomeMined.textContent = `+${formatCount(report.mined)} ${report.mined === 1 ? "stone" : "stones"}`;
    welcomeDetail.textContent = `You were gone ${formatDuration(report.awayMs)}. ${awayStretchWords(report)}`;
    welcomeCheer.textContent = awayCheerWords(
      report.awayMs,
      layerOf(view.mountain).id,
    );
    welcomeDetail.textContent +=
      report.heart > 1
        ? ` The Heart of Patience made it ×${report.heart.toFixed(2).replace(/0$/, "")}.`
        : "";
    if (!wasOpen) {
      welcomeContinue.focus();
    }
  };

  const render = renderWelcome;

  return { welcome, render };
}

/** One paragraph per line in `box`, which hides with none. */
function fillLines(
  box: HTMLElement,
  className: string,
  lines: readonly string[],
): void {
  box.replaceChildren(
    ...lines.map((line) => {
      const paragraph = document.createElement("p");
      paragraph.className = className;
      paragraph.textContent = line;
      return paragraph;
    }),
  );
  box.hidden = lines.length === 0;
}

/** The stones held for the Gold rush (#468); hidden when none were. */
function writeRushLine(line: HTMLElement, held: number): void {
  line.hidden = held === 0;
  line.textContent = held === 0 ? "" : rushHeldWords(held);
}
