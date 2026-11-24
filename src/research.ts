import { factor } from "./economy/factors";
import type { Mountain } from "./mountain";
import { slice2Part2On } from "./part-switch";
import {
  EMPTY_STOCK,
  GOOD_IDS,
  addedStock,
  priceAmount,
  type GoodId,
  type Price,
  type Stock,
} from "./stock";

/**
 * The Research Lab's projects (Slice 2 Part 2, spec rule 4.3, #771):
 * one active project at a time, delivered physically by Transport, with
 * lossless 100% cancel refund (even past stockyard cap) and manual install.
 * Time away delivers to an active project but never starts or installs one.
 *
 * Part 1 continuity (no save reset, no double-stacking): Part 1's instant
 * upgrades (`boots`, `cartSyn`, `drillSyn`, `borerSyn` in `SaveGame.levels`)
 * remain honored as equivalent to `workBoots`, `loadingCrews`, `haulRoads`,
 * and `drillCrews`.
 */

type UpgradeKey = keyof Mountain["upgrades"];

type ResearchRow = {
  readonly id: string;
  readonly name: string;
  /** What the project does, in plain words (placeholder copy, off in play; for Flemming's approval in #779). */
  readonly summary: string;
  /** Goods Transport must deliver before Install opens (starting values for #772 lab). */
  readonly price: Price;
  /** Part 1 `SaveGame.levels` id honored as equivalent with no double-stacking. */
  readonly partOneUpgrade?: UpgradeKey;
};

const RESEARCH_ROWS = [
  {
    id: "workBoots",
    name: "Work boots",
    summary: "Workers with tools go from 1/s to 2.4/s.",
    price: [
      { good: "parts", amount: 50_000 },
      { good: "stones", amount: 5_000_000 },
    ],
    partOneUpgrade: "boots",
  },
  {
    id: "loadingCrews",
    name: "Loading crews",
    summary: "Each worker on haulage makes carts 1% faster.",
    price: [
      { good: "parts", amount: 80_000 },
      { good: "brick", amount: 5_000_000 },
    ],
    partOneUpgrade: "cartSyn",
  },
  {
    id: "haulRoads",
    name: "Haul roads",
    summary: "Each cart makes drills 1% faster.",
    price: [
      { good: "parts", amount: 120_000 },
      { good: "brick", amount: 8_000_000 },
    ],
    partOneUpgrade: "drillSyn",
  },
  {
    id: "drillCrews",
    name: "Drill crews",
    summary: "Each drill makes borers 1% faster.",
    price: [
      { good: "parts", amount: 180_000 },
      { good: "cutStone", amount: 8_000_000 },
    ],
    partOneUpgrade: "borerSyn",
  },
  {
    id: "ironRails",
    name: "Iron rails",
    summary: "Carts and locomotives move 35% faster.",
    price: [
      { good: "parts", amount: 250_000 },
      { good: "brick", amount: 12_000_000 },
    ],
  },
  {
    id: "highDraftKilns",
    name: "High-draft kilns",
    summary: "Kilns and saws produce 35% more.",
    price: [
      { good: "parts", amount: 300_000 },
      { good: "cutStone", amount: 12_000_000 },
    ],
  },
  {
    id: "opticalGauges",
    name: "Optical gauges",
    summary: "Glassworks and Factory lines produce 40% more.",
    price: [
      { good: "parts", amount: 400_000 },
      { good: "glass", amount: 8_000_000 },
    ],
  },
  {
    id: "heavyCouplings",
    name: "Heavy couplings",
    summary: "Wagons, trucks and trains carry 40% more.",
    price: [
      { good: "parts", amount: 500_000 },
      { good: "glass", amount: 10_000_000 },
    ],
  },
] as const satisfies readonly ResearchRow[];

export type ResearchId = (typeof RESEARCH_ROWS)[number]["id"];

export type ResearchProject = Omit<ResearchRow, "id"> & {
  readonly id: ResearchId;
};

export const RESEARCH_PROJECTS: readonly ResearchProject[] = RESEARCH_ROWS;

export const RESEARCH_IDS: readonly ResearchId[] = RESEARCH_PROJECTS.map(
  (project) => project.id,
);

const RESEARCH_BY_ID = Object.fromEntries(
  RESEARCH_PROJECTS.map((project) => [project.id, project]),
) as Record<ResearchId, ResearchProject>;

export function researchById(id: ResearchId): ResearchProject {
  return RESEARCH_BY_ID[id];
}

/** One active research project awaiting physical deliveries from Transport. */
export type ActiveResearch = {
  readonly id: ResearchId;
  readonly arrived: Stock;
};

/** Research state on Mountain: at most one active project plus installed ids. */
export type ResearchState = {
  readonly active?: ActiveResearch;
  readonly done: readonly ResearchId[];
};

export const NO_RESEARCH: ResearchState = { done: [] };

/** Permanent effect multipliers for the four new Slice 2 research projects. */
const IRON_RAILS_BONUS = 0.35;
const HIGH_DRAFT_KILNS_BONUS = 0.35;
const OPTICAL_GAUGES_BONUS = 0.4;
const HEAVY_COUPLINGS_BONUS = 0.4;

/** Maps each Part 1 instant upgrade to its equivalent Slice 2 Research project. */
export const RESEARCH_FOR_UPGRADE: Readonly<Record<UpgradeKey, ResearchId>> = {
  boots: "workBoots",
  cartSyn: "loadingCrews",
  drillSyn: "haulRoads",
  borerSyn: "drillCrews",
};

/** Whether the Research Lab is open: Part 2 plays and Building 4 is operational. */
export function researchOpen(mountain: Pick<Mountain, "operational">): boolean {
  return slice2Part2On() && mountain.operational.includes("researchLab");
}

/**
 * Whether a Research project's effect is active: either installed in Research
 * or already bought as its equivalent Part 1 upgrade (no double-stacking).
 */
export function researchDone(
  mountain: Partial<Pick<Mountain, "research" | "upgrades">>,
  id: ResearchId,
): boolean {
  if (mountain.research?.done.includes(id) === true) {
    return true;
  }
  const eq = researchById(id).partOneUpgrade;
  return eq !== undefined && (mountain.upgrades?.[eq] ?? 0) > 0;
}

/** Goods required by a Research project, scaled by optional lab factors. */
export function researchPrice(id: ResearchId): Price {
  const scale = factor("price.research") * factor(`price.research.${id}`);
  const base = researchById(id).price;
  if (scale === 1) {
    return base;
  }
  return base.map((line) => ({
    good: line.good,
    amount: Math.max(
      1,
      Math.ceil(Number((line.amount * scale).toPrecision(12))),
    ),
  }));
}

/** Goods still waiting to be delivered for an active Research project. */
export function researchStillRequired(active: ActiveResearch): Stock {
  const price = researchPrice(active.id);
  const left: Record<GoodId, number> = { ...EMPTY_STOCK };
  for (const good of GOOD_IDS) {
    left[good] = Math.max(0, priceAmount(price, good) - active.arrived[good]);
  }
  return left;
}

/** Whether every required good has arrived so Install is ready. */
export function researchReady(active: ActiveResearch): boolean {
  const left = researchStillRequired(active);
  return GOOD_IDS.every((good) => left[good] === 0);
}

/** Whether a Research project can be started now. */
export function researchAvailable(mountain: Mountain, id: ResearchId): boolean {
  return (
    researchOpen(mountain) &&
    mountain.research.active === undefined &&
    !researchDone(mountain, id)
  );
}

/** Clears closed `stockToResearch:*` dedicated vehicle slots when research ends (spec rule 2.5). */
function clearResearchAssignedRuns(
  assignedRuns: Mountain["assignedRuns"],
): Mountain["assignedRuns"] {
  let hasResearchRun = false;
  for (const key of Object.keys(assignedRuns)) {
    if (key.startsWith("stockToResearch:")) {
      hasResearchRun = true;
      break;
    }
  }
  if (!hasResearchRun) {
    return assignedRuns;
  }
  const next: Record<string, number> = {};
  for (const [key, count] of Object.entries(assignedRuns)) {
    if (!key.startsWith("stockToResearch:") && count > 0) {
      next[key] = count;
    }
  }
  return next;
}

/**
 * Starts a Research project (spec rule 4.3): free up front, skips `priceFits`,
 * and opens its `stockToResearch:<good>` transport run(s).
 */
export function startResearch(mountain: Mountain, id: ResearchId): Mountain {
  if (!researchAvailable(mountain, id)) {
    return mountain;
  }
  return {
    ...mountain,
    research: {
      ...mountain.research,
      active: { id, arrived: EMPTY_STOCK },
    },
  };
}

/** Applies goods physically delivered by Transport to the active Research project. */
export function receiveResearch(
  mountain: Mountain,
  goods: Partial<Stock>,
): Mountain {
  const active = mountain.research.active;
  if (active === undefined) {
    return mountain;
  }
  const need = researchStillRequired(active);
  const clamped: Partial<Record<GoodId, number>> = {};
  let any = false;
  for (const good of GOOD_IDS) {
    const amt = Math.min(Math.max(0, Math.floor(goods[good] ?? 0)), need[good]);
    if (amt > 0) {
      clamped[good] = amt;
      any = true;
    }
  }
  if (!any) {
    return mountain;
  }
  return {
    ...mountain,
    research: {
      ...mountain.research,
      active: { ...active, arrived: addedStock(active.arrived, clamped) },
    },
  };
}

/**
 * Cancels the active Research project (spec rule 4.3, `cancelWorkOrder` rule):
 * always refunds 100% of arrived goods to `stock`, even past stockyard cap.
 */
export function cancelResearch(mountain: Mountain): Mountain {
  const active = mountain.research.active;
  if (active === undefined) {
    return mountain;
  }
  return {
    ...mountain,
    stock: addedStock(mountain.stock, active.arrived),
    research: { done: mountain.research.done },
    assignedRuns: clearResearchAssignedRuns(mountain.assignedRuns),
  };
}

/** Installs a fully delivered Research project, applying its permanent effect immediately. */
export function installResearch(mountain: Mountain): Mountain {
  const active = mountain.research.active;
  if (active === undefined || !researchReady(active)) {
    return mountain;
  }
  return {
    ...mountain,
    research: { done: [...mountain.research.done, active.id] },
    assignedRuns: clearResearchAssignedRuns(mountain.assignedRuns),
  };
}

/** Speed multiplier for carts and locomotives from Iron Rails (+35%). */
export function ironRailsMultiplier(
  mountain: Partial<Pick<Mountain, "research" | "upgrades">>,
): number {
  return researchDone(mountain, "ironRails") ? 1 + IRON_RAILS_BONUS : 1;
}

/** Output multiplier for a Refinery maker or Factory line from Research. */
export function makerResearchMultiplier(
  mountain: Partial<Pick<Mountain, "research" | "upgrades">>,
  id: "kiln" | "saw" | "glassworks" | "partsPress" | "precisionAssembly",
): number {
  if (id === "kiln" || id === "saw") {
    return researchDone(mountain, "highDraftKilns")
      ? 1 + HIGH_DRAFT_KILNS_BONUS
      : 1;
  }
  return researchDone(mountain, "opticalGauges") ? 1 + OPTICAL_GAUGES_BONUS : 1;
}

/** Capacity multiplier for all transport vehicles from Heavy Couplings (+40%). */
export function transportResearchMultiplier(
  mountain: Partial<Pick<Mountain, "research" | "upgrades">>,
): number {
  return researchDone(mountain, "heavyCouplings")
    ? 1 + HEAVY_COUPLINGS_BONUS
    : 1;
}
