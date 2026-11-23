import type { Trouble } from "../hazards";
import { listActions, type Action } from "../economy/actions";
import { promoteCost } from "../engineers";
import type { Mountain } from "../mountain";
import { owned, tierById, tierCost } from "../tiers";
import { upgradeById, upgradeCost, upgradeLevel } from "../upgrades";
import { priceAmount } from "../stock";
import { vehiclePrice } from "../transport";
import { makerPrice } from "../makers";
import { shaftPrice } from "../mine-levels";

/**
 * What the pocket pays. A machine's workers are not in this price.
 * A listed upgrade still has a level to buy, so the price is present.
 */
export function sticker(mountain: Mountain, action: Action): number {
  switch (action.kind) {
    case "buyTier": {
      const tier = tierById(action.id);
      return tierCost(tier, owned(mountain, tier));
    }
    case "buyUpgrade": {
      const price = upgradeCost(
        upgradeById(action.id),
        upgradeLevel(mountain, action.id),
      );
      return price ?? Number.POSITIVE_INFINITY;
    }
    case "promote":
      return promoteCost(mountain);
    case "buyVehicle":
      return priceAmount(vehiclePrice(mountain, action.id), "stones");
    case "buyMaker":
      return priceAmount(makerPrice(mountain, action.id), "stones");
    case "expandStockyard":
      // Brick, not stone: the fresh dad prices it good by good (#667).
      return 0;
    case "sinkShaft":
      return priceAmount(shaftPrice(action.level), "stones");
    case "buyGraniteMachine":
      // As `valueOf` prices it until the lab learns the Granite (#675).
      return 0;
    case "assignHoist":
    case "unassignHoist":
      // Free and instant (#724).
      return 0;
    case "station":
    case "send":
    case "recall":
    case "fixTrouble":
    case "placeOrder":
    case "holdOrder":
    case "resumeOrder":
    case "placeWorker":
    case "freeWorker":
    case "startResearch":
    case "cancelResearch":
    case "installResearch":
      return 0;
  }
}

/**
 * The spends the lab weighs for every dad: crew and machines (the old
 * bench's crafts went in #740).
 * Free posts, recalls, fixes and upgrades stay off, and so do a fresh
 * mine's orders, vehicles, kilns and the stockyard: the fresh dad weighs
 * those himself (`fresh-dad.ts`). Dead stretch reads this list: a zero
 * price pays back at once.
 */
export function actionsOnTable(
  mountain: Mountain,
  now: number,
  trouble?: Trouble,
): readonly Action[] {
  return listActions(mountain, now, trouble).filter(
    (action) => action.kind === "buyTier",
  );
}
