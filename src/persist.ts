import { materialsFromMined } from "./layers";
import {
  MOUNTAIN_STONES,
  createMountain,
  minedOut,
  type Mountain,
} from "./mountain";
import {
  parseMountain,
  savedMountain,
  savedWorkshop,
  withWorkshop,
  type SavedMountain,
  type WorkshopSave,
} from "./save-format";
import { NOTHING_CRAFTED, recipesForMined } from "./workshop";

/** v3 saves were a 1,000,000-stone mountain. v4 placed that on 100,000,000. */
const V3_MOUNTAIN_STONES = 1_000_000;
const V4_MOUNTAIN_STONES = 100_000_000;
/** Frozen at the v4 depth so a v3 dad is not stretched again when the bottom moves. */
const V3_SCALE = V4_MOUNTAIN_STONES / V3_MOUNTAIN_STONES;

export type MountainSaveV6 = {
  readonly version: 6;
  readonly mountain: SavedMountain;
  readonly workshop: WorkshopSave;
  readonly lastSeen: number;
};

/** v7 adds a rev that only increases, plus the device that wrote it. */
export type MountainSaveV7 = Omit<MountainSaveV6, "version"> & {
  readonly version: 7;
  readonly rev: number;
  readonly deviceId: string;
  readonly deviceLabel?: string;
};

/** Same bounds as `firestore.rules`. */
const SAVE_DEVICE_ID_MIN = 8;
const SAVE_DEVICE_ID_MAX = 64;

export type ParsedSave = {
  readonly mountain: Mountain;
  readonly lastSeen: number | undefined;
  /** Missing on a v6 document. The rules treat that as rev 0. */
  readonly rev?: number;
  readonly deviceId?: string;
  /** Friendly name stored with the device id. Never the raw id. */
  readonly deviceLabel?: string;
};

function validDeviceId(deviceId: unknown): deviceId is string {
  return (
    typeof deviceId === "string" &&
    deviceId.length >= SAVE_DEVICE_ID_MIN &&
    deviceId.length <= SAVE_DEVICE_ID_MAX
  );
}

function validRev(rev: unknown): rev is number {
  return typeof rev === "number" && Number.isInteger(rev) && rev >= 1;
}

/** A label the rules accept, or none. */
function validLabel(label: unknown): string | undefined {
  return typeof label === "string" &&
    label.length >= 1 &&
    label.length <= 40 &&
    !label.includes("?")
    ? label
    : undefined;
}

export function serializeSave({
  mountain,
  lastSeen,
  rev,
  deviceId,
  deviceLabel,
}: {
  mountain: Mountain;
  lastSeen: number;
  /** When set with a device id, the document is v7. Otherwise it stays v6. */
  rev?: number | undefined;
  deviceId?: string | undefined;
  deviceLabel?: string | undefined;
}): MountainSaveV6 | MountainSaveV7 {
  const saved: MountainSaveV6 = {
    version: 6,
    mountain: savedMountain(mountain),
    workshop: savedWorkshop(mountain),
    lastSeen,
  };
  if (!validRev(rev) || !validDeviceId(deviceId)) {
    return saved;
  }
  const label = validLabel(deviceLabel);
  return {
    ...saved,
    version: 7,
    rev,
    deviceId,
    ...(label === undefined ? {} : { deviceLabel: label }),
  };
}

/**
 * Accepts v6 (materials, bench, crafted, recipes, and the live buff clocks). A v5 save keeps every
 * stone already mined and is granted the materials those stones would have
 * dug. v4 keeps that place and gains the depth below the old bottom. v3
 * scales onto that same place. Legacy v1/v2 3x3 grids still migrate. v1
 * through v5 all arrive as v6 in memory.
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
        : { mountain: grantFromStones(mountain), lastSeen: undefined };
    }
    case 2:
    case 3:
    case 4:
    case 5:
      return loadOlderSave(record);
    case 6:
    case 7:
      return loadCurrentSave(record);
    default:
      return undefined;
  }
}

function loadOlderSave(
  record: Record<string, unknown>,
): ParsedSave | undefined {
  const loaded = loadOlderMountain(record);
  return loaded === undefined
    ? undefined
    : { mountain: grantFromStones(loaded.mountain), lastSeen: loaded.lastSeen };
}

/** v6 and v7: the mountain map, its workshop sibling, and v7's identity. */
function loadCurrentSave(
  record: Record<string, unknown>,
): ParsedSave | undefined {
  const lastSeen = record["lastSeen"];
  if (typeof lastSeen !== "number" || !Number.isFinite(lastSeen)) {
    return undefined;
  }
  const identity = record["version"] === 7 ? readV7Identity(record) : "none";
  if (identity === undefined) {
    return undefined;
  }
  const base = parseMountain(record["mountain"]);
  const mountain =
    base === undefined ? undefined : withWorkshop(base, record["workshop"]);
  if (mountain === undefined) {
    return undefined;
  }
  const label = validLabel(record["deviceLabel"]);
  return {
    mountain,
    lastSeen,
    ...(identity === "none" ? {} : identity),
    ...(label === undefined ? {} : { deviceLabel: label }),
  };
}

function readV7Identity(
  record: Record<string, unknown>,
): { readonly rev: number; readonly deviceId: string } | undefined {
  const rev = record["rev"];
  const deviceId = record["deviceId"];
  return validRev(rev) && validDeviceId(deviceId)
    ? { rev, deviceId }
    : undefined;
}

function loadOlderMountain(
  record: Record<string, unknown>,
): { mountain: Mountain; lastSeen: number } | undefined {
  const lastSeen = record["lastSeen"];
  if (typeof lastSeen !== "number" || !Number.isFinite(lastSeen)) {
    return undefined;
  }
  const mountain =
    record["version"] === 2
      ? migrateLegacyGrid(record["grid"])
      : record["version"] === 3
        ? scaleV3(parseMountain(record["mountain"], V3_MOUNTAIN_STONES))
        : record["version"] === 4
          ? deepen(
              parseMountain(record["mountain"], V4_MOUNTAIN_STONES),
              V4_MOUNTAIN_STONES,
            )
          : parseMountain(record["mountain"]);
  return mountain === undefined ? undefined : { mountain, lastSeen };
}

/**
 * What that digging would have earned. The bench is empty and nothing is
 * crafted. Recipes are the starting three, plus Reinforce once the Granite
 * is reached, plus the layer recipe for each band already reached.
 * A materials field already on the document is not trusted: v1–v5 did not
 * have one.
 */
function grantFromStones(mountain: Mountain): Mountain {
  return {
    ...mountain,
    bench: undefined,
    crafted: NOTHING_CRAFTED,
    materials: materialsFromMined(minedOut(mountain)),
    recipes: recipesForMined(minedOut(mountain)),
  };
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

/** Keeps stones already mined and puts the new depth under them. */
function deepen(
  mountain: Mountain | undefined,
  oldTotal: number,
): Mountain | undefined {
  if (mountain === undefined) {
    return undefined;
  }
  const mined = oldTotal - mountain.remaining;
  return { ...mountain, remaining: MOUNTAIN_STONES - mined };
}
