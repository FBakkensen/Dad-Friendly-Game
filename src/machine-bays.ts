import { crewCounts } from "./crew-count";
import { tierLock, type TierLock } from "./crew";
import { staffForBuy } from "./engineers";
import type { Trouble, TroubleKind } from "./hazards";
import type { Mountain } from "./mountain";
import { effectiveRates } from "./rates";
import type { ReadyPick } from "./ready-now";
import { stretch } from "./scale";
import { owned, tierById, tierCost, type MachineId } from "./tiers";

type BayTiers = readonly [MachineId, MachineId, MachineId];

const EARLY_BAYS: BayTiers = ["cart", "drill", "borer"];
const MACHINE_BAYS: BayTiers = ["drill", "borer", "machine"];

/** The flaps read three digits at most; a bad save's count stops here. */
const MAX_FLAP = 999;

/** A bay's lamp, as the lamps in Buys: lamp.png's four frames. */
export type BayLamp = "off" | "amber" | "green" | "red";

/**
 * One machine bay (#372). A locked bay shows why; an open one its price,
 * gain and hands; a troubled one the same, with the trouble to fix.
 */
export type BayView =
  | {
      readonly kind: "locked";
      readonly tier: MachineId;
      readonly count: number;
      readonly lock: TierLock;
    }
  | {
      readonly kind: "open";
      readonly tier: MachineId;
      readonly count: number;
      readonly price: number;
      readonly gain: number;
      readonly staff: number;
      readonly lamp: "off" | "amber" | "green";
    }
  | {
      readonly kind: "trouble";
      readonly tier: MachineId;
      readonly count: number;
      readonly price: number;
      readonly gain: number;
      readonly staff: number;
      readonly trouble: TroubleKind;
    };

/**
 * The three tiers with a bay (C2): cart, drill and borer, until the Great
 * Machine is on sale or owned; then drill, borer and the machine.
 */
export function bayTiers(mountain: Mountain): BayTiers {
  const machine = tierById("machine");
  return owned(mountain, machine) > 0 ||
    tierLock(mountain, machine) === undefined
    ? MACHINE_BAYS
    : EARLY_BAYS;
}

/**
 * Each bay's state. Display only: it reads the mountain and never buys.
 * Trouble on a bay's tier wins over a lock. Amber is the Ready pick, green
 * a machine the pocket and the free hands cover, and dark anything else.
 */
export function bayViews(
  mountain: Mountain,
  now: number,
  trouble: Trouble | undefined,
  pick: ReadyPick,
): readonly [BayView, BayView, BayView] {
  const { free } = crewCounts(mountain, now, trouble);
  const { tierSpeed } = effectiveRates(mountain, now, trouble);
  const k = stretch(mountain);
  const view = (id: MachineId): BayView => {
    const tier = tierById(id);
    const count = owned(mountain, tier);
    const lock = tierLock(mountain, tier);
    if (trouble?.tier !== id && lock !== undefined) {
      return { kind: "locked", tier: id, count, lock };
    }
    const price = tierCost(tier, count, k);
    const gain = tierSpeed[id];
    const staff = staffForBuy(mountain, tier);
    if (trouble?.tier === id) {
      return {
        kind: "trouble",
        tier: id,
        count,
        price,
        gain,
        staff,
        trouble: trouble.kind,
      };
    }
    const lamp =
      pick.kind === "ready" && pick.tier === id
        ? "amber"
        : mountain.pocket >= price && free >= staff
          ? "green"
          : "off";
    return { kind: "open", tier: id, count, price, gain, staff, lamp };
  };
  const [a, b, c] = bayTiers(mountain);
  return [view(a), view(b), view(c)];
}

/** The lamp a bay shows: red for trouble, dark while locked. */
export function bayLamp(view: BayView): BayLamp {
  switch (view.kind) {
    case "trouble":
      return "red";
    case "locked":
      return "off";
    case "open":
      return view.lamp;
  }
}

/**
 * A count on the flaps: two flaps (a leading space under 10), three from 100,
 * held at 999. A bad save's NaN or negative count reads 0.
 */
export function flapDigits(count: number): string {
  if (Number.isNaN(count) || count < 0) {
    return " 0";
  }
  return String(Math.min(MAX_FLAP, Math.floor(count))).padStart(2, " ");
}
