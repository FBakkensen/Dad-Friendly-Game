import {
  BOOSTS,
  boostCost,
  boostLeft,
  type Boost,
  type BoostId,
} from "./boosts";
import { formatCompact, formatCount } from "./format";
import { hasLostTool, type LostToolId } from "./lost-tools";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import type { RowView } from "./row-view";
import { oneOffStretch, stretch } from "./scale";
import {
  FOUND_LABEL,
  boostOutcome,
  formatClock,
  lostToolWords,
  upgradeEffectLine,
  upgradeWhyLine,
} from "./screen-words";
import { showsDot } from "./teach";
import {
  boostRowId,
  boostShown,
  upgradeRowId,
  upgradeShown,
  type RevealRowId,
} from "./upgrade-reveal";
import { UPGRADES, upgradeCost, upgradeLevel, type Upgrade } from "./upgrades";

/** An Upgrades row (#373), and whether it shows. */
export type UpgradeRowView = RowView & { readonly shown: boolean };

/** Each boost's quiet line: why it is worth it, never the effect again. */
export const BOOST_WHY: Readonly<Record<BoostId, string>> = {
  sharper: "A short push while you are here.",
  overtime: "Twice as fast, then they rest.",
};

/** Priced from the unboosted crew, as `buyBoost` prices it. */
function boostPrice(mountain: Mountain, boost: Boost): number {
  return boostCost(boost, effectiveRates(mountain), stretch(mountain));
}

/** The next level's price, or undefined once every level is bought. */
function upgradePrice(
  mountain: Mountain,
  upgrade: Upgrade,
): number | undefined {
  return upgradeCost(
    upgrade,
    upgradeLevel(mountain, upgrade.id),
    oneOffStretch(mountain),
  );
}

/**
 * What buying a boost does right now. Overtime shares the crew with axle
 * grease and a blasting charge. The line shows the crew you would actually
 * have, the strongest timer, so a second ×2 does not pretend to make it ×4.
 */
export function boostInfo(
  mountain: Mountain,
  now: number,
  boost: Boost,
): string {
  const left = boostLeft(mountain, boost.id, now);
  const rates =
    boost.id === "overtime" && left === 0
      ? effectiveRates(
          {
            ...mountain,
            boosts: { ...mountain.boosts, overtime: now + boost.durationMs },
          },
          now,
        )
      : effectiveRates(mountain, now);
  return boostOutcome(
    boost.id,
    boost.effect,
    boost.multiplier,
    rates,
    boost.id === "overtime" || left > 0,
  );
}

/** "Name. Effect. Then the rest": the effect lines already end a sentence. */
function rowAria(name: string, info: string, tail: string): string {
  return `${name}. ${info} ${tail}`;
}

/** The words, lamp and state of a row with a price and a Buy. */
function buyFace(
  pocket: number,
  cost: number,
): Pick<RowView, "state" | "price" | "dimTag" | "verb" | "lamp" | "can"> {
  const can = pocket >= cost;
  return {
    state: can ? "ready" : "dear",
    price: formatCompact(cost),
    dimTag: !can,
    verb: "Buy",
    lamp: can ? "green" : "off",
    can,
  };
}

const NEW_FLAG: readonly string[] = ["New"];
const NO_FLAG: readonly string[] = [];

/**
 * A quick boost's row. Display only: it reads the mountain and never buys.
 * Running, it shows its clock and cannot be bought again.
 */
export function boostRowView(
  mountain: Mountain,
  now: number,
  boost: Boost,
  isNew: boolean,
): UpgradeRowView {
  const left = boostLeft(mountain, boost.id, now);
  const cost = boostPrice(mountain, boost);
  const info = boostInfo(mountain, now, boost);
  const clock = formatClock(left);
  const face =
    left > 0
      ? {
          state: "running" as const,
          price: clock,
          dimTag: false,
          verb: "Running",
          lamp: "off" as const,
          can: false,
        }
      : buyFace(mountain.pocket, cost);
  return {
    name: boost.name,
    badge: "",
    info: [info],
    need: "",
    why: BOOST_WHY[boost.id],
    flag: isNew ? NEW_FLAG : NO_FLAG,
    gain: "",
    ...face,
    pick: false,
    aria: rowAria(
      boost.name,
      info,
      left > 0
        ? `Running, ${clock} left`
        : `Buy for ${formatCount(cost)} stones`,
    ),
    shown: boostShown(mountain, boost),
  };
}

/**
 * A lasting upgrade's row: its level, #324's before-and-after line (the
 * line is the gain) and the why line. Bought out, it reads Owned.
 */
export function upgradeRowView(
  mountain: Mountain,
  now: number,
  upgrade: Upgrade,
  isNew: boolean,
): UpgradeRowView {
  const level = upgradeLevel(mountain, upgrade.id);
  const cost = upgradePrice(mountain, upgrade);
  const info = upgradeEffectLine(upgrade, mountain, now);
  const face =
    cost === undefined
      ? {
          state: "owned" as const,
          price: "Owned",
          dimTag: true,
          verb: "",
          lamp: "off" as const,
          can: false,
        }
      : buyFace(mountain.pocket, cost);
  return {
    name: upgrade.name,
    badge:
      upgrade.maxLevel > 1
        ? `Lv ${String(level)}/${String(upgrade.maxLevel)}`
        : "",
    info: [info],
    need: "",
    why: upgradeWhyLine(upgrade, mountain, now),
    flag: isNew ? NEW_FLAG : NO_FLAG,
    gain: "",
    ...face,
    pick: false,
    aria: rowAria(
      upgrade.name,
      info,
      cost === undefined ? "Owned" : `Buy for ${formatCount(cost)} stones`,
    ),
    shown: upgradeShown(mountain, upgrade),
  };
}

/** A lost tool brought home: kept for good, nothing to buy. */
export function toolRowView(
  mountain: Mountain,
  id: LostToolId,
): UpgradeRowView {
  const { name, line } = lostToolWords(id);
  return {
    name,
    badge: "",
    info: [line],
    need: "",
    why: "",
    flag: NO_FLAG,
    gain: "",
    price: FOUND_LABEL,
    dimTag: false,
    verb: "",
    lamp: "green",
    state: "found",
    pick: false,
    can: false,
    aria: rowAria(name, line, FOUND_LABEL),
    shown: hasLostTool(mountain, id),
  };
}

/** Every boost and upgrade row: its id, price now, and whether it shows. */
function priced(
  mountain: Mountain,
  now: number,
): readonly {
  readonly id: RevealRowId;
  readonly shown: boolean;
  readonly can: boolean;
}[] {
  return [
    ...BOOSTS.map((boost) => ({
      id: boostRowId(boost),
      shown: boostShown(mountain, boost),
      can:
        boostLeft(mountain, boost.id, now) === 0 &&
        mountain.pocket >= boostPrice(mountain, boost),
    })),
    ...UPGRADES.map((upgrade) => {
      const cost = upgradePrice(mountain, upgrade);
      return {
        id: upgradeRowId(upgrade),
        shown: upgradeShown(mountain, upgrade),
        can: cost !== undefined && mountain.pocket >= cost,
      };
    }),
  ];
}

/**
 * The New row: the first row with a dot that he can afford, else the first
 * with a dot. A dotted row was never bought, so it is never running.
 */
export function newRowId(
  mountain: Mountain,
  now: number,
): RevealRowId | undefined {
  const fresh = priced(mountain, now).filter((row) =>
    showsDot(mountain, row.id),
  );
  return (fresh.find((row) => row.can) ?? fresh[0])?.id;
}

/** Any shown, idle boost or shown upgrade the pocket covers. */
export function anyUpgradeAffordable(mountain: Mountain, now: number): boolean {
  return priced(mountain, now).some((row) => row.shown && row.can);
}
