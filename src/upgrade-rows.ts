import { formatCompact, formatCount } from "./format";
import type { Mountain } from "./mountain";
import type { RowView } from "./row-view";
import { upgradeEffectLine, upgradeWhyLine } from "./screen-words";
import { upgradeShown } from "./upgrade-reveal";
import { nextUpgradeCost, type Upgrade } from "./upgrades";

/** An Upgrades row (#373), and whether it shows. */
export type UpgradeRowView = RowView & { readonly shown: boolean };

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

const NO_FLAG: readonly string[] = [];

/**
 * A lasting upgrade's row: #324's before-and-after line (the line is the
 * gain) and the why line. Every upgrade has one level, so a bought one
 * reads Owned and no row carries a level badge (#728).
 */
export function upgradeRowView(
  mountain: Mountain,
  now: number,
  upgrade: Upgrade,
): UpgradeRowView {
  const cost = nextUpgradeCost(mountain, upgrade.id);
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
      : buyFace(mountain.stock.stones, cost);
  const name = upgrade.name;
  return {
    name,
    badge: "",
    info: [info],
    need: "",
    why: upgradeWhyLine(upgrade, mountain),
    flag: NO_FLAG,
    gain: "",
    ...face,
    pick: false,
    aria: rowAria(
      name,
      info,
      cost === undefined ? "Owned" : `Buy for ${formatCount(cost)} stone`,
    ),
    shown: upgradeShown(mountain, upgrade),
  };
}
