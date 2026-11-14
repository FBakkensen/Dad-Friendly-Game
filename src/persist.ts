/**
 * The save's envelope (#558): its version, the clocks that order two copies,
 * the device that wrote it, and the game map from `save-format.ts`.
 *
 * Reading answers one of four: `ok` plays; `newer` came from a later build
 * and is never written over; `older` came before version 8 and is set aside
 * for a fresh mountain; `bad` is nonsense.
 */
import type { Mountain } from "./mountain";
import { readGame, writeGame, type SaveGame } from "./save-format";

export const SAVE_VERSION = 8;

export type SaveDocument = {
  readonly version: typeof SAVE_VERSION;
  readonly lastSeen: number;
  /** When this run began. Left out at 0. */
  readonly startedAt?: number;
  readonly rev?: number;
  readonly deviceId?: string;
  readonly deviceLabel?: string;
  readonly game: SaveGame;
};

/** Same bounds as `firestore.rules`. */
const SAVE_DEVICE_ID_MIN = 8;
const SAVE_DEVICE_ID_MAX = 64;

/** The envelope keys this build knows. The rules' `savedAt` is read and ignored. */
const ENVELOPE_KEYS: readonly string[] = [
  "version",
  "lastSeen",
  "startedAt",
  "rev",
  "deviceId",
  "deviceLabel",
  "savedAt",
  "game",
];

export type ParsedSave = {
  readonly mountain: Mountain;
  readonly lastSeen: number | undefined;
  /** Missing when the copy was never written with a device. The rules treat that as rev 0. */
  readonly rev?: number;
  readonly deviceId?: string;
  /** Friendly name stored with the device id. Never the raw id. */
  readonly deviceLabel?: string;
};

export type SaveRead =
  | { readonly kind: "ok"; readonly save: ParsedSave }
  | { readonly kind: "newer"; readonly version: number }
  | {
      readonly kind: "older";
      readonly version: number;
      /** The run stamp on the old envelope, else 0. */
      readonly startedAt: number;
      /** The old copy's rev, else 0. */
      readonly rev: number;
    }
  | { readonly kind: "bad" };

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

function isStamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
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
  /** Written only with a valid device id, and the id only with a valid rev. */
  rev?: number | undefined;
  deviceId?: string | undefined;
  deviceLabel?: string | undefined;
}): SaveDocument {
  const identity =
    validRev(rev) && validDeviceId(deviceId) ? { rev, deviceId } : undefined;
  const label = identity === undefined ? undefined : validLabel(deviceLabel);
  return {
    version: SAVE_VERSION,
    lastSeen,
    ...(mountain.startedAt === 0 ? {} : { startedAt: mountain.startedAt }),
    ...identity,
    ...(label === undefined ? {} : { deviceLabel: label }),
    game: writeGame(mountain),
  };
}

/** What a copy from before version 8 keeps through a reset: its stamp and rev. */
function olderRead(record: Record<string, unknown>, version: number): SaveRead {
  const startedAt = record["startedAt"];
  const rev = record["rev"];
  return {
    kind: "older",
    version,
    startedAt: isStamp(startedAt) ? startedAt : 0,
    rev: isStamp(rev) ? rev : 0,
  };
}

/** The envelope's identity: both, neither, or `bad` for one without the other. */
function readIdentity(
  record: Record<string, unknown>,
): { readonly rev: number; readonly deviceId: string } | "none" | "bad" {
  const rev = record["rev"];
  const deviceId = record["deviceId"];
  if (rev === undefined && deviceId === undefined) {
    return "none";
  }
  return validRev(rev) && validDeviceId(deviceId) ? { rev, deviceId } : "bad";
}

function readCurrent(record: Record<string, unknown>): SaveRead {
  const lastSeen = record["lastSeen"];
  const startedAt = record["startedAt"] ?? 0;
  const identity = readIdentity(record);
  if (
    typeof lastSeen !== "number" ||
    !Number.isFinite(lastSeen) ||
    !isStamp(startedAt) ||
    identity === "bad"
  ) {
    return { kind: "bad" };
  }
  const game = readGame(record["game"], startedAt);
  if (game.kind !== "ok") {
    return game.kind === "newer"
      ? { kind: "newer", version: SAVE_VERSION }
      : game;
  }
  if (Object.keys(record).some((key) => !ENVELOPE_KEYS.includes(key))) {
    return { kind: "newer", version: SAVE_VERSION };
  }
  const label = validLabel(record["deviceLabel"]);
  return {
    kind: "ok",
    save: {
      mountain: game.mountain,
      lastSeen,
      ...(identity === "none" ? {} : identity),
      ...(label === undefined ? {} : { deviceLabel: label }),
    },
  };
}

/** Any stored value, read as one of the four answers. */
export function readSave(value: unknown): SaveRead {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { kind: "bad" };
  }
  const record = value as Record<string, unknown>;
  const version = record["version"];
  if (!Number.isSafeInteger(version) || (version as number) < 1) {
    return { kind: "bad" };
  }
  if ((version as number) > SAVE_VERSION) {
    return { kind: "newer", version: version as number };
  }
  return (version as number) < SAVE_VERSION
    ? olderRead(record, version as number)
    : readCurrent(record);
}
