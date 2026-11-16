import { ROOF } from "./city";
import { runStartedAt, type Mountain } from "./mountain";
import { serializeSave } from "./persist";
import { compareSaveProgress, type SaveMoment } from "./save-progress";
import { MAKER_IDS } from "./makers";
import { LEVEL_MACHINE_IDS } from "./mine-levels";
import { GOOD_IDS } from "./stock";
import { TIER_IDS } from "./tiers";
import { VEHICLE_IDS } from "./transport";
import { upgradeLevel, UPGRADES } from "./upgrades";
import { RECIPE_IDS, craftedLevel } from "./workshop";

/**
 * Two copies of one run.
 *
 * A later run wins whole. A lower rev is never adopted. When one copy is at
 * least as far on every counted fact and further on rock dug, upgrades,
 * crafts, recipes, finds, engineer trips, the stockyard's level, the sunk
 * shaft, or the city's buildings (what is operational, the steps built and
 * what has arrived for the step in hand), that copy is a silent fast-forward.
 * Machines on each level, makers, crew and vehicles count too: being behind
 * on them blocks the fast-forward (#664, #666, #673).
 * A lead that is only machines, crew or vehicles, or a split where each side has
 * something the other lacks, is a conflict. The two copies come back as they
 * are. Nothing is blended into a third save.
 */
export type SaveCopy = SaveMoment & {
  readonly rev: number;
};

type FastForward = {
  readonly kind: "fast-forward";
  readonly mountain: Mountain;
  readonly lastSeen: number | undefined;
  readonly rev: number;
  /** The server does not yet have `mountain`, so the caller writes rev + 1. */
  readonly differsFromRemote: boolean;
};

type MergeConflict = {
  readonly kind: "conflict";
  readonly local: SaveCopy;
  readonly remote: SaveCopy;
};

export type MergeResult = FastForward | MergeConflict;

type Facts = {
  readonly mined: number;
  readonly upgrades: Readonly<Record<string, number>>;
  readonly crafts: Readonly<Record<string, number>>;
  readonly recipes: readonly string[];
  readonly finds: readonly string[];
  readonly engineers: Readonly<Record<string, number>>;
  readonly operational: readonly string[];
  /** Steps built in on the city, then what has arrived for the step in hand. */
  readonly city: readonly [number, number];
  /**
   * Every tier he owns (workers, kids, machines), every vehicle and every
   * maker. A level's machines count on the Topsoil under their own id and on
   * the Granite as `granite:<id>`, so a machine placed on another level is a
   * split, not a fast-forward (#673).
   */
  readonly owned: Readonly<Record<string, number>>;
  /** The stockyard's level (#666). */
  readonly stockyard: number;
  /** The shaft: 1 once sunk, else 0 (#673). Read from the save, whatever the build plays. */
  readonly shaft: number;
};

export function mergeSaves(local: SaveCopy, remote: SaveCopy): MergeResult {
  if (remote.rev < local.rev) {
    return forward(local, remote, local.rev);
  }
  const rev = Math.max(local.rev, remote.rev);
  if (runStartedAt(local.mountain) !== runStartedAt(remote.mountain)) {
    return forward(laterRun(local, remote), remote, rev);
  }
  const winner = sameRunWinner(local, remote);
  return winner === undefined
    ? { kind: "conflict", local, remote }
    : forward(winner, remote, rev);
}

function laterRun(local: SaveCopy, remote: SaveCopy): SaveCopy {
  return runStartedAt(local.mountain) > runStartedAt(remote.mountain)
    ? local
    : remote;
}

/**
 * The copy of one run that fast-forwards, or undefined for a conflict. A copy
 * that alone leads on progress wins. When each covers the other, the one
 * further along wins, and a tie keeps the local copy only if both mountains
 * are the same.
 */
function sameRunWinner(
  local: SaveCopy,
  remote: SaveCopy,
): SaveCopy | undefined {
  const left = facts(local.mountain);
  const right = facts(remote.mountain);
  const localCovers = covers(left, right);
  const remoteCovers = covers(right, left);
  const localLeads = localCovers && aheadOnProgress(left, right);
  const remoteLeads = remoteCovers && aheadOnProgress(right, left);
  if (localLeads !== remoteLeads) {
    return localLeads ? local : remote;
  }
  if (!localCovers || !remoteCovers) {
    return undefined;
  }
  return evenWinner(local, remote);
}

/** Two copies that each cover the other. */
function evenWinner(local: SaveCopy, remote: SaveCopy): SaveCopy | undefined {
  const verdict = compareSaveProgress(local, remote);
  if (verdict < 0) {
    return remote;
  }
  if (verdict > 0 || sameMountain(local.mountain, remote.mountain)) {
    return local;
  }
  return undefined;
}

/**
 * A content split is a real conflict only when the server moved past the
 * rev this device has confirmed, this device still has unconfirmed changes,
 * and the server copy was not written by this device.
 */
export function conflictIsReal({
  serverRev,
  syncedRev,
  dirty,
  remoteDeviceId,
  localDeviceId,
}: {
  serverRev: number;
  syncedRev: number;
  dirty: boolean;
  remoteDeviceId: string;
  localDeviceId: string;
}): boolean {
  if (serverRev <= syncedRev || !dirty) {
    return false;
  }
  return remoteDeviceId === "" || remoteDeviceId !== localDeviceId;
}

function forward(base: SaveCopy, remote: SaveCopy, rev: number): FastForward {
  return {
    kind: "fast-forward",
    mountain: base.mountain,
    lastSeen: base.lastSeen,
    rev,
    differsFromRemote: !sameMountain(base.mountain, remote.mountain),
  };
}

function sameMountain(left: Mountain, right: Mountain): boolean {
  return (
    JSON.stringify(serializeSave({ mountain: left, lastSeen: 0 })) ===
    JSON.stringify(serializeSave({ mountain: right, lastSeen: 0 }))
  );
}

function facts(mountain: Mountain): Facts {
  const upgrades: Record<string, number> = {};
  for (const upgrade of UPGRADES) {
    const level = upgradeLevel(mountain, upgrade.id);
    if (level > 0) {
      upgrades[upgrade.id] = level;
    }
  }
  const crafts: Record<string, number> = {};
  for (const id of RECIPE_IDS) {
    const level = craftedLevel(mountain, id);
    if (level > 0) {
      crafts[id] = level;
    }
  }
  const engineers: Record<string, number> = {};
  for (const engineer of mountain.engineers) {
    engineers[engineer.name] = engineer.trips;
  }
  return {
    mined: mountain.rockDug,
    upgrades,
    crafts,
    recipes: [...mountain.recipes],
    finds: [...mountain.finds],
    engineers,
    operational: [...mountain.operational],
    city: cityProgress(mountain),
    owned: ownedCounts(mountain),
    stockyard: mountain.stockyard,
    shaft: mountain.granite.kind === "sunk" ? 1 : 0,
  };
}

const STEPS_A_BUILDING = ROOF + 1;

/**
 * Buildings go up in order, one step after another, so the steps built in
 * are the operational buildings' and the steps before the one in hand.
 */
function cityProgress(mountain: Mountain): readonly [number, number] {
  const built = mountain.operational.length * STEPS_A_BUILDING;
  const { project } = mountain;
  if (project.kind === "unordered") {
    return [built, 0];
  }
  const arrived = GOOD_IDS.reduce(
    (sum, id) => sum + project.site.arrived[id],
    0,
  );
  return [built + project.site.step, arrived];
}

function ownedCounts(mountain: Mountain): Record<string, number> {
  const owned: Record<string, number> = {};
  for (const id of TIER_IDS) {
    owned[id] = mountain.owned[id];
  }
  for (const id of VEHICLE_IDS) {
    owned[id] = mountain.fleet[id];
  }
  for (const id of MAKER_IDS) {
    owned[`maker:${id}`] = mountain.makers[id];
  }
  const { granite } = mountain;
  if (granite.kind === "sunk") {
    for (const id of LEVEL_MACHINE_IDS) {
      owned[id] = mountain.owned[id] - granite.machines[id];
      owned[`granite:${id}`] = granite.machines[id];
    }
  }
  return owned;
}

/** Positive when `left` is further on the city than `right`. */
function cityAhead(
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  return left[0] === right[0] ? left[1] - right[1] : left[0] - right[0];
}

/** Rock, upgrades, crafts, recipes, finds, trips, the stockyard, the shaft, or buildings. Not machines. */
function aheadOnProgress(left: Facts, right: Facts): boolean {
  if (left.mined > right.mined || cityAhead(left.city, right.city) > 0) {
    return true;
  }
  if (left.stockyard > right.stockyard || left.shaft > right.shaft) {
    return true;
  }
  if (someOnly(left.operational, right.operational)) {
    return true;
  }
  if (someHigher(left.upgrades, right.upgrades)) {
    return true;
  }
  if (someHigher(left.crafts, right.crafts)) {
    return true;
  }
  if (someOnly(left.recipes, right.recipes)) {
    return true;
  }
  if (someOnly(left.finds, right.finds)) {
    return true;
  }
  if (someHigher(left.engineers, right.engineers)) {
    return true;
  }
  for (const name of Object.keys(left.engineers)) {
    if (!(name in right.engineers)) {
      return true;
    }
  }
  return false;
}

function covers(left: Facts, right: Facts): boolean {
  return (
    left.mined >= right.mined &&
    left.stockyard >= right.stockyard &&
    left.shaft >= right.shaft &&
    coversNumbers(left.upgrades, right.upgrades) &&
    coversNumbers(left.crafts, right.crafts) &&
    coversNumbers(left.engineers, right.engineers) &&
    coversNames(left.engineers, right.engineers) &&
    coversList(left.recipes, right.recipes) &&
    coversList(left.finds, right.finds) &&
    coversList(left.operational, right.operational) &&
    cityAhead(left.city, right.city) >= 0 &&
    coversNumbers(left.owned, right.owned)
  );
}

function coversNames(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  return Object.keys(right).every((name) => name in left);
}

function someHigher(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const id of ids) {
    if ((left[id] ?? 0) > (right[id] ?? 0)) {
      return true;
    }
  }
  return false;
}

function someOnly(left: readonly string[], right: readonly string[]): boolean {
  const held = new Set(right);
  return left.some((id) => !held.has(id));
}

function coversNumbers(
  left: Readonly<Record<string, number>>,
  right: Readonly<Record<string, number>>,
): boolean {
  for (const [id, level] of Object.entries(right)) {
    if ((left[id] ?? 0) < level) {
      return false;
    }
  }
  return true;
}

function coversList(
  left: readonly string[],
  right: readonly string[],
): boolean {
  const held = new Set(left);
  return right.every((id) => held.has(id));
}
