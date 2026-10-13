import { formatCount, formatDuration } from "./format";
import { stonesPerSecond } from "./mountain";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { effectiveRates } from "./rates";
import {
  ENGINEER_WELCOME,
  capWords,
  restingPace,
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
  const welcomeCheer = document.createElement("p");
  welcomeCheer.className = "welcome-cheer";
  welcomeCheer.textContent =
    "Time with the people who matter is never wasted. Your crew kept the mountain moving.";
  // One-time note for saves from before machines needed helpers (#89).
  const welcomeCrew = document.createElement("p");
  welcomeCrew.className = "welcome-crew";
  const welcomeEngineer = document.createElement("p");
  welcomeEngineer.className = "welcome-engineer";
  welcomeEngineer.hidden = true;
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
    welcomeCheer,
    welcomeCrew,
    welcomeEngineer,
    welcomeContinue,
  );
  welcome.append(welcomeCard);

  const renderWelcome = (): void => {
    const report = getView().away;
    const joined = getView().crewJoined;
    const steppedUp = getView().engineerJoined === true;
    const wasOpen = !welcome.hidden;
    welcome.hidden = report === undefined && joined === undefined && !steppedUp;
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
            : "While you were away";
    welcomeMined.hidden = report === undefined;
    welcomeDetail.hidden = report === undefined;
    welcomeCheer.hidden = report === undefined;
    if (report === undefined) {
      if ((joined !== undefined || steppedUp) && !wasOpen) {
        welcomeContinue.focus();
      }
      return;
    }
    welcomeMined.textContent = `+${formatCount(report.mined)} ${report.mined === 1 ? "stone" : "stones"}`;
    const { helpers } = getView().mountain;
    const onlyHelpers = stonesPerSecond(getView().mountain) === helpers;
    const crewName = !onlyHelpers
      ? "Your crew"
      : helpers === 1
        ? "Your worker"
        : `Your ${formatCount(helpers)} workers`;
    welcomeDetail.textContent = report.capped
      ? `You were gone ${formatDuration(report.awayMs)}. ${crewName} mined for ${capWords(effectiveRates(getView().mountain).awayCapMs)}, ${restingPace(getView().mountain)}.`
      : `You were gone ${formatDuration(report.awayMs)}. ${crewName} mined the whole time, ${restingPace(getView().mountain)}.`;
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
