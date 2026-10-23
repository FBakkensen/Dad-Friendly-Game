import { buyCrew, tierLocked } from "./crew";
import { staffForBuy, staffNeeded } from "./engineers";
import { FIX_HOLD_MS } from "./hazards";
import { buyOnTap } from "./card-tap";
import { floatText, reducedMotion } from "./float-text";
import { formatCompact, formatCount } from "./format";
import { milestonePreviewLine } from "./preview";
import {
  SHEET_CARD,
  SHEET_CARD_BODY,
  SHEET_CARD_ICON,
  SHEET_CARD_LINE,
  SHEET_CARD_PRICE,
  SHEET_CARD_QUIET,
  SHEET_CARD_TITLE,
  SHEET_DEAR,
  SHEET_LOCKED,
  SHEET_READY,
  SHEET_SCROLL,
  SHEET_SHORT,
} from "./sheet-card";
import type { ProgressSnapshot, ProgressStore } from "./progress-store";
import { effectiveRates, tendingGain, type TendTier } from "./rates";
import { RELICS } from "./relics";
import {
  NEEDS_MORE_WORKERS,
  TROUBLE_FIXED,
  crewPostLabel,
  crewPostsWords,
  formatSpeed,
  percent,
  staffBillWords,
  tierPaceWords,
  troubleAria,
  troubleShout,
  stonesPerSecond,
  tendingEngineer,
  tendsNote,
  workerWords,
} from "./screen-words";
import { TIERS, owned, tierCost, tierShown, type TierId } from "./tiers";
import { tierSynergy } from "./upgrades";

/** From this many tiers on screen, cards go three to a row. */
const COMPACT_TIER_COUNT = 4;

function tendTierOf(id: TierId): TendTier | undefined {
  switch (id) {
    case "cart":
    case "drill":
    case "borer":
    case "machine":
      return id;
    case "helper":
    case "kid":
      return undefined;
  }
}

const TIER_WHY: Record<TierId, string> = {
  helper: "Another pair of hands on the rock.",
  cart: "Hauls what the crew already cut.",
  drill: "Bites the wall while you rest.",
  borer: "Chews a tunnel you can walk from.",
  machine: "The big one, with a crew of its own.",
  kid: "Mines, and teaches the others a little.",
};

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
  const postsButton = document.createElement("button");
  postsButton.type = "button";
  postsButton.className = "crew-posts";
  postsButton.hidden = true;
  const postsDetail = document.createElement("p");
  postsDetail.className = "crew-breakdown";
  postsDetail.hidden = true;
  postsButton.addEventListener("pointerdown", () => {
    postsButton.classList.add("is-pressed");
  });
  const releasePosts = (): void => {
    postsButton.classList.remove("is-pressed");
  };
  postsButton.addEventListener("pointerup", releasePosts);
  postsButton.addEventListener("pointercancel", releasePosts);
  postsButton.addEventListener("pointerleave", releasePosts);
  crewStatus.setAttribute("aria-live", "polite");
  const tierGrid = document.createElement("div");
  tierGrid.className = `tier-grid ${SHEET_SCROLL}`;
  const thanks = document.createElement("p");
  thanks.className = "trouble-thanks";
  thanks.setAttribute("aria-live", "polite");
  let thanksTimer: ReturnType<typeof setTimeout> | undefined;
  const thank = (target: HTMLElement): void => {
    thanks.textContent = TROUBLE_FIXED;
    if (thanksTimer !== undefined) {
      clearTimeout(thanksTimer);
    }
    thanksTimer = setTimeout(() => {
      thanks.textContent = "";
      thanksTimer = undefined;
    }, 1_600);
    if (reducedMotion()) {
      return;
    }
    for (let i = 0; i < 5; i += 1) {
      const bit = document.createElement("span");
      bit.className = "trouble-burst";
      bit.setAttribute("aria-hidden", "true");
      const angle = (i / 5) * Math.PI * 2;
      bit.style.setProperty(
        "--dx",
        `${String(Math.round(Math.cos(angle) * 18))}px`,
      );
      bit.style.setProperty(
        "--dy",
        `${String(Math.round(Math.sin(angle) * 14))}px`,
      );
      target.append(bit);
      setTimeout(() => {
        bit.remove();
      }, 700);
    }
  };
  const crewSpeed = (): number =>
    effectiveRates(getView().mountain, now(), getView().trouble).crewPerSecond;

  const tierCards = TIERS.map((tier) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `tier ${SHEET_CARD}`;
    card.dataset["tier"] = tier.id;
    const art = document.createElement("img");
    art.className = `tier-art ${SHEET_CARD_ICON}`;
    art.src = tierArt[tier.id];
    art.alt = "";
    art.width = 32;
    art.height = 32;
    art.draggable = false;
    const words = document.createElement("span");
    words.className = `tier-words ${SHEET_CARD_BODY}`;
    const name = document.createElement("span");
    name.className = `tier-name ${SHEET_CARD_TITLE}`;
    const cost = document.createElement("span");
    cost.className = `tier-cost ${SHEET_CARD_PRICE}`;
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
    const gainLine = document.createElement("span");
    gainLine.className = "tier-gain";
    gainLine.hidden = true;
    const needsLine = document.createElement("span");
    needsLine.className = "tier-needs";
    needsLine.hidden = true;
    const pace = document.createElement("span");
    pace.className = `tier-pace ${SHEET_CARD_LINE}`;
    pace.append(gainLine, needsLine);
    const whyLine = document.createElement("span");
    whyLine.className = `tier-why ${SHEET_CARD_LINE} ${SHEET_CARD_QUIET}`;
    whyLine.hidden = true;
    const preview = document.createElement("span");
    preview.className = "tier-preview";
    preview.hidden = true;
    words.append(name, cost, rate, pace, whyLine, preview);
    const mark = document.createElement("span");
    mark.className = "engineer-mark";
    mark.hidden = true;
    mark.setAttribute("aria-hidden", "true");
    const gain = document.createElement("span");
    gain.className = "engineer-gain";
    gain.hidden = true;
    card.append(art, words, countBadge, mark, gain);
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let suppressClick = false;
    const clearHold = (): void => {
      if (holdTimer !== undefined) {
        clearTimeout(holdTimer);
        holdTimer = undefined;
      }
    };
    card.addEventListener("pointerdown", (event) => {
      const troubled = getView().trouble;
      if (
        event.button !== 0 ||
        troubled === undefined ||
        troubled.tier !== tier.id
      ) {
        return;
      }
      clearHold();
      holdTimer = setTimeout(() => {
        holdTimer = undefined;
        suppressClick = true;
        progress.fixTrouble(troubled.tier);
        if (getView().trouble === undefined) {
          thank(card);
        }
      }, FIX_HOLD_MS);
    });
    card.addEventListener("pointerup", clearHold);
    card.addEventListener("pointercancel", clearHold);
    card.addEventListener("pointerleave", clearHold);
    buyOnTap(card, card, () => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (!getView().ready) {
        return;
      }
      const troubled = getView().trouble;
      if (troubled !== undefined && troubled.tier === tier.id) {
        progress.pressTrouble(troubled.tier);
        if (getView().trouble === undefined) {
          thank(card);
        }
        return;
      }
      const before = owned(getView().mountain, tier);
      const rateBefore = crewSpeed();
      progress.applyMutation((mountain) => buyCrew(mountain, tier.id));
      if (owned(getView().mountain, tier) > before) {
        const after = effectiveRates(
          getView().mountain,
          now(),
          getView().trouble,
        );
        // A new machine nobody can run says so, instead of promising speed.
        const added = `+${formatSpeed(after.tierSpeed[tier.id])}/s`;
        const bought = getView().mountain;
        const spareNow =
          bought.helpers +
          bought.kids -
          TIERS.reduce(
            (used, item) =>
              used + after.running[item.id] * staffNeeded(bought, item),
            0,
          );
        const bill = staffBillWords(staffForBuy(bought, tier), spareNow);
        floatText(
          card,
          after.running[tier.id] > before || bill === undefined
            ? added
            : `${added} · ${bill}`,
          "float-gain",
        );
        countCrewRate(rateBefore, crewSpeed());
      }
    });
    tierGrid.append(card);
    return {
      tier,
      card,
      name,
      costText,
      countBadge,
      rate,
      gainLine,
      needsLine,
      pace,
      whyLine,
      preview,
      costIcon,
      mark,
      gain,
    };
  });
  const crewPool = document.createElement("p");
  crewPool.className = "crew-pool";
  crewPool.textContent = "One pool of hands. Every machine draws on it.";
  crew.append(crewStatus, postsButton, postsDetail, crewPool, tierGrid, thanks);

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
    const { mountain: current, trouble } = getView();
    const rates = effectiveRates(current, now(), trouble);
    const rate = rateShown ?? rates.crewPerSecond;
    const spare =
      current.helpers +
      current.kids -
      TIERS.reduce(
        (used, tier) =>
          used + rates.running[tier.id] * staffNeeded(current, tier),
        0,
      );
    const idle = TIERS.reduce(
      (total, tier) => total + owned(current, tier) - rates.running[tier.id],
      0,
    );
    crewStatus.classList.toggle("crew-short", rates.helpersShort > 0);
    crewStatus.classList.toggle("crew-waiting", rate === 0);
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
      gainLine,
      needsLine,
      pace,
      whyLine,
      preview,
      costIcon,
      mark,
      gain,
    } of tierCards) {
      const count = owned(current, tier);
      const price = tierCost(tier, count);
      card.hidden = !tierShown(current, tier);
      const locked = tierLocked(current, tier);
      const needed = RELICS.find((relic) => relic.id === tier.needs);
      const cardTrouble =
        trouble !== undefined && trouble.tier === tier.id ? trouble : undefined;
      // A troubled card stays tappable even when the next one is unaffordable.
      card.disabled =
        !getView().ready ||
        (locked && cardTrouble === undefined) ||
        (current.pocket < price && cardTrouble === undefined);
      card.classList.toggle("tier-trouble", cardTrouble !== undefined);
      if (cardTrouble === undefined) {
        delete card.dataset["trouble"];
      } else {
        card.dataset["trouble"] = cardTrouble.kind;
      }
      card.classList.toggle("tier-locked", locked);
      costIcon.hidden = locked;
      countBadge.textContent = `×${formatCompact(count)}`;
      countBadge.hidden = count === 0;
      costText.textContent = locked ? "Locked" : formatCompact(price);
      const speed = rates.tierSpeed[tier.id];
      // Only staffed machines count; the rest show as idle.
      const running = rates.running[tier.id];
      const idleHere = count - running;
      // One more of this tier. The Great Machine's bill drops when an
      // engineer would tend it. Say so even when the ones you own still run.
      const staff = staffForBuy(current, tier);
      const needsMore = !locked && staff > 0 && spare < staff;
      const dear =
        !locked && cardTrouble === undefined && current.pocket < price;
      const ready = !locked && !needsMore && !dear && cardTrouble === undefined;
      card.classList.toggle("tier-ready", !locked && !needsMore && !dear);
      card.classList.toggle("tier-short", needsMore && !dear);
      card.classList.toggle("tier-dear", dear);
      card.classList.toggle(SHEET_READY, ready);
      card.classList.toggle(
        SHEET_SHORT,
        needsMore && !dear && cardTrouble === undefined,
      );
      card.classList.toggle(SHEET_DEAR, dear);
      card.classList.toggle(SHEET_LOCKED, locked);
      name.textContent = tier.name;
      const previewLine =
        locked || tier.id === "helper" || tier.id === "kid"
          ? undefined
          : milestonePreviewLine(count, `${tier.shortName.toLowerCase()}s`);
      preview.hidden = previewLine === undefined;
      preview.textContent = previewLine ?? "";
      if (cardTrouble !== undefined) {
        gainLine.hidden = false;
        gainLine.textContent = troubleShout(cardTrouble.kind);
        needsLine.hidden = true;
        whyLine.hidden = true;
      } else if (locked) {
        gainLine.hidden = true;
        needsLine.hidden = true;
        whyLine.hidden = true;
      } else {
        gainLine.hidden = false;
        gainLine.textContent = `+${formatSpeed(speed)}/s each`;
        const bill = staffBillWords(staff, spare);
        needsLine.hidden = bill === undefined;
        needsLine.textContent = bill ?? "";
        whyLine.hidden = false;
        whyLine.textContent = TIER_WHY[tier.id];
      }
      pace.hidden = gainLine.hidden && needsLine.hidden;
      card.classList.toggle("tier-idle", !locked && idleHere > 0);
      card.classList.toggle("tier-needs-workers", needsMore);
      const who = tendingEngineer(current.engineers, tier.id);
      mark.hidden = who === undefined;
      const tendTier = tendTierOf(tier.id);
      const gainText =
        who === undefined || tendTier === undefined
          ? ""
          : stonesPerSecond(
              tendingGain(
                current,
                (current.engineers ?? []).findIndex(
                  (engineer) => engineer.name === who.name,
                ),
                tendTier,
                now(),
                trouble,
              ),
            );
      gain.hidden = gainText === "";
      gain.textContent = gainText;
      const tends =
        who === undefined ? "" : ` ${tendsNote(who.name, tier.id)} ${gainText}`;
      // Wide cards name the synergy percent. Compact cards keep +N · total/s.
      const synergy = tierSynergy(current, tier.id);
      tierRate.textContent =
        cardTrouble !== undefined
          ? troubleShout(cardTrouble.kind)
          : locked
            ? `${needed?.name.split(" ")[0] ?? "Relic"} · ${formatCompact(needed?.depth ?? 0)}`
            : tierPaceWords({
                compact,
                speed,
                running,
                count,
                synergy,
                staff,
                spare,
              });
      card.setAttribute(
        "aria-label",
        cardTrouble !== undefined
          ? troubleAria(cardTrouble.kind, tier)
          : locked
            ? `${tier.name}, locked. Needs the ${needed?.name ?? "next relic"}, found ${formatCount(needed?.depth ?? 0)} stones down. Mines ${perSecond(speed)} each.${tends}`
            : `Buy a ${tier.name.toLowerCase()} for ${formatCount(price)} stones, mines ${perSecond(speed)}${synergy > 0 ? `, ${percent(synergy)} faster from crew synergy` : ""}. You have ${formatCount(count)}${idleHere > 0 ? `, ${formatCount(idleHere)} idle: each needs ${String(staffNeeded(current, tier))} ${workerWords(staffNeeded(current, tier))} to run` : ""}${needsMore ? `. ${NEEDS_MORE_WORKERS}` : ""}.${tends}`,
      );
    }
    const pool = current.helpers + current.kids;
    const posts = TIERS.flatMap((tier) => {
      const label = crewPostLabel(tier.id);
      if (label === undefined) {
        return [];
      }
      return [
        {
          label,
          workers: rates.running[tier.id] * staffNeeded(current, tier),
          art: tierArt[tier.id],
        },
      ];
    });
    const fullPosts = crewPostsWords(pool, spare, posts);
    postsButton.hidden = pool <= 0;
    crewPool.hidden = pool <= 0;
    // The chips on the line are the breakdown. This sentence stays shut.
    postsDetail.hidden = true;
    postsDetail.textContent = fullPosts;
    postsButton.setAttribute("aria-label", fullPosts);
    const stationBits = posts
      .filter((post) => post.workers > 0)
      .map((post) => ({
        src: post.art,
        text: `${formatCompact(post.workers)} on ${post.label}`,
      }));
    if (pool <= 0) {
      postsButton.textContent = "";
      delete postsButton.dataset["tight"];
    } else {
      const bits = [
        {
          src: tierArt.helper,
          text: `${formatCompact(pool)} ${workerWords(pool)}`,
        },
        ...stationBits,
        {
          src: tierArt.helper,
          text: `${formatCompact(Math.max(0, Math.floor(spare)))} free`,
        },
      ];
      paintRows([bits]);
      postsButton.classList.remove("is-open");
      const row = postsButton.querySelector(".crew-row");
      const contentWidth =
        row instanceof HTMLElement ? row.scrollWidth : postsButton.scrollWidth;
      const wraps =
        postsButton.isConnected &&
        postsButton.clientWidth > 0 &&
        Math.max(contentWidth, postsButton.scrollWidth) >
          postsButton.clientWidth + 1;
      if (wraps && bits.length > 2) {
        const mid = Math.ceil(bits.length / 2);
        paintRows([bits.slice(0, mid), bits.slice(mid)]);
      }
      postsButton.dataset["tight"] = "false";
      postsButton.removeAttribute("aria-expanded");
    }
  };

  const bitElement = (bit: {
    readonly src: string;
    readonly text: string;
  }): HTMLSpanElement => {
    const item = document.createElement("span");
    item.className = "crew-bit";
    const face = document.createElement("img");
    face.src = bit.src;
    face.alt = "";
    face.width = 24;
    face.height = 24;
    face.draggable = false;
    face.setAttribute("aria-hidden", "true");
    const words = document.createElement("span");
    words.textContent = bit.text;
    item.append(face, words);
    return item;
  };
  const paintRows = (
    rows: readonly (readonly {
      readonly src: string;
      readonly text: string;
    }[])[],
  ): void => {
    postsButton.replaceChildren(
      ...rows.map((bits) => {
        const row = document.createElement("span");
        row.className = "crew-row";
        row.append(...bits.map(bitElement));
        return row;
      }),
    );
  };
  const render = renderCrew;

  return { crew, tierGrid, thanks, render };
}
