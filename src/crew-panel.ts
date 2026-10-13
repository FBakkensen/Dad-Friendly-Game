import { buyCrew, tierLocked } from "./crew";
import { floatText, reducedMotion } from "./float-text";
import { formatCompact, formatCount } from "./format";
import { stonesPerSecond } from "./mountain";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { effectiveRates } from "./rates";
import { RELICS } from "./relics";
import { formatSpeed, percent, workerWords } from "./screen-words";
import { TIERS, owned, tierCost, tierShown, type TierId } from "./tiers";
import { tierSynergy } from "./upgrades";

/** From this many tiers on screen, cards go three to a row. */
const COMPACT_TIER_COUNT = 4;

const COUNT_STEPS = 8;
const COUNT_STEP_MS = 60;

function perSecond(rate: number): string {
  return rate === 1
    ? "1 stone a second"
    : `${formatCount(rate)} stones a second`;
}

/** The crew: its speed line and the tier cards you hire from. */
export function createCrewPanel({
  progress,
  getView,
  now,
  tierArt,
  stoneUrl,
}: {
  progress: ProgressStore;
  getView: () => ProgressSnapshot;
  now: () => number;
  tierArt: Readonly<Record<TierId, string>>;
  stoneUrl: string;
}) {
  const crew = document.createElement("section");
  crew.className = "crew";
  crew.setAttribute("aria-label", "Your crew");
  const crewStatus = document.createElement("p");
  crewStatus.className = "crew-status";
  crewStatus.setAttribute("aria-live", "polite");
  const tierGrid = document.createElement("div");
  tierGrid.className = "tier-grid";
  const tierCards = TIERS.map((tier) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "tier";
    card.dataset["tier"] = tier.id;
    const art = document.createElement("img");
    art.className = "tier-art";
    art.src = tierArt[tier.id];
    art.alt = "";
    art.width = 32;
    art.height = 32;
    art.draggable = false;
    const words = document.createElement("span");
    words.className = "tier-words";
    const name = document.createElement("span");
    name.className = "tier-name";
    const cost = document.createElement("span");
    cost.className = "tier-cost";
    const costIcon = document.createElement("img");
    costIcon.className = "tier-cost-icon";
    costIcon.src = stoneUrl;
    costIcon.alt = "";
    costIcon.width = 14;
    costIcon.height = 14;
    const costText = document.createElement("span");
    cost.append(costIcon, costText);
    // The count is a corner badge so a growing number never wraps the card.
    const countBadge = document.createElement("span");
    countBadge.className = "tier-count";
    countBadge.setAttribute("aria-hidden", "true");
    const rate = document.createElement("span");
    rate.className = "tier-rate";
    words.append(name, cost, rate);
    card.append(art, words, countBadge);
    card.addEventListener("click", () => {
      if (!getView().ready) {
        return;
      }
      const before = owned(getView().mountain, tier);
      const rateBefore = stonesPerSecond(getView().mountain, now());
      progress.applyMutation((mountain) => buyCrew(mountain, tier.id));
      if (owned(getView().mountain, tier) > before) {
        const after = effectiveRates(getView().mountain);
        // A new machine nobody can run says so, instead of promising speed.
        floatText(
          card,
          after.running[tier.id] > before
            ? `+${formatSpeed(after.tierSpeed[tier.id])}/s`
            : "Needs workers",
          "float-gain",
        );
        countCrewRate(rateBefore, stonesPerSecond(getView().mountain, now()));
      }
    });
    tierGrid.append(card);
    return { tier, card, name, costText, countBadge, rate, costIcon };
  });
  crew.append(crewStatus, tierGrid);

  /** The crew line counts up to the new rate after a purchase. */
  let rateShown: number | undefined;
  let countTimer: ReturnType<typeof setInterval> | undefined;
  const countCrewRate = (from: number, to: number): void => {
    if (countTimer !== undefined) {
      clearInterval(countTimer);
      countTimer = undefined;
    }
    if (reducedMotion() || to <= from) {
      rateShown = undefined;
      renderCrew();
      return;
    }
    let step = 0;
    rateShown = from;
    renderCrew();
    countTimer = setInterval(() => {
      step += 1;
      rateShown =
        step >= COUNT_STEPS
          ? undefined
          : Math.round(from + ((to - from) * step) / COUNT_STEPS);
      if (rateShown === undefined) {
        clearInterval(countTimer);
        countTimer = undefined;
      }
      renderCrew();
    }, COUNT_STEP_MS);
  };

  const renderCrew = (): void => {
    const { mountain: current } = getView();
    const rate = rateShown ?? stonesPerSecond(current, now());
    const rates = effectiveRates(current);
    const idle = TIERS.reduce(
      (total, tier) => total + owned(current, tier) - rates.running[tier.id],
      0,
    );
    crewStatus.classList.toggle("crew-short", rates.helpersShort > 0);
    crewStatus.textContent =
      rates.helpersShort > 0
        ? `${formatCompact(rate)}/s · ${formatCompact(idle)} idle, need ${formatCompact(rates.helpersShort)} ${workerWords(rates.helpersShort)}`
        : rate === 0
          ? "No crew yet. Hire a worker to mine for you."
          : rate >= 1_000
            ? // Compact once it's big, so the line never wraps on a phone.
              `Your crew mines ${formatCompact(rate)} stones/s`
            : `Your crew mines ${perSecond(rate)}`;
    const shownCount = TIERS.filter((tier) => tierShown(current, tier)).length;
    tierGrid.dataset["shown"] = String(shownCount);
    // Three to a row once there are four or more, so every tier fits in two rows.
    const compact = shownCount >= COMPACT_TIER_COUNT;
    tierGrid.classList.toggle("tier-grid-compact", compact);
    for (const {
      tier,
      card,
      name,
      costText,
      countBadge,
      rate: tierRate,
      costIcon,
    } of tierCards) {
      const count = owned(current, tier);
      const price = tierCost(tier, count);
      card.hidden = !tierShown(current, tier);
      const locked = tierLocked(current, tier);
      const needed = RELICS.find((relic) => relic.id === tier.needs);
      card.disabled = !getView().ready || locked || current.pocket < price;
      card.classList.toggle("tier-locked", locked);
      costIcon.hidden = locked;
      name.textContent = compact ? tier.shortName : tier.name;
      countBadge.textContent = `×${formatCompact(count)}`;
      countBadge.hidden = count === 0;
      costText.textContent = locked ? "Locked" : formatCompact(price);
      const speed = rates.tierSpeed[tier.id];
      // Only staffed machines count; the rest show as idle.
      const running = rates.running[tier.id];
      const idleHere = count - running;
      card.classList.toggle("tier-idle", !locked && idleHere > 0);
      // A bought crew synergy shows as "↑12%" in the rate line (just "↑" on tight cards).
      const synergy = tierSynergy(current, tier.id);
      const lift = `\u2191${String(Math.round(synergy * 100))}%`;
      tierRate.textContent = locked
        ? `${needed?.name.split(" ")[0] ?? "Relic"} · ${formatCompact(needed?.depth ?? 0)}`
        : idleHere > 0
          ? compact
            ? // Tight cards: the idle count is the news; the crew line has the speed.
              `${formatCompact(idleHere)} idle`
            : `${formatCompact(idleHere)} idle\u2009·\u2009${formatCompact(running * speed)}/s`
          : synergy > 0
            ? compact
              ? // Tight cards keep just the arrow; the sheet and label say how much.
                `\u2191\u2009${formatCompact(running * speed)}/s`
              : `+${formatSpeed(speed)} ${lift} · ${formatCompact(running * speed)}/s`
            : compact
              ? count === 0
                ? `+${formatSpeed(speed)}/s`
                : `+${formatSpeed(speed)}\u2009·\u2009${formatCompact(running * speed)}/s`
              : count === 0
                ? `+${formatSpeed(speed)}/s each`
                : // "each" drops out once the total needs four digits, so the line fits.
                  `+${formatSpeed(speed)}${running * speed < 1_000 ? " each" : ""} · ${formatCompact(running * speed)}/s`;
      card.setAttribute(
        "aria-label",
        locked
          ? `${tier.name}, locked. Needs the ${needed?.name ?? "next relic"}, found ${formatCount(needed?.depth ?? 0)} stones down. Mines ${perSecond(speed)} each.`
          : `Buy a ${tier.name.toLowerCase()} for ${formatCount(price)} stones, mines ${perSecond(speed)}${synergy > 0 ? `, ${percent(synergy)} faster from crew synergy` : ""}. You have ${formatCount(count)}${idleHere > 0 ? `, ${formatCount(idleHere)} idle: each needs ${String(tier.staff)} ${workerWords(tier.staff)} to run` : ""}.`,
      );
    }
  };

  const render = renderCrew;

  return { crew, render };
}
