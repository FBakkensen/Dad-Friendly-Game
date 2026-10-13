import {
  MOUNTAIN_STONES,
  createMountain,
  parseMountain,
  type Mountain,
} from "./mountain";

/** v3 saves were a 1,000,000-stone mountain; v4 is 100,000,000. */
const V3_MOUNTAIN_STONES = 1_000_000;
const V3_SCALE = MOUNTAIN_STONES / V3_MOUNTAIN_STONES;

export type MountainSaveV4 = {
  readonly version: 4;
  readonly mountain: Mountain;
  readonly lastSeen: number;
};

export type ParsedSave = {
  readonly mountain: Mountain;
  readonly lastSeen: number | undefined;
};

export function serializeSave({
  mountain,
  lastSeen,
}: {
  mountain: Mountain;
  lastSeen: number;
}): MountainSaveV4 {
  return {
    version: 4,
    mountain: {
      remaining: mountain.remaining,
      pocket: mountain.pocket,
      helpers: mountain.helpers,
      carts: mountain.carts,
      drills: mountain.drills,
      borers: mountain.borers,
      machines: mountain.machines,
      kids: mountain.kids,
      ...(mountain.upgrades === undefined ||
      Object.keys(mountain.upgrades).length === 0
        ? {}
        : { upgrades: mountain.upgrades }),
      ...(mountain.boosts === undefined ||
      Object.keys(mountain.boosts).length === 0
        ? {}
        : { boosts: mountain.boosts }),
      ...(mountain.startedAt === undefined
        ? {}
        : { startedAt: mountain.startedAt }),
      ...(mountain.staffed === undefined ? {} : { staffed: mountain.staffed }),
      ...(mountain.legacy === undefined || mountain.legacy === 0
        ? {}
        : { legacy: mountain.legacy }),
    },
    lastSeen,
  };
}

/**
 * Accepts v4 (100M mountain), scales v3 (1M mountain) up, and migrates the
 * legacy v1/v2 3x3 grid saves.
 */
export function parseSaveValue(value: unknown): ParsedSave | undefined {
  if (typeof value !== "object" || value === null || !("version" in value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  switch (record["version"]) {
    case 1: {
      const mountain = migrateLegacyGrid(record["grid"]);
      return mountain === undefined
        ? undefined
        : { mountain, lastSeen: undefined };
    }
    case 2:
    case 3:
    case 4: {
      const lastSeen = record["lastSeen"];
      if (typeof lastSeen !== "number" || !Number.isFinite(lastSeen)) {
        return undefined;
      }
      const mountain =
        record["version"] === 2
          ? migrateLegacyGrid(record["grid"])
          : record["version"] === 3
            ? scaleV3(parseMountain(record["mountain"], V3_MOUNTAIN_STONES))
            : parseMountain(record["mountain"]);
      return mountain === undefined ? undefined : { mountain, lastSeen };
    }
    default:
      return undefined;
  }
}

const LEGACY_CELL_STONES = { covered: 0, dug: 0, stone: 1, chunk: 2 } as const;

/**
 * The old 3x3 grid becomes a head start: every dug cell is a stone already out
 * of the mountain, and stones (1) and chunks (2) on the grid go to the pocket.
 */
export function migrateLegacyGrid(grid: unknown): Mountain | undefined {
  if (typeof grid !== "object" || grid === null) {
    return undefined;
  }
  const { width, height, cells } = grid as Record<string, unknown>;
  if (
    width !== 3 ||
    height !== 3 ||
    !Array.isArray(cells) ||
    cells.length !== 9
  ) {
    return undefined;
  }
  let dug = 0;
  let pocket = 0;
  for (const cell of cells as unknown[]) {
    const kind =
      typeof cell === "object" && cell !== null
        ? (cell as Record<string, unknown>)["kind"]
        : undefined;
    if (typeof kind !== "string" || !Object.hasOwn(LEGACY_CELL_STONES, kind)) {
      return undefined;
    }
    if (kind !== "covered") {
      dug += 1;
    }
    pocket += LEGACY_CELL_STONES[kind as keyof typeof LEGACY_CELL_STONES];
  }
  return { ...createMountain(), remaining: MOUNTAIN_STONES - dug, pocket };
}

/**
 * Keeps a v3 dad at the same place in the deeper mountain: stones mined are
 * scaled up, so relics already found stay found. Pocket and crew are kept.
 */
function scaleV3(mountain: Mountain | undefined): Mountain | undefined {
  if (mountain === undefined) {
    return undefined;
  }
  const mined = (V3_MOUNTAIN_STONES - mountain.remaining) * V3_SCALE;
  return { ...mountain, remaining: MOUNTAIN_STONES - mined };
}
