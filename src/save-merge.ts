import { minedOut, runStartedAt, type Mountain } from "./mountain";
import { serializeSave } from "./persist";
import { compareSaveProgress, type SaveMoment } from "./save-progress";
import { upgradeLevel, UPGRADES } from "./upgrades";
import { RECIPE_IDS, craftedLevel } from "./workshop";

/**
 * Two copies of one run.
 *
 * A later run wins whole. A lower rev is never adopted. When one copy is at
 * least as far on every counted fact and further on stones, upgrades, crafts,
 * recipes, finds, or engineer trips, that copy is a silent fast-forward.
 * Machines and crew count too: being behind on them blocks the fast-forward.
 * A lead that is only machines or crew, or a split where each side has
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
  readonly crew: number;
  readonly carts: number;
  readonly drills: number;
  readonly borers: number;
  readonly machines: number;
};

export function mergeSaves(local: SaveCopy, remote: SaveCopy): MergeResult {
  if (remote.rev < local.rev) {
    return forward(local, remote, local.rev);
  }
  const rev = Math.max(local.rev, remote.rev);
  if (runStartedAt(local.mountain) !== runStartedAt(remote.mountain)) {
    const newer =
      runStartedAt(local.mountain) > runStartedAt(remote.mountain)
        ? local
        : remote;
    return forward(newer, remote, rev);
  }
  const left = facts(local.mountain);
  const right = facts(remote.mountain);
  const localLeads = covers(left, right) && aheadOnProgress(left, right);
  const remoteLeads = covers(right, left) && aheadOnProgress(right, left);
  if (localLeads && !remoteLeads) {
    return forward(local, remote, rev);
  }
  if (remoteLeads && !localLeads) {
    return forward(remote, remote, rev);
  }
  if (covers(left, right) && covers(right, left)) {
    const verdict = compareSaveProgress(local, remote);
    if (verdict < 0) {
      return forward(remote, remote, rev);
    }
    if (verdict > 0 || sameMountain(local.mountain, remote.mountain)) {
      return forward(local, remote, rev);
    }
  }
  return { kind: "conflict", local, remote };
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
  for (const [id, level] of Object.entries(mountain.kept?.crafted ?? {})) {
    if (typeof level === "number" && level > (crafts[id] ?? 0)) {
      crafts[id] = level;
    }
  }
  const engineers: Record<string, number> = {};
  for (const engineer of mountain.engineers ?? []) {
    engineers[engineer.name] = engineer.trips;
  }
  return {
    mined: minedOut(mountain),
    upgrades,
    crafts,
    recipes: [...(mountain.recipes ?? []), ...(mountain.kept?.recipes ?? [])],
    finds: [...(mountain.finds ?? [])],
    engineers,
    crew: mountain.helpers,
    carts: mountain.carts,
    drills: mountain.drills,
    borers: mountain.borers,
    machines: mountain.machines,
  };
}

/** Stones, upgrades, crafts, recipes, finds, or engineer trips. Not machines. */
function aheadOnProgress(left: Facts, right: Facts): boolean {
  if (left.mined > right.mined) {
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
    coversNumbers(left.upgrades, right.upgrades) &&
    coversNumbers(left.crafts, right.crafts) &&
    coversNumbers(left.engineers, right.engineers) &&
    coversNames(left.engineers, right.engineers) &&
    coversList(left.recipes, right.recipes) &&
    coversList(left.finds, right.finds) &&
    left.crew >= right.crew &&
    left.carts >= right.carts &&
    left.drills >= right.drills &&
    left.borers >= right.borers &&
    left.machines >= right.machines
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
