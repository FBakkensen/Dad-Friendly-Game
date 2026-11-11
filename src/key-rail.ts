import { canCraftNow } from "./afford-glow";
import { BOOSTS } from "./boosts";
import { canPromote } from "./engineers";
import type { Trouble } from "./hazards";
import { bayTiers } from "./machine-bays";
import type { Mountain } from "./mountain";
import { formatClock, troubleAria } from "./screen-words";
import { showsDot } from "./teach";
import { tierById } from "./tiers";
import { boostRowId, upgradeRowId, type RevealRowId } from "./upgrade-reveal";
import { anyUpgradeAffordable } from "./upgrade-rows";
import { UPGRADES } from "./upgrades";
import { workshopUnlocked } from "./workshop";
import { benchLeftMs } from "./workshop-sheet";

/**
 * The key rail (#373): five keys under the board, each opening its drawer
 * or sheet. A key shows its cap (at rest, locked, or lit when its drawer
 * holds something he can buy now), a red dot lamp while a system is still
 * to be taught, and a sub-line for a lock or a running clock.
 *
 * Display only: it reads the mountain, the caller's clock and the trouble,
 * and never writes. Until the save is in, the rail draws none of this; the
 * caller decides that, not these rules.
 */

/** In the rail's order, left to right. */
export const KEY_IDS = [
  "buys",
  "workshop",
  "engineers",
  "upgrades",
  "ledger",
] as const;

export type KeyId = (typeof KEY_IDS)[number];

/** `key.png`'s frames: rest, off (locked) and lit. Down is the press. */
export type KeyCap = "rest" | "locked" | "lit";

export interface KeyView {
  readonly cap: KeyCap;
  /** The line under the key: an unlock line, a clock, or empty. */
  readonly sub: string;
  /** The red lamp: something on the far side is still to be taught. */
  readonly dot: boolean;
  readonly aria: string;
}

/** Every boost and lasting upgrade row, for the Upgrades key's dot. */
const UPGRADE_ROW_IDS: readonly RevealRowId[] = [
  ...BOOSTS.map(boostRowId),
  ...UPGRADES.map(upgradeRowId),
];

/**
 * Buys keeps the staffing dot. Trouble on a tier with no bay (C3) has no
 * bay to blink, so the key lamps it and its label says what is wrong.
 */
function buysKey(mountain: Mountain, trouble: Trouble | undefined): KeyView {
  const offBay =
    trouble !== undefined &&
    !(bayTiers(mountain) as readonly string[]).includes(trouble.tier);
  return {
    cap: "rest",
    sub: "",
    dot: offBay || showsDot(mountain, "staffing"),
    aria: offBay
      ? `Buys. ${troubleAria(trouble.kind, tierById(trouble.tier))}`
      : "Buys",
  };
}

function workshopKey(mountain: Mountain, now: number): KeyView {
  if (!workshopUnlocked(mountain)) {
    return {
      cap: "locked",
      sub: "With the clay",
      dot: false,
      aria: "Workshop, locked. Opens as the clay comes in",
    };
  }
  const left = benchLeftMs(mountain, now);
  const sub = left === undefined ? "" : formatClock(left);
  const lit = canCraftNow(mountain, now);
  return {
    cap: lit ? "lit" : "rest",
    sub,
    dot: showsDot(mountain, "workshop"),
    aria: `Workshop${sub === "" ? "" : `, bench ${sub} left`}${lit ? ", a craft can start" : ""}`,
  };
}

/** The soonest trip still out, as a clock, or "" with every hand home. */
function soonestBack(mountain: Mountain, now: number): string {
  const out = mountain.expeditions
    .map((trip) => trip.returnsAt - now)
    .filter((left) => left > 0);
  return out.length === 0 ? "" : formatClock(Math.min(...out));
}

function engineersKey(mountain: Mountain, now: number): KeyView {
  if (mountain.engineers.length === 0) {
    return {
      cap: "locked",
      sub: "With 1st borer",
      dot: false,
      aria: "Engineers, locked until the first tunnel borer",
    };
  }
  const sub = soonestBack(mountain, now);
  const lit = canPromote(mountain);
  return {
    cap: lit ? "lit" : "rest",
    sub,
    dot:
      showsDot(mountain, "engineers") ||
      showsDot(mountain, "tending") ||
      showsDot(mountain, "promotion"),
    aria: `Engineers${sub === "" ? "" : `, back in ${sub}`}${lit ? ", a promotion is affordable" : ""}`,
  };
}

function upgradesKey(mountain: Mountain, now: number): KeyView {
  const lit = anyUpgradeAffordable(mountain, now);
  return {
    cap: lit ? "lit" : "rest",
    sub: "",
    dot: UPGRADE_ROW_IDS.some((id) => showsDot(mountain, id)),
    aria: lit ? "Upgrades, one is affordable" : "Upgrades",
  };
}

const LEDGER_KEY: KeyView = {
  cap: "rest",
  sub: "",
  dot: false,
  aria: "Ledger",
};

/** Each key's cap, sub-line, dot and label, from this mountain and now. */
export function keyViews(
  mountain: Mountain,
  now: number,
  trouble: Trouble | undefined,
): Readonly<Record<KeyId, KeyView>> {
  return {
    buys: buysKey(mountain, trouble),
    workshop: workshopKey(mountain, now),
    engineers: engineersKey(mountain, now),
    upgrades: upgradesKey(mountain, now),
    ledger: LEDGER_KEY,
  };
}
