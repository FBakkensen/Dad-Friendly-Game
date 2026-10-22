import { rankOf, type Engineer } from "./engineers";
import type { FindId } from "./expeditions";
import { digStones, minedOut, runStartedAt, type Mountain } from "./mountain";
import { serializeSave } from "./persist";
import { compareSaveProgress, type SaveMoment } from "./save-progress";
import { upgradeLevel, UPGRADES, type UpgradeId } from "./upgrades";
import {
  RECIPE_IDS,
  craftedLevel,
  isRecipeId,
  type Crafted,
  type RecipeId,
} from "./workshop";

/**
 * Two copies of one run, after a rules rejection.
 *
 * Monotonic progress is kept from both: stones mined (and the relics those
 * stones uncover), upgrade levels, the shelf, recipes, engineer trips, and
 * finished crafts. A later run wins whole. A copy with a lower rev is never
 * adopted. When each side has something the other lacks, the side with more
 * progress is the base and the conflict is logged. The sheet that explains
 * it is a later step.
 */
export type SaveCopy = SaveMoment & {
  readonly rev: number;
};

export type MergedSave = {
  readonly mountain: Mountain;
  readonly lastSeen: number | undefined;
  readonly rev: number;
  readonly conflict: boolean;
  /** The server does not yet have `mountain`, so the caller writes rev + 1. */
  readonly differsFromRemote: boolean;
};

type Monotonic = {
  readonly mined: number;
  readonly upgrades: Readonly<Record<string, number>>;
  readonly recipes: readonly string[];
  readonly crafts: Readonly<Record<string, number>>;
  readonly engineers: Readonly<Record<string, number>>;
  readonly finds: readonly string[];
};

export function mergeSaves(local: SaveCopy, remote: SaveCopy): MergedSave {
  const rev = Math.max(local.rev, remote.rev);
  if (remote.rev < local.rev) {
    return {
      mountain: local.mountain,
      lastSeen: local.lastSeen,
      rev: local.rev,
      conflict: false,
      differsFromRemote: !sameMountain(local.mountain, remote.mountain),
    };
  }
  if (runStartedAt(local.mountain) !== runStartedAt(remote.mountain)) {
    const newer =
      runStartedAt(local.mountain) > runStartedAt(remote.mountain)
        ? local
        : remote;
    return {
      mountain: newer.mountain,
      lastSeen: newer.lastSeen,
      rev,
      conflict: false,
      differsFromRemote: !sameMountain(newer.mountain, remote.mountain),
    };
  }
  const localMono = monotonic(local.mountain);
  const remoteMono = monotonic(remote.mountain);
  const localDominates = dominates(localMono, remoteMono);
  const remoteDominates = dominates(remoteMono, localMono);
  if (localDominates && !remoteDominates) {
    return held(local, remote, rev, false);
  }
  if (remoteDominates && !localDominates) {
    return held(remote, remote, rev, false);
  }
  if (localDominates && remoteDominates) {
    const verdict = compareSaveProgress(local, remote);
    const base = verdict < 0 ? remote : local;
    const conflict =
      verdict === 0 && !sameMountain(local.mountain, remote.mountain);
    return held(base, remote, rev, conflict);
  }
  const verdict = compareSaveProgress(local, remote);
  const base = verdict < 0 ? remote : local;
  const other = base === local ? remote : local;
  const mountain = overlay(base.mountain, other.mountain);
  return {
    mountain,
    lastSeen: base.lastSeen,
    rev,
    conflict: true,
    differsFromRemote: !sameMountain(mountain, remote.mountain),
  };
}

function held(
  base: SaveCopy,
  remote: SaveCopy,
  rev: number,
  conflict: boolean,
): MergedSave {
  return {
    mountain: base.mountain,
    lastSeen: base.lastSeen,
    rev,
    conflict,
    differsFromRemote: !sameMountain(base.mountain, remote.mountain),
  };
}

function sameMountain(left: Mountain, right: Mountain): boolean {
  return (
    JSON.stringify(serializeSave({ mountain: left, lastSeen: 0 })) ===
    JSON.stringify(serializeSave({ mountain: right, lastSeen: 0 }))
  );
}

function monotonic(mountain: Mountain): Monotonic {
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
  const recipes = [
    ...(mountain.recipes ?? []),
    ...(mountain.kept?.recipes ?? []),
  ];
  return {
    mined: minedOut(mountain),
    upgrades,
    recipes,
    crafts,
    engineers,
    finds: [...(mountain.finds ?? [])],
  };
}

function dominates(left: Monotonic, right: Monotonic): boolean {
  if (left.mined < right.mined) {
    return false;
  }
  if (!coversNumbers(left.upgrades, right.upgrades)) {
    return false;
  }
  if (!coversNumbers(left.crafts, right.crafts)) {
    return false;
  }
  if (!coversNumbers(left.engineers, right.engineers)) {
    return false;
  }
  if (!coversList(left.recipes, right.recipes)) {
    return false;
  }
  return coversList(left.finds, right.finds);
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

function overlay(base: Mountain, extra: Mountain): Mountain {
  const minedGap = minedOut(extra) - minedOut(base);
  const mountain = minedGap > 0 ? digStones(base, minedGap) : base;
  const upgrades = maxUpgrades(mountain, extra);
  const engineers = unionEngineers(base, extra);
  const finds = unionFinds(mountain, extra);
  const recipes = unionRecipes(mountain, extra);
  const crafted = maxCrafts(mountain, extra);
  const keptRecipes = unionKept(mountain, extra, recipes.known);
  const keptCrafted = maxKeptCrafts(mountain, extra);
  const kept =
    keptRecipes.length === 0 && Object.keys(keptCrafted).length === 0
      ? mountain.kept?.bench === undefined
        ? undefined
        : { bench: mountain.kept.bench }
      : {
          ...(keptRecipes.length === 0 ? {} : { recipes: keptRecipes }),
          ...(mountain.kept?.bench === undefined
            ? {}
            : { bench: mountain.kept.bench }),
          ...(Object.keys(keptCrafted).length === 0
            ? {}
            : { crafted: keptCrafted }),
        };
  return {
    ...mountain,
    ...(upgrades === undefined ? {} : { upgrades }),
    ...(engineers === undefined ? {} : { engineers }),
    ...(finds === undefined ? {} : { finds }),
    ...(recipes.known.length === 0 ? {} : { recipes: recipes.known }),
    ...(Object.keys(crafted).length === 0 ? {} : { crafted }),
    ...(kept === undefined ? {} : { kept }),
  };
}

function maxUpgrades(
  left: Mountain,
  right: Mountain,
): Partial<Record<UpgradeId, number>> | undefined {
  const next: Partial<Record<UpgradeId, number>> = {};
  for (const upgrade of UPGRADES) {
    const level = Math.max(
      upgradeLevel(left, upgrade.id),
      upgradeLevel(right, upgrade.id),
    );
    if (level > 0) {
      next[upgrade.id] = level;
    }
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

function unionEngineers(
  base: Mountain,
  extra: Mountain,
): readonly Engineer[] | undefined {
  const byName = new Map<string, Engineer>();
  for (const engineer of base.engineers ?? []) {
    byName.set(engineer.name, engineer);
  }
  for (const engineer of extra.engineers ?? []) {
    const existing = byName.get(engineer.name);
    if (existing === undefined) {
      byName.set(engineer.name, engineer);
      continue;
    }
    if (engineer.trips > existing.trips) {
      byName.set(engineer.name, {
        ...engineer,
        rank: rankOf(engineer.trips),
      });
    }
  }
  if (byName.size === 0) {
    return undefined;
  }
  const ordered: Engineer[] = [];
  for (const engineer of base.engineers ?? []) {
    const next = byName.get(engineer.name);
    if (next !== undefined) {
      ordered.push(next);
    }
    byName.delete(engineer.name);
  }
  for (const engineer of byName.values()) {
    ordered.push(engineer);
  }
  return ordered;
}

function unionFinds(
  left: Mountain,
  right: Mountain,
): readonly FindId[] | undefined {
  const seen = new Set<FindId>();
  const all: FindId[] = [];
  for (const id of [...(left.finds ?? []), ...(right.finds ?? [])]) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    all.push(id);
  }
  return all.length === 0 ? undefined : all;
}

function unionRecipes(
  left: Mountain,
  right: Mountain,
): { readonly known: readonly RecipeId[] } {
  const known: RecipeId[] = [];
  for (const id of [...(left.recipes ?? []), ...(right.recipes ?? [])]) {
    if (!known.includes(id)) {
      known.push(id);
    }
  }
  return { known };
}

function unionKept(
  left: Mountain,
  right: Mountain,
  known: readonly RecipeId[],
): readonly string[] {
  const kept: string[] = [];
  for (const id of [
    ...(left.kept?.recipes ?? []),
    ...(right.kept?.recipes ?? []),
  ]) {
    if (isRecipeId(id) || kept.includes(id)) {
      continue;
    }
    if (known.includes(id as RecipeId)) {
      continue;
    }
    kept.push(id);
  }
  return kept;
}

function maxCrafts(left: Mountain, right: Mountain): Crafted {
  const next: Partial<Record<RecipeId, number>> = {};
  for (const id of RECIPE_IDS) {
    const level = Math.max(craftedLevel(left, id), craftedLevel(right, id));
    if (level > 0) {
      next[id] = level;
    }
  }
  return next;
}

function maxKeptCrafts(
  left: Mountain,
  right: Mountain,
): Readonly<Record<string, number>> {
  const next: Record<string, number> = {};
  for (const source of [left, right]) {
    for (const [id, level] of Object.entries(source.kept?.crafted ?? {})) {
      if (isRecipeId(id) || typeof level !== "number") {
        continue;
      }
      next[id] = Math.max(next[id] ?? 0, level);
    }
  }
  return next;
}
