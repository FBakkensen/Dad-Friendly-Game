import { buyCrew, tierLocked, tierOnSale } from "../crew";
import {
  ENGINEER_POSTS,
  MAX_ENGINEERS,
  promote,
  promotionOpen,
  onTrip,
  promoteCost,
  promotePrice,
  staffForBuy,
  staffNeeded,
  station,
  type Engineer,
  type EngineerName,
  type EngineerPost,
} from "../engineers";
import {
  MAX_EXPEDITIONS,
  TUNNELS,
  callTo,
  recall,
  send,
  type TunnelId,
} from "../expeditions";
import { expectedFindStones } from "./finds";
import {
  holdOrder,
  nextBuilding,
  placeOrder,
  resumeOrder,
  type BuildingId,
} from "../city";
import { freshMineOn } from "../line-switch";
import {
  BLUEPRINT_IDS,
  blueprintOpen,
  installable,
  cancelWorkOrder,
  installWorkOrder,
  placeWorkOrder,
  stationOpen,
  type BlueprintId,
} from "../factory";
import {
  LEVEL_MACHINE_IDS,
  graniteOpen,
  levelMachines,
  shaftOpen,
  shaftPrice,
  sinkShaft,
  withGraniteMachine,
  type LevelMachineId,
} from "../mine-levels";
import {
  MAKER_IDS,
  buyMaker,
  makerPrice,
  makerOpen,
  type MakerId,
} from "../makers";
import {
  MAX_STOCKYARD_LEVEL,
  expandStockyard,
  stockyardOpen,
} from "../stockyard";
import {
  JOB_IDS,
  freeWorker,
  jobOpen,
  placeWorker,
  placeable,
  type JobId,
} from "../workforce";
import {
  VEHICLE_IDS,
  buyVehicle,
  vehicleOpen,
  vehiclePrice,
  type VehicleId,
} from "../transport";
import {
  ENGINEER_FIX_MS,
  TROUBLE_MAX_MS,
  TROUBLE_MIN_MS,
  kindForTier,
  slowedSpeed,
  type Trouble,
  type TroubleTier,
} from "../hazards";
import { LAYERS } from "../layers";
import { upgradeShown } from "../upgrade-reveal";
import { expeditionAwayMs } from "../lost-tools";
import type { Mountain } from "../mountain";
import { minedOut, oneOffStretch } from "../scale";
import {
  markAllSeen,
  markSeen,
  markTaught,
  showsDot,
  type TeachId,
} from "../teach";
import {
  MAX_CRAFTED_LEVEL,
  cancelCraft,
  craftedLevel,
  expeditionCraftScale,
  recipeById,
  recipePrice,
  recipesForMined,
  settleBench,
  startCraft,
  troubleGapScale,
  recipeOpen,
  workshopUnlocked,
  type RecipeId,
} from "../workshop";
import { effectiveRates, paidAwayMs } from "../rates";
import {
  TIERS,
  owned,
  setOwned,
  tierById,
  tierCost,
  tierInPlay,
  tierShown,
  type Tier,
  type TierId,
} from "../tiers";
import {
  UPGRADES,
  buyUpgrade,
  upgradeById,
  upgradeCost,
  upgradeLevel,
  upgradePrice,
  upgradeUnlocked,
  type UpgradeId,
} from "../upgrades";
import {
  add,
  priceAmount,
  samePrice,
  stockMoved,
  UNSHOWN_PRICE,
  type GoodId,
  type Price,
  type Stock,
} from "../stock";

/**
 * One legal player move. A new kind has to be handled in `listActions`,
 * `applyAction`, and `valueOf` or the switch stops typechecking.
 */
export type Action =
  | { readonly kind: "buyTier"; readonly id: TierId }
  | {
      readonly kind: "buyUpgrade";
      readonly id: UpgradeId;
      /** The price the player was shown: a different price today refuses the buy (#367). */
      readonly price: Price;
    }
  | {
      readonly kind: "promote";
      /** The price the player was shown: a different price today refuses it (#367). */
      readonly price: Price;
    }
  | {
      readonly kind: "station";
      readonly index: number;
      readonly post: EngineerPost;
    }
  | { readonly kind: "send"; readonly index: number; readonly tunnel: TunnelId }
  | { readonly kind: "recall"; readonly index: number }
  | {
      readonly kind: "fixTrouble";
      readonly tier: TroubleTier;
      readonly startedAt: number;
    }
  | { readonly kind: "craft"; readonly recipe: RecipeId }
  | { readonly kind: "cancelCraft" }
  | OrderAction
  | WorkerAction
  | YardAction
  | LevelAction
  | FactoryAction;

/**
 * The factory's moves (slice 1, rule 7.13, #674), only while its station is
 * open: place a work order from a blueprint, cancel it, install it once
 * done. Placing is free: transport brings what it requires.
 */
type FactoryAction =
  | { readonly kind: "placeWorkOrder"; readonly blueprint: BlueprintId }
  | { readonly kind: "cancelWorkOrder" }
  | { readonly kind: "installWorkOrder" };

/** The station's moves: a blueprint for an idle one, else cancel, and install once done. */
function factoryActions(mountain: Mountain): readonly Action[] {
  if (!stationOpen(mountain)) {
    return [];
  }
  switch (mountain.station.kind) {
    case "idle":
      return BLUEPRINT_IDS.filter((id) => blueprintOpen(mountain, id)).map(
        (blueprint) => ({ kind: "placeWorkOrder", blueprint }),
      );
    case "delivering":
      return [{ kind: "cancelWorkOrder" }];
    case "done":
      return installable(mountain)
        ? [{ kind: "installWorkOrder" }, { kind: "cancelWorkOrder" }]
        : [{ kind: "cancelWorkOrder" }];
  }
}

/** A factory move applied; nothing while the station is closed. */
function factoryApplied(
  mountain: Mountain,
  action: FactoryAction,
  now: number,
): Mountain {
  if (!stationOpen(mountain)) {
    return mountain;
  }
  switch (action.kind) {
    case "placeWorkOrder":
      return placeWorkOrder(mountain, action.blueprint);
    case "cancelWorkOrder":
      return cancelWorkOrder(mountain);
    case "installWorkOrder":
      return installWorkOrder(mountain, now);
  }
}

/** What an applied factory move did, for the field log: the blueprint, and an installed gear's level. */
function factoryEvents(
  before: Mountain,
  next: Mountain,
  action: FactoryAction,
): readonly MoveEvent[] {
  const { station } = before;
  /* v8 ignore next 3 -- an applied cancel or install had a work order */
  const blueprint =
    action.kind === "placeWorkOrder"
      ? action.blueprint
      : station.kind === "idle"
        ? undefined
        : station.blueprint;
  /* v8 ignore next 3 -- an applied factory move names a blueprint */
  if (blueprint === undefined) {
    return [];
  }
  switch (action.kind) {
    case "placeWorkOrder":
      return [{ kind: "workOrderPlaced", blueprint }];
    case "cancelWorkOrder":
      return [{ kind: "workOrderCancelled", blueprint }];
    case "installWorkOrder":
      return [
        {
          kind: "workOrderInstalled",
          blueprint,
          level: craftedLevel(next, blueprint),
        },
      ];
  }
}

/**
 * Part 3's moves at the shaft (slice 1, rules 1.3 and 5.2, #673), only while
 * open: sink the shaft once the Light Tower is up, then buy a level machine
 * for the Granite. Both are instant (rule 7.14).
 */
type LevelAction =
  | { readonly kind: "sinkShaft" }
  | { readonly kind: "buyGraniteMachine"; readonly id: LevelMachineId };

/**
 * Part 2's buys at the mine (slice 1, rules 3 and 4, #666, #667), only while
 * open: a maker (a kiln), and one more stockyard level. Both are instant
 * (rule 7.14).
 */
type YardAction =
  | { readonly kind: "buyMaker"; readonly id: MakerId }
  | { readonly kind: "expandStockyard" };

/**
 * The workforce's moves (slice 1, rule 2.4, #689), only in a fresh mine:
 * free workers onto a job, or workers off one, up to `count` (the amount
 * key, #659). Hiring is `buyTier` of a worker, who starts free.
 */
type WorkerAction =
  | {
      readonly kind: "placeWorker";
      readonly job: JobId;
      readonly count: number;
    }
  | {
      readonly kind: "freeWorker";
      readonly job: JobId;
      readonly count: number;
    };

/**
 * The city's and transport's moves (slice 1, rule 7, #654), only in a fresh
 * mine: order the next building, hold or resume it, buy a vehicle.
 */
type OrderAction =
  | { readonly kind: "placeOrder" }
  | { readonly kind: "holdOrder" }
  | { readonly kind: "resumeOrder" }
  | { readonly kind: "buyVehicle"; readonly id: VehicleId };

/**
 * How a player spends the horizon. The player type's schedule supplies it
 * (`src/lab/policies`, #172). The catalogue does not pick a dad of its own.
 */
export type ValueContext = {
  /** Seconds at the mountain in one cycle of the schedule. */
  readonly liveSeconds: number;
  /** Seconds away in that same cycle, before the away cap. */
  readonly awaySeconds: number;
};

/** What `valueOf` says a move is worth. Payback is seconds. */
export type ActionValue = {
  /** Extra income, stones a second, spread across `horizon` for a timer. */
  readonly gainPerSec: number;
  /** Stones to pay. A machine includes the workers it still needs. */
  readonly cost: number;
  /**
   * Cookie Monster: `max(cost - pocket, 0) / income + cost / gain`.
   * Infinite when the move does not raise the crew's speed.
   */
  readonly paybackSec: number;
};

/**
 * Every move the rules allow right now, affordable or not. A buy you cannot
 * pay for stays listed, because its payback includes the wait. Pass `trouble`
 * while a machine is in trouble so the fix is on the list. The horizon lives
 * with the caller.
 */
export function listActions(
  mountain: Mountain,
  now: number,
  trouble?: Trouble,
): readonly Action[] {
  return [
    ...tierActions(mountain),
    ...upgradeActions(mountain),
    ...promoteActions(mountain),
    ...mountain.engineers.flatMap((hand, index) =>
      handActions(mountain, hand, index, now),
    ),
    ...workshopActions(mountain, now),
    ...troubleActions(trouble),
    ...orderActions(mountain),
    ...workerActions(mountain),
    ...yardActions(mountain),
    ...levelActions(mountain),
    ...factoryActions(mountain),
  ];
}

/**
 * The shaft while it can be sunk; once the Granite is open, a buy for it of
 * each level machine on sale, in `LEVEL_MACHINE_IDS` order.
 */
function levelActions(mountain: Mountain): readonly Action[] {
  if (shaftOpen(mountain)) {
    return [{ kind: "sinkShaft" }];
  }
  if (!graniteOpen(mountain)) {
    return [];
  }
  return LEVEL_MACHINE_IDS.filter((id) =>
    tierOnSale(mountain, tierById(id)),
  ).map((id) => ({ kind: "buyGraniteMachine", id }));
}

/**
 * A part 3 move applied. A Granite machine is the card buy, then placed on
 * the Granite only if he owns one more, so a refused buy changes nothing and
 * the first borer brings the first engineer as on the Topsoil.
 */
function levelApplied(mountain: Mountain, action: LevelAction): Mountain {
  if (action.kind === "sinkShaft") {
    return sinkShaft(mountain);
  }
  if (!graniteOpen(mountain)) {
    return mountain;
  }
  const bought = buyWithTeach(mountain, action.id);
  return bought.owned[action.id] > mountain.owned[action.id]
    ? withGraniteMachine(bought, action.id)
    : mountain;
}

/** The makers once they are open, and the next stockyard level until the last. */
function yardActions(mountain: Mountain): readonly Action[] {
  const makers: Action[] = MAKER_IDS.filter((id) =>
    makerOpen(mountain, id),
  ).map((id) => ({ kind: "buyMaker", id }));
  return stockyardOpen(mountain) && mountain.stockyard < MAX_STOCKYARD_LEVEL
    ? [...makers, { kind: "expandStockyard" }]
    : makers;
}

/** A part 2 buy applied; the rules refuse one that is closed or short. */
function yardApplied(mountain: Mountain, action: YardAction): Mountain {
  return action.kind === "buyMaker"
    ? buyMaker(mountain, action.id)
    : expandStockyard(mountain);
}

/**
 * Each job's two moves, where they would change something; none outside a
 * fresh mine. A job that is not open yet (the kilns before part 2's Light
 * Tower, #666) takes no worker.
 */
function workerActions(mountain: Mountain): readonly Action[] {
  if (!freshMineOn()) {
    return [];
  }
  return JOB_IDS.flatMap((job): Action[] => [
    ...(placeable(mountain, job) > 0 && jobOpen(mountain, job)
      ? [{ kind: "placeWorker", job, count: 1 } as const]
      : []),
    ...(mountain.jobs[job] > 0
      ? [{ kind: "freeWorker", job, count: 1 } as const]
      : []),
  ]);
}

/** A worker moved; nothing outside a fresh mine. */
function workerApplied(mountain: Mountain, action: WorkerAction): Mountain {
  if (!freshMineOn()) {
    return mountain;
  }
  if (action.kind === "freeWorker") {
    return freeWorker(mountain, action.job, action.count);
  }
  // A job that is not open takes no worker (the kilns before part 2's Light Tower, #666).
  return jobOpen(mountain, action.job)
    ? placeWorker(mountain, action.job, action.count)
    : mountain;
}

/** A fresh mine's vehicles, then the one order move that fits the project. */
function orderActions(mountain: Mountain): readonly Action[] {
  if (!freshMineOn()) {
    return [];
  }
  const vehicles: Action[] = VEHICLE_IDS.filter((id) =>
    vehicleOpen(mountain, id),
  ).map((id) => ({
    kind: "buyVehicle",
    id,
  }));
  switch (mountain.project.kind) {
    case "unordered":
      return nextBuilding(mountain) === undefined
        ? vehicles
        : [...vehicles, { kind: "placeOrder" }];
    case "delivering":
      return [...vehicles, { kind: "holdOrder" }];
    case "onHold":
      return [...vehicles, { kind: "resumeOrder" }];
  }
}

/** An order move applied; nothing outside a fresh mine. */
function orderApplied(mountain: Mountain, action: OrderAction): Mountain {
  if (!freshMineOn()) {
    return mountain;
  }
  switch (action.kind) {
    case "placeOrder":
      return placeOrder(mountain);
    case "holdOrder":
      return holdOrder(mountain);
    case "resumeOrder":
      return resumeOrder(mountain);
    case "buyVehicle":
      return buyVehicle(mountain, action.id);
  }
}

/** What an applied order move did, for the field log. */
function orderEvents(
  next: Mountain,
  action: OrderAction,
): readonly MoveEvent[] {
  switch (action.kind) {
    case "placeOrder":
    case "holdOrder":
    case "resumeOrder": {
      const project = next.project;
      /* v8 ignore next 3 -- an applied order move always leaves a project in hand */
      if (project.kind === "unordered") {
        return [];
      }
      return [
        { kind: ORDER_EVENT[action.kind], building: project.site.building },
      ];
    }
    case "buyVehicle":
      return [
        { kind: "vehicleBought", id: action.id, count: next.fleet[action.id] },
      ];
  }
}

const ORDER_EVENT = {
  placeOrder: "orderPlaced",
  holdOrder: "orderHeld",
  resumeOrder: "orderResumed",
} as const;

function tierActions(mountain: Mountain): readonly Action[] {
  return TIERS.filter(
    (tier) => tierShown(mountain, tier) && !tierLocked(mountain, tier),
  ).map((tier) => ({ kind: "buyTier", id: tier.id }));
}

/**
 * Only rows the sheet shows (#245): opened by owned count, seen, or bought (#250). Each at
 * today's price, as the sheet shows it.
 */
function upgradeActions(mountain: Mountain): readonly Action[] {
  return UPGRADES.filter((upgrade) => upgradeShown(mountain, upgrade)).flatMap(
    (upgrade): Action[] => {
      const price = upgradePrice(mountain, upgrade.id);
      return price === undefined
        ? []
        : [{ kind: "buyUpgrade", id: upgrade.id, price }];
    },
  );
}

function promoteActions(mountain: Mountain): readonly Action[] {
  return mountain.engineers.length < MAX_ENGINEERS && promotionOpen(mountain)
    ? [{ kind: "promote", price: promotePrice(mountain) }]
    : [];
}

/**
 * One engineer's moves: a recall while out; else sends before posts. A payback tie keeps the
 * earlier offer, and a scout's find is the choice when it ties a free walk to a machine.
 */
function handActions(
  mountain: Mountain,
  hand: Engineer,
  index: number,
  now: number,
): readonly Action[] {
  if (onTrip(mountain, hand.name)) {
    return [{ kind: "recall", index }];
  }
  const sends: Action[] = TUNNELS.filter((spec) =>
    canSend(mountain, hand, spec, now),
  ).map((spec) => ({ kind: "send", index, tunnel: spec.id }));
  const posts: Action[] = ENGINEER_POSTS.filter(
    (post) => post !== hand.post,
  ).map((post) => ({ kind: "station", index, post }));
  return [...sends, ...posts];
}

function workshopActions(mountain: Mountain, now: number): readonly Action[] {
  const bench = mountain.bench;
  if (bench !== undefined) {
    return now < bench.endsAt ? [{ kind: "cancelCraft" }] : [];
  }
  return workshopUnlocked(mountain)
    ? sinkRecipes(mountain).map((recipe) => ({ kind: "craft", recipe }))
    : [];
}

function troubleActions(trouble: Trouble | undefined): readonly Action[] {
  return trouble === undefined
    ? []
    : [
        {
          kind: "fixTrouble",
          tier: trouble.tier,
          startedAt: trouble.startedAt,
        },
      ];
}

/**
 * Recipes the dad could put on a free bench: known at this depth, plus any
 * found recipe already on the mountain, and not finished. The bench being
 * busy does not remove the sink. `materialIdle` reads this list.
 */
export function sinkRecipes(mountain: Mountain): readonly RecipeId[] {
  return knownRecipeIds(mountain).filter(
    (id) => recipeOpen(mountain, id) && craftHasRoom(mountain, id),
  );
}

/**
 * Today's card buy: one of `id`. Any worker hired while a machine stands
 * idle is the first use of staffing (#246), so it marks staffing taught. The game and the
 * lab buy the same way (#409).
 */
export function buyWithTeach(mountain: Mountain, id: TierId): Mountain {
  const next = buyCrew(mountain, id);
  return id === "helper" &&
    next.owned.helper > mountain.owned.helper &&
    showsDot(mountain, "staffing")
    ? markTaught(next, "staffing")
    : next;
}

/**
 * The Buys drawer's ×10 or Max (#358): `count` card buys, one after another at each one's own
 * price. All or nothing, so a pocket short of the last one buys none.
 */
function buyMany(mountain: Mountain, id: TierId, count: number): Mountain {
  return allOf(mountain, count, (next) => buyWithTeach(next, id));
}

/** `count` buys, one after another, or none when one of them cannot be paid. */
function allOf(
  mountain: Mountain,
  count: number,
  buy: (mountain: Mountain) => Mountain,
): Mountain {
  let next = mountain;
  for (let bought = 0; bought < count; bought += 1) {
    const after = buy(next);
    if (after === next) {
      return mountain;
    }
    next = after;
  }
  return next;
}

/**
 * A tap that buys `count` of a tier: one is today's `buyTier`, and ×10 or
 * Max buy several in one `buyTiers` move (#358). Buys and the slice 1 frame's
 * hire key both dispatch it (#659).
 */
export function tierBuyMove(
  id: TierId,
  count: number,
): Extract<Move, { kind: "buyTier" | "buyTiers" }> {
  return count === 1
    ? { kind: "buyTier", id }
    : { kind: "buyTiers", id, count };
}

/**
 * A tap on the city's wagon key: one is `buyVehicle`, and ×10 or Max buy
 * several in one `buyVehicles` move, as `tierBuyMove` does for machines (#715).
 */
export function vehicleBuyMove(
  id: VehicleId,
  count: number,
): Extract<Move, { kind: "buyVehicle" | "buyVehicles" }> {
  return count === 1
    ? { kind: "buyVehicle", id }
    : { kind: "buyVehicles", id, count };
}

/** A move only the screen makes: the lab plays marks through its value model. */
type ScreenMove =
  | {
      /** Several of a tier in one tap (#358). The lab plans single buys. */
      readonly kind: "buyTiers";
      readonly id: TierId;
      readonly count: number;
    }
  | {
      /** Several vehicles in one tap (#715). The lab plans single buys. */
      readonly kind: "buyVehicles";
      readonly id: VehicleId;
      readonly count: number;
    }
  | { readonly kind: "markSeen"; readonly id: TeachId }
  | { readonly kind: "markAllSeen"; readonly ids: readonly TeachId[] };

/** Every move the player can make (#409). The lab plans the `Action` half. */
export type Move = Action | ScreenMove;

/** What one applied move did, in the words the field log keeps (#413). */
export type MoveEvent =
  | { readonly kind: "tierBought"; readonly id: TierId; readonly count: number }
  | {
      readonly kind: "upgradeBought";
      readonly id: UpgradeId;
      readonly level: number;
    }
  | { readonly kind: "craftStarted"; readonly recipe: RecipeId }
  | {
      readonly kind: "promoted";
      readonly name: EngineerName;
      readonly crew: number;
    }
  | {
      readonly kind: "sent";
      readonly name: EngineerName;
      readonly tunnel: TunnelId;
    }
  | {
      readonly kind: "recalled";
      readonly name: EngineerName;
      readonly tunnel: TunnelId;
    }
  | {
      readonly kind: "stationed";
      readonly name: EngineerName;
      readonly post: EngineerPost;
    }
  | {
      readonly kind: "vehicleBought";
      readonly id: VehicleId;
      readonly count: number;
    }
  | {
      readonly kind: "orderPlaced" | "orderHeld" | "orderResumed";
      readonly building: BuildingId;
    }
  | {
      readonly kind: "makerBought";
      readonly id: MakerId;
      readonly count: number;
    }
  | { readonly kind: "stockyardExpanded"; readonly level: number }
  | {
      readonly kind: "workerPlaced" | "workerFreed";
      readonly job: JobId;
      /** Workers on the job after the move. */
      readonly count: number;
    }
  | { readonly kind: "shaftSunk" }
  | {
      readonly kind: "graniteMachineBought";
      readonly id: LevelMachineId;
      /** That machine on the Granite after the move. */
      readonly count: number;
    }
  | {
      readonly kind: "workOrderPlaced" | "workOrderCancelled";
      readonly blueprint: BlueprintId;
    }
  | {
      readonly kind: "workOrderInstalled";
      readonly blueprint: BlueprintId;
      /** The gear's level after it. */
      readonly level: number;
    };

/**
 * What a move did: applied, with what it took from the stock and what it put in, good by
 * good (each at least 0: a craft's output, a cancelled craft's refund), or refused because it changed nothing.
 */
export type MoveResult =
  | {
      readonly kind: "applied";
      readonly mountain: Mountain;
      readonly spent: Stock;
      readonly gained: Stock;
      readonly events: readonly MoveEvent[];
    }
  | { readonly kind: "refused" };

function moved(mountain: Mountain, move: Move, now: number): Mountain {
  switch (move.kind) {
    case "buyTiers":
      return buyMany(mountain, move.id, move.count);
    case "buyVehicles":
      return allOf(mountain, move.count, (next) =>
        orderApplied(next, { kind: "buyVehicle", id: move.id }),
      );
    case "markSeen":
      return markSeen(mountain, move.id);
    case "markAllSeen":
      return markAllSeen(mountain, move.ids);
    default:
      return actionApplied(mountain, move, now);
  }
}

function actionApplied(
  mountain: Mountain,
  action: Action,
  now: number,
): Mountain {
  switch (action.kind) {
    case "buyTier":
      return buyWithTeach(mountain, action.id);
    case "buyUpgrade":
      // The price moved since it was shown (a band crossed at the tap): no buy (#367).
      return samePrice(
        action.price,
        upgradePrice(mountain, action.id) ?? UNSHOWN_PRICE,
      )
        ? buyUpgrade(mountain, action.id)
        : mountain;
    case "promote":
      return samePrice(action.price, promotePrice(mountain))
        ? promote(mountain)
        : mountain;
    case "station": {
      // From a tunnel, the post calls the party back first (no find, no trip), so no
      // expedition is left without its engineer. A real station is the first tend (#246).
      const next = callTo(mountain, action.index, action.post);
      return next === mountain ? mountain : markTaught(next, "tending");
    }
    case "send":
      return send(mountain, action.index, action.tunnel, now);
    case "recall":
      return recall(mountain, action.index);
    case "fixTrouble":
      return mountain;
    case "craft": {
      const prepared = grantDepthRecipe(mountain, action.recipe);
      const started = startCraft(prepared, action.recipe, now);
      // A depth recipe is written onto the mountain only when the craft
      // actually starts. A refused craft leaves the save untouched.
      return started === prepared ? mountain : started;
    }
    case "cancelCraft":
      return cancelCraft(mountain, now);
    case "placeOrder":
    case "holdOrder":
    case "resumeOrder":
    case "buyVehicle":
      return orderApplied(mountain, action);
    case "placeWorker":
    case "freeWorker":
      return workerApplied(mountain, action);
    case "buyMaker":
    case "expandStockyard":
      return yardApplied(mountain, action);
    case "sinkShaft":
    case "buyGraniteMachine":
      return levelApplied(mountain, action);
    case "placeWorkOrder":
    case "cancelWorkOrder":
    case "installWorkOrder":
      return factoryApplied(mountain, action, now);
    /* v8 ignore next 3 -- exhaustiveness guard, unreachable */
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

/**
 * Applies one move, the one way the game changes (#409): the store dispatches it, and the
 * lab's `applyAction` calls it. A move that leaves the mountain as it was is refused.
 */
export function applyMove(
  mountain: Mountain,
  move: Move,
  now: number,
): MoveResult {
  const next = moved(mountain, move, now);
  if (next === mountain) {
    return { kind: "refused" };
  }
  return {
    kind: "applied",
    mountain: next,
    ...stockMoved(mountain.stock, next.stock),
    events: moveEvents(mountain, next, move),
  };
}

/**
 * The engineer a move named. An applied recall, station, send or promote changed a real
 * engineer, so a missing one means the move and the mountain disagree.
 */
function engineerAt(mountain: Mountain, index: number): Engineer {
  const hand = mountain.engineers[index];
  /* v8 ignore next 3 -- an applied move named a real engineer, unreachable */
  if (hand === undefined) {
    throw new Error(`No engineer at ${String(index)}`);
  }
  return hand;
}

/** The crew an applied promote made, so a missing one means the move and the mountain disagree. */
function crewOf(mountain: Mountain): readonly Engineer[] {
  return mountain.engineers;
}

/**
 * Who left a trip and where they stand now, for `recall` and `station` on one engineer.
 * A trip ends with `recalled`; a post other than the one they left
 * adds `stationed`. The rule the field log keeps (#413).
 */
function crewEvents(
  before: Mountain,
  next: Mountain,
  index: number,
): readonly MoveEvent[] {
  const hand = engineerAt(before, index);
  const landed = engineerAt(next, index);
  const trip = before.expeditions.find(
    (candidate) => candidate.engineer === hand.name,
  );
  const events: MoveEvent[] = [];
  if (trip !== undefined) {
    events.push({ kind: "recalled", name: hand.name, tunnel: trip.tunnel });
  }
  if (landed.post !== hand.post) {
    events.push({ kind: "stationed", name: hand.name, post: landed.post });
  }
  return events;
}

function actionEvents(
  before: Mountain,
  next: Mountain,
  action: Action,
): readonly MoveEvent[] {
  switch (action.kind) {
    case "buyTier":
      return [
        {
          kind: "tierBought",
          id: action.id,
          count: owned(next, tierById(action.id)),
        },
      ];
    case "buyUpgrade":
      return [
        {
          kind: "upgradeBought",
          id: action.id,
          level: upgradeLevel(next, action.id),
        },
      ];
    case "craft":
      return [{ kind: "craftStarted", recipe: action.recipe }];
    case "promote": {
      const crew = crewOf(next).length;
      return [
        {
          kind: "promoted",
          name: engineerAt(next, crew - 1).name,
          crew,
        },
      ];
    }
    case "send":
      return [
        {
          kind: "sent",
          name: engineerAt(before, action.index).name,
          tunnel: action.tunnel,
        },
      ];
    case "recall":
    case "station":
      return crewEvents(before, next, action.index);
    case "cancelCraft":
    case "fixTrouble":
      return [];
    case "placeOrder":
    case "holdOrder":
    case "resumeOrder":
    case "buyVehicle":
      return orderEvents(next, action);
    case "placeWorker":
    case "freeWorker":
      return [
        {
          kind: action.kind === "placeWorker" ? "workerPlaced" : "workerFreed",
          job: action.job,
          count: next.jobs[action.job],
        },
      ];
    case "buyMaker":
      return [
        { kind: "makerBought", id: action.id, count: next.makers[action.id] },
      ];
    case "expandStockyard":
      return [{ kind: "stockyardExpanded", level: next.stockyard }];
    case "sinkShaft":
      return [{ kind: "shaftSunk" }];
    case "buyGraniteMachine":
      return [
        {
          kind: "graniteMachineBought",
          id: action.id,
          count: levelMachines(next, "granite")[action.id],
        },
      ];
    case "placeWorkOrder":
    case "cancelWorkOrder":
    case "installWorkOrder":
      return factoryEvents(before, next, action);
    /* v8 ignore next 3 -- exhaustiveness guard, unreachable */
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

/** What an applied move did, read from the mountain it saw and the one it made (#413). */
function moveEvents(
  before: Mountain,
  next: Mountain,
  move: Move,
): readonly MoveEvent[] {
  switch (move.kind) {
    case "buyTiers":
      return actionEvents(before, next, { kind: "buyTier", id: move.id });
    case "buyVehicles":
      return actionEvents(before, next, { kind: "buyVehicle", id: move.id });
    case "markSeen":
    case "markAllSeen":
      return [];
    default:
      return actionEvents(before, next, move);
  }
}

/** The lab's move: the same rules as the game, and a refused move keeps the mountain. */
export function applyAction(
  mountain: Mountain,
  action: Action,
  now: number,
): Mountain {
  const result = applyMove(mountain, action, now);
  return result.kind === "applied" ? result.mountain : mountain;
}

/**
 * Values a move from income before and after. Income mixes the unrounded
 * crew and away pay from the same factor as
 * `accrueAway`, weighted by `context`. No second copy of the upgrade maths.
 * A machine's cost includes the workers it still needs. `horizon` is
 * seconds: a timer's extra income is spread across it, and a permanent
 * move is not.
 */
export function valueOf(
  mountain: Mountain,
  action: Action,
  horizon: number,
  context: ValueContext,
  now = 0,
): ActionValue {
  switch (action.kind) {
    case "buyTier":
      return valueTier(mountain, action.id, horizon, context);
    case "buyUpgrade":
      return valueUpgrade(mountain, action.id, horizon, context);
    case "promote":
      return valuePromote(mountain, horizon, context);
    case "station":
      return rateValue(
        mountain,
        incomeGain(
          mountain,
          callTo(mountain, action.index, action.post),
          context,
        ),
        0,
        horizon,
        context,
      );
    case "send":
      return valueSend(mountain, action, horizon, context);
    case "recall":
      return valueRecall(mountain, action.index, horizon, context, now);
    case "fixTrouble":
      return rateValue(
        mountain,
        troubleGain(mountain, action, context),
        0,
        horizon,
        context,
      );
    case "craft":
      return valueCraft(mountain, action.recipe, horizon, context, now);
    case "cancelCraft":
      return valueCancel(mountain, horizon, context, now);
    case "placeOrder":
    case "holdOrder":
    case "resumeOrder":
      return { gainPerSec: 0, cost: 0, paybackSec: Infinity };
    case "buyVehicle":
      // Transport raises no income: the lab learns what it is worth (#655).
      return {
        gainPerSec: 0,
        cost: priceAmount(vehiclePrice(mountain, action.id), "stones"),
        paybackSec: Infinity,
      };
    case "buyMaker":
      // A maker raises no stone income: the lab learns what brick is worth (#667).
      return {
        gainPerSec: 0,
        cost: priceAmount(makerPrice(mountain, action.id), "stones"),
        paybackSec: Infinity,
      };
    case "expandStockyard":
      return { gainPerSec: 0, cost: 0, paybackSec: Infinity };
    case "placeWorker":
    case "freeWorker":
      // Free and instant: worth what the line gains (a driver adds none).
      return rateValue(
        mountain,
        incomeGain(mountain, workerApplied(mountain, action), context),
        0,
        horizon,
        context,
      );
    case "sinkShaft":
      // Neither raises stone income: the lab learns what the Granite is worth (#675).
      return {
        gainPerSec: 0,
        cost: priceAmount(shaftPrice(), "stones"),
        paybackSec: Infinity,
      };
    case "buyGraniteMachine":
      return { gainPerSec: 0, cost: 0, paybackSec: Infinity };
    case "placeWorkOrder":
    case "cancelWorkOrder":
    case "installWorkOrder":
      // The lab learns what a work order is worth with the whole slice (#675).
      return { gainPerSec: 0, cost: 0, paybackSec: Infinity };
    /* v8 ignore next 3 -- exhaustiveness guard, unreachable */
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

function valueTier(
  mountain: Mountain,
  id: TierId,
  horizon: number,
  context: ValueContext,
): ActionValue {
  const tier = tierById(id);
  const price = tierCost(tier, owned(mountain, tier));
  const cost = price + staffBill(mountain, tier);
  if (tierLocked(mountain, tier)) {
    return rateValue(mountain, 0, cost, horizon, context);
  }
  // Workers and kids: hiring one, including any idle machine they start.
  // A machine: the income of that tier once the workers it needs are at
  // work. The first borer's engineer is not part of this score.
  const gain =
    tier.staff === 0
      ? incomeGain(mountain, buyCrew(funded(mountain, price), id), context)
      : machineGain(mountain, tier, context);
  return rateValue(mountain, gain, cost, horizon, context);
}

function machineGain(
  mountain: Mountain,
  tier: Tier,
  context: ValueContext,
): number {
  // Enough hands that every machine already owned keeps running, and one
  // more of this tier runs too. The same hands are on both sides, so their
  // own mining cancels and the gain is this tier. The first borer's
  // engineer is not posted here.
  // A machine of the line takes no hands while the line is off (#533).
  const pad = TIERS.filter(tierInPlay).reduce(
    (total, item) =>
      total + (owned(mountain, item) + 1) * staffNeeded(mountain, item),
    0,
  );
  const rested = setOwned(mountain, "helper", mountain.owned.helper + pad);
  const running = setOwned(rested, tier.id, owned(rested, tier) + 1);
  return incomeGain(rested, running, context);
}

function valueUpgrade(
  mountain: Mountain,
  id: UpgradeId,
  horizon: number,
  context: ValueContext,
): ActionValue {
  const upgrade = upgradeById(id);
  const price = upgradeCost(
    upgrade,
    upgradeLevel(mountain, id),
    oneOffStretch(mountain),
  );
  if (price === undefined || !upgradeUnlocked(mountain, upgrade)) {
    return rateValue(mountain, 0, price ?? 0, horizon, context);
  }
  return rateValue(
    mountain,
    incomeGain(mountain, buyUpgrade(funded(mountain, price), id), context),
    price,
    horizon,
    context,
  );
}

function troubleGain(
  mountain: Mountain,
  action: Extract<Action, { kind: "fixTrouble" }>,
  context: ValueContext,
): number {
  const trouble: Trouble = {
    kind: kindForTier(action.tier),
    tier: action.tier,
    startedAt: action.startedAt,
  };
  const clock = { now: action.startedAt, trouble };
  return (
    incomePerSecond(mountain, context, { now: action.startedAt }) -
    incomePerSecond(mountain, context, clock)
  );
}

/** Workers a machine still needs, priced as the next hires. Zero for a worker. */
function staffBill(mountain: Mountain, tier: Tier): number {
  if (tier.staff === 0) {
    return 0;
  }
  const short = Math.max(
    0,
    staffForBuy(mountain, tier) - freeHelpers(mountain),
  );
  return helperBill(mountain, short);
}

/** What the next `count` workers cost, hired one after another. */
export function helperBill(mountain: Mountain, count: number): number {
  const helper = tierById("helper");
  let cost = 0;
  for (let extra = 0; extra < count; extra += 1) {
    cost += tierCost(helper, mountain.owned.helper + extra);
  }
  return cost;
}

/** Hands not already running a machine. The sim dad's spare count too. */
export function freeHelpers(mountain: Mountain): number {
  const rates = effectiveRates(mountain);
  const used = TIERS.reduce(
    (total, tier) =>
      total + rates.running[tier.id] * staffNeeded(mountain, tier),
    0,
  );
  return mountain.owned.helper + mountain.owned.kid - used;
}

function incomeGain(
  before: Mountain,
  after: Mountain,
  context: ValueContext,
  clock?: ValueClock,
): number {
  return (
    incomePerSecond(after, context, clock) -
    incomePerSecond(before, context, clock)
  );
}

type ValueClock = {
  readonly now: number;
  readonly trouble?: Trouble;
};

/**
 * Stones a second of the schedule. Live time pays the unrounded crew.
 * Away time pays the same factor as `accrueAway`,
 * and only up to the away cap. The rest of a long absence pays nothing.
 * The lab reads this for its lookahead so it does not keep a second formula.
 */
export function incomePerSecond(
  mountain: Mountain,
  context: ValueContext,
  clock?: ValueClock,
): number {
  const liveRates = effectiveRates(mountain, clock?.now, clock?.trouble);
  const awayRates = effectiveRates(mountain);
  const liveIncome = liveRates.exactCrewPerSecond;
  const liveSeconds = context.liveSeconds;
  const awaySeconds = context.awaySeconds;
  const cycle = liveSeconds + awaySeconds;
  const paidAway = awaySeconds <= 0 ? 0 : paidAwayMs(awaySeconds * 1000) / 1000;
  const awayIncome = awayRates.exactCrewPerSecond * awayFactor(mountain);
  if (!(cycle > 0)) {
    return liveIncome;
  }
  return (liveSeconds * liveIncome + paidAway * awayIncome) / cycle;
}

/** The pay fraction `accrueAway` applies. */
function awayFactor(mountain: Mountain): number {
  return Math.round(effectiveRates(mountain).awayPay * 1e9) / 1e9;
}

/**
 * A new engineer is worth the best machine they can tend, plus one old-shaft
 * trip's expected finds, spread over the horizon. The worker they used to
 * be is already out of the crew in that comparison.
 */
function valuePromote(
  mountain: Mountain,
  horizon: number,
  context: ValueContext,
): ActionValue {
  const cost = promoteCost(mountain);
  const before = mountain.engineers.length;
  const hired = promote(funded(mountain, cost));
  const crew = hired.engineers;
  if (crew.length === before) {
    return rateValue(mountain, 0, cost, horizon, context);
  }
  const index = crew.length - 1;
  const tend = incomeGain(mountain, bestPost(hired, index, context), context);
  const finds = findStones(hired, "old-shaft", horizon, context);
  const findRate = horizon > 0 ? finds / horizon : 0;
  return rateValue(mountain, tend + findRate, cost, horizon, context);
}

/**
 * Sending costs the tending they leave behind for the trip, and pays the
 * expected find as stones over the horizon. A scout at camp has no tending
 * to lose, so the find is the whole gain.
 */
function valueSend(
  mountain: Mountain,
  action: Extract<Action, { kind: "send" }>,
  horizon: number,
  context: ValueContext,
): ActionValue {
  const sent = send(mountain, action.index, action.tunnel, 0);
  const rateDelta = incomeGain(mountain, sent, context);
  const spec = TUNNELS.find((tunnel) => tunnel.id === action.tunnel);
  /* v8 ignore next 3 -- tunnel ids are the closed TUNNELS list */
  if (spec === undefined) {
    return rateValue(mountain, 0, 0, horizon, context);
  }
  const tripSec = expeditionAwayMs(spec.awayMs, mountain) / 1000;
  const window = horizon > 0 ? horizon : tripSec;
  const away = horizon > 0 ? Math.min(tripSec, horizon) : tripSec;
  const finds = findStones(mountain, action.tunnel, window, context);
  // The find is stones over the horizon. The cost is the tending given
  // up on the trip, so a short seam does not pay back in zero seconds
  // and crowd out every other buy.
  const lossStones = Math.max(0, -rateDelta) * away;
  return rateValue(mountain, finds / window, lossStones, horizon, context);
}

/**
 * Calling them back restores the post they left, or the best open machine
 * if home was camp. The cost is the find they walk away from, scaled by how
 * much of the trip is left, so a nearly finished shaft is cheap to cancel.
 */
function valueRecall(
  mountain: Mountain,
  index: number,
  horizon: number,
  context: ValueContext,
  now: number,
): ActionValue {
  const back = recall(mountain, index);
  const restored = incomeGain(
    mountain,
    bestPost(back, index, context),
    context,
  );
  const crew = mountain.engineers;
  const engineer = crew[index];
  const trip = mountain.expeditions.find(
    (candidate) => candidate.engineer === engineer?.name,
  );
  const tunnel = trip?.tunnel ?? "old-shaft";
  const finds = findStones(
    mountain,
    tunnel,
    horizon > 0 ? horizon : 1,
    context,
  );
  const fraction = trip === undefined ? 1 : remainingFraction(trip, now);
  // The find is a lump the recall throws away. A worthless tunnel would
  // otherwise pay back in zero seconds and be the only button. Half a
  // day keeps a neighbour buy on the table.
  const FORFEIT = 8;
  const MIN_RECALL_SEC = 12 * 60 * 60;
  const cost = Math.max(finds * fraction * FORFEIT, restored * MIN_RECALL_SEC);
  return rateValue(mountain, restored, cost, horizon, context);
}

/** The mountain with this engineer on the post that pays the most. */
function bestPost(
  mountain: Mountain,
  index: number,
  context: ValueContext,
): Mountain {
  let best = mountain;
  let bestRate = incomePerSecond(mountain, context);
  for (const post of ENGINEER_POSTS) {
    if (post === "camp") {
      continue;
    }
    const stationed = callTo(mountain, index, post);
    const rate = incomePerSecond(stationed, context);
    if (rate > bestRate) {
      best = stationed;
      bestRate = rate;
    }
  }
  return best;
}

function findStones(
  mountain: Mountain,
  tunnel: TunnelId,
  horizon: number,
  context: ValueContext,
): number {
  return expectedFindStones(
    mountain,
    mountain.engineers,
    tunnel,
    horizon,
    (next) => incomePerSecond(next, context),
  );
}

function remainingFraction(
  trip: { readonly sentAt: number; readonly returnsAt: number },
  now: number,
): number {
  if (now <= trip.sentAt) {
    return 1;
  }
  if (now >= trip.returnsAt) {
    // Already due: settle brings them home. Pricing the find at nothing
    // made that recall pay back in zero seconds.
    return 1;
  }
  return (trip.returnsAt - now) / (trip.returnsAt - trip.sentAt);
}

/**
 * A craft's payback is the usual wait, plus the time the bench is busy
 * before the gear starts paying. Timers are spread by `timedSpread`.
 * Props and the kit are not a crew rate, so they are expected
 * stones over the horizon, the same idea as an expedition find.
 */
function valueCraft(
  mountain: Mountain,
  id: RecipeId,
  horizon: number,
  context: ValueContext,
  now: number,
  pricing: "best-use" | "stones-only" = "best-use",
): ActionValue {
  const recipe = recipeById(id);
  const stones =
    priceAmount(recipePrice(id), "stones") +
    (pricing === "best-use"
      ? materialsPrice(mountain, id, horizon, context, now)
      : 0);
  const benchSec = recipe.craftMs / 1000;
  const preview = previewCraft(mountain, id, now);
  if (preview === undefined) {
    return withBench(
      rateValue(mountain, 0, stones, horizon, context),
      benchSec,
    );
  }
  const { fitted, endsAt } = preview;
  switch (recipe.effect.kind) {
    case "tier":
    case "reinforce":
      return withBench(
        rateValue(
          mountain,
          incomeGain(mountain, fitted, context),
          stones,
          horizon,
          context,
        ),
        benchSec,
      );
    case "charge":
      return withBench(
        timedCraft(
          mountain,
          fitted,
          endsAt,
          recipe.effect.durationMs / 1000,
          stones,
          horizon,
          context,
        ),
        benchSec,
      );
    case "ember":
      return withBench(
        timedCraft(
          mountain,
          fitted,
          endsAt,
          settledSec(fitted.clocks["heartstone-ember"], endsAt),
          stones,
          horizon,
          context,
        ),
        benchSec,
      );
    case "axle":
      // The clock covers a sitting and is refreshed the next time the
      // bench is free, so the gain is the live share of every cycle.
      // incomeGain already leaves the away hours out.
      return withBench(
        timedCraft(
          mountain,
          fitted,
          endsAt,
          Number.POSITIVE_INFINITY,
          stones,
          horizon,
          context,
        ),
        benchSec,
      );
    case "trouble":
      return withBench(
        rateValue(
          mountain,
          propsGain(mountain, fitted, context),
          stones,
          horizon,
          context,
        ),
        benchSec,
      );
    case "trip":
      return withBench(
        rateValue(
          mountain,
          kitGain(mountain, fitted, context),
          stones,
          horizon,
          context,
        ),
        benchSec,
      );
    /* v8 ignore next 3 -- effect kinds are the closed recipe list */
    default: {
      const unexpected: never = recipe.effect;
      return unexpected;
    }
  }
}

/**
 * Calling the craft off gives the stones back and gives up the gear.
 * The rate change is not a raise, so the payback stays infinite and a
 * dad who is choosing keeps what is already on the bench.
 */
function valueCancel(
  mountain: Mountain,
  horizon: number,
  context: ValueContext,
  now: number,
): ActionValue {
  const bench = mountain.bench;
  if (bench === undefined || !(now < bench.endsAt)) {
    return rateValue(mountain, 0, 0, horizon, context);
  }
  const kept = settleBench(mountain, bench.endsAt);
  const gain = incomeGain(kept, cancelCraft(mountain, now), context);
  return rateValue(mountain, gain, 0, horizon, context);
}

function previewCraft(
  mountain: Mountain,
  id: RecipeId,
  now: number,
): { readonly fitted: Mountain; readonly endsAt: number } | undefined {
  if (mountain.bench !== undefined || !recipeOpen(mountain, id)) {
    return undefined;
  }
  const prepared = fundCraft(mountain, id);
  const started = startCraft(prepared, id, now);
  const bench = started.bench;
  if (bench === undefined) {
    return undefined;
  }
  return { fitted: settleBench(started, bench.endsAt), endsAt: bench.endsAt };
}

/**
 * What the materials in a craft are worth: their best other use, not the
 * stones it took to dig them (#244, Flemming picked this on #281). Dug ore
 * is sunk; spending it only costs what the next-best open recipe would have
 * made from it over the horizon, per unit, net of that recipe's stones.
 * With no other open recipe for a material it costs nothing. Iron keeps a
 * price while rails and grease also want it, so Reinforce cannot look free.
 */
function materialsPrice(
  mountain: Mountain,
  id: RecipeId,
  horizon: number,
  context: ValueContext,
  now: number,
): number {
  // A horizon with no end (or none) has no next-best use to weigh.
  if (!Number.isFinite(horizon) || horizon <= 0) {
    return 0;
  }
  const cost = recipePrice(id);
  const others = sinkRecipes(mountain).filter((other) => other !== id);
  let price = 0;
  for (const layer of LAYERS) {
    const units = priceAmount(cost, layer.material);
    if (units <= 0) {
      continue;
    }
    let best = 0;
    for (const other of others) {
      const otherCost = recipePrice(other);
      const otherUnits = priceAmount(otherCost, layer.material);
      if (otherUnits <= 0) {
        continue;
      }
      const made = valueCraft(
        mountain,
        other,
        horizon,
        context,
        now,
        "stones-only",
      );
      const net = made.gainPerSec * horizon - priceAmount(otherCost, "stones");
      best = Math.max(best, net / otherUnits);
    }
    price += units * best;
  }
  return price;
}

function fundCraft(mountain: Mountain, id: RecipeId): Mountain {
  // The stones on top of the pocket; each material only up to the price.
  const cost = recipePrice(id);
  const have = mountain.stock;
  const gains: Partial<Record<GoodId, number>> = {};
  for (const line of cost) {
    gains[line.good] =
      line.good === "stones"
        ? line.amount
        : Math.max(0, line.amount - have[line.good]);
  }
  return add(grantDepthRecipe(mountain, id), gains);
}

/**
 * A layer recipe is known once that band is reached, even when the save
 * has not written it yet. A found recipe stays found only.
 */
function grantDepthRecipe(mountain: Mountain, id: RecipeId): Mountain {
  const known = mountain.recipes;
  if (known.includes(id) || !recipesForMined(minedOut(mountain)).includes(id)) {
    return mountain;
  }
  return { ...mountain, recipes: [...known, id] };
}

export function knownRecipeIds(mountain: Mountain): readonly RecipeId[] {
  const depth = recipesForMined(minedOut(mountain));
  const found = mountain.recipes.filter((id) => !depth.includes(id));
  return [...depth, ...found];
}

function craftHasRoom(mountain: Mountain, id: RecipeId): boolean {
  const recipe = recipeById(id);
  const level = craftedLevel(mountain, id);
  if (level >= MAX_CRAFTED_LEVEL) {
    return false;
  }
  return recipe.maxLevel === undefined || level < recipe.maxLevel;
}

function timedCraft(
  mountain: Mountain,
  fitted: Mountain,
  endsAt: number,
  durationSec: number,
  stones: number,
  horizon: number,
  context: ValueContext,
): ActionValue {
  return rateValue(
    mountain,
    incomeGain(mountain, fitted, context, { now: endsAt }),
    stones,
    horizon,
    context,
    timedSpread(context, durationSec, horizon),
  );
}

/**
 * Share of the horizon a short effect is counted across. A dad who is away
 * part of the cycle gets a little more than the raw clock, so a blasting
 * charge can win without being the only buy.
 */
function timedSpread(
  context: ValueContext,
  durationSec: number,
  horizon: number,
): number {
  return context.awaySeconds > 0
    ? Math.min(horizon, durationSec * 1.45)
    : durationSec;
}

/** Seconds the settled timer runs. Settle writes the clock past `endsAt`. */
function settledSec(until: number, endsAt: number): number {
  /* v8 ignore next -- settleBench writes the ember clock */
  if (until <= endsAt) {
    return 0;
  }
  return (until - endsAt) / 1000;
}

function withBench(value: ActionValue, benchSec: number): ActionValue {
  if (!Number.isFinite(value.paybackSec)) {
    return value;
  }
  return { ...value, paybackSec: value.paybackSec + benchSec };
}

/**
 * Stones a second that trouble is expected to eat. Props stretch the gap.
 * Trouble starts once a borer is owned, and only while the dad is here.
 */
function propsGain(
  before: Mountain,
  after: Mountain,
  context: ValueContext,
): number {
  if (before.owned.borer < 1) {
    return 0;
  }
  return troubleLossPerSec(before, context) - troubleLossPerSec(after, context);
}

function troubleLossPerSec(mountain: Mountain, context: ValueContext): number {
  const meanGapSec = (TROUBLE_MIN_MS + TROUBLE_MAX_MS) / 2 / 1000;
  const gapSec = meanGapSec * troubleGapScale(mountain);
  const lost = 1 - slowedSpeed(1, 0, 0);
  const downSec = ENGINEER_FIX_MS / 1000;
  const income = incomePerSecond(mountain, context);
  return (1 / gapSec) * income * lost * downSec * liveShare(context);
}

/**
 * The kit brings an expedition home sooner. The stones are the best tend
 * that engineer does in the time one old-shaft trip gives back, spread
 * across a day. No crew, no tend, no stones.
 */
function kitGain(
  before: Mountain,
  after: Mountain,
  context: ValueContext,
): number {
  const crew = before.engineers;
  if (crew.length === 0) {
    return 0;
  }
  const saved = 1 - expeditionCraftScale(after) / expeditionCraftScale(before);
  const shaft = TUNNELS.find((tunnel) => tunnel.id === "old-shaft");
  /* v8 ignore next 3 -- old-shaft is in the closed TUNNELS list */
  if (shaft === undefined) {
    return 0;
  }
  const tend = tendRate(before, 0, context);
  const daySec = 24 * 60 * 60;
  return (tend * (shaft.awayMs / 1000) * saved) / daySec;
}

function tendRate(
  mountain: Mountain,
  index: number,
  context: ValueContext,
): number {
  const home = incomePerSecond(bestPost(mountain, index, context), context);
  const camp = incomePerSecond(station(mountain, index, "camp"), context);
  return Math.max(0, home - camp);
}

function liveShare(context: ValueContext): number {
  const cycle = context.liveSeconds + context.awaySeconds;
  if (!(cycle > 0)) {
    return 1;
  }
  return context.liveSeconds / cycle;
}

function funded(mountain: Mountain, price: number): Mountain {
  return add(mountain, { stones: price });
}

function rateValue(
  mountain: Mountain,
  instantGain: number,
  cost: number,
  horizon: number,
  context: ValueContext,
  durationSec = Number.POSITIVE_INFINITY,
): ActionValue {
  const gainPerSec = instantGain * activeShare(horizon, durationSec);
  return {
    gainPerSec,
    cost,
    paybackSec: payback(
      mountain.stock.stones,
      incomePerSecond(mountain, context),
      cost,
      gainPerSec,
    ),
  };
}

/**
 * Share of the horizon a timed effect is actually running. A permanent move
 * fills the window. A non-positive horizon means "the rate while it lasts".
 */
function activeShare(horizon: number, durationSec: number): number {
  if (!(horizon > 0) || !Number.isFinite(durationSec)) {
    return 1;
  }
  if (!Number.isFinite(horizon)) {
    return 0;
  }
  return Math.min(durationSec, horizon) / horizon;
}

function payback(
  pocket: number,
  income: number,
  cost: number,
  gain: number,
): number {
  if (!(gain > 0)) {
    return Number.POSITIVE_INFINITY;
  }
  const shortfall = Math.max(cost - pocket, 0);
  const afford =
    shortfall === 0
      ? 0
      : income > 0
        ? shortfall / income
        : Number.POSITIVE_INFINITY;
  return afford + cost / gain;
}

function canSend(
  mountain: Mountain,
  hand: Engineer,
  spec: (typeof TUNNELS)[number],
  now: number,
): boolean {
  // `send` also refuses a full expedition list. Someone still at home
  // usually means there is room; the length check covers a bad save.
  return (
    !onTrip(mountain, hand.name) &&
    hand.rank >= spec.minRank &&
    Number.isSafeInteger(now) &&
    Number.isSafeInteger(now + expeditionAwayMs(spec.awayMs, mountain)) &&
    mountain.expeditions.length < MAX_EXPEDITIONS
  );
}
